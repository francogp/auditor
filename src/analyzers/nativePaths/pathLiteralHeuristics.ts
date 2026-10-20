/**
 * src/analyzers/nativePaths/pathLiteralHeuristics.ts
 *
 * Pure AST predicates for literal nodes, string values, regex sources and templates.
 */

import path from 'node:path';
import ts from 'typescript';

export const POSIX_SEP = path.posix.sep;
export const WIN_SEP = path.win32.sep;

const URL_SCHEMES = ['http://', 'https://', 'ws://', 'wss://', 'ftp://', 'mailto:'] as const;

export function getStringValue(expr: ts.Node): string | undefined {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  return undefined;
}

function isSeparatorChar(ch: string): boolean {
  return ch === POSIX_SEP || ch === WIN_SEP;
}

function containsSeparator(value: string): boolean {
  return value.includes(POSIX_SEP) || value.includes(WIN_SEP);
}

export function isSeparatorOnly(value: string): boolean {
  return value.length > 0 && [...value].every(isSeparatorChar);
}

export function startsWithUrlScheme(value: string): boolean {
  const lower = value.trimStart().toLowerCase();
  return URL_SCHEMES.some((s) => lower.startsWith(s)) || lower.startsWith('//');
}

function hasWhitespace(value: string): boolean {
  return [...value].some((ch) => ch.trim() === '');
}

/**
 * A literal fragment that looks like a filesystem path piece: contains a separator,
 * no whitespace (human messages) and no URL scheme or CSS `url(`.
 */
export function isPathFragment(value: string): boolean {
  return (
    containsSeparator(value) &&
    !hasWhitespace(value) &&
    !startsWithUrlScheme(value) &&
    !value.includes('url(') &&
    !value.includes('://')
  );
}

function isAsciiLetter(ch: string | undefined): boolean {
  return ch !== undefined && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'));
}

function isAlnum(ch: string | undefined): boolean {
  return isAsciiLetter(ch) || (ch !== undefined && ch >= '0' && ch <= '9');
}

export function isDriveOrUncLiteral(value: string): boolean {
  const isDrive = value.length >= 3 && isAsciiLetter(value[0]) && value[1] === ':' && isSeparatorChar(value[2]!);
  const isUnc = value.startsWith(WIN_SEP + WIN_SEP) && isAlnum(value[2]);
  return isDrive || isUnc;
}

/** True when the text ends with `.ext` (1-5 alphanumerics) after the last separator. */
export function hasFileExtensionTail(value: string): boolean {
  const dot = value.lastIndexOf('.');
  if (dot <= 0 || dot === value.length - 1) return false;
  const ext = value.slice(dot + 1);
  if (ext.length > 5 || ![...ext].every((ch) => isAlnum(ch))) return false;
  const lastSep = Math.max(value.lastIndexOf(POSIX_SEP), value.lastIndexOf(WIN_SEP));
  return dot > lastSep;
}

export function getTemplateTexts(node: ts.TemplateExpression): string[] {
  return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
}

export function unwrapExpression(expr: ts.Expression): ts.Expression {
  let current = expr;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isAwaitExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/** Flattens a left-associative `a + b + c` chain into its operands. */
export function flattenPlusChain(expr: ts.Expression): ts.Expression[] {
  const node = unwrapExpression(expr);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return [...flattenPlusChain(node.left), ...flattenPlusChain(node.right)];
  }
  return [node];
}

export function isOutermostPlus(node: ts.Node): node is ts.BinaryExpression {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.PlusToken) {
    return false;
  }
  let parent = node.parent;
  while (ts.isParenthesizedExpression(parent)) parent = parent.parent;
  return !(ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.PlusToken);
}

// ─── Regex literal payload ──────────────────────────────────────────────────

export interface RegexLiteralInfo {
  readonly pattern: string;
  readonly flags: string;
  readonly hasBackslashToken: boolean;
  readonly hasSlashToken: boolean;
  readonly hasOtherToken: boolean;
  readonly hasAnchor: boolean;
}

const REGEX_STRUCTURAL_CHARS: ReadonlySet<string> = new Set([
  '+',
  '*',
  '[',
  ']',
  '{',
  '}',
  ',',
  '|',
  '(',
  ')',
  '?',
  ':',
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9'
]); // runtime-set: O(1) lookup of quantifier/grouping characters

function classifyRegexToken(token: string, info: { backslash: boolean; slash: boolean; other: boolean; anchor: boolean }): void {
  if (token === WIN_SEP + WIN_SEP) info.backslash = true;
  else if (token === WIN_SEP + POSIX_SEP || token === POSIX_SEP) info.slash = true;
  else if (token === '^' || token === '$') info.anchor = true;
  else if (!REGEX_STRUCTURAL_CHARS.has(token)) info.other = true;
}

/**
 * Splits a regex literal into pattern and flags and classifies its tokens
 * (escaped backslash, slash, anchors, anything else).
 */
export function getRegexInfo(node: ts.Node): RegexLiteralInfo | undefined {
  if (!ts.isRegularExpressionLiteral(node)) return undefined;
  const raw = node.text;
  const closing = raw.lastIndexOf(POSIX_SEP);
  const pattern = raw.slice(1, closing);
  const info = { backslash: false, slash: false, other: false, anchor: false };
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    const token = ch === WIN_SEP ? pattern.slice(i, i + 2) : ch;
    if (ch === WIN_SEP) i++;
    classifyRegexToken(token, info);
  }
  return {
    pattern,
    flags: raw.slice(closing + 1),
    hasBackslashToken: info.backslash,
    hasSlashToken: info.slash,
    hasOtherToken: info.other,
    hasAnchor: info.anchor
  };
}

/** Regex sources that encode a parent-directory traversal token (`\.\.`, `\.{2,}`, `%2e%2e`). */
export function hasTraversalToken(source: string): boolean {
  const escapedDot = WIN_SEP + '.';
  return (
    source.includes(escapedDot + escapedDot) ||
    source.includes(escapedDot + '{2') ||
    source.toLowerCase().includes('%2e%2e')
  );
}

/** Regex sources anchored on a Windows drive letter (`^[a-zA-Z]:`). */
export function isDriveLetterRegex(source: string): boolean {
  return source.startsWith('^[a-zA-Z]:') || source.startsWith('^[A-Za-z]:') || source.startsWith('^[a-z]:');
}

/** Collects every string fragment (cooked and raw) from RegExp constructor arguments. */
export function collectStringFragments(node: ts.Node, out: string[] = []): string[] {
  if (ts.isStringLiteral(node)) out.push(node.text);
  else if (ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.rawText ?? node.text);
  else if (ts.isTemplateExpression(node)) out.push(...getTemplateTexts(node));
  ts.forEachChild(node, (child) => {
    collectStringFragments(child, out);
  });
  return out;
}

export function isRegExpConstruction(node: ts.Node): node is ts.NewExpression | ts.CallExpression {
  return (
    (ts.isNewExpression(node) || ts.isCallExpression(node)) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'RegExp'
  );
}

export function isInsideRegExpConstruction(node: ts.Node): boolean {
  for (let cur: ts.Node | undefined = node.parent; cur && !ts.isStatement(cur); cur = cur.parent) {
    if (isRegExpConstruction(cur)) return true;
  }
  return false;
}

export function isUrlConstruction(node: ts.Node): node is ts.NewExpression {
  return ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL';
}
