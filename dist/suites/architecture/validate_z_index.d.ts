import { RuleFixContext } from "../../core/auditContract.js";
import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
import { fixZIndexLiteral } from "../../analyzers/zIndexRules.js";
export declare const Z_INDEX_RULES: readonly ["z-index-missing-var", "z-index-mismatch", "z-index-read-error", "z-index-hardcoded-literal", "z-index-isolated-constant"];
export type ZIndexRuleId = (typeof Z_INDEX_RULES)[number];
export interface ZIndexAuditViolation {
  ruleId: ZIndexRuleId;
  message: string;
  context: string;
}
export interface ZIndexAuditResult {
  scssContent: string;
  modified: boolean;
  errors: string[];
  violations: ZIndexAuditViolation[];
}
export declare function auditZIndexParity(scssContent: string, isFixMode: boolean, layers?: Record<string, number>): ZIndexAuditResult;
export declare const HARDCODED_Z_INDEX_REGEX: RegExp;
export declare const ISOLATED_Z_INDEX_CONST_REGEX: RegExp;
export interface ZIndexAuditorOptions extends FileScanRootsOptions {
  readonly scssPath?: string;
}
export declare function fixZIndexVariables(context: RuleFixContext<'z-index-missing-var' | 'z-index-mismatch'>): Promise<boolean>;
export declare class ZIndexAuditor extends FileScanAuditor<ZIndexRuleId> {
  private readonly scssPath?;
  private readonly isExplicit;
  constructor(options?: ZIndexAuditorOptions);
  runAudit(): Promise<void>;
}
export { fixZIndexLiteral as fixZIndexLiteralMatch };