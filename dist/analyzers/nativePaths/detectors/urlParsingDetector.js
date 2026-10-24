import { flattenPlusChain, getRegexInfo, getStringValue, getTemplateTexts, isPathFragment, isUrlConstruction, unwrapExpression } from "../pathLiteralHeuristics.js";
import { REGEX_CONSUMER_METHODS, asMethodCall, getNodePathFunction, isPathish, isUrlish } from "../pathHeuristics.js";
import ts from "typescript";
// src/analyzers/nativePaths/detectors/urlParsingDetector.ts
/**
* src/analyzers/nativePaths/detectors/urlParsingDetector.ts
*
* homebrew-url-parsing: URLs and query strings parsed or assembled by hand
* (`split('?' | '#' | '&')`, query regexes, scheme stripping, `path.join(baseUrl, …)`,
* concatenation inside `new URL()`, legacy `url.parse()`) instead of `URL` / `URLSearchParams`.
*/
const URL_PARSING_MESSAGE = "Homebrew parsing or manual assembly of URLs / query strings. Use native 'new URL(relative, base)', 'url.searchParams', 'URLSearchParams', and 'url.pathname' / 'url.hash'.";
const URL_DELIMITERS = /* @__PURE__ */ new Set([
	"?",
	"#",
	"&",
	"="
]);
const QUERY_CLASS_TOKENS = [
	"[?&]",
	"[&?]",
	"[\\?&]",
	"[&\\?]"
];
function checkDelimiterSplit(mc) {
	if (mc.method !== "split") return false;
	const arg = mc.call.arguments[0];
	const value = arg ? getStringValue(arg) : void 0;
	return value !== void 0 && URL_DELIMITERS.has(value) && isUrlish(mc.receiver);
}
function isQueryRegex(node) {
	const info = node ? getRegexInfo(node) : void 0;
	return info !== void 0 && QUERY_CLASS_TOKENS.some((t) => info.pattern.includes(t));
}
function checkRegexUsage(mc) {
	const pattern = mc.call.arguments[0];
	if (mc.method === "replace" || mc.method === "replaceAll") {
		const info = pattern ? getRegexInfo(pattern) : void 0;
		return info !== void 0 && info.pattern.startsWith("^http");
	}
	if (!REGEX_CONSUMER_METHODS.has(mc.method)) return false;
	if (isQueryRegex(unwrapExpression(mc.receiver)) || isQueryRegex(pattern)) return true;
	const info = pattern ? getRegexInfo(pattern) : void 0;
	return info !== void 0 && info.hasSlashToken && isUrlish(mc.receiver);
}
function checkRegexDeclaration(node) {
	return ts.isVariableDeclaration(node) && node.initializer !== void 0 && isQueryRegex(node.initializer);
}
function checkPathJoinOnUrl(node, ctx) {
	if (!ts.isCallExpression(node)) return false;
	const fn = getNodePathFunction(node.expression);
	if (fn === void 0 || fn.fn !== "join" && fn.fn !== "resolve") return false;
	return node.arguments.some((a) => isUrlish(a) && !isPathish(a, ctx.pathOriginNames));
}
function checkConcatInsideUrl(node) {
	if (!isUrlConstruction(node)) return false;
	const first = node.arguments?.[0];
	if (!first) return false;
	const arg = unwrapExpression(first);
	if (ts.isTemplateExpression(arg)) return getTemplateTexts(arg).some(isPathFragment);
	if (!ts.isBinaryExpression(arg) || arg.operatorToken.kind !== ts.SyntaxKind.PlusToken) return false;
	return flattenPlusChain(arg).some((op) => isPathFragment(getStringValue(op) ?? ""));
}
const URL_MODULE_SPECIFIERS = /* @__PURE__ */ new Set(["url", "node:url"]);
function isRequireUrl(expr) {
	const node = unwrapExpression(expr);
	if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== "require") return false;
	const specifier = node.arguments[0] ? getStringValue(node.arguments[0]) : void 0;
	return specifier !== void 0 && URL_MODULE_SPECIFIERS.has(specifier);
}
function checkLegacyUrlParse(mc) {
	if (mc.method !== "parse") return false;
	const receiver = unwrapExpression(mc.receiver);
	return ts.isIdentifier(receiver) && receiver.text === "url" || isRequireUrl(receiver);
}
const urlParsingDetector = (node, ctx) => {
	let matched = checkRegexDeclaration(node) || checkPathJoinOnUrl(node, ctx) || checkConcatInsideUrl(node);
	if (!matched) {
		const mc = asMethodCall(node);
		matched = mc !== void 0 && (checkDelimiterSplit(mc) || checkRegexUsage(mc) || checkLegacyUrlParse(mc));
	}
	return matched ? {
		ruleId: "homebrew-url-parsing",
		node,
		message: URL_PARSING_MESSAGE
	} : null;
};
export { urlParsingDetector };
