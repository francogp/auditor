import { AuditEngineConfig } from "../../core/auditConfigTypes.js";
import { CoverageLedger } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_audit_coverage.d.ts
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
  readonly auditableFiles?: readonly string[];
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
//#endregion