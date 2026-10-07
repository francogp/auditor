/**
 * packages/auditor/src/suites/architecture/validate_html_validate.ts
 *
 * HTML5 STANDARDS & MARKUP HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Runs `html-validate` with `html-validate-vue` across project templates (.vue, .html),
 * detects deprecated attributes, obsolete elements, and spec violations (Zero-Warning Policy),
 * and persists structured reports to scratch/audits/architecture/validate_html_validate.json.
 * Supports auto-fix when `fix` is passed.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-child-process packages/auditor/src/suites/architecture/validate_html_validate.ts
 *   npm run validate:html
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
import { type RawLintMessage, type RawLintFileReport } from '../../core/reportUtils.ts';
export type HtmlValidateRuleId = 'html-validate-issue';
export declare const HTML_VALIDATE_RULES: readonly HtmlValidateRuleId[];
export type RawHtmlValidateMessage = RawLintMessage;
export type RawHtmlValidateFileReport = RawLintFileReport;
/**
 * Parses raw JSON output or an array of file reports from html-validate into canonical AuditFindings.
 * Elevates both warnings and errors to severity: 'error' (Zero-Warning Policy).
 */
export declare function parseHtmlValidateResults(input: string | object[], cwd?: string): AuditFinding[];
export declare function collectHtmlTargets(projectRoot: string, roots: readonly string[]): {
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
//# sourceMappingURL=validate_html_validate.d.ts.map