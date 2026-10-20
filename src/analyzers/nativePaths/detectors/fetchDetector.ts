/**
 * src/analyzers/nativePaths/detectors/fetchDetector.ts
 *
 * untrusted-url-fetch: `fetch(dynamicValue)` without `new URL()` parsing plus
 * hostname / origin / protocol validation in the same module (CWE-918 SSRF).
 */

import ts from 'typescript';

import type { NativePathDetector } from '../nativePathTypes.ts';
import { getExpressionName, isUrlConstruction, unwrapExpression } from '../pathHeuristics.ts';

const FETCH_MESSAGE =
  "Llamada dinámica a 'fetch()' sin validar la URL ni su origen (CWE-918 SSRF). Construye 'new URL(endpoint, base)' y valida 'hostname'/'origin'/'protocol', o usa 'safeFetch()'.";

const SAFE_ARGUMENT_NAMES: ReadonlySet<string> = new Set(['safeDevUrl', 'href']); // runtime-set: O(1) lookup

function isSafeFetchArgument(arg: ts.Expression): boolean {
  const node = unwrapExpression(arg);
  if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node) || isUrlConstruction(node)) return true;
  if (ts.isCallExpression(node)) {
    const name = getExpressionName(node.expression);
    return name === 'toString' || name === 'safeDevUrl';
  }
  const name = getExpressionName(node);
  return name !== undefined && SAFE_ARGUMENT_NAMES.has(name);
}

export const fetchDetector: NativePathDetector = (node, ctx) => {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== 'fetch') {
    return null;
  }
  const arg = node.arguments[0];
  if (!arg || isSafeFetchArgument(arg) || ctx.hasUrlValidation) return null;
  return { ruleId: 'untrusted-url-fetch', node, message: FETCH_MESSAGE };
};
