import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isPathExempt } from "../../core/reportUtils.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { BaseAuditor, FileScanAuditor, LIGHT_RULE_CAPABILITIES, createUniformRemediationPhases, createUniformRuleCapabilities, resolveFileScanRoots } from "../../core/auditorBase.js";
import "../../core/safePath.js";
import { parseVueSfc as parseVueSfcBlocks } from "../../core/vueSfcParser.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
//#region src/suites/performance/validate_web_performance.ts
enableCompileCache();
const WEB_PERFORMANCE_RULES = [
	"unoptimized-images",
	"font-display-missing",
	"inline-svg-bloat",
	"css-render-blocking",
	"excessive-dom-depth",
	"layout-shift-dimensions",
	"uncompressed-video"
];
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
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options);
		const config = getAuditConfig(effectiveRoot);
		super({
			usesThirdPartyTool: false,
			id: "validate_web_performance",
			name: "Web Performance & Core Web Vitals Auditor",
			description: "Rendimiento web, Core Web Vitals y optimización frontend",
			family: "performance",
			packageName: "WebPerf",
			icon: "⚡",
			configKey: "webPerformance.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			roots: targetRoots,
			allowedExtensions: SCANNABLE_EXTS,
			ruleIds: WEB_PERFORMANCE_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(WEB_PERFORMANCE_RULES, "behavior"),
			ruleDescriptions: {
				"unoptimized-images": "Imagen sin compresión moderna WebP",
				"font-display-missing": "@font-face sin font-display swap",
				"inline-svg-bloat": "SVG inline excesivo superando 2KB",
				"css-render-blocking": "Recurso CSS o script bloqueante en head",
				"excessive-dom-depth": "Anidamiento DOM excesivo > 16 niveles",
				"layout-shift-dimensions": "img o video sin width o height explícito",
				"uncompressed-video": "video sin preload none o formato webm"
			},
			ruleRemediations: {
				"unoptimized-images": "Guía de diagnóstico y remediación para unoptimized-images. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"font-display-missing": "Guía de diagnóstico y remediación para font-display-missing. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"inline-svg-bloat": "Guía de diagnóstico y remediación para inline-svg-bloat. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"css-render-blocking": "Guía de diagnóstico y remediación para css-render-blocking. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"excessive-dom-depth": "Guía de diagnóstico y remediación para excessive-dom-depth. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"layout-shift-dimensions": "Guía de diagnóstico y remediación para layout-shift-dimensions. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"uncompressed-video": "Guía de diagnóstico y remediación para uncompressed-video. Revisa la incidencia detectada y ajusta el código correspondiente."
			},
			ruleCapabilities: createUniformRuleCapabilities(WEB_PERFORMANCE_RULES, LIGHT_RULE_CAPABILITIES),
			projectRoot: effectiveRoot,
			coverage: deriveCoverageFromRoots(targetRoots, SCANNABLE_EXTS, effectiveRoot),
			exemptPaths: config.webPerformance?.exemptPaths
		});
		this.exemptSvgPaths = config.webPerformance?.exemptSvgPaths ?? [];
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
	}
	auditUnoptimizedImages(relPath, content) {
		if (content.includes("unoptimized-img-ok")) return;
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
					message: `Imagen '${src}' con formato tradicional sin compresión moderna WebP/AVIF ni decoding="async"`,
					file: relPath,
					line
				});
			}
		}
	}
	auditFontDisplayMissing(relPath, content) {
		if (content.includes("font-display-ok")) return;
		const fontFaceRegex = /@font-face\s*\{([^}]*)\}/gi;
		let match;
		while ((match = fontFaceRegex.exec(content)) !== null) {
			const block = match[1] ?? "";
			if (!/font-display\s*:\s*(swap|optional|fallback)/i.test(block)) {
				const line = this.getLineNumber(content, match.index);
				this.addViolation({
					ruleId: "font-display-missing",
					severity: "error",
					message: "Declaración @font-face sin font-display: swap u optional (riesgo de FOIT)",
					file: relPath,
					line
				});
			}
		}
	}
	auditInlineSvgBloat(relPath, content) {
		if (content.includes("svg-bloat-ok")) return;
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
					message: `SVG inline excesivo (${svgContent.length} caracteres) superando el límite de ${maxSvgSize} bytes; extraer como asset`,
					file: relPath,
					line
				});
			}
		}
	}
	auditCssRenderBlocking(relPath, content) {
		if (content.includes("render-blocking-ok")) return;
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
					message: "Hoja de estilos externa síncrona en head bloqueando el primer renderizado",
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
					message: "Script externo síncrono sin atributo defer, async o type=\"module\"",
					file: relPath,
					line
				});
			}
		}
	}
	auditExcessiveDomDepth(relPath, content) {
		if (content.includes("dom-depth-ok")) return;
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
				message: `Anidamiento DOM excesivo (${maxDepth} niveles > ${maxAllowedDepth}) provocando sobrecarga de layout`,
				file: relPath,
				line
			});
		}
	}
	auditLayoutShiftDimensions(relPath, content) {
		if (content.includes("layout-dimensions-ok")) return;
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
					message: `Elemento <${tag}> sin dimensiones width y height explícitas (riesgo de CLS)`,
					file: relPath,
					line
				});
			}
		}
	}
	auditUncompressedVideo(relPath, content) {
		if (content.includes("uncompressed-video-ok")) return;
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
					message: "Elemento video con formato no comprimido (.mov/.avi); utilizar MP4 o WebM moderno",
					file: relPath,
					line
				});
			} else if (!hasPreload && !hasWebm) {
				const line = this.getLineNumber(content, match.index);
				this.addViolation({
					ruleId: "uncompressed-video",
					severity: "error",
					message: "Elemento <video> sin preload=\"none\" ni fuente en formato WebM optimizado",
					file: relPath,
					line
				});
			}
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateWebPerformanceAuditor());
//#endregion
export { ValidateWebPerformanceAuditor, WEB_PERFORMANCE_RULES };
