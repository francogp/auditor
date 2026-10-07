/**
 * src/core/versionAnalyzer.ts
 *
 * Intelligent heuristic engine for determining SemVer bumps (major, minor, patch)
 * based on Git diff metrics, affected subsystems, and commit intent.
 */
export declare const MAJOR_DIFF_LINES_THRESHOLD: 1000;
export declare const MAJOR_CORE_LINES_THRESHOLD: 500;
export declare const MINOR_DIFF_LINES_THRESHOLD: 100;
export declare const VERSION_BUMP_TYPES: readonly ["major", "minor", "patch"];
export type VersionBumpType = (typeof VERSION_BUMP_TYPES)[number];
export declare const GIT_STATUS_FLAGS: readonly ["A", "M", "D", "R", "?"];
export type GitStatusFlag = (typeof GIT_STATUS_FLAGS)[number];
export interface ChangedFileDetail {
    path: string;
    status: GitStatusFlag;
    insertions: number;
    deletions: number;
}
export interface DiffMetrics {
    filesChanged: number;
    insertions: number;
    deletions: number;
    totalLinesChanged: number;
    hasCoreChanges: boolean;
    hasNewFeatures: boolean;
    hasBreakingChanges: boolean;
    changedFiles: ChangedFileDetail[];
}
export interface VersionAnalysisResult {
    currentVersion: string;
    baseVersion: string;
    recommendedBump: VersionBumpType;
    recommendedVersion: string;
    buildId: string;
    buildDate: string;
    rationale: string;
    metrics: DiffMetrics;
}
export interface VersionAnalysisOptions {
    cwd?: string;
    commitMessage?: string;
    customNow?: Temporal.ZonedDateTime;
    baseRef?: string;
}
/**
 * Extracts base SemVer major.minor.patch tuple from a version string.
 */
export declare function parseBaseSemver(versionStr: string): [number, number, number];
/**
 * Calculates the next SemVer base version given a bump type.
 */
export declare function calculateNextBaseVersion(currentBase: string, bump: VersionBumpType): string;
/**
 * Generates an elegant build timestamp ID (YYYYMMDD-HHmmss).
 */
export declare function generateBuildId(customNow?: Temporal.ZonedDateTime): {
    buildId: string;
    buildDate: string;
};
/**
 * Collects Git diff metrics from the current working tree and uncommitted changes.
 */
export declare function collectGitDiffMetrics(cwd?: string, baseRef?: string): DiffMetrics;
/**
 * Analyzes diff metrics and commit intent to suggest the optimal SemVer bump.
 */
export declare function analyzeVersionBump(options?: VersionAnalysisOptions): VersionAnalysisResult;
//# sourceMappingURL=versionAnalyzer.d.ts.map