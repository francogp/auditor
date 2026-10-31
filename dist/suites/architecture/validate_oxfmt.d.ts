import { RuleFixContext } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
export declare const OXFMT_RULES: readonly ["oxfmt-violation"];
export type OxfmtRuleId = (typeof OXFMT_RULES)[number];
export declare function fixOxfmt(context: RuleFixContext<'oxfmt-violation'>): Promise<boolean>;
export interface OxfmtAuditOptions {
  readonly projectRoot?: string;
}
export declare class OxfmtAuditor extends BaseAuditor<OxfmtRuleId> {
  constructor(options?: OxfmtAuditOptions);
  runAudit(): Promise<void>;
}