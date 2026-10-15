import { BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_oxfmt.d.ts
export declare const OXFMT_RULES: readonly ["oxfmt-violation"];
export type OxfmtRuleId = (typeof OXFMT_RULES)[number];
export interface OxfmtAuditOptions {
  projectRoot?: string;
  fix?: boolean;
}
export declare class OxfmtAuditor extends BaseAuditor<OxfmtRuleId> {
  constructor(targetOrOptions?: string | OxfmtAuditOptions);
  runAudit(): Promise<void>;
}
//#endregion