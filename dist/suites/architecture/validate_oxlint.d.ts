import { AuditFinding, GitIgnoreRequirement } from "../../core/auditContract.js";
import { RawLintFileReport, RawLintMessage } from "../../core/reportUtils.js";
import { BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_oxlint.d.ts
export declare const OXLINT_RULES: readonly ["oxlint-violation"];
export type OxlintRuleId = (typeof OXLINT_RULES)[number];
export type RawOxlintMessage = RawLintMessage;
export type RawOxlintFileReport = RawLintFileReport;
export interface OxlintDiagnostic {
  message: string;
  code?: string;
  severity?: string;
  filename?: string;
  labels?: Array<{
    span?: {
      line?: number;
      column?: number;
      offset?: number;
      length?: number;
    };
  }>;
}
export interface OxlintJsonReport {
  diagnostics?: OxlintDiagnostic[];
  number_of_files?: number;
  number_of_rules?: number;
}
/**
 * Parses raw JSON output from Vite+ (Oxlint) into canonical AuditFindings.
 * Elevates all diagnostics to severity: 'error' (Zero-Warning Policy).
 */
export declare function parseOxlintResults(input: string | object | object[], cwd?: string): AuditFinding[];
export declare class OxlintAuditor extends BaseAuditor<OxlintRuleId> {
  static readonly gitIgnoreEntries: readonly GitIgnoreRequirement[];
  constructor(projectRoot?: string);
  runAudit(): Promise<void>;
}
//#endregion