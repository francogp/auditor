import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor, createUniformRuleCapabilities, LINT_RULE_CAPABILITIES, resolveFileScanRoots } from '../../core/auditorBase.ts';
import { deriveCoverageFromRoots } from '../../core/auditCoverage.ts';

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

export class ValidateScssArchitectureAuditor extends FileScanAuditor<ScssArchitectureRuleId> {
  constructor(options: { projectRoot?: string; fix?: boolean; roots?: readonly string[] } = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(options);
    super({
      id: 'validate_scss_architecture',
      name: 'SCSS Architecture & Distinctive Design Validator',
      description: 'Arquitectura SCSS, tokenización y diseño distintivo',
      family: 'architecture',
      packageName: 'SCSSArch',
      icon: '🎨',
      configKey: 'scssArchitecture.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      roots: targetRoots,
      allowedExtensions: SCANNABLE_EXTS,
      ruleIds: SCSS_ARCHITECTURE_RULES,
      ruleDescriptions: {
        'raw-css-in-sfc': '<style> sin atributo lang="scss"',
        'scss-deep-selector-abuse': 'Abuso o anidamiento de :deep()',
        'non-standard-spacing-unit': 'Espaciado arbitrario sin escala',
        'missing-theme-token-usage': 'Color hardcodeado sin token de tema',
        'excessive-scss-nesting': 'Anidamiento SCSS superior a 3 niveles'
      },
      ruleCapabilities: createUniformRuleCapabilities(SCSS_ARCHITECTURE_RULES, LINT_RULE_CAPABILITIES),
      projectRoot: effectiveRoot,
      coverage: deriveCoverageFromRoots(targetRoots, SCANNABLE_EXTS, effectiveRoot)
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
          this.auditMissingThemeTokenUsage(relPath, block.content, block.startLine);
        });
        this.runSubAuditorSync('excessive-scss-nesting', () => {
          this.auditExcessiveScssNesting(relPath, block.content, block.startLine);
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
        this.auditMissingThemeTokenUsage(relPath, content, 1);
      });
      this.runSubAuditorSync('excessive-scss-nesting', () => {
        this.auditExcessiveScssNesting(relPath, content, 1);
      });
    }
  }

  private extractStyleBlocks(content: string): Array<{ content: string; startLine: number }> {
    const blocks: Array<{ content: string; startLine: number }> = [];
    const styleRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    let match: RegExpExecArray | null;
    while ((match = styleRegex.exec(content)) !== null) {
      const before = content.slice(0, match.index);
      const startLine = before.split('\n').length;
      blocks.push({ content: match[1] ?? '', startLine });
    }
    return blocks;
  }

  private auditRawCssInSfc(relPath: string, content: string): void {
    if (content.includes('raw-css-ok')) return;
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
          message: 'Bloque <style> en componente SFC sin atributo lang="scss" mandatorio',
          file: relPath,
          line
        });
      }
    }
  }

  private auditScssDeepSelectorAbuse(relPath: string, content: string, lineOffset: number = 1): void {
    if (content.includes('deep-selector-ok')) return;

    // 1. Detect nested :deep() e.g. :deep(...) :deep(...)
    const nestedDeepRegex = /:deep\([^)]*\)[^{};]*:deep\(/g;
    let nestedMatch: RegExpExecArray | null;
    while ((nestedMatch = nestedDeepRegex.exec(content)) !== null) {
      const line = lineOffset + this.getLineNumber(content, nestedMatch.index) - 1;
      this.addViolation({
        ruleId: 'scss-deep-selector-abuse',
        severity: 'error',
        message: 'Uso de selector :deep() anidado dentro de otro :deep() en la misma regla',
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
          message: `Cadena de selectores excesivamente compleja dentro de :deep() (${parts.length} selectores > 3)`,
          file: relPath,
          line
        });
      }
    }
  }

  private auditNonStandardSpacingUnit(relPath: string, content: string, lineOffset: number = 1): void {
    if (content.includes('spacing-unit-ok')) return;

    // Detect arbitrary odd pixel values like 11px, 13px, 15px, 17px, 19px, 21px, 23px, 27px in spacing
    const arbitrarySpacingRegex = /(?:margin(?:-(?:top|bottom|left|right|inline|block))?|padding(?:-(?:top|bottom|left|right|inline|block))?|gap|row-gap|column-gap)\s*:[^;]*?\b(1[13579]|2[13579]|3[13579]|7|9|13|17|23|27)px\b/gi;
    let match: RegExpExecArray | null;
    while ((match = arbitrarySpacingRegex.exec(content)) !== null) {
      const line = lineOffset + this.getLineNumber(content, match.index) - 1;
      const val = match[1]!;
      this.addViolation({
        ruleId: 'non-standard-spacing-unit',
        severity: 'error',
        message: `Valor de espaciado arbitrario (${val}px) fuera de escala estándar o sin token de diseño`,
        file: relPath,
        line
      });
    }
  }

  private auditMissingThemeTokenUsage(relPath: string, content: string, lineOffset: number = 1): void {
    if (content.includes('theme-token-ok')) return;

    // Detect hardcoded hex colors or rgb(...) in color properties without var(--...)
    const hardcodedColorRegex = /(?:color|background-color|background|border-color|fill|stroke)\s*:\s*([^;{}]*)/gi;
    let match: RegExpExecArray | null;
    while ((match = hardcodedColorRegex.exec(content)) !== null) {
      const val = match[1] ?? '';
      if (val.includes('var(') || val.includes('$') || val.includes('transparent') || val.includes('currentColor') || val.includes('inherit')) {
        continue;
      }
      const hasHex = /#[0-9a-f]{3,8}\b/i.test(val);
      const hasRgb = /\brgba?\([^)]+\)/.test(val);
      if (hasHex || hasRgb) {
        const line = lineOffset + this.getLineNumber(content, match.index) - 1;
        this.addViolation({
          ruleId: 'missing-theme-token-usage',
          severity: 'error',
          message: 'Color hexadecimal o rgb hardcodeado sin utilizar variable o token del sistema de diseño',
          file: relPath,
          line
        });
      }
    }
  }

  private auditExcessiveScssNesting(relPath: string, content: string, lineOffset: number = 1): void {
    if (content.includes('scss-nesting-ok')) return;

    const lines = content.split('\n');
    let depth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();

      // Check for opening brace in selector rule (exclude at-rules like @media, @include, @keyframes, @supports, etc.)
      const openMatches = trimmed.match(/\{/g) ?? [];
      const closeMatches = trimmed.match(/\}/g) ?? [];

      for (const _ of openMatches) {
        if (!trimmed.startsWith('@')) {
          depth++;
          if (depth > 3) {
            this.addViolation({
              ruleId: 'excessive-scss-nesting',
              severity: 'error',
              message: `Anidamiento SCSS excesivo (${depth} niveles > 3); aplanar selectores con BEM o clases semánticas`,
              file: relPath,
              line: lineOffset + i
            });
          }
        }
      }

      for (const _ of closeMatches) {
        depth = Math.max(0, depth - 1);
      }
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateScssArchitectureAuditor());
