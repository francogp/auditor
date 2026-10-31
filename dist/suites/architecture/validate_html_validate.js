import { DEFAULT_AUDIT_CONFIG } from "../../core/auditConfigDefaults.js";
import { tryCatchSync } from "../../core/safeUtils.js";
import { extractJsonReportFilePaths, normalizePosixPath, parseLintResultsToFindings } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/safePath.js";
import "../../core/auditConfig.js";
import { executeNodeCli, resolveNodeModuleBin } from "../../cli/cliUtils.js";
import { BaseAuditor, collectRepositoryFiles, createRuleCapabilities, createUniformRemediationPhases, isPathIgnored } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
// src/suites/architecture/validate_html_validate.ts
/**
* packages/auditor/src/suites/architecture/validate_html_validate.ts
*
* HTML5 STANDARDS & MARKUP HYGIENE AUDITOR (Node.js 26+ Native)
*
* Runs `html-validate` with `html-validate-vue` across project templates (.vue, .html),
* detects deprecated attributes, obsolete elements, and spec violations (Zero-Warning Policy),
* and persists structured reports to scratch/audits/architecture/validate_html_validate.json.
* Supports auto-fix when `fix` is passed.
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* --allow-child-process packages/auditor/src/suites/architecture/validate_html_validate.ts
*   npm run validate:html
*/
enableCompileCache();
const HTML_VALIDATE_RULES = ["html-validate-issue"];
const MAX_BUFFER_BYTES = 52428800;
const EXECUTION_TIMEOUT_MS = 0;
/**
* Parses raw JSON output or an array of file reports from html-validate into canonical AuditFindings.
* Elevates both warnings and errors to severity: 'error' (Zero-Warning Policy).
*/
function parseHtmlValidateResults(input, cwd = process.cwd()) {
	return parseLintResultsToFindings(input, {
		cwd,
		suiteId: "validate_html_validate",
		suiteName: "HTML5 Standards & Markup Hygiene Validator",
		ruleId: "html-validate-issue",
		ruleDescription: "HTML5 standard violation",
		defaultRuleName: "html-validate",
		defaultMessage: "HTML validation issue"
	});
}
function resolveHtmlValidateConfig(projectRoot) {
	const hostConfig = path.resolve(projectRoot, ".htmlvalidate.json");
	if (fs.existsSync(hostConfig)) return hostConfig;
	const packageConfig = path.resolve(import.meta.dirname, "../../../.htmlvalidate.json");
	if (fs.existsSync(packageConfig)) return packageConfig;
	return ".htmlvalidate.json";
}
function collectRootHtmlTargets(projectRoot, root, targets, filesToScan, extraIgnorePatterns = []) {
	const fullRoot = path.resolve(projectRoot, root);
	const found = collectRepositoryFiles(fullRoot, projectRoot, extraIgnorePatterns, /* @__PURE__ */ new Set([".html", ".vue"]));
	if (found.length > 0) {
		targets.push(root);
		filesToScan.push(...found);
	}
}
function collectTopLevelHtmlTargets(projectRoot, targets, filesToScan, extraIgnorePatterns = []) {
	tryCatchSync(() => {
		const rootEntries = fs.readdirSync(projectRoot, { withFileTypes: true });
		for (const entry of rootEntries) if (entry.isFile() && entry.name.endsWith(".html")) {
			if (!isPathIgnored(entry.name, extraIgnorePatterns, [], projectRoot)) {
				targets.push(entry.name);
				filesToScan.push(path.join(projectRoot, entry.name));
			}
		}
	});
}
function collectHtmlTargets(projectRoot, roots, extraIgnorePatterns = []) {
	const targets = [];
	const filesToScan = [];
	for (const root of roots) collectRootHtmlTargets(projectRoot, root, targets, filesToScan, extraIgnorePatterns);
	collectTopLevelHtmlTargets(projectRoot, targets, filesToScan, extraIgnorePatterns);
	return {
		targets,
		filesToScan
	};
}
function readAndParseHtmlValidateOutput(reportFile, combinedOutput, projectRoot) {
	let findings;
	let rawJson = combinedOutput;
	if (fs.existsSync(reportFile)) try {
		rawJson = fs.readFileSync(reportFile, "utf-8");
		findings = parseHtmlValidateResults(rawJson, projectRoot);
	} catch {
		findings = parseHtmlValidateResults(combinedOutput, projectRoot);
	}
	else findings = parseHtmlValidateResults(combinedOutput, projectRoot);
	return {
		findings,
		rawJson
	};
}
var HtmlValidateAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const projectRoot = options.projectRoot ?? process.cwd();
		const config = getAuditConfig(projectRoot);
		const targetRoots = Array.from(/* @__PURE__ */ new Set([
			...config.paths.srcRoots ?? DEFAULT_AUDIT_CONFIG.paths.srcRoots,
			...config.paths.codeRoots ?? [],
			...config.paths.demoRoots ?? []
		]));
		super({
			ruleFixers: {},
			fixableRuleIds: ["html-validate-issue"],
			usesThirdPartyTool: true,
			requiredPermissions: ["--allow-child-process"],
			thirdPartyToolPolicy: {
				toolName: "html-validate",
				fallbackBehavior: "violation",
				fallbackRuleId: "html-validate-issue"
			},
			ruleCapabilities: createRuleCapabilities(HTML_VALIDATE_RULES, {
				speed: "light",
				phase: "normal",
				md: false,
				ast: false,
				changedOnly: false,
				critical: true
			}),
			id: "validate_html_validate",
			name: "HTML5 Standards & Markup Hygiene Validator",
			description: "Validates standards and obsolete elements with html-validate",
			family: "architecture",
			packageName: "HTML",
			configKey: "htmlValidate.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "🌐",
			ruleIds: HTML_VALIDATE_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(HTML_VALIDATE_RULES, "behavior"),
			ruleDescriptions: { "html-validate-issue": "HTML5 standard violation" },
			ruleRemediations: { "html-validate-issue": "1. Root Cause:\nViolation of WHATWG HTML Living Standard rules or accessibility and semantic markup best practices in .html files or Vue component templates (.vue).\nhtml-validate detects obsolete elements (<center>, <font>, <marquee>), disallowed nesting (e.g. <p> inside <p>, <div> inside <span>, or interactive <a> inside <a>), invalid attributes, or duplicate IDs in the same DOM tree.\n\n2. Diagnosis:\n1. Run \"npm run auditor:findings rule=html-validate-issue\" to inspect the exact file, line, and HTML5 rule that failed.\n2. Identify whether the violation is a deprecated tag, illegal nesting, or an unsupported attribute.\n\n3. Canonical Solution:\n1. Replace obsolete elements with semantic HTML5 elements (<header>, <nav>, <main>, <section>, <article>, <div>) and style via CSS classes or design system utilities.\n2. Fix illegal nesting. In HTML5, <p> can only contain phrasing (inline) elements; a block <div> or list <ul> inside a <p> forces implicit closure of the paragraph and corrupts the DOM tree.\n3. Avoid nesting interactive elements within other interactive elements (e.g. <button> inside an <a>).\n4. Run \"npm run auditor:fix\" to automatically fix supported formatting issues or trivial attributes.\n\n4. Example / Auto-fix command:\n// ❌ Incorrect: obsolete tag and illegal nesting in HTML5\n<center>\n  <p>Text with inner block: <div>Disallowed content</div></p>\n</center>\n\n// ✅ Correct: standard semantic elements with styling classes\n<div class=\"text-center\">\n  <p>Text with inline element: <span class=\"highlight\">Valid content</span></p>\n</div>" },
			coverage: {
				include: [
					...targetRoots.map((r) => `${r}/**/*.{html,vue}`),
					"*.html",
					".htmlvalidate.json"
				],
				source: "runtime"
			},
			projectRoot: options.projectRoot
		});
	}
	async runAudit() {
		if (this.isSuiteGatingDisabled("HTML-Validate disabled in configuration")) return;
		const isFixMode = this.isFixActive();
		const config = getAuditConfig(this.projectRoot);
		const binPath = resolveNodeModuleBin(this.projectRoot, "html-validate/bin/html-validate.mjs");
		const configFile = resolveHtmlValidateConfig(this.projectRoot);
		const reportFile = path.resolve(this.projectRoot, "scratch/audits/architecture/html-validate-raw.json");
		fs.mkdirSync(path.dirname(reportFile), { recursive: true });
		const scannableRoots = Array.from(/* @__PURE__ */ new Set([
			...config.paths.srcRoots ?? DEFAULT_AUDIT_CONFIG.paths.srcRoots,
			...config.paths.codeRoots ?? [],
			...config.paths.demoRoots ?? []
		])).filter((r) => fs.existsSync(path.resolve(this.projectRoot, r)));
		const localConfigPath = path.resolve(this.projectRoot, ".htmlvalidate.json");
		const hasLocalConfig = fs.existsSync(localConfigPath);
		const coverageIncludeGlobs = scannableRoots.map((r) => `${r}/**/*.{html,vue}`);
		coverageIncludeGlobs.push("*.html");
		if (hasLocalConfig) {
			coverageIncludeGlobs.push(".htmlvalidate.json");
			this.recordScanned(localConfigPath);
		}
		this.redeclareCoverage({
			include: coverageIncludeGlobs,
			source: "runtime"
		});
		const { targets, filesToScan } = collectHtmlTargets(this.projectRoot, scannableRoots, this.extraIgnorePatterns);
		if (filesToScan.length === 0 && targets.length === 0) {
			this.markRuleNotApplicable("html-validate-issue", "No HTML files or templates to validate");
			return;
		}
		for (const f of filesToScan) this.recordScanned(f);
		const relFiles = filesToScan.map((f) => normalizePosixPath(path.relative(this.projectRoot, f)));
		const effectiveTargets = relFiles.reduce((acc, f) => acc + f.length + 1, 0) < 6e3 && relFiles.length > 0 ? relFiles : targets;
		const args = [
			"-c",
			configFile,
			"--ext",
			"html,vue",
			"-f",
			`json=${reportFile}`,
			...effectiveTargets
		];
		if (isFixMode) args.push("--fix");
		const { findings, rawJson } = readAndParseHtmlValidateOutput(reportFile, executeNodeCli(binPath, args, {
			cwd: this.projectRoot,
			maxBuffer: MAX_BUFFER_BYTES,
			timeout: EXECUTION_TIMEOUT_MS
		}), this.projectRoot);
		const scannedReportFiles = extractJsonReportFilePaths(rawJson, findings);
		this.recordScannedMany(scannedReportFiles);
		const normalizedFindings = isFixMode ? findings.map((f) => ({
			...f,
			fixable: false
		})) : findings;
		this.markRuleEvaluated("html-validate-issue");
		this.importAuditFindings(normalizedFindings, "html-validate-issue", "html-validate");
		this.context.setMetric("html_violations", normalizedFindings.length);
		this.context.setMetric("mode", isFixMode ? "fix" : "check");
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new HtmlValidateAuditor());
export { HTML_VALIDATE_RULES, HtmlValidateAuditor, collectHtmlTargets, parseHtmlValidateResults, readAndParseHtmlValidateOutput };
