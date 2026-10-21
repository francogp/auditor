#!/usr/bin/env -S node --experimental-strip-types
import "../core/auditConfigTypes.js";
import { getAuditConfig } from "../core/auditConfigLoader.js";
import "../core/auditConfig.js";
import { REMEDIATION_PHASES, REMEDIATION_PHASE_IDS, isRemediationPhaseId } from "../core/remediationPhases.js";
import { ONE_MINUTE_MS, groupFindingsByFileMap, sortFindingsByFileAndLine } from "../core/auditContract.js";
import { COMMON_CLI_ARGS, CONSOLE_FORMAT_VALUES, defineCommand, getProcessCliArgs, getProcessExecutedScript, parseCittyArgs, resolveHumanModeFromArgs, runMain } from "../core/cli/cittyHarness.js";
import { toPosixRelative } from "../core/auditCoverage.js";
import "../core/safePath.js";
import { renderFindingsByFileTree } from "../core/fileTreeRenderer.js";
import { buildNoticeBox, renderBanner, renderFindingsBreakdownTable, renderSampleFindings } from "../core/unifiedTheme.js";
import { bootstrapCliProject, isHumanConsoleMode, isMainModule } from "./cliUtils.js";
import path from "node:path";
import fs from "node:fs";
import { styleText } from "node:util";
//#region src/cli/report_findings.ts
/**
* src/cli/report_findings.ts
*/
const DEFAULT_TOP_LIMIT = 20;
const DEFAULT_SAMPLE_ERROR_LIMIT = 5;
const ERROR_WEIGHT_FACTOR = 1e3;
const SEVERITY_FILTERS = [
	"all",
	"error",
	"warning"
];
const REPORT_SCOPES = [
	"all",
	"host",
	"packages"
];
const REPORT_FINDINGS_ARGS = {
	...COMMON_CLI_ARGS,
	phase: {
		type: "string",
		description: "Filter findings by strategic phase (setup, prune, dedup, contracts, behavior, hygiene, polish, next)"
	},
	fase: {
		type: "string",
		description: "Alias for phase"
	},
	category: {
		type: "string",
		alias: "c",
		description: "Filter findings by category",
		default: "all"
	},
	severity: {
		type: "string",
		description: "Filter findings by severity (error, warning, all)",
		default: "all"
	},
	search: {
		type: "string",
		description: "Search string inside finding message or context"
	},
	file: {
		type: "string",
		alias: "f",
		description: "Filter findings matching file path substring or pattern"
	},
	dir: {
		type: "string",
		description: "Filter findings matching directory path"
	},
	folder: {
		type: "string",
		description: "Alias for dir"
	},
	rule: {
		type: "string",
		alias: "r",
		description: "Filter findings matching rule identifier"
	},
	ruleid: {
		type: "string",
		description: "Alias for rule"
	},
	suite: {
		type: "string",
		description: "Filter findings by suite identifier"
	},
	task: {
		type: "string",
		description: "Alias for suite"
	},
	scope: {
		type: "string",
		description: "Target report scope (all, host, packages)",
		default: "all"
	},
	top: {
		type: "string",
		description: "Limit number of displayed findings (number or all)",
		default: "20"
	},
	flat: {
		type: "boolean",
		description: "Emit un-truncated single-line finding dumps",
		default: false
	},
	raw: {
		type: "boolean",
		description: "Alias for flat",
		default: false
	},
	"by-file": {
		type: "boolean",
		description: "Display hierarchical finding tree grouped by file",
		default: false
	},
	byfile: {
		type: "boolean",
		description: "Alias for by-file",
		default: false
	},
	"by-rule": {
		type: "boolean",
		description: "Display finding table grouped by rule",
		default: false
	},
	byrule: {
		type: "boolean",
		description: "Alias for by-rule",
		default: false
	},
	rules: {
		type: "boolean",
		description: "Alias for by-rule",
		default: false
	},
	next: {
		type: "boolean",
		description: "Focus sequentially on findings in the earliest active strategic phase",
		default: false
	},
	errors: {
		type: "boolean",
		description: "Shortcut for severity=error",
		default: false
	},
	error: {
		type: "boolean",
		description: "Alias for errors",
		default: false
	},
	warnings: {
		type: "boolean",
		description: "Shortcut for severity=warning",
		default: false
	},
	warning: {
		type: "boolean",
		description: "Alias for warnings",
		default: false
	},
	breakdown: {
		type: "boolean",
		description: "Show directory breakdown",
		default: false
	},
	summary: {
		type: "boolean",
		description: "Emit summary statistics only",
		default: false
	},
	"summary-only": {
		type: "boolean",
		description: "Alias for summary",
		default: false
	},
	files: {
		type: "boolean",
		description: "Emit list of affected files only",
		default: false
	},
	"files-only": {
		type: "boolean",
		description: "Alias for files",
		default: false
	},
	"allow-stale": {
		type: "boolean",
		description: "Allow reading stale audit reports",
		default: false
	},
	stale: {
		type: "boolean",
		description: "Alias for allow-stale",
		default: false
	},
	"allow-partial": {
		type: "boolean",
		description: "Allow inspecting partial audit runs",
		default: false
	},
	partial: {
		type: "boolean",
		description: "Alias for allow-partial",
		default: false
	},
	fix: {
		type: "boolean",
		description: "Inspect latest fix audit report",
		default: false
	}
};
function isInvokedAsByFile() {
	const scriptArg = getProcessExecutedScript() ?? "";
	return path.basename(scriptArg).toLowerCase().includes("auditor-by-file");
}
function isInvokedAsByRule() {
	const scriptArg = getProcessExecutedScript() ?? "";
	const scriptName = path.basename(scriptArg).toLowerCase();
	return scriptName.includes("auditor-rules") || scriptName.includes("auditor-by-rule");
}
function isInvokedAsNext() {
	const scriptArg = getProcessExecutedScript() ?? "";
	return path.basename(scriptArg).toLowerCase().includes("auditor-next");
}
const SEVERITY_FILTER_SET = new Set(SEVERITY_FILTERS);
const REPORT_SCOPE_SET = new Set(REPORT_SCOPES);
function parseSeverityFilter(raw) {
	if (typeof raw !== "string") return null;
	const lower = raw.toLowerCase();
	return SEVERITY_FILTER_SET.has(lower) ? lower : null;
}
function parsePhaseFilter(raw) {
	if (typeof raw !== "string") return null;
	const lower = raw.toLowerCase();
	if (lower === "all" || lower === "next") return lower;
	return isRemediationPhaseId(lower) ? lower : null;
}
function parseScopeFilter(raw) {
	if (typeof raw !== "string") return null;
	const lower = raw.toLowerCase();
	return REPORT_SCOPE_SET.has(lower) ? lower : null;
}
function parseTopOption(raw) {
	if (raw === void 0 || raw === null || raw === "") return DEFAULT_TOP_LIMIT;
	const str = String(raw).trim().toLowerCase();
	if (str === "all" || str === "0") return "all";
	const num = Number(str);
	return Number.isFinite(num) && num > 0 ? num : DEFAULT_TOP_LIMIT;
}
function applyNamedFilterArgs(parsed, opts) {
	const phase = parsePhaseFilter(parsed.phase);
	if (phase && phase !== "all") opts.phase = phase;
	else if (parsed.next) opts.phase = "next";
	const severity = parseSeverityFilter(parsed.severity);
	if (severity && severity !== "all") opts.severity = severity;
	else if (parsed.errors || parsed.error) opts.severity = "error";
	else if (parsed.warnings || parsed.warning) opts.severity = "warning";
	if (typeof parsed.category === "string" && parsed.category !== "all") opts.category = parsed.category.toLowerCase();
	if (typeof parsed.search === "string") opts.search = parsed.search;
	if (typeof parsed.file === "string") opts.filePattern = parsed.file;
	if (typeof parsed.dir === "string") opts.dirPattern = parsed.dir;
	if (typeof parsed.rule === "string") opts.rulePattern = parsed.rule;
	if (typeof parsed.suite === "string") opts.suitePattern = parsed.suite;
	const scope = parseScopeFilter(parsed.scope);
	if (scope && scope !== "all") opts.scope = scope;
}
const POSITIONAL_FLAG_MAP = {
	"by-file": (opts) => {
		opts.byFile = true;
	},
	byfile: (opts) => {
		opts.byFile = true;
	},
	"by-rule": (opts) => {
		opts.byRule = true;
	},
	byrule: (opts) => {
		opts.byRule = true;
	},
	rules: (opts) => {
		opts.byRule = true;
	},
	flat: (opts) => {
		opts.flat = true;
	},
	raw: (opts) => {
		opts.flat = true;
	},
	summary: (opts) => {
		opts.summaryOnly = true;
	},
	files: (opts) => {
		opts.filesOnly = true;
	},
	fix: (opts) => {
		opts.inspectFix = true;
	},
	breakdown: (opts) => {
		opts.breakdown = true;
	}
};
const EXCLUDED_BARE_TOKENS = /* @__PURE__ */ new Set([...CONSOLE_FORMAT_VALUES, "help"]);
function applyPositionalTokens(tokens, opts) {
	for (const token of tokens) {
		const lower = token.toLowerCase();
		const flagHandler = POSITIONAL_FLAG_MAP[lower];
		if (flagHandler) {
			flagHandler(opts);
			continue;
		}
		const phase = parsePhaseFilter(lower);
		if (phase) {
			opts.phase = phase;
			continue;
		}
		const severity = parseSeverityFilter(lower);
		if (severity && severity !== "all") {
			opts.severity = severity;
			continue;
		}
		if (!EXCLUDED_BARE_TOKENS.has(lower)) {
			if (opts.category === "all") opts.category = lower;
		}
	}
}
function parseReportOptions(inputArgs) {
	const isParsedObject = inputArgs !== void 0 && inputArgs !== null && !Array.isArray(inputArgs) && typeof inputArgs === "object";
	const rawInputArgs = Array.isArray(inputArgs) ? inputArgs : getProcessCliArgs();
	const parsed = isParsedObject ? inputArgs : parseCittyArgs(REPORT_FINDINGS_ARGS, rawInputArgs);
	const isHuman = resolveHumanModeFromArgs(parsed) || isHumanConsoleMode(void 0, rawInputArgs);
	const opts = {
		category: "all",
		phase: isInvokedAsNext() ? "next" : "all",
		severity: "all",
		search: "",
		filePattern: "",
		dirPattern: "",
		rulePattern: "",
		suitePattern: "",
		scope: "all",
		breakdown: Boolean(parsed.breakdown),
		byFile: Boolean(parsed["by-file"] || parsed.byfile || isInvokedAsByFile()),
		byRule: Boolean(parsed["by-rule"] || parsed.byrule || parsed.rules || isInvokedAsByRule()),
		flat: Boolean(parsed.flat),
		top: parseTopOption(parsed.top),
		jsonOutput: Boolean(parsed.json) || parsed.format === "json",
		summaryOnly: Boolean(parsed.summary || parsed["summary-only"]),
		filesOnly: Boolean(parsed.files || parsed["files-only"]),
		allowStale: Boolean(parsed["allow-stale"] || parsed.stale),
		allowPartial: Boolean(parsed["allow-partial"] || parsed.partial),
		inspectFix: Boolean(parsed.fix),
		human: isHuman
	};
	applyNamedFilterArgs(parsed, opts);
	applyPositionalTokens(parsed._.map(String), opts);
	return opts;
}
function loadAuditReport(inspectFix = false) {
	const targetFileName = inspectFix ? "latest_fix_audit.json" : "latest_audit.json";
	const reportPath = path.resolve(process.cwd(), "scratch/audits", targetFileName);
	if (!fs.existsSync(reportPath)) {
		if (inspectFix) console.error("[Error] Could not find scratch/audits/latest_fix_audit.json. Run \"npm run auditor:fix\" first.");
		else console.error("[Error] Could not find scratch/audits/latest_audit.json. Run \"npm run auditor\" first.");
		return null;
	}
	try {
		const raw = fs.readFileSync(reportPath, "utf8");
		const parsed = JSON.parse(raw);
		if (!parsed.meta) {
			console.error(`[Error] scratch/audits/${targetFileName} does not contain metadata header "meta". Run "npm run auditor" to regenerate.`);
			return null;
		}
		return parsed;
	} catch (e) {
		console.error(`[Error] Failed to parse scratch/audits/${targetFileName}: ${e.message}`);
		return null;
	}
}
function getNormalizedRelPath(filePath) {
	if (!filePath) return "General";
	return toPosixRelative(process.cwd(), filePath);
}
function getDirectoryBucket(filePath) {
	const rel = getNormalizedRelPath(filePath);
	if (rel === "General") return "General";
	const first = rel.indexOf("/");
	return first !== -1 ? `${rel.slice(0, first)}/` : rel;
}
function sortFindingsEntries(entries) {
	return entries.sort((a, b) => {
		return b[1].errors * ERROR_WEIGHT_FACTOR + b[1].warnings - (a[1].errors * ERROR_WEIGHT_FACTOR + a[1].warnings);
	});
}
function aggregateAndSortFindings(findings, keyExtractor) {
	const map = {};
	for (const f of findings) {
		const key = keyExtractor(f);
		if (!map[key]) map[key] = {
			errors: 0,
			warnings: 0
		};
		if (f.severity === "error") map[key].errors++;
		else map[key].warnings++;
	}
	return sortFindingsEntries(Object.entries(map));
}
function validateReportFreshnessAndScope(report, args) {
	const targetFileName = args.inspectFix ? "latest_fix_audit.json" : "latest_audit.json";
	try {
		const auditInstant = Temporal.Instant.from(report.meta.timestamp);
		const now = Temporal.Now.instant();
		const elapsedMs = now.since(auditInstant).total({ unit: "millisecond" });
		const configuredMinutes = getAuditConfig().runner?.maxStalenessMinutes ?? 5;
		const effectiveMaxAgeMs = configuredMinutes * ONE_MINUTE_MS;
		if (!args.allowStale && elapsedMs > effectiveMaxAgeMs) {
			const elapsedMins = Math.max(1, Math.round(now.since(auditInstant).total({ unit: "minute" })));
			console.error(styleText("red", `[Error] scratch/audits/${targetFileName} is STALE (${elapsedMins} minutes old, limit: ${configuredMinutes} min).\n`) + styleText("yellow", `   Source code may have changed since last audit.\n`) + styleText("cyan", `   Run 'npm run auditor' to regenerate and validate report.`));
			process.exit(1);
		}
	} catch (err) {
		if (err.message.includes("STALE") || err.message.includes("OBSOLETO")) throw err;
		console.error(styleText("red", `[Error] scratch/audits/${targetFileName} contains an invalid timestamp ('${report.meta.timestamp}').\n`) + styleText("cyan", `   Run 'npm run auditor' to regenerate and validate report.`));
		process.exit(1);
	}
	if (report.meta.isFullAudit) return;
	if (args.human) console.log(styleText("yellow", `[Notice] Partial run: inspecting ${report.meta.executedSuiteCount}/${report.meta.totalDiscoveredSuites} suites: ${report.meta.executedSuites.join(", ")}.\n`));
	else console.log(styleText("yellow", `[Notice] Inspecting partial run (${report.meta.executedSuiteCount}/${report.meta.totalDiscoveredSuites} suites executed).\n`));
	if (args.suitePattern) {
		const cleanSuite = args.suitePattern.toLowerCase();
		if (!report.meta.executedSuites.some((s) => s.toLowerCase().includes(cleanSuite) || cleanSuite.includes(s.toLowerCase())) && !args.allowPartial) console.warn(styleText("yellow", `[Warning] Requested suite ('${args.suitePattern}') may not have been audited in this partial run.\n   Suites executed: ${report.meta.executedSuites.join(", ")}\n`));
	}
	if (args.category !== "all") {
		const matchesExecutedSuite = report.meta.executedSuites.some((s) => s.toLowerCase().includes(args.category.toLowerCase()) || args.category.toLowerCase().includes(s.toLowerCase()));
		const matchesExecutedFinding = Object.values(report.families).some((fam) => {
			if (!fam) return false;
			const lowerCat = args.category.toLowerCase();
			return fam.suites.some((suite) => suite.findings.some((f) => {
				const ruleDescMatches = typeof f.ruleDescription === "string" && f.ruleDescription.toLowerCase().includes(lowerCat);
				const ruleIdMatches = typeof f.ruleId === "string" && f.ruleId.toLowerCase().includes(lowerCat);
				const suiteDescMatches = typeof suite.description === "string" && suite.description.toLowerCase().includes(lowerCat);
				const suiteNameMatches = typeof suite.name === "string" && suite.name.toLowerCase().includes(lowerCat);
				return ruleDescMatches || ruleIdMatches || suiteDescMatches || suiteNameMatches;
			}));
		});
		if (!matchesExecutedSuite && !matchesExecutedFinding && !args.allowPartial) console.warn(styleText("yellow", `[Warning] Requested category ('${args.category}') may not have been audited in this partial run.\n   Suites executed: ${report.meta.executedSuites.join(", ")}\n`));
	}
}
function recordFindingInCategory(finding, suiteDesc, categoryCounts) {
	const catKey = finding.ruleDescription || suiteDesc || finding.ruleId || "Uncategorized";
	const entry = categoryCounts[catKey] ?? (categoryCounts[catKey] = {
		errors: 0,
		warnings: 0,
		findings: []
	});
	if (finding.severity === "error") entry.errors++;
	else entry.warnings++;
	entry.findings.push(finding);
}
function collectReportCategoryCounts(report) {
	const categoryCounts = {};
	const allFindings = [];
	for (const fam of Object.values(report.families)) {
		if (!fam) continue;
		for (const suite of fam.suites) {
			const suiteDesc = suite.description || suite.name || "";
			for (const finding of suite.findings) {
				if (!finding.suiteId && suite.id) finding.suiteId = suite.id;
				else if (!finding.suiteId && suite.name) finding.suiteId = suite.name;
				if (!finding.suiteName && suiteDesc) finding.suiteName = suiteDesc;
				recordFindingInCategory(finding, suiteDesc, categoryCounts);
				allFindings.push(finding);
			}
		}
	}
	return {
		categoryCounts,
		allFindings
	};
}
function matchesPathFilters(f, args) {
	const relPath = getNormalizedRelPath(f.file);
	if (args.scope === "host" && relPath.startsWith("packages/")) return false;
	if (args.scope === "packages" && !relPath.startsWith("packages/")) return false;
	if (args.dirPattern) {
		const cleanDir = toPosixRelative(process.cwd(), args.dirPattern).toLowerCase();
		const lowerRel = relPath.toLowerCase();
		if (lowerRel !== cleanDir && !lowerRel.startsWith(`${cleanDir}/`) && !lowerRel.includes(`/${cleanDir}/`)) return false;
	}
	if (args.filePattern) {
		if (!f.file) return false;
		const lowerFile = f.file.toLowerCase();
		if (!args.filePattern.split(",").map((p) => p.trim()).filter(Boolean).some((p) => lowerFile.includes(p))) return false;
	}
	return true;
}
function matchesSearchFilter(f, catKey, search) {
	const inMsg = f.message.toLowerCase().includes(search);
	const inFile = f.file ? f.file.toLowerCase().includes(search) : false;
	const inRule = f.ruleId && f.ruleId.toLowerCase().includes(search) || f.ruleDescription && f.ruleDescription.toLowerCase().includes(search) || catKey.toLowerCase().includes(search);
	return inMsg || inFile || Boolean(inRule);
}
function checkFindingMatchesFilter(f, catKey, args) {
	const effectivePhase = f.remediationPhase ?? "hygiene";
	if (args.phase !== "all" && effectivePhase !== args.phase) return false;
	if (args.suitePattern) {
		const cleanSuite = args.suitePattern.toLowerCase();
		const inSuiteId = f.suiteId ? f.suiteId.toLowerCase().includes(cleanSuite) : false;
		const inSuiteName = f.suiteName ? f.suiteName.toLowerCase().includes(cleanSuite) : false;
		const inRuleId = f.ruleId ? f.ruleId.toLowerCase().includes(cleanSuite) : false;
		if (!inSuiteId && !inSuiteName && !inRuleId) return false;
	}
	if (args.category !== "all") {
		const cleanArg = args.category.replace(/[-_]/g, " ").toLowerCase();
		if (!catKey.replace(/[-_]/g, " ").toLowerCase().includes(cleanArg)) return false;
	}
	if (args.rulePattern) {
		const cleanRule = args.rulePattern.toLowerCase();
		const inRuleId = f.ruleId ? f.ruleId.toLowerCase().includes(cleanRule) : false;
		const inRuleDesc = f.ruleDescription ? f.ruleDescription.toLowerCase().includes(cleanRule) : false;
		if (!inRuleId && !inRuleDesc) return false;
	}
	if (args.severity !== "all" && f.severity !== args.severity) return false;
	if (!matchesPathFilters(f, args)) return false;
	if (args.search && !matchesSearchFilter(f, catKey, args.search)) return false;
	return true;
}
function filterMatchingFindings(categoryCounts, args) {
	const filteredCategories = {};
	const matchingFindings = [];
	for (const [catName, data] of Object.entries(categoryCounts)) {
		const matchingInCat = data.findings.filter((f) => checkFindingMatchesFilter(f, catName, args));
		if (matchingInCat.length > 0) {
			filteredCategories[catName] = {
				errors: matchingInCat.filter((f) => f.severity === "error").length,
				warnings: matchingInCat.filter((f) => f.severity === "warning").length,
				findings: matchingInCat
			};
			matchingFindings.push(...matchingInCat);
		}
	}
	return {
		filteredCategories,
		matchingFindings
	};
}
function renderFindingsJson(matchingFindings, filteredCategories, report, args) {
	const fileMap = {};
	const dirMap = {};
	for (const f of matchingFindings) {
		const relPath = getNormalizedRelPath(f.file);
		const bucket = getDirectoryBucket(f.file);
		if (!fileMap[relPath]) fileMap[relPath] = {
			errors: 0,
			warnings: 0
		};
		if (!dirMap[bucket]) dirMap[bucket] = {
			errors: 0,
			warnings: 0
		};
		if (f.severity === "error") {
			fileMap[relPath].errors++;
			dirMap[bucket].errors++;
		} else {
			fileMap[relPath].warnings++;
			dirMap[bucket].warnings++;
		}
	}
	console.log(JSON.stringify({
		summary: report.summary,
		filteredTotal: matchingFindings.length,
		findings: args.top === "all" ? matchingFindings : matchingFindings.slice(0, args.top),
		categories: filteredCategories,
		breakdownByDir: dirMap,
		...args.filesOnly ? { files: fileMap } : {}
	}, null, 2));
}
function formatFindingLocation(finding) {
	if (!finding.file) return "General";
	const rel = path.relative(process.cwd(), finding.file);
	return finding.line ? `${rel}:${finding.line}` : rel;
}
function renderCategoryDetailSample(target, categoryArg, sortedCategories, args) {
	if (target) {
		const [catName, data] = target;
		const filtered = data.findings.filter((f) => checkFindingMatchesFilter(f, catName, args));
		const limit = args.top === "all" ? filtered.length : args.top;
		if (args.human) console.log(`\n[Category Findings] "${catName}" (Showing ${Math.min(limit, filtered.length)} of ${filtered.length}):\n`);
		else console.log(`\n[Findings] Category "${catName}" (Showing ${Math.min(limit, filtered.length)} of ${filtered.length}):\n`);
		filtered.slice(0, limit).forEach((f, idx) => {
			console.log(`  ${idx + 1}. [${f.severity.toUpperCase()}] ${formatFindingLocation(f)}`);
			console.log(`     ${f.message}`);
			if (f.context) console.log(`     Context: ${f.context}`);
		});
		console.log("");
	} else {
		console.log(`\n[Notice] No findings found for category "${categoryArg}". Available categories:`);
		sortedCategories.forEach(([name]) => console.log(`  • ${name}`));
		console.log("");
	}
}
function renderFilteredDetailSample(matchingFindings, args) {
	const limit = args.flat || args.top === "all" ? matchingFindings.length : args.top;
	const filterInfo = [
		args.suitePattern ? `suite="${args.suitePattern}"` : null,
		args.severity !== "all" ? `severity=${args.severity}` : null,
		args.dirPattern ? `dir="${args.dirPattern}"` : null,
		args.rulePattern ? `rule="${args.rulePattern}"` : null,
		args.scope !== "all" ? `scope=${args.scope}` : null,
		args.search ? `search="${args.search}"` : null,
		args.filePattern ? `file="${args.filePattern}"` : null,
		args.flat ? "flat" : null
	].filter(Boolean).join(", ");
	const headerText = args.human ? `\n[Filtered Findings] (filters: ${filterInfo || "all"}): showing ${Math.min(limit, matchingFindings.length)} of ${matchingFindings.length}:\n` : `\n[Findings] Filtered (filters: ${filterInfo || "all"}): showing ${Math.min(limit, matchingFindings.length)} of ${matchingFindings.length}:\n`;
	console.log(headerText);
	matchingFindings.slice(0, limit).forEach((f, idx) => {
		const loc = formatFindingLocation(f);
		const ruleTag = f.ruleId ? `[${f.ruleId}] ` : f.ruleDescription ? `[${f.ruleDescription}] ` : "";
		console.log(`  ${idx + 1}. [${f.severity.toUpperCase()}] ${loc}: ${ruleTag}${f.message}`);
	});
	console.log("");
}
function renderFindingsDetailSample(matchingFindings, sortedCategories, allFindings, args) {
	if (args.flat || args.suitePattern || args.rulePattern || args.search || args.filePattern || args.dirPattern || args.scope !== "all" || args.severity !== "all") renderFilteredDetailSample(matchingFindings, args);
	else if (args.category !== "all") {
		const cleanArg = args.category.replace(/[-_]/g, " ").toLowerCase();
		renderCategoryDetailSample(sortedCategories.find(([name]) => name.toLowerCase().replace(/[-_]/g, " ").includes(cleanArg)), args.category, sortedCategories, args);
	} else {
		const allErrors = allFindings.filter((f) => f.severity === "error");
		if (allErrors.length > 0) {
			const limit = args.top === "all" ? allErrors.length : typeof args.top === "number" ? args.top : DEFAULT_SAMPLE_ERROR_LIMIT;
			if (args.human) console.log(renderSampleFindings(allErrors, limit));
			else {
				console.log(`\n[Errors] Top ${Math.min(limit, allErrors.length)} of ${allErrors.length} error(s):`);
				allErrors.slice(0, limit).forEach((f, idx) => {
					const loc = formatFindingLocation(f);
					const ruleTag = f.ruleId ? `[${f.ruleId}] ` : "";
					console.log(`  ${idx + 1}. [ERROR] ${loc}: ${ruleTag}${f.message}`);
				});
				console.log("");
			}
		}
	}
}
function renderRulesView(matchingFindings, args) {
	const sortedRules = aggregateAndSortFindings(matchingFindings, (f) => f.ruleId || f.ruleDescription || "unknown");
	const rulesToDisplay = args.top === "all" ? sortedRules : sortedRules.slice(0, args.top);
	if (!args.human) {
		if (matchingFindings.length === 0) {
			console.log(styleText("green", "[OK] No findings match active filters."));
			return;
		}
		console.log(`\n[ByRule] ${sortedRules.length} rule(s) violated (${matchingFindings.length} findings):`);
		for (const [ruleId, stats] of rulesToDisplay) console.log(`• [${ruleId}]: ${stats.errors} error(s), ${stats.warnings} warning(s)`);
		console.log("");
		return;
	}
	const bannerTitle = args.category !== "all" ? `BREAKDOWN BY RULE (${args.category})` : "AUDIT RULE BREAKDOWN";
	console.log("\n" + renderBanner(bannerTitle, `Total findings: ${matchingFindings.length} | Rules with violations: ${sortedRules.length}`));
	console.log("\n" + renderFindingsBreakdownTable(rulesToDisplay, "RULE / AUDIT ID") + "\n");
}
function renderBreakdownView(matchingFindings, args) {
	const sortedDirs = aggregateAndSortFindings(matchingFindings, (f) => getDirectoryBucket(f.file));
	if (!args.human) {
		if (matchingFindings.length === 0) {
			console.log(styleText("green", "[OK] No findings match active filters."));
			return;
		}
		console.log(`\n[Breakdown] ${sortedDirs.length} scope(s) affected (${matchingFindings.length} findings):`);
		for (const [dir, stats] of sortedDirs) console.log(`• ${dir}: ${stats.errors} error(s), ${stats.warnings} warning(s)`);
		console.log("");
		return;
	}
	const bannerTitle = args.category !== "all" ? `DISTRIBUTION BY DIRECTORY (${args.category})` : "DIRECTORY / SCOPE DISTRIBUTION";
	console.log("\n" + renderBanner(bannerTitle, `Total findings: ${matchingFindings.length} | Affected directories: ${sortedDirs.length}`));
	console.log("\n" + renderFindingsBreakdownTable(sortedDirs, "DIRECTORY / SCOPE") + "\n");
}
function renderFilesOnlyView(matchingFindings, report, args) {
	const sortedFiles = aggregateAndSortFindings(matchingFindings, (f) => getNormalizedRelPath(f.file));
	const filesToDisplay = args.top === "all" ? sortedFiles : sortedFiles.slice(0, args.top);
	if (!args.human) {
		if (matchingFindings.length === 0) {
			console.log(styleText("green", "[OK] No findings match active filters."));
			return;
		}
		console.log(`\n[Files] ${sortedFiles.length} file(s) affected (${matchingFindings.length} findings):`);
		for (const [file, stats] of filesToDisplay) console.log(`• ${file}: ${stats.errors} error(s), ${stats.warnings} warning(s)`);
		console.log("");
		return;
	}
	const bannerTitle = args.category !== "all" ? `FILES WITH FINDINGS (${args.category})` : "FILES WITH AUDIT FINDINGS";
	console.log("\n" + renderBanner(bannerTitle, `Status: ${report.status === "passed" ? "PASSED" : "FAILED"} | Affected files: ${sortedFiles.length}`));
	console.log("\n" + renderFindingsBreakdownTable(filesToDisplay, "AFFECTED FILE") + "\n");
}
function renderByFileCompact(fileSummaries, totalFindings, totalErrors, totalWarnings, args) {
	if (fileSummaries.length === 0) {
		console.log(styleText("green", "[OK] No findings match active filters."));
		return;
	}
	console.log(`\n[ByFile] ${fileSummaries.length} file(s) affected (${totalFindings} findings):`);
	const limit = typeof args.top === "number" ? Math.min(args.top, fileSummaries.length) : fileSummaries.length;
	for (const fs of fileSummaries.slice(0, limit)) {
		console.log(`• ${fs.file} (${fs.errors} error(s), ${fs.warnings} warning(s))`);
		if (!args.summaryOnly) for (const f of fs.findings) {
			const loc = f.line ? `${f.line}:${f.col ?? 0}` : "1:1";
			const rule = f.ruleId ?? "unknown";
			console.log(`  [${f.severity.toUpperCase()}] ${loc} [${rule}]: ${f.message}`);
		}
	}
	console.log(`\nTotal: ${totalErrors} error(s), ${totalWarnings} warning(s) across ${fileSummaries.length} file(s).\n`);
}
function buildByFileFilterLabels(args) {
	const filterLabels = [];
	if (args.phase !== "all") filterLabels.push(`phase: "${args.phase}"`);
	if (args.filePattern) filterLabels.push(`file: "${args.filePattern}"`);
	if (args.suitePattern) filterLabels.push(`suite: "${args.suitePattern}"`);
	if (args.category !== "all") filterLabels.push(`category: "${args.category}"`);
	if (args.severity !== "all") filterLabels.push(`severity: ${args.severity}`);
	if (args.dirPattern) filterLabels.push(`directory: "${args.dirPattern}"`);
	if (args.search) filterLabels.push(`search: "${args.search}"`);
	return filterLabels;
}
function renderByFileView(matchingFindings, report, args) {
	const sortedFindings = sortFindingsByFileAndLine(matchingFindings);
	const fileSummaryMap = groupFindingsByFileMap(sortedFindings);
	const fileSummaries = Object.values(fileSummaryMap);
	fileSummaries.sort((a, b) => {
		const scoreB = b.errors * ERROR_WEIGHT_FACTOR + b.warnings;
		const scoreA = a.errors * ERROR_WEIGHT_FACTOR + a.warnings;
		if (scoreB !== scoreA) return scoreB - scoreA;
		return a.file.localeCompare(b.file);
	});
	const totalErrors = matchingFindings.filter((f) => f.severity === "error").length;
	const totalWarnings = matchingFindings.filter((f) => f.severity === "warning").length;
	if (args.jsonOutput) {
		const byFileReport = {
			meta: report.meta,
			status: report.status,
			summary: {
				...report.summary,
				totalViolations: matchingFindings.length,
				errors: totalErrors,
				warnings: totalWarnings
			},
			totalAffectedFiles: fileSummaries.length,
			files: Object.fromEntries(fileSummaries.map((fs) => [fs.file, fs]))
		};
		console.log(JSON.stringify(byFileReport, null, 2));
		return;
	}
	if (!args.human) {
		renderByFileCompact(fileSummaries, matchingFindings.length, totalErrors, totalWarnings, args);
		return;
	}
	const filterLabels = buildByFileFilterLabels(args);
	const subtitle = filterLabels.length > 0 ? `Filters: ${filterLabels.join(", ")} | Files: ${fileSummaries.length} | Findings: ${matchingFindings.length}` : `Status: ${report.status === "passed" ? "PASSED" : "FAILED"} | Files: ${fileSummaries.length} | Findings: ${matchingFindings.length}`;
	console.log("\n" + renderBanner("AUDIT FINDINGS GROUPED BY FILE AND LINE", subtitle));
	if (fileSummaries.length === 0) {
		console.log("\n" + buildNoticeBox({
			borderColor: "green",
			title: "AUDIT FINDINGS BY FILE: ZERO VIOLATIONS",
			lines: ["No findings match active filters."]
		}) + "\n");
		return;
	}
	if (fileSummaries.length > 1 && !args.filePattern) {
		const tableEntries = fileSummaries.map((fs) => [fs.file, {
			errors: fs.errors,
			warnings: fs.warnings
		}]);
		const tableLimit = typeof args.top === "number" ? Math.min(args.top, fileSummaries.length) : fileSummaries.length;
		console.log("\n" + renderFindingsBreakdownTable(tableEntries.slice(0, tableLimit), "AFFECTED FILE") + "\n");
	}
	const treeOutput = renderFindingsByFileTree(fileSummaries, {
		maxFiles: args.top,
		maxFindingsPerFile: "all"
	});
	console.log(treeOutput + "\n");
}
function resolveActiveRemediationPhase(allFindings) {
	const phaseStats = {
		setup: {
			errors: 0,
			warnings: 0,
			total: 0
		},
		prune: {
			errors: 0,
			warnings: 0,
			total: 0
		},
		dedup: {
			errors: 0,
			warnings: 0,
			total: 0
		},
		contracts: {
			errors: 0,
			warnings: 0,
			total: 0
		},
		behavior: {
			errors: 0,
			warnings: 0,
			total: 0
		},
		hygiene: {
			errors: 0,
			warnings: 0,
			total: 0
		},
		polish: {
			errors: 0,
			warnings: 0,
			total: 0
		}
	};
	let totalErrors = 0;
	let totalWarnings = 0;
	for (const f of allFindings) {
		const rawPhase = f.remediationPhase;
		const p = rawPhase && isRemediationPhaseId(rawPhase) ? rawPhase : "hygiene";
		if (f.severity === "error") {
			phaseStats[p].errors++;
			totalErrors++;
		} else {
			phaseStats[p].warnings++;
			totalWarnings++;
		}
		phaseStats[p].total++;
	}
	for (let i = 0; i < REMEDIATION_PHASE_IDS.length; i++) {
		const p = REMEDIATION_PHASE_IDS[i];
		if (phaseStats[p].errors > 0) {
			let postponedCount = 0;
			for (let j = i + 1; j < REMEDIATION_PHASE_IDS.length; j++) postponedCount += phaseStats[REMEDIATION_PHASE_IDS[j]].total;
			return {
				phase: p,
				errors: phaseStats[p].errors,
				warnings: phaseStats[p].warnings,
				postponedCount,
				totalErrorsInReport: totalErrors,
				totalWarningsInReport: totalWarnings
			};
		}
	}
	for (let i = 0; i < REMEDIATION_PHASE_IDS.length; i++) {
		const p = REMEDIATION_PHASE_IDS[i];
		if (phaseStats[p].warnings > 0) {
			let postponedCount = 0;
			for (let j = i + 1; j < REMEDIATION_PHASE_IDS.length; j++) postponedCount += phaseStats[REMEDIATION_PHASE_IDS[j]].total;
			return {
				phase: p,
				errors: 0,
				warnings: phaseStats[p].warnings,
				postponedCount,
				totalErrorsInReport: totalErrors,
				totalWarningsInReport: totalWarnings
			};
		}
	}
	return null;
}
function renderActivePhaseFocusBanner(resolution, isHuman = false) {
	const meta = REMEDIATION_PHASES[resolution.phase];
	const phaseOrder = meta.order;
	const title = meta.title;
	const targetDesc = resolution.errors > 0 ? `${resolution.errors} error(s)` + (resolution.warnings > 0 ? ` and ${resolution.warnings} warning(s)` : "") : `${resolution.warnings} warning(s)`;
	const postponedDesc = resolution.postponedCount > 0 ? `Postponing ${resolution.postponedCount} downstream finding(s) in lower-priority phases to prevent premature fixes.` : "No downstream findings.";
	if (isHuman) return buildNoticeBox({
		borderColor: resolution.errors > 0 ? "red" : "yellow",
		title: `ACTIVE REMEDIATION PHASE ${phaseOrder}/7: ${meta.icon} ${title.toUpperCase()}`,
		lines: [`Focus: ${targetDesc} in this phase.`, postponedDesc]
	});
	const header = `[FOCUS] ACTIVE REMEDIATION PHASE ${phaseOrder}/7: ${title.toUpperCase()}`;
	const statusLine = `Target: ${targetDesc}.`;
	const postponedLine = resolution.postponedCount > 0 ? `Postponed: ${resolution.postponedCount} downstream finding(s).` : "Downstream: clean.";
	return styleText(["bold", "cyan"], `${header}\n  ${statusLine} ${postponedLine}\n`);
}
function handleActiveRemediationPhase(args, allFindings) {
	if (args.phase !== "next") return true;
	const activeResolution = resolveActiveRemediationPhase(allFindings);
	if (!activeResolution) {
		if (args.jsonOutput) console.log(JSON.stringify({
			activePhase: null,
			status: "clean",
			findings: []
		}, null, 2));
		else if (args.human) console.log("\n" + buildNoticeBox({
			borderColor: "green",
			title: "STRATEGIC REMEDIATION STATUS: ALL PHASES CLEAN",
			lines: ["All 7 remediation phases passed cleanly (0 errors, 0 warnings).", "The repository is fully verified and ready for commit."]
		}) + "\n");
		else console.log(styleText("green", "\n[OK] All 7 remediation phases are clean (0 errors, 0 warnings).\n"));
		return false;
	}
	args.phase = activeResolution.phase;
	if (!args.jsonOutput) console.log("\n" + renderActivePhaseFocusBanner(activeResolution, args.human));
	return true;
}
function dispatchCustomReportView(args, report, matchingFindings, filteredCategories) {
	if (args.byFile) {
		renderByFileView(matchingFindings, report, args);
		return true;
	}
	if (args.byRule) {
		renderRulesView(matchingFindings, args);
		return true;
	}
	if (args.jsonOutput) {
		renderFindingsJson(matchingFindings, filteredCategories, report, args);
		return true;
	}
	if (args.breakdown) {
		renderBreakdownView(matchingFindings, args);
		return true;
	}
	if (args.filesOnly) {
		renderFilesOnlyView(matchingFindings, report, args);
		return true;
	}
	return false;
}
function renderCompactSummary(report, matchingFindings, sortedCategories, allFindings, args) {
	if (matchingFindings.length === 0) {
		console.log(styleText("green", "[OK] 0 errors and 0 warnings. All audit suites passed."));
		return;
	}
	console.log(`\n[Summary] Status: ${report.status === "passed" ? "PASSED" : "FAILED"} | Suites: ${report.summary.suitesPassed}/${report.summary.suitesTotal} | Violations: ${matchingFindings.length} (${report.summary.errors} errors, ${report.summary.warnings} warnings)`);
	console.log("\n[Categories]:");
	for (const [name, stats] of sortedCategories.slice(0, typeof args.top === "number" ? args.top : DEFAULT_TOP_LIMIT)) console.log(`• ${name}: ${stats.errors} error(s), ${stats.warnings} warning(s)`);
	console.log("");
	if (args.summaryOnly) return;
	renderFindingsDetailSample(matchingFindings, sortedCategories, allFindings, args);
}
function renderDefaultReportView(args, report, matchingFindings, categoryCounts, filteredCategories, allFindings) {
	const hasSpecificFilter = Boolean(args.flat || args.suitePattern || args.rulePattern || args.search || args.filePattern || args.dirPattern || args.category !== "all" || args.phase !== "all" || args.severity !== "all" || args.scope !== "all");
	const sortedCategories = sortFindingsEntries(Object.entries(hasSpecificFilter ? filteredCategories : categoryCounts));
	if (!args.human && hasSpecificFilter) {
		if (args.summaryOnly) return;
		renderFindingsDetailSample(matchingFindings, sortedCategories, allFindings, args);
		return;
	}
	if (!args.human) {
		renderCompactSummary(report, matchingFindings, sortedCategories, allFindings, args);
		return;
	}
	console.log("\n" + renderBanner("CONSOLIDATED AUDIT WARNINGS & ERRORS REPORT", `Status: ${report.status === "passed" ? "PASSED" : "FAILED"} | Suites: ${report.summary.suitesPassed}/${report.summary.suitesTotal}`));
	console.log("\n" + renderFindingsBreakdownTable(sortedCategories, "CATEGORY / AUDIT RULE") + "\n");
	if (args.summaryOnly) return;
	renderFindingsDetailSample(matchingFindings, sortedCategories, allFindings, args);
}
function runReport(inputArgs) {
	const args = parseReportOptions(inputArgs);
	const report = loadAuditReport(args.inspectFix);
	if (!report) process.exit(1);
	validateReportFreshnessAndScope(report, args);
	const { categoryCounts, allFindings } = collectReportCategoryCounts(report);
	if (!handleActiveRemediationPhase(args, allFindings)) return;
	const { filteredCategories, matchingFindings } = filterMatchingFindings(categoryCounts, args);
	if (dispatchCustomReportView(args, report, matchingFindings, filteredCategories)) return;
	renderDefaultReportView(args, report, matchingFindings, categoryCounts, filteredCategories, allFindings);
}
const reportFindingsCommand = defineCommand({
	meta: {
		name: "auditor-findings",
		description: "Inspect and query static analysis findings from latest audit report"
	},
	args: REPORT_FINDINGS_ARGS,
	run() {
		runReport(parseCittyArgs(REPORT_FINDINGS_ARGS));
	}
});
if (isMainModule(import.meta.url)) {
	bootstrapCliProject();
	runMain(reportFindingsCommand);
}
//#endregion
export { renderActivePhaseFocusBanner, reportFindingsCommand, resolveActiveRemediationPhase, runReport };
