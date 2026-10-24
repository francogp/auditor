import { AuditFinding } from "../../core/auditContract.js";
import { RawLintFileReport, RawLintMessage } from "../../core/reportUtils.js";
import { BaseAuditor } from "../../core/auditorBase.js";
export type HtmlValidateRuleId = 'html-validate-issue';
export declare const HTML_VALIDATE_RULES: readonly HtmlValidateRuleId[];
export type RawHtmlValidateMessage = RawLintMessage;
export type RawHtmlValidateFileReport = RawLintFileReport;
/**
 * Parses raw JSON output or an array of file reports from html-validate into canonical AuditFindings.
 * Elevates both warnings and errors to severity: 'error' (Zero-Warning Policy).
 */
export declare function parseHtmlValidateResults(input: string | object[], cwd?: string): AuditFinding[];
export declare function collectHtmlTargets(projectRoot: string, roots: readonly string[], extraIgnorePatterns?: readonly string[]): {
  targets: string[];
  filesToScan: string[];
};
export declare function readAndParseHtmlValidateOutput(reportFile: string, combinedOutput: string, projectRoot: string): {
  findings: AuditFinding[];
  rawJson: string;
};
export declare class HtmlValidateAuditor extends BaseAuditor<HtmlValidateRuleId> {
  constructor(options?: {
    projectRoot?: string;
  });
  runAudit(): Promise<void>;
}