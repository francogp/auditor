import "../core/astContext.js";
import { computeRawLineOffsets, getAttrLocation, getLineFromRawOffsets, getRawSpanFromAstNode, parseDomWithLocations, runScriptAstMagicStringPass } from "./modernDomAstUtils.js";
import ts from "typescript";
import MagicString from "magic-string";
// src/analyzers/vueModernHygieneAnalyzer.ts
const MODERN_VUE_HYGIENE_RULES = ["ime-unsafe-enter-submit", "vue-template-no-side-effects"];
const FRESH_ARRAY_PRODUCER_METHODS = /* @__PURE__ */ new Set([
	"slice",
	"concat",
	"filter",
	"map",
	"flat",
	"flatMap",
	"toSorted",
	"toReversed",
	"toSpliced",
	"keys",
	"values",
	"entries",
	"from",
	"split"
]);
const EVENT_PARAM_NAMES = /* @__PURE__ */ new Set([
	"e",
	"ev",
	"evt",
	"event",
	"keyEvent",
	"keyboardEvent"
]);
function isFreshCopyReceiver(expr) {
	let target = expr;
	while (ts.isParenthesizedExpression(target)) target = target.expression;
	if (ts.isArrayLiteralExpression(target)) return true;
	if (ts.isCallExpression(target)) {
		if (ts.isPropertyAccessExpression(target.expression)) {
			const methodName = target.expression.name.text;
			if (FRESH_ARRAY_PRODUCER_METHODS.has(methodName)) return true;
		}
	}
	return false;
}
function findEnclosingFunction(node) {
	let curr = node.parent;
	while (curr) {
		if (ts.isArrowFunction(curr) || ts.isFunctionDeclaration(curr) || ts.isFunctionExpression(curr) || ts.isMethodDeclaration(curr)) return curr;
		curr = curr.parent;
	}
	return null;
}
function functionChecksIsComposing(fnNode, paramName, sf) {
	let found = false;
	const visit = (n) => {
		if (found) return;
		if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === paramName && (n.name.text === "isComposing" || n.name.text === "keyCode")) {
			found = true;
			return;
		}
		if (ts.isIdentifier(n) && n.text === "isComposing") {
			found = true;
			return;
		}
		ts.forEachChild(n, visit);
	};
	visit(fnNode);
	return found || fnNode.getText(sf).includes("isComposing");
}
function isLikelySubmissionOrInputKeyHandler(fnNode, paramName, sf) {
	const firstParam = fnNode.parameters[0];
	if (!firstParam || !ts.isIdentifier(firstParam.name) || firstParam.name.text !== paramName) return false;
	const typeText = firstParam.type?.getText(sf) ?? "";
	if (typeText && !typeText.includes("KeyboardEvent") && !typeText.includes("Event")) return false;
	if (!typeText && !EVENT_PARAM_NAMES.has(paramName)) return false;
	const bodyText = fnNode.body?.getText(sf) ?? "";
	const combinedContext = `${fnNode.name && ts.isIdentifier(fnNode.name) ? fnNode.name.text : ts.isVariableDeclaration(fnNode.parent) && ts.isIdentifier(fnNode.parent.name) ? fnNode.parent.name.text : ""} ${bodyText}`;
	return /(?:submit|send|save|create|confirm|search|commit|emit)/i.test(combinedContext);
}
const IN_PLACE_ARRAY_MUTATION_METHODS = /* @__PURE__ */ new Set([
	"sort",
	"reverse",
	"splice"
]);
function extractEnterKeyEventParam(node) {
	if (node.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken && node.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsToken) return null;
	if (ts.isPropertyAccessExpression(node.left) && node.left.name.text === "key" && ts.isIdentifier(node.left.expression) && ts.isStringLiteralLike(node.right) && node.right.text === "Enter") return node.left.expression.text;
	if (ts.isPropertyAccessExpression(node.right) && node.right.name.text === "key" && ts.isIdentifier(node.right.expression) && ts.isStringLiteralLike(node.left) && node.left.text === "Enter") return node.right.expression.text;
	return null;
}
function checkImeBinaryEnterNode(node, rawContent, sf, rawLineOffsets, ms, findings) {
	const eventParam = extractEnterKeyEventParam(node);
	if (!eventParam) return false;
	const enclosingFn = findEnclosingFunction(node);
	if (!enclosingFn || !isLikelySubmissionOrInputKeyHandler(enclosingFn, eventParam, sf) || functionChecksIsComposing(enclosingFn, eventParam, sf)) return false;
	const span = getRawSpanFromAstNode(node, sf, rawLineOffsets);
	const origText = rawContent.slice(span.start, span.end);
	findings.push({
		ruleId: "ime-unsafe-enter-submit",
		line: span.line,
		message: `Enter key submission handler checks '${origText}' without checking '!${eventParam}.isComposing', firing prematurely during IME composition.`,
		context: origText,
		fixable: true
	});
	if (!ms) return false;
	const replacement = ts.isBinaryExpression(node.parent) && node.parent.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken ? `(${origText} && !${eventParam}.isComposing)` : `${origText} && !${eventParam}.isComposing`;
	ms.overwrite(span.start, span.end, replacement);
	return true;
}
function analyzeImeSafeEnterInScriptAst(rawContent, sf, enableFix) {
	return runScriptAstMagicStringPass(rawContent, sf, enableFix, (node, rawLineOffsets, ms, findings) => ts.isBinaryExpression(node) && checkImeBinaryEnterNode(node, rawContent, sf, rawLineOffsets, ms, findings));
}
const ROOT_CONTAINER_TAGS = /* @__PURE__ */ new Set([
	"HTML",
	"HEAD",
	"BODY"
]);
const VUE_DYNAMIC_DIRECTIVES = /* @__PURE__ */ new Set([
	"v-if",
	"v-else-if",
	"v-show",
	"v-for",
	"v-model"
]);
function isVueDynamicBindingAttr(attrName) {
	if (attrName.startsWith("@") || attrName.startsWith("v-on:")) return false;
	return attrName.startsWith(":") || attrName.startsWith("v-bind:") || attrName.startsWith("v-model:") || VUE_DYNAMIC_DIRECTIVES.has(attrName);
}
function extractAttrValueRange(attrRaw, eqIdx) {
	const afterEq = attrRaw.slice(eqIdx + 1);
	const quoteChar = afterEq.includes("\"") ? "\"" : afterEq.includes("'") ? "'" : null;
	if (quoteChar) {
		const firstQuote = attrRaw.indexOf(quoteChar, eqIdx);
		const lastQuote = attrRaw.lastIndexOf(quoteChar);
		if (firstQuote === -1 || lastQuote <= firstQuote) return null;
		return {
			inner: attrRaw.slice(firstQuote + 1, lastQuote),
			innerRelOffset: firstQuote + 1
		};
	}
	const trimmed = afterEq.trim();
	if (!trimmed) return null;
	return {
		inner: trimmed,
		innerRelOffset: eqIdx + 1 + afterEq.indexOf(trimmed)
	};
}
function extractVForIterableExpression(inner) {
	const inIdx = inner.indexOf(" in ");
	const ofIdx = inner.indexOf(" of ");
	if (inIdx !== -1) return {
		rhs: inner.slice(inIdx + 4),
		rhsRelOffset: inIdx + 4
	};
	if (ofIdx !== -1) return {
		rhs: inner.slice(ofIdx + 4),
		rhsRelOffset: ofIdx + 4
	};
	return null;
}
function extractMustacheBindingsFromTextNode(node, dom, templateContentStartOffset) {
	const text = node.textContent ?? "";
	const textLoc = dom.nodeLocation(node);
	if (!textLoc) return [];
	const results = [];
	let searchIdx = 0;
	while (searchIdx < text.length) {
		const openIdx = text.indexOf("{{", searchIdx);
		if (openIdx === -1) break;
		const closeIdx = text.indexOf("}}", openIdx + 2);
		if (closeIdx === -1) break;
		results.push({
			expression: text.slice(openIdx + 2, closeIdx),
			absoluteOffset: templateContentStartOffset + textLoc.startOffset + openIdx + 2,
			isEventDirective: false
		});
		searchIdx = closeIdx + 2;
	}
	return results;
}
function extractDynamicBindingsFromElement(el, dom, templateContent, templateContentStartOffset) {
	if (ROOT_CONTAINER_TAGS.has(el.tagName)) return [];
	const loc = dom.nodeLocation(el);
	if (!loc) return [];
	const results = [];
	for (const attrName of el.getAttributeNames()) {
		if (!isVueDynamicBindingAttr(attrName)) continue;
		const attrLoc = getAttrLocation(loc, attrName);
		if (!attrLoc) continue;
		const attrRaw = templateContent.slice(attrLoc.startOffset, attrLoc.endOffset);
		const eqIdx = attrRaw.indexOf("=");
		if (eqIdx === -1) continue;
		const range = extractAttrValueRange(attrRaw, eqIdx);
		if (!range) continue;
		if (attrName === "v-for") {
			const vForRhs = extractVForIterableExpression(range.inner);
			if (vForRhs) {
				results.push({
					expression: vForRhs.rhs,
					absoluteOffset: templateContentStartOffset + attrLoc.startOffset + range.innerRelOffset + vForRhs.rhsRelOffset,
					isEventDirective: false
				});
				continue;
			}
		}
		results.push({
			expression: range.inner,
			absoluteOffset: templateContentStartOffset + attrLoc.startOffset + range.innerRelOffset,
			isEventDirective: false
		});
	}
	return results;
}
function walkDomTree(node, onNode) {
	onNode(node);
	if (node.content) for (const child of node.content.childNodes) walkDomTree(child, onNode);
	for (const child of node.childNodes) walkDomTree(child, onNode);
}
function extractTemplatePureBindingExpressions(templateContent, templateContentStartOffset) {
	const dom = parseDomWithLocations(templateContent);
	const doc = dom.window.document;
	const results = [];
	walkDomTree(doc.documentElement, (node) => {
		if (node.nodeType === 3) results.push(...extractMustacheBindingsFromTextNode(node, dom, templateContentStartOffset));
		else if (node.nodeType === 1) results.push(...extractDynamicBindingsFromElement(node, dom, templateContent, templateContentStartOffset));
	});
	return results;
}
function inspectTemplateExprAstNode(node, sf, binding, rawLineOffsets, ms, findings) {
	if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
		const methodIdent = node.expression.name;
		const methodName = methodIdent.text;
		if (IN_PLACE_ARRAY_MUTATION_METHODS.has(methodName) && !isFreshCopyReceiver(node.expression.expression)) {
			const absMethodStart = binding.absoluteOffset + methodIdent.getStart(sf) - 1;
			const absMethodEnd = binding.absoluteOffset + methodIdent.getEnd() - 1;
			const line = getLineFromRawOffsets(rawLineOffsets, absMethodStart);
			const isFixable = methodName === "sort" || methodName === "reverse";
			const replacementMethod = methodName === "sort" ? "toSorted" : "toReversed";
			findings.push({
				ruleId: "vue-template-no-side-effects",
				line,
				message: `In-place mutating '.${methodName}()' called directly on reactive data inside <template>. Use immutable '.${isFixable ? replacementMethod : "toSpliced"}()' or a computed property.`,
				context: binding.expression.trim(),
				fixable: isFixable
			});
			if (ms && isFixable) {
				ms.overwrite(absMethodStart, absMethodEnd, replacementMethod);
				return true;
			}
		}
		return false;
	}
	if ((ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node)) && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) {
		const absStart = binding.absoluteOffset + node.getStart(sf) - 1;
		findings.push({
			ruleId: "vue-template-no-side-effects",
			line: getLineFromRawOffsets(rawLineOffsets, absStart),
			message: "State mutation operator (++ / --) inside a non-event <template> binding triggers render side-effects.",
			context: binding.expression.trim(),
			fixable: false
		});
	}
	return false;
}
function analyzeTemplateSideEffectsAst(fullFileContent, templateContent, templateContentStartOffset, astContext, enableFix) {
	const rawLineOffsets = computeRawLineOffsets(fullFileContent);
	const bindings = extractTemplatePureBindingExpressions(templateContent, templateContentStartOffset);
	const ms = enableFix ? new MagicString(fullFileContent) : null;
	const findings = [];
	let mutated = false;
	let exprIndex = 0;
	for (const binding of bindings) {
		const expr = binding.expression;
		if (!expr.includes(".sort") && !expr.includes(".reverse") && !expr.includes(".splice") && !expr.includes("++") && !expr.includes("--")) continue;
		const sf = astContext.getSourceFile(`__vue_tpl_expr_${exprIndex++}.ts`, `(${expr})`);
		const visit = (node) => {
			if (inspectTemplateExprAstNode(node, sf, binding, rawLineOffsets, ms, findings)) mutated = true;
			ts.forEachChild(node, visit);
		};
		visit(sf);
	}
	return {
		findings,
		fixedContent: mutated && ms ? ms.toString() : void 0
	};
}
export { MODERN_VUE_HYGIENE_RULES, analyzeImeSafeEnterInScriptAst, analyzeTemplateSideEffectsAst, extractTemplatePureBindingExpressions };
