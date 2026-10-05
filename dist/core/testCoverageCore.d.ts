/**
 * @file testCoverageCore.ts
 * @description Core engine for test execution coverage analysis and verification.
 * Parses Istanbul/V8 coverage JSON, derives line ranges, identifies untracked source files,
 * aggregates subsystem directory metrics, and correlates complexity hotspots.
 */
import type { AuditTestCoverageConfig } from './auditConfig.ts';
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
export declare const DEFAULT_TEST_COVERAGE_THRESHOLD: 80;
export declare const ACCEPTABLE_COVERAGE_THRESHOLD: 50;
export declare function resolveCoverageFile(projectRoot: string, configuredPath?: string): string | null;
export declare function calculateMetric(covered: number, total: number): CoverageMetric;
export declare function determineCoverageStatus(pct: number, threshold?: number): CoverageStatus;
/**
 * Compresses an array of line numbers into human-readable ranges,
 * e.g. [12, 13, 14, 15, 42, 88, 89] -> ["12-15", "42", "88-89"].
 */
export declare function compressLineRanges(lines: readonly number[]): string[];
interface RawIstanbulEntry {
    path?: string;
    statementMap?: Record<string, {
        start: {
            line: number;
            column?: number;
        };
        end: {
            line: number;
            column?: number;
        };
    }>;
    s?: Record<string, number>;
    fnMap?: Record<string, unknown>;
    f?: Record<string, number>;
    branchMap?: Record<string, unknown>;
    b?: Record<string, number[]>;
    l?: Record<string, number>;
    statements?: {
        total: number;
        covered: number;
        pct: number;
    };
    branches?: {
        total: number;
        covered: number;
        pct: number;
    };
    functions?: {
        total: number;
        covered: number;
        pct: number;
    };
    lines?: {
        total: number;
        covered: number;
        pct: number;
    };
}
/**
 * Extracts uncovered line ranges from Istanbul file coverage data.
 */
export declare function extractUncoveredLines(raw: RawIstanbulEntry): string[];
/**
 * Checks if a relative path matches an exempt glob or path pattern.
 */
export declare function isPathExempt(relPath: string, exemptGlobs: readonly string[]): boolean;
/**
 * Parses raw Istanbul JSON into structured FileCoverageResults and overall totals.
 */
export declare function parseIstanbulCoverage(rawJson: Record<string, unknown>, projectRoot: string, config: Required<AuditTestCoverageConfig>): {
    files: FileCoverageResult[];
    overall: TestCoverageReport['overall'];
};
/**
 * Scans configured roots on disk and finds files that were never executed in tests.
 */
export declare function findUntrackedFiles(projectRoot: string, coveredRelPaths: Set<string>, config: Required<AuditTestCoverageConfig>): string[];
/**
 * Computes directory-level aggregated metrics from file coverage results.
 */
export declare function computeDirectoryBreakdown(files: readonly FileCoverageResult[], _roots?: readonly string[]): DirectoryCoverageSummary[];
/**
 * Counts files across coverage buckets:
 * - excellent (>= threshold)
 * - acceptable (50 - threshold-1%)
 * - low (1 - 49%)
 * - untested (0%)
 * - untracked (files on disk not in coverage json)
 */
export declare function computeBucketCounts(files: readonly FileCoverageResult[], untrackedCount: number, threshold?: number): CoverageBucketCounts;
/**
 * Correlates file coverage with Fallow cognitive complexity hotspots.
 * Risk score = Complexity * (1 - CoveragePct / 100).
 */
export declare function correlateComplexityHotspots(files: readonly FileCoverageResult[], fileComplexityMap: ReadonlyMap<string, number>): CoverageHotspot[];
/**
 * Complete analysis orchestrator: parses JSON, identifies untracked files,
 * builds directory breakdown, computes buckets and returns full report.
 */
export declare function analyzeTestCoverage(rawJson: Record<string, unknown>, projectRoot: string, config: Required<AuditTestCoverageConfig>, complexityMap?: ReadonlyMap<string, number>): TestCoverageReport;
export {};
//# sourceMappingURL=testCoverageCore.d.ts.map