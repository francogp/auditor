import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  FileScanAuditor,
  createRuleCapabilities,
  createUniformRemediationPhases,
  LIGHT_RULE_CAPABILITIES,
  resolveFileScanRoots
} from '../../core/auditorBase.ts';
import { deriveCoverageFromRoots } from '../../core/auditCoverage.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { stripCommentsAndStrings } from '../../core/scannerUtils.ts';
import { parseVueSfc } from '../../core/vueSfcParser.ts';
import {
  MODERN_SCSS_RULES,
  analyzeModernScss,
  type ModernScssRuleId
} from '../../analyzers/scssModernAnalyzer.ts';

enableCompileCache();

export const SCSS_ARCHITECTURE_RULES = [
  'raw-css-in-sfc',
  'scss-deep-selector-abuse',
  'non-standard-spacing-unit',
  'missing-theme-token-usage',
  'excessive-scss-nesting',
  ...MODERN_SCSS_RULES
] as const;

export type ScssArchitectureRuleId = (typeof SCSS_ARCHITECTURE_RULES)[number];

const FIXABLE_SCSS_RULES: readonly ScssArchitectureRuleId[] = [...MODERN_SCSS_RULES];

const SCANNABLE_EXTS = new Set(['.scss', '.vue', '.css']);

export type ScssBlockKind = 'selector' | 'atrule';

export class ValidateScssArchitectureAuditor extends FileScanAuditor<ScssArchitectureRuleId> {
  constructor(options: { projectRoot?: string; fix?: boolean; roots?: readonly string[] } = {}) {
    const scssRoots = resolveFileScanRoots(options);
    const scssConfig = getAuditConfig(scssRoots.effectiveRoot);
    super({
      id: 'validate_scss_architecture',
      name: 'SCSS Architecture & Distinctive Design Validator',
      description: 'SCSS architecture, tokenization, and distinctive styling',
      family: 'architecture',
      packageName: 'SCSSArch',
      icon: '🎨',
      configKey: 'scssArchitecture.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      requiredPermissions: [],
      usesThirdPartyTool: false,
      fix: options.fix,
      roots: scssRoots.targetRoots,
      allowedExtensions: SCANNABLE_EXTS,
      ruleIds: SCSS_ARCHITECTURE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(SCSS_ARCHITECTURE_RULES, 'hygiene'),
      ruleDescriptions: {
        'raw-css-in-sfc': '<style> tag missing lang="scss"',
        'scss-deep-selector-abuse': 'Abuse or nesting of :deep()',
        'non-standard-spacing-unit': 'Arbitrary spacing outside token scale',
        'missing-theme-token-usage': 'Hardcoded color without theme token',
        'excessive-scss-nesting': 'SCSS nesting exceeds 3 levels',
        'scss-viewport-overflow-and-dvh': '100vw overflow or static 100vh unit',
        'scss-overflow-clip-margin-trap': 'overflow-clip-margin without clip',
        'scss-prefer-user-invalid': 'Use :user-invalid instead of :invalid',
        'scss-focus-outline-removal': 'Focus outline removed without fallback',
        'typography-unclamped-viewport-font': 'Unclamped vw/vh font-size breaks zoom',
        'scss-flexbox-dead-properties': 'Dead justify-self in flex container',
        'scss-universal-expensive-selectors': 'Expensive property on universal * rule',
        'dark-mode-color-scheme-missing': 'Dark mode missing root color-scheme'
      },
      ruleRemediations: {
        'raw-css-in-sfc':
          '📖 REMEDIATION GUIDE: raw-css-in-sfc\n' +
          '1. Root Cause: A `<style>` tag was found in a Vue SFC without the `lang="scss"` attribute. Framework architecture standardizes the SCSS preprocessor across all components.\n' +
          '2. Diagnosis: Locate the `<style>` tag in the Vue component.\n' +
          '3. Canonical Solution: Add `lang="scss"` (and `scoped` where appropriate): `<style lang="scss" scoped>`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Incorrect: `<style scoped>`\n' +
          '   ✅ Correct:   `<style lang="scss" scoped>`',
        'scss-deep-selector-abuse':
          '📖 REMEDIATION GUIDE: scss-deep-selector-abuse\n' +
          '1. Root Cause: Nested `:deep()` was used within another `:deep()` (`:deep(.a :deep(.b))`), or multiple chained compound selectors were passed into `:deep()`. This breaks style encapsulation.\n' +
          '2. Diagnosis: Locate the CSS rule with `:deep()` at the reported line.\n' +
          '3. Canonical Solution: Apply `:deep()` once at the root level of the target child selector: `:deep(.target-class)`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Abuse:     `:deep(.parent) :deep(.child)`\n' +
          '   ✅ Canonical: `:deep(.parent .child)`',
        'non-standard-spacing-unit':
          '📖 REMEDIATION GUIDE: non-standard-spacing-unit\n' +
          '1. Root Cause: An arbitrary pixel spacing value was used (e.g. `margin: 13px`, `padding: 27px`) that does not align with modular design tokens (multiples of 4px/8px).\n' +
          '2. Diagnosis: Inspect the margin, padding, or gap property at the reported line.\n' +
          '3. Canonical Solution:\n' +
          '   a) Replace the value with a design token: `var(--spacing-md)` or `$spacing-4`.\n' +
          '   b) Round to the nearest canonical grid multiple (e.g. 12px or 16px instead of 13px).\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Arbitrary: `padding: 15px;`\n' +
          '   ✅ On-grid:   `padding: var(--space-4, 16px);`',
        'missing-theme-token-usage':
          '📖 REMEDIATION GUIDE: missing-theme-token-usage\n' +
          '1. Root Cause: A hardcoded color literal (`#fff`, `rgb(...)`, `#1e293b`) was found instead of theme tokens or CSS variables. Hardcoded colors prevent dynamic theming (Dark/Light mode).\n' +
          '2. Diagnosis: Locate the literal color at the reported line.\n' +
          '3. Canonical Solution: Replace the color with the corresponding semantic theme variable (e.g. `var(--color-surface)`, `var(--color-primary-text)`).\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Hardcoded: `background-color: #0f172a; color: #ffffff;`\n' +
          '   ✅ Tokenized: `background-color: var(--color-bg-primary); color: var(--color-text-primary);`',
        'excessive-scss-nesting':
          '📖 REMEDIATION GUIDE: excessive-scss-nesting\n' +
          '1. Root Cause: SCSS rules were nested beyond 3 levels deep, inflating selector specificity and harming maintainability.\n' +
          '2. Diagnosis: Examine nested braces in the stylesheet.\n' +
          '3. Canonical Solution: Flatten SCSS rules using BEM methodology or direct class selectors.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Deep nesting: `.card { .header { .title { span { color: red; } } } }`\n' +
          '   ✅ Flattened:    `.card__title-highlight { color: var(--color-danger); }`',
        'scss-viewport-overflow-and-dvh':
          '📖 REMEDIATION GUIDE: scss-viewport-overflow-and-dvh\n' +
          '1. Root Cause: `width: 100vw` includes vertical scrollbar width (causing horizontal scrollbars), and `100vh` ignores dynamic mobile browser toolbars.\n' +
          '2. Diagnosis: Inspect the viewport unit declaration at the reported line.\n' +
          '3. Canonical Solution: Use `width: 100%` (or `100dvw`) and `100dvh` for vertical viewport sizing. Run `npm run auditor:fix`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Legacy: `width: 100vw; min-height: 100vh;`\n' +
          '   ✅ Modern: `width: 100%; min-height: 100dvh;`',
        'scss-overflow-clip-margin-trap':
          '📖 REMEDIATION GUIDE: scss-overflow-clip-margin-trap\n' +
          '1. Root Cause: `overflow-clip-margin` was declared on an element without `overflow: clip`. Browsers ignore `overflow-clip-margin` when `overflow: hidden` is used.\n' +
          '2. Diagnosis: Inspect the CSS rule block containing `overflow-clip-margin`.\n' +
          '3. Canonical Solution: Pair `overflow-clip-margin` with `overflow: clip`. Run `npm run auditor:fix`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Ignored: `overflow: hidden; overflow-clip-margin: 8px;`\n' +
          '   ✅ Working: `overflow: clip; overflow-clip-margin: 8px;`',
        'scss-prefer-user-invalid':
          '📖 REMEDIATION GUIDE: scss-prefer-user-invalid\n' +
          '1. Root Cause: The `:invalid` pseudo-class matches required empty inputs immediately on page load before the user interacts with the form.\n' +
          '2. Diagnosis: Locate the `:invalid` selector in the stylesheet.\n' +
          '3. Canonical Solution: Replace `:invalid` with `:user-invalid` so error styling activates only after user interaction. Run `npm run auditor:fix`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Premature: `input:invalid { border-color: var(--danger); }`\n' +
          '   ✅ Modern:    `input:user-invalid { border-color: var(--danger); }`',
        'scss-focus-outline-removal':
          '📖 REMEDIATION GUIDE: scss-focus-outline-removal\n' +
          '1. Root Cause: `outline: none` or `outline: 0` was set on `:focus` or `:focus-visible` without a visible replacement focus ring, breaking keyboard navigation (WCAG 2.4.7).\n' +
          '2. Diagnosis: Inspect the `:focus` rule at the reported line.\n' +
          '3. Canonical Solution: Use `:focus:not(:focus-visible)` to hide mouse focus rings while preserving keyboard `:focus-visible` indicators. Run `npm run auditor:fix`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Inaccessible: `.btn:focus { outline: none; }`\n' +
          '   ✅ Accessible:   `.btn:focus:not(:focus-visible) { outline: none; }`',
        'typography-unclamped-viewport-font':
          '📖 REMEDIATION GUIDE: typography-unclamped-viewport-font\n' +
          '1. Root Cause: `font-size` is defined solely in viewport units (`vw`/`vh`) without `clamp()` or `rem`, preventing text from scaling when users zoom to 200% (WCAG 1.4.4).\n' +
          '2. Diagnosis: Inspect the `font-size` declaration.\n' +
          '3. Canonical Solution: Wrap fluid typography in `clamp(minRem, calc(rem + vw), maxRem)`. Run `npm run auditor:fix`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Zoom-locked: `font-size: 4vw;`\n' +
          '   ✅ Accessible:  `font-size: clamp(1rem, calc(0.5rem + 4vw), 2.5rem);`',
        'scss-flexbox-dead-properties':
          '📖 REMEDIATION GUIDE: scss-flexbox-dead-properties\n' +
          '1. Root Cause: `justify-self` is declared inside a Flexbox rule (`display: flex`). Per CSS Box Alignment, `justify-self` has no effect in Flexbox.\n' +
          '2. Diagnosis: Locate `justify-self` in the flex rule block.\n' +
          '3. Canonical Solution: Use `justify-content` on the flex container or `margin-inline-start: auto` on the flex item. Run `npm run auditor:fix`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Dead property: `.row { display: flex; justify-self: center; }`\n' +
          '   ✅ Effective:     `.row { display: flex; justify-content: center; }`',
        'scss-universal-expensive-selectors':
          '📖 REMEDIATION GUIDE: scss-universal-expensive-selectors\n' +
          '1. Root Cause: An expensive layout or compositor property (`text-wrap: balance/pretty` or `will-change`) is applied to the universal selector `*`, degrading rendering performance.\n' +
          '2. Diagnosis: Inspect the `*` rule in the stylesheet.\n' +
          '3. Canonical Solution: Scope `text-wrap: balance` strictly to headings (`h1, h2, h3, h4, h5, h6`) and `will-change` only to active animated elements. Run `npm run auditor:fix`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Expensive: `* { text-wrap: balance; }`\n' +
          '   ✅ Scoped:    `h1, h2, h3, h4, h5, h6 { text-wrap: balance; }`',
        'dark-mode-color-scheme-missing':
          '📖 REMEDIATION GUIDE: dark-mode-color-scheme-missing\n' +
          '1. Root Cause: The stylesheet defines `@media (prefers-color-scheme: dark)` rules but `:root` lacks `color-scheme: light dark`, leaving native scrollbars, form controls, and system UI surfaces in light mode.\n' +
          '2. Diagnosis: Check the `:root` rule in the main stylesheet.\n' +
          '3. Canonical Solution: Add `color-scheme: light dark;` to `:root`. Run `npm run auditor:fix`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Incomplete: `:root { --bg: #fff; }`\n' +
          '   ✅ Complete:   `:root { color-scheme: light dark; --bg: #fff; }`'
      },
      ruleCapabilities: createRuleCapabilities(
        SCSS_ARCHITECTURE_RULES,
        LIGHT_RULE_CAPABILITIES,
        FIXABLE_SCSS_RULES
      ),
      fixableRuleIds: FIXABLE_SCSS_RULES,
      projectRoot: scssRoots.effectiveRoot,
      coverage: deriveCoverageFromRoots(
        scssRoots.targetRoots,
        SCANNABLE_EXTS,
        scssRoots.effectiveRoot
      ),
      exemptPaths: scssConfig.scssArchitecture?.exemptPaths
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const isVueSfc = relPath.endsWith('.vue');
    const isScssFile = relPath.endsWith('.scss');
    const isCssFile = relPath.endsWith('.css');
    const isFix = this.isFixActive();
    const absFile = path.resolve(this.projectRoot, relPath);

    this.runSubAuditorSync('raw-css-in-sfc', () => {
      if (isVueSfc) {
        this.auditRawCssInSfc(relPath, content);
      }
    });

    if (isVueSfc) {
      const sfc = parseVueSfc(content);
      let updatedSfc = content;
      let sfcMutated = false;

      for (let i = sfc.styles.length - 1; i >= 0; i--) {
        const block = sfc.styles[i]!;
          this.auditStyleBlockRules(
            relPath,
            block.content,
            block.contentStartLine,
            block.isScoped,
            (fixedBlock) => {
              updatedSfc =
                updatedSfc.slice(0, block.contentStartIndex) +
                fixedBlock +
                updatedSfc.slice(block.contentStartIndex + block.content.length);
              sfcMutated = true;
            }
          );
        }

        if (isFix && sfcMutated) {
          fs.writeFileSync(absFile, updatedSfc, 'utf-8');
        }
      } else if (isScssFile || isCssFile) {
        this.auditStyleBlockRules(relPath, content, 1, false, (fixedStyle) => {
          fs.writeFileSync(absFile, fixedStyle, 'utf-8');
        });
      }
    }

    private auditStyleBlockRules(
      relPath: string,
      styleContent: string,
      startLine: number,
      isScoped: boolean,
      onFixed: (fixed: string) => void
    ): void {
      const isFix = this.isFixActive();
      this.runSubAuditorSync('scss-deep-selector-abuse', () => {
      this.auditScssDeepSelectorAbuse(relPath, styleContent, startLine);
    });
    this.runSubAuditorSync('non-standard-spacing-unit', () => {
      this.auditNonStandardSpacingUnit(relPath, styleContent, startLine);
    });
    this.runSubAuditorSync('missing-theme-token-usage', () => {
      this.auditMissingThemeTokenUsage(relPath, styleContent, startLine, isScoped);
    });
    this.runSubAuditorSync('excessive-scss-nesting', () => {
      this.auditExcessiveScssNesting(relPath, styleContent, startLine, isScoped);
    });

    const modernRes = analyzeModernScss(styleContent, startLine, isFix);
    for (const modRuleId of MODERN_SCSS_RULES) {
      this.runSubAuditorSync(modRuleId, () => {
        for (const finding of modernRes.findings) {
          if (finding.ruleId !== modRuleId) continue;
          this.addViolation({
            ruleId: finding.ruleId as ModernScssRuleId,
            severity: 'error',
            file: relPath,
            line: finding.line,
            message: finding.message,
            fixable: finding.fixable
          });
        }
      });
    }

    if (isFix && modernRes.fixedContent !== undefined) {
      onFixed(modernRes.fixedContent);
    }
  }

  private auditRawCssInSfc(relPath: string, content: string): void {
    if (!relPath.endsWith('.vue')) return;

    const sfc = parseVueSfc(content);
    for (const block of sfc.styles) {
      if (block.lang?.toLowerCase() !== 'scss') {
        this.addViolation({
          ruleId: 'raw-css-in-sfc',
          severity: 'error',
          message: '<style> block in SFC component missing mandatory lang="scss" attribute',
          file: relPath,
          line: block.startLine
        });
      }
    }
  }

  private auditScssDeepSelectorAbuse(
    relPath: string,
    content: string,
    lineOffset: number = 1
  ): void {
    const nestedDeepRegex = /:deep\([^)]*\)[^{};]*:deep\(/g;
    let nestedMatch: RegExpExecArray | null;
    while ((nestedMatch = nestedDeepRegex.exec(content)) !== null) {
      const line = lineOffset + this.getLineNumber(content, nestedMatch.index) - 1;
      this.addViolation({
        ruleId: 'scss-deep-selector-abuse',
        severity: 'error',
        message: 'Nested :deep() selector inside another :deep() in the same rule',
        file: relPath,
        line
      });
    }

    const complexDeepRegex = /:deep\(\s*([^)]+)\s*\)/g;
    let complexMatch: RegExpExecArray | null;
    while ((complexMatch = complexDeepRegex.exec(content)) !== null) {
      const innerSelector = complexMatch[1] ?? '';
      const parts = innerSelector.trim().split(/\s+/).filter(Boolean);
      if (parts.length > 3) {
        const line = lineOffset + this.getLineNumber(content, complexMatch.index) - 1;
        this.addViolation({
          ruleId: 'scss-deep-selector-abuse',
          severity: 'error',
          message: `Overly complex selector chain inside :deep() (${parts.length} selectors > 3)`,
          file: relPath,
          line
        });
      }
    }
  }

  private auditNonStandardSpacingUnit(
    relPath: string,
    content: string,
    lineOffset: number = 1
  ): void {
    const config = getAuditConfig(this.projectRoot);
    if (config.scssArchitecture?.allowPixelArtSpacing) return;

    const allowedUnits = new Set(config.scssArchitecture?.allowedSpacingUnits ?? []);

    const arbitrarySpacingRegex =
      /(?:margin(?:-(?:top|bottom|left|right|inline|block))?|padding(?:-(?:top|bottom|left|right|inline|block))?|gap|row-gap|column-gap)\s*:[^;]*?\b(1[13579]|2[13579]|3[13579]|7|9|13|17|23|27)px\b/gi;
    let match: RegExpExecArray | null;
    while ((match = arbitrarySpacingRegex.exec(content)) !== null) {
      const val = match[1]!;
      const unitStr = `${val}px`;
      if (allowedUnits.has(unitStr) || allowedUnits.has(val)) continue;

      const line = lineOffset + this.getLineNumber(content, match.index) - 1;
      this.addViolation({
        ruleId: 'non-standard-spacing-unit',
        severity: 'error',
        message: `Arbitrary spacing value (${unitStr}) outside standard scale or without design token`,
        file: relPath,
        line
      });
    }
  }

  private auditMissingThemeTokenUsage(
    relPath: string,
    content: string,
    lineOffset: number = 1,
    isScoped: boolean = false
  ): void {
    const config = getAuditConfig(this.projectRoot);
    if (isScoped && config.scssArchitecture?.allowScopedColors) return;

    const hardcodedColorRegex =
      /(?:color|background-color|background|border-color|fill|stroke)\s*:\s*([^;{}]*)/gi;
    let match: RegExpExecArray | null;
    while ((match = hardcodedColorRegex.exec(content)) !== null) {
      const val = match[1] ?? '';
      if (
        val.includes('var(') ||
        val.includes('$') ||
        val.includes('transparent') ||
        val.includes('currentColor') ||
        val.includes('inherit')
      ) {
        continue;
      }
      const hasHex = /#[0-9a-f]{3,8}\b/i.test(val);
      const hasRgb = /\brgba?\([^)]+\)/.test(val);
      if (hasHex || hasRgb) {
        const line = lineOffset + this.getLineNumber(content, match.index) - 1;
        this.addViolation({
          ruleId: 'missing-theme-token-usage',
          severity: 'error',
          message: 'Hardcoded hex or rgb color without using design system token or variable',
          file: relPath,
          line
        });
      }
    }
  }

  private processScssLineBraces(
    line: string,
    blockStack: ScssBlockKind[],
    maxAllowedDepth: number,
    onViolation: (depth: number) => void
  ): void {
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '{') {
        const preceding = line.slice(0, c).trim();
        const isAtRule = preceding.startsWith('@');
        blockStack.push(isAtRule ? 'atrule' : 'selector');

        if (!isAtRule) {
          const selectorDepth = blockStack.filter((b) => b === 'selector').length;
          if (selectorDepth > maxAllowedDepth) {
            onViolation(selectorDepth);
          }
        }
      } else if (char === '}') {
        blockStack.pop();
      }
    }
  }

  private auditExcessiveScssNesting(
    relPath: string,
    content: string,
    lineOffset: number = 1,
    isScoped: boolean = false
  ): void {
    const config = getAuditConfig(this.projectRoot);
    const maxAllowedDepth = isScoped
      ? (config.scssArchitecture?.scopedMaxNestingDepth ?? 4)
      : (config.scssArchitecture?.maxNestingDepth ?? 3);

    const cleanContent = stripCommentsAndStrings(content);
    const lines = cleanContent.split('\n');
    const blockStack: ScssBlockKind[] = [];

    for (let i = 0; i < lines.length; i++) {
      this.processScssLineBraces(lines[i]!, blockStack, maxAllowedDepth, (depth) => {
        this.addViolation({
          ruleId: 'excessive-scss-nesting',
          severity: 'error',
          message: `Excessive SCSS nesting (${depth} levels > ${maxAllowedDepth}); flatten selectors with BEM or semantic classes`,
          file: relPath,
          line: lineOffset + i
        });
      });
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateScssArchitectureAuditor());
