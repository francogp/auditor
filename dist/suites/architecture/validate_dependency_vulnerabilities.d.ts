/**
 * src/suites/architecture/validate_dependency_vulnerabilities.ts
 *
 * DEPENDENCY VULNERABILITIES & CVE AUDITOR (Node.js 26+ Native)
 * Scans installed dependency tree for known security advisories and CVEs
 * via npm audit --json, with graceful offline handling and configurable severity gating.
 *
 * Rules:
 *   - dependency-cve-critical: Critical security vulnerabilities detected in package dependencies.
 *   - dependency-cve-high: High security vulnerabilities detected in package dependencies.
 *   - dependency-cve-moderate: Moderate security vulnerabilities detected in package dependencies.
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
import type { NpmAuditSeverityLevel } from '../../core/auditConfigTypes.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
export declare const DEPENDENCY_VULNERABILITIES_RULES: readonly ["dependency-cve-critical", "dependency-cve-high", "dependency-cve-moderate"];
export type DependencyVulnerabilitiesRuleId = (typeof DEPENDENCY_VULNERABILITIES_RULES)[number];
export interface NpmAuditVulnItem {
    readonly name: string;
    readonly severity: NpmAuditSeverityLevel;
    readonly isDirect: boolean;
    readonly via: readonly (string | {
        readonly title?: string;
        readonly url?: string;
        readonly range?: string;
    })[];
    readonly range: string;
    readonly effects: readonly string[];
}
export interface NpmAuditReport {
    readonly vulnerabilities?: Record<string, NpmAuditVulnItem>;
}
/**
 * Invokes npm audit --json synchronously with bounded timeout and safe error capture.
 */
export declare function runNpmAudit(projectRoot: string, omitDev?: boolean): {
    stdout: string;
    error?: Error;
};
/**
 * Parses npm audit JSON into canonical AuditFindings.
 */
export declare function parseNpmAuditReport(json: NpmAuditReport, allowList: ReadonlySet<string>, failOn?: NpmAuditSeverityLevel): AuditFinding[];
export declare class ValidateDependencyVulnerabilitiesAuditor extends BaseAuditor<DependencyVulnerabilitiesRuleId> {
    constructor(options?: {
        projectRoot?: string;
    });
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_dependency_vulnerabilities.d.ts.map