import { WIN_SEP, getStringValue, isDriveOrUncLiteral, isInsideRegExpConstruction } from "../pathLiteralHeuristics.js";
import { asMethodCall, isFsSinkCall, isInsideWin32Call, isPathBuilderCall, isPathLikeName } from "../pathHeuristics.js";
import ts from "typescript";
// src/analyzers/nativePaths/detectors/slashDetector.ts
/**
* src/analyzers/nativePaths/detectors/slashDetector.ts
*
* hardcoded-slash-path: Windows drive / UNC literals used as paths and manual
* backslash splitting or searching that break POSIX/Windows portability.
*/
const SLASH_MESSAGE = "Hardcoded Windows drive or separator ('C:\\\\', '\\\\\\\\host', backslash split/lastIndexOf). Use 'path.resolve()', 'path.sep', 'path.parse()', or explicit 'path.win32'.";
const BACKSLASH_SEARCH_METHODS = /* @__PURE__ */ new Set([
	"split",
	"lastIndexOf",
	"indexOf"
]);
function isBackslashOnly(value) {
	return value.length > 0 && [...value].every((ch) => ch === WIN_SEP);
}
function checkBackslashSearch(node, ctx) {
	const mc = asMethodCall(node);
	if (!mc || !BACKSLASH_SEARCH_METHODS.has(mc.method) || ctx.claimed.has(node)) return false;
	const arg = mc.call.arguments[0];
	const value = arg ? getStringValue(arg) : void 0;
	return value !== void 0 && isBackslashOnly(value);
}
function isPathContextParent(literal) {
	let child = literal;
	let parent = literal.parent;
	while (ts.isParenthesizedExpression(parent)) {
		child = parent;
		parent = parent.parent;
	}
	if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.PlusToken) return true;
	if (ts.isCallExpression(parent) && parent.arguments.some((a) => a === child)) return isFsSinkCall(parent) || isPathBuilderCall(parent);
	return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) && isPathLikeName(parent.name.text);
}
function checkDriveLiteral(node) {
	const value = getStringValue(node);
	if (value === void 0 || !isDriveOrUncLiteral(value)) return false;
	return !isInsideWin32Call(node) && isPathContextParent(node);
}
/** `${drive}:\\Program Files` — a drive colon followed by a backslash right after a substitution. */
function checkTemplateDrive(node) {
	if (!ts.isTemplateExpression(node) || isInsideRegExpConstruction(node)) return false;
	return node.templateSpans.some((span) => {
		const text = span.literal.text;
		if (text.length < 2 || text[0] !== ":" || text[1] !== WIN_SEP) return false;
		const nextChar = text[2];
		if (nextChar && "sdwSDWbB".includes(nextChar)) return false;
		return true;
	});
}
const slashDetector = (node, ctx) => {
	return checkBackslashSearch(node, ctx) || checkDriveLiteral(node) || checkTemplateDrive(node) ? {
		ruleId: "hardcoded-slash-path",
		node,
		message: SLASH_MESSAGE
	} : null;
};
export { slashDetector };
