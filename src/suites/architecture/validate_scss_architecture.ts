import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  FileScanAuditor,
  createUniformRuleCapabilities,
  createUniformRemediationPhases,
  LIGHT_RULE_CAPABILITIES,
  resolveFileScanRoots
} from '../../core/auditorBase.ts';
import { deriveCoverageFromRoots } from '../../core/auditCoverage.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { stripCommentsAndStrings } from '../../core/scannerUtils.ts';

enableCompileCache();

export const SCSS_ARCHITECTURE_RULES = [
  'raw-css-in-sfc',
  'scss-deep-selector-abuse',
  'non-standard-spacing-unit',
  'missing-theme-token-usage',
  'excessive-scss-nesting'
] as const;

export type ScssArchitectureRuleId = (typeof SCSS_ARCHITECTURE_RULES)[number];

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
      roots: scssRoots.targetRoots,
      allowedExtensions: SCANNABLE_EXTS,
      ruleIds: SCSS_ARCHITECTURE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(SCSS_ARCHITECTURE_RULES, 'hygiene'),
      ruleDescriptions: {
        'raw-css-in-sfc': '<style> tag missing lang="scss"',
        'scss-deep-selector-abuse': 'Abuse or nesting of :deep()',
        'non-standard-spacing-unit': 'Arbitrary spacing outside token scale',
        'missing-theme-token-usage': 'Hardcoded color without theme token',
        'excessive-scss-nesting': 'SCSS nesting exceeds 3 levels'
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
          '   ✅ Flattened:    `.card__title-highlight { color: var(--color-danger); }`'
      },
      ruleCapabilities: createUniformRuleCapabilities(
        SCSS_ARCHITECTURE_RULES,
        LIGHT_RULE_CAPABILITIES
      ),
      projectRoot: scssRoots.effectiveRoot,
      coverage: deriveCoverageFromRoots(scssRoots.targetRoots, SCANNABLE_EXTS, scssRoots.effectiveRoot),
      exemptPaths: scssConfig.scssArchitecture?.exemptPaths
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const isVueSfc = relPath.endsWith('.vue');
    const isScssFile = relPath.endsWith('.scss');
    const isCssFile = relPath.endsWith('.css');

    this.runSubAuditorSync('raw-css-in-sfc', () => {
      if (isVueSfc) {
        this.auditRawCssInSfc(relPath, content);
      }
    });

    if (isVueSfc) {
      const styleBlocks = this.extractStyleBlocks(content);
      for (const block of styleBlocks) {
        this.runSubAuditorSync('scss-deep-selector-abuse', () => {
          this.auditScssDeepSelectorAbuse(relPath, block.content, block.startLine);
        });
        this.runSubAuditorSync('non-standard-spacing-unit', () => {
          this.auditNonStandardSpacingUnit(relPath, block.content, block.startLine);
        });
        this.runSubAuditorSync('missing-theme-token-usage', () => {
          this.auditMissingThemeTokenUsage(relPath, block.content, block.startLine, block.scoped);
        });
        this.runSubAuditorSync('excessive-scss-nesting', () => {
          this.auditExcessiveScssNesting(relPath, block.content, block.startLine, block.scoped);
        });
      }
    } else if (isScssFile || isCssFile) {
      this.runSubAuditorSync('scss-deep-selector-abuse', () => {
        this.auditScssDeepSelectorAbuse(relPath, content, 1);
      });
      this.runSubAuditorSync('non-standard-spacing-unit', () => {
        this.auditNonStandardSpacingUnit(relPath, content, 1);
      });
      this.runSubAuditorSync('missing-theme-token-usage', () => {
        this.auditMissingThemeTokenUsage(relPath, content, 1, false);
      });
      this.runSubAuditorSync('excessive-scss-nesting', () => {
        this.auditExcessiveScssNesting(relPath, content, 1, false);
      });
    }
  }

  private extractStyleBlocks(
    content: string
  ): Array<{ content: string; startLine: number; scoped: boolean }> {
    const blocks: Array<{ content: string; startLine: number; scoped: boolean }> = [];
    const styleRegex = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
    let match: RegExpExecArray | null;
    while ((match = styleRegex.exec(content)) !== null) {
      const attrs = match[1] ?? '';
      const scoped = /\bscoped\b/i.test(attrs);
      const before = content.slice(0, match.index);
      const startLine = before.split('\n').length;
      blocks.push({ content: match[2] ?? '', startLine, scoped });
    }
    return blocks;
  }

  private auditRawCssInSfc(relPath: string, content: string): void {
    if (!relPath.endsWith('.vue')) return;

    // Detect <style> without lang="scss"
    const styleTagRegex = /<style\b([^>]*)>/gi;
    let match: RegExpExecArray | null;
    while ((match = styleTagRegex.exec(content)) !== null) {
      const attrs = match[1] ?? '';
      const hasScss = /lang=["']scss["']/i.test(attrs);
      if (!hasScss) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'raw-css-in-sfc',
          severity: 'error',
          message: '<style> block in SFC component missing mandatory lang="scss" attribute',
          file: relPath,
          line
        });
      }
    }
  }

  private auditScssDeepSelectorAbuse(
    relPath: string,
    content: string,
    lineOffset: number = 1
  ): void {
    // 1. Detect nested :deep() e.g. :deep(...) :deep(...)
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

    // 2. Detect overly complex selector chain inside :deep (> 3 compound selectors)
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

    // Detect arbitrary odd pixel values like 11px, 13px, 15px, 17px, 19px, 21px, 23px, 27px in spacing
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

    // Detect hardcoded hex colors or rgb(...) in color properties without var(--...)
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
          message:
            'Hardcoded hex or rgb color without using design system token or variable',
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
