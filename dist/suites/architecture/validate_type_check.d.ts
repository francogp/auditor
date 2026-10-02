/**
 * scripts/auditors/architecture/validate_type_check.ts
 *
 * TYPESCRIPT & VUE SFC TYPE CHECK AUDITOR (Node.js 26+ Native)
 *
 * Runs `vue-tsc --noEmit` across the repository, parses TypeScript compiler diagnostics,
 * maps them to StandardAuditResult findings with severity 'error', and persists structured
 * JSON reports to scratch/audits/architecture/validate_type_check.json.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-child-process scripts/auditors/architecture/validate_type_check.ts
 *   npm run validate:types
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
export type TypeCheckRuleId = 'ts-compiler-error';
export declare const TYPE_CHECK_RULES: readonly TypeCheckRuleId[];
/**
 * Parses raw diagnostic output from vue-tsc / tsc into canonical AuditFindings.
 */
export declare function parseTypeScriptDiagnostics(output: string, cwd?: string): AuditFinding[];
export declare class TypeCheckAuditor extends BaseAuditor<TypeCheckRuleId> {
    constructor();
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_type_check.d.ts.map