import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
import { toPosixRelative } from "../../core/safePath.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { parseVueSfc as parseVueSfcBlocks } from "../../core/vueSfcParser.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
// src/suites/architecture/validate_dead_css.ts
/**
* packages/auditor/src/suites/architecture/validate_dead_css.ts
*
* SCOPED DEAD CSS AUDITOR (Node.js 26+ Native)
*
* Enforces lean CSS bundles by detecting orphaned/unused classes inside <style scoped>
* blocks of Vue components across src/components and src/views.
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_dead_css.ts
*   npm run validate:dead-css
*/
enableCompileCache();
const DEAD_CSS_RULES = ["dead-scoped-css"];
const DEFAULT_GLOBAL_UTILITY_CLASSES = /* @__PURE__ */ new Set([
	"clickable",
	"flex",
	"hidden",
	"active",
	"disabled",
	"w-full",
	"h-full",
	"truncate",
	"pointer-events-none",
	"pointer-events-auto",
	"select-none",
	"custom-scrollbar",
	"empty-state",
	"scrollable-content",
	"modal-footer",
	"emoji",
	"tabular-nums"
]);
function getEffectiveGlobalUtilityClasses(projectRoot) {
	const configured = getAuditConfig(projectRoot).styles?.globalUtilityClasses ?? [];
	return /* @__PURE__ */ new Set([...DEFAULT_GLOBAL_UTILITY_CLASSES, ...configured]);
}
const VUE_TRANSITION_SUFFIXES = [
	"-enter-from",
	"-enter-active",
	"-enter-to",
	"-leave-from",
	"-leave-active",
	"-leave-to"
];
const EXCLUDED_EXTENSIONS = /* @__PURE__ */ new Set([
	"scss",
	"css",
	"vue",
	"png",
	"webp"
]);
function extractClassNamesFromSelector(selector) {
	const classRegex = /(?:^|[^\w-])\.([a-z_-][\w-]*)/gi;
	const classes = [];
	let match;
	while ((match = classRegex.exec(selector)) !== null) {
		const className = match[1];
		if (className) classes.push(className);
	}
	return classes;
}
function extractScopedRulesFromVueContent(rawContent) {
	const rules = [];
	const styleRegex = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
	let match;
	while ((match = styleRegex.exec(rawContent)) !== null) {
		const attrs = match[1] ?? "";
		if (!/\bscoped\b/i.test(attrs)) continue;
		const startLine = rawContent.slice(0, match.index).split("\n").length;
		const lines = (match[2] ?? "").split("\n");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (/(?:^|[^\w-])\.[a-z_-][\w-]*/i.test(line)) {
				const colonIdx = line.indexOf(":");
				const dotIdx = line.indexOf(".");
				if (colonIdx === -1 || colonIdx > dotIdx) rules.push({
					line: startLine + i,
					selector: line.trim(),
					rawBlock: line
				});
			}
		}
	}
	return rules;
}
function collectGlobalCodeTokens(projectRoot, srcFiles) {
	const globalTokens = /* @__PURE__ */ new Set();
	for (const relPath of srcFiles) {
		if (isTestPath(relPath)) continue;
		const fullPath = path.resolve(projectRoot, relPath);
		const words = fs.readFileSync(fullPath, "utf-8").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").match(/[\w-]{2,}/g);
		if (words) for (const w of words) globalTokens.add(w);
	}
	return globalTokens;
}
function extractComponentLogic(rawContent) {
	const sfc = parseVueSfcBlocks(rawContent);
	const componentLogic = `${sfc.template?.content ?? ""}\n${sfc.scripts.map((s) => s.content).join("\n")}`;
	const dynamicPrefixes = /* @__PURE__ */ new Set();
	const dynamicClassRegex = /`([\w-]+-)\$\{/g;
	let dynMatch;
	while ((dynMatch = dynamicClassRegex.exec(componentLogic)) !== null) if (dynMatch[1]) dynamicPrefixes.add(dynMatch[1]);
	const concatPrefixRegex = /['"]([\w-]+-)['"]\s*\+/g;
	while ((dynMatch = concatPrefixRegex.exec(componentLogic)) !== null) if (dynMatch[1]) dynamicPrefixes.add(dynMatch[1]);
	return {
		componentLogic,
		dynamicPrefixes
	};
}
function isClassExempt(className, globalUtilityClasses, dynamicPrefixes) {
	if (globalUtilityClasses.has(className)) return true;
	if (VUE_TRANSITION_SUFFIXES.some((suffix) => className.endsWith(suffix))) return true;
	if (Array.from(dynamicPrefixes).some((prefix) => className.startsWith(prefix))) return true;
	return false;
}
function auditSingleRuleClasses(rule, params, dynamicPrefixes, componentLogic) {
	let count = 0;
	const classNames = extractClassNamesFromSelector(rule.selector);
	for (const className of classNames) {
		if (EXCLUDED_EXTENSIONS.has(className) || isClassExempt(className, params.globalUtilityClasses, dynamicPrefixes)) continue;
		count++;
		if (!componentLogic.includes(className) && !params.globalTokens.has(className)) params.auditor.addViolation({
			ruleId: "dead-scoped-css",
			severity: "error",
			file: params.relFile,
			line: rule.line,
			message: `Scoped CSS class '.${className}' is dead code (orphaned): not found in component template or script logic.`,
			context: className
		});
	}
	return count;
}
function auditComponentScopedCss(params) {
	const { componentLogic, dynamicPrefixes } = extractComponentLogic(params.rawContent);
	let checkedCount = 0;
	for (const rule of params.scopedRules) checkedCount += auditSingleRuleClasses(rule, params, dynamicPrefixes, componentLogic);
	return checkedCount;
}
var DeadCssAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const projectRoot = options.projectRoot ?? process.cwd();
		const config = getAuditConfig(projectRoot);
		const compRoots = [...config.paths.componentsRoots ?? [], ...config.paths.viewsRoots ?? []];
		super({
			ruleFixers: {},
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(DEAD_CSS_RULES, {
				speed: "light",
				phase: "normal",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_dead_css",
			name: "Scoped Dead CSS Auditor",
			description: "Detects orphaned scoped CSS classes in Vue components",
			family: "architecture",
			ruleIds: DEAD_CSS_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(DEAD_CSS_RULES, "hygiene"),
			packageName: "CSS",
			configKey: "styles.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "💀",
			ruleDescriptions: { "dead-scoped-css": "Orphaned unused scoped class" },
			ruleRemediations: { "dead-scoped-css": "📖 REMEDIATION GUIDE: dead-scoped-css\n1. Root Cause: A CSS class was declared within `<style scoped>` in a Vue component that is never used in `<template>` markup or `<script>` presentation logic. Dead CSS bloats bundle size and confuses maintainers.\n2. Diagnosis: Locate the reported CSS class within `<style scoped>` in the component.\n3. Canonical Solution:\n   a) If the HTML element was removed or refactored: delete the orphaned style rule.\n   b) If dynamically applied via string concatenation: use full static class names in templates (`:class=\"{ 'my-class': isActive }\"`) rather than dynamic fragments.\n   c) If transition-related or injected by an external library, configure the style in global stylesheets or declare the selector dynamically via Vue `:class` bindings.\n4. Example / Auto-fix command:\n   ❌ Orphaned class: `.btn-old-badge { font-size: 10px; }` (unused in template)\n   ✅ Clean:          Removed from `<style scoped>` block." },
			coverage: { include: deriveCoverageFromRoots(compRoots, /* @__PURE__ */ new Set([".vue"]), projectRoot).include },
			projectRoot
		});
	}
	async runAudit() {
		const config = getAuditConfig(this.projectRoot);
		const globalUtilityClasses = getEffectiveGlobalUtilityClasses(this.projectRoot);
		const srcRoots = config.paths.srcRoots ?? [];
		const allSrcFiles = this.context.collectFiles(srcRoots, /* @__PURE__ */ new Set([
			".ts",
			".vue",
			".json"
		]));
		const globalTokens = collectGlobalCodeTokens(this.projectRoot, allSrcFiles);
		const compRoots = [...config.paths.componentsRoots ?? [], ...config.paths.viewsRoots ?? []];
		this.redeclareCoverage({ include: deriveCoverageFromRoots(compRoots, /* @__PURE__ */ new Set([".vue"]), this.projectRoot).include });
		const componentFiles = this.context.collectFiles(compRoots, /* @__PURE__ */ new Set([".vue"]));
		if (componentFiles.length === 0) {
			this.runSubAuditorSync("dead-scoped-css", () => {
				this.markRuleNotApplicable("dead-scoped-css", "No .vue components found in project");
			});
			return;
		}
		let scopedClassesChecked = 0;
		this.runSubAuditorSync("dead-scoped-css", () => {
			for (const relPath of componentFiles) {
				if (isTestPath(relPath)) continue;
				const fullPath = path.resolve(this.projectRoot, relPath);
				const relFile = toPosixRelative(this.projectRoot, fullPath);
				this.recordScanned(relFile);
				const rawContent = fs.readFileSync(fullPath, "utf-8");
				const scopedRules = extractScopedRulesFromVueContent(rawContent);
				scopedClassesChecked += auditComponentScopedCss({
					rawContent,
					relFile,
					scopedRules,
					globalTokens,
					globalUtilityClasses,
					auditor: this
				});
			}
		});
		this.context.setMetric("Components Scanned", this.filesScannedCount);
		this.context.setMetric("Scoped Classes", scopedClassesChecked);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new DeadCssAuditor());
export { DEAD_CSS_RULES, DEFAULT_GLOBAL_UTILITY_CLASSES, DeadCssAuditor, extractClassNamesFromSelector, extractScopedRulesFromVueContent, getEffectiveGlobalUtilityClasses };
