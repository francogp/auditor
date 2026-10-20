/**
 * src/analyzers/nativePaths/detectors/containmentDetector.ts
 *
 * homebrew-path-containment: hand-rolled CWE-22 guards — `includes('..')`,
 * prefix checks with `startsWith(base)`, `startsWith('..')` without `path.isAbsolute`,
 * traversal-stripping regexes, drive/UNC regexes and `new RegExp('^' + base + '/')` —
 * instead of `path.relative()` + `path.isAbsolute()` (or `isPathContained()`).
 */

import ts from 'typescript';

import type { NativePathDetector, NativePathScanContext } from '../nativePathTypes.ts';
import {
  PARENT_SEGMENT,
  POSIX_SEP,
  WIN_SEP,
  asMethodCall,
  collectStringFragments,
  flattenPlusChain,
  getNodePathFunction,
  getRegexInfo,
  getStringValue,
  getTemplateTexts,
  hasTraversalToken,
  isDriveLetterRegex,
  isPathFragment,
  isPathish,
  isRegExpConstruction,
  isSepConstant,
  isSeparatorOnly,
  isUrlish,
  unwrapExpression,
  REGEX_CONSUMER_METHODS,
  type MethodCall
} from '../pathHeuristics.ts';

const CONTAINMENT_MESSAGE =
  "Validación casera de contención de rutas (CWE-22). Resuelve con 'path.resolve()' y valida con 'const rel = path.relative(base, target); !rel.startsWith(\"..\") && !path.isAbsolute(rel)' (o 'isPathContained()').";

const TRAVERSAL_LITERALS: ReadonlySet<string> = new Set([
  PARENT_SEGMENT,
  PARENT_SEGMENT + POSIX_SEP,
  PARENT_SEGMENT + WIN_SEP
]); // runtime-set: O(1) lookup of `..`, `../`, `..\`

function firstArgValue(mc: MethodCall): string | undefined {
  const arg = mc.call.arguments[0];
  return arg ? getStringValue(arg) : undefined;
}

function containsIsAbsoluteCall(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const fn = getNodePathFunction(n.expression);
      const name = ts.isIdentifier(n.expression) ? n.expression.text : fn?.fn;
      if (name === 'isAbsolute') {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** Walks up through `!`, parentheses and `&&`/`||` chains to the full logical condition. */
function getLogicalRoot(node: ts.Node): ts.Node {
  let current = node;
  for (;;) {
    const parent = current.parent;
    const isLogical =
      ts.isBinaryExpression(parent) &&
      (parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        parent.operatorToken.kind === ts.SyntaxKind.BarBarToken);
    if (ts.isParenthesizedExpression(parent) || ts.isPrefixUnaryExpression(parent) || isLogical) {
      current = parent;
    } else {
      return current;
    }
  }
}

function isPathPrefixArgument(arg: ts.Expression, ctx: NativePathScanContext): boolean {
  const node = unwrapExpression(arg);
  if (ts.isTemplateExpression(node)) {
    return getTemplateTexts(node).some(isPathFragment) && node.templateSpans.some((s) => isPathish(s.expression, ctx.pathOriginNames));
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const ops = flattenPlusChain(node);
    const hasSep = ops.some((op) => isSepConstant(op) || isSeparatorOnly(getStringValue(op) ?? ''));
    return hasSep && ops.some((op) => isPathish(op, ctx.pathOriginNames));
  }
  return false;
}

function checkStartsWith(mc: MethodCall, ctx: NativePathScanContext): boolean {
  if (mc.method !== 'startsWith') return false;
  const arg = mc.call.arguments[0];
  if (!arg) return false;
  const value = getStringValue(arg);
  if (value !== undefined) {
    return TRAVERSAL_LITERALS.has(value) && !containsIsAbsoluteCall(getLogicalRoot(mc.call));
  }
  if (isPathPrefixArgument(arg, ctx)) return true;
  return isPathish(mc.receiver, ctx.pathOriginNames) && isPathish(arg, ctx.pathOriginNames);
}

function checkTraversalSearch(mc: MethodCall): boolean {
  if (mc.method !== 'includes' && mc.method !== 'indexOf') return false;
  const value = firstArgValue(mc);
  return value !== undefined && TRAVERSAL_LITERALS.has(value) && !isUrlish(mc.receiver);
}

function isExplicitPathTraversalRegex(pattern: string): boolean {
  if (pattern.toLowerCase().includes('%2e%2e')) return true;
  if (!hasTraversalToken(pattern)) return false;
  return (
    pattern.includes('/') ||
    pattern.includes('\\\\') ||
    pattern.includes('[\\/') ||
    pattern.includes('[\\/\\\\]')
  );
}

function checkRegexUsage(mc: MethodCall, ctx: NativePathScanContext): boolean {
  const isReplace = mc.method === 'replace' || mc.method === 'replaceAll';
  if (isReplace) {
    const [pattern, replacement] = mc.call.arguments;
    if (!pattern || !replacement || getStringValue(replacement) !== '') return false;
    const info = getRegexInfo(pattern);
    if (!info) return getStringValue(pattern) === PARENT_SEGMENT;
    return hasTraversalToken(info.pattern);
  }
  if (!REGEX_CONSUMER_METHODS.has(mc.method)) return false;
  const receiverInfo = getRegexInfo(unwrapExpression(mc.receiver));
  const argInfo = mc.call.arguments[0] ? getRegexInfo(mc.call.arguments[0]) : undefined;
  const info = receiverInfo ?? argInfo;
  if (!info) return false;
  if (isExplicitPathTraversalRegex(info.pattern) || isDriveLetterRegex(info.pattern)) return true;
  const target = receiverInfo ? mc.call.arguments[0] : mc.receiver;
  if (target && !isPathish(target, ctx.pathOriginNames)) return false;
  return hasTraversalToken(info.pattern);
}

function checkRegExpConstruction(node: ts.Node, ctx: NativePathScanContext): boolean {
  if (!isRegExpConstruction(node)) return false;
  const args = node.arguments ?? [];
  if (args.some((a) => collectStringFragments(a).some(hasTraversalToken))) return true;
  const first = args[0];
  if (!first) return false;
  const ops = flattenPlusChain(first);
  const head = getStringValue(ops[0]!);
  return (
    head !== undefined &&
    head.startsWith('^') &&
    ops.some((op) => isPathish(op, ctx.pathOriginNames)) &&
    ops.some((op) => isSeparatorOnly(getStringValue(op) ?? '') || isSepConstant(op))
  );
}

function checkParentSegmentComparison(node: ts.Node): boolean {
  if (!ts.isBinaryExpression(node)) return false;
  const kind = node.operatorToken.kind;
  const isEquality =
    kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
    kind === ts.SyntaxKind.EqualsEqualsToken ||
    kind === ts.SyntaxKind.ExclamationEqualsToken;
  return isEquality && (getStringValue(node.left) === PARENT_SEGMENT || getStringValue(node.right) === PARENT_SEGMENT);
}

export const containmentDetector: NativePathDetector = (node, ctx) => {
  let matched = checkRegExpConstruction(node, ctx) || checkParentSegmentComparison(node);
  if (!matched) {
    const mc = asMethodCall(node);
    matched = mc !== undefined && (checkStartsWith(mc, ctx) || checkTraversalSearch(mc) || checkRegexUsage(mc, ctx));
  }
  return matched ? { ruleId: 'homebrew-path-containment', node, message: CONTAINMENT_MESSAGE } : null;
};
