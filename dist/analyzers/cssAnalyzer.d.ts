/**
 * packages/auditor/src/analyzers/cssAnalyzer.ts
 *
 * PURE TYPESCRIPT / POSTCSS AST CSS HYGIENE & DUPLICATION ANALYZER (Node.js 26+ Native)
 * Replaces legacy external Go binary (css-checker-kit) with 100% pure JavaScript/TypeScript AST.
 *
 * Capabilities:
 *   1. Duplicate Rules (css-duplicate-rules): Identical declaration bodies across different selectors.
 *   2. Similar Classes (css-similar-classes): Fuzzy property matching with configurable % threshold.
 *   3. Long Values (css-duplicate-long-lines): Complex repeated CSS values >= 20 chars without variables.
 *   4. Unvariabled Colors (css-unvariabled-colors): Raw HEX/RGB/HSL colors repeated across rules.
 *   5. Duplicate Selectors (css-duplicate-selectors): Same selector repeated in the same stylesheet.
 *   6. Empty Rules (css-empty-rules): Redundant CSS rules without declarations.
 *   7. Unused Classes (css-unused-classes): Selectors never referenced in template/JS files.
 */
import type { Violation, RuleDescriptor } from '../suites/architecture/audit_rules.ts';
export declare const CSS_ANALYZER_DESCRIPTOR: RuleDescriptor;
export interface CssDeclaration {
    readonly prop: string;
    readonly value: string;
    readonly raw: string;
    readonly line: number;
}
export interface ParsedCssRule {
    readonly file: string;
    readonly line: number;
    readonly selector: string;
    readonly declarations: readonly CssDeclaration[];
    readonly rawBlock: string;
    readonly scoped?: boolean;
}
export interface CachedFileCssEntry {
    readonly mtimeMs: number;
    readonly size: number;
    readonly rules: readonly ParsedCssRule[];
}
export interface CssAstCacheData {
    readonly version: number;
    readonly entries: Record<string, CachedFileCssEntry>;
}
export declare const CSS_CACHE_VERSION = 1;
export declare const DEFAULT_CSS_CACHE_FILE = "scratch/cache/css_ast_cache.json";
export interface DuplicateRuleOccurrence {
    readonly file: string;
    readonly line: number;
    readonly selector: string;
}
export interface DuplicateRuleGroup {
    readonly signature: string;
    readonly declarations: string[];
    readonly occurrences: DuplicateRuleOccurrence[];
}
export interface SimilarClassComparison {
    readonly similarity: number;
    readonly commonDeclarations: string[];
    readonly left: {
        readonly file: string;
        readonly line: number;
        readonly selector: string;
        readonly uniqueDeclarations: string[];
    };
    readonly right: {
        readonly file: string;
        readonly line: number;
        readonly selector: string;
        readonly uniqueDeclarations: string[];
    };
}
export interface LongValueOccurrence {
    readonly file: string;
    readonly line: number;
    readonly prop: string;
    readonly selector: string;
}
export interface LongValueGroup {
    readonly value: string;
    readonly length: number;
    readonly occurrences: LongValueOccurrence[];
}
export interface ColorOccurrence {
    readonly file: string;
    readonly line: number;
    readonly prop: string;
    readonly selector: string;
}
export interface ColorGroup {
    readonly color: string;
    readonly occurrences: ColorOccurrence[];
}
export interface DuplicateSelectorGroup {
    readonly selector: string;
    readonly file: string;
    readonly lines: number[];
}
export interface EmptyRuleRecord {
    readonly selector: string;
    readonly file: string;
    readonly line: number;
}
export interface UnusedClassRecord {
    readonly className: string;
    readonly file: string;
    readonly line: number;
}
export interface CssAnalysisDetails {
    readonly duplicates: DuplicateRuleGroup[];
    readonly similar: SimilarClassComparison[];
    readonly longValues: LongValueGroup[];
    readonly unvariabledColors: ColorGroup[];
    readonly duplicateSelectors: DuplicateSelectorGroup[];
    readonly emptyRules: EmptyRuleRecord[];
    readonly unusedClasses?: UnusedClassRecord[];
}
export interface CssAnalysisOptions {
    readonly minDeclarations?: number;
    readonly checkSimilar?: boolean;
    readonly similarityThreshold?: number;
    readonly checkLongLines?: boolean;
    readonly longLineLengthThreshold?: number;
    readonly checkColors?: boolean;
    readonly checkEmptyRules?: boolean;
    readonly checkDuplicateSelectors?: boolean;
}
export declare const DEFAULT_CSS_SIMILARITY_THRESHOLD = 80;
export declare const DEFAULT_CSS_LONG_LINE_THRESHOLD = 20;
export declare function extractClassNamesFromSelector(selector: string): string[];
export declare function extractCssBlocksFromVue(content: string): Array<{
    code: string;
    startLine: number;
    scoped: boolean;
}>;
export declare function parseCssContent(content: string, filePath: string, linePaddingCount?: number, scoped?: boolean): ParsedCssRule[];
export declare function clearInMemoryCssCache(): void;
export declare function getInMemoryCssCache(): ReadonlyMap<string, CachedFileCssEntry>;
export declare function loadCssAstCacheFromDisk(cacheFilePath: string): Promise<void>;
export declare function saveCssAstCacheToDisk(cacheFilePath: string): Promise<void>;
export declare function collectAllProjectCssRules(targetDir: string, ignoreDirs: ReadonlySet<string>, projectRoot?: string, options?: {
    readonly useCache?: boolean;
    readonly cacheFilePath?: string;
}): Promise<{
    rules: ParsedCssRule[];
    fileCount: number;
}>;
export declare function detectDuplicateRules(rules: readonly ParsedCssRule[], minDeclarations: number): DuplicateRuleGroup[];
export declare function detectSimilarClasses(rules: readonly ParsedCssRule[], thresholdPercent: number, minDeclarations?: number): SimilarClassComparison[];
export declare function detectLongValues(rules: readonly ParsedCssRule[], lengthThreshold: number): LongValueGroup[];
export declare function detectUnvariabledColors(rules: readonly ParsedCssRule[]): ColorGroup[];
export declare function detectDuplicateSelectors(rules: readonly ParsedCssRule[]): DuplicateSelectorGroup[];
export declare function detectEmptyRules(rules: readonly ParsedCssRule[]): EmptyRuleRecord[];
export type CssProgressCallback = (step: number, total: number, checkName: string, count: number) => void;
export declare function runCssAnalysis(targetDir: string | undefined, ignoreDirs: ReadonlySet<string>, options?: CssAnalysisOptions, projectRoot?: string, onProgress?: CssProgressCallback): Promise<{
    violations: Violation[];
    details: CssAnalysisDetails;
    filesScanned: number;
}>;
/**
 * Backward compatibility wrapper returning canonical Violation[]
 */
export declare function runCssChecker(targetDir: string | undefined, ignoreDirs: ReadonlySet<string>, options?: CssAnalysisOptions, projectRoot?: string): Promise<Violation[]>;
//# sourceMappingURL=cssAnalyzer.d.ts.map