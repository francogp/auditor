/**
 * src/analyzers/nativePaths/detectors/normalizeDetector.ts
 *
 * homebrew-path-manipulation: manual separator swapping, slash de-duplication,
 * trailing/leading slash trimming, `./` stripping and character-class sanitizing
 * instead of `path.normalize()`, `path.posix` or `split(path.sep).join(path.posix.sep)`.
 */

import ts from 'typescript';

import type { NativePathDetector, NativePathScanContext } from '../nativePathTypes.ts';
import {
  WIN_SEP,
  POSIX_SEP,
  asMethodCall,
  getRegexInfo,
  getStringValue,
  isPathish,
  isSepConstant,
  isSeparatorOnly,
  isUrlish,
  unwrapExpression,
  type MethodCall,
  type RegexLiteralInfo
} from '../pathHeuristics.ts';

const NORMALIZE_MESSAGE =
  "Homebrew normalization of separators or path segments. Use 'path.normalize()', 'path.posix.normalize()', or native conversion 'p.split(path.sep).join(path.posix.sep)' / 'p.replaceAll(path.win32.sep, path.posix.sep)'.";

const DOT_SLASH_PATTERNS: ReadonlySet<string> = new Set([
  WIN_SEP + '.' + WIN_SEP + POSIX_SEP,
  WIN_SEP + '.' + WIN_SEP + POSIX_SEP + '+'
]); // runtime-set: O(1) lookup of `\.\/` and `\.\/+`

function isSeparatorPayload(expr: ts.Expression | undefined): boolean {
  if (!expr) return false;
  const value = getStringValue(expr);
  return value !== undefined && isSeparatorOnly(value);
}

function isEmptyString(expr: ts.Expression | undefined): boolean {
  return expr !== undefined && getStringValue(expr) === '';
}

function isSeparatorRegex(info: RegexLiteralInfo): boolean {
  return !info.hasOtherToken && (info.hasBackslashToken || info.hasSlashToken);
}

/** `\\/` and `\\\\` replacements escape a separator (regex/string escaping), they do not normalize paths. */
function isEscapeReplacement(value: string): boolean {
  return value === WIN_SEP + POSIX_SEP || value === WIN_SEP + WIN_SEP;
}

interface SeparatorSwapTarget {
  readonly hasBackslashToken: boolean;
  readonly hasSlashToken: boolean;
}

function isSeparatorSwap(target: SeparatorSwapTarget, replacement: string): boolean {
  if (!isSeparatorOnly(replacement) || isEscapeReplacement(replacement)) return false;
  if (target.hasBackslashToken) return replacement.includes(POSIX_SEP);
  return target.hasSlashToken && replacement.includes(WIN_SEP);
}

function checkRegexReplace(info: RegexLiteralInfo, mc: MethodCall, ctx: NativePathScanContext): boolean {
  const replacementNode = mc.call.arguments[1];
  const replacement = replacementNode ? getStringValue(replacementNode) : undefined;
  if (isSeparatorRegex(info) && replacement !== undefined) {
    if (isSeparatorSwap(info, replacement)) return true;
    const isDedupe = info.hasSlashToken && !info.hasBackslashToken && replacement === POSIX_SEP;
    if (isDedupe && (info.pattern.includes('+') || info.pattern.includes('{'))) return true;
    if (replacement === '' && info.hasAnchor && !isUrlish(mc.receiver)) return true;
  }
  if (DOT_SLASH_PATTERNS.has(info.pattern) && isEmptyString(replacementNode)) return true;
  return (
    info.pattern.startsWith('[^') &&
    isEmptyString(replacementNode) &&
    isPathish(mc.receiver, ctx.pathOriginNames)
  );
}

function checkReplace(mc: MethodCall, ctx: NativePathScanContext): boolean {
  if (mc.method !== 'replace' && mc.method !== 'replaceAll') return false;
  const [pattern, replacement] = mc.call.arguments;
  if (!pattern) return false;
  const info = getRegexInfo(pattern);
  if (info) return checkRegexReplace(info, mc, ctx);
  const value = getStringValue(pattern);
  const replacementValue = replacement ? getStringValue(replacement) : undefined;
  if (value === undefined || replacementValue === undefined || !isSeparatorOnly(value)) return false;
  return isSeparatorSwap(
    { hasBackslashToken: value.includes(WIN_SEP), hasSlashToken: value.includes(POSIX_SEP) },
    replacementValue
  );
}

function isSeparatorArg(expr: ts.Expression | undefined): 'literal' | 'constant' | undefined {
  if (!expr) return undefined;
  if (isSepConstant(expr)) return 'constant';
  return isSeparatorPayload(expr) ? 'literal' : undefined;
}

/** `.split(a).join(b)` and `.split(a).filter(...).join(b)` with at least one literal separator. */
function checkSplitJoin(mc: MethodCall, ctx: NativePathScanContext): boolean {
  if (mc.method !== 'join') return false;
  const joinKind = isSeparatorArg(mc.call.arguments[0]);
  if (!joinKind) return false;
  let inner = asMethodCall(unwrapExpression(mc.receiver));
  if (inner?.method === 'filter') inner = asMethodCall(unwrapExpression(inner.receiver));
  if (inner?.method !== 'split') return false;
  const splitKind = isSeparatorArg(inner.call.arguments[0]);
  if (!splitKind || (splitKind === 'constant' && joinKind === 'constant')) return false;
  ctx.claimed.add(inner.call);
  return true;
}

export const normalizeDetector: NativePathDetector = (node, ctx) => {
  const mc = asMethodCall(node);
  if (!mc || ctx.claimed.has(node)) return null;
  const matched = checkSplitJoin(mc, ctx) || checkReplace(mc, ctx);
  return matched ? { ruleId: 'homebrew-path-manipulation', node, message: NORMALIZE_MESSAGE } : null;
};
