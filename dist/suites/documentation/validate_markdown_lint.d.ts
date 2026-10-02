/**
 * scripts/auditors/documentation/validate_markdown_lint.ts
 *
 * MARKDOWN LINT AUDITOR & HYGIENE VALIDATOR (Node.js 26+ Native)
 *
 * Runs `markdownlint` across all project documentation and skills,
 * parses structured JSON findings, maps them to StandardAuditResult with severity 'error',
 * and persists reports to scratch/audits/documentation/validate_markdown_lint.json.
 * Supports auto-fix when `fix` is passed.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* --allow-child-process scripts/auditors/documentation/validate_markdown_lint.ts
 *   npm run lint:md
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
export type MarkdownLintRuleId = 'markdownlint-issue';
export declare const MARKDOWN_LINT_RULES: readonly MarkdownLintRuleId[];
export declare const DEFAULT_MARKDOWN_IGNORE_GLOBS: readonly ["node_modules/**", ".git/**", "dist/**", "dev-dist/**", "scratch/**", "test-results/**"];
export declare function getMarkdownIgnoreGlobs(projectRoot?: string): readonly string[];
export declare const MARKDOWN_IGNORE_GLOBS: readonly ["node_modules/**", ".git/**", "dist/**", "dev-dist/**", "scratch/**", "test-results/**"];
export interface RawMarkdownLintIssue {
    fileName?: string;
    lineNumber?: number;
    ruleNames?: string[];
    ruleDescription?: string;
    errorDetail?: string | null;
    errorContext?: string | null;
}
/**
 * Parses raw JSON output or an array of issues from markdownlint into canonical AuditFindings.
 */
export declare function parseMarkdownLintIssues(input: string | object[], cwd?: string): AuditFinding[];
export declare class MarkdownLintAuditor extends BaseAuditor<MarkdownLintRuleId> {
    constructor(projectRoot?: string);
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_markdown_lint.d.ts.map