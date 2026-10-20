import { matchesAnyGlob, toPosixRelative } from "./auditCoverage.js";
import "./safePath.js";
import { CANONICAL_IGNORE_DIRS, isPathIgnored } from "./auditorBase.js";
import path from "node:path";
import fs from "node:fs";
//#region src/core/testCoverageCore.ts
/**
* @file testCoverageCore.ts
* @description Core engine for test execution coverage analysis and verification.
* Parses Istanbul/V8 coverage JSON, derives line ranges, identifies untracked source files,
* aggregates subsystem directory metrics, and correlates complexity hotspots.
*/
const DEFAULT_TEST_COVERAGE_THRESHOLD = 80;
const ACCEPTABLE_COVERAGE_THRESHOLD = 50;
const PERCENT_SCALE_FACTOR = 1e4;
const PERCENT_DIVISOR = 100;
const RISK_SCORE_PRECISION = 10;
function resolveCoverageFile(projectRoot, configuredPath) {
	return [
		path.resolve(projectRoot, configuredPath ?? "scratch/coverage/coverage-final.json"),
		path.resolve(projectRoot, "scratch/coverage/coverage-final.json"),
		path.resolve(projectRoot, "scratch/coverage/coverage-summary.json"),
		path.resolve(projectRoot, "coverage/coverage-final.json"),
		path.resolve(projectRoot, "coverage/coverage-summary.json")
	].find((f) => fs.existsSync(f)) ?? null;
}
function calculateMetric(covered, total) {
	if (total <= 0) return {
		total: 0,
		covered: 0,
		pct: 100
	};
	return {
		total,
		covered,
		pct: Math.round(covered / total * PERCENT_SCALE_FACTOR) / PERCENT_DIVISOR
	};
}
function determineCoverageStatus(pct, threshold = 80) {
	if (pct === 0) return "untested";
	if (pct >= threshold) return "excellent";
	if (pct >= 50) return "acceptable";
	return "low";
}
/**
* Compresses an array of line numbers into human-readable ranges,
* e.g. [12, 13, 14, 15, 42, 88, 89] -> ["12-15", "42", "88-89"].
*/
function compressLineRanges(lines) {
	if (lines.length === 0) return [];
	const sorted = Array.from(new Set(lines)).sort((a, b) => a - b);
	const first = sorted[0];
	if (first === void 0) return [];
	const ranges = [];
	let start = first;
	let prev = first;
	for (let i = 1; i < sorted.length; i++) {
		const current = sorted[i];
		if (current === prev + 1) prev = current;
		else {
			ranges.push(start === prev ? String(start) : `${start}-${prev}`);
			start = current;
			prev = current;
		}
	}
	ranges.push(start === prev ? String(start) : `${start}-${prev}`);
	return ranges;
}
function extractFromLineMap(lineHits) {
	return compressLineRanges(Object.entries(lineHits).filter(([, count]) => count === 0).map(([lineStr]) => Number(lineStr)).filter((n) => !Number.isNaN(n)));
}
function recordStatementLines(startLine, endLine, hits, coveredLines, statementLines) {
	for (let line = startLine; line <= endLine; line++) if (hits > 0) {
		coveredLines.add(line);
		statementLines.set(line, true);
	} else if (!statementLines.has(line)) statementLines.set(line, false);
}
function extractFromStatementMap(statementMap, sHits) {
	const coveredLines = /* @__PURE__ */ new Set();
	const statementLines = /* @__PURE__ */ new Map();
	for (const [id, loc] of Object.entries(statementMap)) {
		const hits = sHits[id] ?? 0;
		const startLine = loc.start?.line;
		const endLine = loc.end?.line ?? startLine;
		if (typeof startLine === "number" && typeof endLine === "number") recordStatementLines(startLine, endLine, hits, coveredLines, statementLines);
	}
	return compressLineRanges(Array.from(statementLines.entries()).filter(([line, wasHit]) => !wasHit && !coveredLines.has(line)).map(([line]) => line));
}
/**
* Extracts uncovered line ranges from Istanbul file coverage data.
*/
function extractUncoveredLines(raw) {
	if (raw.l && Object.keys(raw.l).length > 0) return extractFromLineMap(raw.l);
	if (raw.statementMap && raw.s) return extractFromStatementMap(raw.statementMap, raw.s);
	return [];
}
function calculateBranchMetrics(rawBranches) {
	let bTotal = 0;
	let bCovered = 0;
	for (const branchCounts of Object.values(rawBranches ?? {})) if (Array.isArray(branchCounts)) for (const count of branchCounts) {
		bTotal++;
		if (count > 0) bCovered++;
	}
	return calculateMetric(bCovered, bTotal);
}
function calculateLineMetrics(raw, sTotal, sCovered) {
	if (raw.l && Object.keys(raw.l).length > 0) {
		const lTotal = Object.keys(raw.l).length;
		const lCovered = Object.values(raw.l).filter((c) => c > 0).length;
		return calculateMetric(lCovered, lTotal);
	}
	if (raw.statementMap && raw.s) {
		const linesMap = /* @__PURE__ */ new Map();
		for (const [id, loc] of Object.entries(raw.statementMap)) {
			const hits = raw.s[id] ?? 0;
			const startLine = loc.start?.line;
			if (typeof startLine === "number") {
				const existing = linesMap.get(startLine) ?? false;
				linesMap.set(startLine, existing || hits > 0);
			}
		}
		return calculateMetric(Array.from(linesMap.values()).filter(Boolean).length, linesMap.size);
	}
	return calculateMetric(sCovered, sTotal);
}
function computeDetailedMetrics(raw) {
	const sTotal = Object.keys(raw.s ?? {}).length;
	const sCovered = Object.values(raw.s ?? {}).filter((c) => c > 0).length;
	const fTotal = Object.keys(raw.f ?? {}).length;
	const fCovered = Object.values(raw.f ?? {}).filter((c) => c > 0).length;
	return {
		statements: calculateMetric(sCovered, sTotal),
		branches: calculateBranchMetrics(raw.b),
		functions: calculateMetric(fCovered, fTotal),
		lines: calculateLineMetrics(raw, sTotal, sCovered)
	};
}
function parseRawCoverageItem(keyPath, raw, projectRoot, threshold) {
	const absolutePath = path.isAbsolute(keyPath) ? keyPath : path.resolve(projectRoot, keyPath);
	const relPath = toPosixRelative(projectRoot, absolutePath);
	if (raw.statements && raw.branches && raw.functions && raw.lines) {
		const statements = calculateMetric(raw.statements.covered, raw.statements.total);
		return {
			filePath: absolutePath,
			relPath,
			statements,
			branches: calculateMetric(raw.branches.covered, raw.branches.total),
			functions: calculateMetric(raw.functions.covered, raw.functions.total),
			lines: calculateMetric(raw.lines.covered, raw.lines.total),
			uncoveredLines: extractUncoveredLines(raw),
			status: determineCoverageStatus(statements.pct, threshold)
		};
	}
	const metrics = computeDetailedMetrics(raw);
	return {
		filePath: absolutePath,
		relPath,
		...metrics,
		uncoveredLines: extractUncoveredLines(raw),
		status: determineCoverageStatus(metrics.statements.pct, threshold)
	};
}
/**
* Checks if a relative path matches an exempt glob or path pattern.
*/
function isPathExempt(relPath, exemptGlobs) {
	if (exemptGlobs.length === 0) return false;
	for (const glob of exemptGlobs) {
		let cleanGlob = glob.startsWith("./") ? glob.slice(2) : glob;
		if (cleanGlob.endsWith("/")) cleanGlob = cleanGlob.slice(0, -1);
		if (relPath === cleanGlob || relPath.startsWith(`${cleanGlob}/`)) return true;
	}
	return matchesAnyGlob(relPath, exemptGlobs);
}
/**
* Parses raw Istanbul JSON into structured FileCoverageResults and overall totals.
*/
function parseIstanbulCoverage(rawJson, projectRoot, config) {
	const files = [];
	let totalStatements = 0;
	let coveredStatements = 0;
	let totalBranches = 0;
	let coveredBranches = 0;
	let totalFunctions = 0;
	let coveredFunctions = 0;
	let totalLines = 0;
	let coveredLines = 0;
	for (const [key, value] of Object.entries(rawJson)) {
		if (key === "total" && typeof value === "object" && value !== null) continue;
		if (typeof value !== "object" || value === null) continue;
		const fileRes = parseRawCoverageItem(key, value, projectRoot, config.threshold);
		if (isPathExempt(fileRes.relPath, config.exemptGlobs)) continue;
		files.push(fileRes);
		totalStatements += fileRes.statements.total;
		coveredStatements += fileRes.statements.covered;
		totalBranches += fileRes.branches.total;
		coveredBranches += fileRes.branches.covered;
		totalFunctions += fileRes.functions.total;
		coveredFunctions += fileRes.functions.covered;
		totalLines += fileRes.lines.total;
		coveredLines += fileRes.lines.covered;
	}
	return {
		files,
		overall: {
			statements: calculateMetric(coveredStatements, totalStatements),
			branches: calculateMetric(coveredBranches, totalBranches),
			functions: calculateMetric(coveredFunctions, totalFunctions),
			lines: calculateMetric(coveredLines, totalLines)
		}
	};
}
const DEFAULT_TEST_PATTERNS = [
	/\.test\.[a-z0-9]+$/i,
	/\.spec\.[a-z0-9]+$/i,
	/\.d\.ts$/i,
	/\/tests?\//i,
	/\/__tests?__\//i,
	/\/__mocks?__\//i
];
const IGNORED_COVERAGE_DIRS = /* @__PURE__ */ new Set([
	"node_modules",
	".git",
	"dist",
	"scratch"
]);
function isUntrackedCandidate(relPath, fileName, extensions, exemptGlobs, projectRoot) {
	const ext = path.extname(fileName);
	if (!extensions.has(ext)) return false;
	if (DEFAULT_TEST_PATTERNS.some((p) => p.test(relPath))) return false;
	if (isPathIgnored(relPath, exemptGlobs, [], projectRoot)) return false;
	return !isPathExempt(relPath, exemptGlobs);
}
/**
* Scans configured roots on disk and finds files that were never executed in tests.
*/
function findUntrackedFiles(projectRoot, coveredRelPaths, config) {
	const untracked = [];
	const extensions = new Set(config.extensions.map((ext) => ext.startsWith(".") ? ext : `.${ext}`));
	function walk(currentDir) {
		if (!fs.existsSync(currentDir)) return;
		const entries = fs.readdirSync(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(currentDir, entry.name);
			const relPath = toPosixRelative(projectRoot, fullPath);
			if (entry.isDirectory()) {
				if (!IGNORED_COVERAGE_DIRS.has(entry.name) && !CANONICAL_IGNORE_DIRS.has(entry.name) && !isPathIgnored(relPath, config.exemptGlobs, [], projectRoot)) walk(fullPath);
			} else if (entry.isFile() && isUntrackedCandidate(relPath, entry.name, extensions, config.exemptGlobs, projectRoot)) {
				if (!coveredRelPaths.has(relPath)) untracked.push(relPath);
			}
		}
	}
	for (const root of config.roots) walk(path.isAbsolute(root) ? root : path.resolve(projectRoot, root));
	return untracked.sort();
}
/**
* Computes directory-level aggregated metrics from file coverage results.
*/
function computeDirectoryBreakdown(files, _roots = ["src"]) {
	const dirMap = /* @__PURE__ */ new Map();
	for (const file of files) {
		const dir = path.posix.dirname(file.relPath);
		let agg = dirMap.get(dir);
		if (!agg) {
			agg = {
				fileCount: 0,
				sCovered: 0,
				sTotal: 0,
				bCovered: 0,
				bTotal: 0,
				fCovered: 0,
				fTotal: 0,
				lCovered: 0,
				lTotal: 0
			};
			dirMap.set(dir, agg);
		}
		agg.fileCount++;
		agg.sCovered += file.statements.covered;
		agg.sTotal += file.statements.total;
		agg.bCovered += file.branches.covered;
		agg.bTotal += file.branches.total;
		agg.fCovered += file.functions.covered;
		agg.fTotal += file.functions.total;
		agg.lCovered += file.lines.covered;
		agg.lTotal += file.lines.total;
	}
	const summaries = [];
	for (const [directory, agg] of dirMap.entries()) {
		const statements = calculateMetric(agg.sCovered, agg.sTotal);
		const branches = calculateMetric(agg.bCovered, agg.bTotal);
		const functions = calculateMetric(agg.fCovered, agg.fTotal);
		const lines = calculateMetric(agg.lCovered, agg.lTotal);
		summaries.push({
			directory,
			fileCount: agg.fileCount,
			statements,
			branches,
			functions,
			lines,
			status: determineCoverageStatus(statements.pct)
		});
	}
	return summaries.sort((a, b) => a.directory.localeCompare(b.directory));
}
/**
* Counts files across coverage buckets:
* - excellent (>= threshold)
* - acceptable (50 - threshold-1%)
* - low (1 - 49%)
* - untested (0%)
* - untracked (files on disk not in coverage json)
*/
function computeBucketCounts(files, untrackedCount, threshold = 80) {
	let excellent = 0;
	let acceptable = 0;
	let low = 0;
	let untested = 0;
	for (const file of files) {
		const pct = file.statements.pct;
		if (pct === 0) untested++;
		else if (pct >= threshold) excellent++;
		else if (pct >= 50) acceptable++;
		else low++;
	}
	return {
		excellent,
		acceptable,
		low,
		untested,
		untracked: untrackedCount
	};
}
/**
* Correlates file coverage with Fallow cognitive complexity hotspots.
* Risk score = Complexity * (1 - CoveragePct / 100).
*/
function correlateComplexityHotspots(files, fileComplexityMap) {
	const hotspots = [];
	for (const file of files) {
		const complexity = fileComplexityMap.get(file.relPath) ?? 0;
		if (complexity <= 0) continue;
		const unreachedFactor = 1 - file.statements.pct / PERCENT_DIVISOR;
		const riskScore = Math.round(complexity * unreachedFactor * RISK_SCORE_PRECISION) / RISK_SCORE_PRECISION;
		if (riskScore > 0) hotspots.push({
			relPath: file.relPath,
			statementsPct: file.statements.pct,
			complexity,
			riskScore,
			uncoveredLines: file.uncoveredLines
		});
	}
	return hotspots.sort((a, b) => b.riskScore - a.riskScore);
}
/**
* Complete analysis orchestrator: parses JSON, identifies untracked files,
* builds directory breakdown, computes buckets and returns full report.
*/
function analyzeTestCoverage(rawJson, projectRoot, config, complexityMap) {
	const { files, overall } = parseIstanbulCoverage(rawJson, projectRoot, config);
	const untrackedFiles = findUntrackedFiles(projectRoot, new Set(files.map((f) => f.relPath)), config);
	const directories = computeDirectoryBreakdown(files, config.roots);
	return {
		overall,
		buckets: computeBucketCounts(files, untrackedFiles.length, config.threshold),
		directories,
		files,
		untrackedFiles,
		hotspots: complexityMap ? correlateComplexityHotspots(files, complexityMap) : void 0
	};
}
//#endregion
export { ACCEPTABLE_COVERAGE_THRESHOLD, DEFAULT_TEST_COVERAGE_THRESHOLD, analyzeTestCoverage, calculateMetric, compressLineRanges, computeBucketCounts, computeDirectoryBreakdown, correlateComplexityHotspots, determineCoverageStatus, extractUncoveredLines, findUntrackedFiles, isPathExempt, parseIstanbulCoverage, resolveCoverageFile };
