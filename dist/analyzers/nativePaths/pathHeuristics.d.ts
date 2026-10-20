import { POSIX_SEP, RegexLiteralInfo, WIN_SEP, collectStringFragments, flattenPlusChain, getRegexInfo, getStringValue, getTemplateTexts, hasFileExtensionTail, hasTraversalToken, isDriveLetterRegex, isDriveOrUncLiteral, isInsideRegExpConstruction, isOutermostPlus, isPathFragment, isRegExpConstruction, isSeparatorOnly, isUrlConstruction, startsWithUrlScheme, unwrapExpression } from "./pathLiteralHeuristics.js";
import ts from "typescript";
//#region src/analyzers/nativePaths/pathHeuristics.d.ts
export declare const PARENT_SEGMENT = "..";
export declare const FILE_SCHEME = "file://";
export declare const REGEX_CONSUMER_METHODS: ReadonlySet<string>;
export declare function isUrlLikeName(name: string): boolean;
export declare function isPathLikeName(name: string): boolean;
/** Plural identifiers holding path segments (`segments`, `pathParts`, `dirs`). */
export declare function isPathCollectionName(name: string): boolean;
/**
 * Returns the identifier or trailing property name that labels an expression (`a.b.filePath` → `filePath`).
 */
export declare function getExpressionName(expr: ts.Expression): string | undefined;
export interface MethodCall {
  readonly call: ts.CallExpression;
  readonly method: string;
  readonly receiver: ts.Expression;
}
export declare function asMethodCall(node: ts.Node): MethodCall | undefined;
/**
 * True for `path.<fn>`, `path.posix.<fn>` and `path.win32.<fn>` callee expressions
 * where `<fn>` is a real `node:path` function.
 */
export declare function getNodePathFunction(callee: ts.Expression): {
  readonly fn: string;
  readonly flavor: 'native' | 'posix' | 'win32';
} | undefined;
/** `path.sep`, `path.posix.sep`, `path.win32.sep`. */
export declare function isSepConstant(expr: ts.Expression): boolean;
export declare function isImportMetaUrl(expr: ts.Expression): boolean;
/**
 * Like isPathOrigin but also follows string pass-through chains (`path.relative(a, b).replace(...)`).
 */
export declare function isPathOriginChain(expr: ts.Expression): boolean;
export declare function isPathish(expr: ts.Expression, pathOriginNames: ReadonlySet<string>): boolean;
export declare function isFilenameish(expr: ts.Expression, pathOriginNames: ReadonlySet<string>): boolean;
export declare function isUrlish(expr: ts.Expression): boolean;
export declare function isFsSinkCall(call: ts.CallExpression): boolean;
/** `path.join/resolve/normalize` (native or posix flavor, never win32). */
export declare function isPathBuilderCall(call: ts.CallExpression): boolean;
export declare function isInsideWin32Call(node: ts.Node): boolean;
//#endregion
export { POSIX_SEP, type RegexLiteralInfo, WIN_SEP, collectStringFragments, flattenPlusChain, getRegexInfo, getStringValue, getTemplateTexts, hasFileExtensionTail, hasTraversalToken, isDriveLetterRegex, isDriveOrUncLiteral, isInsideRegExpConstruction, isOutermostPlus, isPathFragment, isRegExpConstruction, isSeparatorOnly, isUrlConstruction, startsWithUrlScheme, unwrapExpression };