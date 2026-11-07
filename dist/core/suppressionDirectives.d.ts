/**
 * packages/auditor/src/core/suppressionDirectives.ts
 *
 * Centralized registry and matcher for forbidden ESLint directives
 * and prohibited linter/type suppressions across static analyzers and Oxlint plugins.
 */
export declare const FORBIDDEN_ESLINT_DIRECTIVE_PATTERN: RegExp;
export declare const FORBIDDEN_LINTER_SUPPRESSION_PATTERN: RegExp;
export declare function buildEslintDirectiveMessage(directive: string): string;
export declare function buildSuppressionDirectiveMessage(directive: string): string;
export declare const FORBIDDEN_SUPPRESSION_MESSAGE = "Linter/type suppression directive detected. Suppressing rules is strictly prohibited by architecture. Refactor the code cleanly.";
export interface SuppressionMatch {
  readonly type: 'eslint' | 'suppression';
  readonly match: string;
  readonly line: number;
  readonly message: string;
}
/**
 * Calculates 1-based line number for a character offset in text.
 */
export declare function offsetToLine(content: string, offset: number): number;
/**
 * Strips string literals preserving original character offsets and line breaks.
 */
export declare function stripStringLiteralsPreservingOffsets(content: string): string;
/**
 * Finds all forbidden ESLint directives and linter suppressions in text.
 * Accurately calculates line numbers even for multiline block comments.
 * Automatically strips string literals preserving offsets to eliminate false positives in tests and constants.
 */
export declare function findForbiddenSuppressions(content: string, options?: {
  readonly stripStrings?: boolean;
}): readonly SuppressionMatch[];