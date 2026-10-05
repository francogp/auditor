/**
 * scripts/auditors/architecture/validate_eslint.ts
 *
 * ESLINT AST & CODE QUALITY AUDITOR (Node.js 26+ Native)
 *
 * Runs ESLint across the repository with cache and JSON formatter,
 * maps both errors and warnings to StandardAuditResult findings with severity 'error'
 * (enforcing the strict Zero-Warning Policy), and persists structured reports to
 * scratch/audits/architecture/validate_eslint.json.
 * Supports auto-fix when `fix` is passed.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* --allow-child-process scripts/auditors/architecture/validate_eslint.ts
 *   npm run lint
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
import type { AuditFinding, GitIgnoreRequirement } from '../../core/auditContract.ts';
import { type RawLintMessage, type RawLintFileReport } from '../../core/reportUtils.ts';
export type EslintRuleId = 'eslint-violation';
export declare const ESLINT_RULES: readonly EslintRuleId[];
export type RawEslintMessage = RawLintMessage;
export type RawEslintFileReport = RawLintFileReport;
/**
 * Parses raw JSON output or an array of file reports from ESLint into canonical AuditFindings.
 * Elevates both warnings (severity 1) and errors (severity 2) to severity: 'error' (Zero-Warning Policy).
 */
export declare function parseEslintResults(input: string | object[], cwd?: string): AuditFinding[];
export declare class EslintAuditor extends BaseAuditor<EslintRuleId> {
    static readonly gitIgnoreEntries: readonly GitIgnoreRequirement[];
    constructor(projectRoot?: string);
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_eslint.d.ts.map