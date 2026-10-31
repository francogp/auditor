/**
 * src/analyzers/nativePaths/detectors/urlParsingDetector.ts
 *
 * homebrew-url-parsing: URLs and query strings parsed or assembled by hand
 * (`split('?' | '#' | '&')`, query regexes, scheme stripping, `path.join(baseUrl, …)`,
 * concatenation inside `new URL()`, legacy `url.parse()`) instead of `URL` / `URLSearchParams`.
 */

import ts from 'typescript';

import type { NativePathDetector, NativePathScanContext } from '../nativePathTypes.ts';
import {
  asMethodCall,
  getNodePathFunction,
  getRegexInfo,
  getStringValue,
  getTemplateTexts,
  flattenPlusChain,
  isPathFragment,
  isPathish,
  isUrlConstruction,
  isUrlish,
  unwrapExpression,
  REGEX_CONSUMER_METHODS,
  type MethodCall
} from '../pathHeuristics.ts';

const URL_PARSING_MESSAGE =
  "Homebrew parsing or manual assembly of URLs / query strings. Use native 'new URL(relative, base)', 'url.searchParams', 'URLSearchParams', and 'url.pathname' / 'url.hash'.";

const URL_DELIMITERS: ReadonlySet<string> = new Set(['?', '#', '&', '=']); // runtime-set: O(1) lookup
const QUERY_CLASS_TOKENS = ['[?&]', '[&?]', '[\\?&]', '[&\\?]'] as const;

function checkDelimiterSplit(mc: MethodCall): boolean {
  if (mc.method !== 'split') return false;
  const arg = mc.call.arguments[0];
  const value = arg ? getStringValue(arg) : undefined;
  return value !== undefined && URL_DELIMITERS.has(value) && isUrlish(mc.receiver);
}

function isQueryRegex(node: ts.Node | undefined): boolean {
  const info = node ? getRegexInfo(node) : undefined;
  return info !== undefined && QUERY_CLASS_TOKENS.some((t) => info.pattern.includes(t));
}

function checkRegexUsage(mc: MethodCall): boolean {
  const pattern = mc.call.arguments[0];
  if (mc.method === 'replace' || mc.method === 'replaceAll') {
    const info = pattern ? getRegexInfo(pattern) : undefined;
    return info !== undefined && info.pattern.startsWith('^http');
  }
  if (!REGEX_CONSUMER_METHODS.has(mc.method)) return false;
  if (isQueryRegex(unwrapExpression(mc.receiver)) || isQueryRegex(pattern)) return true;
  const info = pattern ? getRegexInfo(pattern) : undefined;
  return info !== undefined && info.hasSlashToken && isUrlish(mc.receiver);
}

function checkRegexDeclaration(node: ts.Node): boolean {
  return (
    ts.isVariableDeclaration(node) &&
    node.initializer !== undefined &&
    isQueryRegex(node.initializer)
  );
}

function checkPathJoinOnUrl(node: ts.Node, ctx: NativePathScanContext): boolean {
  if (!ts.isCallExpression(node)) return false;
  const fn = getNodePathFunction(node.expression);
  if (fn === undefined || (fn.fn !== 'join' && fn.fn !== 'resolve')) return false;
  return node.arguments.some((a) => isUrlish(a) && !isPathish(a, ctx.pathOriginNames));
}

function checkConcatInsideUrl(node: ts.Node): boolean {
  if (!isUrlConstruction(node)) return false;
  const first = node.arguments?.[0];
  if (!first) return false;
  const arg = unwrapExpression(first);
  if (ts.isTemplateExpression(arg)) return getTemplateTexts(arg).some(isPathFragment);
  if (!ts.isBinaryExpression(arg) || arg.operatorToken.kind !== ts.SyntaxKind.PlusToken)
    return false;
  return flattenPlusChain(arg).some((op) => isPathFragment(getStringValue(op) ?? ''));
}

const URL_MODULE_SPECIFIERS: ReadonlySet<string> = new Set(['url', 'node:url']); // runtime-set: O(1) lookup

function isRequireUrl(expr: ts.Expression): boolean {
  const node = unwrapExpression(expr);
  if (
    !ts.isCallExpression(node) ||
    !ts.isIdentifier(node.expression) ||
    node.expression.text !== 'require'
  ) {
    return false;
  }
  const specifier = node.arguments[0] ? getStringValue(node.arguments[0]) : undefined;
  return specifier !== undefined && URL_MODULE_SPECIFIERS.has(specifier);
}

function checkLegacyUrlParse(mc: MethodCall): boolean {
  if (mc.method !== 'parse') return false;
  const receiver = unwrapExpression(mc.receiver);
  return (ts.isIdentifier(receiver) && receiver.text === 'url') || isRequireUrl(receiver);
}

export const urlParsingDetector: NativePathDetector = (node, ctx) => {
  let matched =
    checkRegexDeclaration(node) || checkPathJoinOnUrl(node, ctx) || checkConcatInsideUrl(node);
  if (!matched) {
    const mc = asMethodCall(node);
    matched =
      mc !== undefined &&
      (checkDelimiterSplit(mc) || checkRegexUsage(mc) || checkLegacyUrlParse(mc));
  }
  return matched ? { ruleId: 'homebrew-url-parsing', node, message: URL_PARSING_MESSAGE } : null;
};
