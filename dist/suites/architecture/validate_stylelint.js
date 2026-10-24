import { DEFAULT_AUDIT_CONFIG } from "../../core/auditConfigDefaults.js";
import { safeJsonParse, safeReadFileSync, tryOrNull } from "../../core/safeUtils.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { CANONICAL_IGNORE_DIRS } from "../../core/canonicalIgnoreRegistry.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { BaseAuditor, collectRepositoryFiles, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { SASS_TRAPS_RULE_NAME, sassTrapsPlugin } from "./stylelintSassTrapsPlugin.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import stylelint from "stylelint";
// src/suites/architecture/validate_stylelint.ts
/**
* packages/auditor/src/suites/architecture/validate_stylelint.ts
*
* STYLELINT CSS & SCSS HYGIENE AUDITOR (Node.js 26+ Native)
*
* Audits stylesheets, component styles, and Vue 3 SFCs (<style scoped lang="scss">)
* using the official Stylelint engine with stylelint-config-standard-scss,
* stylelint-config-standard-vue, and stylelint-order.
*
* Performance:
*   - Ephemeral content-hashed caching at scratch/cache/stylelint_cache.json
*   - Multithreaded orchestration via audit_full master runner
*   - Zero false positives on SCSS nesting, mixins, or scoped components
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* src/suites/architecture/validate_stylelint.ts
*   npm run validate:stylelint
*/
enableCompileCache();
const STYLELINT_RULES = [
	"stylelint-issue",
	"css-duplicate-selectors",
	"css-duplicate-properties",
	"css-empty-blocks",
	"css-order-violation",
	"scss-syntax-issue",
	"scss-sass-collision-casing",
	"scss-strict-values"
];
function resolveStylelintConfigFile(projectRoot, configuredConfigFile) {
	if (configuredConfigFile) {
		const customCandidate = path.resolve(projectRoot, configuredConfigFile);
		if (fs.existsSync(customCandidate)) return customCandidate;
	}
	for (const name of [
		".stylelintrc.json",
		".stylelintrc.js",
		".stylelintrc.cjs",
		".stylelintrc.mjs",
		".stylelintrc.yaml",
		".stylelintrc.yml",
		"stylelint.config.js",
		"stylelint.config.cjs",
		"stylelint.config.mjs"
	]) {
		const candidate = path.resolve(projectRoot, name);
		if (fs.existsSync(candidate)) return candidate;
	}
	const pkgJsonPath = path.resolve(projectRoot, "package.json");
	const pkgRaw = safeReadFileSync(pkgJsonPath);
	if (pkgRaw) {
		if (safeJsonParse(pkgRaw)?.stylelint) return pkgJsonPath;
	}
	const canonicalConfig = path.resolve(import.meta.dirname, "../../../.stylelintrc.json");
	if (fs.existsSync(canonicalConfig)) return canonicalConfig;
	return ".stylelintrc.json";
}
function categorizeStylelintRule(ruleName) {
	if (!ruleName) return "stylelint-issue";
	if (ruleName === "sass-traps/collision-casing") return "scss-sass-collision-casing";
	if (ruleName === "scale-unlimited/declaration-strict-value") return "scss-strict-values";
	if (ruleName === "no-duplicate-selectors") return "css-duplicate-selectors";
	if (ruleName === "declaration-block-no-duplicate-properties") return "css-duplicate-properties";
	if (ruleName === "block-no-empty") return "css-empty-blocks";
	if (ruleName.startsWith("order/")) return "css-order-violation";
	if (ruleName.startsWith("scss/")) return "scss-syntax-issue";
	return "stylelint-issue";
}
function buildStylelintConfig(configFile, customRules) {
	return {
		extends: [configFile],
		plugins: [sassTrapsPlugin],
		rules: {
			"function-name-case": ["lower", { ignoreFunctions: [
				"/^[A-Z]/",
				"Drop-Shadow",
				"Drop-shadow",
				"hue-Rotate",
				"Hue-Rotate"
			] }],
			"value-keyword-case": ["lower", {
				camelCaseSvgKeywords: true,
				ignoreProperties: ["/--.*/"],
				ignoreFunctions: ["v-bind"]
			}],
			[SASS_TRAPS_RULE_NAME]: true,
			...customRules
		}
	};
}
function buildStylelintIgnoreGlobs(configIgnoreGlobs, stylelintIgnoreGlobs, exemptPaths, exemptFiles) {
	const normExemptPaths = (exemptPaths ?? []).map((p) => {
		const posixP = normalizePosixPath(p);
		return posixP.endsWith(path.posix.sep) ? `${posixP}**` : path.posix.join(posixP, "**");
	});
	const normExemptFiles = (exemptFiles ?? []).map((f) => normalizePosixPath(f));
	const normIgnores = (configIgnoreGlobs ?? []).map((g) => normalizePosixPath(g));
	const normStylelintIgnores = (stylelintIgnoreGlobs ?? []).map((g) => normalizePosixPath(g));
	return [
		...Array.from(CANONICAL_IGNORE_DIRS).map((d) => `${d}/**`),
		"dist/**",
		"dev-dist/**",
		"scratch/**",
		"tests/**",
		"**/*.spec.*",
		"**/*.test.*",
		...normIgnores,
		...normStylelintIgnores,
		...normExemptPaths,
		...normExemptFiles
	];
}
function repairDeprecatedWordBreak(content) {
	const pattern = /\bword-break\s*:\s*break-word(\s*!important)?\s*;/g;
	if (!pattern.test(content)) return {
		modified: false,
		content
	};
	return {
		modified: true,
		content: content.replace(pattern, (_match, imp) => {
			return `overflow-wrap: break-word${imp ?? ""};`;
		})
	};
}
const DEPRECATED_CSS_SCANNABLE_EXTENSIONS = /* @__PURE__ */ new Set([
	".css",
	".scss",
	".sass",
	".vue"
]);
function repairDeprecatedCssPropertiesInRoots(projectRoot, roots) {
	let repairedCount = 0;
	for (const root of roots) {
		const fullRoot = path.resolve(projectRoot, root);
		if (!fs.existsSync(fullRoot)) continue;
		const files = collectRepositoryFiles(fullRoot, projectRoot, [], DEPRECATED_CSS_SCANNABLE_EXTENSIONS);
		for (const filePath of files) tryOrNull(() => {
			const { modified, content } = repairDeprecatedWordBreak(fs.readFileSync(filePath, "utf8"));
			if (modified) {
				fs.writeFileSync(filePath, content, "utf8");
				repairedCount++;
			}
		});
	}
	return repairedCount;
}
const STYLELINT_BUILTIN_FIXABLE_RULES = [
	"alpha-value-notation",
	"at-rule-empty-line-before",
	"at-rule-no-vendor-prefix",
	"color-function-alias-notation",
	"color-function-notation",
	"color-hex-length",
	"comment-empty-line-before",
	"comment-whitespace-inside",
	"custom-property-empty-line-before",
	"declaration-block-no-duplicate-properties",
	"declaration-block-no-redundant-longhand-properties",
	"declaration-empty-line-before",
	"declaration-property-value-keyword-no-deprecated",
	"display-notation",
	"font-family-name-quotes",
	"font-weight-notation",
	"function-calc-no-unspaced-operator",
	"function-name-case",
	"function-url-quotes",
	"hue-degree-notation",
	"import-notation",
	"keyframe-selector-notation",
	"length-zero-no-unit",
	"lightness-notation",
	"media-feature-name-no-vendor-prefix",
	"media-feature-range-notation",
	"property-layout-mappings",
	"property-no-vendor-prefix",
	"relative-selector-nesting-notation",
	"rule-empty-line-before",
	"selector-attribute-quotes",
	"selector-no-vendor-prefix",
	"selector-not-notation",
	"selector-pseudo-element-colon-notation",
	"selector-type-case",
	"shorthand-property-no-redundant-values",
	"unit-layout-mappings",
	"value-keyword-case",
	"value-keyword-layout-mappings",
	"value-no-vendor-prefix"
];
const STYLELINT_BUILTIN_FIXABLE_SET = new Set(STYLELINT_BUILTIN_FIXABLE_RULES);
const STYLELINT_ORDER_FIXABLE_RULES = [
	"order/order",
	"order/properties-order",
	"order/properties-alphabetical-order",
	"order/custom-properties-alphabetical-order"
];
const STYLELINT_ORDER_FIXABLE_SET = new Set(STYLELINT_ORDER_FIXABLE_RULES);
function isStylelintRuleFixable(ruleName) {
	if (!ruleName) return false;
	if (ruleName === "sass-traps/collision-casing") return true;
	if (STYLELINT_ORDER_FIXABLE_SET.has(ruleName)) return true;
	if (STYLELINT_BUILTIN_FIXABLE_SET.has(ruleName)) return true;
	return false;
}
function processStylelintResults(results, projectRoot, isFixMode = false) {
	let totalWarnings = 0;
	let totalErrors = 0;
	const violations = [];
	for (const fileResult of results) {
		const relFile = normalizePosixPath(fileResult.source ?? "", projectRoot);
		for (const warning of fileResult.warnings) {
			const ruleId = categorizeStylelintRule(warning.rule);
			const severity = warning.severity === "error" ? "error" : "warning";
			if (severity === "error") totalErrors++;
			else totalWarnings++;
			const isFixable = isFixMode ? false : Boolean(warning.fix) || isStylelintRuleFixable(warning.rule);
			violations.push({
				ruleId,
				severity,
				file: relFile,
				line: warning.line || 1,
				message: warning.text,
				context: warning.rule || "stylelint",
				fixable: isFixable
			});
		}
	}
	return {
		violations,
		totalErrors,
		totalWarnings
	};
}
function persistStylelintReport(projectRoot, suiteId, filesScanned, totals, results, durationMs) {
	const reportDir = path.resolve(projectRoot, "scratch/audits/architecture");
	fs.mkdirSync(reportDir, { recursive: true });
	const reportFile = path.resolve(reportDir, `${suiteId}.json`);
	tryOrNull(() => {
		fs.writeFileSync(reportFile, JSON.stringify({
			summary: {
				filesScanned,
				totalErrors: totals.totalErrors,
				totalWarnings: totals.totalWarnings,
				durationMs
			},
			results: results.map((r) => ({
				source: normalizePosixPath(r.source ?? "", projectRoot),
				errored: r.errored,
				warnings: r.warnings
			}))
		}, null, 2), "utf-8");
	});
}
var StylelintAuditor = class StylelintAuditor extends BaseAuditor {
	lastLinterResult = null;
	static gitIgnoreEntries = [{
		id: ".stylelintcache",
		pattern: ".stylelintcache",
		samplePath: ".stylelintcache",
		reason: "Incremental cache file generated by Stylelint",
		isApplicable: (config) => config.styles?.stylelint?.enabled !== false && config.stylelint?.enabled !== false
	}];
	constructor(options) {
		const projectRoot = options?.projectRoot;
		const config = getAuditConfig(projectRoot);
		const roots = Array.from(/* @__PURE__ */ new Set([...config.paths.srcRoots ?? [], ...config.paths.stylesRoots ?? []]));
		super({
			usesThirdPartyTool: true,
			requiredPermissions: ["--allow-child-process"],
			thirdPartyToolPolicy: {
				toolName: "Stylelint",
				fallbackBehavior: "violation",
				fallbackRuleId: "stylelint-issue"
			},
			ruleCapabilities: createRuleCapabilities(STYLELINT_RULES, {
				speed: "light",
				phase: "normal",
				fix: "normal",
				md: false,
				ast: false,
				changedOnly: false,
				critical: true
			}, [...STYLELINT_RULES]),
			fixableRuleIds: [...STYLELINT_RULES],
			gitIgnoreEntries: StylelintAuditor.gitIgnoreEntries,
			cachePaths: [".stylelintcache"],
			id: options?.id || "validate_stylelint",
			name: options?.name || "Stylelint & SCSS Hygiene Validator",
			description: "Audits CSS/SCSS quality, syntax, and patterns with Stylelint",
			family: "architecture",
			packageName: "Stylelint",
			configKey: "stylelint.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "🎨",
			ruleIds: STYLELINT_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(STYLELINT_RULES, "hygiene"),
			ruleDescriptions: {
				"stylelint-issue": "CSS or SCSS standard violation",
				"css-duplicate-selectors": "Duplicate selectors in stylesheet block",
				"css-duplicate-properties": "Duplicate properties in stylesheet rule",
				"css-empty-blocks": "Empty stylesheet blocks",
				"css-order-violation": "CSS property order violation",
				"scss-syntax-issue": "Invalid or unknown SCSS syntax",
				"scss-sass-collision-casing": "CSS function collides with Sass builtin",
				"scss-strict-values": "Non-strict values in SCSS"
			},
			ruleRemediations: {
				"stylelint-issue": "📖 REMEDIATION GUIDE: stylelint-issue\n1. Root Cause: A violation of standard stylesheet rules configured in .stylelintrc.json was detected (unknown selectors, invalid units, non-compliant directives).\n2. Diagnosis: Inspect the exact Stylelint message in the report to identify the specific rule (e.g., selector-class-pattern, property-no-unknown).\n3. Canonical Solution: Run npm run auditor:fix or npm run auditor:css:fix to automatically correct fixable issues, or update styles to modern CSS/SCSS standards.\n4. Example / Auto-fix command:\n   npm run auditor:fix",
				"css-duplicate-selectors": "📖 REMEDIATION GUIDE: css-duplicate-selectors\n1. Root Cause: The same CSS or SCSS selector was declared multiple times within the same block or stylesheet, creating fragmented styles and debug hazards.\n2. Diagnosis: Locate the duplicate selector indicated in the report alongside its prior occurrence.\n3. Canonical Solution: Merge declarations from both blocks into a single consolidated rule.\n4. Example / Auto-fix command:\n   ❌ Incorrect: .badge { color: red; } ... .badge { padding: 4px; }\n   ✅ Correct:   .badge { color: red; padding: 4px; }",
				"css-duplicate-properties": "📖 REMEDIATION GUIDE: css-duplicate-properties\n1. Root Cause: A stylesheet rule declares the same CSS property more than once with conflicting, redundant, or repeated values.\n2. Diagnosis: Check property declarations within the reported style block.\n3. Canonical Solution: Remove redundant properties, keeping only the single intended declaration.\n4. Example / Auto-fix command:\n   npm run auditor:fix",
				"css-empty-blocks": "📖 REMEDIATION GUIDE: css-empty-blocks\n1. Root Cause: An empty stylesheet block (without property declarations) was detected.\n2. Diagnosis: Look for selectors with empty braces {} in the reported file.\n3. Canonical Solution: Delete the unnecessary selector block or provide required style properties.\n4. Example / Auto-fix command:\n   npm run auditor:fix",
				"css-order-violation": "📖 REMEDIATION GUIDE: css-order-violation\n1. Root Cause: CSS properties do not follow canonical ordering (positioning -> box model -> typography -> visual/color -> animation).\n2. Diagnosis: Inspect the property order in the reported rule.\n3. Canonical Solution: Run npm run auditor:fix to automatically reorder properties.\n4. Example / Auto-fix command:\n   npm run auditor:fix",
				"scss-syntax-issue": "📖 REMEDIATION GUIDE: scss-syntax-issue\n1. Root Cause: Syntax error while parsing the SCSS file or Vue <style lang=\"scss\"> block (unclosed braces, broken @include, invalid interpolation).\n2. Diagnosis: Inspect the reported line and verify brace balance with sass-embedded.\n3. Canonical Solution: Correct the SCSS syntax error so the stylesheet compiles cleanly.\n4. Example / Auto-fix command:\n   Fix unclosed braces or invalid SCSS syntax.",
				"scss-sass-collision-casing": "📖 REMEDIATION GUIDE: scss-sass-collision-casing\n1. Root Cause: A native CSS function collides with global Sass builtins (such as min(), max(), color(), invert()).\n2. Diagnosis: Check if the math or color function is intercepted by Sass instead of emitted as native CSS.\n3. Canonical Solution: Use qualified Sass modules (e.g. math.min() with @use \"sass:math\") or use uppercase/lowercase CSS escape conventions.\n4. Example / Auto-fix command:\n   Use math.min(...) or native CSS syntax.",
				"scss-strict-values": "📖 REMEDIATION GUIDE: scss-strict-values\n1. Root Cause: Raw numeric values or hex colors were used in properties governed by design tokens (colors, spacing, font-size, z-index, border-radius).\n2. Diagnosis: Look for values like #ff0000, 16px, 9999, or 8px in properties restricted by stylelint-declaration-strict-value.\n3. Canonical Solution: Replace raw literals with the corresponding SCSS or CSS variable (e.g. $color-danger, var(--font-size-md), $z-modal).\n4. Example / Auto-fix command:\n   ❌ Incorrect: .btn { background-color: #2563eb; font-size: 14px; }\n   ✅ Correct:   .btn { background-color: $color-primary; font-size: var(--font-size-sm); }"
			},
			coverage: {
				include: [
					...deriveCoverageFromRoots(roots, /* @__PURE__ */ new Set([
						".css",
						".scss",
						".sass",
						".vue"
					]), projectRoot).include,
					".stylelintrc*",
					"stylelint.config.*"
				],
				exclude: [
					"node_modules/**",
					"dist/**",
					"scratch/**",
					"tests/**",
					"**/*.spec.*",
					"**/*.test.*"
				],
				source: "runtime"
			},
			roots,
			projectRoot
		});
	}
	getLastLinterResult() {
		return this.lastLinterResult;
	}
	async runAudit() {
		if (this.isSuiteGatingDisabled("Stylelint desactivado en config")) return;
		const config = getAuditConfig(this.projectRoot);
		const stylelintConfig = config.stylelint ?? config.styles?.stylelint;
		const roots = this.roots.length > 0 ? this.roots : config.paths?.srcRoots ?? DEFAULT_AUDIT_CONFIG.paths.srcRoots;
		this.redeclareCoverage({
			include: [
				...deriveCoverageFromRoots(roots, /* @__PURE__ */ new Set([
					".css",
					".scss",
					".sass",
					".vue"
				]), this.projectRoot).include,
				".stylelintrc*",
				"stylelint.config.*"
			],
			exclude: [
				"node_modules/**",
				"dist/**",
				"scratch/**",
				"tests/**",
				"**/*.spec.*",
				"**/*.test.*"
			],
			source: "runtime"
		});
		const configFile = resolveStylelintConfigFile(this.projectRoot, stylelintConfig?.configFile);
		if (fs.existsSync(configFile)) {
			const relConfig = normalizePosixPath(configFile, this.projectRoot);
			if (!relConfig.startsWith("..") && !path.isAbsolute(relConfig)) this.recordScanned(configFile);
		}
		const isFixMode = this.isFixModeRequested();
		const cacheDir = path.resolve(this.projectRoot, "scratch/cache");
		const cacheLocation = path.resolve(cacheDir, "stylelint_cache.json");
		fs.mkdirSync(cacheDir, { recursive: true });
		const filesGlobs = roots.map((r) => `${normalizePosixPath(r, this.projectRoot)}/**/*.{css,scss,sass,vue}`);
		const ignoreGlobs = buildStylelintIgnoreGlobs([...config.paths.ignoreGlobs ?? [], ...this.extraIgnorePatterns ?? []], stylelintConfig?.ignoreGlobs, [...this.exemptPaths ?? [], ...stylelintConfig?.exemptPaths ?? []], stylelintConfig?.exemptFiles);
		const lintConfig = buildStylelintConfig(configFile, stylelintConfig?.rules);
		if (isFixMode) repairDeprecatedCssPropertiesInRoots(this.projectRoot, roots);
		let linterResult;
		try {
			linterResult = await stylelint.lint({
				files: filesGlobs,
				globbyOptions: {
					cwd: this.projectRoot,
					ignore: ignoreGlobs
				},
				config: lintConfig,
				cache: true,
				cacheLocation,
				cacheStrategy: "content",
				fix: isFixMode,
				allowEmptyInput: true
			});
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			this.addViolation({
				ruleId: "stylelint-issue",
				severity: "error",
				file: configFile,
				line: 1,
				message: `Fallo al ejecutar Stylelint: ${errorMsg}`,
				context: "stylelint-engine-error"
			});
			for (const r of STYLELINT_RULES) if (r !== "stylelint-issue") this.markRuleEvaluated(r);
			return;
		}
		if (!linterResult) return;
		this.lastLinterResult = linterResult;
		for (const fileResult of linterResult.results) if (fileResult.source) this.recordScanned(fileResult.source);
		const { violations, totalErrors, totalWarnings } = processStylelintResults(linterResult.results, this.projectRoot, isFixMode);
		for (const ruleId of STYLELINT_RULES) this.runSubAuditorSync(ruleId, () => {
			for (const v of violations) if (v.ruleId === ruleId) {
				if (this.isPathIgnored(v.file) || this.isPathExempt(v.file)) continue;
				this.addViolation(isFixMode ? {
					...v,
					fixable: false
				} : v);
			}
		});
		persistStylelintReport(this.projectRoot, this.id, this.filesScannedCount, {
			totalErrors,
			totalWarnings
		}, linterResult.results, Math.round(this.durationsByRule.get("stylelint-issue") ?? 0));
		this.context.setMetric("Archivos Escaneados", this.filesScannedCount);
		this.context.setMetric("Errores CSS", totalErrors);
		this.context.setMetric("Advertencias CSS", totalWarnings);
		this.context.setMetric("Modo", isFixMode ? "fix" : "check");
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new StylelintAuditor());
export { STYLELINT_BUILTIN_FIXABLE_RULES, STYLELINT_ORDER_FIXABLE_RULES, STYLELINT_RULES, StylelintAuditor, StylelintAuditor as ValidateStylelintAuditor, buildStylelintConfig, buildStylelintIgnoreGlobs, categorizeStylelintRule, isStylelintRuleFixable, persistStylelintReport, processStylelintResults, repairDeprecatedCssPropertiesInRoots, repairDeprecatedWordBreak, resolveStylelintConfigFile };
