import fs from 'node:fs';
import { enableCompileCache } from 'node:module';
import path from 'node:path';

import {
  MODERN_ACCESSIBILITY_RULES,
  analyzeModernAccessibility,
  fixViewportZoomLockContent,
  type ModernA11yFinding,
  type ModernAccessibilityRuleId
} from '../../analyzers/accessibilityModernAnalyzer.ts';
import { SharedAstContext } from '../../core/astContext.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { DEFAULT_AUDIT_CONFIG } from '../../core/auditConfigDefaults.ts';
import { deriveCoverageFromRoots } from '../../core/auditCoverage.ts';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  createUniformRuleCapabilities
} from '../../core/auditorBase.ts';
import { toPosixRelative } from '../../core/safePath.ts';
import { parseVueSfc, extractSfcScriptContent } from '../../core/vueSfcParser.ts';

enableCompileCache();

const INDEX_HTML_FILE = 'index.html';
const VUE_EXTENSIONS: ReadonlySet<string> = new Set(['.vue']);

export const ACCESSIBILITY_RULES = [
  'a11y-img-alt',
  'a11y-form-control-has-label',
  'a11y-interactive-supports-focus',
  'a11y-anchor-has-content',
  'a11y-aria-role-invalid',
  'a11y-viewport-zoom-lock',
  ...MODERN_ACCESSIBILITY_RULES
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
  private readonly astCache = new SharedAstContext();

  public constructor(options: { projectRoot?: string } = {}) {
    const effectiveRoot = options.projectRoot ?? process.cwd();
    const config = getAuditConfig(effectiveRoot);
    const scannableRoots = [
      ...(config.paths.componentsRoots ?? []),
      ...(config.paths.viewsRoots ?? []),
      ...(config.paths.srcRoots ?? DEFAULT_AUDIT_CONFIG.paths.srcRoots)
    ];
    super({
      ruleFixers: {},
      fixableRuleIds: [
        'a11y-viewport-zoom-lock',
        'a11y-no-positive-tabindex',
        'a11y-no-aria-hidden-focusable',
        'a11y-svg-accessibility',
        'a11y-iframe-title-and-scroll',
        'forms-identifier-input-type',
        'forms-autocomplete-hygiene'
      ],
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createUniformRuleCapabilities(ACCESSIBILITY_RULES, {
        speed: 'light',
        phase: 'normal',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_accessibility',
      name: 'Vue & Web Accessibility Standards Auditor',
      description: 'Validates WCAG 2.1/2.2 standards and accessibility',
      family: 'architecture',
      packageName: 'A11y',
      configKey: 'accessibility.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '♿',
      ruleIds: ACCESSIBILITY_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(ACCESSIBILITY_RULES, 'behavior'),
      ruleDescriptions: {
        'a11y-img-alt': 'Image missing accessible alt attribute',
        'a11y-form-control-has-label': 'Form control missing label',
        'a11y-interactive-supports-focus': 'Interactive element missing focus',
        'a11y-anchor-has-content': 'Link or button missing text or label',
        'a11y-aria-role-invalid': 'Non-compliant ARIA role or attribute',
        'a11y-viewport-zoom-lock': 'Viewport zoom lock in HTML',
        'a11y-no-positive-tabindex': 'Positive tabindex disrupts focus order',
        'a11y-no-aria-hidden-focusable': 'Focusable element has aria-hidden="true"',
        'a11y-svg-accessibility': 'Inline SVG missing role or aria-hidden',
        'a11y-iframe-title-and-scroll': 'Iframe missing title or blocks scrolling',
        'forms-identifier-input-type': 'Identifier input uses type="number"',
        'forms-autocomplete-hygiene': 'Auth input disables password autofill',
        'html-dialog-popover-exclusivity': 'Dialog popover or summary interactive trap'
      },
      ruleRemediations: {
        'a11y-img-alt':
          '📖 REMEDIATION GUIDE: a11y-img-alt\n' +
          '1. Root Cause: An `<img>` tag was found without an `alt` attribute (or with missing `alt`). Screen readers cannot convey visual content to visually impaired users (WCAG 1.1.1).\n' +
          '2. Diagnosis: Locate the reported image in the Vue component template.\n' +
          '3. Canonical Solution:\n' +
          '   a) If the image conveys information: concisely describe its content via `alt="Description of graphic or photo"`.\n' +
          '   b) If the image is purely decorative: add an explicit empty `alt=""` or `aria-hidden="true"`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Inaccessible: `<img src="/logo.png">`\n' +
          '   ✅ Accessible:   `<img src="/logo.png" alt="Application logo">`',
        'a11y-form-control-has-label':
          '📖 REMEDIATION GUIDE: a11y-form-control-has-label\n' +
          '1. Root Cause: A form control (`<input>`, `<select>`, `<textarea>`) lacks an associated accessible label, preventing screen readers from announcing field purpose (WCAG 1.3.1 / 4.1.2).\n' +
          '2. Diagnosis: Examine the form control at the reported line.\n' +
          '3. Canonical Solution:\n' +
          '   a) Associate a `<label :for="id">Text</label>` with the control\'s matching `id`.\n' +
          '   b) Or add an `aria-label="Field name"` or `aria-labelledby="labelId"` attribute.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Inaccessible: `<input v-model="email" type="email" placeholder="Email">`\n' +
          '   ✅ Accessible:   `<input v-model="email" type="email" aria-label="Email address">`',
        'a11y-interactive-supports-focus':
          '📖 REMEDIATION GUIDE: a11y-interactive-supports-focus\n' +
          '1. Root Cause: A non-interactive element (e.g. `<div>` or `<span>`) has `@click` handlers but is not keyboard accessible (`tabindex` or keyboard listeners), excluding keyboard-only users (WCAG 2.1.1).\n' +
          '2. Diagnosis: Check the element with `@click` at the reported line.\n' +
          '3. Canonical Solution:\n' +
          '   a) Convert the element into a native semantic button: `<button type="button" @click="...">`.\n' +
          '   b) If it must remain a div for layout, add `role="button"`, `tabindex="0"`, and a `@keydown.enter.space="..."` listener.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Inaccessible: `<div class="card" @click="selectItem">`\n' +
          '   ✅ Semantic:     `<button type="button" class="card" @click="selectItem">`',
        'a11y-anchor-has-content':
          '📖 REMEDIATION GUIDE: a11y-anchor-has-content\n' +
          '1. Root Cause: A link (`<a>`) or button (`<button>`) has no visible text or accessible label (e.g. an icon without text alternative), preventing screen readers from announcing its destination or action (WCAG 2.4.4 / 4.1.2).\n' +
          '2. Diagnosis: Check link or button content in the template.\n' +
          '3. Canonical Solution:\n' +
          '   a) Add descriptive text or a visually hidden label: `<span class="sr-only">Close</span>`.\n' +
          '   b) Or define `aria-label="Action description"`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Empty:      `<button @click="close"><i class="icon-close" /></button>`\n' +
          '   ✅ Accessible: `<button @click="close" aria-label="Close modal"><i class="icon-close" aria-hidden="true" /></button>`',
        'a11y-aria-role-invalid':
          '📖 REMEDIATION GUIDE: a11y-aria-role-invalid\n' +
          '1. Root Cause: An unrecognized or misspelled value was used in `role="..."`. W3C WAI-ARIA defines an exact catalog of valid roles.\n' +
          '2. Diagnosis: Inspect the value assigned to `role` at the reported element.\n' +
          '3. Canonical Solution: Correct the value using a canonical WAI-ARIA role (e.g. `dialog`, `button`, `navigation`, `tab`, `alert`).\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Invalid:    `<div role="modal-box">`\n' +
          '   ✅ Compliant:  `<div role="dialog" aria-modal="true">`',
        'a11y-viewport-zoom-lock':
          '📖 REMEDIATION GUIDE: a11y-viewport-zoom-lock\n' +
          '1. Root Cause: The `<meta name="viewport">` tag in `index.html` disables user zooming (`user-scalable=no` or `maximum-scale=1.0`), preventing low-vision users from magnifying content (WCAG 1.4.4 Resize Text).\n' +
          '2. Diagnosis: Inspect `index.html` at the viewport meta tag.\n' +
          '3. Canonical Solution: Remove `user-scalable=no`, `user-scalable=0`, and `maximum-scale=1.0`. Run `npm run auditor:fix` to auto-repair.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Locked:     `<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">`\n' +
          '   ✅ Accessible: `<meta name="viewport" content="width=device-width, initial-scale=1.0">`',
        'a11y-no-positive-tabindex':
          '📖 REMEDIATION GUIDE: a11y-no-positive-tabindex\n' +
          '1. Root Cause: An element defines a positive `tabindex` (`tabindex="1"`, `tabindex="2"`, etc.), jumping ahead of the logical DOM order and confusing keyboard users (WCAG 2.4.3).\n' +
          '2. Diagnosis: Locate the element with `tabindex > 0` in the template.\n' +
          '3. Canonical Solution: Replace positive values with `tabindex="0"` and order elements naturally in the DOM. Run `npm run auditor:fix` to auto-repair.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Broken order: `<button tabindex="2">Submit</button>`\n' +
          '   ✅ Natural order: `<button tabindex="0">Submit</button>`',
        'a11y-no-aria-hidden-focusable':
          '📖 REMEDIATION GUIDE: a11y-no-aria-hidden-focusable\n' +
          '1. Root Cause: A focusable element (`<button>`, `<a href>`, `<input>`, or `[tabindex="0"]`) declares `aria-hidden="true"`, allowing keyboard users to focus an element that assistive technology cannot announce (WCAG 4.1.2).\n' +
          '2. Diagnosis: Inspect the focusable element with `aria-hidden="true"`.\n' +
          '3. Canonical Solution: Remove `aria-hidden="true"` from interactive elements, or add `tabindex="-1"` and `disabled` if the element is inactive. Run `npm run auditor:fix`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Focus ghost: `<button aria-hidden="true">Close</button>`\n' +
          '   ✅ Accessible:  `<button type="button">Close</button>`',
        'a11y-svg-accessibility':
          '📖 REMEDIATION GUIDE: a11y-svg-accessibility\n' +
          '1. Root Cause: An inline `<svg>` lacks both `aria-hidden="true"` (for decorative icons) and `role="img"` + `<title>`/`aria-label` (for informative graphics), causing screen readers to announce unlabelled graphic nodes (WCAG 1.1.1).\n' +
          '2. Diagnosis: Inspect the `<svg>` tag at the reported line.\n' +
          '3. Canonical Solution: Add `aria-hidden="true"` to decorative SVGs, or add `role="img"` and `aria-label="..."` to standalone informative SVGs. Run `npm run auditor:fix`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Ambiguous: `<svg viewBox="0 0 24 24"><path d="..." /></svg>`\n' +
          '   ✅ Decorative: `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="..." /></svg>`',
        'a11y-iframe-title-and-scroll':
          '📖 REMEDIATION GUIDE: a11y-iframe-title-and-scroll\n' +
          '1. Root Cause: An `<iframe>` omits a descriptive `title` attribute or uses `scrolling="no"` which clips zoomed content (WCAG 2.4.1 / 1.4.10).\n' +
          '2. Diagnosis: Check the `<iframe>` element in the template.\n' +
          '3. Canonical Solution: Provide a clear `title="..."` and remove `scrolling="no"`. Run `npm run auditor:fix`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Inaccessible: `<iframe src="/embed" scrolling="no"></iframe>`\n' +
          '   ✅ Accessible:   `<iframe src="/embed" title="Payment document preview"></iframe>`',
        'forms-identifier-input-type':
          '📖 REMEDIATION GUIDE: forms-identifier-input-type\n' +
          '1. Root Cause: An `<input type="number">` is used for a non-arithmetic identifier (postal code, ZIP, credit card, phone, OTP, DNI, CUIT). `type="number"` strips leading zeros and mutates values on accidental scroll-wheel events.\n' +
          '2. Diagnosis: Inspect the `<input type="number">` at the reported line.\n' +
          '3. Canonical Solution: Use `type="text" inputmode="numeric"` instead. Run `npm run auditor:fix` to auto-repair.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Fragile:   `<input type="number" name="postalCode" />`\n' +
          '   ✅ Canonical: `<input type="text" inputmode="numeric" name="postalCode" />`',
        'forms-autocomplete-hygiene':
          '📖 REMEDIATION GUIDE: forms-autocomplete-hygiene\n' +
          '1. Root Cause: An authentication `<input type="password">` or `<input type="email">` sets `autocomplete="off"`, obstructing password managers and passkey autofill.\n' +
          '2. Diagnosis: Locate the input with `autocomplete="off"`.\n' +
          '3. Canonical Solution: Use `autocomplete="current-password"`, `autocomplete="new-password"`, or `autocomplete="email"`. Run `npm run auditor:fix`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Blocked:   `<input type="password" autocomplete="off" />`\n' +
          '   ✅ Canonical: `<input type="password" autocomplete="current-password" />`',
        'html-dialog-popover-exclusivity':
          '📖 REMEDIATION GUIDE: html-dialog-popover-exclusivity\n' +
          '1. Root Cause: Either a `<dialog>` combines `popover` with `.showModal()`, or a `<summary>` element nests interactive controls (`<button>`, `<a>`, `<input>`) or headings (`<h1>`-`<h6>`).\n' +
          '2. Diagnosis: Inspect the `<dialog>` or `<summary>` at the reported line.\n' +
          '3. Canonical Solution: Keep modal `<dialog>` separate from `[popover]`, and place only plain phrasing text inside `<summary>`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Invalid: `<summary><h3>Details</h3><button>Edit</button></summary>`\n' +
          '   ✅ Valid:   `<summary>Details</summary>`'
      },
      projectRoot: effectiveRoot,
      coverage: {
        include: [
          INDEX_HTML_FILE,
          ...deriveCoverageFromRoots(scannableRoots, new Set(['.vue']), effectiveRoot).include
        ]
      }
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

    const isFix = this.isFixActive();

    interface ParsedVueFileInfo {
      absFile: string;
      relFile: string;
      content: string;
      templateContent: string;
      linesBeforeTemplate: number;
    }

    const parsedVueFiles: ParsedVueFileInfo[] = [];
    const modernFindingsByRule = new Map<
      ModernAccessibilityRuleId,
      Array<{ file: string; finding: ModernA11yFinding }>
    >();
    for (const r of MODERN_ACCESSIBILITY_RULES) {
      modernFindingsByRule.set(r, []);
    }

    for (const absFile of vueFiles) {
      const relFile = toPosixRelative(this.projectRoot, absFile);
      this.recordScanned(relFile);

      let content: string;
      try {
        content = fs.readFileSync(absFile, 'utf-8');
      } catch {
        continue;
      }

      const blocks = parseVueSfc(content);
      if (!blocks.template) continue;

      const templateContent = blocks.template.content;
      const linesBeforeTemplate = Math.max(0, blocks.template.contentStartLine - 1);
      parsedVueFiles.push({
        absFile,
        relFile,
        content,
        templateContent,
        linesBeforeTemplate
      });

      const scriptContent = extractSfcScriptContent(content);
      const scriptAst = scriptContent
        ? this.astCache.getSourceFile(`${relFile}.ts`, scriptContent)
        : undefined;

      const modernRes = analyzeModernAccessibility(
        templateContent,
        scriptAst,
        blocks.template.contentStartLine,
        isFix
      );

      for (const finding of modernRes.findings) {
        modernFindingsByRule.get(finding.ruleId)?.push({ file: relFile, finding });
      }

      if (isFix && modernRes.fixedContent !== undefined) {
        const updatedSfc =
          content.slice(0, blocks.template.contentStartIndex) +
          modernRes.fixedContent +
          content.slice(blocks.template.contentStartIndex + templateContent.length);
        fs.writeFileSync(absFile, updatedSfc, 'utf-8');
      }
    }

    this.runSubAuditorSync('a11y-img-alt', () => {
      for (const file of parsedVueFiles) {
        this.auditImgAlt(file.templateContent, file.relFile, file.linesBeforeTemplate);
      }
    });
    this.runSubAuditorSync('a11y-form-control-has-label', () => {
      for (const file of parsedVueFiles) {
        this.auditFormControlLabel(file.templateContent, file.relFile, file.linesBeforeTemplate);
      }
    });
    this.runSubAuditorSync('a11y-interactive-supports-focus', () => {
      for (const file of parsedVueFiles) {
        this.auditInteractiveFocus(file.templateContent, file.relFile, file.linesBeforeTemplate);
      }
    });
    this.runSubAuditorSync('a11y-anchor-has-content', () => {
      for (const file of parsedVueFiles) {
        this.auditAnchorContent(file.templateContent, file.relFile, file.linesBeforeTemplate);
      }
    });
    this.runSubAuditorSync('a11y-aria-role-invalid', () => {
      for (const file of parsedVueFiles) {
        this.auditAriaRole(file.templateContent, file.relFile, file.linesBeforeTemplate);
      }
    });

    for (const modRuleId of MODERN_ACCESSIBILITY_RULES) {
      this.runSubAuditorSync(modRuleId, () => {
        const items = modernFindingsByRule.get(modRuleId) ?? [];
        for (const item of items) {
          this.addViolation({
            ruleId: item.finding.ruleId,
            severity: 'error',
            file: item.file,
            line: item.finding.line,
            context: item.finding.context,
            message: item.finding.message,
            fixable: item.finding.fixable
          });
        }
      });
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
            'Element <img> is missing accessible alt attribute. Violates WCAG 1.1.1 Non-text Content.',
          fixable: false
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
            'Form control missing associated label or aria-label. Violates WCAG 1.3.1 Info and Relationships.',
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
          message: `Non-interactive element <${match[1]}> with click handler without focus or keyboard support. Violates WCAG 2.1.1 Keyboard.`,
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
          message: `Element <${tag}> lacks accessible textual content or aria-label. Violates WCAG 2.4.4 Link Purpose.`,
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
          message: `ARIA role '${roleVal}' is not a valid WAI-ARIA role according to W3C.`,
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
        `${INDEX_HTML_FILE} does not exist at project root`
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
          'Meta viewport blocks mobile zoom (user-scalable=no or maximum-scale=1.0). Violates WCAG 1.4.4 Resize text.'
      });

      if (this.isFixActive()) {
        const fixed = fixViewportZoomLockContent(content);
        if (fixed !== undefined) {
          fs.writeFileSync(indexPath, fixed, 'utf-8');
        }
      }
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateAccessibilityAuditor());
