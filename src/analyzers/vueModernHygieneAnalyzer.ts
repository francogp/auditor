/**
 * src/analyzers/vueModernHygieneAnalyzer.ts
 *
 * AST-DRIVEN VUE SFC IME & TEMPLATE PURITY ANALYZER (Node.js 26+ Native)
 *
 * Uses TypeScript Compiler AST (`SharedAstContext`) to detect:
 * 1. `ime-unsafe-enter-submit`: Enter key handlers that omit `!event.isComposing`
 *    guards, causing premature form/chat submission during CJK/mobile IME composition.
 * 2. `vue-template-no-side-effects`: In-place array mutations (`.sort()`, `.reverse()`,
 *    `.splice()`) or state assignments inside non-event Vue `<template>` bindings.
 */

import type { JSDOM } from 'jsdom';
import MagicString from 'magic-string';
import ts from 'typescript';

import { SharedAstContext } from '../core/astContext.ts';
import {
  computeRawLineOffsets,
  getLineFromRawOffsets,
  getRawSpanFromAstNode,
  runScriptAstMagicStringPass,
  parseDomWithLocations,
  getAttrLocation,
  type JsdomElementLocation
} from './modernDomAstUtils.ts';

export const MODERN_VUE_HYGIENE_RULES = [
  'ime-unsafe-enter-submit',
  'vue-template-no-side-effects'
] as const;

export type ModernVueHygieneRuleId = (typeof MODERN_VUE_HYGIENE_RULES)[number];

export interface ModernVueHygieneFinding {
  readonly ruleId: ModernVueHygieneRuleId;
  readonly line: number;
  readonly message: string;
  readonly context: string;
  readonly fixable: boolean;
}

export interface ModernVueHygieneAnalysisResult {
  readonly findings: readonly ModernVueHygieneFinding[];
  readonly fixedContent?: string;
}

const FRESH_ARRAY_PRODUCER_METHODS: ReadonlySet<string> = new Set([
  // runtime-set: Fast O(1) membership lookup set
  'slice',
  'concat',
  'filter',
  'map',
  'flat',
  'flatMap',
  'toSorted',
  'toReversed',
  'toSpliced',
  'keys',
  'values',
  'entries',
  'from',
  'split'
]);

const EVENT_PARAM_NAMES: ReadonlySet<string> = new Set([
  // runtime-set: Fast O(1) membership lookup set
  'e',
  'ev',
  'evt',
  'event',
  'keyEvent',
  'keyboardEvent'
]);

function isFreshCopyReceiver(expr: ts.Expression): boolean {
  let target = expr;
  while (ts.isParenthesizedExpression(target)) {
    target = target.expression;
  }

  // `[...items].sort()` is a fresh array literal copy
  if (ts.isArrayLiteralExpression(target)) {
    return true;
  }

  // `items.slice().sort()`, `items.filter(...).sort()`, `Object.values(x).sort()`, `Array.from(x).sort()`
  if (ts.isCallExpression(target)) {
    if (ts.isPropertyAccessExpression(target.expression)) {
      const methodName = target.expression.name.text;
      if (FRESH_ARRAY_PRODUCER_METHODS.has(methodName)) {
        return true;
      }
    }
  }

  return false;
}

function findEnclosingFunction(node: ts.Node): ts.FunctionLikeDeclarationBase | null {
  let curr: ts.Node | undefined = node.parent;
  while (curr) {
    if (
      ts.isArrowFunction(curr) ||
      ts.isFunctionDeclaration(curr) ||
      ts.isFunctionExpression(curr) ||
      ts.isMethodDeclaration(curr)
    ) {
      return curr;
    }
    curr = curr.parent;
  }
  return null;
}

function functionChecksIsComposing(fnNode: ts.Node, paramName: string, sf: ts.SourceFile): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (
      ts.isPropertyAccessExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === paramName &&
      (n.name.text === 'isComposing' || n.name.text === 'keyCode')
    ) {
      found = true;
      return;
    }
    if (ts.isIdentifier(n) && n.text === 'isComposing') {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(fnNode);
  return found || fnNode.getText(sf).includes('isComposing');
}

function isLikelySubmissionOrInputKeyHandler(
  fnNode: ts.FunctionLikeDeclarationBase,
  paramName: string,
  sf: ts.SourceFile
): boolean {
  const firstParam = fnNode.parameters[0];
  if (!firstParam || !ts.isIdentifier(firstParam.name) || firstParam.name.text !== paramName) {
    return false;
  }

  // Check if parameter has KeyboardEvent type or standard event parameter name
  const typeText = firstParam.type?.getText(sf) ?? '';
  if (typeText && !typeText.includes('KeyboardEvent') && !typeText.includes('Event')) {
    return false;
  }
  if (!typeText && !EVENT_PARAM_NAMES.has(paramName)) {
    return false;
  }

  // Only flag when the handler submits, sends, confirms, or is bound to text input submission
  const bodyText = fnNode.body?.getText(sf) ?? '';
  const fnName =
    fnNode.name && ts.isIdentifier(fnNode.name)
      ? fnNode.name.text
      : ts.isVariableDeclaration(fnNode.parent) && ts.isIdentifier(fnNode.parent.name)
        ? fnNode.parent.name.text
        : '';

  const combinedContext = `${fnName} ${bodyText}`;
  return /(?:submit|send|save|create|confirm|search|commit|emit)/i.test(combinedContext);
}

const IN_PLACE_ARRAY_MUTATION_METHODS: ReadonlySet<string> = new Set([
  // runtime-set: Fast O(1) membership lookup set
  'sort',
  'reverse',
  'splice'
]);

function extractEnterKeyEventParam(node: ts.BinaryExpression): string | null {
  if (
    node.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
    node.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsToken
  ) {
    return null;
  }

  if (
    ts.isPropertyAccessExpression(node.left) &&
    node.left.name.text === 'key' &&
    ts.isIdentifier(node.left.expression) &&
    ts.isStringLiteralLike(node.right) &&
    node.right.text === 'Enter'
  ) {
    return node.left.expression.text;
  }

  if (
    ts.isPropertyAccessExpression(node.right) &&
    node.right.name.text === 'key' &&
    ts.isIdentifier(node.right.expression) &&
    ts.isStringLiteralLike(node.left) &&
    node.left.text === 'Enter'
  ) {
    return node.right.expression.text;
  }

  return null;
}

function checkImeBinaryEnterNode(
  node: ts.BinaryExpression,
  rawContent: string,
  sf: ts.SourceFile,
  rawLineOffsets: readonly number[],
  ms: MagicString | null,
  findings: ModernVueHygieneFinding[]
): boolean {
  const eventParam = extractEnterKeyEventParam(node);
  if (!eventParam) return false;

  const enclosingFn = findEnclosingFunction(node);
  if (
    !enclosingFn ||
    !isLikelySubmissionOrInputKeyHandler(enclosingFn, eventParam, sf) ||
    functionChecksIsComposing(enclosingFn, eventParam, sf)
  ) {
    return false;
  }

  const span = getRawSpanFromAstNode(node, sf, rawLineOffsets);
  const origText = rawContent.slice(span.start, span.end);
  findings.push({
    ruleId: 'ime-unsafe-enter-submit',
    line: span.line,
    message: `Enter key submission handler checks '${origText}' without checking '!${eventParam}.isComposing', firing prematurely during IME composition.`,
    context: origText,
    fixable: true
  });

  if (!ms) return false;

  const needParens =
    ts.isBinaryExpression(node.parent) &&
    node.parent.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken;
  const replacement = needParens
    ? `(${origText} && !${eventParam}.isComposing)`
    : `${origText} && !${eventParam}.isComposing`;
  ms.overwrite(span.start, span.end, replacement);
  return true;
}

export function analyzeImeSafeEnterInScriptAst(
  rawContent: string,
  sf: ts.SourceFile,
  enableFix: boolean
): ModernVueHygieneAnalysisResult {
  return runScriptAstMagicStringPass<ModernVueHygieneFinding>(
    rawContent,
    sf,
    enableFix,
    (node, rawLineOffsets, ms, findings) =>
      ts.isBinaryExpression(node) &&
      checkImeBinaryEnterNode(node, rawContent, sf, rawLineOffsets, ms, findings)
  );
}

export interface TemplateBindingExpression {
  readonly expression: string;
  /** 0-based character offset in full file content where `expression` starts */
  readonly absoluteOffset: number;
  readonly isEventDirective: boolean;
}

const ROOT_CONTAINER_TAGS_LIST = ['HTML', 'HEAD', 'BODY'] as const;
export type RootContainerTag = (typeof ROOT_CONTAINER_TAGS_LIST)[number];
const ROOT_CONTAINER_TAGS: ReadonlySet<string> = new Set<RootContainerTag>(
  ROOT_CONTAINER_TAGS_LIST
); // runtime-set: Fast O(1) membership lookup set

const VUE_DYNAMIC_DIRECTIVES_LIST = ['v-if', 'v-else-if', 'v-show', 'v-for', 'v-model'] as const;
export type VueDynamicDirective = (typeof VUE_DYNAMIC_DIRECTIVES_LIST)[number];
const VUE_DYNAMIC_DIRECTIVES: ReadonlySet<string> = new Set<VueDynamicDirective>(
  VUE_DYNAMIC_DIRECTIVES_LIST
); // runtime-set: Fast O(1) membership lookup set

function isVueDynamicBindingAttr(attrName: string): boolean {
  if (attrName.startsWith('@') || attrName.startsWith('v-on:')) {
    return false;
  }
  return (
    attrName.startsWith(':') ||
    attrName.startsWith('v-bind:') ||
    attrName.startsWith('v-model:') ||
    VUE_DYNAMIC_DIRECTIVES.has(attrName)
  );
}

function extractAttrValueRange(
  attrRaw: string,
  eqIdx: number
): { inner: string; innerRelOffset: number } | null {
  const afterEq = attrRaw.slice(eqIdx + 1);
  const quoteChar = afterEq.includes('"') ? '"' : afterEq.includes("'") ? "'" : null;

  if (quoteChar) {
    const firstQuote = attrRaw.indexOf(quoteChar, eqIdx);
    const lastQuote = attrRaw.lastIndexOf(quoteChar);
    if (firstQuote === -1 || lastQuote <= firstQuote) return null;
    return {
      inner: attrRaw.slice(firstQuote + 1, lastQuote),
      innerRelOffset: firstQuote + 1
    };
  }

  const trimmed = afterEq.trim();
  if (!trimmed) return null;
  return {
    inner: trimmed,
    innerRelOffset: eqIdx + 1 + afterEq.indexOf(trimmed)
  };
}

function extractVForIterableExpression(
  inner: string
): { rhs: string; rhsRelOffset: number } | null {
  const inIdx = inner.indexOf(' in ');
  const ofIdx = inner.indexOf(' of ');
  if (inIdx !== -1) {
    return { rhs: inner.slice(inIdx + 4), rhsRelOffset: inIdx + 4 };
  }
  if (ofIdx !== -1) {
    return { rhs: inner.slice(ofIdx + 4), rhsRelOffset: ofIdx + 4 };
  }
  return null;
}

function extractMustacheBindingsFromTextNode(
  node: Node,
  dom: JSDOM,
  templateContentStartOffset: number
): TemplateBindingExpression[] {
  const text = node.textContent ?? '';
  const textLoc = dom.nodeLocation(node);
  if (!textLoc) return [];

  const results: TemplateBindingExpression[] = [];
  let searchIdx = 0;
  while (searchIdx < text.length) {
    const openIdx = text.indexOf('{{', searchIdx);
    if (openIdx === -1) break;
    const closeIdx = text.indexOf('}}', openIdx + 2);
    if (closeIdx === -1) break;

    results.push({
      expression: text.slice(openIdx + 2, closeIdx),
      absoluteOffset: templateContentStartOffset + textLoc.startOffset + openIdx + 2,
      isEventDirective: false
    });
    searchIdx = closeIdx + 2;
  }
  return results;
}

function extractDynamicBindingsFromElement(
  el: Element,
  dom: JSDOM,
  templateContent: string,
  templateContentStartOffset: number
): TemplateBindingExpression[] {
  if (ROOT_CONTAINER_TAGS.has(el.tagName)) return [];
  const loc = dom.nodeLocation(el) as JsdomElementLocation | null;
  if (!loc) return [];

  const results: TemplateBindingExpression[] = [];
  for (const attrName of el.getAttributeNames()) {
    if (!isVueDynamicBindingAttr(attrName)) continue;

    const attrLoc = getAttrLocation(loc, attrName);
    if (!attrLoc) continue;

    const attrRaw = templateContent.slice(attrLoc.startOffset, attrLoc.endOffset);
    const eqIdx = attrRaw.indexOf('=');
    if (eqIdx === -1) continue;

    const range = extractAttrValueRange(attrRaw, eqIdx);
    if (!range) continue;

    if (attrName === 'v-for') {
      const vForRhs = extractVForIterableExpression(range.inner);
      if (vForRhs) {
        results.push({
          expression: vForRhs.rhs,
          absoluteOffset:
            templateContentStartOffset +
            attrLoc.startOffset +
            range.innerRelOffset +
            vForRhs.rhsRelOffset,
          isEventDirective: false
        });
        continue;
      }
    }

    results.push({
      expression: range.inner,
      absoluteOffset: templateContentStartOffset + attrLoc.startOffset + range.innerRelOffset,
      isEventDirective: false
    });
  }
  return results;
}

function walkDomTree(node: Node, onNode: (n: Node) => void): void {
  onNode(node);
  if ((node as HTMLTemplateElement).content) {
    for (const child of (node as HTMLTemplateElement).content.childNodes) {
      walkDomTree(child, onNode);
    }
  }
  for (const child of node.childNodes) {
    walkDomTree(child, onNode);
  }
}

export function extractTemplatePureBindingExpressions(
  templateContent: string,
  templateContentStartOffset: number
): TemplateBindingExpression[] {
  const dom = parseDomWithLocations(templateContent);
  const doc = dom.window.document;
  const results: TemplateBindingExpression[] = [];

  walkDomTree(doc.documentElement, (node) => {
    if (node.nodeType === 3 /* Node.TEXT_NODE */) {
      results.push(...extractMustacheBindingsFromTextNode(node, dom, templateContentStartOffset));
    } else if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
      results.push(
        ...extractDynamicBindingsFromElement(
          node as Element,
          dom,
          templateContent,
          templateContentStartOffset
        )
      );
    }
  });

  return results;
}

function inspectTemplateExprAstNode(
  node: ts.Node,
  sf: ts.SourceFile,
  binding: TemplateBindingExpression,
  rawLineOffsets: readonly number[],
  ms: MagicString | null,
  findings: ModernVueHygieneFinding[]
): boolean {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const methodIdent = node.expression.name;
    const methodName = methodIdent.text;

    if (
      IN_PLACE_ARRAY_MUTATION_METHODS.has(methodName) &&
      !isFreshCopyReceiver(node.expression.expression)
    ) {
      // -1 because we wrapped expr in `(${expr})`
      const absMethodStart = binding.absoluteOffset + methodIdent.getStart(sf) - 1;
      const absMethodEnd = binding.absoluteOffset + methodIdent.getEnd() - 1;
      const line = getLineFromRawOffsets(rawLineOffsets, absMethodStart);
      const isFixable = methodName === 'sort' || methodName === 'reverse';
      const replacementMethod = methodName === 'sort' ? 'toSorted' : 'toReversed';

      findings.push({
        ruleId: 'vue-template-no-side-effects',
        line,
        message: `In-place mutating '.${methodName}()' called directly on reactive data inside <template>. Use immutable '.${isFixable ? replacementMethod : 'toSpliced'}()' or a computed property.`,
        context: binding.expression.trim(),
        fixable: isFixable
      });

      if (ms && isFixable) {
        ms.overwrite(absMethodStart, absMethodEnd, replacementMethod);
        return true;
      }
    }
    return false;
  }

  if (
    (ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node)) &&
    (node.operator === ts.SyntaxKind.PlusPlusToken ||
      node.operator === ts.SyntaxKind.MinusMinusToken)
  ) {
    const absStart = binding.absoluteOffset + node.getStart(sf) - 1;
    findings.push({
      ruleId: 'vue-template-no-side-effects',
      line: getLineFromRawOffsets(rawLineOffsets, absStart),
      message:
        'State mutation operator (++ / --) inside a non-event <template> binding triggers render side-effects.',
      context: binding.expression.trim(),
      fixable: false
    });
  }

  return false;
}

export function analyzeTemplateSideEffectsAst(
  fullFileContent: string,
  templateContent: string,
  templateContentStartOffset: number,
  astContext: SharedAstContext,
  enableFix: boolean
): ModernVueHygieneAnalysisResult {
  const rawLineOffsets = computeRawLineOffsets(fullFileContent);
  const bindings = extractTemplatePureBindingExpressions(
    templateContent,
    templateContentStartOffset
  );
  const ms = enableFix ? new MagicString(fullFileContent) : null;
  const findings: ModernVueHygieneFinding[] = [];
  let mutated = false;

  let exprIndex = 0;
  for (const binding of bindings) {
    const expr = binding.expression;
    if (
      !expr.includes('.sort') &&
      !expr.includes('.reverse') &&
      !expr.includes('.splice') &&
      !expr.includes('++') &&
      !expr.includes('--')
    ) {
      continue;
    }

    const sf = astContext.getSourceFile(`__vue_tpl_expr_${exprIndex++}.ts`, `(${expr})`);
    const visit = (node: ts.Node): void => {
      if (inspectTemplateExprAstNode(node, sf, binding, rawLineOffsets, ms, findings)) {
        mutated = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  return {
    findings,
    fixedContent: mutated && ms ? ms.toString() : undefined
  };
}
