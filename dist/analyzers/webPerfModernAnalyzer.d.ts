/**
 * src/analyzers/webPerfModernAnalyzer.ts
 *
 * AST-DRIVEN CORE WEB VITALS & FRONTEND PERFORMANCE ANALYZER (Node.js 26+ Native)
 *
 * Inspects HTML / Vue <template> DOM trees via JSDOM (`includeNodeLocations: true`)
 * and CSS / SCSS AST blocks via `parseScssBlockNodes`, providing deterministic
 * auto-repairs via MagicString.
 */
export declare const MODERN_WEB_PERF_RULES: readonly ["perf-lcp-lazy-conflict", "perf-font-preload-crossorigin", "perf-srcset-missing-sizes", "perf-content-visibility-intrinsic-size"];
export type ModernWebPerfRuleId = (typeof MODERN_WEB_PERF_RULES)[number];
export interface ModernWebPerfFinding {
  readonly ruleId: ModernWebPerfRuleId;
  readonly line: number;
  readonly message: string;
  readonly fixable: boolean;
}
export interface ModernWebPerfAnalysisResult {
  readonly findings: readonly ModernWebPerfFinding[];
  readonly fixedContent?: string;
}
export declare function analyzeModernWebPerfMarkup(markupContent: string, lineOffset: number, enableFix: boolean): ModernWebPerfAnalysisResult;
export declare function analyzeModernWebPerfStyles(styleContent: string, lineOffset: number, enableFix: boolean): ModernWebPerfAnalysisResult;