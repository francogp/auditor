import { WIN_SEP, getRegexInfo, getStringValue, isSeparatorOnly, unwrapExpression } from "../pathLiteralHeuristics.js";
import { asMethodCall, isFilenameish, isPathish } from "../pathHeuristics.js";
import ts from "typescript";
//#region src/analyzers/nativePaths/detectors/parsingDetector.ts
/**
* src/analyzers/nativePaths/detectors/parsingDetector.ts
*
* homebrew-path-parsing: basename / dirname / extension extracted with
* `split('/')`, `lastIndexOf('/'|'.')`, `split('.').pop()` or regexes
* instead of `path.basename()`, `path.dirname()`, `path.extname()` or `path.parse()`.
*/
const PARSING_MESSAGE = "Extracción casera de nombre, directorio o extensión de una ruta. Usa 'path.basename()', 'path.dirname()', 'path.extname()' o 'path.parse()' de 'node:path'.";
const EXTENSION_SEPARATOR = ".";
function firstArgValue(mc) {
	const arg = mc.call.arguments[0];
	return arg ? getStringValue(arg) : void 0;
}
function isFollowedByLastSegmentAccess(call) {
	let parent = call.parent;
	while (ts.isParenthesizedExpression(parent) || ts.isNonNullExpression(parent)) parent = parent.parent;
	if (ts.isElementAccessExpression(parent)) return true;
	if (ts.isPropertyAccessExpression(parent)) {
		const name = parent.name.text;
		return name === "pop" || name === "at" || name === "slice" || name === "shift";
	}
	return false;
}
function checkSplit(mc, ctx) {
	if (mc.method !== "split") return false;
	const value = firstArgValue(mc);
	if (value !== void 0 && isSeparatorOnly(value)) return isPathish(mc.receiver, ctx.pathOriginNames);
	if (value === EXTENSION_SEPARATOR) return isFollowedByLastSegmentAccess(mc.call) && isFilenameish(mc.receiver, ctx.pathOriginNames);
	return checkSeparatorClassRegex(mc, ctx);
}
function checkLastIndexOf(mc, ctx) {
	if (mc.method !== "lastIndexOf") return false;
	const value = firstArgValue(mc);
	if (value === void 0) return false;
	if (value === EXTENSION_SEPARATOR) return isFilenameish(mc.receiver, ctx.pathOriginNames);
	return isSeparatorOnly(value) && isPathish(mc.receiver, ctx.pathOriginNames);
}
/** `.replace(/\.[^/.]+$/, '')` style extension stripping on filename-like receivers. */
function checkExtensionStrip(mc, ctx) {
	if (mc.method !== "replace" && mc.method !== "replaceAll") return false;
	const [pattern, replacement] = mc.call.arguments;
	const info = pattern ? getRegexInfo(pattern) : void 0;
	if (!info || !replacement || getStringValue(replacement) !== "") return false;
	return info.pattern.startsWith(WIN_SEP + EXTENSION_SEPARATOR) && info.pattern.endsWith("$") && isFilenameish(mc.receiver, ctx.pathOriginNames);
}
/** `.match(/[^\\/]+/g)` / `.split(/[\\/]/)` segment tokenizers on path-like receivers. */
function checkSeparatorClassRegex(mc, ctx) {
	if (mc.method !== "match" && mc.method !== "split" && mc.method !== "matchAll") return false;
	const pattern = mc.call.arguments[0];
	const info = pattern ? getRegexInfo(pattern) : void 0;
	return info !== void 0 && info.hasBackslashToken && info.hasSlashToken && isPathish(mc.receiver, ctx.pathOriginNames);
}
const parsingDetector = (node, ctx) => {
	const mc = asMethodCall(node);
	if (!mc || ctx.claimed.has(node)) return null;
	const receiver = unwrapExpression(mc.receiver);
	if (ts.isStringLiteral(receiver) || ts.isNoSubstitutionTemplateLiteral(receiver)) return null;
	return checkSplit(mc, ctx) || checkLastIndexOf(mc, ctx) || checkExtensionStrip(mc, ctx) || checkSeparatorClassRegex(mc, ctx) ? {
		ruleId: "homebrew-path-parsing",
		node,
		message: PARSING_MESSAGE
	} : null;
};
//#endregion
export { parsingDetector };
