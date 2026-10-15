import { BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/documentation/validate_dox_integrity.d.ts
export type DoxRuleId = 'dox-missing-agents-md' | 'dox-unregistered-child' | 'dox-unindexed-file' | 'dox-missing-section' | 'dox-section-order' | 'dox-empty-section';
export declare const DOX_RULES: readonly DoxRuleId[];
export declare class DoxIntegrityAuditor extends BaseAuditor<DoxRuleId> {
  private readonly rootDir;
  constructor(rootDir?: string);
  runAudit(): Promise<void>;
}
//#endregion