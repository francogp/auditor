import { advancePastStringOrComment, scanBalancedBraces } from "../core/scannerUtils.js";
import { computeRawLineOffsets, getLineFromRawOffsets } from "./modernDomAstUtils.js";
import MagicString from "magic-string";
import valueParser from "postcss-value-parser";
// src/analyzers/scssModernAnalyzer.ts
/**
* src/analyzers/scssModernAnalyzer.ts
*
* AST-DRIVEN MODERN CSS / SCSS ARCHITECTURE ANALYZER (Node.js 26+ Native)
*
* Parses CSS/SCSS stylesheets and Vue <style> blocks into a recursive rule and
* declaration AST using canonical lexical scanners (`advancePastStringOrComment`,
* `scanBalancedBraces`) and `postcss-value-parser`, with surgical auto-fixes
* powered by MagicString.
*/
const MODERN_SCSS_RULES = [
	"scss-viewport-overflow-and-dvh",
	"scss-overflow-clip-margin-trap",
	"scss-prefer-user-invalid",
	"scss-focus-outline-removal",
	"typography-unclamped-viewport-font",
	"scss-flexbox-dead-properties",
	"scss-universal-expensive-selectors",
	"dark-mode-color-scheme-missing"
];
function parseDeclarationSegment(content, segStart, segEnd, lineOffsets) {
	let i = segStart;
	while (i < segEnd && /\s/.test(content[i])) i++;
	if (i >= segEnd) return null;
	const declStart = i;
	let colonIdx = -1;
	while (i < segEnd) {
		const next = advancePastStringOrComment(content, i, segEnd);
		if (next !== i) {
			i = next;
			continue;
		}
		if (content[i] === ":") {
			colonIdx = i;
			break;
		}
		i++;
	}
	if (colonIdx === -1) return null;
	const rawProp = content.slice(declStart, colonIdx).trim();
	if (!rawProp || rawProp.startsWith("@") || rawProp.includes("{")) return null;
	let valStart = colonIdx + 1;
	while (valStart < segEnd && /\s/.test(content[valStart])) valStart++;
	let valEnd = segEnd;
	while (valEnd > valStart && /[\s;]/.test(content[valEnd - 1])) valEnd--;
	const rawVal = content.slice(valStart, valEnd);
	if (!rawVal) return null;
	return {
		prop: rawProp.toLowerCase(),
		value: rawVal,
		startOffset: declStart,
		endOffset: segEnd,
		valueStartOffset: valStart,
		valueEndOffset: valEnd,
		line: getLineFromRawOffsets(lineOffsets, declStart)
	};
}
function trimSelectorRange(content, tokenStart, openBraceIdx) {
	let selStart = tokenStart;
	while (selStart < openBraceIdx) {
		while (selStart < openBraceIdx && /\s/.test(content[selStart])) selStart++;
		const afterComment = advancePastStringOrComment(content, selStart, openBraceIdx);
		if (afterComment !== selStart && content[selStart] === "/") selStart = afterComment;
		else break;
	}
	let selEnd = openBraceIdx;
	while (selEnd > selStart && /\s/.test(content[selEnd - 1])) selEnd--;
	return {
		selStart,
		selEnd
	};
}
function parseScssBlockNodes(content, start, end, lineOffsets) {
	const declarations = [];
	const children = [];
	let tokenStart = start;
	let i = start;
	while (i < end) {
		const skipped = advancePastStringOrComment(content, i, end);
		if (skipped !== i) {
			if (tokenStart === i) tokenStart = skipped;
			i = skipped;
			continue;
		}
		const ch = content[i];
		if (ch === ";") {
			const decl = parseDeclarationSegment(content, tokenStart, i + 1, lineOffsets);
			if (decl) declarations.push(decl);
			i++;
			tokenStart = i;
			continue;
		}
		if (ch === "{") {
			if (i > start && content[i - 1] === "#") {
				i = scanBalancedBraces(content, i + 1, end, 1).end;
				continue;
			}
			const { selStart, selEnd } = trimSelectorRange(content, tokenStart, i);
			const selector = content.slice(selStart, selEnd).trim();
			const balanced = scanBalancedBraces(content, i + 1, end, 1);
			const bodyStart = i + 1;
			const bodyEnd = Math.max(bodyStart, balanced.end - 1);
			const inner = parseScssBlockNodes(content, bodyStart, bodyEnd, lineOffsets);
			children.push({
				selector,
				isAtRule: selector.startsWith("@"),
				selectorStartOffset: selStart,
				selectorEndOffset: selEnd,
				bodyStartOffset: bodyStart,
				bodyEndOffset: bodyEnd,
				line: getLineFromRawOffsets(lineOffsets, selStart),
				declarations: inner.declarations,
				children: inner.children
			});
			i = balanced.end;
			tokenStart = i;
			continue;
		}
		i++;
	}
	if (tokenStart < end) {
		const decl = parseDeclarationSegment(content, tokenStart, end, lineOffsets);
		if (decl) declarations.push(decl);
	}
	return {
		declarations,
		children
	};
}
function walkScssRules(nodes, visitor) {
	for (const node of nodes) {
		visitor(node, nodes);
		if (node.children.length > 0) walkScssRules(node.children, visitor);
	}
}
function isSingleWordValue(rawValue) {
	const words = valueParser(rawValue.trim()).nodes.filter((n) => n.type !== "space" && n.type !== "comment");
	if (words.length === 1 && words[0].type === "word") return words[0].value.toLowerCase();
	if (words.length === 2 && words[0].type === "word" && words[1].type === "word" && words[1].value.toLowerCase() === "!important") return words[0].value.toLowerCase();
	return "";
}
const FULL_VIEWPORT_HEIGHT_PROPS = /* @__PURE__ */ new Set([
	"height",
	"min-height",
	"block-size",
	"min-block-size"
]);
const OVERFLOW_CLIP_PROPS = /* @__PURE__ */ new Set([
	"overflow",
	"overflow-x",
	"overflow-y"
]);
const OUTLINE_REMOVED_SET = /* @__PURE__ */ new Set([
	"none",
	"0",
	"0px"
]);
const FOCUS_REPLACEMENT_PROPS = /* @__PURE__ */ new Set([
	"box-shadow",
	"border",
	"border-color",
	"background",
	"background-color"
]);
const UNIVERSAL_EXPENSIVE_PROPS = /* @__PURE__ */ new Set([
	"will-change",
	"filter",
	"backdrop-filter"
]);
function checkViewportUnitsOnRule(rule, lineOffset, ms, findings) {
	let mutated = false;
	for (const decl of rule.declarations) {
		const word = isSingleWordValue(decl.value);
		if ((decl.prop === "width" || decl.prop === "inline-size") && word === "100vw") {
			findings.push({
				ruleId: "scss-viewport-overflow-and-dvh",
				line: lineOffset + decl.line - 1,
				message: `${decl.prop}: 100vw includes vertical scrollbar width and causes horizontal overflow. Use 100% or 100dvw.`,
				fixable: true
			});
			if (ms) {
				const nextVal = decl.value.replace(/\b100vw\b/i, "100%");
				ms.overwrite(decl.valueStartOffset, decl.valueEndOffset, nextVal);
				mutated = true;
			}
		} else if (FULL_VIEWPORT_HEIGHT_PROPS.has(decl.prop) && word === "100vh") {
			if (rule.declarations.some((d) => d.prop === decl.prop && isSingleWordValue(d.value) === "100dvh")) continue;
			findings.push({
				ruleId: "scss-viewport-overflow-and-dvh",
				line: lineOffset + decl.line - 1,
				message: `Static ${decl.prop}: 100vh overflows mobile browser toolbars. Use dynamic viewport unit 100dvh.`,
				fixable: true
			});
			if (ms) {
				const nextVal = decl.value.replace(/\b100vh\b/i, "100dvh");
				ms.overwrite(decl.valueStartOffset, decl.valueEndOffset, nextVal);
				mutated = true;
			}
		}
	}
	return mutated;
}
function checkOverflowClipMarginOnRule(rule, lineOffset, ms, findings) {
	const clipMarginDecl = rule.declarations.find((d) => d.prop === "overflow-clip-margin");
	if (!clipMarginDecl) return false;
	if (rule.declarations.some((d) => OVERFLOW_CLIP_PROPS.has(d.prop) && d.value.toLowerCase().includes("clip"))) return false;
	const hiddenDecl = rule.declarations.find((d) => d.prop === "overflow" && isSingleWordValue(d.value) === "hidden");
	findings.push({
		ruleId: "scss-overflow-clip-margin-trap",
		line: lineOffset + clipMarginDecl.line - 1,
		message: "overflow-clip-margin has no effect unless overflow: clip is set on the same element.",
		fixable: true
	});
	if (ms) {
		if (hiddenDecl) {
			const replaced = hiddenDecl.value.replace(/\bhidden\b/i, "clip");
			ms.overwrite(hiddenDecl.valueStartOffset, hiddenDecl.valueEndOffset, replaced);
		} else ms.appendRight(clipMarginDecl.endOffset, " overflow: clip;");
		return true;
	}
	return false;
}
function checkPreferUserInvalidOnRule(rule, lineOffset, ms, findings) {
	if (rule.isAtRule) return false;
	if (!/(?<!:):invalid\b/.test(rule.selector)) return false;
	if (rule.selector.includes(":placeholder-shown")) return false;
	findings.push({
		ruleId: "scss-prefer-user-invalid",
		line: lineOffset + rule.line - 1,
		message: "Selector uses :invalid which styles untouched required inputs as errors on page load. Prefer :user-invalid.",
		fixable: true
	});
	if (ms) {
		const newSelector = rule.selector.replace(/(?<!:):invalid\b/g, ":user-invalid");
		ms.overwrite(rule.selectorStartOffset, rule.selectorEndOffset, newSelector);
		return true;
	}
	return false;
}
function checkFocusOutlineRemovalOnRule(rule, siblings, lineOffset, ms, findings) {
	if (rule.isAtRule) return false;
	if (!/:focus(?:-visible)?\b/.test(rule.selector)) return false;
	if (rule.selector.includes(":not(:focus-visible)")) return false;
	const outlineDecl = rule.declarations.find((d) => d.prop === "outline" && OUTLINE_REMOVED_SET.has(isSingleWordValue(d.value)));
	if (!outlineDecl) return false;
	if (rule.declarations.some((d) => FOCUS_REPLACEMENT_PROPS.has(d.prop) && isSingleWordValue(d.value) !== "none" && isSingleWordValue(d.value) !== "transparent")) return false;
	if (siblings.some((s) => s !== rule && s.selector.includes(":focus-visible") && s.declarations.length > 0)) return false;
	const hasBareFocus = /(?<!:):focus(?!-visible|-within)\b/.test(rule.selector);
	findings.push({
		ruleId: "scss-focus-outline-removal",
		line: lineOffset + outlineDecl.line - 1,
		message: "Focus outline removed (outline: none/0) without a custom high-contrast focus indicator or :focus-visible guard (WCAG 2.4.7).",
		fixable: hasBareFocus
	});
	if (ms && hasBareFocus) {
		const newSelector = rule.selector.replace(/,\s*[^,]*:focus-visible\b/g, "").replace(/(?<!:):focus(?!-visible|-within)\b/g, ":focus:not(:focus-visible)");
		ms.overwrite(rule.selectorStartOffset, rule.selectorEndOffset, newSelector);
		return true;
	}
	return false;
}
function checkUnclampedViewportFontOnRule(rule, lineOffset, ms, findings) {
	let mutated = false;
	for (const decl of rule.declarations) {
		if (decl.prop !== "font-size") continue;
		const parsed = valueParser(decl.value.trim());
		let bareViewportToken = null;
		for (const node of parsed.nodes) if (node.type === "word" && /^(\d+(?:\.\d+)?)(?:vw|vh|vmin|vmax)$/i.test(node.value)) {
			bareViewportToken = node.value;
			break;
		}
		if (!bareViewportToken) continue;
		findings.push({
			ruleId: "typography-unclamped-viewport-font",
			line: lineOffset + decl.line - 1,
			message: `font-size: ${bareViewportToken} uses unclamped viewport units, preventing browser text zoom (WCAG 1.4.4). Wrap in clamp().`,
			fixable: true
		});
		if (ms) {
			ms.overwrite(decl.valueStartOffset, decl.valueEndOffset, `clamp(1rem, calc(0.5rem + ${bareViewportToken}), 2.5rem)`);
			mutated = true;
		}
	}
	return mutated;
}
function checkFlexboxDeadPropertiesOnRule(rule, lineOffset, ms, findings) {
	if (!rule.declarations.some((d) => d.prop === "display" && (isSingleWordValue(d.value) === "flex" || isSingleWordValue(d.value) === "inline-flex"))) return false;
	const justifySelfDecl = rule.declarations.find((d) => d.prop === "justify-self");
	if (!justifySelfDecl) return false;
	findings.push({
		ruleId: "scss-flexbox-dead-properties",
		line: lineOffset + justifySelfDecl.line - 1,
		message: "justify-self has no effect in Flexbox containers (CSS Box Alignment). Use justify-content on the flex container or margin-inline-start: auto on the item.",
		fixable: true
	});
	if (ms) {
		ms.remove(justifySelfDecl.startOffset, justifySelfDecl.endOffset);
		return true;
	}
	return false;
}
function checkUniversalExpensiveSelectorsOnRule(rule, lineOffset, ms, findings) {
	if (rule.isAtRule) return false;
	if (rule.selector.trim() !== "*") return false;
	const expensiveDecl = rule.declarations.find((d) => d.prop === "text-wrap" && (isSingleWordValue(d.value) === "balance" || isSingleWordValue(d.value) === "pretty") || UNIVERSAL_EXPENSIVE_PROPS.has(d.prop));
	if (!expensiveDecl) return false;
	const isOnlyTextWrapBalance = rule.declarations.length === 1 && expensiveDecl.prop === "text-wrap" && isSingleWordValue(expensiveDecl.value) === "balance";
	findings.push({
		ruleId: "scss-universal-expensive-selectors",
		line: lineOffset + expensiveDecl.line - 1,
		message: `Expensive layout/compositor property '${expensiveDecl.prop}: ${expensiveDecl.value.trim()}' applied to universal selector '*'. Scope to specific elements.`,
		fixable: true
	});
	if (ms) {
		if (isOnlyTextWrapBalance) ms.overwrite(rule.selectorStartOffset, rule.selectorEndOffset, "h1, h2, h3, h4, h5, h6");
		else ms.remove(expensiveDecl.startOffset, expensiveDecl.endOffset);
		return true;
	}
	return false;
}
function checkDarkModeColorScheme(topNodes, lineOffset, ms, findings) {
	if (!topNodes.some((n) => n.isAtRule && /prefers-color-scheme\s*:\s*dark/i.test(n.selector))) return false;
	const rootRule = topNodes.find((n) => !n.isAtRule && (n.selector === ":root" || n.selector === "html"));
	if (!rootRule) return false;
	let hasColorScheme = false;
	walkScssRules(topNodes, (r) => {
		if (r.declarations.some((d) => d.prop === "color-scheme")) hasColorScheme = true;
	});
	if (hasColorScheme) return false;
	findings.push({
		ruleId: "dark-mode-color-scheme-missing",
		line: lineOffset + rootRule.line - 1,
		message: "Stylesheet defines @media (prefers-color-scheme: dark) but :root lacks color-scheme: light dark, leaving native scrollbars and form controls unstyled.",
		fixable: true
	});
	if (ms) {
		ms.appendRight(rootRule.bodyStartOffset, "\n  color-scheme: light dark;");
		return true;
	}
	return false;
}
function analyzeModernScss(styleContent, lineOffset, enableFix) {
	const lineOffsets = computeRawLineOffsets(styleContent);
	const parsed = parseScssBlockNodes(styleContent, 0, styleContent.length, lineOffsets);
	const ms = enableFix ? new MagicString(styleContent) : null;
	const findings = [];
	let mutated = false;
	walkScssRules(parsed.children, (rule, siblings) => {
		if (checkViewportUnitsOnRule(rule, lineOffset, ms, findings)) mutated = true;
		if (checkOverflowClipMarginOnRule(rule, lineOffset, ms, findings)) mutated = true;
		if (checkPreferUserInvalidOnRule(rule, lineOffset, ms, findings)) mutated = true;
		if (checkFocusOutlineRemovalOnRule(rule, siblings, lineOffset, ms, findings)) mutated = true;
		if (checkUnclampedViewportFontOnRule(rule, lineOffset, ms, findings)) mutated = true;
		if (checkFlexboxDeadPropertiesOnRule(rule, lineOffset, ms, findings)) mutated = true;
		if (checkUniversalExpensiveSelectorsOnRule(rule, lineOffset, ms, findings)) mutated = true;
	});
	if (checkDarkModeColorScheme(parsed.children, lineOffset, ms, findings)) mutated = true;
	return {
		findings,
		fixedContent: mutated && ms ? ms.toString() : void 0
	};
}
export { MODERN_SCSS_RULES, analyzeModernScss, parseScssBlockNodes };
