import { NpmAuditSeverityLevel } from "../../core/auditConfigTypes.js";
import { AuditFinding } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
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
  private applyAuditFindings;
}