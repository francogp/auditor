/**
 * packages/auditor/src/core/auditContract.ts
 *
 * STANDARD AUDIT CONTRACT (Node.js 26+)
 * Defines the immutable data structures, family types, and standard outputs
 * required for all sub-auditors and the general audit orchestrator.
 */
import type { CustomAuditFamilyConfig } from './auditConfig.ts';
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
export declare function resolveFamilyMetadata(familyKey: string, customFamilies?: readonly CustomAuditFamilyConfig[]): FamilyMetadata;
export declare function getActiveFamilies(customFamilies?: readonly CustomAuditFamilyConfig[]): readonly string[];
export type FindingSeverity = 'error' | 'warning' | 'info';
export interface AuditFinding {
    severity: FindingSeverity;
    message: string;
    file?: string;
    line?: number;
    ruleId?: string;
    ruleDescription?: string;
    suiteId?: string;
    suiteName?: string;
    context?: string;
}
export declare const AUDIT_STATUSES: readonly ["passed", "failed"];
export type AuditExecutionStatus = (typeof AUDIT_STATUSES)[number];
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
    families: Record<AuditFamily, {
        title: string;
        suites: StandardAuditResult[];
    }>;
    allFindings: AuditFinding[];
}
export declare const MAX_AUDIT_STALENESS_MS: number;
export interface AssertAuditorOptions {
    maxAgeMs?: number;
    allowStale?: boolean;
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