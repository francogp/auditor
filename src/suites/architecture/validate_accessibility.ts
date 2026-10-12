import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { ESLint } from 'eslint';
import vueParser from 'vue-eslint-parser';
import vueA11y from 'eslint-plugin-vuejs-accessibility';
import { BaseAuditor , createRuleCapabilities } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { deriveCoverageFromRoots } from '../../core/auditCoverage.ts';
import { toPosixRelative } from '../../core/safePath.ts';

enableCompileCache();

const INDEX_HTML_FILE = 'index.html';
const VUE_EXTENSIONS: ReadonlySet<string> = new Set(['.vue']);

export const ACCESSIBILITY_RULES = [
  'a11y-img-alt',
  'a11y-form-control-has-label',
  'a11y-interactive-supports-focus',
  'a11y-anchor-has-content',
  'a11y-aria-role-invalid',
  'a11y-viewport-zoom-lock'
] as const;
export type AccessibilityRuleId = (typeof ACCESSIBILITY_RULES)[number];

/** Canonical rules evaluated through the ESLint vuejs-accessibility engine (all except the index.html viewport check). */
const ESLINT_BACKED_RULES: readonly AccessibilityRuleId[] = ACCESSIBILITY_RULES.filter(id => id !== 'a11y-viewport-zoom-lock');

const A11Y_RULE_ID_MAP: Readonly<Record<string, AccessibilityRuleId>> = {
  'alt-text': 'a11y-img-alt',
  'form-control-has-label': 'a11y-form-control-has-label',
  'label-has-for': 'a11y-form-control-has-label',
  'interactive-supports-focus': 'a11y-interactive-supports-focus',
  'click-events-have-key-events': 'a11y-interactive-supports-focus',
  'mouse-events-have-key-events': 'a11y-interactive-supports-focus',
  'anchor-has-content': 'a11y-anchor-has-content',
  'heading-has-content': 'a11y-anchor-has-content',
  'aria-props': 'a11y-aria-role-invalid',
  'aria-role': 'a11y-aria-role-invalid',
  'aria-unsupported-elements': 'a11y-aria-role-invalid',
  'role-has-required-aria-props': 'a11y-aria-role-invalid',
  'no-redundant-roles': 'a11y-aria-role-invalid',
  'no-role-presentation-on-focusable': 'a11y-aria-role-invalid'
};

/**
 * Maps an eslint-plugin-vuejs-accessibility rule to canonical AccessibilityRuleId.
 */
export function mapA11yRuleId(eslintRuleId: string): AccessibilityRuleId {
  const bare = eslintRuleId.replace(/^vuejs-accessibility\//, '');
  return A11Y_RULE_ID_MAP[bare] ?? 'a11y-aria-role-invalid';
}

export class ValidateAccessibilityAuditor extends BaseAuditor<AccessibilityRuleId> {
  constructor(options: { projectRoot?: string; fix?: boolean } = {}) {
    const effectiveRoot = options.projectRoot ?? process.cwd();
    super({
      ruleCapabilities: createRuleCapabilities(ACCESSIBILITY_RULES, {
        fix: true,
        fixPriority: false,
        lint: true,
        md: false,
        ast: false,
        changedSince: false,
        heavy: false,
        requiresBuild: false,
        postRun: false
      }, [...ACCESSIBILITY_RULES]),
      fixableRuleIds: [...ACCESSIBILITY_RULES],
      fix: options.fix,
      id: 'validate_accessibility',
      name: 'Vue & Web Accessibility Standards Auditor',
      description: 'Valida estándares WCAG 2.1/2.2 y accesibilidad',
      family: 'architecture',
      packageName: 'A11y',
      configKey: 'accessibility.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '♿',
      ruleIds: ACCESSIBILITY_RULES,
      ruleDescriptions: {
        'a11y-img-alt': 'Imagen sin atributo alt accesible',
        'a11y-form-control-has-label': 'Control de formulario sin label',
        'a11y-interactive-supports-focus': 'Elemento interactivo sin foco',
        'a11y-anchor-has-content': 'Enlace o botón sin texto o label',
        'a11y-aria-role-invalid': 'Rol o atributo ARIA no conforme',
        'a11y-viewport-zoom-lock': 'Bloqueo de zoom en viewport HTML'
      },
      projectRoot: effectiveRoot,
      coverage: { include: [INDEX_HTML_FILE, 'src/**/*.vue'] }
    });
  }

  public override async runAudit(): Promise<void> {
    if (this.isSuiteGatingDisabled('Accesibilidad desactivada en config')) {
      return;
    }

    const config = getAuditConfig(this.projectRoot);
    const scannableRoots = [
      ...(config.paths.componentsRoots ?? []),
      ...(config.paths.viewsRoots ?? []),
      ...(config.paths.srcRoots ?? [])
    ];
    this.redeclareCoverage({
      include: [INDEX_HTML_FILE, ...deriveCoverageFromRoots(scannableRoots, VUE_EXTENSIONS).include]
    });

    this.runSubAuditorSync('a11y-viewport-zoom-lock', () => {
      this.auditIndexViewport();
    });

    const vueFiles = this.collectScannableVueFiles(scannableRoots);
    if (vueFiles.length === 0) {
      for (const ruleId of ESLINT_BACKED_RULES) {
        this.runSubAuditorSync(ruleId, () => {
          this.markRuleNotApplicable(ruleId, 'No hay archivos .vue en las raíces configuradas');
        });
      }
      return;
    }

    const effectiveRules = this.buildEffectiveRules(config.accessibility?.rules ?? {});
    const results = await this.executeEslintOnVueFiles(vueFiles, effectiveRules);
    this.processLintResults(results, effectiveRules);
  }

  private collectScannableVueFiles(scannableRoots: readonly string[]): string[] {
    const vueFiles: string[] = [];
    const seenFiles = new Set<string>();
    for (const root of scannableRoots) {
      const fullRoot = path.resolve(this.projectRoot, root);
      if (fs.existsSync(fullRoot)) {
        this.collectVueFiles(fullRoot, vueFiles, seenFiles);
      }
    }
    return vueFiles;
  }

  private buildEffectiveRules(customRules: Record<string, boolean | undefined>): Record<string, 'error' | 'off'> {
    const normalized: Record<string, 'error' | 'off'> = {};
    for (const [key, val] of Object.entries(customRules)) {
      normalized[key] = val ? 'error' : 'off';
    }
    return {
      'vuejs-accessibility/alt-text': 'error',
      'vuejs-accessibility/anchor-has-content': 'error',
      'vuejs-accessibility/aria-props': 'error',
      'vuejs-accessibility/aria-role': 'error',
      'vuejs-accessibility/aria-unsupported-elements': 'error',
      'vuejs-accessibility/click-events-have-key-events': 'error',
      'vuejs-accessibility/form-control-has-label': 'error',
      'vuejs-accessibility/heading-has-content': 'error',
      'vuejs-accessibility/interactive-supports-focus': 'error',
      'vuejs-accessibility/no-autofocus': 'error',
      'vuejs-accessibility/no-redundant-roles': 'error',
      'vuejs-accessibility/role-has-required-aria-props': 'error',
      'vuejs-accessibility/tabindex-no-positive': 'error',
      ...normalized
    };
  }

  private async executeEslintOnVueFiles(
    vueFiles: readonly string[],
    rules: Record<string, 'error' | 'off'>
  ): Promise<ESLint.LintResult[]> {
    const eslint = new ESLint({
      cwd: this.projectRoot,
      fix: this.fixMode,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.vue'],
          languageOptions: { parser: vueParser },
          plugins: { 'vuejs-accessibility': vueA11y as ESLint.Plugin },
          rules
        }
      ]
    });
    const results = await eslint.lintFiles([...vueFiles]);
    if (this.fixMode) {
      await ESLint.outputFixes(results);
    }
    return results;
  }

  private processLintResults(
    results: readonly ESLint.LintResult[],
    effectiveRules: Record<string, 'error' | 'off'>
  ): void {
    for (const res of results) {
      const relFile = toPosixRelative(this.projectRoot, res.filePath);
      this.recordScanned(relFile);
    }

    const activeRules = new Set<AccessibilityRuleId>();
    for (const [eslintRuleId, level] of Object.entries(effectiveRules)) {
      if (level !== 'off') activeRules.add(mapA11yRuleId(eslintRuleId));
    }

    for (const ruleId of ESLINT_BACKED_RULES) {
      if (!activeRules.has(ruleId)) {
        this.markRuleNotApplicable(ruleId, 'Todas sus reglas ESLint están en off (config.accessibility.rules)');
        continue;
      }

      this.runSubAuditorSync(ruleId, () => {
        for (const res of results) {
          const relFile = toPosixRelative(this.projectRoot, res.filePath);
          for (const msg of res.messages) {
            if (!msg.ruleId || !msg.ruleId.startsWith('vuejs-accessibility/')) continue;
            if (mapA11yRuleId(msg.ruleId) !== ruleId) continue;
            this.addViolation({
              ruleId,
              severity: 'error',
              file: relFile,
              line: msg.line,
              context: msg.ruleId,
              message: msg.message,
              fixable: Boolean(msg.fix)
            });
          }
        }
      });
    }
  }

  private auditIndexViewport(): void {
    const indexPath = path.resolve(this.projectRoot, INDEX_HTML_FILE);
    if (!fs.existsSync(indexPath)) {
      this.markRuleNotApplicable('a11y-viewport-zoom-lock', `No existe ${INDEX_HTML_FILE} en la raíz del proyecto`);
      return;
    }

    const content = fs.readFileSync(indexPath, 'utf-8');
    this.recordScanned(INDEX_HTML_FILE);
    const viewportMatch = content.match(/<meta\s+name=["']viewport["'][^>]*>/i);
    if (!viewportMatch) return;

    const tag = viewportMatch[0];
    const userScalableNo = /user-scalable\s*=\s*(?:no|0)/i.test(tag);
    const maxScaleOne = /maximum-scale\s*=\s*1(?:\.0+)?(?:\b|[,;\s])/i.test(tag);

    if (userScalableNo || maxScaleOne) {
      const lines = content.slice(0, viewportMatch.index).split('\n');
      const lineNum = lines.length;

      this.addViolation({
        ruleId: 'a11y-viewport-zoom-lock',
        severity: 'error',
        file: INDEX_HTML_FILE,
        line: lineNum,
        context: tag.trim(),
        message: 'Meta viewport bloquea el zoom móvil (user-scalable=no o maximum-scale=1.0). Viola WCAG 1.4.4 Resize text.',
        fixable: false
      });
    }
  }

  private collectVueFiles(dir: string, collected: string[], seen: Set<string>): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
        this.collectVueFiles(fullPath, collected, seen);
      } else if (entry.isFile() && entry.name.endsWith('.vue')) {
        if (!seen.has(fullPath)) {
          seen.add(fullPath);
          collected.push(fullPath);
        }
      }
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateAccessibilityAuditor());
