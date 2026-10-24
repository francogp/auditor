import { isUrlConstruction, unwrapExpression } from "../pathLiteralHeuristics.js";
import { getExpressionName } from "../pathHeuristics.js";
import ts from "typescript";
// src/analyzers/nativePaths/detectors/fetchDetector.ts
/**
* src/analyzers/nativePaths/detectors/fetchDetector.ts
*
* untrusted-url-fetch: `fetch(dynamicValue)` without `new URL()` parsing plus
* hostname / origin / protocol validation in the same module (CWE-918 SSRF).
*/
const FETCH_MESSAGE = "Dynamic call to 'fetch()' without validating URL or its origin (CWE-918 SSRF). Construct 'new URL(endpoint, base)' and validate 'hostname'/'origin'/'protocol', or use 'safeFetch()'.";
const SAFE_ARGUMENT_NAMES = /* @__PURE__ */ new Set(["safeDevUrl", "href"]);
function isSafeFetchArgument(arg) {
	const node = unwrapExpression(arg);
	if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node) || isUrlConstruction(node)) return true;
	if (ts.isCallExpression(node)) {
		const name = getExpressionName(node.expression);
		return name === "toString" || name === "safeDevUrl";
	}
	const name = getExpressionName(node);
	return name !== void 0 && SAFE_ARGUMENT_NAMES.has(name);
}
const fetchDetector = (node, ctx) => {
	if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== "fetch") return null;
	const arg = node.arguments[0];
	if (!arg || isSafeFetchArgument(arg) || ctx.hasUrlValidation) return null;
	return {
		ruleId: "untrusted-url-fetch",
		node,
		message: FETCH_MESSAGE
	};
};
export { fetchDetector };
