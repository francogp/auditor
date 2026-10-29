/**
 * src/analyzers/scssModernAnalyzer.ts
 *
 * AST-DRIVEN MODERN CSS / SCSS ARCHITECTURE ANALYZER (Node.js 26+ Native)
 *
 * Parses CSS/SCSS stylesheets and Vue <style> blocks into a recursive rule and
 * declaration AST using canonical lexical scanners (`advancePastStringOrComment`,
 * `scanBalancedBraces`) and `postcss-value-parser`, with surgical auto-fixes
 * powered by MagicString.
 */
export declare const MODERN_SCSS_RULES: readonly ["scss-viewport-overflow-and-dvh", "scss-overflow-clip-margin-trap", "scss-prefer-user-invalid", "scss-focus-outline-removal", "typography-unclamped-viewport-font", "scss-flexbox-dead-properties", "scss-universal-expensive-selectors", "dark-mode-color-scheme-missing"];
export type ModernScssRuleId = (typeof MODERN_SCSS_RULES)[number];
export interface ModernScssFinding {
  readonly ruleId: ModernScssRuleId;
  readonly line: number;
  readonly message: string;
  readonly fixable: boolean;
}
export interface ModernScssAnalysisResult {
  readonly findings: readonly ModernScssFinding[];
  readonly fixedContent?: string;
}
export interface ScssAstDeclaration {
  readonly prop: string;
  readonly value: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly valueStartOffset: number;
  readonly valueEndOffset: number;
  readonly line: number;
}
export interface ScssAstRuleNode {
  readonly selector: string;
  readonly isAtRule: boolean;
  readonly selectorStartOffset: number;
  readonly selectorEndOffset: number;
  readonly bodyStartOffset: number;
  readonly bodyEndOffset: number;
  readonly line: number;
  readonly declarations: readonly ScssAstDeclaration[];
  readonly children: readonly ScssAstRuleNode[];
}
export declare function parseScssBlockNodes(content: string, start: number, end: number, lineOffsets: readonly number[]): {
  declarations: ScssAstDeclaration[];
  children: ScssAstRuleNode[];
};
export declare function analyzeModernScss(styleContent: string, lineOffset: number, enableFix: boolean): ModernScssAnalysisResult;