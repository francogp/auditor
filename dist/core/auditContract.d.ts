/**
 * packages/auditor/src/core/auditContract.ts
 *
 * STANDARD AUDIT CONTRACT (Node.js 26+)
 * Defines the immutable data structures, family types, and standard outputs
 * required for all sub-auditors and the general audit orchestrator.
 */
import { type CustomAuditFamilyConfig, type AuditEngineConfig } from './auditConfig.ts';
export declare const BUILTIN_AUDIT_FAMILIES: readonly ["architecture", "domain_data", "persistence", "documentation"];
export declare const AUDIT_FAMILIES: readonly ["architecture", "domain_data", "persistence", "documentation"];
export type BuiltinAuditFamily = (typeof BUILTIN_AUDIT_FAMILIES)[number];
export type AuditFamily = BuiltinAuditFamily | (string & {});
export interface FamilyMetadata {
    key: string;
    title: string;
    order: number;
    icon: string;
    description: string;
}
export declare const FAMILY_METADATA: Record<string, FamilyMetadata>;
export declare const DEFAULT_CUSTOM_FAMILY_ORDER = 90;
export declare const FALLBACK_FAMILY_ORDER = 99;
export declare function resolveFamilyMetadata(familyKey: string, customFamilies?: readonly CustomAuditFamilyConfig[]): FamilyMetadata;
export declare function getActiveFamilies(customFamilies?: readonly CustomAuditFamilyConfig[]): readonly string[];
export type FindingSeverity = 'error' | 'warning' | 'info';
export interface AuditFinding {
    severity: FindingSeverity;
    message: string;
    file?: string;
    line?: number;
    col?: number;
    ruleId?: string;
    ruleDescription?: string;
    suiteId?: string;
    suiteName?: string;
    context?: string;
}
export declare const AUDIT_STATUSES: readonly ["passed", "failed", "skipped"];
export type AuditExecutionStatus = (typeof AUDIT_STATUSES)[number];
export interface SubAuditorStep {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
}
export interface SubAuditorReport {
    readonly id: string;
    readonly name: string;
    readonly status: 'passed' | 'warning' | 'failed';
    readonly count: number;
    readonly detail?: string;
}
export interface ICompositeAuditor {
    getSubAuditors(): readonly SubAuditorStep[];
}
export interface StandardAuditResult {
    id: string;
    name: string;
    description: string;
    family: AuditFamily;
    status: AuditExecutionStatus;
    durationMs: number;
    metrics: Record<string, number | string>;
    findings: AuditFinding[];
    summary: {
        errors: number;
        warnings: number;
        info: number;
        totalFilesScanned?: number;
    };
    subAuditors?: readonly SubAuditorReport[];
    isBuiltin?: boolean;
    icon?: string;
    packageName?: string;
}
export interface AuditorCapabilities {
    /** Whether the sub-auditor implements automated repairs when invoked with --fix */
    readonly fix: boolean;
    /** Whether the sub-auditor participates in the fast lint preset runs (preset=lint / npm run audit:lint) */
    readonly lint: boolean;
    /** Whether the sub-auditor participates in the markdown/documentation preset runs (preset=md / npm run audit:md) */
    readonly md: boolean;
    /** Whether the sub-auditor requires the shared in-memory TypeScript AST context */
    readonly ast: boolean;
    /** Whether the sub-auditor supports incremental git diff scoping via --changed-since */
    readonly changedSince: boolean;
    /** Whether the sub-auditor is computationally heavy or resource-intensive (e.g. vector ML, type check) */
    readonly heavy: boolean;
    /** Whether the sub-auditor requires pre-compiled production artifacts in dist/ */
    readonly requiresBuild: boolean;
}
export interface GitIgnoreRequirement {
    readonly id: string;
    readonly pattern: string;
    readonly samplePath?: string;
    readonly reason: string;
    readonly isApplicable?: (config: AuditEngineConfig) => boolean;
}
export interface AuditTaskDefinition {
    id: string;
    name: string;
    description?: string;
    family: AuditFamily;
    scriptPath: string;
    command: string;
    args: string[];
    fast?: boolean;
    order?: number;
    timeoutMs?: number;
    shell?: boolean;
    requiresAst?: boolean;
    isBuiltin?: boolean;
    icon?: string;
    capabilities?: AuditorCapabilities;
    gitIgnoreEntries?: readonly GitIgnoreRequirement[];
}
export interface AuditTaskDescriptor {
    id?: string;
    name?: string;
    family?: AuditFamily;
    fast?: boolean;
    order?: number;
    timeoutMs?: number;
    permissions?: string[];
    extraArgs?: string[];
    requiresAst?: boolean;
    capabilities?: AuditorCapabilities;
}
export type AuditRunMode = 'full' | 'preset' | 'family' | 'suites' | 'single';
export interface AuditRunMetadata {
    version: string;
    timestamp: string;
    isFullAudit: boolean;
    runMode: AuditRunMode;
    preset: string | null;
    targetFamily: string | null;
    totalDiscoveredSuites: number;
    executedSuiteCount: number;
    executedSuites: string[];
    omittedSuites: string[];
    skipSimilar?: boolean;
    environment: {
        nodeVersion: string;
        platform: string;
        cwd: string;
    };
}
export interface AuditFileSummary {
    file: string;
    errors: number;
    warnings: number;
    findings: AuditFinding[];
}
export interface AuditByFileReport {
    meta: AuditRunMetadata;
    status: AuditExecutionStatus;
    summary: ConsolidatedAuditReport['summary'];
    totalAffectedFiles: number;
    files: Record<string, AuditFileSummary>;
}
export interface ConsolidatedAuditReport {
    meta: AuditRunMetadata;
    status: AuditExecutionStatus;
    summary: {
        totalViolations: number;
        errors: number;
        warnings: number;
        suitesTotal: number;
        suitesPassed: number;
        suitesFailed: number;
        durationMs: number;
    };
    families: Partial<Record<AuditFamily, {
        title: string;
        suites: StandardAuditResult[];
    }>>;
    allFindings: AuditFinding[];
    findingsByFile?: Record<string, AuditFinding[]>;
}
/**
 * Normalizes a file path from an AuditFinding into a clean relative POSIX path.
 */
export declare function normalizeFindingPath(filePath?: string, cwd?: string): string;
/**
 * Stably sorts an array of AuditFinding instances by:
 * 1. Normalized relative file path (case-insensitive ASC)
 * 2. Line number (ASC, missing/undefined at top = 0)
 * 3. Column number (ASC)
 * 4. Severity ('error' first, then 'warning')
 * 5. Rule ID (ASC)
 */
export declare function sortFindingsByFileAndLine(findings: readonly AuditFinding[], cwd?: string): AuditFinding[];
/**
 * Groups an array of AuditFindings into a map indexed by normalized relative file path,
 * where findings within each file are guaranteed sorted by line number ascending.
 */
export declare function groupFindingsByFileMap(findings: readonly AuditFinding[], cwd?: string): Record<string, AuditFileSummary>;
export declare const ONE_MINUTE_MS = 60000;
export declare const MAX_AUDIT_STALENESS_MS: number;
export interface AssertAuditorOptions {
    maxAgeMs?: number;
    allowStale?: boolean;
    projectRoot?: string;
}
/**
 * Asserts that a required auditor was executed in the consolidated audit report
 * and that the report is fresh (generated within the last 5 minutes).
 * Throws a fatal descriptive error if the audit is partial, the suite was omitted,
 * or the report is stale.
 */
export declare function assertAuditorExecuted(report: Partial<ConsolidatedAuditReport> | null | undefined, requiredSuiteId: string, consumerName: string, options?: AssertAuditorOptions): void;
export declare function groupResultsByFamily(results: readonly StandardAuditResult[], initialFamilies?: readonly AuditFamily[]): Map<AuditFamily, StandardAuditResult[]>;
//# sourceMappingURL=auditContract.d.ts.map