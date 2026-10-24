import ts from "typescript";
export declare const POSIX_SEP: "\\" | "/";
export declare const WIN_SEP: "\\" | "/";
export declare function getStringValue(expr: ts.Node): string | undefined;
export declare function isSeparatorOnly(value: string): boolean;
export declare function startsWithUrlScheme(value: string): boolean;
/**
 * A literal fragment that looks like a filesystem path piece: contains a separator,
 * no whitespace (human messages) and no URL scheme or CSS `url(`.
 */
export declare function isPathFragment(value: string): boolean;
export declare function isDriveOrUncLiteral(value: string): boolean;
/** True when the text ends with `.ext` (1-5 alphanumerics) after the last separator. */
export declare function hasFileExtensionTail(value: string): boolean;
export declare function getTemplateTexts(node: ts.TemplateExpression): string[];
export declare function unwrapExpression(expr: ts.Expression): ts.Expression;
/** Flattens a left-associative `a + b + c` chain into its operands. */
export declare function flattenPlusChain(expr: ts.Expression): ts.Expression[];
export declare function isOutermostPlus(node: ts.Node): node is ts.BinaryExpression;
export interface RegexLiteralInfo {
  readonly pattern: string;
  readonly flags: string;
  readonly hasBackslashToken: boolean;
  readonly hasSlashToken: boolean;
  readonly hasOtherToken: boolean;
  readonly hasAnchor: boolean;
}
/**
 * Splits a regex literal into pattern and flags and classifies its tokens
 * (escaped backslash, slash, anchors, anything else).
 */
export declare function getRegexInfo(node: ts.Node): RegexLiteralInfo | undefined;
/** Regex sources that encode a parent-directory traversal token (`\.\.`, `\.{2,}`, `%2e%2e`). */
export declare function hasTraversalToken(source: string): boolean;
/** Regex sources anchored on a Windows drive letter (`^[a-zA-Z]:`). */
export declare function isDriveLetterRegex(source: string): boolean;
/** Collects every string fragment (cooked and raw) from RegExp constructor arguments. */
export declare function collectStringFragments(node: ts.Node, out?: string[]): string[];
export declare function isRegExpConstruction(node: ts.Node): node is ts.NewExpression | ts.CallExpression;
export declare function isInsideRegExpConstruction(node: ts.Node): boolean;
export declare function isUrlConstruction(node: ts.Node): node is ts.NewExpression;