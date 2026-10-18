import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { normalizePosixPath, parseJsonArrayOutput } from "../../core/reportUtils.js";
import "../../core/auditConfig.js";
import { isDeclaredByCoverage, toPosixRelative } from "../../core/auditCoverage.js";
import { executeNodeCli, resolveNodeModuleBin } from "../../cli/cliUtils.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases, getEffectiveUnignoreDirs, loadLockedSkills } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/documentation/validate_markdown_lint.ts
/**
* scripts/auditors/documentation/validate_markdown_lint.ts
*
* MARKDOWN LINT AUDITOR & HYGIENE VALIDATOR (Node.js 26+ Native)
*
* Runs `markdownlint` across all project documentation and skills,
* parses structured JSON findings, maps them to StandardAuditResult with severity 'error',
* and persists reports to scratch/audits/documentation/validate_markdown_lint.json.
* Supports auto-fix when `fix` is passed.
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* --allow-child-process scripts/auditors/documentation/validate_markdown_lint.ts
*   npm run lint:md
*/
enableCompileCache();
const MARKDOWN_LINT_RULES = ["markdownlint-issue"];
const MAX_BUFFER_BYTES = 52428800;
const EXECUTION_TIMEOUT_MS = 0;
const DEFAULT_ERROR_LINE = 1;
const DEFAULT_MARKDOWN_IGNORE_GLOBS = [
	"node_modules/**",
	".git/**",
	"dist/**",
	"dev-dist/**",
	"scratch/**",
	"test-results/**"
];
function getMarkdownIgnoreGlobs(projectRoot) {
	const config = getAuditConfig(projectRoot);
	const globs = [...DEFAULT_MARKDOWN_IGNORE_GLOBS];
	if (config.paths?.ignoreGlobs) globs.push(...config.paths.ignoreGlobs);
	if (config.paths?.e2eRoots) for (const r of config.paths.e2eRoots) globs.push(`${r}/results/**`);
	if (config.paths?.ignoredDirs) for (const d of config.paths.ignoredDirs) globs.push(`${d}/**`);
	if (config.persistence?.supabaseDir) globs.push(`${config.persistence.supabaseDir}/**`);
	const lockedSkills = loadLockedSkills(projectRoot);
	for (const s of lockedSkills) {
		globs.push(`.agents/skills/${s}/**`);
		globs.push(`skills/${s}/**`);
		globs.push(`.skills/${s}/**`);
	}
	return Array.from(new Set(globs));
}
const MARKDOWNLINT_FIXABLE_RULE_LIST = [
	"MD004",
	"MD005",
	"MD007",
	"MD009",
	"MD010",
	"MD011",
	"MD012",
	"MD014",
	"MD018",
	"MD019",
	"MD020",
	"MD021",
	"MD022",
	"MD023",
	"MD026",
	"MD027",
	"MD030",
	"MD031",
	"MD032",
	"MD034",
	"MD037",
	"MD038",
	"MD039",
	"MD044",
	"MD047",
	"MD049",
	"MD050",
	"MD053"
];
const MARKDOWNLINT_FIXABLE_RULES = new Set(MARKDOWNLINT_FIXABLE_RULE_LIST);
function isMarkdownLintRuleFixable(ruleNames) {
	if (!ruleNames || ruleNames.length === 0) return false;
	return ruleNames.some((name) => MARKDOWNLINT_FIXABLE_RULES.has(name));
}
/**
* Parses raw JSON output or an array of issues from markdownlint into canonical AuditFindings.
*/
function parseMarkdownLintIssues(input, cwd = process.cwd()) {
	const findings = [];
	if (!input) return findings;
	const rawList = parseJsonArrayOutput(input, {
		throwOnError: true,
		toolName: "markdownlint"
	});
	for (const issue of rawList) {
		const cleanFile = normalizePosixPath(issue.fileName || "", cwd);
		const ruleCode = Array.isArray(issue.ruleNames) ? issue.ruleNames.join("/") : "MD";
		const detail = issue.errorDetail ? ` (${issue.errorDetail})` : "";
		const desc = issue.ruleDescription || "Markdown formatting issue";
		const isFixable = issue.fixInfo !== void 0 ? Boolean(issue.fixInfo) : isMarkdownLintRuleFixable(issue.ruleNames);
		findings.push({
			suiteId: "validate_markdown_lint",
			suiteName: "Markdownlint Style & Hygiene Validator",
			ruleId: "markdownlint-issue",
			ruleDescription: "Formato o estilo inválido",
			severity: "error",
			file: cleanFile,
			line: issue.lineNumber || DEFAULT_ERROR_LINE,
			context: ruleCode,
			message: `${ruleCode}: ${desc}${detail}`,
			fixable: isFixable
		});
	}
	return findings;
}
var MarkdownLintAuditor = class extends BaseAuditor {
	constructor(projectRoot) {
		super({
			usesThirdPartyTool: true,
			thirdPartyToolPolicy: {
				toolName: "markdownlint",
				fallbackBehavior: "violation",
				fallbackRuleId: "markdownlint-issue"
			},
			ruleCapabilities: createRuleCapabilities(MARKDOWN_LINT_RULES, {
				speed: "light",
				phase: "normal",
				fix: "normal",
				md: true,
				ast: false,
				changedOnly: false,
				critical: false
			}, ["markdownlint-issue"]),
			fixableRuleIds: ["markdownlint-issue"],
			id: "validate_markdown_lint",
			name: "Markdownlint Style & Hygiene Validator",
			description: "Estilo, espaciado y formato en documentación markdown",
			family: "documentation",
			packageName: "Markdownlint",
			configKey: "documentation.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "📘",
			ruleIds: MARKDOWN_LINT_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(MARKDOWN_LINT_RULES, "polish"),
			ruleDescriptions: { "markdownlint-issue": "Formato o estilo inválido" },
			ruleRemediations: { "markdownlint-issue": "Guía de diagnóstico y remediación para markdownlint-issue. Revisa la incidencia detectada y ajusta el código correspondiente." },
			unignoreDirs: getEffectiveUnignoreDirs(projectRoot),
			coverage: {
				include: ["**/*.md", ".markdownlint.json"],
				exclude: getMarkdownIgnoreGlobs(projectRoot),
				source: "runtime"
			},
			projectRoot
		});
	}
	async runAudit() {
		const ignoreGlobs = getMarkdownIgnoreGlobs(this.projectRoot);
		const configPath = path.resolve(this.projectRoot, ".markdownlint.json");
		const hasConfigFile = fs.existsSync(configPath);
		const coverageIncludeGlobs = ["**/*.md"];
		if (hasConfigFile) coverageIncludeGlobs.push(".markdownlint.json");
		this.redeclareCoverage({
			include: coverageIncludeGlobs,
			exclude: ignoreGlobs,
			source: "runtime"
		});
		if (hasConfigFile) this.recordScanned(configPath);
		const mdFiles = this.context.collectFiles(["."], /* @__PURE__ */ new Set([".md"])).filter((f) => isDeclaredByCoverage(toPosixRelative(this.projectRoot, f), this.coverageRecorder.declaration));
		if (mdFiles.length === 0) {
			this.markRuleNotApplicable("markdownlint-issue", "No se encontraron archivos markdown");
			return;
		}
		for (const f of mdFiles) {
			this.recordScanned(f);
			this.markRuleEvaluated("markdownlint-issue");
		}
		const isFixMode = this.isFixModeRequested();
		if (isFixMode && hasConfigFile) this.repairMarkdownLintConfig(configPath);
		const binPath = resolveNodeModuleBin(this.projectRoot, "markdownlint-cli/markdownlint.js");
		const relMdFiles = mdFiles.map((f) => toPosixRelative(this.projectRoot, f));
		const args = [...relMdFiles.reduce((acc, f) => acc + f.length + 1, 0) < 6e3 && relMdFiles.length > 0 ? relMdFiles : ["**/*.md", "--dot"]];
		for (const pattern of getMarkdownIgnoreGlobs(this.projectRoot)) args.push("--ignore", pattern);
		args.push("--json");
		if (isFixMode) args.push("--fix");
		const rawFindings = parseMarkdownLintIssues(executeNodeCli(binPath, args, {
			cwd: this.projectRoot,
			maxBuffer: MAX_BUFFER_BYTES,
			timeout: EXECUTION_TIMEOUT_MS
		}), this.projectRoot);
		const findings = isFixMode ? rawFindings.map((f) => ({
			...f,
			fixable: false
		})) : rawFindings;
		this.importAuditFindings(findings, "markdownlint-issue", "markdownlint");
		this.context.setMetric("markdown_violations", findings.length);
		this.context.setMetric("mode", isFixMode ? "fix" : "check");
	}
	/**
	* Automatically repairs .markdownlint.json in --fix mode to ensure "br" is allowed
	* in MD033 (inline HTML elements), standardizing GFM linebreaks in table cells.
	*/
	repairMarkdownLintConfig(configPath) {
		try {
			if (!fs.existsSync(configPath)) return;
			const raw = fs.readFileSync(configPath, "utf8");
			const parsed = JSON.parse(raw);
			if (typeof parsed !== "object" || parsed === null) return;
			if (parsed.MD033 === false) return;
			if (typeof parsed.MD033 === "object" && parsed.MD033 !== null) {
				const allowed = Array.isArray(parsed.MD033.allowed_elements) ? parsed.MD033.allowed_elements : [];
				if (!allowed.includes("br")) {
					parsed.MD033.allowed_elements = [...allowed, "br"];
					fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
				}
			} else {
				parsed.MD033 = { allowed_elements: ["br"] };
				fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
			}
		} catch (err) {
			if (process.env.DEBUG) console.debug("Failed to auto-repair .markdownlint.json:", err);
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new MarkdownLintAuditor());
//#endregion
export { DEFAULT_MARKDOWN_IGNORE_GLOBS, MARKDOWNLINT_FIXABLE_RULES, MARKDOWNLINT_FIXABLE_RULE_LIST, MARKDOWN_LINT_RULES, MarkdownLintAuditor, getMarkdownIgnoreGlobs, parseMarkdownLintIssues };
