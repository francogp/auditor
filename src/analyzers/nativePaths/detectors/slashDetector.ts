/**
 * src/analyzers/nativePaths/detectors/slashDetector.ts
 *
 * hardcoded-slash-path: Windows drive / UNC literals used as paths and manual
 * backslash splitting or searching that break POSIX/Windows portability.
 */

import ts from 'typescript';

import type { NativePathDetector, NativePathScanContext } from '../nativePathTypes.ts';
import {
  WIN_SEP,
  asMethodCall,
  getStringValue,
  isDriveOrUncLiteral,
  isFsSinkCall,
  isInsideRegExpConstruction,
  isInsideWin32Call,
  isPathBuilderCall,
  isPathLikeName
} from '../pathHeuristics.ts';

const SLASH_MESSAGE =
  "Separador o unidad de Windows hardcodeado ('C:\\\\', '\\\\\\\\host', split/lastIndexOf con contrabarra). Usa 'path.resolve()', 'path.sep', 'path.parse()' o 'path.win32' explícito.";

const BACKSLASH_SEARCH_METHODS: ReadonlySet<string> = new Set(['split', 'lastIndexOf', 'indexOf']); // runtime-set: O(1) lookup

function isBackslashOnly(value: string): boolean {
  return value.length > 0 && [...value].every((ch) => ch === WIN_SEP);
}

function checkBackslashSearch(node: ts.Node, ctx: NativePathScanContext): boolean {
  const mc = asMethodCall(node);
  if (!mc || !BACKSLASH_SEARCH_METHODS.has(mc.method) || ctx.claimed.has(node)) return false;
  const arg = mc.call.arguments[0];
  const value = arg ? getStringValue(arg) : undefined;
  return value !== undefined && isBackslashOnly(value);
}

function isPathContextParent(literal: ts.Node): boolean {
  let child: ts.Node = literal;
  let parent = literal.parent;
  while (ts.isParenthesizedExpression(parent)) {
    child = parent;
    parent = parent.parent;
  }
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.PlusToken) return true;
  if (ts.isCallExpression(parent) && parent.arguments.some((a) => a === child)) {
    return isFsSinkCall(parent) || isPathBuilderCall(parent);
  }
  return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) && isPathLikeName(parent.name.text);
}

function checkDriveLiteral(node: ts.Node): boolean {
  const value = getStringValue(node);
  if (value === undefined || !isDriveOrUncLiteral(value)) return false;
  return !isInsideWin32Call(node) && isPathContextParent(node);
}

/** `${drive}:\\Program Files` — a drive colon followed by a backslash right after a substitution. */
function checkTemplateDrive(node: ts.Node): boolean {
  if (!ts.isTemplateExpression(node) || isInsideRegExpConstruction(node)) return false;
  return node.templateSpans.some((span) => {
    const text = span.literal.text;
    if (text.length < 2 || text[0] !== ':' || text[1] !== WIN_SEP) return false;
    const nextChar = text[2];
    if (nextChar && 'sdwSDWbB'.includes(nextChar)) return false;
    return true;
  });
}

export const slashDetector: NativePathDetector = (node, ctx) => {
  const matched = checkBackslashSearch(node, ctx) || checkDriveLiteral(node) || checkTemplateDrive(node);
  return matched ? { ruleId: 'hardcoded-slash-path', node, message: SLASH_MESSAGE } : null;
};
