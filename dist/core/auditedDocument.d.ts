/**
 * packages/auditor/src/core/auditedDocument.ts
 *
 * CENTRAL AUDITED DOCUMENT ENGINE (Node.js 26+ Native)
 *
 * Provides a high-performance, immutable abstraction for scanned source files:
 * 1. O(log N) line and column resolution via binary search over pre-computed line offsets.
 * 2. Lexical indexing for comments (line, block, HTML) and strings with O(log K) range lookup.
 * 3. Pre-computed escape hatch indexer supporting rule-specific directives (// <rule>-ok:),
 *    file-level suppressions (// auditor-disable <rule>), and common short aliases.
 * 4. Canonical Vue Single-File Component (SFC) extraction for <script>, <template>, and <style>.
 * 5. Transparent TypeScript AST generation with line-offset preservation for SFC scripts.
 * 6. Deterministic auto-fix replacement register applying non-overlapping transformations from end-to-start.
 */
import ts from 'typescript';
import type { SharedAstContext } from './astContext.ts';
export interface LineColumnPosition {
    readonly line: number;
    readonly column: number;
    readonly lineText: string;
}
export type LexicalRangeKind = 'comment_line' | 'comment_block' | 'comment_html' | 'string_single' | 'string_double' | 'string_template';
export interface LexicalRange {
    readonly start: number;
    readonly end: number;
    readonly kind: LexicalRangeKind;
}
export interface VueScriptBlock {
    readonly start: number;
    readonly end: number;
    readonly contentStart: number;
    readonly contentEnd: number;
    readonly tagLine: number;
    readonly startLine: number;
    readonly content: string;
    readonly isSetup: boolean;
    readonly lang?: string;
}
export interface VueTemplateBlock {
    readonly start: number;
    readonly end: number;
    readonly contentStart: number;
    readonly contentEnd: number;
    readonly tagLine: number;
    readonly startLine: number;
    readonly content: string;
}
export interface VueStyleBlock {
    readonly start: number;
    readonly end: number;
    readonly contentStart: number;
    readonly contentEnd: number;
    readonly tagLine: number;
    readonly startLine: number;
    readonly content: string;
    readonly scoped: boolean;
    readonly lang?: string;
}
export interface VueSfcBlocks {
    readonly scripts: readonly VueScriptBlock[];
    readonly template?: VueTemplateBlock;
    readonly styles: readonly VueStyleBlock[];
}
export interface DocumentReplacement {
    readonly start: number;
    readonly end: number;
    readonly newText: string;
    readonly ruleId?: string;
    readonly description?: string;
}
export interface EscapeHatchMatch {
    readonly line: number;
    readonly rawText: string;
    readonly ruleToken: string;
    readonly reason?: string;
}
export declare class AuditedDocument {
    readonly filePath: string;
    readonly relPath: string;
    readonly rawContent: string;
    readonly lines: readonly string[];
    readonly lineOffsets: readonly number[];
    private readonly astContext?;
    private cachedAst?;
    private cachedLexicalRanges?;
    private cachedVueBlocks?;
    private cachedEscapeHatches?;
    private readonly fileDisabledRules;
    private readonly replacements;
    constructor(filePath: string, rawContent: string, relPath?: string, astContext?: SharedAstContext);
    /**
     * Retrieves 1-indexed line and column with full lineText via O(log N) binary search.
     */
    getLineAndColumn(offset: number): LineColumnPosition;
    /**
     * Returns character offset given 1-indexed line and column numbers.
     */
    getOffset(line: number, column?: number): number;
    /**
     * Computes or returns cached sorted lexical ranges for comments and strings.
     */
    getLexicalRanges(): readonly LexicalRange[];
    /**
     * Checks whether an offset falls inside a comment (//, /* *\/, or <!-- -->).
     */
    isInsideComment(offset: number): boolean;
    /**
     * Checks whether an offset falls inside a string literal ('', "", or ``).
     */
    isInsideString(offset: number): boolean;
    /**
     * Checks whether an offset falls inside any comment or string literal.
     */
    isInsideCommentOrString(offset: number): boolean;
    /**
     * Advances past any comment or string starting at offset. Returns offset if not at a comment or string.
     */
    advancePastCommentOrString(offset: number): number;
    /**
     * Returns pre-indexed escape hatches and file disable directives.
     */
    getEscapeHatches(): readonly EscapeHatchMatch[];
    /**
     * Determines whether an escape hatch suppresses the specified rule at the given line or offset.
     */
    hasEscapeHatch(lineOrOffset: number, ruleId: string): boolean;
    /**
     * Convenience helper to check escape hatch at a specific character offset.
     */
    hasEscapeHatchAtOffset(offset: number, ruleId: string): boolean;
    /**
     * Extracts Vue Single-File Component blocks (<script>, <template>, <style>).
     */
    getVueBlocks(): VueSfcBlocks | undefined;
    /**
     * Resolves 1-indexed line and column for a TypeScript AST node.
     * Handles both standard TS files and Vue SFC script blocks transparently.
     */
    getNodeLineAndColumn(node: ts.Node, ast?: ts.SourceFile): LineColumnPosition;
    /**
     * Returns a cached TypeScript AST for this document.
     * If SharedAstContext is available, delegates to it. Otherwise parses on-demand.
     * For Vue SFCs, pads lines before script blocks with newlines so AST line numbers align 1-to-1.
     */
    getAst(): ts.SourceFile | undefined;
    /**
     * Registers a code replacement for auto-repair.
     */
    registerFix(replacement: DocumentReplacement): void;
    /**
     * Returns true if one or more auto-fixes have been registered.
     */
    hasFixes(): boolean;
    /**
     * Returns the count of registered fixes.
     */
    getFixCount(): number;
    /**
     * Applies all registered replacements sorted descending by start offset to prevent index shifts.
     */
    getTransformedContent(): string;
    /**
     * Writes transformed content back to the physical file on disk.
     */
    applyFixesToFile(): boolean;
}
//# sourceMappingURL=auditedDocument.d.ts.map