import { computeRawLineOffsets, getAttrLocation, parseDomWithLocations } from "./modernDomAstUtils.js";
import { parseScssBlockNodes } from "./scssModernAnalyzer.js";
import MagicString from "magic-string";
// src/analyzers/webPerfModernAnalyzer.ts
const MODERN_WEB_PERF_RULES = [
	"perf-lcp-lazy-conflict",
	"perf-font-preload-crossorigin",
	"perf-srcset-missing-sizes",
	"perf-content-visibility-intrinsic-size"
];
const INTRINSIC_SIZE_PROPS = /* @__PURE__ */ new Set([
	"contain-intrinsic-size",
	"contain-intrinsic-block-size",
	"contain-intrinsic-height"
]);
function checkLcpLazyConflict(doc, dom, markup, lineOffset, ms, findings) {
	let mutated = false;
	const images = doc.querySelectorAll("img");
	for (const img of images) {
		const loading = img.getAttribute("loading")?.toLowerCase();
		const priority = img.getAttribute("fetchpriority")?.toLowerCase();
		if (loading !== "lazy" || priority !== "high") continue;
		const loc = dom.nodeLocation(img);
		const loadingLoc = getAttrLocation(loc, "loading");
		const line = lineOffset + (loadingLoc?.startLine ?? loc?.startLine ?? 1) - 1;
		findings.push({
			ruleId: "perf-lcp-lazy-conflict",
			line,
			message: "Element <img> combines loading=\"lazy\" with fetchpriority=\"high\", delaying LCP resource discovery.",
			fixable: Boolean(loadingLoc)
		});
		if (ms && loadingLoc) {
			const removeStart = loadingLoc.startOffset > 0 && /\s/.test(markup[loadingLoc.startOffset - 1] ?? "") ? loadingLoc.startOffset - 1 : loadingLoc.startOffset;
			ms.remove(removeStart, loadingLoc.endOffset);
			mutated = true;
		}
	}
	return mutated;
}
function checkFontPreloadCrossorigin(doc, dom, markup, lineOffset, ms, findings) {
	let mutated = false;
	const links = doc.querySelectorAll("link[rel=\"preload\"]");
	for (const link of links) {
		if (link.getAttribute("as")?.toLowerCase() !== "font") continue;
		if (link.hasAttribute("crossorigin")) continue;
		const loc = dom.nodeLocation(link);
		const startTag = loc?.startTag;
		const line = lineOffset + (startTag?.startLine ?? loc?.startLine ?? 1) - 1;
		findings.push({
			ruleId: "perf-font-preload-crossorigin",
			line,
			message: "<link rel=\"preload\" as=\"font\"> omits crossorigin attribute, causing the browser to download the font twice.",
			fixable: Boolean(startTag)
		});
		if (ms && startTag) {
			ms.appendLeft(startTag.startOffset + 5, " crossorigin=\"anonymous\"");
			const fpLoc = getAttrLocation(loc, "fetchpriority");
			if (fpLoc && link.getAttribute("fetchpriority")?.toLowerCase() === "high") {
				const removeStart = fpLoc.startOffset > 0 && /\s/.test(markup[fpLoc.startOffset - 1] ?? "") ? fpLoc.startOffset - 1 : fpLoc.startOffset;
				ms.remove(removeStart, fpLoc.endOffset);
			}
			mutated = true;
		}
	}
	return mutated;
}
function checkSrcsetMissingSizes(doc, dom, lineOffset, ms, findings) {
	let mutated = false;
	const elements = doc.querySelectorAll("img[srcset], source[srcset]");
	for (const el of elements) {
		const srcset = el.getAttribute("srcset") ?? "";
		if (!/\b\d+w\b/.test(srcset)) continue;
		if (el.hasAttribute("sizes") || el.hasAttribute(":sizes") || el.hasAttribute("v-bind:sizes")) continue;
		if (el.tagName.toLowerCase() === "source" && el.parentElement?.querySelector("img[sizes]")) continue;
		const loc = dom.nodeLocation(el);
		const startTag = loc?.startTag;
		const line = lineOffset + (startTag?.startLine ?? loc?.startLine ?? 1) - 1;
		const tagLower = el.tagName.toLowerCase();
		findings.push({
			ruleId: "perf-srcset-missing-sizes",
			line,
			message: `<${tagLower}> uses width descriptors in srcset without a sizes attribute, forcing 100vw image downloads.`,
			fixable: Boolean(startTag)
		});
		if (ms && startTag) {
			const defaultSizes = el.getAttribute("loading")?.toLowerCase() === "lazy" ? " sizes=\"auto\"" : " sizes=\"100vw\"";
			ms.appendLeft(startTag.startOffset + tagLower.length + 1, defaultSizes);
			mutated = true;
		}
	}
	return mutated;
}
function analyzeModernWebPerfMarkup(markupContent, lineOffset, enableFix) {
	const dom = parseDomWithLocations(markupContent);
	const doc = dom.window.document;
	const ms = enableFix ? new MagicString(markupContent) : null;
	const findings = [];
	const m1 = checkLcpLazyConflict(doc, dom, markupContent, lineOffset, ms, findings);
	const m2 = checkFontPreloadCrossorigin(doc, dom, markupContent, lineOffset, ms, findings);
	const m3 = checkSrcsetMissingSizes(doc, dom, lineOffset, ms, findings);
	return {
		findings,
		fixedContent: (m1 || m2 || m3) && ms ? ms.toString() : void 0
	};
}
function walkCssRules(nodes, visitor) {
	for (const node of nodes) {
		visitor(node);
		if (node.children.length > 0) walkCssRules(node.children, visitor);
	}
}
function analyzeModernWebPerfStyles(styleContent, lineOffset, enableFix) {
	const rootBlock = parseScssBlockNodes(styleContent, 0, styleContent.length, computeRawLineOffsets(styleContent));
	const findings = [];
	let mutated = false;
	const ms = enableFix ? new MagicString(styleContent) : null;
	walkCssRules(rootBlock.children, (rule) => {
		const cvDecl = rule.declarations.find((d) => d.prop === "content-visibility" && d.value.trim().toLowerCase().startsWith("auto"));
		if (!cvDecl) return;
		if (rule.declarations.some((d) => INTRINSIC_SIZE_PROPS.has(d.prop))) return;
		findings.push({
			ruleId: "perf-content-visibility-intrinsic-size",
			line: lineOffset + cvDecl.line - 1,
			message: "CSS rule sets content-visibility: auto without contain-intrinsic-size, causing offscreen height collapse and scrollbar jumping.",
			fixable: true
		});
		if (ms) {
			ms.appendRight(cvDecl.endOffset, " contain-intrinsic-size: auto 500px;");
			mutated = true;
		}
	});
	return {
		findings,
		fixedContent: mutated && ms ? ms.toString() : void 0
	};
}
export { MODERN_WEB_PERF_RULES, analyzeModernWebPerfMarkup, analyzeModernWebPerfStyles };
