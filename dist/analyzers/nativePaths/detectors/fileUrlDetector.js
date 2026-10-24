import { flattenPlusChain, getStringValue, isOutermostPlus, isUrlConstruction, unwrapExpression } from "../pathLiteralHeuristics.js";
import { asMethodCall, isImportMetaUrl } from "../pathHeuristics.js";
import ts from "typescript";
// src/analyzers/nativePaths/detectors/fileUrlDetector.ts
/**
* src/analyzers/nativePaths/detectors/fileUrlDetector.ts
*
* homebrew-file-url: `file://` URLs converted by hand (`replace('file://', '')`,
* `'file://' + p`, `new URL(..., import.meta.url).pathname`) instead of
* `fileURLToPath()` / `pathToFileURL()` from `node:url`.
*/
const FILE_URL_MESSAGE = "Homebrew conversion between paths and 'file://' URLs. Use 'fileURLToPath()' and 'pathToFileURL()' from 'node:url' ('.pathname' remains percent-encoded and produces '/C:/...' on Windows).";
function startsWithFileScheme(expr) {
	if (!expr) return false;
	if (ts.isRegularExpressionLiteral(expr)) return expr.text.includes("file:");
	const value = getStringValue(expr);
	return value !== void 0 && value.startsWith("file://");
}
function checkReplace(node) {
	const mc = asMethodCall(node);
	if (!mc || mc.method !== "replace" && mc.method !== "replaceAll") return false;
	return startsWithFileScheme(mc.call.arguments[0]);
}
function checkConcat(node) {
	if (isOutermostPlus(node)) return startsWithFileScheme(flattenPlusChain(node)[0]);
	return ts.isTemplateExpression(node) && node.head.text.startsWith("file://");
}
function checkPathnameOfModuleUrl(node) {
	if (!ts.isPropertyAccessExpression(node) || node.name.text !== "pathname") return false;
	const owner = unwrapExpression(node.expression);
	return isUrlConstruction(owner) && (owner.arguments ?? []).some(isImportMetaUrl);
}
const fileUrlDetector = (node) => {
	return checkReplace(node) || checkConcat(node) || checkPathnameOfModuleUrl(node) ? {
		ruleId: "homebrew-file-url",
		node,
		message: FILE_URL_MESSAGE
	} : null;
};
export { fileUrlDetector };
