import { AuditFinding } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_type_check.d.ts
export type TypeCheckRuleId = 'ts-compiler-error';
export declare const TYPE_CHECK_RULES: readonly TypeCheckRuleId[];
/**
 * Parses raw diagnostic output from vue-tsc / tsc into canonical AuditFindings.
 */
export declare function parseTypeScriptDiagnostics(output: string, cwd?: string): AuditFinding[];
export declare class TypeCheckAuditor extends BaseAuditor<TypeCheckRuleId> {
  constructor(projectRoot?: string);
  runAudit(): Promise<void>;
}
//#endregion