import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { ESLint } from 'eslint';
import vueParser from 'vue-eslint-parser';
import vueA11y from 'eslint-plugin-vuejs-accessibility';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

enableCompileCache();

export type AccessibilityRuleId =
  | 'a11y-img-alt'
  | 'a11y-form-control-has-label'
  | 'a11y-interactive-supports-focus'
  | 'a11y-anchor-has-content'
  | 'a11y-aria-role-invalid'
  | 'a11y-viewport-zoom-lock';

export const ACCESSIBILITY_RULES: readonly AccessibilityRuleId[] = [
  'a11y-img-alt',
  'a11y-form-control-has-label',
  'a11y-interactive-supports-focus',
  'a11y-anchor-has-content',
  'a11y-aria-role-invalid',
  'a11y-viewport-zoom-lock'
] as const;

/**
 * Maps an eslint-plugin-vuejs-accessibility rule to canonical AccessibilityRuleId.
 */
export function mapA11yRuleId(eslintRuleId: string): AccessibilityRuleId {
  const bare = eslintRuleId.replace(/^vuejs-accessibility\//, '');
  switch (bare) {
    case 'alt-text':
      return 'a11y-img-alt';
    case 'form-control-has-label':
    case 'label-has-for':
      return 'a11y-form-control-has-label';
    case 'interactive-supports-focus':
    case 'click-events-have-key-events':
    case 'mouse-events-have-key-events':
      return 'a11y-interactive-supports-focus';
    case 'anchor-has-content':
    case 'heading-has-content':
      return 'a11y-anchor-has-content';
    case 'aria-props':
    case 'aria-role':
    case 'aria-unsupported-elements':
    case 'role-has-required-aria-props':
    case 'no-redundant-roles':
    case 'no-role-presentation-on-focusable':
      return 'a11y-aria-role-invalid';
    default:
      return 'a11y-aria-role-invalid';
  }
}

export class ValidateAccessibilityAuditor extends BaseAuditor<AccessibilityRuleId> {
  private readonly fixMode: boolean;

  constructor(options: { projectRoot?: string; fix?: boolean } = {}) {
    const effectiveRoot = options.projectRoot ?? process.cwd();
    super({
      capabilities: { fix: true, lint: true },
      id: 'validate_accessibility',
      name: 'Vue & Web Accessibility Standards Auditor',
      description: 'Valida estándares WCAG 2.1/2.2 y accesibilidad',
      family: 'architecture',
      packageName: 'A11y',
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
      projectRoot: effectiveRoot
    });
    this.fixMode = options.fix ?? false;
  }

  public override async runAudit(): Promise<void> {
    const config = getAuditConfig(this.projectRoot);
    if (config.accessibility?.enabled === false) {
      return;
    }

    // 1. Audit index.html viewport zoom lock (WCAG 1.4.4)
    this.auditIndexViewport();

    // 2. Discover .vue files in components, views, or src roots
    const scannableRoots = [
      ...(config.paths.componentsRoots ?? ['src/components']),
      ...(config.paths.viewsRoots ?? ['src/views']),
      ...(config.paths.srcRoots ?? ['src'])
    ];

    const vueFiles: string[] = [];
    const seenFiles = new Set<string>();

    for (const root of scannableRoots) {
      const fullRoot = path.resolve(this.projectRoot, root);
      if (!fs.existsSync(fullRoot)) continue;
      this.collectVueFiles(fullRoot, vueFiles, seenFiles);
    }

    if (vueFiles.length === 0) {
      return;
    }

    // 3. Configure and execute ESLint with vuejs-accessibility plugin
    const customRules = config.accessibility?.rules ?? {};
    const normalizedCustomRules: Record<string, 'error' | 'off'> = {};
    for (const [key, val] of Object.entries(customRules)) {
      normalizedCustomRules[key] = val ? 'error' : 'off';
    }
    const effectiveRules: Record<string, 'error' | 'off'> = {
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
      ...normalizedCustomRules
    };

    const eslint = new ESLint({
      cwd: this.projectRoot,
      fix: this.fixMode,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.vue'],
          languageOptions: {
            parser: vueParser
          },
          plugins: {
            'vuejs-accessibility': vueA11y as ESLint.Plugin
          },
          rules: effectiveRules
        }
      ]
    });

    const results = await eslint.lintFiles(vueFiles);

    if (this.fixMode) {
      await ESLint.outputFixes(results);
    }

    for (const res of results) {
      const relFile = path.relative(this.projectRoot, res.filePath).replace(/\\/g, '/');
      for (const msg of res.messages) {
        if (!msg.ruleId || !msg.ruleId.startsWith('vuejs-accessibility/')) {
          continue;
        }

        const canonicalRule = mapA11yRuleId(msg.ruleId);
        this.addViolation({
          ruleId: canonicalRule,
          severity: 'error',
          file: relFile,
          line: msg.line,
          context: msg.ruleId,
          message: msg.message
        });
      }
    }
  }

  private auditIndexViewport(): void {
    const indexPath = path.resolve(this.projectRoot, 'index.html');
    if (!fs.existsSync(indexPath)) return;

    const content = fs.readFileSync(indexPath, 'utf-8');
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
        file: 'index.html',
        line: lineNum,
        context: tag.trim(),
        message: 'Meta viewport bloquea el zoom móvil (user-scalable=no o maximum-scale=1.0). Viola WCAG 1.4.4 Resize text.'
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
