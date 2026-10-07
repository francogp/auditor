/**
 * @file testCoverageCore.ts
 * @description Core engine for test execution coverage analysis and verification.
 * Parses Istanbul/V8 coverage JSON, derives line ranges, identifies untracked source files,
 * aggregates subsystem directory metrics, and correlates complexity hotspots.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { AuditTestCoverageConfig } from './auditConfig.ts';
import { matchesAnyGlob } from './auditCoverage.ts';

export type CoverageStatus = 'excellent' | 'acceptable' | 'low' | 'untested';

export interface CoverageMetric {
  readonly total: number;
  readonly covered: number;
  readonly pct: number;
}

export interface FileCoverageResult {
  readonly filePath: string;
  readonly relPath: string;
  readonly statements: CoverageMetric;
  readonly branches: CoverageMetric;
  readonly functions: CoverageMetric;
  readonly lines: CoverageMetric;
  readonly uncoveredLines: readonly string[];
  readonly status: CoverageStatus;
  readonly isUntracked?: boolean;
}

export interface DirectoryCoverageSummary {
  readonly directory: string;
  readonly fileCount: number;
  readonly statements: CoverageMetric;
  readonly branches: CoverageMetric;
  readonly functions: CoverageMetric;
  readonly lines: CoverageMetric;
  readonly status: CoverageStatus;
}

export interface CoverageBucketCounts {
  readonly excellent: number;
  readonly acceptable: number;
  readonly low: number;
  readonly untested: number;
  readonly untracked: number;
}

export interface CoverageHotspot {
  readonly relPath: string;
  readonly statementsPct: number;
  readonly complexity: number;
  readonly riskScore: number;
  readonly uncoveredLines: readonly string[];
}

export interface TestCoverageReport {
  readonly overall: {
    readonly statements: CoverageMetric;
    readonly branches: CoverageMetric;
    readonly functions: CoverageMetric;
    readonly lines: CoverageMetric;
  };
  readonly buckets: CoverageBucketCounts;
  readonly directories: readonly DirectoryCoverageSummary[];
  readonly files: readonly FileCoverageResult[];
  readonly untrackedFiles: readonly string[];
  readonly hotspots?: readonly CoverageHotspot[];
}

export const DEFAULT_TEST_COVERAGE_THRESHOLD = 80 as const;
export const ACCEPTABLE_COVERAGE_THRESHOLD = 50 as const;
const PERCENT_SCALE_FACTOR = 10000 as const;
const PERCENT_DIVISOR = 100 as const;
const RISK_SCORE_PRECISION = 10 as const;

export function resolveCoverageFile(projectRoot: string, configuredPath?: string): string | null {
  const candidates = [
    path.resolve(projectRoot, configuredPath ?? 'coverage/coverage-final.json'),
    path.resolve(projectRoot, 'coverage/coverage-final.json'),
    path.resolve(projectRoot, 'coverage/coverage-summary.json')
  ];
  return candidates.find(f => fs.existsSync(f)) ?? null;
}

export function calculateMetric(covered: number, total: number): CoverageMetric {
  if (total <= 0) {
    return { total: 0, covered: 0, pct: 100 };
  }
  const pct = Math.round((covered / total) * PERCENT_SCALE_FACTOR) / PERCENT_DIVISOR;
  return { total, covered, pct };
}

export function determineCoverageStatus(pct: number, threshold: number = DEFAULT_TEST_COVERAGE_THRESHOLD): CoverageStatus {
  if (pct === 0) return 'untested';
  if (pct >= threshold) return 'excellent';
  if (pct >= ACCEPTABLE_COVERAGE_THRESHOLD) return 'acceptable';
  return 'low';
}

/**
 * Compresses an array of line numbers into human-readable ranges,
 * e.g. [12, 13, 14, 15, 42, 88, 89] -> ["12-15", "42", "88-89"].
 */
export function compressLineRanges(lines: readonly number[]): string[] {
  if (lines.length === 0) return [];
  const sorted = Array.from(new Set(lines)).sort((a, b) => a - b);
  const first = sorted[0];
  if (first === undefined) return [];

  const ranges: string[] = []; // no-domain: Non-domain utility collection or data structure
  let start = first;
  let prev = first;

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    if (current === prev + 1) {
      prev = current;
    } else {
      ranges.push(start === prev ? String(start) : `${start}-${prev}`);
      start = current;
      prev = current;
    }
  }
  ranges.push(start === prev ? String(start) : `${start}-${prev}`);

  return ranges;
}

interface RawIstanbulEntry {
  path?: string;
  statementMap?: Record<string, { start: { line: number; column?: number }; end: { line: number; column?: number } }>;
  s?: Record<string, number>;
  fnMap?: Record<string, unknown>;
  f?: Record<string, number>;
  branchMap?: Record<string, unknown>;
  b?: Record<string, number[]>;
  l?: Record<string, number>;
  statements?: { total: number; covered: number; pct: number };
  branches?: { total: number; covered: number; pct: number };
  functions?: { total: number; covered: number; pct: number };
  lines?: { total: number; covered: number; pct: number };
}

function extractFromLineMap(lineHits: Record<string, number>): string[] {
  const uncovered = Object.entries(lineHits)
    .filter(([_, count]) => count === 0)
    .map(([lineStr]) => Number(lineStr))
    .filter(n => !Number.isNaN(n));
  return compressLineRanges(uncovered);
}

function recordStatementLines(
  startLine: number,
  endLine: number,
  hits: number,
  coveredLines: Set<number>,
  statementLines: Map<number, boolean>
): void {
  for (let line = startLine; line <= endLine; line++) {
    if (hits > 0) {
      coveredLines.add(line);
      statementLines.set(line, true);
    } else if (!statementLines.has(line)) {
      statementLines.set(line, false);
    }
  }
}

function extractFromStatementMap(
  statementMap: Record<string, { start?: { line?: number }; end?: { line?: number } }>,
  sHits: Record<string, number>
): string[] {
  const coveredLines = new Set<number>();
  const statementLines = new Map<number, boolean>();

  for (const [id, loc] of Object.entries(statementMap)) {
    const hits = sHits[id] ?? 0;
    const startLine = loc.start?.line;
    const endLine = loc.end?.line ?? startLine;
    if (typeof startLine === 'number' && typeof endLine === 'number') {
      recordStatementLines(startLine, endLine, hits, coveredLines, statementLines);
    }
  }

  const uncovered = Array.from(statementLines.entries())
    .filter(([line, wasHit]) => !wasHit && !coveredLines.has(line))
    .map(([line]) => line);

  return compressLineRanges(uncovered);
}

/**
 * Extracts uncovered line ranges from Istanbul file coverage data.
 */
export function extractUncoveredLines(raw: RawIstanbulEntry): string[] {
  if (raw.l && Object.keys(raw.l).length > 0) {
    return extractFromLineMap(raw.l);
  }
  if (raw.statementMap && raw.s) {
    return extractFromStatementMap(raw.statementMap, raw.s);
  }
  return [];
}

function calculateBranchMetrics(rawBranches?: Record<string, number[]>): CoverageMetric {
  let bTotal = 0;
  let bCovered = 0;
  for (const branchCounts of Object.values(rawBranches ?? {})) {
    if (Array.isArray(branchCounts)) {
      for (const count of branchCounts) {
        bTotal++;
        if (count > 0) bCovered++;
      }
    }
  }
  return calculateMetric(bCovered, bTotal);
}

function calculateLineMetrics(raw: RawIstanbulEntry, sTotal: number, sCovered: number): CoverageMetric {
  if (raw.l && Object.keys(raw.l).length > 0) {
    const lTotal = Object.keys(raw.l).length;
    const lCovered = Object.values(raw.l).filter(c => c > 0).length;
    return calculateMetric(lCovered, lTotal);
  }
  if (raw.statementMap && raw.s) {
    const linesMap = new Map<number, boolean>();
    for (const [id, loc] of Object.entries(raw.statementMap)) {
      const hits = raw.s[id] ?? 0;
      const startLine = loc.start?.line;
      if (typeof startLine === 'number') {
        const existing = linesMap.get(startLine) ?? false;
        linesMap.set(startLine, existing || hits > 0);
      }
    }
    return calculateMetric(
      Array.from(linesMap.values()).filter(Boolean).length,
      linesMap.size
    );
  }
  return calculateMetric(sCovered, sTotal);
}

function computeDetailedMetrics(raw: RawIstanbulEntry): {
  statements: CoverageMetric;
  branches: CoverageMetric;
  functions: CoverageMetric;
  lines: CoverageMetric;
} {
  const sTotal = Object.keys(raw.s ?? {}).length;
  const sCovered = Object.values(raw.s ?? {}).filter(c => c > 0).length;
  const fTotal = Object.keys(raw.f ?? {}).length;
  const fCovered = Object.values(raw.f ?? {}).filter(c => c > 0).length;

  return {
    statements: calculateMetric(sCovered, sTotal),
    branches: calculateBranchMetrics(raw.b),
    functions: calculateMetric(fCovered, fTotal),
    lines: calculateLineMetrics(raw, sTotal, sCovered)
  };
}

function parseRawCoverageItem(
  keyPath: string,
  raw: RawIstanbulEntry,
  projectRoot: string,
  threshold: number
): FileCoverageResult {
  const absolutePath = path.isAbsolute(keyPath) ? keyPath : path.resolve(projectRoot, keyPath);
  const relPath = path.relative(projectRoot, absolutePath).split(path.sep).join('/');

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
export function isPathExempt(relPath: string, exemptGlobs: readonly string[]): boolean {
  if (exemptGlobs.length === 0) return false;
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
export function parseIstanbulCoverage(
  rawJson: Record<string, unknown>,
  projectRoot: string,
  config: Required<AuditTestCoverageConfig>
): { files: FileCoverageResult[]; overall: TestCoverageReport['overall'] } {
  const files: FileCoverageResult[] = [];

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
    if (typeof value !== 'object' || value === null) continue;

    const fileRes = parseRawCoverageItem(key, value as RawIstanbulEntry, projectRoot, config.threshold);

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

const IGNORED_COVERAGE_DIRS: ReadonlySet<string> = new Set(['node_modules', '.git', 'dist', 'scratch']);

function isUntrackedCandidate(
  relPath: string,
  fileName: string,
  extensions: ReadonlySet<string>,
  exemptGlobs: readonly string[]
): boolean {
  const ext = path.extname(fileName);
  if (!extensions.has(ext)) return false;
  if (DEFAULT_TEST_PATTERNS.some(p => p.test(relPath))) return false;
  return !isPathExempt(relPath, exemptGlobs);
}

/**
 * Scans configured roots on disk and finds files that were never executed in tests.
 */
export function findUntrackedFiles(
  projectRoot: string,
  coveredRelPaths: Set<string>,
  config: Required<AuditTestCoverageConfig>
): string[] {
  const untracked: string[] = []; // no-domain: Non-domain utility collection or data structure
  const extensions = new Set(config.extensions.map(ext => ext.startsWith('.') ? ext : `.${ext}`));

  function walk(currentDir: string): void {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(projectRoot, fullPath).split(path.sep).join('/');

      if (entry.isDirectory()) {
        if (!IGNORED_COVERAGE_DIRS.has(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile() && isUntrackedCandidate(relPath, entry.name, extensions, config.exemptGlobs)) {
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
export function computeDirectoryBreakdown(
  files: readonly FileCoverageResult[],
  _roots: readonly string[] = ['src']
): DirectoryCoverageSummary[] {
  interface Aggregates {
    fileCount: number;
    sCovered: number;
    sTotal: number;
    bCovered: number;
    bTotal: number;
    fCovered: number;
    fTotal: number;
    lCovered: number;
    lTotal: number;
  }

  const dirMap = new Map<string, Aggregates>();

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

  const summaries: DirectoryCoverageSummary[] = [];
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
export function computeBucketCounts(
  files: readonly FileCoverageResult[],
  untrackedCount: number,
  threshold: number = DEFAULT_TEST_COVERAGE_THRESHOLD
): CoverageBucketCounts {
  let excellent = 0;
  let acceptable = 0;
  let low = 0;
  let untested = 0;

  for (const file of files) {
    const pct = file.statements.pct;
    if (pct === 0) {
      untested++;
    } else if (pct >= threshold) {
      excellent++;
    } else if (pct >= ACCEPTABLE_COVERAGE_THRESHOLD) {
      acceptable++;
    } else {
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
export function correlateComplexityHotspots(
  files: readonly FileCoverageResult[],
  fileComplexityMap: ReadonlyMap<string, number>
): CoverageHotspot[] {
  const hotspots: CoverageHotspot[] = [];

  for (const file of files) {
    const complexity = fileComplexityMap.get(file.relPath) ?? 0;
    if (complexity <= 0) continue;

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
export function analyzeTestCoverage(
  rawJson: Record<string, unknown>,
  projectRoot: string,
  config: Required<AuditTestCoverageConfig>,
  complexityMap?: ReadonlyMap<string, number>
): TestCoverageReport {
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
