import { normalizePosixPath, parseJsonObjectOutput, parseLintResultsToFindings } from "../../core/reportUtils.js";
import { executeNodeCli, resolvePackageBin } from "../../cli/cliUtils.js";
import { BaseAuditor, createRuleCapabilities } from "../../core/auditorBase.js";
import { getVitePlusDefaultExcludeGlobs } from "../../core/vitePlusConfigSync.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
//#region src/suites/architecture/validate_oxlint.ts
/**
* src/suites/architecture/validate_oxlint.ts
*
* OXLINT & VITE+ CODE HYGIENE AUDITOR (Node.js 26+ Native)
*
* Runs Vite+ Oxlint (`vp lint`) across the repository with JSON formatter,
* maps errors and warnings to StandardAuditResult findings with severity 'error'
* (enforcing the strict Zero-Warning Policy), and persists structured reports.
* Supports auto-fix when `fix` is passed (`vp lint --fix`).
*
* Usage:
*   node src/suites/architecture/validate_oxlint.ts
*   vp check
*/
enableCompileCache();
const OXLINT_RULES = ["oxlint-violation"];
const MAX_BUFFER_BYTES = 52428800;
const EXECUTION_TIMEOUT_MS = 0;
const OXLINT_FIXABLE_RULES_LIST = [
	"no-var",
	"prefer-const",
	"eqeqeq",
	"no-else-return",
	"no-unneeded-ternary",
	"prefer-object-has-own",
	"no-useless-computed-key",
	"no-new-wrappers",
	"no-array-constructor",
	"no-useless-call",
	"no-useless-rename",
	"no-useless-concat",
	"no-extra-boolean-cast",
	"no-unused-labels",
	"no-compare-neg-zero",
	"prefer-exponentiation-operator",
	"prefer-numeric-literals",
	"prefer-object-spread",
	"prefer-rest-params",
	"prefer-spread",
	"yoda",
	"no-unnecessary-type-assertion",
	"@typescript-eslint/no-unnecessary-type-assertion",
	"consistent-indexed-object-style",
	"@typescript-eslint/consistent-indexed-object-style",
	"no-unnecessary-template-expression",
	"@typescript-eslint/no-unnecessary-template-expression",
	"no-unnecessary-type-arguments",
	"@typescript-eslint/no-unnecessary-type-arguments",
	"prefer-function-type",
	"@typescript-eslint/prefer-function-type",
	"prefer-return-this-type",
	"@typescript-eslint/prefer-return-this-type",
	"ban-tslint-comment",
	"@typescript-eslint/ban-tslint-comment",
	"unicorn/prefer-node-protocol",
	"unicorn/prefer-string-starts-ends-with",
	"unicorn/throw-new-error",
	"unicorn/no-useless-spread",
	"unicorn/no-unnecessary-slice-end",
	"unicorn/no-unnecessary-array-splice-count",
	"unicorn/explicit-timer-delay",
	"unicorn/prefer-date-now",
	"unicorn/prefer-prototype-methods",
	"unicorn/prefer-regexp-test",
	"unicorn/prefer-optional-catch-binding",
	"unicorn/prefer-string-trim-start-end",
	"unicorn/no-useless-promise-resolve-reject",
	"vitest/no-test-prefixes",
	"vitest/prefer-to-contain",
	"vitest/prefer-to-be",
	"vitest/prefer-comparison-matcher",
	"vitest/prefer-expect-resolves",
	"vitest/prefer-mock-promise-shorthand",
	"vitest/prefer-mock-return-shorthand",
	"vitest/prefer-to-have-length",
	"vitest/prefer-to-be-object",
	"vitest/prefer-todo",
	"vue/no-import-compiler-macros",
	"vue/valid-next-tick",
	"vue/no-deprecated-destroyed-lifecycle",
	"vue/component-definition-name-casing",
	"vue/next-tick-style",
	"vue/prefer-import-from-vue",
	"node/no-exports-assign",
	"promise/no-new-statics"
];
const OXLINT_FIXABLE_RULES = new Set(OXLINT_FIXABLE_RULES_LIST);
/**
* Checks whether an Oxlint rule or diagnostic code has automated fix capability.
*/
function isOxlintRuleFixable(ruleName) {
	if (!ruleName) return false;
	const normalized = ruleName.replace(/\(([^)]+)\)/, "/$1").replace(/^eslint\//, "");
	if (OXLINT_FIXABLE_RULES.has(normalized)) return true;
	const bareName = normalized.includes("/") ? normalized.split("/")[1] : normalized;
	if (bareName && OXLINT_FIXABLE_RULES.has(bareName)) return true;
	return false;
}
/**
* Parses raw JSON output from Vite+ (Oxlint) into canonical AuditFindings.
* Elevates all diagnostics to severity: 'error' (Zero-Warning Policy).
*/
function parseOxlintResults(input, cwd = process.cwd()) {
	if (typeof input === "string") {
		const oxlintObj = parseJsonObjectOutput(input);
		if (oxlintObj && Array.isArray(oxlintObj.diagnostics)) {
			const findings = [];
			for (const diag of oxlintObj.diagnostics) {
				const cleanFile = normalizePosixPath(diag.filename || "", cwd);
				const line = diag.labels?.[0]?.span?.line ?? 1;
				const col = diag.labels?.[0]?.span?.column ?? 1;
				const rule = diag.code || "oxlint-violation";
				findings.push({
					suiteId: "validate_oxlint",
					suiteName: "Oxlint & Vite+ Code Hygiene Validator",
					ruleId: "oxlint-violation",
					ruleDescription: "Error de sintaxis o regla de linter",
					severity: "error",
					file: cleanFile,
					line,
					col,
					context: rule,
					message: `[${rule}] ${diag.message}`,
					fixable: isOxlintRuleFixable(rule)
				});
			}
			return findings;
		}
	}
	return parseLintResultsToFindings(input, {
		cwd,
		suiteId: "validate_oxlint",
		suiteName: "Oxlint & Vite+ Code Hygiene Validator",
		ruleId: "oxlint-violation",
		ruleDescription: "Error de sintaxis o regla de linter",
		defaultRuleName: "oxlint",
		defaultMessage: "Linter violation"
	});
}
var OxlintAuditor = class OxlintAuditor extends BaseAuditor {
	static gitIgnoreEntries = [{
		id: ".oxlintcache",
		pattern: ".oxlintcache",
		samplePath: ".oxlintcache",
		reason: "Archivo de caché incremental generado por Oxlint",
		isApplicable: (config) => config._rawConfig?.oxlint?.enabled !== false
	}];
	constructor(projectRoot) {
		const effectiveRoot = projectRoot || process.cwd();
		super({
			usesThirdPartyTool: true,
			thirdPartyToolPolicy: {
				toolName: "Vite+ Oxlint",
				fallbackBehavior: "violation",
				fallbackRuleId: "oxlint-violation"
			},
			ruleCapabilities: createRuleCapabilities(OXLINT_RULES, {
				speed: ["light", "full"],
				phase: "normal",
				fix: "normal",
				md: false,
				ast: false,
				changedOnly: false,
				critical: true
			}, ["oxlint-violation"]),
			fixableRuleIds: ["oxlint-violation"],
			gitIgnoreEntries: OxlintAuditor.gitIgnoreEntries,
			id: "validate_oxlint",
			name: "Oxlint & Vite+ Code Hygiene Validator",
			description: "Reglas de estilo y sintaxis con Oxlint",
			family: "architecture",
			packageName: "Oxlint",
			configKey: "oxlint.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "📜",
			ruleIds: OXLINT_RULES,
			ruleDescriptions: { "oxlint-violation": "Error de sintaxis o regla" },
			ruleRemediations: { "oxlint-violation": "Guía de diagnóstico y remediación para oxlint-violation. Revisa la incidencia reportada por Vite+ (Oxlint) y ajusta el código correspondiente." },
			coverage: {
				include: ["**/*.{js,ts,mjs,cjs,vue}"],
				exclude: getVitePlusDefaultExcludeGlobs(effectiveRoot),
				source: "declared-only"
			},
			projectRoot: effectiveRoot
		});
	}
	async runAudit() {
		const excludeGlobs = getVitePlusDefaultExcludeGlobs(this.projectRoot);
		this.redeclareCoverage({
			include: ["**/*.{js,ts,mjs,cjs,vue}"],
			exclude: excludeGlobs,
			source: "declared-only"
		});
		const isFixMode = this.isFixModeRequested();
		const tier = this.getExecutionTier();
		const vpBin = resolvePackageBin("vite-plus", {
			projectRoot: this.projectRoot,
			fallbackRelativeBin: "bin/vp"
		}) ?? path.resolve(this.projectRoot, "node_modules/vite-plus/bin/vp");
		const args = [
			"lint",
			"-f",
			"json"
		];
		if (tier === "full") args.push("--type-aware", "--type-check", "--report-unused-disable-directives");
		if (isFixMode) args.push("--fix");
		const findings = parseOxlintResults(executeNodeCli(vpBin, args, {
			cwd: this.projectRoot,
			maxBuffer: MAX_BUFFER_BYTES,
			timeout: EXECUTION_TIMEOUT_MS
		}), this.projectRoot);
		this.markRuleEvaluated("oxlint-violation");
		this.recordExternalScanCount(1);
		for (const finding of findings) this.addViolation({
			ruleId: finding.ruleId ?? "oxlint-violation",
			severity: finding.severity,
			file: finding.file,
			line: finding.line,
			col: finding.col,
			context: finding.context,
			message: finding.message,
			fixable: isFixMode ? false : Boolean(finding.fixable)
		});
		this.context.setMetric("oxlint_violations", findings.length);
		this.context.setMetric("mode", isFixMode ? "fix" : "check");
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new OxlintAuditor());
//#endregion
export { OXLINT_FIXABLE_RULES, OXLINT_FIXABLE_RULES_LIST, OXLINT_RULES, OxlintAuditor, isOxlintRuleFixable, parseOxlintResults };
