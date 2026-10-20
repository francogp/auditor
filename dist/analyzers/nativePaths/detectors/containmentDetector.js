import { POSIX_SEP, WIN_SEP, collectStringFragments, flattenPlusChain, getRegexInfo, getStringValue, getTemplateTexts, hasTraversalToken, isDriveLetterRegex, isPathFragment, isRegExpConstruction, isSeparatorOnly, unwrapExpression } from "../pathLiteralHeuristics.js";
import { REGEX_CONSUMER_METHODS, asMethodCall, getNodePathFunction, isPathish, isSepConstant, isUrlish } from "../pathHeuristics.js";
import ts from "typescript";
//#region src/analyzers/nativePaths/detectors/containmentDetector.ts
/**
* src/analyzers/nativePaths/detectors/containmentDetector.ts
*
* homebrew-path-containment: hand-rolled CWE-22 guards — `includes('..')`,
* prefix checks with `startsWith(base)`, `startsWith('..')` without `path.isAbsolute`,
* traversal-stripping regexes, drive/UNC regexes and `new RegExp('^' + base + '/')` —
* instead of `path.relative()` + `path.isAbsolute()` (or `isPathContained()`).
*/
const CONTAINMENT_MESSAGE = "Validación casera de contención de rutas (CWE-22). Resuelve con 'path.resolve()' y valida con 'const rel = path.relative(base, target); !rel.startsWith(\"..\") && !path.isAbsolute(rel)' (o 'isPathContained()').";
const TRAVERSAL_LITERALS = /* @__PURE__ */ new Set([
	"..",
	".." + POSIX_SEP,
	".." + WIN_SEP
]);
function firstArgValue(mc) {
	const arg = mc.call.arguments[0];
	return arg ? getStringValue(arg) : void 0;
}
function containsIsAbsoluteCall(node) {
	let found = false;
	const visit = (n) => {
		if (found) return;
		if (ts.isCallExpression(n)) {
			const fn = getNodePathFunction(n.expression);
			if ((ts.isIdentifier(n.expression) ? n.expression.text : fn?.fn) === "isAbsolute") {
				found = true;
				return;
			}
		}
		ts.forEachChild(n, visit);
	};
	visit(node);
	return found;
}
/** Walks up through `!`, parentheses and `&&`/`||` chains to the full logical condition. */
function getLogicalRoot(node) {
	let current = node;
	for (;;) {
		const parent = current.parent;
		const isLogical = ts.isBinaryExpression(parent) && (parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || parent.operatorToken.kind === ts.SyntaxKind.BarBarToken);
		if (ts.isParenthesizedExpression(parent) || ts.isPrefixUnaryExpression(parent) || isLogical) current = parent;
		else return current;
	}
}
function isPathPrefixArgument(arg, ctx) {
	const node = unwrapExpression(arg);
	if (ts.isTemplateExpression(node)) return getTemplateTexts(node).some(isPathFragment) && node.templateSpans.some((s) => isPathish(s.expression, ctx.pathOriginNames));
	if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
		const ops = flattenPlusChain(node);
		return ops.some((op) => isSepConstant(op) || isSeparatorOnly(getStringValue(op) ?? "")) && ops.some((op) => isPathish(op, ctx.pathOriginNames));
	}
	return false;
}
function checkStartsWith(mc, ctx) {
	if (mc.method !== "startsWith") return false;
	const arg = mc.call.arguments[0];
	if (!arg) return false;
	const value = getStringValue(arg);
	if (value !== void 0) return TRAVERSAL_LITERALS.has(value) && !containsIsAbsoluteCall(getLogicalRoot(mc.call));
	if (isPathPrefixArgument(arg, ctx)) return true;
	return isPathish(mc.receiver, ctx.pathOriginNames) && isPathish(arg, ctx.pathOriginNames);
}
function checkTraversalSearch(mc) {
	if (mc.method !== "includes" && mc.method !== "indexOf") return false;
	const value = firstArgValue(mc);
	return value !== void 0 && TRAVERSAL_LITERALS.has(value) && !isUrlish(mc.receiver);
}
function isExplicitPathTraversalRegex(pattern) {
	if (pattern.toLowerCase().includes("%2e%2e")) return true;
	if (!hasTraversalToken(pattern)) return false;
	return pattern.includes("/") || pattern.includes("\\\\") || pattern.includes("[\\/") || pattern.includes("[\\/\\\\]");
}
function checkRegexUsage(mc, ctx) {
	if (mc.method === "replace" || mc.method === "replaceAll") {
		const [pattern, replacement] = mc.call.arguments;
		if (!pattern || !replacement || getStringValue(replacement) !== "") return false;
		const info = getRegexInfo(pattern);
		if (!info) return getStringValue(pattern) === "..";
		return hasTraversalToken(info.pattern);
	}
	if (!REGEX_CONSUMER_METHODS.has(mc.method)) return false;
	const receiverInfo = getRegexInfo(unwrapExpression(mc.receiver));
	const argInfo = mc.call.arguments[0] ? getRegexInfo(mc.call.arguments[0]) : void 0;
	const info = receiverInfo ?? argInfo;
	if (!info) return false;
	if (isExplicitPathTraversalRegex(info.pattern) || isDriveLetterRegex(info.pattern)) return true;
	const target = receiverInfo ? mc.call.arguments[0] : mc.receiver;
	if (target && !isPathish(target, ctx.pathOriginNames)) return false;
	return hasTraversalToken(info.pattern);
}
function checkRegExpConstruction(node, ctx) {
	if (!isRegExpConstruction(node)) return false;
	const args = node.arguments ?? [];
	if (args.some((a) => collectStringFragments(a).some(hasTraversalToken))) return true;
	const first = args[0];
	if (!first) return false;
	const ops = flattenPlusChain(first);
	const head = getStringValue(ops[0]);
	return head !== void 0 && head.startsWith("^") && ops.some((op) => isPathish(op, ctx.pathOriginNames)) && ops.some((op) => isSeparatorOnly(getStringValue(op) ?? "") || isSepConstant(op));
}
function checkParentSegmentComparison(node) {
	if (!ts.isBinaryExpression(node)) return false;
	const kind = node.operatorToken.kind;
	return (kind === ts.SyntaxKind.EqualsEqualsEqualsToken || kind === ts.SyntaxKind.ExclamationEqualsEqualsToken || kind === ts.SyntaxKind.EqualsEqualsToken || kind === ts.SyntaxKind.ExclamationEqualsToken) && (getStringValue(node.left) === ".." || getStringValue(node.right) === "..");
}
const containmentDetector = (node, ctx) => {
	let matched = checkRegExpConstruction(node, ctx) || checkParentSegmentComparison(node);
	if (!matched) {
		const mc = asMethodCall(node);
		matched = mc !== void 0 && (checkStartsWith(mc, ctx) || checkTraversalSearch(mc) || checkRegexUsage(mc, ctx));
	}
	return matched ? {
		ruleId: "homebrew-path-containment",
		node,
		message: CONTAINMENT_MESSAGE
	} : null;
};
//#endregion
export { containmentDetector };
