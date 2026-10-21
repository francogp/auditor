#!/usr/bin/env -S node --experimental-strip-types
import "../core/auditConfigTypes.js";
import { getAuditConfig } from "../core/auditConfigLoader.js";
import "../core/auditConfig.js";
import { isRemediationPhaseId } from "../core/remediationPhases.js";
import { ONE_MINUTE_MS, groupFindingsByFileMap, sortFindingsByFileAndLine } from "../core/auditContract.js";
import { COMMON_CLI_ARGS, getProcessCliArgs, getProcessExecutedScript, parseCittyArgs, resolveHumanModeFromArgs } from "../core/cli/cittyHarness.js";
import { toPosixRelative } from "../core/auditCoverage.js";
import "../core/safePath.js";
import { renderFindingsByFileTree } from "../core/fileTreeRenderer.js";
import { renderBanner, renderFindingsBreakdownTable, renderSampleFindings } from "../core/unifiedTheme.js";
import { HUMAN_CONSOLE_FLAGS, bootstrapCliProject, isHumanConsoleMode, isMainModule } from "./cliUtils.js";
import path from "node:path";
import fs from "node:fs";
import { styleText } from "node:util";
//#region src/cli/report_findings.ts
/**
* src/cli/report_findings.ts
*/
const RADIX_DECIMAL = 10;
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
const JSON_FLAGS = /* @__PURE__ */ new Set([
	"json",
	"--json",
	"json=true"
]);
const SUMMARY_FLAGS = /* @__PURE__ */ new Set([
	"summary",
	"--summary",
	"summary=true"
]);
const FILES_FLAGS = /* @__PURE__ */ new Set([
	"files",
	"--files",
	"files=true"
]);
const BREAKDOWN_FLAGS = /* @__PURE__ */ new Set([
	"breakdown",
	"--breakdown",
	"breakdown=true",
	"by-dir",
	"dirs"
]);
const BY_FILE_FLAGS = /* @__PURE__ */ new Set([
	"by-file",
	"--by-file",
	"by_file",
	"group=file",
	"group-by=file",
	"byfile"
]);
const BY_RULE_FLAGS = /* @__PURE__ */ new Set([
	"by-rule",
	"--by-rule",
	"by_rule",
	"rules",
	"--rules",
	"byrule",
	"group=rule",
	"group-by=rule"
]);
const FLAT_FLAGS = /* @__PURE__ */ new Set([
	"flat",
	"--flat",
	"all-samples",
	"--all-samples",
	"raw",
	"--raw"
]);
const STALE_FLAGS = /* @__PURE__ */ new Set([
	"allow-stale",
	"--allow-stale",
	"stale"
]);
const PARTIAL_FLAGS = /* @__PURE__ */ new Set([
	"allow-partial",
	"--allow-partial",
	"partial"
]);
const FIX_FLAGS = /* @__PURE__ */ new Set([
	"fix",
	"--fix",
	"fix-report",
	"--fix-report"
]);
function isInvokedAsByFile() {
	const scriptArg = getProcessExecutedScript() ?? "";
	return path.basename(scriptArg).toLowerCase().includes("auditor-by-file");
}
function isInvokedAsByRule() {
	const scriptArg = getProcessExecutedScript() ?? "";
	const scriptName = path.basename(scriptArg).toLowerCase();
	return scriptName.includes("auditor-rules") || scriptName.includes("auditor-by-rule");
}
function parseFlagArg(arg, opts) {
	if (HUMAN_CONSOLE_FLAGS.has(arg)) {
		opts.human = true;
		return true;
	}
	if (JSON_FLAGS.has(arg)) {
		opts.jsonOutput = true;
		return true;
	}
	if (SUMMARY_FLAGS.has(arg)) {
		opts.summaryOnly = true;
		return true;
	}
	if (FILES_FLAGS.has(arg)) {
		opts.filesOnly = true;
		return true;
	}
	if (BREAKDOWN_FLAGS.has(arg)) {
		opts.breakdown = true;
		return true;
	}
	if (BY_FILE_FLAGS.has(arg)) {
		opts.byFile = true;
		return true;
	}
	if (BY_RULE_FLAGS.has(arg)) {
		opts.byRule = true;
		return true;
	}
	if (FLAT_FLAGS.has(arg)) {
		opts.flat = true;
		return true;
	}
	if (STALE_FLAGS.has(arg)) {
		opts.allowStale = true;
		return true;
	}
	if (PARTIAL_FLAGS.has(arg)) {
		opts.allowPartial = true;
		return true;
	}
	if (FIX_FLAGS.has(arg)) {
		opts.inspectFix = true;
		opts.allowPartial = true;
		return true;
	}
	return false;
}
function parseScopeArg(arg, opts) {
	if (arg === "host" || arg === "scope=host") {
		opts.scope = "host";
		return true;
	}
	if (arg === "packages" || arg === "scope=packages" || arg === "pkg") {
		opts.scope = "packages";
		return true;
	}
	if (arg.startsWith("scope=")) {
		const val = arg.slice(6).toLowerCase();
		if (val === "host" || val === "packages" || val === "all") opts.scope = val;
		return true;
	}
	return false;
}
function parseSeverityArg(arg, opts) {
	if (arg === "errors" || arg === "error" || arg === "severity=error") {
		opts.severity = "error";
		return true;
	}
	if (arg === "warnings" || arg === "warning" || arg === "severity=warning") {
		opts.severity = "warning";
		return true;
	}
	if (arg.startsWith("severity=")) {
		const val = arg.slice(9).toLowerCase();
		if (val === "error" || val === "warning" || val === "all") opts.severity = val;
		return true;
	}
	return false;
}
function parseScopeAndSeverity(arg, opts) {
	return parseScopeArg(arg, opts) || parseSeverityArg(arg, opts);
}
function parseFilterAndValue(arg, opts) {
	if (arg.startsWith("dir=")) {
		opts.dirPattern = arg.slice(4).toLowerCase();
		return true;
	}
	if (arg.startsWith("folder=")) {
		opts.dirPattern = arg.slice(7).toLowerCase();
		return true;
	}
	if (arg.startsWith("phase=") || arg.startsWith("fase=")) {
		const val = arg.slice(arg.indexOf("=") + 1).toLowerCase();
		if (isRemediationPhaseId(val)) opts.phase = val;
		return true;
	}
	if (arg.startsWith("category=")) {
		opts.category = arg.slice(9).toLowerCase();
		return true;
	}
	if (arg.startsWith("suite=") || arg.startsWith("task=")) {
		const prefixLen = arg.startsWith("suite=") ? 6 : 5;
		opts.suitePattern = arg.slice(prefixLen).toLowerCase();
		return true;
	}
	if (arg.startsWith("search=")) {
		opts.search = arg.slice(7).toLowerCase();
		return true;
	}
	if (arg.startsWith("file=") || arg.startsWith("f=")) {
		const prefixLen = arg.startsWith("file=") ? 5 : 2;
		opts.filePattern = arg.slice(prefixLen).toLowerCase();
		return true;
	}
	if (arg.startsWith("rule=") || arg.startsWith("ruleid=") || arg.startsWith("r=")) {
		const prefixLen = arg.startsWith("ruleid=") ? 7 : arg.startsWith("rule=") ? 5 : 2;
		opts.rulePattern = arg.slice(prefixLen).toLowerCase();
		return true;
	}
	if (arg.startsWith("top=")) {
		const topVal = arg.slice(4).toLowerCase();
		opts.top = topVal === "all" || topVal === "0" ? "all" : parseInt(topVal, RADIX_DECIMAL) || DEFAULT_TOP_LIMIT;
		return true;
	}
	return false;
}
function parseReportOptions(rawInputArgs = getProcessCliArgs()) {
	const parsedCitty = parseCittyArgs(COMMON_CLI_ARGS, rawInputArgs);
	const isHuman = resolveHumanModeFromArgs(parsedCitty) || isHumanConsoleMode(void 0, rawInputArgs);
	const opts = {
		category: "all",
		phase: "all",
		severity: "all",
		search: "",
		filePattern: "",
		dirPattern: "",
		rulePattern: "",
		suitePattern: "",
		scope: "all",
		breakdown: false,
		byFile: isInvokedAsByFile(),
		byRule: isInvokedAsByRule(),
		flat: false,
		top: DEFAULT_TOP_LIMIT,
		jsonOutput: Boolean(parsedCitty.json),
		summaryOnly: false,
		filesOnly: false,
		allowStale: false,
		allowPartial: false,
		inspectFix: false,
		human: isHuman
	};
	const handledEntries = /* @__PURE__ */ new Set();
	for (const rawEntry of rawInputArgs) if (parseFlagArg(rawEntry, opts) || parseScopeAndSeverity(rawEntry, opts) || parseFilterAndValue(rawEntry, opts)) handledEntries.add(rawEntry);
	for (const posEntry of parsedCitty._.map(String)) {
		if (handledEntries.has(posEntry)) continue;
		const lower = posEntry.toLowerCase();
		if (lower === "by-file" || lower === "byfile") opts.byFile = true;
		else if (lower === "by-rule" || lower === "byrule" || lower === "rules") opts.byRule = true;
		else if (lower === "flat" || lower === "raw") opts.flat = true;
		else if (lower !== "human" && lower !== "json" && lower !== "help") opts.category = lower;
	}
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
	if (args.phase !== "all" && f.remediationPhase !== args.phase) return false;
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
		if (args.human) console.log(`\n🔍 Sample findings for category "${catName}" (Showing ${Math.min(limit, filtered.length)} of ${filtered.length}):\n`);
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
	const headerText = args.human ? `\n🔍 Filtered findings (active filters: ${filterInfo || "all"}): ${Math.min(limit, matchingFindings.length)} of ${matchingFindings.length}\n` : `\n[Findings] Filtered (filters: ${filterInfo || "all"}): showing ${Math.min(limit, matchingFindings.length)} of ${matchingFindings.length}:\n`;
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
		console.log(styleText("green", "\n✨ No findings match active filters.\n"));
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
function runReport() {
	const args = parseReportOptions();
	const report = loadAuditReport(args.inspectFix);
	if (!report) process.exit(1);
	validateReportFreshnessAndScope(report, args);
	const { categoryCounts, allFindings } = collectReportCategoryCounts(report);
	const { filteredCategories, matchingFindings } = filterMatchingFindings(categoryCounts, args);
	if (args.byFile) {
		renderByFileView(matchingFindings, report, args);
		return;
	}
	if (args.byRule) {
		renderRulesView(matchingFindings, args);
		return;
	}
	if (args.jsonOutput) {
		renderFindingsJson(matchingFindings, filteredCategories, report, args);
		return;
	}
	if (args.breakdown) {
		renderBreakdownView(matchingFindings, args);
		return;
	}
	if (args.filesOnly) {
		renderFilesOnlyView(matchingFindings, report, args);
		return;
	}
	const categoriesToRender = args.phase !== "all" || args.suitePattern || args.category !== "all" || args.severity !== "all" || args.search || args.filePattern || args.dirPattern || args.scope !== "all" ? filteredCategories : categoryCounts;
	const sortedCategories = sortFindingsEntries(Object.entries(categoriesToRender));
	const hasSpecificFilter = Boolean(args.flat || args.suitePattern || args.rulePattern || args.search || args.filePattern || args.dirPattern || args.category !== "all" || args.phase !== "all" || args.severity !== "all" || args.scope !== "all");
	if (!args.human && hasSpecificFilter) {
		if (args.summaryOnly) return;
		renderFindingsDetailSample(matchingFindings, sortedCategories, allFindings, args);
		return;
	}
	if (!args.human) {
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
		return;
	}
	console.log("\n" + renderBanner("CONSOLIDATED AUDIT WARNINGS & ERRORS REPORT", `Status: ${report.status === "passed" ? "PASSED" : "FAILED"} | Suites: ${report.summary.suitesPassed}/${report.summary.suitesTotal}`));
	console.log("\n" + renderFindingsBreakdownTable(sortedCategories, "CATEGORY / AUDIT RULE") + "\n");
	if (args.summaryOnly) return;
	renderFindingsDetailSample(matchingFindings, sortedCategories, allFindings, args);
}
if (isMainModule(import.meta.url)) {
	bootstrapCliProject();
	runReport();
}
//#endregion
export { REPORT_SCOPES, SEVERITY_FILTERS, runReport };
