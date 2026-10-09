/**
 * src/core/auditCoverage.ts
 *
 * AUDIT COVERAGE LEDGER (Node.js 26+ Native)
 * Records, per suite and per run, which files were actually analyzed and how many times every rule
 * was evaluated. Ledgers are consumed by `validate_audit_coverage` to detect blind spots:
 * uncovered files, declaration/observation drift and dormant rules (false-clean results).
 */
import { type AuditorCoverageDeclaration, type CoverageLedger, type CoverageSource } from './auditContract.ts';
export type { CoverageLedger };
export declare const COVERAGE_LEDGER_DIR = "scratch/audits/coverage";
export declare const COVERAGE_RUN_ID_ENV = "AUDIT_COVERAGE_RUN_ID";
/** 'full' only when audit_full runs every discovered suite (coverage is meaningless on partial runs). */
export declare const COVERAGE_RUN_MODE_ENV = "AUDIT_COVERAGE_RUN_MODE";
/** Comma-separated ids of the suites executed before the post-run phase (each must leave a ledger). */
export declare const COVERAGE_EXPECTED_SUITES_ENV = "AUDIT_COVERAGE_EXPECTED_SUITES";
/** Returns the run identifier of the orchestrated full run, if any. Ledgers are only written inside such runs. */
export declare function resolveActiveCoverageRunId(): string | undefined;
/** Converts an absolute or relative path into a POSIX path relative to the project root. */
export declare function toPosixRelative(projectRoot: string, filePath: string): string;
export declare function matchesAnyGlob(relPosixPath: string, globs: readonly string[]): boolean;
export declare const DEFAULT_NON_AUDITABLE_GLOBS: readonly string[];
/** Whether a file is part of the auditable codebase (excluding binaries, lockfiles, and tooling meta). */
export declare function isAuditableCodebaseFile(relPosixPath: string, customExemptGlobs?: readonly string[]): boolean;
/** Whether a file falls inside the static coverage declaration of a suite. */
export declare function isDeclaredByCoverage(relPosixPath: string, declaration: AuditorCoverageDeclaration): boolean;
/** Derives a coverage declaration from scan roots + extensions (used by FileScanAuditor). */
export declare function deriveCoverageFromRoots(roots: readonly string[], extensions: ReadonlySet<string>, projectRoot?: string): AuditorCoverageDeclaration;
/** Derives a coverage declaration from requiredFiles (used by BaseAuditor when coverage is omitted). */
export declare function deriveCoverageFromRequiredFiles(requiredFiles: readonly string[], projectRoot?: string, allowedExtensions?: ReadonlySet<string>): AuditorCoverageDeclaration;
/** Fails loudly when a suite declares an invalid coverage contract. */
export declare function validateCoverageDeclaration(suiteId: string, declaration: AuditorCoverageDeclaration | undefined): void;
export interface CoverageLedgerParams {
    readonly runId: string;
    readonly suiteId: string;
    readonly skipped: boolean;
    readonly ruleIds: readonly string[];
}
/**
 * Mutable per-instance recorder owned by every BaseAuditor.
 */
export declare class CoverageRecorder {
    private readonly projectRoot;
    private readonly scanned;
    private readonly evaluations;
    private readonly notApplicable;
    private readonly dynamicRuleIds;
    private externalScanCount;
    private currentDeclaration;
    constructor(projectRoot: string, declaration: AuditorCoverageDeclaration);
    get declaration(): AuditorCoverageDeclaration;
    /** Replaces the static declaration with a config-resolved one (validated loudly). */
    redeclare(suiteId: string, declaration: AuditorCoverageDeclaration): void;
    get source(): CoverageSource;
    get scannedCount(): number;
    recordScanned(filePath: string): void;
    unrecordScanned(filePath: string): void;
    /** Only valid for `declared-only` suites, whose engine reports a count but not a file list. */
    recordExternalScanCount(count: number): void;
    markRuleEvaluated(ruleId: string, count?: number): void;
    markRuleNotApplicable(ruleId: string, reason: string): void;
    declareRuleCatalog(ruleIds: readonly string[]): void;
    getEvaluations(ruleId: string): number;
    toLedger(params: CoverageLedgerParams): CoverageLedger;
}
export declare function writeCoverageLedger(projectRoot: string, ledger: CoverageLedger): Promise<void>;
export declare function clearCoverageLedgers(projectRoot: string): Promise<void>;
/** Reads every ledger written during the given run (stale ledgers from previous runs are ignored). */
export declare function readCoverageLedgers(projectRoot: string, runId: string): Promise<CoverageLedger[]>;
/** Reads all ledgers from the latest run in scratch/audits/coverage. */
export declare function readLatestCoverageLedgers(projectRoot: string): Promise<{
    runId: string | null;
    ledgers: CoverageLedger[];
}>;
//# sourceMappingURL=auditCoverage.d.ts.map