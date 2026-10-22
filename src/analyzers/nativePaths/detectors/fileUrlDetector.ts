/**
 * src/analyzers/nativePaths/detectors/fileUrlDetector.ts
 *
 * homebrew-file-url: `file://` URLs converted by hand (`replace('file://', '')`,
 * `'file://' + p`, `new URL(..., import.meta.url).pathname`) instead of
 * `fileURLToPath()` / `pathToFileURL()` from `node:url`.
 */

import ts from 'typescript';

import type { NativePathDetector } from '../nativePathTypes.ts';
import {
  FILE_SCHEME,
  asMethodCall,
  getStringValue,
  isImportMetaUrl,
  isOutermostPlus,
  flattenPlusChain,
  isUrlConstruction,
  unwrapExpression
} from '../pathHeuristics.ts';

const FILE_URL_MESSAGE =
  "Homebrew conversion between paths and 'file://' URLs. Use 'fileURLToPath()' and 'pathToFileURL()' from 'node:url' ('.pathname' remains percent-encoded and produces '/C:/...' on Windows).";

function startsWithFileScheme(expr: ts.Expression | undefined): boolean {
  if (!expr) return false;
  if (ts.isRegularExpressionLiteral(expr)) {
    return expr.text.includes('file:');
  }
  const value = getStringValue(expr);
  return value !== undefined && value.startsWith(FILE_SCHEME);
}

function checkReplace(node: ts.Node): boolean {
  const mc = asMethodCall(node);
  if (!mc || (mc.method !== 'replace' && mc.method !== 'replaceAll')) return false;
  return startsWithFileScheme(mc.call.arguments[0]);
}

function checkConcat(node: ts.Node): boolean {
  if (isOutermostPlus(node)) return startsWithFileScheme(flattenPlusChain(node)[0]);
  return ts.isTemplateExpression(node) && node.head.text.startsWith(FILE_SCHEME);
}

function checkPathnameOfModuleUrl(node: ts.Node): boolean {
  if (!ts.isPropertyAccessExpression(node) || node.name.text !== 'pathname') return false;
  const owner = unwrapExpression(node.expression);
  return isUrlConstruction(owner) && (owner.arguments ?? []).some(isImportMetaUrl);
}

export const fileUrlDetector: NativePathDetector = (node) => {
  const matched = checkReplace(node) || checkConcat(node) || checkPathnameOfModuleUrl(node);
  return matched ? { ruleId: 'homebrew-file-url', node, message: FILE_URL_MESSAGE } : null;
};
