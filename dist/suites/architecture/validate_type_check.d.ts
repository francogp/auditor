import { AuditFinding } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
export type TypeCheckRuleId = 'ts-compiler-error';
export declare const TYPE_CHECK_RULES: readonly TypeCheckRuleId[];
/**
 * Parses raw diagnostic output from vue-tsc / tsc into canonical AuditFindings.
 */
export declare function parseTypeScriptDiagnostics(output: string, cwd?: string): AuditFinding[];
export interface TypeCheckAuditorOptions {
  readonly projectRoot?: string;
}
export declare class TypeCheckAuditor extends BaseAuditor<TypeCheckRuleId> {
  constructor(options?: TypeCheckAuditorOptions);
  runAudit(): Promise<void>;
}