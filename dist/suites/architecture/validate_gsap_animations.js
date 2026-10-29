import { normalizePosixPath } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { matchesAnyRoot } from "../../core/auditRootMatcher.js";
import "../../core/safePath.js";
import { isInCodeRoots } from "../../core/auditCodeRoots.js";
import { isExemptFile } from "../../core/auditPathPredicates.js";
import "../../core/auditConfig.js";
import "../../core/auditedDocument.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { advancePastStringOrComment, scanBalancedBraces, scanBalancedParens } from "../../core/scannerUtils.js";
import { parseVueSfc as parseVueSfcBlocks } from "../../core/vueSfcParser.js";
import { isCommentLine } from "../../analyzers/auditRuleTypes.js";
import { enableCompileCache } from "node:module";
import ts from "typescript";
// src/suites/architecture/validate_gsap_animations.ts
/**
* src/suites/architecture/validate_gsap_animations.ts
*
* GSAP ANIMATION & UI TIMING HYGIENE AUDITOR (Node.js 26+ Native)
*
* Enforces mandatory GSAP animation governance and UI timer architecture (AGENTS.md):
*   1. `gsap-banned-css-animations`: Prohibits `@keyframes` and `transition:` in styles.
*   2. `gsap-banned-ui-timers`: Prohibits `setTimeout`/`setInterval` in UI components & views.
*   3. `gsap-no-layout-properties`: Prohibits layout animations (`backgroundPosition`, `top`, etc.) in GSAP.
*   4. `gsap-named-timer-constants`: Enforces semantic constants with `_SEC` suffix in GSAP delays.
*   5. `gsap-empty-vue-transitions`: Prohibits empty Vue transition classes (`.fade-enter-active {}`).
*   6. `gsap-no-important-transforms`: Prohibits `!important` on `transform` in styles.
*   7. `gsap-no-important-filters`: Prohibits `!important` on `filter` in styles.
*   8. `gsap-gpu-layer-promotion`: Flags dynamic filter animations lacking `will-change`.
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_gsap_animations.ts
*/
enableCompileCache();
const GSAP_ANIMATION_RULES = [
	"gsap-banned-css-animations",
	"gsap-banned-ui-timers",
	"gsap-no-layout-properties",
	"gsap-named-timer-constants",
	"gsap-empty-vue-transitions",
	"gsap-no-important-transforms",
	"gsap-no-important-filters",
	"gsap-gpu-layer-promotion",
	"gsap-timeline-constructor-duration",
	"gsap-kebab-case-properties",
	"gsap-raw-transform-string",
	"gsap-simultaneous-origin-conflict",
	"gsap-legacy-ease-names",
	"gsap-high-frequency-tween-creation"
];
const CONTEXT_WINDOW_SPAN_CHARS = 500;
const GSAP_TWEEN_CONFIG_SEARCH_WINDOW_CHARS = 400;
const BANNED_CSS_ANIMATIONS_REGEX = /@keyframes\b|\btransition\s*:/g;
const BANNED_UI_TIMERS_REGEX = /\b(?:set|clear)(?:Timeout|Interval)\b/g;
const NO_IMPORTANT_ON_TRANSFORMS_REGEX = /(?<![\w-])transform\s*:[^;]*!important/gi;
const NO_IMPORTANT_ON_FILTERS_REGEX = /(?<![\w-])filter\s*:[^;]*!important/gi;
const EMPTY_VUE_TRANSITIONS_REGEX = /\.[\w-]+-(?:enter|leave)-(?:active|from|to)(?:[\s,]+\.[\w-]+-(?:enter|leave)-(?:active|from|to))*\s*\{\s*(?:@include\s+[\w-]+;\s*)?\}/g;
const GSAP_TWEEN_CALL_REGEX = /\b(?:gsap|timeline|\w*Timeline|tl)\s*\.\s*(?:to|from|fromTo)\s*\(/g;
const GPU_FILTER_REGEX = /(?:backdrop-filter|filter):/gi;
/**
* Extracts configuration object literals directly passed as arguments to a GSAP tween call.
* Deterministically balances parentheses and object braces, stopping strictly at the closing
* parenthesis of the tween call, at EOF, or at '<\/script>' boundary in Vue SFCs.
*/
function extractBalancedBraces(content, braceStart, limit) {
	const result = scanBalancedBraces(content, braceStart + 1, limit, 1, "<\/script>");
	if (result.depth === 0) return {
		end: result.end,
		text: content.slice(braceStart, result.end)
	};
	return null;
}
function extractTweenConfigObjects(content, openParenIndex, maxIndex) {
	const configs = [];
	const limit = maxIndex !== void 0 ? Math.min(content.length, maxIndex) : content.length;
	const parenResult = scanBalancedParens(content, openParenIndex + 1, limit, 1, "<\/script>");
	const argRegionEnd = parenResult.depth === 0 ? parenResult.end - 1 : limit;
	let i = openParenIndex + 1;
	while (i < argRegionEnd) {
		if (content[i] === "<" && content.startsWith("<\/script>", i)) break;
		const skipped = advancePastStringOrComment(content, i, argRegionEnd);
		if (skipped !== i) {
			i = skipped;
			continue;
		}
		if (content[i] === "{") {
			const balanced = extractBalancedBraces(content, i, argRegionEnd);
			if (balanced) {
				configs.push({
					startOffset: i,
					text: balanced.text
				});
				i = balanced.end;
				continue;
			}
		}
		i++;
	}
	return configs;
}
const GSAP_LAYOUT_PROPERTIES = [
	"backgroundPosition",
	"backgroundPositionX",
	"backgroundPositionY",
	"top",
	"bottom",
	"left",
	"right",
	"width",
	"height",
	"margin",
	"marginTop",
	"marginBottom",
	"marginLeft",
	"marginRight",
	"padding",
	"paddingTop",
	"paddingBottom",
	"paddingLeft",
	"paddingRight"
];
const LAYOUT_PROPERTIES_SET = new Set(GSAP_LAYOUT_PROPERTIES);
const COLLAPSIBLE_HEIGHT_TARGETS = /* @__PURE__ */ new Set([
	"auto",
	"0",
	"0px"
]);
const GSAP_ANIMATED_TWEEN_METHODS = /* @__PURE__ */ new Set([
	"to",
	"from",
	"fromTo"
]);
const GSAP_TWEEN_METHODS = /* @__PURE__ */ new Set([
	"to",
	"from",
	"fromTo",
	"set"
]);
function readTopLevelProperty(cfgText, i, limit) {
	const idStart = i;
	while (i < limit && /[\w$]/.test(cfgText[i] ?? "")) i++;
	const id = cfgText.slice(idStart, i);
	let j = i;
	while (j < limit && (cfgText[j] === " " || cfgText[j] === "	" || cfgText[j] === "\n" || cfgText[j] === "\r")) j++;
	if (j < limit && cfgText[j] === ":" && LAYOUT_PROPERTIES_SET.has(id)) {
		if (id === "height") {
			let valStart = j + 1;
			while (valStart < limit && /\s/.test(cfgText[valStart] ?? "")) valStart++;
			const rest = cfgText.slice(valStart, valStart + 10);
			if (/^(?:['"]auto['"]|['"]0(?:px)?['"]|0\b)/.test(rest)) return {
				nextIndex: j,
				match: null
			};
		}
		if (id === "width") {
			let valStart = j + 1;
			while (valStart < limit && /\s/.test(cfgText[valStart] ?? "")) valStart++;
			const rest = cfgText.slice(valStart, valStart + 30);
			if (/^(?:['"`][^'"`]*%['"`]|['"]0(?:px)?['"]|0\b)/.test(rest) || /percent|pct/i.test(rest)) return {
				nextIndex: j,
				match: null
			};
		}
		return {
			nextIndex: j,
			match: {
				index: idStart,
				propName: id
			}
		};
	}
	return {
		nextIndex: j,
		match: null
	};
}
function findTopLevelLayoutProperty(cfgText) {
	const limit = cfgText.length;
	const firstBrace = cfgText.indexOf("{");
	if (firstBrace === -1) return null;
	let i = firstBrace + 1;
	while (i < limit) {
		const skipped = advancePastStringOrComment(cfgText, i, limit);
		if (skipped !== i) {
			i = skipped;
			continue;
		}
		const ch = cfgText[i];
		if (ch === "}") break;
		if (ch === "{") {
			i = scanBalancedBraces(cfgText, i + 1, limit, 1).end;
			continue;
		}
		if (ch === "(") {
			i = scanBalancedParens(cfgText, i + 1, limit, 1).end;
			continue;
		}
		if (ch && /[a-z_$]/i.test(ch)) {
			const { nextIndex, match } = readTopLevelProperty(cfgText, i, limit);
			if (match) return match;
			i = nextIndex;
			continue;
		}
		i++;
	}
	return null;
}
function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function getLineAndColumnAt(content, index) {
	const preceding = content.slice(0, index);
	const lines = preceding.split("\n");
	const line = lines.length;
	const column = (lines[lines.length - 1]?.length ?? 0) + 1;
	const lineStart = preceding.lastIndexOf("\n") + 1;
	const lineEnd = content.indexOf("\n", index);
	return {
		line,
		column,
		lineText: content.slice(lineStart, lineEnd === -1 ? void 0 : lineEnd)
	};
}
function isStyleContext(content, matchIndex, filePath) {
	if (!filePath) return true;
	const norm = normalizePosixPath(filePath);
	const isCssFile = norm.endsWith(".scss") || norm.endsWith(".css");
	const isVueFile = norm.endsWith(".vue");
	if (!isCssFile && !isVueFile) return false;
	if (isVueFile) {
		const styleOpenIndex = content.lastIndexOf("<style", matchIndex);
		const styleCloseIndex = content.lastIndexOf("</style>", matchIndex);
		if (styleOpenIndex === -1 || styleOpenIndex < styleCloseIndex) return false;
	}
	return true;
}
function isHighDensityOrSuppressed(content, start, matchIndex, context, filePath) {
	if (/audit-disable\s+gpu-gaps|will-change:\s*(?:skip|ignore|false)/i.test(context)) return true;
	const beforeMatch = content.substring(start, matchIndex);
	const lastSemi = Math.max(beforeMatch.lastIndexOf(";"), beforeMatch.lastIndexOf("}"), beforeMatch.lastIndexOf("{"));
	const selectorText = beforeMatch.substring(lastSemi + 1).trim();
	const highDensityKeywords = /card|item|avatar|badge|icon|grid|list|row|cell|overlay|background/i;
	return highDensityKeywords.test(selectorText) || (filePath ? highDensityKeywords.test(filePath) : false);
}
function findVariableInitializer(stmts, targetName) {
	for (const stmt of stmts) if (ts.isVariableStatement(stmt)) {
		for (const decl of stmt.declarationList.declarations) if (ts.isIdentifier(decl.name) && decl.name.text === targetName) return decl.initializer;
	}
}
function resolveLocalVariableDeclaration(ident, ast) {
	const targetName = ident.text;
	let current = ident.parent;
	while (current) {
		if (ts.isBlock(current) || ts.isSourceFile(current) || ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current) || ts.isArrowFunction(current) || ts.isMethodDeclaration(current)) {
			const stmts = ts.isSourceFile(current) || ts.isBlock(current) ? current.statements : "body" in current && current.body && ts.isBlock(current.body) ? current.body.statements : void 0;
			if (stmts) {
				const found = findVariableInitializer(stmts, targetName);
				if (found) return found;
			}
		}
		current = current.parent;
	}
	return findVariableInitializer(ast.statements, targetName);
}
function isPercentageWidthExpression(expr, ast, depth = 0) {
	if (depth > 5) return false;
	if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
		const text = expr.text.trim();
		return text.endsWith("%") || text === "0" || text === "0px";
	}
	if (ts.isNumericLiteral(expr)) return expr.text === "0";
	if (ts.isTemplateExpression(expr)) {
		const lastSpan = expr.templateSpans[expr.templateSpans.length - 1];
		if (lastSpan && lastSpan.literal.text.trimEnd().endsWith("%")) return true;
		return false;
	}
	if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
		if (ts.isStringLiteral(expr.right) && expr.right.text.trimEnd().endsWith("%")) return true;
		if (ts.isStringLiteral(expr.left) && expr.left.text.trimEnd().endsWith("%")) return true;
		return isPercentageWidthExpression(expr.right, ast, depth + 1) || isPercentageWidthExpression(expr.left, ast, depth + 1);
	}
	if (ts.isIdentifier(expr)) {
		const declExpr = resolveLocalVariableDeclaration(expr, ast);
		if (declExpr && isPercentageWidthExpression(declExpr, ast, depth + 1)) return true;
		const name = expr.text.toLowerCase();
		if (name.includes("percent") || name.includes("pct") || name.endsWith("ratio")) return true;
		return false;
	}
	if (ts.isPropertyAccessExpression(expr)) {
		const prop = expr.name.text.toLowerCase();
		if (prop.includes("percent") || prop.includes("pct") || prop.endsWith("ratio")) return true;
		return false;
	}
	return false;
}
function resolveObjectLiteral(expr, ast) {
	if (ts.isObjectLiteralExpression(expr)) return expr;
	if (ts.isIdentifier(expr)) {
		const decl = resolveLocalVariableDeclaration(expr, ast);
		if (decl && ts.isObjectLiteralExpression(decl)) return decl;
	}
}
var ValidateGsapAnimationsAuditor = class extends FileScanAuditor {
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options);
		const config = getAuditConfig(effectiveRoot);
		const stylesExempts = [...config.styles?.exemptPaths ?? [], ...config.styles?.exemptCssFiles ?? []];
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			projectRoot: effectiveRoot,
			roots: targetRoots,
			id: "validate_gsap_animations",
			name: "GSAP Animation & UI Timing Hygiene",
			description: "Strict governance of GSAP animations and UI timers",
			family: "architecture",
			packageName: "GSAP",
			icon: "🎬",
			configKey: "animation",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			exemptPaths: stylesExempts,
			ruleCapabilities: createRuleCapabilities(GSAP_ANIMATION_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: true,
				changedOnly: false,
				critical: false
			}),
			allowedExtensions: /* @__PURE__ */ new Set([
				".ts",
				".vue",
				".scss",
				".css"
			]),
			ruleIds: GSAP_ANIMATION_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(GSAP_ANIMATION_RULES, "behavior"),
			ruleDescriptions: {
				"gsap-banned-css-animations": "Prohibited manual CSS animation",
				"gsap-banned-ui-timers": "Native timer in UI component",
				"gsap-no-layout-properties": "Layout property in GSAP tween",
				"gsap-named-timer-constants": "Magic number in GSAP delay",
				"gsap-empty-vue-transitions": "Empty Vue transition detected",
				"gsap-no-important-transforms": "!important in CSS transform",
				"gsap-no-important-filters": "!important in CSS filter",
				"gsap-gpu-layer-promotion": "Missing will-change on filter",
				"gsap-timeline-constructor-duration": "Direct duration in timeline constructor",
				"gsap-kebab-case-properties": "CSS property in kebab-case",
				"gsap-raw-transform-string": "Raw CSS string in transform",
				"gsap-simultaneous-origin-conflict": "svgOrigin vs transformOrigin conflict",
				"gsap-legacy-ease-names": "Legacy GSAP v2 ease name",
				"gsap-high-frequency-tween-creation": "Tween inside continuous event listener"
			},
			ruleRemediations: {
				"gsap-banned-css-animations": "📖 REMEDIATION GUIDE: gsap-banned-css-animations\n1. Root Cause: A manual animation or transition defined in CSS or SCSS (@keyframes, transition, animation) was detected. In projects standardizing on GSAP, CSS animations break time synchronization and test determinism.\n2. Diagnosis: Locate the transition or animation property in the reported stylesheet rule.\n3. Canonical Solution: Migrate the animation to GSAP using gsap.to(), gsap.fromTo(), gsap.timeline(), or Vue component lifecycle hooks.\n4. Example / Auto-fix command:\n   ❌ Banned:  .modal-card { transition: transform 0.3s ease, opacity 0.3s; }\n   ✅ Correct: gsap.to(cardEl, { scale: 1, opacity: 1, duration: 0.3, ease: \"power2.out\" });",
				"gsap-banned-ui-timers": "📖 REMEDIATION GUIDE: gsap-banned-ui-timers\n1. Root Cause: Usage of setTimeout(), setInterval(), or requestAnimationFrame() in UI layers (src/ui/). These native timers desynchronize from GSAP timelines and cause memory leaks.\n2. Diagnosis: Identify the setTimeout/setInterval call in the reported file.\n3. Canonical Solution:\n   a) For delays: replace setTimeout(fn, ms) with gsap.delayedCall(seconds, fn) or await gsapSleep(seconds).\n   b) For loops: use gsap.timeline({ repeat: -1 }) or gsap.ticker.add(fn).\n4. Example / Auto-fix command:\n   ❌ Banned:  setTimeout(() => { isVisible.value = false; }, 300);\n   ✅ Correct: gsap.delayedCall(DELAY_SEC, () => { isVisible.value = false; });",
				"gsap-no-layout-properties": "📖 REMEDIATION GUIDE: gsap-no-layout-properties\n1. Root Cause: A GSAP tween animates geometric layout properties (top, left, width in px, margin). Animating these forces layout reflow on CPU on every frame.\n2. Diagnosis: Inspect the tween properties object at the reported line.\n3. Canonical Solution:\n   a) Isolated elements: Use hardware-accelerated GPU transforms (x, y, xPercent, yPercent, scaleX, scaleY, rotation, autoAlpha).\n   b) Stacked meters / Flexbox distribution bars: Animate geometric percentage width (e.g. width: \"0%\" to \"62%\") or SVG <rect>. CAUTION: Do NOT replace width with scaleX on adjacent flex items as GPU transforms do not reflow sibling positions, leaving visual gaps and glitches.\n   c) Collapsible accordions: Use height: 0 or height: \"auto\".\n4. Example / Auto-fix command:\n   ❌ Banned:  gsap.to(el, { left: \"100px\", width: \"200px\" });\n   ✅ Correct: gsap.to(el, { x: 100 }); // isolated element\n   ✅ Correct: gsap.fromTo(barEl, { width: \"0%\" }, { width: \"62%\" }); // flex distribution bar",
				"gsap-named-timer-constants": "📖 REMEDIATION GUIDE: gsap-named-timer-constants\n1. Root Cause: A raw numeric value (magic number) was used as duration or delay in a GSAP animation without a descriptive constant or design token.\n2. Diagnosis: Locate literal numbers in duration or delay properties in the tween.\n3. Canonical Solution: Define or import a named constant (e.g. MODAL_ENTER_DURATION_SEC) to unify design system animation speed.\n4. Example / Auto-fix command:\n   ❌ Banned:  gsap.to(el, { duration: 0.35, delay: 0.1 });\n   ✅ Correct: gsap.to(el, { duration: MODAL_ENTER_DURATION_SEC, delay: STAGGER_DELAY_SEC });",
				"gsap-empty-vue-transitions": "📖 REMEDIATION GUIDE: gsap-empty-vue-transitions\n1. Root Cause: A <Transition> or <TransitionGroup> tag was declared in a Vue component without CSS transition classes or GSAP animation hooks.\n2. Diagnosis: Locate <Transition> tags in template lacking name, css, or listener bindings.\n3. Canonical Solution: Bind JavaScript hooks to animate entry/exit with GSAP (:css=\"false\" @enter=\"onEnter\" @leave=\"onLeave\") or remove the wrapper.\n4. Example / Auto-fix command:\n   <Transition :css=\"false\" @enter=\"onEnter\" @leave=\"onLeave\">",
				"gsap-no-important-transforms": "📖 REMEDIATION GUIDE: gsap-no-important-transforms\n1. Root Cause: !important was declared on a CSS transform property, overriding GSAP transform matrices and breaking animations.\n2. Diagnosis: Search for \"transform: ... !important\" in the reported styles.\n3. Canonical Solution: Remove !important from transform rules and manage visual hierarchy with selector specificity.\n4. Example / Auto-fix command:\n   ❌ Banned:  transform: translateY(0) !important;\n   ✅ Correct: transform: translateY(0);",
				"gsap-no-important-filters": "📖 REMEDIATION GUIDE: gsap-no-important-filters\n1. Root Cause: !important was declared on CSS filter or backdrop-filter properties, preventing dynamic interpolation by GSAP.\n2. Diagnosis: Search for \"filter: ... !important\" in the reported styles.\n3. Canonical Solution: Remove !important to allow runtime filter modulation.\n4. Example / Auto-fix command:\n   Remove !important from filter properties.",
				"gsap-gpu-layer-promotion": "📖 REMEDIATION GUIDE: gsap-gpu-layer-promotion\n1. Root Cause: An intensively animated element has not been promoted to its own GPU composition layer, causing container repaints.\n2. Diagnosis: Inspect the animated element or container.\n3. Canonical Solution: Add force3D: true in GSAP tween options or declare will-change: transform in CSS.\n4. Example / Auto-fix command:\n   will-change: transform;",
				"gsap-timeline-constructor-duration": "📖 REMEDIATION GUIDE: gsap-timeline-constructor-duration\n1. Root Cause: A duration parameter was passed to the timeline constructor. In GSAP v3, timelines calculate duration dynamically from child tweens; this parameter is ignored.\n2. Diagnosis: Inspect timeline instantiation in reported code.\n3. Canonical Solution: Remove duration from timeline constructor; set duration on child tweens or use defaults: { duration: X }.\n4. Example / Auto-fix command:\n   const tl = gsap.timeline({ defaults: { duration: DURATION_SEC } });",
				"gsap-kebab-case-properties": "📖 REMEDIATION GUIDE: gsap-kebab-case-properties\n1. Root Cause: A kebab-case property was passed to a GSAP tween. GSAP v3 requires camelCase property names.\n2. Diagnosis: Check animation object keys at the reported line.\n3. Canonical Solution: Rename properties to camelCase (e.g. backgroundColor, borderRadius, zIndex).\n4. Example / Auto-fix command:\n   ❌ Banned:  using kebab-case CSS properties in gsap.to\n   ✅ Correct: gsap.to(el, { backgroundColor: \"#fff\" });",
				"gsap-raw-transform-string": "📖 REMEDIATION GUIDE: gsap-raw-transform-string\n1. Root Cause: A raw CSS string was passed to the transform property in GSAP, bypassing GSAP matrix optimization.\n2. Diagnosis: Check for raw string values assigned to transform in GSAP tweens.\n3. Canonical Solution: Use discrete optimized GSAP properties: x, y, rotation, scale, skewX.\n4. Example / Auto-fix command:\n   ❌ Banned:  using raw CSS transform strings in gsap.to\n   ✅ Correct: gsap.to(el, { x: 20 });",
				"gsap-simultaneous-origin-conflict": "📖 REMEDIATION GUIDE: gsap-simultaneous-origin-conflict\n1. Root Cause: Both svgOrigin and transformOrigin were defined in the same SVG tween, creating conflicting matrix calculations.\n2. Diagnosis: Check if the SVG tween defines both properties.\n3. Canonical Solution: Retain only svgOrigin (for SVG canvas absolute coords) or transformOrigin (for element relative points).\n4. Example / Auto-fix command:\n   Keep only one origin property in the tween.",
				"gsap-legacy-ease-names": "📖 REMEDIATION GUIDE: gsap-legacy-ease-names\n1. Root Cause: Legacy GSAP v2 PascalCase ease names were used.\n2. Diagnosis: Locate uppercase static ease class references.\n3. Canonical Solution: Update ease names to canonical lowercase GSAP v3 strings: \"power2.out\", \"back.inOut\", \"elastic.out\".\n4. Example / Auto-fix command:\n   ❌ Banned:  legacy v2 ease names like Power2\n   ✅ Correct: ease: \"power2.out\"",
				"gsap-high-frequency-tween-creation": "📖 REMEDIATION GUIDE: gsap-high-frequency-tween-creation\n1. Root Cause: Tweens are instantiated inside high-frequency event callbacks (mousemove, scroll) without throttling or gsap.quickTo().\n2. Diagnosis: Inspect the event listener that continuously spawns new tweens.\n3. Canonical Solution: Initialize gsap.quickTo() outside the listener and update destination coordinates in callback.\n4. Example / Auto-fix command:\n   const xTo = gsap.quickTo(el, \"x\");\n   window.addEventListener(\"mousemove\", (e) => xTo(e.clientX));"
			}
		});
		this.declareFileSubAuditor("gsap-banned-css-animations", (doc) => {
			const norm = normalizePosixPath(doc.relPath);
			if (!norm.endsWith(".scss") && !norm.endsWith(".css") && !norm.endsWith(".vue")) return;
			this.scanCssAnimations(doc.relPath, doc.rawContent);
		});
		this.declareFileSubAuditor("gsap-empty-vue-transitions", (doc) => {
			const norm = normalizePosixPath(doc.relPath);
			if (!norm.endsWith(".scss") && !norm.endsWith(".css") && !norm.endsWith(".vue")) return;
			this.scanEmptyVueTransitions(doc.relPath, doc.rawContent);
		});
		this.declareFileSubAuditor("gsap-no-important-transforms", (doc) => {
			const norm = normalizePosixPath(doc.relPath);
			if (!norm.endsWith(".scss") && !norm.endsWith(".css") && !norm.endsWith(".vue")) return;
			this.scanNoImportantTransforms(doc.relPath, doc.rawContent);
		});
		this.declareFileSubAuditor("gsap-no-important-filters", (doc) => {
			const norm = normalizePosixPath(doc.relPath);
			if (!norm.endsWith(".scss") && !norm.endsWith(".css") && !norm.endsWith(".vue")) return;
			this.scanNoImportantFilters(doc.relPath, doc.rawContent);
		});
		this.declareFileSubAuditor("gsap-gpu-layer-promotion", (doc) => {
			const norm = normalizePosixPath(doc.relPath);
			if (!norm.endsWith(".scss") && !norm.endsWith(".css") && !norm.endsWith(".vue")) return;
			this.scanGpuLayerPromotion(doc.relPath, doc.rawContent);
		});
		this.declareFileSubAuditor("gsap-banned-ui-timers", (doc) => {
			const norm = normalizePosixPath(doc.relPath);
			if (!norm.endsWith(".ts") && !norm.endsWith(".vue") || isExemptFile(doc.relPath)) return;
			if (!isInCodeRoots(doc.relPath)) return;
			const scriptRanges = this.getScriptRanges(doc.rawContent, norm);
			this.scanUiTimers(doc.relPath, doc.rawContent, scriptRanges, norm);
		});
		const declareScriptSubAuditor = (ruleId, scanner) => {
			this.declareFileSubAuditor(ruleId, (doc) => {
				const norm = normalizePosixPath(doc.relPath);
				if (!norm.endsWith(".ts") && !norm.endsWith(".vue") || isExemptFile(doc.relPath)) return;
				const ast = doc.getAst();
				if (ast) this.scanGsapTweensAst(doc, ast, ruleId);
				else {
					const scriptRanges = this.getScriptRanges(doc.rawContent, norm);
					scanner(doc.relPath, doc.rawContent, scriptRanges);
				}
			});
		};
		declareScriptSubAuditor("gsap-no-layout-properties", (r, c, ranges) => this.scanLayoutProperties(r, c, ranges));
		declareScriptSubAuditor("gsap-kebab-case-properties", (r, c, ranges) => this.scanKebabCaseProperties(r, c, ranges));
		declareScriptSubAuditor("gsap-raw-transform-string", (r, c, ranges) => this.scanRawTransformString(r, c, ranges));
		declareScriptSubAuditor("gsap-simultaneous-origin-conflict", (r, c, ranges) => this.scanSimultaneousOriginConflict(r, c, ranges));
		this.declareFileSubAuditor("gsap-named-timer-constants", (doc) => {
			const norm = normalizePosixPath(doc.relPath);
			if (!norm.endsWith(".ts") && !norm.endsWith(".vue") || isExemptFile(doc.relPath)) return;
			this.scanNamedTimerConstants(doc.relPath, doc.rawContent);
		});
		this.declareFileSubAuditor("gsap-timeline-constructor-duration", (doc) => {
			const norm = normalizePosixPath(doc.relPath);
			if (!norm.endsWith(".ts") && !norm.endsWith(".vue") || isExemptFile(doc.relPath)) return;
			this.scanTimelineConstructorDuration(doc.relPath, doc.rawContent);
		});
		this.declareFileSubAuditor("gsap-legacy-ease-names", (doc) => {
			const norm = normalizePosixPath(doc.relPath);
			if (!norm.endsWith(".ts") && !norm.endsWith(".vue") || isExemptFile(doc.relPath)) return;
			this.scanLegacyEaseNames(doc.relPath, doc.rawContent);
		});
		this.declareFileSubAuditor("gsap-high-frequency-tween-creation", (doc) => {
			const norm = normalizePosixPath(doc.relPath);
			if (!norm.endsWith(".ts") && !norm.endsWith(".vue") || isExemptFile(doc.relPath)) return;
			this.scanHighFrequencyTweens(doc.relPath, doc.rawContent);
		});
	}
	getScriptRanges(content, norm) {
		const vueBlocks = norm.endsWith(".vue") ? parseVueSfcBlocks(content) : null;
		return vueBlocks ? vueBlocks.scripts.map((s) => ({
			start: s.contentStartIndex,
			end: s.endIndex
		})) : [{
			start: 0,
			end: content.length
		}];
	}
	getNamedTimerConstantsRegex() {
		const customFuncs = getAuditConfig(this.projectRoot).animation?.customTimerFunctions ?? [];
		const allFuncs = Array.from(/* @__PURE__ */ new Set([...["gsapSleep"], ...customFuncs])).map((f) => escapeRegex(f));
		const funcsPart = allFuncs.length > 0 ? `|\\b(?:${allFuncs.join("|")})\\s*\\(\\s*([0-9]+(?:\\.[0-9]+)?)\\s*\\)` : "";
		return new RegExp(`\\b(?:gsap\\.)?delayedCall\\s*\\(\\s*([0-9]+(?:\\.[0-9]+)?)\\s*,${funcsPart}`, "g");
	}
	scanCssAnimations(relPath, content) {
		const bannedCssRegex = /@keyframes\b|\btransition\s*:/g;
		let m;
		while ((m = bannedCssRegex.exec(content)) !== null) {
			if (!isStyleContext(content, m.index, relPath)) continue;
			const { line, column } = getLineAndColumnAt(content, m.index);
			this.addViolation({
				ruleId: "gsap-banned-css-animations",
				message: `CSS animation or transition detected: '${m[0]}'. MANDATORY MIGRATION TO GSAP: Using CSS animations or transitions instead of GSAP is strictly PROHIBITED. [🚨 SABOTAGE ALERT]: DELETING OR NULLIFYING THE TRANSITION TO SILENCE THE AUDITOR IS CATEGORICALLY PROHIBITED. All interactive transitions must be cleanly migrated to GSAP tweens (gsap.to, gsap.fromTo, useGSAP).`,
				filePath: relPath,
				line,
				column,
				severity: "error"
			});
		}
	}
	scanEmptyVueTransitions(relPath, content) {
		const emptyTransitionsRegex = /\.[\w-]+-(?:enter|leave)-(?:active|from|to)(?:[\s,]+\.[\w-]+-(?:enter|leave)-(?:active|from|to))*\s*\{\s*(?:@include\s+[\w-]+;\s*)?\}/g;
		let m;
		while ((m = emptyTransitionsRegex.exec(content)) !== null) {
			if (!isStyleContext(content, m.index, relPath)) continue;
			const { line, column } = getLineAndColumnAt(content, m.index);
			this.addViolation({
				ruleId: "gsap-empty-vue-transitions",
				message: `Empty Vue transition detected: '${m[0].trim()}'. MANDATORY MIGRATION TO GSAP: Emptying transition classes to evade the auditor is prohibited.`,
				filePath: relPath,
				line,
				column,
				severity: "error"
			});
		}
	}
	scanNoImportantTransforms(relPath, content) {
		const impTransformRegex = /(?<![\w-])transform\s*:[^;]*!important/gi;
		let m;
		while ((m = impTransformRegex.exec(content)) !== null) {
			if (!isStyleContext(content, m.index, relPath)) continue;
			const { line, column } = getLineAndColumnAt(content, m.index);
			this.addViolation({
				ruleId: "gsap-no-important-transforms",
				message: `Use of '!important' in 'transform' detected: '${m[0]}'. Overrides GSAP runtime mutations.`,
				filePath: relPath,
				line,
				column,
				severity: "error"
			});
		}
	}
	scanNoImportantFilters(relPath, content) {
		const impFilterRegex = /(?<![\w-])filter\s*:[^;]*!important/gi;
		let m;
		while ((m = impFilterRegex.exec(content)) !== null) {
			if (!isStyleContext(content, m.index, relPath)) continue;
			const { line, column } = getLineAndColumnAt(content, m.index);
			this.addViolation({
				ruleId: "gsap-no-important-filters",
				message: `Use of '!important' in 'filter' detected: '${m[0]}'. Invalidates GSAP effect animations.`,
				filePath: relPath,
				line,
				column,
				severity: "error"
			});
		}
	}
	scanGpuLayerPromotion(relPath, content) {
		const filterRegex = /(?:backdrop-filter|filter):/gi;
		let m;
		while ((m = filterRegex.exec(content)) !== null) {
			if (!isStyleContext(content, m.index, relPath)) continue;
			const start = Math.max(0, m.index - 500);
			const end = Math.min(content.length, m.index + 500);
			const context = content.substring(start, end);
			if (isHighDensityOrSuppressed(content, start, m.index, context, relPath)) continue;
			if (!/transition\s*:[^;]*(?:filter|backdrop-filter|all)|animation\s*:/i.test(context)) continue;
			if (!/will-change|will-animate/i.test(context)) {
				const { line, column } = getLineAndColumnAt(content, m.index);
				this.addViolation({
					ruleId: "gsap-gpu-layer-promotion",
					message: "Dynamic filter detected without 'will-change'. Consider adding GPU layer promotion.",
					filePath: relPath,
					line,
					column,
					severity: "error"
				});
			}
		}
	}
	scanUiTimers(relPath, content, scriptRanges, norm) {
		const config = getAuditConfig(this.projectRoot);
		const uiRoots = [...config.paths.componentsRoots ?? [], ...config.paths.viewsRoots ?? []];
		if (!(norm.endsWith(".vue") || matchesAnyRoot(norm, uiRoots)) || /audit-disable\s+timers/i.test(content)) return;
		const timerRegex = /\b(?:set|clear)(?:Timeout|Interval)\b/g;
		for (const range of scriptRanges) {
			timerRegex.lastIndex = range.start;
			let m;
			while ((m = timerRegex.exec(content)) !== null) {
				if (m.index >= range.end) break;
				const { line, column, lineText } = getLineAndColumnAt(content, m.index);
				const trimmedLine = lineText.trim();
				if (isCommentLine(trimmedLine)) continue;
				if (lineText.slice(0, column - 1).includes("//")) continue;
				this.addViolation({
					ruleId: "gsap-banned-ui-timers",
					message: `ANIMATION/UI timer detected: '${m[0]}'. MANDATORY MIGRATION TO GSAP: Prohibited in UI. Use gsap.delayedCall or deterministic promises.`,
					filePath: relPath,
					line,
					column,
					severity: "error"
				});
			}
		}
	}
	forEachTweenConfig(content, scriptRanges, callback) {
		if (!content.includes("gsap") && !content.includes("timeline") && !content.includes("tl.") && !content.includes("Timeline")) return;
		const gsapTweenRegex = /\b(?:gsap|timeline|\w*Timeline|tl)\s*\.\s*(?:to|from|fromTo)\s*\(/g;
		for (const range of scriptRanges) {
			gsapTweenRegex.lastIndex = range.start;
			let m;
			while ((m = gsapTweenRegex.exec(content)) !== null) {
				if (m.index >= range.end) break;
				const configObjects = extractTweenConfigObjects(content, m.index + m[0].length - 1, range.end);
				for (const cfg of configObjects) callback(cfg, m.index);
			}
		}
	}
	checkTweenProperty(prop, propName, doc, ast, targetRule) {
		if (targetRule === "gsap-no-layout-properties" && LAYOUT_PROPERTIES_SET.has(propName)) {
			if (propName === "height") {
				const init = prop.initializer;
				if (ts.isStringLiteral(init) && COLLAPSIBLE_HEIGHT_TARGETS.has(init.text)) return;
				if (ts.isNumericLiteral(init) && init.text === "0") return;
			}
			if (propName === "width") {
				if (isPercentageWidthExpression(prop.initializer, ast)) return;
			}
			const { line, column } = doc.getNodeLineAndColumn(prop, ast);
			this.addViolation({
				ruleId: "gsap-no-layout-properties",
				message: `Animation of CSS layout properties in GSAP detected: '${propName}:'. Use GPU-accelerated properties (x, y, scale, rotation, opacity) or Flip Plugin.`,
				filePath: doc.relPath,
				line,
				column,
				severity: "error"
			});
			return;
		}
		if (targetRule === "gsap-kebab-case-properties" && !propName.startsWith("--") && propName.includes("-")) {
			const { line, column } = doc.getNodeLineAndColumn(prop, ast);
			this.addViolation({
				ruleId: "gsap-kebab-case-properties",
				message: `CSS property in kebab-case detected in GSAP tween: '${propName}'. Use camelCase according to GSAP standards.`,
				filePath: doc.relPath,
				line,
				column,
				severity: "error"
			});
			return;
		}
		if (targetRule === "gsap-raw-transform-string" && propName === "transform" && ts.isStringLiteral(prop.initializer)) {
			const { line, column } = doc.getNodeLineAndColumn(prop, ast);
			this.addViolation({
				ruleId: "gsap-raw-transform-string",
				message: `Use of raw CSS string 'transform' in GSAP detected: '${prop.initializer.text}'. Use optimized native GSAP aliases ('x', 'y', 'rotation', 'scale').`,
				filePath: doc.relPath,
				line,
				column,
				severity: "error"
			});
		}
	}
	checkTweenObjectLiteral(arg, doc, ast, targetRule) {
		let hasSvgOrigin = false;
		let hasTransformOrigin = false;
		for (const prop of arg.properties) {
			if (!ts.isPropertyAssignment(prop)) continue;
			const propName = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : "";
			if (propName === "svgOrigin") hasSvgOrigin = true;
			if (propName === "transformOrigin") hasTransformOrigin = true;
			this.checkTweenProperty(prop, propName, doc, ast, targetRule);
		}
		if (targetRule === "gsap-simultaneous-origin-conflict" && hasSvgOrigin && hasTransformOrigin) {
			const { line, column } = doc.getNodeLineAndColumn(arg, ast);
			this.addViolation({
				ruleId: "gsap-simultaneous-origin-conflict",
				message: "Conflicting SVG origins detected: do not declare 'svgOrigin' and 'transformOrigin' simultaneously in the same tween.",
				filePath: doc.relPath,
				line,
				column,
				severity: "error"
			});
		}
	}
	scanGsapTweensAst(doc, ast, targetRule) {
		const isGsapCall = (call) => {
			const expr = call.expression;
			if (!ts.isPropertyAccessExpression(expr)) return false;
			if (!(targetRule === "gsap-no-layout-properties" ? GSAP_ANIMATED_TWEEN_METHODS : GSAP_TWEEN_METHODS).has(expr.name.text)) return false;
			let recv = expr.expression;
			while (ts.isPropertyAccessExpression(recv)) recv = recv.name;
			if (ts.isIdentifier(recv)) {
				const text = recv.text.toLowerCase();
				return text === "gsap" || text.includes("timeline") || text.includes("tl") || text === "ctx";
			}
			if (ts.isCallExpression(recv)) return isGsapCall(recv);
			return false;
		};
		const visit = (node) => {
			if (ts.isCallExpression(node) && isGsapCall(node)) for (const arg of node.arguments) {
				const obj = resolveObjectLiteral(arg, ast);
				if (obj) this.checkTweenObjectLiteral(obj, doc, ast, targetRule);
			}
			ts.forEachChild(node, visit);
		};
		visit(ast);
	}
	scanLayoutProperties(relPath, content, scriptRanges) {
		this.forEachTweenConfig(content, scriptRanges, (cfg) => {
			const foundLayout = findTopLevelLayoutProperty(cfg.text);
			if (foundLayout) {
				const { line, column } = getLineAndColumnAt(content, cfg.startOffset + foundLayout.index);
				this.addViolation({
					ruleId: "gsap-no-layout-properties",
					message: `Animation of CSS layout properties in GSAP detected: '${foundLayout.propName}:'. Use GPU-accelerated properties (x, y, scale, rotation, opacity) or Flip Plugin.`,
					filePath: relPath,
					line,
					column,
					severity: "error"
				});
			}
		});
	}
	scanKebabCaseProperties(relPath, content, scriptRanges) {
		this.forEachTweenConfig(content, scriptRanges, (cfg) => {
			const kebabRegex = /(['"])(?:background-color|border-radius|font-size|z-index|box-shadow|line-height|letter-spacing)\1\s*:/g;
			let kebabMatch;
			while ((kebabMatch = kebabRegex.exec(cfg.text)) !== null) {
				const { line, column } = getLineAndColumnAt(content, cfg.startOffset + kebabMatch.index);
				this.addViolation({
					ruleId: "gsap-kebab-case-properties",
					message: `CSS property in kebab-case detected in GSAP tween: '${kebabMatch[0]}'. Use camelCase according to GSAP standards.`,
					filePath: relPath,
					line,
					column,
					severity: "error"
				});
			}
		});
	}
	scanRawTransformString(relPath, content, scriptRanges) {
		this.forEachTweenConfig(content, scriptRanges, (cfg) => {
			const rawMatch = /\btransform\s*:\s*(['"`])(?:translate|rotate|scale|skew|matrix)[^'"`]*\1/i.exec(cfg.text);
			if (rawMatch) {
				const { line, column } = getLineAndColumnAt(content, cfg.startOffset + rawMatch.index);
				this.addViolation({
					ruleId: "gsap-raw-transform-string",
					message: `Use of raw CSS string 'transform' in GSAP detected: '${rawMatch[0]}'. Use optimized native GSAP aliases ('x', 'y', 'rotation', 'scale').`,
					filePath: relPath,
					line,
					column,
					severity: "error"
				});
			}
		});
	}
	scanSimultaneousOriginConflict(relPath, content, scriptRanges) {
		this.forEachTweenConfig(content, scriptRanges, (cfg) => {
			if (/\bsvgOrigin\s*:/i.test(cfg.text) && /\btransformOrigin\s*:/i.test(cfg.text)) {
				const { line, column } = getLineAndColumnAt(content, cfg.startOffset);
				this.addViolation({
					ruleId: "gsap-simultaneous-origin-conflict",
					message: "Conflicting SVG origins detected: do not declare 'svgOrigin' and 'transformOrigin' simultaneously in the same tween.",
					filePath: relPath,
					line,
					column,
					severity: "error"
				});
			}
		});
	}
	scanNamedTimerConstants(relPath, content) {
		const namedTimerRegex = this.getNamedTimerConstantsRegex();
		let m;
		while ((m = namedTimerRegex.exec(content)) !== null) {
			const valStr = m.slice(1).find(Boolean);
			if (!valStr || parseFloat(valStr) === 0) continue;
			const { line, column } = getLineAndColumnAt(content, m.index);
			this.addViolation({
				ruleId: "gsap-named-timer-constants",
				message: `Magic number detected in GSAP animation delay: '${m[0].trim()}'. Define and use a semantic constant with '_SEC' suffix.`,
				filePath: relPath,
				line,
				column,
				severity: "error"
			});
		}
	}
	scanTimelineConstructorDuration(relPath, content) {
		const tlConstructorRegex = /\b(?:gsap\.)?timeline\s*\(\s*\{([^)]*)\}\s*\)/g;
		let m;
		while ((m = tlConstructorRegex.exec(content)) !== null) {
			const cleaned = (m[1] ?? "").replace(/\bdefaults\s*:\s*\{[^}]*\}/g, "");
			if (/\bduration\s*:\s*\d+(?:\.\d+)?/.exec(cleaned)) {
				const { line, column } = getLineAndColumnAt(content, m.index);
				this.addViolation({
					ruleId: "gsap-timeline-constructor-duration",
					message: `'duration' property in timeline constructor is ignored in GSAP 3. Use 'defaults: { duration: ... }'.`,
					filePath: relPath,
					line,
					column,
					severity: "error"
				});
			}
		}
	}
	scanLegacyEaseNames(relPath, content) {
		const legacyEaseRegex = /\b(?:Power[0-4]|Quad|Cubic|Quart|Quint|Strong|Linear|Sine|Expo|Circ|Back|Bounce|Elastic)\.(?:ease(?:In|Out|InOut)|easeNone)\b/g;
		let m;
		while ((m = legacyEaseRegex.exec(content)) !== null) {
			const { line, column } = getLineAndColumnAt(content, m.index);
			this.addViolation({
				ruleId: "gsap-legacy-ease-names",
				message: `Legacy GSAP v2 ease '${m[0]}' detected. Use canonical GSAP 3 format (e.g. 'power2.out', 'none').`,
				filePath: relPath,
				line,
				column,
				severity: "error"
			});
		}
	}
	scanHighFrequencyTweens(relPath, content) {
		const hfListenerRegex = /\b\w+\.addEventListener\s*\(\s*['"](?:mousemove|pointermove|touchmove|wheel|scroll)['"]/g;
		let m;
		while ((m = hfListenerRegex.exec(content)) !== null) {
			const listenerChunk = content.slice(m.index, m.index + 400);
			if (/\bgsap\.(?:to|from|fromTo)\s*\(/.test(listenerChunk)) {
				const { line, column } = getLineAndColumnAt(content, m.index);
				this.addViolation({
					ruleId: "gsap-high-frequency-tween-creation",
					message: "Tween creation with 'gsap.to()' inside continuous listener. In 'mousemove', etc. use 'gsap.quickTo()'.",
					filePath: relPath,
					line,
					column,
					severity: "warning"
				});
			}
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateGsapAnimationsAuditor());
export { BANNED_CSS_ANIMATIONS_REGEX, BANNED_UI_TIMERS_REGEX, CONTEXT_WINDOW_SPAN_CHARS, EMPTY_VUE_TRANSITIONS_REGEX, GPU_FILTER_REGEX, GSAP_ANIMATION_RULES, GSAP_LAYOUT_PROPERTIES, GSAP_TWEEN_CALL_REGEX, GSAP_TWEEN_CONFIG_SEARCH_WINDOW_CHARS, NO_IMPORTANT_ON_FILTERS_REGEX, NO_IMPORTANT_ON_TRANSFORMS_REGEX, ValidateGsapAnimationsAuditor };
