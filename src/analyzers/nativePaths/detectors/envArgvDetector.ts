/**
 * src/analyzers/nativePaths/detectors/envArgvDetector.ts
 *
 * unsanitized-env-argv-path: raw `process.env.*` / `process.argv[n]` passed straight
 * into filesystem or `path.join/resolve` sinks without CWE-22 containment validation.
 */

import ts from 'typescript';

import type { NativePathDetector } from '../nativePathTypes.ts';
import { isFsSinkCall, isPathBuilderCall, unwrapExpression } from '../pathHeuristics.ts';

const ENV_ARGV_MESSAGE =
  "'process.env' or 'process.argv' passed directly to a path/filesystem function without containment validation (CWE-22). Resolve with 'path.resolve()' and validate with 'path.relative()' + '!path.isAbsolute()' (or 'assertSafePathComponent()') before using.";

function isProcessMember(expr: ts.Expression, member: 'env' | 'argv'): boolean {
  const node = unwrapExpression(expr);
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === member &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'process'
  );
}

function isRawEnvOrArgv(expr: ts.Expression): boolean {
  const node = unwrapExpression(expr);
  if (ts.isPropertyAccessExpression(node)) return isProcessMember(node.expression, 'env');
  if (ts.isElementAccessExpression(node)) {
    return isProcessMember(node.expression, 'env') || isProcessMember(node.expression, 'argv');
  }
  if (ts.isBinaryExpression(node)) {
    const kind = node.operatorToken.kind;
    const isFallback =
      kind === ts.SyntaxKind.QuestionQuestionToken || kind === ts.SyntaxKind.BarBarToken;
    return isFallback && (isRawEnvOrArgv(node.left) || isRawEnvOrArgv(node.right));
  }
  return false;
}

export const envArgvDetector: NativePathDetector = (node) => {
  if (!ts.isCallExpression(node) || !(isFsSinkCall(node) || isPathBuilderCall(node))) return null;
  return node.arguments.some(isRawEnvOrArgv)
    ? { ruleId: 'unsanitized-env-argv-path', node, message: ENV_ARGV_MESSAGE }
    : null;
};
