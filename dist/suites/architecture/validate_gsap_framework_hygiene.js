import { normalizePosixPath } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { matchesAnyRoot } from "../../core/auditRootMatcher.js";
import { isInCodeRoots } from "../../core/auditCodeRoots.js";
import { isExemptFile } from "../../core/auditPathPredicates.js";
import "../../core/auditConfig.js";
import "../../core/safePath.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { scanBalancedParens } from "../../core/scannerUtils.js";
import { enableCompileCache } from "node:module";
//#region src/suites/architecture/validate_gsap_framework_hygiene.ts
/**
* src/suites/architecture/validate_gsap_framework_hygiene.ts
*
* GSAP FRAMEWORK HYGIENE & COMPONENT LIFECYCLE AUDITOR (Node.js 26+ Native)
*
* Enforces best practices for GSAP in UI frameworks (Vue SFC, React, Svelte):
*   1. `gsap-unscoped-component-selectors`: Prohibits unscoped global selectors in UI components.
*   2. `gsap-missing-context-revert`: Enforces ctx.revert() or kill() on component unmount.
*   3. `gsap-missing-plugin-registration`: Enforces gsap.registerPlugin(...) for imported GSAP plugins.
*   4. `gsap-banned-devtools-production`: Prohibits GSDevTools or MotionPathHelper without dev guard.
*
* Escape Hatches:
*   `// scope-ok: <reason>`, `// revert-ok: <reason>`, `// plugin-ok: <reason>`, `// devtools-ok: <reason>`
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_gsap_framework_hygiene.ts
*/
enableCompileCache();
const GSAP_FRAMEWORK_HYGIENE_RULES = [
	"gsap-unscoped-component-selectors",
	"gsap-missing-context-revert",
	"gsap-missing-plugin-registration",
	"gsap-banned-devtools-production"
];
const DEVTOOLS_GUARD_WINDOW_PRE_CHARS = 150;
const DEVTOOLS_GUARD_WINDOW_POST_CHARS = 200;
function findGsapScopeRanges(content) {
	const ranges = [];
	const scopeRegex = /\b(?:gsap\.context|useGSAP|\w*ctx\.add)\s*\(/g;
	let match;
	while ((match = scopeRegex.exec(content)) !== null) {
		const openParenIndex = match.index + match[0].length - 1;
		const result = scanBalancedParens(content, openParenIndex + 1);
		if (result.depth === 0) ranges.push({
			start: match.index,
			end: result.end
		});
	}
	return ranges;
}
function isInsideAnyScopeRange(index, ranges) {
	return ranges.some((r) => index >= r.start && index < r.end);
}
var ValidateGsapFrameworkHygieneAuditor = class extends FileScanAuditor {
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options);
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			projectRoot: effectiveRoot,
			roots: targetRoots,
			id: "validate_gsap_framework_hygiene",
			name: "GSAP Framework Hygiene",
			description: "Governance of UI lifecycle, scope, and GSAP plugins",
			family: "architecture",
			packageName: "GSAP",
			icon: "🎭",
			configKey: "animation",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			ruleCapabilities: createRuleCapabilities(GSAP_FRAMEWORK_HYGIENE_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			allowedExtensions: /* @__PURE__ */ new Set([
				".ts",
				".vue",
				".tsx",
				".jsx"
			]),
			ruleIds: GSAP_FRAMEWORK_HYGIENE_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(GSAP_FRAMEWORK_HYGIENE_RULES, "behavior"),
			ruleDescriptions: {
				"gsap-unscoped-component-selectors": "Unscoped global selector in UI",
				"gsap-missing-context-revert": "Missing revert or cleanup on unmount",
				"gsap-missing-plugin-registration": "Unregistered GSAP plugin used",
				"gsap-banned-devtools-production": "Devtools enabled in production"
			},
			ruleRemediations: {
				"gsap-unscoped-component-selectors": "1. Root Cause:\nGlobal CSS string selectors (e.g. \".card\", \"#btn\") are used directly inside a UI component (Vue SFC, React, Svelte).\nThis queries elements across the entire global document, accidentally animating other component instances or foreign DOM elements on the page.\n\n2. Diagnosis:\nIdentify string selectors passed to gsap.to/from/fromTo. Inside UI components, selectors must be strictly scoped to the component subtree.\n\n3. Canonical Solution:\n1. Wrap animations inside \"gsap.context((self) => { ... }, rootElementRef.value)\". All selectors inside the context are automatically scoped to rootElementRef.\n2. Alternatively, pass direct DOM element references (template ref or ref.value) instead of strings.\n\n4. Example / Auto-fix command:\n// ❌ Incorrect: unscoped global selector in UI component\ngsap.to(\".card\", { opacity: 1 });\n\n// ✅ Correct: scoped with gsap.context and template ref\nconst root = ref<HTMLElement | null>(null);\nlet ctx: gsap.Context;\nonMounted(() => {\n  ctx = gsap.context(() => {\n    gsap.to(\".card\", { opacity: 1 }); // searches only within root\n  }, root.value);\n});",
				"gsap-missing-context-revert": "1. Root Cause:\nThe component initializes animations with \"gsap.context()\" but does not call \"ctx.revert()\" on unmount (onUnmounted in Vue, useEffect cleanup in React).\nThis causes memory leaks, orphan tweens, and visual artifacts when the user navigates away and back to the component.\n\n2. Diagnosis:\nInspect the component lifecycle hook where the GSAP context is created.\n\n3. Canonical Solution:\nStore the gsap.context instance in a component-scoped variable and call \"ctx.revert()\" in the \"onUnmounted\" (or \"onScopeDispose\") hook.\n\n4. Example / Auto-fix command:\n// ❌ Incorrect: context created without revert on unmount\nonMounted(() => {\n  gsap.context(() => { gsap.to(el.value, { x: 100 }); });\n});\n\n// ✅ Correct: canonical revert on unmount\nlet ctx: gsap.Context;\nonMounted(() => {\n  ctx = gsap.context(() => { gsap.to(el.value, { x: 100 }); });\n});\nonUnmounted(() => {\n  ctx?.revert();\n});",
				"gsap-missing-plugin-registration": "1. Root Cause:\nA GSAP plugin (ScrollTrigger, Flip, Draggable, SplitText, etc.) is imported but \"gsap.registerPlugin(PluginName)\" is never called.\nWithout explicit registration, modern bundlers like Vite / Rollup may tree-shake the plugin in production or fail to initialize internal GSAP core hooks.\n\n2. Diagnosis:\nCheck file imports. When importing ScrollTrigger from \"gsap/ScrollTrigger\", it must be registered before use.\n\n3. Canonical Solution:\nInvoke \"gsap.registerPlugin(ScrollTrigger)\" immediately below the import statements.\n\n4. Example / Auto-fix command:\n// ❌ Incorrect: import and direct use\nimport { ScrollTrigger } from \"gsap/ScrollTrigger\";\ngsap.to(\".box\", { scrollTrigger: \".box\" });\n\n// ✅ Correct: explicit plugin registration\nimport { gsap } from \"gsap\";\nimport { ScrollTrigger } from \"gsap/ScrollTrigger\";\ngsap.registerPlugin(ScrollTrigger);",
				"gsap-banned-devtools-production": "1. Root Cause:\nGSAP visual debugging tools (GSDevTools or MotionPathHelper) were detected without a development environment guard.\nThese tools increase bundle size and expose visual debugging overlays in production environments.\n\n2. Diagnosis:\nLocate calls to \"GSDevTools.create()\" or \"MotionPathHelper.create()\".\n\n3. Canonical Solution:\nWrap the call in an \"if (import.meta.env.DEV)\" guard or remove the tool once animation tuning is complete.\n\n4. Example / Auto-fix command:\n// ❌ Incorrect: GSDevTools exposed unconditionally\nGSDevTools.create();\n\n// ✅ Correct: protected under development guard\nif (import.meta.env.DEV) {\n  GSDevTools.create();\n}"
			}
		});
	}
	scanFile(relPath, content) {
		const norm = normalizePosixPath(relPath);
		if (!this.isCodeFile(norm) || isExemptFile(relPath)) return;
		this.runSubAuditorSync("gsap-unscoped-component-selectors", () => {
			if (this.isUiComponent(norm) && isInCodeRoots(relPath)) this.scanUnscopedSelectors(relPath, content);
		});
		this.runSubAuditorSync("gsap-missing-context-revert", () => {
			if (this.isUiComponent(norm) && isInCodeRoots(relPath)) this.scanContextRevert(relPath, content);
		});
		this.runSubAuditorSync("gsap-missing-plugin-registration", () => {
			this.scanPluginRegistration(relPath, content);
		});
		this.runSubAuditorSync("gsap-banned-devtools-production", () => {
			this.scanDevtoolsProduction(relPath, content);
		});
	}
	isCodeFile(norm) {
		return norm.endsWith(".ts") || norm.endsWith(".vue") || norm.endsWith(".tsx") || norm.endsWith(".jsx");
	}
	isUiComponent(norm) {
		const config = getAuditConfig(this.projectRoot);
		const uiRoots = [...config.paths.componentsRoots ?? [], ...config.paths.viewsRoots ?? []];
		return norm.endsWith(".vue") || matchesAnyRoot(norm, uiRoots);
	}
	scanUnscopedSelectors(relPath, content) {
		const scopeRanges = findGsapScopeRanges(content);
		const unscopedRegex = /\b(?:gsap|timeline|\w*Timeline|tl)\s*\.\s*(?:to|from|fromTo)\s*\(\s*['"]([.#][\w\s>+~.:#-]+)['"]/g;
		let m;
		while ((m = unscopedRegex.exec(content)) !== null) {
			const selector = m[1];
			if (!isInsideAnyScopeRange(m.index, scopeRanges)) this.addViolationAtMatch({
				ruleId: "gsap-unscoped-component-selectors",
				filePath: relPath,
				content,
				matchIndex: m.index,
				message: `Global selector '${selector}' in UI component without scoped context. Use 'gsap.context(..., rootRef.value)' or 'useGSAP()' to prevent leaks.`,
				severity: "error"
			});
		}
	}
	scanContextRevert(relPath, content) {
		if (!/gsap\.context\s*\(/.test(content)) return;
		const hasRevert = /\.revert\s*\(|\.kill\s*\(/.test(content);
		const hasUnmountLifecycle = /onUnmounted|onScopeDispose|useEffect/.test(content);
		if (!hasRevert || !hasUnmountLifecycle) this.addViolationAtMatch({
			ruleId: "gsap-missing-context-revert",
			filePath: relPath,
			content,
			matchIndex: content.indexOf("gsap.context"),
			message: "Usage of 'gsap.context()' in UI component without calling 'revert()' in 'onUnmounted' / 'onScopeDispose'.",
			severity: "error"
		});
	}
	scanPluginRegistration(relPath, content) {
		const pluginImportRegex = /import\s*\{[^}]*\b(ScrollTrigger|Flip|Draggable|SplitText|Observer|ScrollSmoother|InertiaPlugin|MotionPathPlugin)\b[^}]*\}\s*from\s*['"]gsap\/[a-zA-Z0-9]+['"]/g;
		let pluginMatch;
		while ((pluginMatch = pluginImportRegex.exec(content)) !== null) {
			const pluginName = pluginMatch[1];
			if (!new RegExp(`gsap\\.registerPlugin\\s*\\([^)]*\\b${pluginName}\\b`).test(content)) this.addViolationAtMatch({
				ruleId: "gsap-missing-plugin-registration",
				filePath: relPath,
				content,
				matchIndex: pluginMatch.index,
				message: `GSAP plugin '${pluginName}' imported without calling 'gsap.registerPlugin(${pluginName})'. Risk of tree-shaking elimination.`,
				severity: "error"
			});
		}
	}
	scanDevtoolsProduction(relPath, content) {
		const devtoolsRegex = /\b(GSDevTools|MotionPathHelper)\.create\s*\(/g;
		let devtoolsMatch;
		while ((devtoolsMatch = devtoolsRegex.exec(content)) !== null) {
			const toolName = devtoolsMatch[1];
			const windowAround = content.slice(Math.max(0, devtoolsMatch.index - 150), Math.min(content.length, devtoolsMatch.index + 200));
			if (!/import\.meta\.env\.DEV|NODE_ENV\s*!==\s*['"]production['"]/i.test(windowAround)) this.addViolationAtMatch({
				ruleId: "gsap-banned-devtools-production",
				filePath: relPath,
				content,
				matchIndex: devtoolsMatch.index,
				message: `Debugging tool '${toolName}' detected without 'import.meta.env.DEV' environment guard. Prohibited in production.`,
				severity: "error"
			});
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateGsapFrameworkHygieneAuditor());
//#endregion
export { DEVTOOLS_GUARD_WINDOW_POST_CHARS, DEVTOOLS_GUARD_WINDOW_PRE_CHARS, GSAP_FRAMEWORK_HYGIENE_RULES, ValidateGsapFrameworkHygieneAuditor, findGsapScopeRanges };
