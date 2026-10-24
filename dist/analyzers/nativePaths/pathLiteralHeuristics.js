import path from "node:path";
import ts from "typescript";
// src/analyzers/nativePaths/pathLiteralHeuristics.ts
/**
* src/analyzers/nativePaths/pathLiteralHeuristics.ts
*
* Pure AST predicates for literal nodes, string values, regex sources and templates.
*/
const POSIX_SEP = path.posix.sep;
const WIN_SEP = path.win32.sep;
const URL_SCHEMES = [
	"http://",
	"https://",
	"ws://",
	"wss://",
	"ftp://",
	"mailto:"
];
function getStringValue(expr) {
	if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
}
function isSeparatorChar(ch) {
	return ch === POSIX_SEP || ch === WIN_SEP;
}
function containsSeparator(value) {
	return value.includes(POSIX_SEP) || value.includes(WIN_SEP);
}
function isSeparatorOnly(value) {
	return value.length > 0 && [...value].every(isSeparatorChar);
}
function startsWithUrlScheme(value) {
	const lower = value.trimStart().toLowerCase();
	return URL_SCHEMES.some((s) => lower.startsWith(s)) || lower.startsWith("//");
}
function hasWhitespace(value) {
	return [...value].some((ch) => ch.trim() === "");
}
/**
* A literal fragment that looks like a filesystem path piece: contains a separator,
* no whitespace (human messages) and no URL scheme or CSS `url(`.
*/
function isPathFragment(value) {
	return containsSeparator(value) && !hasWhitespace(value) && !startsWithUrlScheme(value) && !value.includes("url(") && !value.includes("://");
}
function isAsciiLetter(ch) {
	return ch !== void 0 && (ch >= "a" && ch <= "z" || ch >= "A" && ch <= "Z");
}
function isAlnum(ch) {
	return isAsciiLetter(ch) || ch !== void 0 && ch >= "0" && ch <= "9";
}
function isDriveOrUncLiteral(value) {
	const isDrive = value.length >= 3 && isAsciiLetter(value[0]) && value[1] === ":" && isSeparatorChar(value[2]);
	const isUnc = value.startsWith(WIN_SEP + WIN_SEP) && isAlnum(value[2]);
	return isDrive || isUnc;
}
/** True when the text ends with `.ext` (1-5 alphanumerics) after the last separator. */
function hasFileExtensionTail(value) {
	const dot = value.lastIndexOf(".");
	if (dot <= 0 || dot === value.length - 1) return false;
	const ext = value.slice(dot + 1);
	if (ext.length > 5 || ![...ext].every((ch) => isAlnum(ch))) return false;
	return dot > Math.max(value.lastIndexOf(POSIX_SEP), value.lastIndexOf(WIN_SEP));
}
function getTemplateTexts(node) {
	return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
}
function unwrapExpression(expr) {
	let current = expr;
	while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isNonNullExpression(current) || ts.isAwaitExpression(current) || ts.isTypeAssertionExpression(current) || ts.isSatisfiesExpression(current)) current = current.expression;
	return current;
}
/** Flattens a left-associative `a + b + c` chain into its operands. */
function flattenPlusChain(expr) {
	const node = unwrapExpression(expr);
	if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return [...flattenPlusChain(node.left), ...flattenPlusChain(node.right)];
	return [node];
}
function isOutermostPlus(node) {
	if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.PlusToken) return false;
	let parent = node.parent;
	while (ts.isParenthesizedExpression(parent)) parent = parent.parent;
	return !(ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.PlusToken);
}
const REGEX_STRUCTURAL_CHARS = /* @__PURE__ */ new Set([
	"+",
	"*",
	"[",
	"]",
	"{",
	"}",
	",",
	"|",
	"(",
	")",
	"?",
	":",
	"0",
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9"
]);
function classifyRegexToken(token, info) {
	if (token === WIN_SEP + WIN_SEP) info.backslash = true;
	else if (token === WIN_SEP + POSIX_SEP || token === POSIX_SEP) info.slash = true;
	else if (token === "^" || token === "$") info.anchor = true;
	else if (!REGEX_STRUCTURAL_CHARS.has(token)) info.other = true;
}
/**
* Splits a regex literal into pattern and flags and classifies its tokens
* (escaped backslash, slash, anchors, anything else).
*/
function getRegexInfo(node) {
	if (!ts.isRegularExpressionLiteral(node)) return void 0;
	const raw = node.text;
	const closing = raw.lastIndexOf(POSIX_SEP);
	const pattern = raw.slice(1, closing);
	const info = {
		backslash: false,
		slash: false,
		other: false,
		anchor: false
	};
	for (let i = 0; i < pattern.length; i++) {
		const ch = pattern[i];
		const token = ch === WIN_SEP ? pattern.slice(i, i + 2) : ch;
		if (ch === WIN_SEP) i++;
		classifyRegexToken(token, info);
	}
	return {
		pattern,
		flags: raw.slice(closing + 1),
		hasBackslashToken: info.backslash,
		hasSlashToken: info.slash,
		hasOtherToken: info.other,
		hasAnchor: info.anchor
	};
}
/** Regex sources that encode a parent-directory traversal token (`\.\.`, `\.{2,}`, `%2e%2e`). */
function hasTraversalToken(source) {
	const escapedDot = WIN_SEP + ".";
	return source.includes(escapedDot + escapedDot) || source.includes(escapedDot + "{2") || source.toLowerCase().includes("%2e%2e");
}
/** Regex sources anchored on a Windows drive letter (`^[a-zA-Z]:`). */
function isDriveLetterRegex(source) {
	return source.startsWith("^[a-zA-Z]:") || source.startsWith("^[A-Za-z]:") || source.startsWith("^[a-z]:");
}
/** Collects every string fragment (cooked and raw) from RegExp constructor arguments. */
function collectStringFragments(node, out = []) {
	if (ts.isStringLiteral(node)) out.push(node.text);
	else if (ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.rawText ?? node.text);
	else if (ts.isTemplateExpression(node)) out.push(...getTemplateTexts(node));
	ts.forEachChild(node, (child) => {
		collectStringFragments(child, out);
	});
	return out;
}
function isRegExpConstruction(node) {
	return (ts.isNewExpression(node) || ts.isCallExpression(node)) && ts.isIdentifier(node.expression) && node.expression.text === "RegExp";
}
function isInsideRegExpConstruction(node) {
	for (let cur = node.parent; cur && !ts.isStatement(cur); cur = cur.parent) if (isRegExpConstruction(cur)) return true;
	return false;
}
function isUrlConstruction(node) {
	return ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "URL";
}
export { POSIX_SEP, WIN_SEP, collectStringFragments, flattenPlusChain, getRegexInfo, getStringValue, getTemplateTexts, hasFileExtensionTail, hasTraversalToken, isDriveLetterRegex, isDriveOrUncLiteral, isInsideRegExpConstruction, isOutermostPlus, isPathFragment, isRegExpConstruction, isSeparatorOnly, isUrlConstruction, startsWithUrlScheme, unwrapExpression };
