#!/usr/bin/env -S node --experimental-strip-types
import { AUDITOR_VERSION } from "../core/version.js";
import { loadAuditConfig } from "../core/auditConfigLoader.js";
import "../core/auditConfig.js";
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs, resolveHumanModeFromArgs } from "../core/cli/cittyHarness.js";
import "../core/permissionGuard.js";
import { readCoverageLedgers, readLatestCoverageLedgers } from "../core/auditCoverage.js";
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { isHumanConsoleMode, isMainModule } from "./cliUtils.js";
import { isPathIgnored } from "../core/auditorBase.js";
import { getMatchingExemptionPolicies } from "../core/exemptionPolicies.js";
import { isCoveredBy, listTrackedFiles } from "../suites/architecture/validate_audit_coverage.js";
import path from "node:path";
import { styleText } from "node:util";
//#region src/cli/report_coverage_map.ts
/**
* src/cli/report_coverage_map.ts
*
* AUDITOR COVERAGE MAP CLI (Node.js 26+)
* Renders the full coverage map across versioned files and executed audit suites.
* Identifies uncovered files (blind spots) and degraded files (rules silenced by configuration).
*/
const PERCENT_SCALE_FACTOR = 1e3;
const PERCENT_DECIMAL_DIVISOR = 10;
const PERCENT_FULL_COVERAGE = 100;
const WARNING_COVERAGE_THRESHOLD = 80;
const COVERAGE_MAP_ARGS = {
	...COMMON_CLI_ARGS,
	files: {
		type: "boolean",
		default: false,
		description: "List individual files"
	},
	uncovered: {
		type: "boolean",
		default: false,
		description: "Show only uncovered files"
	},
	degraded: {
		type: "boolean",
		default: false,
		description: "Show only degraded files"
	},
	"run-id": {
		type: "string",
		description: "Specific coverage run ID to inspect"
	}
};
const COVERAGE_MAP_BARE_BOOLEANS = /* @__PURE__ */ new Set([
	"files",
	"uncovered",
	"degraded"
]);
function parseCoverageMapCliArgs(rawInputArgs = getProcessCliArgs()) {
	const parsed = parseCittyArgs(COVERAGE_MAP_ARGS, rawInputArgs, COVERAGE_MAP_BARE_BOOLEANS);
	const options = {};
	if (parsed.json) options.jsonOutput = true;
	if (resolveHumanModeFromArgs(parsed)) options.human = true;
	if (parsed.files) options.filesOnly = true;
	if (parsed.uncovered) options.uncoveredOnly = true;
	if (parsed.degraded) options.degradedOnly = true;
	if (typeof parsed["run-id"] === "string" && parsed["run-id"]) options.runId = parsed["run-id"];
	return options;
}
function classifyTrackedFiles(trackedFiles, ledgers, config) {
	const scannedSets = new Map(ledgers.map((l) => [l.suiteId, new Set(l.scanned)]));
	const exemptGlobs = config.coverage?.exemptGlobs ?? [];
	const acknowledged = config.coverage?.acknowledgedDegradations ?? [];
	return trackedFiles.map((file) => {
		if (isPathIgnored(file)) return {
			file,
			status: "exempt",
			coveringSuites: [],
			degradedPolicies: [],
			exemptionReason: "Canonical ignored directory/file (dist/scratch/etc)"
		};
		const matchedExemption = exemptGlobs.find((e) => path.posix.matchesGlob(file, e.glob));
		if (matchedExemption) return {
			file,
			status: "exempt",
			coveringSuites: [],
			degradedPolicies: [],
			exemptionReason: matchedExemption.reason
		};
		const coveringSuites = ledgers.filter((l) => isCoveredBy(file, l, scannedSets)).map((l) => l.suiteId);
		if (coveringSuites.length === 0) return {
			file,
			status: "uncovered",
			coveringSuites: [],
			degradedPolicies: []
		};
		const unacknowledgedPolicies = getMatchingExemptionPolicies(file, config).filter((p) => {
			if (p.kind !== "configured") return false;
			return !acknowledged.some((a) => a.policy === p.id && path.posix.matchesGlob(file, a.glob));
		});
		if (unacknowledgedPolicies.length > 0) return {
			file,
			status: "degraded",
			coveringSuites,
			degradedPolicies: unacknowledgedPolicies
		};
		return {
			file,
			status: "covered",
			coveringSuites,
			degradedPolicies: []
		};
	});
}
function computeDirectorySummaries(files) {
	const dirMap = /* @__PURE__ */ new Map();
	for (const entry of files) {
		const parent = path.posix.dirname(entry.file);
		let dirKey = ".";
		if (parent !== ".") {
			if (parent.startsWith("src/")) {
				const afterSrc = parent.slice(4);
				const nextSlash = afterSrc.indexOf("/");
				dirKey = nextSlash === -1 ? parent : `src/${afterSrc.slice(0, nextSlash)}`;
			} else {
				const nextSlash = parent.indexOf("/");
				dirKey = nextSlash === -1 ? parent : parent.slice(0, nextSlash);
			}
		}
		if (!dirMap.has(dirKey)) dirMap.set(dirKey, {
			total: 0,
			covered: 0,
			degraded: 0,
			uncovered: 0,
			exempt: 0
		});
		const stats = dirMap.get(dirKey);
		stats.total++;
		if (entry.status === "covered") stats.covered++;
		else if (entry.status === "degraded") stats.degraded++;
		else if (entry.status === "uncovered") stats.uncovered++;
		else if (entry.status === "exempt") stats.exempt++;
	}
	return Array.from(dirMap.entries()).map(([directory, s]) => {
		const activeTotal = s.total - s.exempt;
		const coveragePercent = activeTotal > 0 ? Math.round((s.covered + s.degraded) / activeTotal * PERCENT_SCALE_FACTOR) / PERCENT_DECIMAL_DIVISOR : PERCENT_FULL_COVERAGE;
		return {
			directory,
			total: s.total,
			covered: s.covered,
			degraded: s.degraded,
			uncovered: s.uncovered,
			exempt: s.exempt,
			coveragePercent
		};
	}).sort((a, b) => a.directory.localeCompare(b.directory));
}
async function generateCoverageMap(options = {}) {
	const projectRoot = options.projectRoot ?? process.cwd();
	const config = await loadAuditConfig(projectRoot);
	const trackedFiles = listTrackedFiles(projectRoot);
	let runId;
	let ledgers;
	if (options.runId) {
		runId = options.runId;
		ledgers = await readCoverageLedgers(projectRoot, runId);
	} else {
		const latest = await readLatestCoverageLedgers(projectRoot);
		runId = latest.runId;
		ledgers = latest.ledgers;
	}
	const files = classifyTrackedFiles(trackedFiles, ledgers, config);
	const directories = computeDirectorySummaries(files);
	const totalTracked = files.length;
	const totalCovered = files.filter((f) => f.status === "covered").length;
	const totalDegraded = files.filter((f) => f.status === "degraded").length;
	const totalUncovered = files.filter((f) => f.status === "uncovered").length;
	const totalExempt = files.filter((f) => f.status === "exempt").length;
	const activeTotal = totalTracked - totalExempt;
	const overallCoveragePercent = activeTotal > 0 ? Math.round((totalCovered + totalDegraded) / activeTotal * PERCENT_SCALE_FACTOR) / PERCENT_DECIMAL_DIVISOR : PERCENT_FULL_COVERAGE;
	return {
		runId,
		totalTracked,
		totalCovered,
		totalDegraded,
		totalUncovered,
		totalExempt,
		overallCoveragePercent,
		directories,
		files
	};
}
function renderDirectorySummaryTable(result) {
	const columns = [
		{
			header: "DIRECTORY / MODULE",
			width: 34,
			align: "left",
			key: "directory"
		},
		{
			header: "FILES",
			width: 9,
			align: "right",
			key: "total"
		},
		{
			header: "COVERED",
			width: 10,
			align: "right",
			key: "covered"
		},
		{
			header: "DEGRADED",
			width: 11,
			align: "right",
			key: "degraded"
		},
		{
			header: "UNCOVERED",
			width: 13,
			align: "right",
			key: "uncovered"
		},
		{
			header: "COVERAGE",
			width: 10,
			align: "right",
			key: "percent"
		}
	];
	const rows = result.directories.map((d) => ({
		directory: d.directory === "." ? "(root files)" : d.directory,
		total: String(d.total),
		covered: d.covered > 0 ? styleText("green", String(d.covered)) : styleText("dim", "0"),
		degraded: d.degraded > 0 ? styleText("yellow", String(d.degraded)) : styleText("dim", "0"),
		uncovered: d.uncovered > 0 ? styleText("red", String(d.uncovered)) : styleText("dim", "0"),
		percent: d.coveragePercent === PERCENT_FULL_COVERAGE ? styleText("green", "100%") : d.coveragePercent >= WARNING_COVERAGE_THRESHOLD ? styleText("yellow", `${d.coveragePercent}%`) : styleText("red", `${d.coveragePercent}%`)
	}));
	const footerRow = {
		directory: styleText("bold", "CONSOLIDATED TOTAL"),
		total: styleText("bold", String(result.totalTracked)),
		covered: styleText("bold", String(result.totalCovered)),
		degraded: result.totalDegraded > 0 ? styleText(["bold", "yellow"], String(result.totalDegraded)) : styleText("dim", "0"),
		uncovered: result.totalUncovered > 0 ? styleText(["bold", "red"], String(result.totalUncovered)) : styleText("dim", "0"),
		percent: styleText("bold", `${result.overallCoveragePercent}%`)
	};
	return renderBoxTable(columns, rows, { footerRows: [footerRow] });
}
function renderFilesTable(files) {
	const columns = [
		{
			header: "VERSIONED FILE",
			width: 44,
			align: "left",
			key: "file"
		},
		{
			header: "STATUS",
			width: 15,
			align: "left",
			key: "status"
		},
		{
			header: "COVERING SUITES",
			width: 35,
			align: "left",
			key: "suites"
		}
	];
	const rows = files.map((f) => {
		let statusText;
		let suitesText;
		if (f.status === "covered") {
			statusText = styleText("green", "COVERED");
			suitesText = f.coveringSuites.slice(0, 3).join(", ") + (f.coveringSuites.length > 3 ? ` (+${f.coveringSuites.length - 3})` : "");
		} else if (f.status === "degraded") {
			statusText = styleText("yellow", "DEGRADED");
			const policies = f.degradedPolicies.map((p) => p.configKey).join(", ");
			suitesText = styleText("yellow", `Silenced: ${policies}`);
		} else if (f.status === "exempt") {
			statusText = styleText("cyan", "EXEMPT");
			suitesText = styleText("dim", f.exemptionReason ?? "Configured exemption");
		} else {
			statusText = styleText("red", "UNCOVERED");
			suitesText = styleText("red", "Not analyzed by any suite");
		}
		return {
			file: f.file,
			status: statusText,
			suites: suitesText
		};
	});
	const coveredCount = files.filter((f) => f.status === "covered").length;
	const uncoveredCount = files.filter((f) => f.status === "uncovered").length;
	const degradedCount = files.filter((f) => f.status === "degraded").length;
	const footerRow = {
		file: styleText("bold", "CONSOLIDATED TOTAL"),
		status: styleText("bold", `${files.length} files`),
		suites: `${styleText("green", `${coveredCount} covered`)} | ${styleText("yellow", `${degradedCount} degraded`)} | ${styleText("red", `${uncoveredCount} uncovered`)}`
	};
	return renderBoxTable(columns, rows, { footerRows: [footerRow] });
}
function renderCoverageMapCompact(result, options) {
	if (options.uncoveredOnly) {
		const uncovered = result.files.filter((f) => f.status === "uncovered");
		console.log(`[CoverageMap] Uncovered files (${uncovered.length}):`);
		for (const f of uncovered) console.log(`  [Uncovered] ${f.file}`);
		return;
	}
	if (options.degradedOnly) {
		const degraded = result.files.filter((f) => f.status === "degraded");
		console.log(`[CoverageMap] Degraded files (${degraded.length}):`);
		for (const f of degraded) {
			const policies = f.degradedPolicies.map((p) => p.configKey).join(", ");
			console.log(`  [Degraded] ${f.file} (silenced: ${policies})`);
		}
		return;
	}
	if (options.filesOnly) {
		console.log(`[CoverageMap] Files (${result.files.length}):`);
		for (const f of result.files) console.log(`  [File] ${f.file} status=${f.status} suites=${f.coveringSuites.join(",") || "none"}`);
		return;
	}
	console.log(`[CoverageMap] Directories: ${result.directories.length} | Tracked: ${result.totalTracked} | Covered: ${result.totalCovered} | Degraded: ${result.totalDegraded} | Uncovered: ${result.totalUncovered} | Coverage: ${result.overallCoveragePercent}%`);
	for (const d of result.directories) console.log(`  [Dir] ${d.directory === "." ? "(root)" : d.directory}: ${d.covered}/${d.total} covered (${d.coveragePercent}%) degraded=${d.degraded} uncovered=${d.uncovered}`);
	if (result.totalUncovered > 0) console.log(`[CoverageMap] Status: FAIL (${result.totalUncovered} uncovered files)`);
	else console.log(`[CoverageMap] Status: OK (${result.overallCoveragePercent}% coverage)`);
}
async function runCoverageMapReport(options = parseCoverageMapCliArgs()) {
	const result = await generateCoverageMap(options);
	if (options.jsonOutput) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}
	if (!isHumanConsoleMode(options)) {
		renderCoverageMapCompact(result, options);
		return;
	}
	const runSubtitle = result.runId ? `Run ID: ${result.runId}` : "No active ledgers (run npm run auditor)";
	console.log(renderBanner("AUDIT COVERAGE MAP & BLIND SPOTS", `v${AUDITOR_VERSION}  |  ${runSubtitle}`));
	if (!result.runId) {
		console.log(styleText("yellow", "\n[Warning] No coverage ledgers found in scratch/audits/coverage."));
		console.log(styleText("dim", "   Run a full audit with `npm run auditor` to record which suites scan each file.\n"));
	}
	if (options.uncoveredOnly) {
		const uncovered = result.files.filter((f) => f.status === "uncovered");
		console.log(styleText("bold", `\n[CoverageMap] Uncovered files / blind spots (${uncovered.length}):\n`));
		if (uncovered.length === 0) console.log(styleText("green", "[OK] Zero uncovered files. 100% of versioned files are covered by suites.\n"));
		else {
			console.log(renderFilesTable(uncovered));
			console.log();
		}
		return;
	}
	if (options.degradedOnly) {
		const degraded = result.files.filter((f) => f.status === "degraded");
		console.log(styleText("bold", `\n[Warning] Files with silenced / degraded rules (${degraded.length}):\n`));
		if (degraded.length === 0) console.log(styleText("green", "[OK] Zero degraded files. No silenced rules in active files.\n"));
		else {
			console.log(renderFilesTable(degraded));
			console.log();
		}
		return;
	}
	if (options.filesOnly) {
		console.log(styleText("bold", `\n[CoverageMap] Full file details (${result.files.length}):\n`));
		console.log(renderFilesTable(result.files));
		console.log();
		return;
	}
	console.log(styleText("bold", "\n[CoverageMap] Module / directory coverage summary:\n"));
	console.log(renderDirectorySummaryTable(result));
	console.log();
	if (result.totalUncovered > 0) {
		console.log(styleText("red", `[Error] Detected ${result.totalUncovered} file(s) without audit coverage.`));
		console.log(styleText("dim", "   Run `npm run auditor:coverage-map -- --uncovered` to view uncovered files.\n"));
	} else console.log(styleText("green", `[OK] Complete coverage: ${result.overallCoveragePercent}% of active files have architectural verification.\n`));
}
if (isMainModule(import.meta.url)) runCoverageMapReport().catch((err) => {
	console.error(styleText("red", `\n[Error] auditor:coverage-map failed: ${err.message}`));
	process.exit(1);
});
//#endregion
export { generateCoverageMap, parseCoverageMapCliArgs, renderDirectorySummaryTable, renderFilesTable, runCoverageMapReport };
