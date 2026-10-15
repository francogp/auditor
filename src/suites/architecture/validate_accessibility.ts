import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { deriveCoverageFromRoots } from '../../core/auditCoverage.ts';
import { toPosixRelative } from '../../core/safePath.ts';
import { parseVueSfc } from '../../core/vueSfcParser.ts';

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

const TEMPLATE_BACKED_RULES: readonly AccessibilityRuleId[] = ACCESSIBILITY_RULES.filter(
  (id) => id !== 'a11y-viewport-zoom-lock'
);

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

const VALID_WAI_ARIA_ROLES_LIST = [
  'alert',
  'alertdialog',
  'application',
  'article',
  'banner',
  'button',
  'cell',
  'checkbox',
  'columnheader',
  'combobox',
  'complementary',
  'contentinfo',
  'definition',
  'dialog',
  'directory',
  'document',
  'feed',
  'figure',
  'form',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'link',
  'list',
  'listbox',
  'listitem',
  'log',
  'main',
  'marquee',
  'math',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'navigation',
  'none',
  'note',
  'option',
  'presentation',
  'progressbar',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'search',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'textbox',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem'
] as const;

export type ValidWaiAriaRole = (typeof VALID_WAI_ARIA_ROLES_LIST)[number];
const VALID_WAI_ARIA_ROLES: ReadonlySet<string> = new Set(VALID_WAI_ARIA_ROLES_LIST); // runtime-set: Fast O(1) membership lookup set

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
      usesThirdPartyTool: false,
      ruleCapabilities: createRuleCapabilities(
        ACCESSIBILITY_RULES,
        {
          speed: 'light',
          phase: 'normal',
          fix: 'normal',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        },
        [...ACCESSIBILITY_RULES]
      ),
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
      ruleRemediations: {
        'a11y-img-alt':
          'Guía de diagnóstico y remediación para a11y-img-alt. Revisa la incidencia detectada y añade el atributo alt correspondiente.',
        'a11y-form-control-has-label':
          'Guía de diagnóstico y remediación para a11y-form-control-has-label. Revisa la incidencia detectada y asocia un label o aria-label.',
        'a11y-interactive-supports-focus':
          'Guía de diagnóstico y remediación para a11y-interactive-supports-focus. Revisa la incidencia detectada y añade tabindex o rol interactivo con teclado.',
        'a11y-anchor-has-content':
          'Guía de diagnóstico y remediación para a11y-anchor-has-content. Revisa la incidencia detectada y añade texto o aria-label al enlace o botón.',
        'a11y-aria-role-invalid':
          'Guía de diagnóstico y remediación para a11y-aria-role-invalid. Revisa la incidencia detectada y ajusta el rol ARIA conforme a la especificación W3C.',
        'a11y-viewport-zoom-lock':
          'Guía de diagnóstico y remediación para a11y-viewport-zoom-lock. Revisa la incidencia detectada y remueve user-scalable=no o maximum-scale=1.0 de index.html.'
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

    const vueFiles = this.context.collectFiles(scannableRoots, new Set(['.vue']));
    if (vueFiles.length === 0) {
      for (const ruleId of TEMPLATE_BACKED_RULES) {
        this.runSubAuditorSync(ruleId, () => {
          this.markRuleNotApplicable(ruleId, 'No hay archivos .vue en las raíces configuradas');
        });
      }
      return;
    }

    for (const ruleId of TEMPLATE_BACKED_RULES) {
      this.runSubAuditorSync(ruleId, () => {
        for (const absFile of vueFiles) {
          const relFile = toPosixRelative(this.projectRoot, absFile);
          this.recordScanned(relFile);
          this.auditVueFileForRule(absFile, relFile, ruleId);
        }
      });
    }
  }

  private auditVueFileForRule(absPath: string, relPath: string, ruleId: AccessibilityRuleId): void {
    let content = '';
    try {
      content = fs.readFileSync(absPath, 'utf-8');
    } catch {
      return;
    }

    const blocks = parseVueSfc(content);
    if (!blocks.template) return;

    const templateContent = blocks.template.content;
    const linesBeforeTemplate = Math.max(0, blocks.template.contentStartLine - 1);

    switch (ruleId) {
      case 'a11y-img-alt':
        this.auditImgAlt(templateContent, relPath, linesBeforeTemplate);
        break;
      case 'a11y-form-control-has-label':
        this.auditFormControlLabel(templateContent, relPath, linesBeforeTemplate);
        break;
      case 'a11y-interactive-supports-focus':
        this.auditInteractiveFocus(templateContent, relPath, linesBeforeTemplate);
        break;
      case 'a11y-anchor-has-content':
        this.auditAnchorContent(templateContent, relPath, linesBeforeTemplate);
        break;
      case 'a11y-aria-role-invalid':
        this.auditAriaRole(templateContent, relPath, linesBeforeTemplate);
        break;
      default:
        break;
    }
  }

  private auditImgAlt(template: string, relPath: string, lineOffset: number): void {
    const imgRegex = /<img\b([^>]*)>/gi;
    let match: RegExpExecArray | null;
    while ((match = imgRegex.exec(template)) !== null) {
      const attrs = match[1] ?? '';
      const hasAlt = /\b(?:alt|:alt|v-bind:alt)\s*=/i.test(attrs);
      const isAriaHidden = /aria-hidden\s*=\s*["']true["']/i.test(attrs);
      const isPresentation = /role\s*=\s*["'](?:presentation|none)["']/i.test(attrs);

      if (!hasAlt && !isAriaHidden && !isPresentation) {
        const lineNum = lineOffset + template.slice(0, match.index).split('\n').length;
        this.addViolation({
          ruleId: 'a11y-img-alt',
          severity: 'error',
          file: relPath,
          line: lineNum,
          context: match[0],
          message:
            'Elemento <img> no posee atributo alt accesible. Viola WCAG 1.1.1 Non-text Content.',
          fixable: true
        });
      }
    }
  }

  private auditFormControlLabel(template: string, relPath: string, lineOffset: number): void {
    const inputRegex = /<(?:input|select|textarea)\b([^>]*)>/gi;
    let match: RegExpExecArray | null;
    while ((match = inputRegex.exec(template)) !== null) {
      const attrs = match[1] ?? '';
      if (/type\s*=\s*["'](?:hidden|submit|button|reset|image)["']/i.test(attrs)) {
        continue;
      }
      const hasAriaLabel =
        /\b(?:aria-label|aria-labelledby|:aria-label|:aria-labelledby)\s*=/i.test(attrs);
      const hasId = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs);
      let hasAssociatedLabel = false;
      if (hasId && hasId[1]) {
        const idVal = hasId[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const labelForRegex = new RegExp(
          `<label[^>]*\\s(?:for|:for)\\s*=\\s*["']${idVal}["']`,
          'i'
        );
        hasAssociatedLabel = labelForRegex.test(template);
      }

      if (!hasAriaLabel && !hasAssociatedLabel) {
        const lineNum = lineOffset + template.slice(0, match.index).split('\n').length;
        this.addViolation({
          ruleId: 'a11y-form-control-has-label',
          severity: 'error',
          file: relPath,
          line: lineNum,
          context: match[0],
          message:
            'Control de formulario sin label asociado ni aria-label. Viola WCAG 1.3.1 Info and Relationships.',
          fixable: false
        });
      }
    }
  }

  private auditInteractiveFocus(template: string, relPath: string, lineOffset: number): void {
    const nonInteractiveClickRegex =
      /<(div|span|p|li|section|article)\b([^>]*(?:@click|v-on:click|@mousedown|v-on:mousedown)[^>]*)>/gi;
    let match: RegExpExecArray | null;
    while ((match = nonInteractiveClickRegex.exec(template)) !== null) {
      const attrs = match[2] ?? '';
      const hasTabIndex = /\btabindex\s*=/i.test(attrs);
      const hasRoleButton = /role\s*=\s*["']button["']/i.test(attrs);
      const hasKeyListeners = /@(keydown|keyup|keypress)\b/i.test(attrs);

      if (!hasTabIndex && !hasRoleButton && !hasKeyListeners) {
        const lineNum = lineOffset + template.slice(0, match.index).split('\n').length;
        this.addViolation({
          ruleId: 'a11y-interactive-supports-focus',
          severity: 'error',
          file: relPath,
          line: lineNum,
          context: match[0],
          message: `Elemento no interactivo <${match[1]}> con manejador de clic sin soporte de foco ni teclado. Viola WCAG 2.1.1 Keyboard.`,
          fixable: false
        });
      }
    }
  }

  private auditAnchorContent(template: string, relPath: string, lineOffset: number): void {
    const tagRegex = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(template)) !== null) {
      const tag = match[1] ?? '';
      const attrs = match[2] ?? '';
      const inner = match[3] ?? '';

      const hasAriaLabel =
        /\b(?:aria-label|aria-labelledby|:aria-label|:aria-labelledby)\s*=/i.test(attrs);
      const hasText = inner.replace(/<[^>]*>/g, '').trim().length > 0;
      const hasAccessibleInner = /<(?:img|svg)\b[^>]*(?:alt|aria-label|title)=/i.test(inner);

      if (!hasAriaLabel && !hasText && !hasAccessibleInner) {
        const lineNum = lineOffset + template.slice(0, match.index).split('\n').length;
        this.addViolation({
          ruleId: 'a11y-anchor-has-content',
          severity: 'error',
          file: relPath,
          line: lineNum,
          context: match[0].slice(0, 100),
          message: `Elemento <${tag}> carece de contenido textual accesible o aria-label. Viola WCAG 2.4.4 Link Purpose.`,
          fixable: false
        });
      }
    }
  }

  private auditAriaRole(template: string, relPath: string, lineOffset: number): void {
    const roleRegex = /\brole\s*=\s*["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = roleRegex.exec(template)) !== null) {
      const roleVal = match[1]?.trim().toLowerCase() ?? '';
      if (!VALID_WAI_ARIA_ROLES.has(roleVal)) {
        const lineNum = lineOffset + template.slice(0, match.index).split('\n').length;
        this.addViolation({
          ruleId: 'a11y-aria-role-invalid',
          severity: 'error',
          file: relPath,
          line: lineNum,
          context: match[0],
          message: `El rol ARIA '${roleVal}' no es un rol WAI-ARIA válido conforme a W3C.`,
          fixable: false
        });
      }
    }
  }

  private auditIndexViewport(): void {
    const indexPath = path.resolve(this.projectRoot, INDEX_HTML_FILE);
    if (!fs.existsSync(indexPath)) {
      this.markRuleNotApplicable(
        'a11y-viewport-zoom-lock',
        `No existe ${INDEX_HTML_FILE} en la raíz del proyecto`
      );
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
        message:
          'Meta viewport bloquea el zoom móvil (user-scalable=no o maximum-scale=1.0). Viola WCAG 1.4.4 Resize text.',
        fixable: false
      });
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateAccessibilityAuditor());
