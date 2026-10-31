/**
 * src/analyzers/nativePaths/detectors/concatDetector.ts
 *
 * unsafe-path-concat: filesystem paths assembled with `+`, `+=`, template literals
 * or `[...].join(separator)` instead of `path.join()` / `path.resolve()`.
 */

import ts from 'typescript';

import type { NativePathDetector, NativePathScanContext } from '../nativePathTypes.ts';
import {
  FILE_SCHEME,
  asMethodCall,
  flattenPlusChain,
  getExpressionName,
  getStringValue,
  getTemplateTexts,
  hasFileExtensionTail,
  isOutermostPlus,
  isInsideRegExpConstruction,
  isPathCollectionName,
  isPathFragment,
  isPathish,
  isSepConstant,
  isSeparatorOnly,
  isUrlConstruction,
  isUrlLikeName,
  startsWithUrlScheme,
  unwrapExpression
} from '../pathHeuristics.ts';

const CONCAT_MESSAGE =
  "Manually constructed path via string concatenation, template literal, or '[...].join(separator)'. Use 'path.join()' or 'path.resolve()' from 'node:path' passing each segment as an argument.";

const SEARCH_METHOD_NAMES: ReadonlySet<string> = new Set([
  'includes',
  'indexOf',
  'search',
  'startsWith',
  'endsWith'
]);
const DIAGNOSTIC_TEXT_PROPS: ReadonlySet<string> = new Set([
  'message',
  'description',
  'summary',
  'title'
]);

function isUrlOperand(expr: ts.Expression): boolean {
  const name = getExpressionName(expr);
  return name !== undefined && isUrlLikeName(name);
}

function isSeparatorOperand(expr: ts.Expression): boolean {
  if (isSepConstant(expr)) return true;
  const value = getStringValue(expr);
  return value !== undefined && (isSeparatorOnly(value) || isPathFragment(value));
}

function isExcludedLiteralChain(operands: readonly ts.Expression[]): boolean {
  const first = getStringValue(operands[0]!);
  if (
    first !== undefined &&
    (first.startsWith('^') ||
      startsWithUrlScheme(first) ||
      first.startsWith(FILE_SCHEME) ||
      first.startsWith('[') ||
      first.startsWith('('))
  ) {
    return true;
  }
  return operands.some((op) => {
    const v = getStringValue(op);
    return (
      v !== undefined &&
      (v.includes('url(') || v.includes('{') || v.includes(FILE_SCHEME) || v.includes('**'))
    );
  });
}

function isInsideSearchMethod(node: ts.Node): boolean {
  let cur: ts.Node = node;
  while (
    ts.isParenthesizedExpression(cur.parent) ||
    (ts.isBinaryExpression(cur.parent) && cur.parent.operatorToken.kind === ts.SyntaxKind.PlusToken)
  ) {
    cur = cur.parent;
  }
  if (ts.isCallExpression(cur.parent)) {
    const callee = cur.parent.expression;
    if (ts.isPropertyAccessExpression(callee)) {
      const name = callee.name.text;
      if (SEARCH_METHOD_NAMES.has(name)) {
        return true;
      }
    }
  }
  return false;
}

function isInsideModuleSpecifier(node: ts.Node): boolean {
  let child = node;
  let cur = node.parent;
  while (ts.isParenthesizedExpression(cur)) {
    child = cur;
    cur = cur.parent;
  }
  if (ts.isCallExpression(cur) && cur.arguments[0] === child) {
    const callee = cur.expression;
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'resolve') {
      const owner = unwrapExpression(callee.expression);
      if (
        (ts.isMetaProperty(owner) && owner.keywordToken === ts.SyntaxKind.ImportKeyword) ||
        (ts.isIdentifier(owner) && owner.text === 'require')
      ) {
        return true;
      }
    }
  }
  return false;
}

function isFirstArgOfUrlConstruction(node: ts.Node): boolean {
  let child: ts.Node = node;
  let parent = node.parent;
  while (ts.isParenthesizedExpression(parent)) {
    child = parent;
    parent = parent.parent;
  }
  return isUrlConstruction(parent) && parent.arguments?.[0] === child;
}

function checkPlusChain(node: ts.BinaryExpression, ctx: NativePathScanContext): boolean {
  if (
    isFirstArgOfUrlConstruction(node) ||
    isInsideRegExpConstruction(node) ||
    isInsideSearchMethod(node)
  )
    return false;
  const operands = flattenPlusChain(node);
  if (isExcludedLiteralChain(operands) || operands.some(isUrlOperand)) return false;
  return operands.some(
    (op, i) =>
      isSeparatorOperand(op) &&
      [operands[i - 1], operands[i + 1]].some(
        (n) => n !== undefined && isPathish(n, ctx.pathOriginNames)
      )
  );
}

function checkCompoundAssignment(node: ts.BinaryExpression, ctx: NativePathScanContext): boolean {
  if (node.operatorToken.kind !== ts.SyntaxKind.PlusEqualsToken) return false;
  if (!isPathish(node.left, ctx.pathOriginNames)) return false;
  const first = flattenPlusChain(node.right)[0];
  if (first !== undefined && isSeparatorOperand(first)) {
    ctx.claimed.add(unwrapExpression(node.right));
    return true;
  }
  return false;
}

function endsWithSeparator(text: string | undefined): boolean {
  return text !== undefined && text.length > 0 && isSeparatorOnly(text.at(-1)!);
}

function startsWithSeparator(text: string | undefined): boolean {
  return text !== undefined && text.length > 0 && isSeparatorOnly(text[0]!);
}

/** `./${rel}` only decorates an already-relative path for display; there is no native equivalent. */
function isRelativePrefixDecoration(node: ts.TemplateExpression): boolean {
  const head = node.head.text;
  return (
    node.templateSpans.length === 1 &&
    (head === './' || head === '../') &&
    node.templateSpans[0]!.literal.text === ''
  );
}

function isErrorConstructor(expr: ts.Expression): boolean {
  const node = unwrapExpression(expr);
  return (
    ts.isIdentifier(node) &&
    (node.text.endsWith('Error') || node.text === 'TypeError' || node.text === 'RangeError')
  );
}

function isMessageOrErrorContext(node: ts.Node): boolean {
  let parent = node.parent;
  while (ts.isParenthesizedExpression(parent)) parent = parent.parent;
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
    const prop = parent.name.text;
    if (DIAGNOSTIC_TEXT_PROPS.has(prop)) {
      return true;
    }
  }
  if (ts.isNewExpression(parent) && isErrorConstructor(parent.expression)) {
    return true;
  }
  return false;
}

function checkTemplate(node: ts.TemplateExpression, ctx: NativePathScanContext): boolean {
  if (
    ts.isTaggedTemplateExpression(node.parent) ||
    isRelativePrefixDecoration(node) ||
    isInsideModuleSpecifier(node) ||
    isMessageOrErrorContext(node)
  ) {
    return false;
  }
  const texts = getTemplateTexts(node);
  if (texts.some((t) => t.includes('**'))) return false;
  const head = texts[0] ?? '';
  if (
    head.startsWith('/') ||
    startsWithUrlScheme(head) ||
    head.startsWith(FILE_SCHEME) ||
    head.startsWith('[') ||
    head.startsWith('(')
  ) {
    return false;
  }
  if (isFirstArgOfUrlConstruction(node) || isInsideRegExpConstruction(node)) return false;
  const spans = node.templateSpans.map((s) => s.expression);
  if (spans.some(isUrlOperand) || !texts.some(isPathFragment)) return false;
  const hasExtensionTail = hasFileExtensionTail(texts.at(-1) ?? '');
  return spans.some(
    (e, i) =>
      (endsWithSeparator(texts[i]) || startsWithSeparator(texts[i + 1])) &&
      (isPathish(e, ctx.pathOriginNames) || hasExtensionTail)
  );
}

function checkArrayJoin(node: ts.Node, ctx: NativePathScanContext): boolean {
  const mc = asMethodCall(node);
  if (!mc || mc.method !== 'join' || mc.call.arguments.length !== 1) return false;
  const sepArg = mc.call.arguments[0]!;
  const sepValue = getStringValue(sepArg);
  const isSepArg = isSepConstant(sepArg) || (sepValue !== undefined && isSeparatorOnly(sepValue));
  if (!isSepArg) return false;
  const receiver = unwrapExpression(mc.receiver);
  if (ts.isArrayLiteralExpression(receiver)) {
    return (
      isSepConstant(sepArg) || receiver.elements.some((e) => isPathish(e, ctx.pathOriginNames))
    );
  }
  return (
    ts.isIdentifier(receiver) &&
    (isPathish(receiver, ctx.pathOriginNames) || isPathCollectionName(receiver.text))
  );
}

export const concatDetector: NativePathDetector = (node, ctx) => {
  if (ctx.claimed.has(node)) return null;
  let matched: boolean;
  if (isOutermostPlus(node)) matched = checkPlusChain(node, ctx);
  else if (ts.isBinaryExpression(node)) matched = checkCompoundAssignment(node, ctx);
  else if (ts.isTemplateExpression(node)) matched = checkTemplate(node, ctx);
  else matched = checkArrayJoin(node, ctx);
  return matched ? { ruleId: 'unsafe-path-concat', node, message: CONCAT_MESSAGE } : null;
};
