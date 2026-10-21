/**
 * src/analyzers/nativePaths/detectors/parsingDetector.ts
 *
 * homebrew-path-parsing: basename / dirname / extension extracted with
 * `split('/')`, `lastIndexOf('/'|'.')`, `split('.').pop()` or regexes
 * instead of `path.basename()`, `path.dirname()`, `path.extname()` or `path.parse()`.
 */

import ts from 'typescript';

import type { NativePathDetector, NativePathScanContext } from '../nativePathTypes.ts';
import {
  WIN_SEP,
  asMethodCall,
  getRegexInfo,
  getStringValue,
  isFilenameish,
  isPathish,
  isSeparatorOnly,
  unwrapExpression,
  type MethodCall
} from '../pathHeuristics.ts';

const PARSING_MESSAGE =
  "Extracción casera de nombre, directorio o extensión de una ruta. Usa 'path.basename()', 'path.dirname()', 'path.extname()' o 'path.parse()' de 'node:path'.";

const EXTENSION_SEPARATOR = '.';

function firstArgValue(mc: MethodCall): string | undefined {
  const arg = mc.call.arguments[0];
  return arg ? getStringValue(arg) : undefined;
}

function isFollowedByLastSegmentAccess(call: ts.CallExpression): boolean {
  let parent = call.parent;
  while (ts.isParenthesizedExpression(parent) || ts.isNonNullExpression(parent)) parent = parent.parent;
  if (ts.isElementAccessExpression(parent)) return true;
  if (ts.isPropertyAccessExpression(parent)) {
    const name = parent.name.text;
    // domain-ok: Array access methods
    return name === 'pop' || name === 'at' || name === 'slice' || name === 'shift';
  }
  return false;
}

function checkSplit(mc: MethodCall, ctx: NativePathScanContext): boolean {
  if (mc.method !== 'split') return false;
  const value = firstArgValue(mc);
  if (value !== undefined && isSeparatorOnly(value)) return isPathish(mc.receiver, ctx.pathOriginNames);
  if (value === EXTENSION_SEPARATOR) {
    return isFollowedByLastSegmentAccess(mc.call) && isFilenameish(mc.receiver, ctx.pathOriginNames);
  }
  return checkSeparatorClassRegex(mc, ctx);
}

function checkLastIndexOf(mc: MethodCall, ctx: NativePathScanContext): boolean {
  if (mc.method !== 'lastIndexOf') return false;
  const value = firstArgValue(mc);
  if (value === undefined) return false;
  if (value === EXTENSION_SEPARATOR) return isFilenameish(mc.receiver, ctx.pathOriginNames);
  return isSeparatorOnly(value) && isPathish(mc.receiver, ctx.pathOriginNames);
}

/** `.replace(/\.[^/.]+$/, '')` style extension stripping on filename-like receivers. */
function checkExtensionStrip(mc: MethodCall, ctx: NativePathScanContext): boolean {
  if (mc.method !== 'replace' && mc.method !== 'replaceAll') return false;
  const [pattern, replacement] = mc.call.arguments;
  const info = pattern ? getRegexInfo(pattern) : undefined;
  if (!info || !replacement || getStringValue(replacement) !== '') return false;
  const isExtensionPattern = info.pattern.startsWith(WIN_SEP + EXTENSION_SEPARATOR) && info.pattern.endsWith('$');
  return isExtensionPattern && isFilenameish(mc.receiver, ctx.pathOriginNames);
}

/** `.match(/[^\\/]+/g)` / `.split(/[\\/]/)` segment tokenizers on path-like receivers. */
function checkSeparatorClassRegex(mc: MethodCall, ctx: NativePathScanContext): boolean {
  if (mc.method !== 'match' && mc.method !== 'split' && mc.method !== 'matchAll') return false;
  const pattern = mc.call.arguments[0];
  const info = pattern ? getRegexInfo(pattern) : undefined;
  return (
    info !== undefined &&
    info.hasBackslashToken &&
    info.hasSlashToken &&
    isPathish(mc.receiver, ctx.pathOriginNames)
  );
}

export const parsingDetector: NativePathDetector = (node, ctx) => {
  const mc = asMethodCall(node);
  if (!mc || ctx.claimed.has(node)) return null;
  const receiver = unwrapExpression(mc.receiver);
  if (ts.isStringLiteral(receiver) || ts.isNoSubstitutionTemplateLiteral(receiver)) return null;
  const matched =
    checkSplit(mc, ctx) ||
    checkLastIndexOf(mc, ctx) ||
    checkExtensionStrip(mc, ctx) ||
    checkSeparatorClassRegex(mc, ctx);
  return matched ? { ruleId: 'homebrew-path-parsing', node, message: PARSING_MESSAGE } : null;
};
