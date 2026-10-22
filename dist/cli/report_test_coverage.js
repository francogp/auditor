#!/usr/bin/env -S node --experimental-strip-types
import { AUDITOR_VERSION } from "../core/version.js";
import { tryCatchSync } from "../core/safeUtils.js";
import { parseJsonObjectOutput } from "../core/reportUtils.js";
import { buildTestCoverageConfig } from "../core/auditConfigBuilders.js";
import { getAuditConfig } from "../core/auditConfigLoader.js";
import "../core/auditConfig.js";
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs, resolveHumanModeFromArgs } from "../core/cli/cittyHarness.js";
import "../core/permissionGuard.js";
import { toPosixRelative } from "../core/auditCoverage.js";
import { isPathContained } from "../core/safePath.js";
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES, isHumanConsoleMode, isMainModule, resolvePackageBin } from "./cliUtils.js";
import { analyzeTestCoverage, resolveCoverageFile } from "../core/testCoverageCore.js";
import path from "node:path";
import fs from "node:fs";
import { styleText } from "node:util";
import { execSync, spawnSync } from "node:child_process";
//#region src/cli/report_test_coverage.ts
/**
* @file report_test_coverage.ts
* @description AUDITOR TEST COVERAGE CLI (Node.js 26+)
* Canonical test execution coverage reporting, analysis, and verification tool.
* Evaluates Istanbul/V8 coverage JSON, aggregates directory metrics, detects untracked files,
* displays uncovered line ranges, and gates pull requests / commits.
*/
const RADIX_DECIMAL = 10;
const DEFAULT_TOP_LIMIT = 20;
const DIR_COL_WIDTH = 24;
const ARCH_COL_WIDTH = 5;
const STATS_COL_WIDTH = 8;
const FILE_COL_WIDTH = 36;
const STATS_SHORT_WIDTH = 7;
const UNCOVERED_COL_WIDTH = 17;
const UNCOVERED_MAX_CHARS = 14;
const HOTSPOT_FILE_WIDTH = 32;
const COMPLEXITY_COL_WIDTH = 11;
const UNTRACKED_FILE_WIDTH = 56;
const BADGE_COL_WIDTH = 10;
const TEST_COVERAGE_ARGS = {
	...COMMON_CLI_ARGS,
	run: {
		type: "boolean",
		default: false,
		description: "Run test suite with coverage first"
	},
	check: {
		type: "boolean",
		default: false,
		description: "Enforce coverage threshold gate"
	},
	threshold: {
		type: "string",
		description: "Target coverage percentage (0-100)"
	},
	min: {
		type: "string",
		description: "Alias for threshold"
	},
	dir: {
		type: "string",
		description: "Filter by directory prefix"
	},
	file: {
		type: "string",
		description: "Drill down into a specific file"
	},
	below: {
		type: "boolean",
		default: false,
		description: "Show only files below threshold"
	},
	zero: {
		type: "boolean",
		default: false,
		description: "Show only files with 0% coverage"
	},
	untracked: {
		type: "boolean",
		default: false,
		description: "Show untracked source files"
	},
	hotspots: {
		type: "boolean",
		default: false,
		description: "Show high-complexity low-coverage hotspots"
	},
	top: {
		type: "string",
		default: "20",
		description: "Maximum rows to display"
	}
};
const TEST_COVERAGE_BARE_BOOLEANS = /* @__PURE__ */ new Set([
	"run",
	"check",
	"below",
	"zero",
	"untracked",
	"hotspots"
]);
function parseCommandLineArgs() {
	const parsed = parseCittyArgs(TEST_COVERAGE_ARGS, getProcessCliArgs(), TEST_COVERAGE_BARE_BOOLEANS);
	const thresholdRaw = parsed.threshold ?? parsed.min;
	const threshold = typeof thresholdRaw === "string" && thresholdRaw.length > 0 ? parseInt(thresholdRaw, RADIX_DECIMAL) : void 0;
	const topLimit = parseInt(String(parsed.top || "20"), RADIX_DECIMAL) || DEFAULT_TOP_LIMIT;
	return {
		run: Boolean(parsed.run),
		check: Boolean(parsed.check),
		threshold: threshold !== void 0 && !Number.isNaN(threshold) ? threshold : void 0,
		dirFilter: typeof parsed.dir === "string" ? parsed.dir : void 0,
		fileFilter: typeof parsed.file === "string" ? parsed.file : void 0,
		belowOnly: Boolean(parsed.below),
		zeroOnly: Boolean(parsed.zero),
		untrackedOnly: Boolean(parsed.untracked),
		hotspotsOnly: Boolean(parsed.hotspots),
		topLimit,
		jsonOutput: Boolean(parsed.json),
		human: resolveHumanModeFromArgs(parsed),
		help: Boolean(parsed.help)
	};
}
function printUsage() {
	console.log(`
${styleText("bold", "AUDITOR TEST COVERAGE CLI")} - v${AUDITOR_VERSION}
Canonical test coverage reporting and verification tool.

${styleText("bold", "USAGE:")}
  auditor-test-coverage [OPTIONS]
  npm run auditor:test-coverage [-- OPTIONS]

${styleText("bold", "OPTIONS:")}
  --run              Runs test runner with coverage prior to analysis ('npm test -- --coverage').
  --check            Verifies that coverage meets target threshold; exits with code 1 on failure.
  --threshold=<N>    Target coverage percentage (0-100, e.g. 80). Alias: --min=<N>.
  --dir=<path>       Filter files and metrics by directory prefix (e.g. src/core).
  --file=<path>      Displays detailed metrics and uncovered lines for a specific file.
  --below            Shows only files whose coverage is below the threshold.
  --zero             Shows only files with 0% coverage.
  --untracked        Shows files on disk not executed by any test.
  --hotspots         Shows correlation between cyclomatic/cognitive complexity and low coverage.
  --top=<N>          Maximum rows to display in lists (default: 20).
  --human            Renders formatted Box-Drawing tables and visual dashboards.
  --json             Emits full coverage report in JSON format.
  -h, --help         Shows this help message.
`);
}
function loadFallowComplexityMap(projectRoot) {
	const complexityMap = /* @__PURE__ */ new Map();
	tryCatchSync(() => {
		const fallowBin = resolvePackageBin("fallow", { projectRoot });
		if (!fallowBin) return;
		const cmd = `node "${fallowBin}" health --format json`;
		const stdout = execSync(cmd, {
			cwd: projectRoot,
			encoding: "utf8",
			stdio: [
				"pipe",
				"pipe",
				"ignore"
			],
			maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
		});
		const data = parseJsonObjectOutput(stdout);
		if (data?.findings && Array.isArray(data.findings)) for (const finding of data.findings) {
			if (!finding.path) continue;
			const relPath = toPosixRelative(projectRoot, finding.path);
			const cog = finding.cognitive ?? 0;
			const cyc = finding.cyclomatic ?? 0;
			const current = complexityMap.get(relPath) ?? 0;
			complexityMap.set(relPath, current + Math.max(cog, cyc));
		}
	});
	return complexityMap;
}
function formatPct(pct) {
	if (pct >= 80) return styleText("green", `${pct}%`);
	if (pct >= 50) return styleText("yellow", `${pct}%`);
	if (pct > 0) return styleText("red", `${pct}%`);
	return styleText("dim", "0%");
}
function renderDirectoriesTable(directories, overall) {
	const columns = [
		{
			header: "DIRECTORY / SUBSYSTEM",
			width: DIR_COL_WIDTH,
			align: "left",
			key: "dir"
		},
		{
			header: "FILES",
			width: ARCH_COL_WIDTH,
			align: "right",
			key: "files"
		},
		{
			header: "STMTS %",
			width: STATS_COL_WIDTH,
			align: "right",
			key: "stmts"
		},
		{
			header: "BRANCHES %",
			width: STATS_COL_WIDTH,
			align: "right",
			key: "branches"
		},
		{
			header: "FUNCS %",
			width: STATS_COL_WIDTH,
			align: "right",
			key: "funcs"
		},
		{
			header: "LINES %",
			width: STATS_COL_WIDTH,
			align: "right",
			key: "lines"
		}
	];
	const rows = directories.map((d) => ({
		dir: d.directory.length > DIR_COL_WIDTH ? d.directory.slice(0, 23) + "…" : d.directory,
		files: String(d.fileCount),
		stmts: formatPct(d.statements.pct),
		branches: formatPct(d.branches.pct),
		funcs: formatPct(d.functions.pct),
		lines: formatPct(d.lines.pct)
	}));
	const totalFiles = directories.reduce((acc, d) => acc + d.fileCount, 0);
	const footerRow = {
		dir: styleText("bold", "CONSOLIDATED TOTAL"),
		files: styleText("bold", String(totalFiles)),
		stmts: formatPct(overall.statements.pct),
		branches: formatPct(overall.branches.pct),
		funcs: formatPct(overall.functions.pct),
		lines: formatPct(overall.lines.pct)
	};
	return renderBoxTable(columns, rows, {
		footerRows: [footerRow],
		emptyMessage: "No directories found with coverage data."
	});
}
function renderFilesTable(files, topLimit) {
	const columns = [
		{
			header: "FILE",
			width: FILE_COL_WIDTH,
			align: "left",
			key: "file"
		},
		{
			header: "STMTS",
			width: STATS_SHORT_WIDTH,
			align: "right",
			key: "stmts"
		},
		{
			header: "LINES",
			width: STATS_SHORT_WIDTH,
			align: "right",
			key: "lines"
		},
		{
			header: "UNCOVERED",
			width: UNCOVERED_COL_WIDTH,
			align: "left",
			key: "uncovered"
		}
	];
	const rows = files.slice(0, topLimit).map((f) => {
		const uncovStr = f.uncoveredLines.join(", ");
		const displayUncov = uncovStr.length > UNCOVERED_COL_WIDTH ? `${uncovStr.slice(0, UNCOVERED_MAX_CHARS)}...` : uncovStr;
		return {
			file: f.relPath.length > FILE_COL_WIDTH ? `...${f.relPath.slice(-33)}` : f.relPath,
			stmts: formatPct(f.statements.pct),
			lines: formatPct(f.lines.pct),
			uncovered: displayUncov || styleText("green", "none")
		};
	});
	return renderBoxTable(columns, rows, { emptyMessage: "No files match the specified filter." });
}
function renderHotspotsTable(hotspots, topLimit) {
	const columns = [
		{
			header: "FILE",
			width: HOTSPOT_FILE_WIDTH,
			align: "left",
			key: "file"
		},
		{
			header: "COMPLEXITY",
			width: COMPLEXITY_COL_WIDTH,
			align: "right",
			key: "complexity"
		},
		{
			header: "STMTS %",
			width: STATS_COL_WIDTH,
			align: "right",
			key: "stmts"
		},
		{
			header: "RISK",
			width: STATS_COL_WIDTH,
			align: "right",
			key: "risk"
		}
	];
	const rows = hotspots.slice(0, topLimit).map((h) => {
		return {
			file: h.relPath.length > HOTSPOT_FILE_WIDTH ? `...${h.relPath.slice(-29)}` : h.relPath,
			complexity: styleText("yellow", String(h.complexity)),
			stmts: styleText("red", `${h.statementsPct}%`),
			risk: styleText(["bold", "red"], String(h.riskScore))
		};
	});
	return renderBoxTable(columns, rows, { emptyMessage: "No untested complexity hotspots detected." });
}
function renderUntrackedTable(untracked, topLimit) {
	const columns = [{
		header: "UNTRACKED FILE IN TESTS",
		width: UNTRACKED_FILE_WIDTH,
		align: "left",
		key: "file"
	}, {
		header: "STATUS",
		width: BADGE_COL_WIDTH,
		align: "center",
		key: "status"
	}];
	const rows = untracked.slice(0, topLimit).map((file) => {
		return {
			file: file.length > UNTRACKED_FILE_WIDTH ? `...${file.slice(-53)}` : file,
			status: styleText(["bold", "red"], "UNTESTED")
		};
	});
	return renderBoxTable(columns, rows, { emptyMessage: "All source files are executed by tests." });
}
function renderFileDrillDown(report, fileFilter) {
	const targetFile = fileFilter.replace(/^\.\//, "");
	const found = report.files.find((f) => f.relPath === targetFile || f.relPath.endsWith(targetFile));
	if (!found) {
		console.log(styleText("yellow", `\n[Warning] No coverage found for file '${fileFilter}'.`));
		return false;
	}
	console.log(styleText("bold", `\n[Coverage] File details: ${found.relPath}\n`));
	console.log(`  • Statements: ${found.statements.pct}% (${found.statements.covered}/${found.statements.total})`);
	console.log(`  • Branches:   ${found.branches.pct}% (${found.branches.covered}/${found.branches.total})`);
	console.log(`  • Functions:  ${found.functions.pct}% (${found.functions.covered}/${found.functions.total})`);
	console.log(`  • Lines:      ${found.lines.pct}% (${found.lines.covered}/${found.lines.total})`);
	if (found.uncoveredLines.length > 0) console.log(styleText("red", `\n  [FAIL] Uncovered lines: ${found.uncoveredLines.join(", ")}`));
	else console.log(styleText("green", `\n  [OK] 100% of lines covered by tests.`));
	console.log();
	return true;
}
function renderUntrackedView(untrackedFiles, topLimit) {
	console.log(styleText("bold", `\n[Coverage] UNTRACKED FILES ON DISK (${untrackedFiles.length}):\n`));
	console.log(renderUntrackedTable(untrackedFiles, topLimit));
	if (untrackedFiles.length > topLimit) console.log(styleText("dim", `   ... and ${untrackedFiles.length - topLimit} more files (use --top=${untrackedFiles.length} to view all).`));
	console.log();
}
function renderHotspotsView(hotspots, topLimit) {
	console.log(styleText("bold", `\n[Coverage] RISK HOTSPOTS (Fallow Complexity + Low Coverage) (${hotspots.length}):\n`));
	console.log(renderHotspotsTable(hotspots, topLimit));
	if (hotspots.length > topLimit) console.log(styleText("dim", `   ... and ${hotspots.length - topLimit} more hotspots.`));
	console.log();
}
function renderFilteredFilesView(files, args, effectiveThreshold) {
	let filtered = files;
	if (args.zeroOnly) {
		filtered = filtered.filter((f) => f.statements.pct === 0);
		console.log(styleText("bold", `\n[Coverage] FILES WITH 0% COVERAGE (${filtered.length}):\n`));
	} else {
		filtered = filtered.filter((f) => f.statements.pct < effectiveThreshold);
		console.log(styleText("bold", `\n[Warning] FILES BELOW THRESHOLD (${effectiveThreshold}%) (${filtered.length}):\n`));
	}
	if (args.dirFilter) {
		const filterAbs = path.resolve(process.cwd(), args.dirFilter);
		filtered = filtered.filter((f) => {
			const fileAbs = path.resolve(process.cwd(), f.relPath);
			return isPathContained(filterAbs, fileAbs) || f.relPath === args.dirFilter;
		});
	}
	console.log(renderFilesTable(filtered, args.topLimit));
	if (filtered.length > args.topLimit) console.log(styleText("dim", `   ... and ${filtered.length - args.topLimit} more files (use --top=${filtered.length} to view all).`));
	console.log();
}
function renderGlobalCoverageSummary(report, args, effectiveThreshold) {
	const o = report.overall;
	const b = report.buckets;
	console.log(`
${styleText("bold", "GLOBAL COVERAGE METRICS:")}
  Statements: ${o.statements.pct >= effectiveThreshold ? styleText("green", `${o.statements.pct}%`) : styleText("red", `${o.statements.pct}%`)} (${o.statements.covered}/${o.statements.total})
  Branches:   ${o.branches.pct >= effectiveThreshold ? styleText("green", `${o.branches.pct}%`) : styleText("yellow", `${o.branches.pct}%`)} (${o.branches.covered}/${o.branches.total})
  Functions:  ${o.functions.pct >= effectiveThreshold ? styleText("green", `${o.functions.pct}%`) : styleText("yellow", `${o.functions.pct}%`)} (${o.functions.covered}/${o.functions.total})
  Lines:      ${o.lines.pct >= effectiveThreshold ? styleText("green", `${o.lines.pct}%`) : styleText("red", `${o.lines.pct}%`)} (${o.lines.covered}/${o.lines.total})

${styleText("bold", "FILE DISTRIBUTION:")}
  [PASS] Excellent (>= ${effectiveThreshold}%): ${styleText("green", String(b.excellent))}
  [WARN] Acceptable (50-${effectiveThreshold - 1}%): ${styleText("yellow", String(b.acceptable))}
  [FAIL] Low (< 50%):         ${styleText("red", String(b.low))}
  [INFO] Untested (0%):       ${styleText("dim", String(b.untested))}
  [WARN] Untracked:           ${b.untracked > 0 ? styleText(["bold", "yellow"], String(b.untracked)) : styleText("green", "0")}
`);
	let dirs = report.directories;
	if (args.dirFilter) {
		const filterAbs = path.resolve(process.cwd(), args.dirFilter);
		dirs = dirs.filter((d) => {
			const dirAbs = path.resolve(process.cwd(), d.directory);
			return isPathContained(filterAbs, dirAbs) || d.directory === args.dirFilter;
		});
	}
	console.log(styleText("bold", "BREAKDOWN BY DIRECTORY / SUBSYSTEM:\n"));
	console.log(renderDirectoriesTable(dirs, report.overall));
	console.log();
	if (report.hotspots && report.hotspots.length > 0) {
		const topHotspot = report.hotspots[0];
		console.log(styleText("yellow", `[Notice] There are ${report.hotspots.length} file(s) with high complexity and low coverage.`));
		console.log(styleText("dim", `   Run 'npm run auditor:test-coverage -- --hotspots' to inspect risk hotspots (Top: ${topHotspot.relPath}).\n`));
	}
}
function runTestRunnerIfRequested(shouldRun, runCommand, projectRoot) {
	if (!shouldRun) return;
	console.log(styleText("cyan", `\n[Notice] Running test coverage: '${runCommand}'...\n`));
	const res = spawnSync(runCommand, {
		cwd: projectRoot,
		stdio: "inherit",
		shell: true
	});
	if (res.status !== 0) {
		console.error(styleText("red", `\n[FAIL] Test runner exited with code ${res.status}.`));
		process.exit(res.status ?? 1);
	}
}
function loadCoveragePayloadOrExit(projectRoot, configPath) {
	const coverageFile = resolveCoverageFile(projectRoot, configPath);
	if (!coverageFile) {
		console.error(styleText("red", `\n[FAIL] Coverage file not found at '${configPath}'.`));
		console.log(styleText("yellow", "   Run tests with coverage first:"));
		console.log(styleText("bold", `   npm run auditor:test-coverage -- --run\n`));
		process.exit(1);
	}
	return JSON.parse(fs.readFileSync(coverageFile, "utf8"));
}
function renderSpecificCoverageView(report, args, effectiveThreshold) {
	if (args.fileFilter) {
		renderFileDrillDown(report, args.fileFilter);
		return true;
	}
	if (args.untrackedOnly) {
		renderUntrackedView(report.untrackedFiles, args.topLimit);
		return true;
	}
	if (args.hotspotsOnly) {
		renderHotspotsView(report.hotspots ?? [], args.topLimit);
		return true;
	}
	if (args.belowOnly || args.zeroOnly) {
		renderFilteredFilesView(report.files, args, effectiveThreshold);
		return true;
	}
	return false;
}
function evaluateCoverageQualityGate(report, effectiveThreshold) {
	if (report.overall.statements.pct < effectiveThreshold) {
		console.error(styleText(["bold", "red"], `[FAIL] QUALITY GATE FAILED: Global statement coverage (${report.overall.statements.pct}%) is below configured threshold (${effectiveThreshold}%).`));
		process.exit(1);
	}
	console.log(styleText(["bold", "green"], `[PASS] QUALITY GATE PASSED: Coverage (${report.overall.statements.pct}%) >= ${effectiveThreshold}%.`));
}
function renderTestCoverageCompact(report, args, effectiveThreshold) {
	if (args.fileFilter) {
		renderFileDrillDown(report, args.fileFilter);
		return;
	}
	if (args.untrackedOnly) {
		console.log(`[Coverage] Untracked files (${report.untrackedFiles.length}):`);
		for (const f of report.untrackedFiles.slice(0, args.topLimit)) console.log(`  [Untracked] ${f}`);
		return;
	}
	if (args.hotspotsOnly) {
		console.log(`[Coverage] Hotspots (${(report.hotspots ?? []).length}):`);
		for (const h of (report.hotspots ?? []).slice(0, args.topLimit)) console.log(`  [Hotspot] ${h.relPath} complexity=${h.complexity} stmts=${h.statementsPct}% risk=${h.riskScore}`);
		return;
	}
	if (args.zeroOnly) {
		const zeros = report.files.filter((f) => f.statements.pct === 0);
		console.log(`[Coverage] Zero coverage files (${zeros.length}):`);
		for (const f of zeros.slice(0, args.topLimit)) console.log(`  [Zero] ${f.relPath}`);
		return;
	}
	if (args.belowOnly) {
		const below = report.files.filter((f) => f.statements.pct < effectiveThreshold);
		console.log(`[Coverage] Files below threshold ${effectiveThreshold}% (${below.length}):`);
		for (const f of below.slice(0, args.topLimit)) console.log(`  [Below] ${f.relPath} stmts=${f.statements.pct}% lines=${f.lines.pct}%`);
		return;
	}
	console.log(`[Coverage] Statements: ${report.overall.statements.pct}% (${report.overall.statements.covered}/${report.overall.statements.total}) | Branches: ${report.overall.branches.pct}% | Functions: ${report.overall.functions.pct}% | Lines: ${report.overall.lines.pct}% (Threshold: ${effectiveThreshold}%)`);
	console.log(`[Coverage] Files: ${report.files.length} | Untracked: ${report.untrackedFiles.length} | Excellent: ${report.buckets.excellent} | Acceptable: ${report.buckets.acceptable} | Low: ${report.buckets.low} | Untested: ${report.buckets.untested}`);
	for (const d of report.directories) console.log(`  [Dir] ${d.directory}: ${d.statements.pct}% stmts, ${d.lines.pct}% lines (${d.fileCount} files)`);
}
async function runTestCoverageReport() {
	const args = parseCommandLineArgs();
	if (args.help) {
		printUsage();
		return;
	}
	const projectRoot = process.cwd();
	const config = getAuditConfig();
	const resolvedConfig = buildTestCoverageConfig(config.testCoverage);
	const effectiveThreshold = args.threshold ?? resolvedConfig.threshold;
	runTestRunnerIfRequested(args.run, resolvedConfig.runCommand, projectRoot);
	const rawJson = loadCoveragePayloadOrExit(projectRoot, resolvedConfig.path);
	const complexityMap = args.hotspotsOnly || !args.jsonOutput ? loadFallowComplexityMap(projectRoot) : void 0;
	const report = analyzeTestCoverage(rawJson, projectRoot, {
		...resolvedConfig,
		threshold: effectiveThreshold
	}, complexityMap);
	if (args.jsonOutput) {
		console.log(JSON.stringify(report, null, 2));
		if (args.check && report.overall.statements.pct < effectiveThreshold) process.exit(1);
		return;
	}
	if (!isHumanConsoleMode(args)) {
		renderTestCoverageCompact(report, args, effectiveThreshold);
		if (args.check) evaluateCoverageQualityGate(report, effectiveThreshold);
		return;
	}
	console.log(renderBanner("TEST COVERAGE REPORT", `v${AUDITOR_VERSION}  |  Vitest & Istanbul Analytics`));
	if (!renderSpecificCoverageView(report, args, effectiveThreshold)) renderGlobalCoverageSummary(report, args, effectiveThreshold);
	if (args.check) evaluateCoverageQualityGate(report, effectiveThreshold);
}
if (isMainModule(import.meta.url)) runTestCoverageReport().catch((err) => {
	console.error(styleText("red", `\n[Error] auditor-test-coverage failed: ${err.message}`));
	process.exit(1);
});
//#endregion
export { runTestCoverageReport };
