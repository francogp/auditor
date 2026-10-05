/**
 * src/suites/architecture/validate_audit_coverage.ts
 *
 * AUDIT COVERAGE & BLIND-SPOT AUDITOR (Node.js 26+ Native)
 * Post-run suite that consumes every coverage ledger written during a full orchestrated run and
 * reports blind spots that would otherwise produce false-clean results:
 *   - tracked files that no suite analyzed (uncovered),
 *   - files whose rules are silenced by configured exemption policies (degraded),
 *   - drift between a suite's static declaration and what it actually scanned,
 *   - rules evaluated zero times without an explicit non-applicability justification (dormant),
 *   - exemptions that match nothing (dead), and executed suites that left no ledger.
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
import { type AuditEngineConfig } from '../../core/auditConfig.ts';
import type { CoverageLedger } from '../../core/auditContract.ts';
export declare const AUDIT_COVERAGE_SUITE_ID = "validate_audit_coverage";
export declare const AUDIT_COVERAGE_RULES: readonly ["coverage-uncovered-file", "coverage-degraded-file", "coverage-declared-not-scanned", "coverage-scanned-undeclared", "coverage-dormant-rule", "coverage-invalid-exemption", "coverage-missing-ledger"];
export type AuditCoverageRuleId = (typeof AUDIT_COVERAGE_RULES)[number];
export interface CoverageFinding {
    readonly ruleId: AuditCoverageRuleId;
    readonly file: string;
    readonly message: string;
    readonly context: string;
}
export interface CoverageAnalysisInput {
    readonly trackedFiles: readonly string[];
    readonly ledgers: readonly CoverageLedger[];
    readonly expectedSuites: readonly string[];
    readonly config: AuditEngineConfig;
    /** Global ignore predicate (config ignoredDirs/ignoreGlobs + canonical dirs). */
    readonly isGloballyIgnored: (relPath: string) => boolean;
}
export declare function isCoveredBy(file: string, ledger: CoverageLedger, scannedSets: ReadonlyMap<string, ReadonlySet<string>>): boolean;
/**
 * Pure blind-spot analysis over the ledgers of one run.
 */
export declare function analyzeAuditCoverage(input: CoverageAnalysisInput): CoverageFinding[];
/** Tracked files (git index) that still exist on disk, as POSIX relative paths. */
export declare function listTrackedFiles(projectRoot: string): string[];
export declare class AuditCoverageAuditor extends BaseAuditor<AuditCoverageRuleId> {
    constructor(options?: {
        projectRoot?: string;
    });
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_audit_coverage.d.ts.map