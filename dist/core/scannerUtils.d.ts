/**
 * packages/auditor/src/core/scannerUtils.ts
 *
 * Lightweight lexical scanning utilities for advancing past strings, comments, and balanced delimiters.
 */
/**
 * Advances the index past a string literal ('...', "...", `...`) or a comment (//..., /*...*\/).
 * Returns the index immediately following the string or comment, or the original index if not at one.
 */
export declare function advancePastStringOrComment(content: string, index: number, limit: number): number;
export interface BalancedBraceResult {
    readonly end: number;
    readonly depth: number;
}
export interface BalancedParenResult {
    readonly end: number;
    readonly depth: number;
}
/**
 * Scans content starting from `startIndex` up to `limit` tracking `{` and `}` depth,
 * skipping comments and string literals.
 */
export declare function scanBalancedBraces(content: string, startIndex: number, limit?: number, initialDepth?: number, stopPrefix?: string): BalancedBraceResult;
/**
 * Scans content starting from `startIndex` up to `limit` tracking `(` and `)` depth,
 * skipping comments and string literals.
 */
export declare function scanBalancedParens(content: string, startIndex: number, limit?: number, initialDepth?: number, stopPrefix?: string): BalancedParenResult;
/**
 * Strips line (//...) and block (/*...*\/) comments from code,
 * preserving string literals ('...', "...", `...`).
 * Preserves newlines within block comments so line numbers remain aligned.
 */
export declare function stripComments(content: string): string;
/**
 * Strips comments and replaces string literal contents with empty strings,
 * leaving only syntax structure.
 */
export declare function stripCommentsAndStrings(content: string): string;
export declare const DEFAULT_FUNCTION_PARAMS_MAX_DISTANCE = 600;
/**
 * Backwards lexical check determining if a position in content is inside function parameter parentheses.
 */
export declare function isPositionInsideFunctionParams(content: string, position: number, maxDistance?: number): boolean;
export interface HasPrecedingCommentOptions {
    /** Maximum number of non-empty lines to inspect backwards. Defaults to 10. */
    readonly maxLookbackLines?: number;
    /** Whether empty or whitespace-only lines are ignored during lookback. Defaults to true. */
    readonly ignoreEmptyLines?: boolean;
}
export declare const DEFAULT_COMMENT_LOOKBACK_LINES = 10;
/**
 * Checks if the current line or any preceding lines contain a comment matching `directiveRegex`.
 * Useful for multiline constructs in TypeScript or Vue SFC templates where a directive or suppression
 * comment (e.g. `<!-- ui-branching-ok: ... -->` or `// layout-ok: ...`) is placed above a multiline tag.
 *
 * @param lines Array of code lines.
 * @param lineIndex 0-indexed line number of the target statement or tag.
 * @param directiveRegex Regular expression to match against comment lines.
 * @param options Lookback configuration (default: 10 lines, ignoring empty lines).
 */
export declare function hasPrecedingComment(lines: readonly string[], lineIndex: number, directiveRegex: RegExp, options?: HasPrecedingCommentOptions): boolean;
//# sourceMappingURL=scannerUtils.d.ts.map