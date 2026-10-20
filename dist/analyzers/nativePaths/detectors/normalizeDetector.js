import { POSIX_SEP, WIN_SEP, getRegexInfo, getStringValue, isSeparatorOnly, unwrapExpression } from "../pathLiteralHeuristics.js";
import { asMethodCall, isPathish, isSepConstant, isUrlish } from "../pathHeuristics.js";
import "typescript";
//#region src/analyzers/nativePaths/detectors/normalizeDetector.ts
const NORMALIZE_MESSAGE = "Normalización casera de separadores o segmentos de ruta. Usa 'path.normalize()', 'path.posix.normalize()' o la conversión nativa 'p.split(path.sep).join(path.posix.sep)' / 'p.replaceAll(path.win32.sep, path.posix.sep)'.";
const DOT_SLASH_PATTERNS = /* @__PURE__ */ new Set([WIN_SEP + "." + WIN_SEP + POSIX_SEP, WIN_SEP + "." + WIN_SEP + POSIX_SEP + "+"]);
function isSeparatorPayload(expr) {
	if (!expr) return false;
	const value = getStringValue(expr);
	return value !== void 0 && isSeparatorOnly(value);
}
function isEmptyString(expr) {
	return expr !== void 0 && getStringValue(expr) === "";
}
function isSeparatorRegex(info) {
	return !info.hasOtherToken && (info.hasBackslashToken || info.hasSlashToken);
}
/** `\\/` and `\\\\` replacements escape a separator (regex/string escaping), they do not normalize paths. */
function isEscapeReplacement(value) {
	return value === WIN_SEP + POSIX_SEP || value === WIN_SEP + WIN_SEP;
}
function isSeparatorSwap(target, replacement) {
	if (!isSeparatorOnly(replacement) || isEscapeReplacement(replacement)) return false;
	if (target.hasBackslashToken) return replacement.includes(POSIX_SEP);
	return target.hasSlashToken && replacement.includes(WIN_SEP);
}
function checkRegexReplace(info, mc, ctx) {
	const replacementNode = mc.call.arguments[1];
	const replacement = replacementNode ? getStringValue(replacementNode) : void 0;
	if (isSeparatorRegex(info) && replacement !== void 0) {
		if (isSeparatorSwap(info, replacement)) return true;
		if (info.hasSlashToken && !info.hasBackslashToken && replacement === POSIX_SEP && (info.pattern.includes("+") || info.pattern.includes("{"))) return true;
		if (replacement === "" && info.hasAnchor && !isUrlish(mc.receiver)) return true;
	}
	if (DOT_SLASH_PATTERNS.has(info.pattern) && isEmptyString(replacementNode)) return true;
	return info.pattern.startsWith("[^") && isEmptyString(replacementNode) && isPathish(mc.receiver, ctx.pathOriginNames);
}
function checkReplace(mc, ctx) {
	if (mc.method !== "replace" && mc.method !== "replaceAll") return false;
	const [pattern, replacement] = mc.call.arguments;
	if (!pattern) return false;
	const info = getRegexInfo(pattern);
	if (info) return checkRegexReplace(info, mc, ctx);
	const value = getStringValue(pattern);
	const replacementValue = replacement ? getStringValue(replacement) : void 0;
	if (value === void 0 || replacementValue === void 0 || !isSeparatorOnly(value)) return false;
	return isSeparatorSwap({
		hasBackslashToken: value.includes(WIN_SEP),
		hasSlashToken: value.includes(POSIX_SEP)
	}, replacementValue);
}
function isSeparatorArg(expr) {
	if (!expr) return void 0;
	if (isSepConstant(expr)) return "constant";
	return isSeparatorPayload(expr) ? "literal" : void 0;
}
/** `.split(a).join(b)` and `.split(a).filter(...).join(b)` with at least one literal separator. */
function checkSplitJoin(mc, ctx) {
	if (mc.method !== "join") return false;
	const joinKind = isSeparatorArg(mc.call.arguments[0]);
	if (!joinKind) return false;
	let inner = asMethodCall(unwrapExpression(mc.receiver));
	if (inner?.method === "filter") inner = asMethodCall(unwrapExpression(inner.receiver));
	if (inner?.method !== "split") return false;
	const splitKind = isSeparatorArg(inner.call.arguments[0]);
	if (!splitKind || splitKind === "constant" && joinKind === "constant") return false;
	ctx.claimed.add(inner.call);
	return true;
}
const normalizeDetector = (node, ctx) => {
	const mc = asMethodCall(node);
	if (!mc || ctx.claimed.has(node)) return null;
	return checkSplitJoin(mc, ctx) || checkReplace(mc, ctx) ? {
		ruleId: "homebrew-path-manipulation",
		node,
		message: NORMALIZE_MESSAGE
	} : null;
};
//#endregion
export { normalizeDetector };
