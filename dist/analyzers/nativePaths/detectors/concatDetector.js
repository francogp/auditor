import { flattenPlusChain, getStringValue, getTemplateTexts, hasFileExtensionTail, isInsideRegExpConstruction, isOutermostPlus, isPathFragment, isSeparatorOnly, isUrlConstruction, startsWithUrlScheme, unwrapExpression } from "../pathLiteralHeuristics.js";
import { asMethodCall, getExpressionName, isPathCollectionName, isPathish, isSepConstant, isUrlLikeName } from "../pathHeuristics.js";
import ts from "typescript";
//#region src/analyzers/nativePaths/detectors/concatDetector.ts
/**
* src/analyzers/nativePaths/detectors/concatDetector.ts
*
* unsafe-path-concat: filesystem paths assembled with `+`, `+=`, template literals
* or `[...].join(separator)` instead of `path.join()` / `path.resolve()`.
*/
const CONCAT_MESSAGE = "Ruta construida manualmente con concatenación, template literal o '[...].join(separador)'. Usa 'path.join()' o 'path.resolve()' de 'node:path' pasando cada segmento como argumento.";
function isUrlOperand(expr) {
	const name = getExpressionName(expr);
	return name !== void 0 && isUrlLikeName(name);
}
function isSeparatorOperand(expr) {
	if (isSepConstant(expr)) return true;
	const value = getStringValue(expr);
	return value !== void 0 && (isSeparatorOnly(value) || isPathFragment(value));
}
function isExcludedLiteralChain(operands) {
	const first = getStringValue(operands[0]);
	if (first !== void 0 && (first.startsWith("^") || startsWithUrlScheme(first) || first.startsWith("file://") || first.startsWith("[") || first.startsWith("("))) return true;
	return operands.some((op) => {
		const v = getStringValue(op);
		return v !== void 0 && (v.includes("url(") || v.includes("{") || v.includes("file://") || v.includes("**"));
	});
}
function isInsideSearchMethod(node) {
	let cur = node;
	while (ts.isParenthesizedExpression(cur.parent) || ts.isBinaryExpression(cur.parent) && cur.parent.operatorToken.kind === ts.SyntaxKind.PlusToken) cur = cur.parent;
	if (ts.isCallExpression(cur.parent)) {
		const callee = cur.parent.expression;
		if (ts.isPropertyAccessExpression(callee)) {
			const name = callee.name.text;
			if (name === "includes" || name === "indexOf" || name === "search" || name === "startsWith" || name === "endsWith") return true;
		}
	}
	return false;
}
function isInsideModuleSpecifier(node) {
	let child = node;
	let cur = node.parent;
	while (ts.isParenthesizedExpression(cur)) {
		child = cur;
		cur = cur.parent;
	}
	if (ts.isCallExpression(cur) && cur.arguments[0] === child) {
		const callee = cur.expression;
		if (ts.isPropertyAccessExpression(callee) && callee.name.text === "resolve") {
			const owner = unwrapExpression(callee.expression);
			if (ts.isMetaProperty(owner) && owner.keywordToken === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(owner) && owner.text === "require") return true;
		}
	}
	return false;
}
function isFirstArgOfUrlConstruction(node) {
	let child = node;
	let parent = node.parent;
	while (ts.isParenthesizedExpression(parent)) {
		child = parent;
		parent = parent.parent;
	}
	return isUrlConstruction(parent) && parent.arguments?.[0] === child;
}
function checkPlusChain(node, ctx) {
	if (isFirstArgOfUrlConstruction(node) || isInsideRegExpConstruction(node) || isInsideSearchMethod(node)) return false;
	const operands = flattenPlusChain(node);
	if (isExcludedLiteralChain(operands) || operands.some(isUrlOperand)) return false;
	return operands.some((op, i) => isSeparatorOperand(op) && [operands[i - 1], operands[i + 1]].some((n) => n !== void 0 && isPathish(n, ctx.pathOriginNames)));
}
function checkCompoundAssignment(node, ctx) {
	if (node.operatorToken.kind !== ts.SyntaxKind.PlusEqualsToken) return false;
	if (!isPathish(node.left, ctx.pathOriginNames)) return false;
	const first = flattenPlusChain(node.right)[0];
	if (first !== void 0 && isSeparatorOperand(first)) {
		ctx.claimed.add(unwrapExpression(node.right));
		return true;
	}
	return false;
}
function endsWithSeparator(text) {
	return text !== void 0 && text.length > 0 && isSeparatorOnly(text.at(-1));
}
function startsWithSeparator(text) {
	return text !== void 0 && text.length > 0 && isSeparatorOnly(text[0]);
}
/** `./${rel}` only decorates an already-relative path for display; there is no native equivalent. */
function isRelativePrefixDecoration(node) {
	const head = node.head.text;
	return node.templateSpans.length === 1 && (head === "./" || head === "../") && node.templateSpans[0].literal.text === "";
}
function isErrorConstructor(expr) {
	const node = unwrapExpression(expr);
	return ts.isIdentifier(node) && (node.text.endsWith("Error") || node.text === "TypeError" || node.text === "RangeError");
}
function isMessageOrErrorContext(node) {
	let parent = node.parent;
	while (ts.isParenthesizedExpression(parent)) parent = parent.parent;
	if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
		const prop = parent.name.text;
		if (prop === "message" || prop === "description" || prop === "summary" || prop === "title") return true;
	}
	if (ts.isNewExpression(parent) && isErrorConstructor(parent.expression)) return true;
	return false;
}
function checkTemplate(node, ctx) {
	if (ts.isTaggedTemplateExpression(node.parent) || isRelativePrefixDecoration(node) || isInsideModuleSpecifier(node) || isMessageOrErrorContext(node)) return false;
	const texts = getTemplateTexts(node);
	if (texts.some((t) => t.includes("**"))) return false;
	const head = texts[0] ?? "";
	if (head.startsWith("/") || startsWithUrlScheme(head) || head.startsWith("file://") || head.startsWith("[") || head.startsWith("(")) return false;
	if (isFirstArgOfUrlConstruction(node) || isInsideRegExpConstruction(node)) return false;
	const spans = node.templateSpans.map((s) => s.expression);
	if (spans.some(isUrlOperand) || !texts.some(isPathFragment)) return false;
	const hasExtensionTail = hasFileExtensionTail(texts.at(-1) ?? "");
	return spans.some((e, i) => (endsWithSeparator(texts[i]) || startsWithSeparator(texts[i + 1])) && (isPathish(e, ctx.pathOriginNames) || hasExtensionTail));
}
function checkArrayJoin(node, ctx) {
	const mc = asMethodCall(node);
	if (!mc || mc.method !== "join" || mc.call.arguments.length !== 1) return false;
	const sepArg = mc.call.arguments[0];
	const sepValue = getStringValue(sepArg);
	if (!(isSepConstant(sepArg) || sepValue !== void 0 && isSeparatorOnly(sepValue))) return false;
	const receiver = unwrapExpression(mc.receiver);
	if (ts.isArrayLiteralExpression(receiver)) return isSepConstant(sepArg) || receiver.elements.some((e) => isPathish(e, ctx.pathOriginNames));
	return ts.isIdentifier(receiver) && (isPathish(receiver, ctx.pathOriginNames) || isPathCollectionName(receiver.text));
}
const concatDetector = (node, ctx) => {
	if (ctx.claimed.has(node)) return null;
	let matched = false;
	if (isOutermostPlus(node)) matched = checkPlusChain(node, ctx);
	else if (ts.isBinaryExpression(node)) matched = checkCompoundAssignment(node, ctx);
	else if (ts.isTemplateExpression(node)) matched = checkTemplate(node, ctx);
	else matched = checkArrayJoin(node, ctx);
	return matched ? {
		ruleId: "unsafe-path-concat",
		node,
		message: CONCAT_MESSAGE
	} : null;
};
//#endregion
export { concatDetector };
