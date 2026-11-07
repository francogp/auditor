/**
 * packages/auditor/src/core/suppressionDirectives.ts
 *
 * Centralized registry and matcher for forbidden ESLint directives
 * and prohibited linter/type suppressions across static analyzers and Oxlint plugins.
 */

export const FORBIDDEN_ESLINT_DIRECTIVE_PATTERN =
  /\/\*[\s*]*eslint-disable[\s\S]*?\*\/|\/\/\s*eslint-disable(?:-next-line|-line)?\b/g;

export const FORBIDDEN_LINTER_SUPPRESSION_PATTERN =
  /\/\*[\s*]*(?:oxlint-disable|@ts-ignore|@ts-nocheck)[\s\S]*?\*\/|\/\/\s*(?:oxlint-disable(?:-next-line|-line)?|@ts-ignore|@ts-nocheck|fallow-ignore-file)\b/g;

export function buildEslintDirectiveMessage(directive: string): string {
  return `ESLint directive detected ('${directive.trim()}'). ESLint is NOT used in this repository; all linting is performed exclusively by Oxlint (vp lint). ESLint directives are strictly prohibited.`;
}

export function buildSuppressionDirectiveMessage(directive: string): string {
  return `Linter/type suppression directive detected ('${directive.trim()}'). Suppressing rules is strictly prohibited by architecture. Refactor the code cleanly.`;
}

export const FORBIDDEN_SUPPRESSION_MESSAGE =
  'Linter/type suppression directive detected. Suppressing rules is strictly prohibited by architecture. Refactor the code cleanly.';

export interface SuppressionMatch {
  readonly type: 'eslint' | 'suppression';
  readonly match: string;
  readonly line: number;
  readonly message: string;
}

/**
 * Calculates 1-based line number for a character offset in text.
 */
export function offsetToLine(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) {
      line++;
    }
  }
  return line;
}

/**
 * Strips string literals preserving original character offsets and line breaks.
 */
export function stripStringLiteralsPreservingOffsets(content: string): string {
  return content.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`[\s\S]*?`/g, (match) =>
    match.replace(/[^\r\n]/g, ' ')
  );
}

/**
 * Finds all forbidden ESLint directives and linter suppressions in text.
 * Accurately calculates line numbers even for multiline block comments.
 * Automatically strips string literals preserving offsets to eliminate false positives in tests and constants.
 */
export function findForbiddenSuppressions(
  content: string,
  options: { readonly stripStrings?: boolean } = { stripStrings: true }
): readonly SuppressionMatch[] {
  const matches: SuppressionMatch[] = [];
  const textToScan =
    options.stripStrings !== false ? stripStringLiteralsPreservingOffsets(content) : content;

  const eslintRegex = new RegExp(FORBIDDEN_ESLINT_DIRECTIVE_PATTERN.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = eslintRegex.exec(textToScan)) !== null) {
    const raw = match[0];
    const line = offsetToLine(content, match.index);
    matches.push({
      type: 'eslint',
      match: raw,
      line,
      message: buildEslintDirectiveMessage(raw)
    });
  }

  const suppRegex = new RegExp(FORBIDDEN_LINTER_SUPPRESSION_PATTERN.source, 'g');
  while ((match = suppRegex.exec(textToScan)) !== null) {
    const raw = match[0];
    const line = offsetToLine(content, match.index);
    matches.push({
      type: 'suppression',
      match: raw,
      line,
      message: buildSuppressionDirectiveMessage(raw)
    });
  }

  return matches.sort((a, b) => a.line - b.line);
}
