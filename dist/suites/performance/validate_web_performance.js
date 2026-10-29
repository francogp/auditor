import { isPathExempt } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/safePath.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { BaseAuditor, FileScanAuditor, LIGHT_RULE_CAPABILITIES, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { parseVueSfc as parseVueSfcBlocks } from "../../core/vueSfcParser.js";
import { MODERN_WEB_PERF_RULES, analyzeModernWebPerfMarkup, analyzeModernWebPerfStyles } from "../../analyzers/webPerfModernAnalyzer.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
// src/suites/performance/validate_web_performance.ts
enableCompileCache();
const WEB_PERFORMANCE_RULES = [
	"unoptimized-images",
	"font-display-missing",
	"inline-svg-bloat",
	"css-render-blocking",
	"excessive-dom-depth",
	"layout-shift-dimensions",
	"uncompressed-video",
	...MODERN_WEB_PERF_RULES
];
const FIXABLE_WEB_PERF_RULES = [...MODERN_WEB_PERF_RULES];
const SCANNABLE_EXTS = /* @__PURE__ */ new Set([
	".vue",
	".html",
	".htm",
	".jsx",
	".tsx",
	".css",
	".scss"
]);
const MAX_RECOMMENDED_DOM_DEPTH = 16;
var ValidateWebPerformanceAuditor = class extends FileScanAuditor {
	exemptSvgPaths;
	constructor(options = {}) {
		const webRoots = resolveFileScanRoots(options);
		const webConfig = getAuditConfig(webRoots.effectiveRoot);
		super({
			id: "validate_web_performance",
			name: "Web Performance & Core Web Vitals Auditor",
			description: "Web performance, Core Web Vitals, and frontend optimization",
			family: "performance",
			packageName: "WebPerf",
			icon: "⚡",
			configKey: "webPerformance.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			requiredPermissions: [],
			usesThirdPartyTool: false,
			fix: options.fix,
			roots: webRoots.targetRoots,
			allowedExtensions: SCANNABLE_EXTS,
			ruleIds: WEB_PERFORMANCE_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(WEB_PERFORMANCE_RULES, "behavior"),
			ruleDescriptions: {
				"unoptimized-images": "Image without modern WebP compression",
				"font-display-missing": "@font-face without font-display swap",
				"inline-svg-bloat": "Inline SVG exceeding 2KB",
				"css-render-blocking": "Render-blocking CSS or script in head",
				"excessive-dom-depth": "Excessive DOM depth > 16 levels",
				"layout-shift-dimensions": "Media element missing width/height",
				"uncompressed-video": "Video missing preload=\"none\" or webm",
				"perf-lcp-lazy-conflict": "LCP image with loading=\"lazy\"",
				"perf-font-preload-crossorigin": "Preloaded font missing crossorigin",
				"perf-srcset-missing-sizes": "srcset width descriptor missing sizes",
				"perf-content-visibility-intrinsic-size": "content-visibility missing intrinsic size"
			},
			ruleRemediations: {
				"unoptimized-images": "📖 REMEDIATION GUIDE: unoptimized-images\n1. Root Cause: A legacy raster image (`.png`, `.jpg`, `.jpeg`) was included without modern compression (`.webp`, `.avif`) or the `decoding=\"async\"` attribute. Legacy formats increase transfer weight and hurt LCP (Largest Contentful Paint).\n2. Diagnosis: Locate the `<img>` tag in the reported template.\n3. Canonical Solution:\n   a) Convert the image to `.webp` or `.avif` format.\n   b) Add performance attributes: `loading=\"lazy\"` and `decoding=\"async\"`.\n4. Example / Auto-fix command:\n   ❌ Legacy:    `<img src=\"/hero.png\">`\n   ✅ Optimized: `<img src=\"/hero.webp\" loading=\"lazy\" decoding=\"async\" alt=\"Hero\">`",
				"font-display-missing": "📖 REMEDIATION GUIDE: font-display-missing\n1. Root Cause: An `@font-face` rule lacks the `font-display: swap` or `font-display: optional` property. This blocks text rendering while the web font is downloading, causing Flash of Invisible Text (FOIT).\n2. Diagnosis: Inspect the `@font-face` declaration in the reported stylesheet.\n3. Canonical Solution: Add `font-display: swap;` inside the `@font-face` definition block.\n4. Example / Auto-fix command:\n   - CSS: `@font-face { font-family: \"CustomFont\"; src: url(...); font-display: swap; }`",
				"inline-svg-bloat": "📖 REMEDIATION GUIDE: inline-svg-bloat\n1. Root Cause: A large inline SVG (> 2KB) was embedded directly inside the HTML/Vue template. Giant SVGs bloat JS/HTML bundle sizes and prevent browser HTTP caching.\n2. Diagnosis: Check the `<svg>` block in the component template.\n3. Canonical Solution:\n   a) Move the SVG to an external asset in `src/assets/` or `public/` and load it via `<img src=\"/icon.svg\" ...>`.\n   b) If CSS coloring is required, use a CSS mask: `mask: url(/icon.svg)` or an SVG sprite system.\n4. Example / Auto-fix command:\n   ❌ 15KB inline SVG in Vue template.\n   ✅ External image: `<img src=\"@/assets/illustration.svg\" alt=\"Illustration\">`",
				"css-render-blocking": "📖 REMEDIATION GUIDE: css-render-blocking\n1. Root Cause: An external stylesheet or script tag was found in `<head>` that blocks browser rendering without `async`, `defer`, or non-critical media queries.\n2. Diagnosis: Locate the `<link rel=\"stylesheet\">` or `<script>` tag in `index.html`.\n3. Canonical Solution: Add `defer` or `async` to scripts, or load secondary fonts/styles using `media=\"print\" onload=\"this.media='all'\"`.\n4. Example / Auto-fix command:\n   ❌ Blocking:    `<script src=\"/analytics.js\"><\/script>`\n   ✅ Non-blocking: `<script src=\"/analytics.js\" async defer><\/script>`",
				"excessive-dom-depth": "📖 REMEDIATION GUIDE: excessive-dom-depth\n1. Root Cause: The component markup has a DOM depth exceeding 16 levels. Deep DOM trees slow down style recalculations and overload the accessibility tree.\n2. Diagnosis: Examine nested `<div>` containers in the component template.\n3. Canonical Solution: Flatten the HTML hierarchy by removing redundant containers or break the component down into smaller modular subcomponents.\n4. Example / Auto-fix command:\n   - Remove redundant wrapper elements that only apply a layout class.",
				"layout-shift-dimensions": "📖 REMEDIATION GUIDE: layout-shift-dimensions\n1. Root Cause: An `<img>` or `<video>` tag lacks explicit `width` and `height` attributes (or CSS `aspect-ratio`). When the media loads, surrounding content shifts, causing Cumulative Layout Shift (CLS).\n2. Diagnosis: Inspect the `<img>` or `<video>` tag in the template.\n3. Canonical Solution: Always specify `width` and `height` attributes matching intrinsic dimensions, or declare `aspect-ratio` via CSS.\n4. Example / Auto-fix command:\n   ❌ Missing dimensions: `<img src=\"/banner.webp\" />`\n   ✅ With dimensions:    `<img src=\"/banner.webp\" width=\"800\" height=\"400\" />`",
				"uncompressed-video": "📖 REMEDIATION GUIDE: uncompressed-video\n1. Root Cause: A `<video>` tag lacks `preload=\"none\"` or `preload=\"metadata\"`, or does not offer a modern WebM source (`<source type=\"video/webm\">`). Preloading full video files wastes client bandwidth.\n2. Diagnosis: Locate the `<video>` tag in the template.\n3. Canonical Solution: Add `preload=\"metadata\"` and provide modern WebM and MP4 sources.\n4. Example / Auto-fix command:\n   ❌ Inefficient: `<video src=\"/intro.mp4\" autoplay>`\n   ✅ Optimized:   `<video preload=\"metadata\" playsinline><source src=\"/intro.webm\" type=\"video/webm\" /></video>`",
				"perf-lcp-lazy-conflict": "📖 REMEDIATION GUIDE: perf-lcp-lazy-conflict\n1. Root Cause: An `<img>` combines `loading=\"lazy\"` with `fetchpriority=\"high\"`. Lazy-loading defers resource fetching until layout intersection, directly sabotaging the LCP priority hint.\n2. Diagnosis: Inspect the `<img>` tag at the reported line.\n3. Canonical Solution: Remove `loading=\"lazy\"` from high-priority LCP hero images. Run `npm run auditor:fix` to auto-repair.\n4. Example / Auto-fix command:\n   ❌ Conflicting: `<img src=\"/hero.webp\" loading=\"lazy\" fetchpriority=\"high\" width=\"1200\" height=\"600\" alt=\"Hero\">`\n   ✅ Canonical:   `<img src=\"/hero.webp\" fetchpriority=\"high\" width=\"1200\" height=\"600\" alt=\"Hero\">`",
				"perf-font-preload-crossorigin": "📖 REMEDIATION GUIDE: perf-font-preload-crossorigin\n1. Root Cause: A `<link rel=\"preload\" as=\"font\">` omits the `crossorigin` attribute. Web fonts are always fetched in anonymous CORS mode by CSS `@font-face`, so preloading without `crossorigin` causes the browser to download the font twice.\n2. Diagnosis: Inspect `<link rel=\"preload\" as=\"font\">` in `index.html` or templates.\n3. Canonical Solution: Add `crossorigin=\"anonymous\"` to font preload links. Run `npm run auditor:fix` to auto-repair.\n4. Example / Auto-fix command:\n   ❌ Double fetch: `<link rel=\"preload\" href=\"/font.woff2\" as=\"font\" type=\"font/woff2\">`\n   ✅ Single fetch: `<link rel=\"preload\" href=\"/font.woff2\" as=\"font\" type=\"font/woff2\" crossorigin=\"anonymous\">`",
				"perf-srcset-missing-sizes": "📖 REMEDIATION GUIDE: perf-srcset-missing-sizes\n1. Root Cause: An `<img>` or `<source>` uses width descriptors (`w`) in `srcset` without declaring a `sizes` attribute. Without `sizes`, browsers assume `100vw` and download oversized images.\n2. Diagnosis: Locate the `<img>` or `<source>` element with `srcset=\"... 400w, ...\"`.\n3. Canonical Solution: Add `sizes=\"auto\"` (for `loading=\"lazy\"` images) or an explicit viewport media `sizes` attribute. Run `npm run auditor:fix`.\n4. Example / Auto-fix command:\n   ❌ Missing sizes: `<img src=\"/pic-800.webp\" srcset=\"/pic-400.webp 400w, /pic-800.webp 800w\" loading=\"lazy\" width=\"800\" height=\"600\" alt=\"Pic\">`\n   ✅ With sizes:    `<img src=\"/pic-800.webp\" srcset=\"/pic-400.webp 400w, /pic-800.webp 800w\" sizes=\"auto\" loading=\"lazy\" width=\"800\" height=\"600\" alt=\"Pic\">`",
				"perf-content-visibility-intrinsic-size": "📖 REMEDIATION GUIDE: perf-content-visibility-intrinsic-size\n1. Root Cause: A CSS rule declares `content-visibility: auto` without `contain-intrinsic-size`, causing offscreen containers to collapse to `0px` height and making the scrollbar jump during scrolling.\n2. Diagnosis: Inspect the CSS rule with `content-visibility: auto`.\n3. Canonical Solution: Pair `content-visibility: auto` with `contain-intrinsic-size: auto 500px;`. Run `npm run auditor:fix`.\n4. Example / Auto-fix command:\n   ❌ Collapsed: `.section { content-visibility: auto; }`\n   ✅ Reserved:  `.section { content-visibility: auto; contain-intrinsic-size: auto 500px; }`"
			},
			ruleCapabilities: createRuleCapabilities(WEB_PERFORMANCE_RULES, LIGHT_RULE_CAPABILITIES, FIXABLE_WEB_PERF_RULES),
			fixableRuleIds: FIXABLE_WEB_PERF_RULES,
			projectRoot: webRoots.effectiveRoot,
			coverage: deriveCoverageFromRoots(webRoots.targetRoots, SCANNABLE_EXTS, webRoots.effectiveRoot),
			exemptPaths: webConfig.webPerformance?.exemptPaths
		});
		this.exemptSvgPaths = webConfig.webPerformance?.exemptSvgPaths ?? [];
	}
	scanFile(relPath, content) {
		this.runSubAuditorSync("unoptimized-images", () => {
			this.auditUnoptimizedImages(relPath, content);
		});
		this.runSubAuditorSync("font-display-missing", () => {
			this.auditFontDisplayMissing(relPath, content);
		});
		this.runSubAuditorSync("inline-svg-bloat", () => {
			this.auditInlineSvgBloat(relPath, content);
		});
		this.runSubAuditorSync("css-render-blocking", () => {
			this.auditCssRenderBlocking(relPath, content);
		});
		this.runSubAuditorSync("excessive-dom-depth", () => {
			this.auditExcessiveDomDepth(relPath, content);
		});
		this.runSubAuditorSync("layout-shift-dimensions", () => {
			this.auditLayoutShiftDimensions(relPath, content);
		});
		this.runSubAuditorSync("uncompressed-video", () => {
			this.auditUncompressedVideo(relPath, content);
		});
		this.auditModernWebPerformanceRules(relPath, content);
	}
	collectVueModernWebPerf(content, isFix) {
		const sfc = parseVueSfcBlocks(content);
		const findings = [];
		let updatedContent = content;
		let mutated = false;
		if (sfc.template) {
			const tplRes = analyzeModernWebPerfMarkup(sfc.template.content, sfc.template.contentStartLine, isFix);
			findings.push(...tplRes.findings);
			if (isFix && tplRes.fixedContent !== void 0) {
				updatedContent = updatedContent.slice(0, sfc.template.contentStartIndex) + tplRes.fixedContent + updatedContent.slice(sfc.template.contentStartIndex + sfc.template.content.length);
				mutated = true;
			}
		} else if (sfc.scripts.length === 0 && sfc.styles.length === 0) {
			const rawRes = analyzeModernWebPerfMarkup(content, 1, isFix);
			findings.push(...rawRes.findings);
			if (isFix && rawRes.fixedContent !== void 0) {
				updatedContent = rawRes.fixedContent;
				mutated = true;
			}
		}
		for (let i = sfc.styles.length - 1; i >= 0; i--) {
			const block = sfc.styles[i];
			const styleRes = analyzeModernWebPerfStyles(block.content, block.contentStartLine, isFix);
			findings.push(...styleRes.findings);
			if (isFix && styleRes.fixedContent !== void 0) {
				updatedContent = updatedContent.slice(0, block.contentStartIndex) + styleRes.fixedContent + updatedContent.slice(block.contentStartIndex + block.content.length);
				mutated = true;
			}
		}
		return {
			findings,
			updatedContent,
			mutated
		};
	}
	auditModernWebPerformanceRules(relPath, content) {
		const ext = path.extname(relPath).toLowerCase();
		const isFix = this.isFixActive();
		const absFile = path.resolve(this.projectRoot, relPath);
		let updatedFileContent = content;
		let fileMutated = false;
		const collectedFindings = [];
		if (ext === ".vue") {
			const vueRes = this.collectVueModernWebPerf(content, isFix);
			collectedFindings.push(...vueRes.findings);
			updatedFileContent = vueRes.updatedContent;
			fileMutated = vueRes.mutated;
		} else if (ext === ".html" || ext === ".htm") {
			const htmlRes = analyzeModernWebPerfMarkup(content, 1, isFix);
			collectedFindings.push(...htmlRes.findings);
			if (isFix && htmlRes.fixedContent !== void 0) {
				updatedFileContent = htmlRes.fixedContent;
				fileMutated = true;
			}
		} else if (ext === ".css" || ext === ".scss") {
			const cssRes = analyzeModernWebPerfStyles(content, 1, isFix);
			collectedFindings.push(...cssRes.findings);
			if (isFix && cssRes.fixedContent !== void 0) {
				updatedFileContent = cssRes.fixedContent;
				fileMutated = true;
			}
		}
		for (const ruleId of MODERN_WEB_PERF_RULES) this.runSubAuditorSync(ruleId, () => {
			for (const item of collectedFindings) {
				if (item.ruleId !== ruleId) continue;
				this.addViolation({
					ruleId: item.ruleId,
					severity: "error",
					message: item.message,
					file: relPath,
					line: item.line
				});
			}
		});
		if (isFix && fileMutated && fs.existsSync(absFile)) fs.writeFileSync(absFile, updatedFileContent, "utf-8");
	}
	auditUnoptimizedImages(relPath, content) {
		const imgRegex = /<img\s+([^>]*)>/gi;
		let match;
		while ((match = imgRegex.exec(content)) !== null) {
			const attrs = match[1] ?? "";
			const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
			if (!srcMatch) continue;
			const src = srcMatch[1];
			const isLegacyRaster = /\.(png|jpe?g|bmp|gif)($|\?)/i.test(src);
			const hasAsyncDecoding = /decoding=["']async["']/i.test(attrs);
			const isModernWebpOrAvif = /\.(webp|avif|svg)($|\?)/i.test(src);
			if (isLegacyRaster && !hasAsyncDecoding && !isModernWebpOrAvif) {
				const line = this.getLineNumber(content, match.index);
				this.addViolation({
					ruleId: "unoptimized-images",
					severity: "error",
					message: `Image '${src}' uses legacy raster format without modern WebP/AVIF compression or decoding="async"`,
					file: relPath,
					line
				});
			}
		}
	}
	auditFontDisplayMissing(relPath, content) {
		const fontFaceRegex = /@font-face\s*\{([^}]*)\}/gi;
		let match;
		while ((match = fontFaceRegex.exec(content)) !== null) {
			const block = match[1] ?? "";
			if (!/font-display\s*:\s*(swap|optional|fallback)/i.test(block)) {
				const line = this.getLineNumber(content, match.index);
				this.addViolation({
					ruleId: "font-display-missing",
					severity: "error",
					message: "@font-face declaration without font-display: swap or optional (risk of FOIT)",
					file: relPath,
					line
				});
			}
		}
	}
	auditInlineSvgBloat(relPath, content) {
		if (isPathExempt(relPath, this.exemptSvgPaths)) return;
		const maxSvgSize = getAuditConfig(this.projectRoot).webPerformance?.maxInlineSvgSize ?? 2048;
		const svgRegex = /<svg[\s>][\s\S]*?<\/svg>/gi;
		let match;
		while ((match = svgRegex.exec(content)) !== null) {
			const svgContent = match[0];
			if (svgContent.length > maxSvgSize || (svgContent.match(/<path[\s>]/gi) ?? []).length > 30) {
				const line = this.getLineNumber(content, match.index);
				this.addViolation({
					ruleId: "inline-svg-bloat",
					severity: "error",
					message: `Excessive inline SVG (${svgContent.length} chars) exceeding ${maxSvgSize} bytes limit; extract as asset`,
					file: relPath,
					line
				});
			}
		}
	}
	auditCssRenderBlocking(relPath, content) {
		const ext = path.extname(relPath).toLowerCase();
		if (ext !== ".html" && ext !== ".htm" && ext !== ".vue") return;
		const linkRegex = /<link\s+([^>]*)>/gi;
		let linkMatch;
		while ((linkMatch = linkRegex.exec(content)) !== null) {
			const attrs = linkMatch[1] ?? "";
			const isStylesheet = /rel=["']stylesheet["']/i.test(attrs);
			const isBlocking = !/media=["']print["']/i.test(attrs) && !/disabled/i.test(attrs);
			if (isStylesheet && isBlocking && content.includes("<head>") && linkMatch.index < (content.indexOf("</head>") === -1 ? content.length : content.indexOf("</head>"))) {
				const line = this.getLineNumber(content, linkMatch.index);
				this.addViolation({
					ruleId: "css-render-blocking",
					severity: "error",
					message: "Synchronous external stylesheet in head blocking first render",
					file: relPath,
					line
				});
			}
		}
		const scriptRegex = /<script\s+([^>]*)>/gi;
		let scriptMatch;
		while ((scriptMatch = scriptRegex.exec(content)) !== null) {
			const attrs = scriptMatch[1] ?? "";
			const hasSrc = /src=["'][^"']+["']/i.test(attrs);
			const isDeferred = /defer/i.test(attrs) || /async/i.test(attrs) || /type=["']module["']/i.test(attrs);
			if (hasSrc && !isDeferred) {
				const line = this.getLineNumber(content, scriptMatch.index);
				this.addViolation({
					ruleId: "css-render-blocking",
					severity: "error",
					message: "Synchronous external script without defer, async, or type=\"module\" attribute",
					file: relPath,
					line
				});
			}
		}
	}
	auditExcessiveDomDepth(relPath, content) {
		const ext = path.extname(relPath).toLowerCase();
		if (ext !== ".html" && ext !== ".htm" && ext !== ".vue") return;
		let targetContent = content;
		let lineOffset = 1;
		if (ext === ".vue") {
			const sfc = parseVueSfcBlocks(content);
			if (sfc.template) {
				lineOffset = sfc.template.contentStartLine;
				targetContent = sfc.template.content;
			} else {
				targetContent = content;
				for (const block of [...sfc.scripts, ...sfc.styles]) targetContent = targetContent.slice(0, block.startIndex) + " ".repeat(block.endIndex - block.startIndex) + targetContent.slice(block.endIndex);
			}
		}
		const maxAllowedDepth = getAuditConfig(this.projectRoot).webPerformance?.maxDomDepth ?? MAX_RECOMMENDED_DOM_DEPTH;
		let maxDepth = 0;
		let currentDepth = 0;
		let maxDepthIndex = 0;
		const tagRegex = /<\/?([\w-]+)(?:\s[^>]*)?\/?>/g;
		let match;
		while ((match = tagRegex.exec(targetContent)) !== null) {
			const fullTag = match[0];
			const tagName = match[1].toLowerCase();
			if ([
				"img",
				"input",
				"br",
				"hr",
				"meta",
				"link",
				"source",
				"path",
				"circle",
				"rect",
				"line",
				"polygon",
				"polyline"
			].includes(tagName)) continue;
			const isClosing = fullTag.startsWith("</");
			const isSelfClosing = fullTag.endsWith("/>");
			if (isClosing) currentDepth = Math.max(0, currentDepth - 1);
			else if (!isSelfClosing) {
				currentDepth++;
				if (currentDepth > maxDepth) {
					maxDepth = currentDepth;
					maxDepthIndex = match.index;
				}
			}
		}
		if (maxDepth > maxAllowedDepth) {
			const line = lineOffset + this.getLineNumber(targetContent, maxDepthIndex) - 1;
			this.addViolation({
				ruleId: "excessive-dom-depth",
				severity: "error",
				message: `Excessive DOM depth (${maxDepth} levels > ${maxAllowedDepth}) causing layout thrashing`,
				file: relPath,
				line
			});
		}
	}
	auditLayoutShiftDimensions(relPath, content) {
		const exemptClasses = getAuditConfig(this.projectRoot).webPerformance?.exemptImgClasses ?? [];
		const mediaRegex = /<(img|video)\s+([^>]*)>/gi;
		let match;
		while ((match = mediaRegex.exec(content)) !== null) {
			const tag = match[1].toLowerCase();
			const attrs = match[2] ?? "";
			if (exemptClasses.length > 0) {
				const classMatch = /class=["']([^"']+)["']/i.exec(attrs);
				if (classMatch) {
					if (classMatch[1].split(/\s+/).some((c) => exemptClasses.includes(c))) continue;
				}
			}
			const hasWidth = /(?:\b|:)width=["']?[^"'\s>]+/i.test(attrs) || /style=["'][^"']*width/i.test(attrs);
			const hasHeight = /(?:\b|:)height=["']?[^"'\s>]+/i.test(attrs) || /style=["'][^"']*height/i.test(attrs);
			const hasAspectRatio = /aspect-ratio/i.test(attrs) || /aspectRatio/i.test(attrs);
			const hasDynamicStyle = /:style=["'][^"']*(?:width|height|aspectRatio)/i.test(attrs);
			if ((!hasWidth || !hasHeight) && !hasAspectRatio && !hasDynamicStyle) {
				const line = this.getLineNumber(content, match.index);
				this.addViolation({
					ruleId: "layout-shift-dimensions",
					severity: "error",
					message: `Element <${tag}> lacks explicit width and height dimensions (risk of CLS)`,
					file: relPath,
					line
				});
			}
		}
	}
	auditUncompressedVideo(relPath, content) {
		const videoRegex = /<video\s+([^>]*)>([\s\S]*?)<\/video>/gi;
		let match;
		while ((match = videoRegex.exec(content)) !== null) {
			const attrs = match[1] ?? "";
			const inner = match[2] ?? "";
			const hasPreload = /preload=["'](none|metadata)["']/i.test(attrs);
			const hasUncompressedSrc = /\.(mov|avi|wmv)(["'?\s>]|$)/i.test(attrs) || /\.(mov|avi|wmv)(["'?\s>]|$)/i.test(inner);
			const hasWebm = /type=["']video\/webm["']/i.test(inner) || /\.webm(["'?\s>]|$)/i.test(attrs);
			if (hasUncompressedSrc) {
				const line = this.getLineNumber(content, match.index);
				this.addViolation({
					ruleId: "uncompressed-video",
					severity: "error",
					message: "Video element with uncompressed container (.mov/.avi); use modern MP4 or WebM",
					file: relPath,
					line
				});
			} else if (!hasPreload && !hasWebm) {
				const line = this.getLineNumber(content, match.index);
				this.addViolation({
					ruleId: "uncompressed-video",
					severity: "error",
					message: "Video element <video> without preload=\"none\" or optimized WebM source",
					file: relPath,
					line
				});
			}
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateWebPerformanceAuditor());
export { ValidateWebPerformanceAuditor, WEB_PERFORMANCE_RULES };
