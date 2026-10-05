/**
 * @file testCoverageCore.ts
 * @description Core engine for test execution coverage analysis and verification.
 * Parses Istanbul/V8 coverage JSON, derives line ranges, identifies untracked source files,
 * aggregates subsystem directory metrics, and correlates complexity hotspots.
 */
import fs from 'node:fs';
import path from 'node:path';
import { matchesAnyGlob } from "./auditCoverage.js";
export const DEFAULT_TEST_COVERAGE_THRESHOLD = 80;
export const ACCEPTABLE_COVERAGE_THRESHOLD = 50;
const PERCENT_SCALE_FACTOR = 10000;
const PERCENT_DIVISOR = 100;
const RISK_SCORE_PRECISION = 10;
export function resolveCoverageFile(projectRoot, configuredPath) {
    const candidates = [
        path.resolve(projectRoot, configuredPath ?? 'coverage/coverage-final.json'),
        path.resolve(projectRoot, 'coverage/coverage-final.json'),
        path.resolve(projectRoot, 'coverage/coverage-summary.json')
    ];
    return candidates.find(f => fs.existsSync(f)) ?? null;
}
export function calculateMetric(covered, total) {
    if (total <= 0) {
        return { total: 0, covered: 0, pct: 100 };
    }
    const pct = Math.round((covered / total) * PERCENT_SCALE_FACTOR) / PERCENT_DIVISOR;
    return { total, covered, pct };
}
export function determineCoverageStatus(pct, threshold = DEFAULT_TEST_COVERAGE_THRESHOLD) {
    if (pct === 0)
        return 'untested';
    if (pct >= threshold)
        return 'excellent';
    if (pct >= ACCEPTABLE_COVERAGE_THRESHOLD)
        return 'acceptable';
    return 'low';
}
/**
 * Compresses an array of line numbers into human-readable ranges,
 * e.g. [12, 13, 14, 15, 42, 88, 89] -> ["12-15", "42", "88-89"].
 */
export function compressLineRanges(lines) {
    if (lines.length === 0)
        return [];
    const sorted = Array.from(new Set(lines)).sort((a, b) => a - b);
    const first = sorted[0];
    if (first === undefined)
        return [];
    const ranges = [];
    let start = first;
    let prev = first;
    for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i];
        if (current === prev + 1) {
            prev = current;
        }
        else {
            ranges.push(start === prev ? String(start) : `${start}-${prev}`);
            start = current;
            prev = current;
        }
    }
    ranges.push(start === prev ? String(start) : `${start}-${prev}`);
    return ranges;
}
/**
 * Extracts uncovered line ranges from Istanbul file coverage data.
 */
export function extractUncoveredLines(raw) {
    // If line hit map 'l' exists directly (common in nyc/istanbul outputs)
    if (raw.l && Object.keys(raw.l).length > 0) {
        const uncovered = Object.entries(raw.l)
            .filter(([_, count]) => count === 0)
            .map(([lineStr]) => Number(lineStr))
            .filter(n => !Number.isNaN(n));
        return compressLineRanges(uncovered);
    }
    // Derive from statementMap and hit counts 's'
    if (raw.statementMap && raw.s) {
        const coveredLines = new Set();
        const statementLines = new Map();
        for (const [id, loc] of Object.entries(raw.statementMap)) {
            const hits = raw.s[id] ?? 0;
            const startLine = loc.start?.line;
            const endLine = loc.end?.line ?? startLine;
            if (typeof startLine === 'number') {
                for (let line = startLine; line <= endLine; line++) {
                    if (hits > 0) {
                        coveredLines.add(line);
                    }
                    if (!statementLines.has(line)) {
                        statementLines.set(line, false);
                    }
                    if (hits > 0) {
                        statementLines.set(line, true);
                    }
                }
            }
        }
        const uncovered = [];
        for (const [line, wasHit] of statementLines.entries()) {
            if (!wasHit && !coveredLines.has(line)) {
                uncovered.push(line);
            }
        }
        return compressLineRanges(uncovered);
    }
    return [];
}
function parseRawCoverageItem(keyPath, raw, projectRoot, threshold) {
    const absolutePath = path.isAbsolute(keyPath) ? keyPath : path.resolve(projectRoot, keyPath);
    const relPath = path.relative(projectRoot, absolutePath).split(path.sep).join('/');
    // If already in summary format:
    if (raw.statements && raw.branches && raw.functions && raw.lines) {
        const statements = calculateMetric(raw.statements.covered, raw.statements.total);
        const branches = calculateMetric(raw.branches.covered, raw.branches.total);
        const functions = calculateMetric(raw.functions.covered, raw.functions.total);
        const lines = calculateMetric(raw.lines.covered, raw.lines.total);
        return {
            filePath: absolutePath,
            relPath,
            statements,
            branches,
            functions,
            lines,
            uncoveredLines: extractUncoveredLines(raw),
            status: determineCoverageStatus(statements.pct, threshold)
        };
    }
    // Compute from detailed Istanbul structures:
    const sTotal = Object.keys(raw.s ?? {}).length;
    const sCovered = Object.values(raw.s ?? {}).filter(c => c > 0).length;
    const statements = calculateMetric(sCovered, sTotal);
    const fTotal = Object.keys(raw.f ?? {}).length;
    const fCovered = Object.values(raw.f ?? {}).filter(c => c > 0).length;
    const functions = calculateMetric(fCovered, fTotal);
    let bTotal = 0;
    let bCovered = 0;
    for (const branchCounts of Object.values(raw.b ?? {})) {
        if (Array.isArray(branchCounts)) {
            for (const count of branchCounts) {
                bTotal++;
                if (count > 0)
                    bCovered++;
            }
        }
    }
    const branches = calculateMetric(bCovered, bTotal);
    let lTotal;
    let lCovered;
    if (raw.l && Object.keys(raw.l).length > 0) {
        lTotal = Object.keys(raw.l).length;
        lCovered = Object.values(raw.l).filter(c => c > 0).length;
    }
    else if (raw.statementMap && raw.s) {
        const linesMap = new Map();
        for (const [id, loc] of Object.entries(raw.statementMap)) {
            const hits = raw.s[id] ?? 0;
            const startLine = loc.start?.line;
            if (typeof startLine === 'number') {
                const existing = linesMap.get(startLine) ?? false;
                linesMap.set(startLine, existing || hits > 0);
            }
        }
        lTotal = linesMap.size;
        lCovered = Array.from(linesMap.values()).filter(Boolean).length;
    }
    else {
        lTotal = sTotal;
        lCovered = sCovered;
    }
    const lines = calculateMetric(lCovered, lTotal);
    return {
        filePath: absolutePath,
        relPath,
        statements,
        branches,
        functions,
        lines,
        uncoveredLines: extractUncoveredLines(raw),
        status: determineCoverageStatus(statements.pct, threshold)
    };
}
/**
 * Checks if a relative path matches an exempt glob or path pattern.
 */
export function isPathExempt(relPath, exemptGlobs) {
    if (exemptGlobs.length === 0)
        return false;
    for (const glob of exemptGlobs) {
        const cleanGlob = glob.replace(/^\.\//, '').replace(/\/$/, '');
        if (relPath === cleanGlob || relPath.startsWith(`${cleanGlob}/`)) {
            return true;
        }
    }
    return matchesAnyGlob(relPath, exemptGlobs);
}
/**
 * Parses raw Istanbul JSON into structured FileCoverageResults and overall totals.
 */
export function parseIstanbulCoverage(rawJson, projectRoot, config) {
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
        if (key === 'total' && typeof value === 'object' && value !== null) {
            // Ignore top-level 'total' key if parsing coverage-summary.json
            continue;
        }
        if (typeof value !== 'object' || value === null)
            continue;
        const fileRes = parseRawCoverageItem(key, value, projectRoot, config.threshold);
        // Apply exemptGlobs
        if (isPathExempt(fileRes.relPath, config.exemptGlobs)) {
            continue;
        }
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
    const overall = {
        statements: calculateMetric(coveredStatements, totalStatements),
        branches: calculateMetric(coveredBranches, totalBranches),
        functions: calculateMetric(coveredFunctions, totalFunctions),
        lines: calculateMetric(coveredLines, totalLines)
    };
    return { files, overall };
}
const DEFAULT_TEST_PATTERNS = [
    /\.test\.[a-z0-9]+$/i,
    /\.spec\.[a-z0-9]+$/i,
    /\.d\.ts$/i,
    /\/tests?\//i,
    /\/__tests?__\//i,
    /\/__mocks?__\//i
];
/**
 * Scans configured roots on disk and finds files that were never executed in tests.
 */
export function findUntrackedFiles(projectRoot, coveredRelPaths, config) {
    const untracked = [];
    const extensions = new Set(config.extensions.map(ext => ext.startsWith('.') ? ext : `.${ext}`));
    function walk(currentDir) {
        if (!fs.existsSync(currentDir))
            return;
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            const relPath = path.relative(projectRoot, fullPath).split(path.sep).join('/');
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'scratch') {
                    continue;
                }
                walk(fullPath);
            }
            else if (entry.isFile()) {
                const ext = path.extname(entry.name);
                if (!extensions.has(ext))
                    continue;
                if (DEFAULT_TEST_PATTERNS.some(p => p.test(relPath)))
                    continue;
                if (isPathExempt(relPath, config.exemptGlobs))
                    continue;
                if (!coveredRelPaths.has(relPath)) {
                    untracked.push(relPath);
                }
            }
        }
    }
    for (const root of config.roots) {
        const rootPath = path.isAbsolute(root) ? root : path.resolve(projectRoot, root);
        walk(rootPath);
    }
    return untracked.sort();
}
/**
 * Computes directory-level aggregated metrics from file coverage results.
 */
export function computeDirectoryBreakdown(files, _roots = ['src']) {
    const dirMap = new Map();
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
export function computeBucketCounts(files, untrackedCount, threshold = DEFAULT_TEST_COVERAGE_THRESHOLD) {
    let excellent = 0;
    let acceptable = 0;
    let low = 0;
    let untested = 0;
    for (const file of files) {
        const pct = file.statements.pct;
        if (pct === 0) {
            untested++;
        }
        else if (pct >= threshold) {
            excellent++;
        }
        else if (pct >= ACCEPTABLE_COVERAGE_THRESHOLD) {
            acceptable++;
        }
        else {
            low++;
        }
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
export function correlateComplexityHotspots(files, fileComplexityMap) {
    const hotspots = [];
    for (const file of files) {
        const complexity = fileComplexityMap.get(file.relPath) ?? 0;
        if (complexity <= 0)
            continue;
        const unreachedFactor = 1 - (file.statements.pct / PERCENT_DIVISOR);
        const riskScore = Math.round(complexity * unreachedFactor * RISK_SCORE_PRECISION) / RISK_SCORE_PRECISION;
        if (riskScore > 0) {
            hotspots.push({
                relPath: file.relPath,
                statementsPct: file.statements.pct,
                complexity,
                riskScore,
                uncoveredLines: file.uncoveredLines
            });
        }
    }
    return hotspots.sort((a, b) => b.riskScore - a.riskScore);
}
/**
 * Complete analysis orchestrator: parses JSON, identifies untracked files,
 * builds directory breakdown, computes buckets and returns full report.
 */
export function analyzeTestCoverage(rawJson, projectRoot, config, complexityMap) {
    const { files, overall } = parseIstanbulCoverage(rawJson, projectRoot, config);
    const coveredSet = new Set(files.map(f => f.relPath));
    const untrackedFiles = findUntrackedFiles(projectRoot, coveredSet, config);
    const directories = computeDirectoryBreakdown(files, config.roots);
    const buckets = computeBucketCounts(files, untrackedFiles.length, config.threshold);
    const hotspots = complexityMap ? correlateComplexityHotspots(files, complexityMap) : undefined;
    return {
        overall,
        buckets,
        directories,
        files,
        untrackedFiles,
        hotspots
    };
}
//# sourceMappingURL=testCoverageCore.js.map