import { BaseAuditor } from "../../core/auditorBase.js";
import { AUDITOR_HOMEBREW_RULES, AuditorHomebrewRuleId } from "../../analyzers/homebrew/homebrewTypes.js";
//#region src/suites/architecture/validate_auditor_hygiene.d.ts
export declare class AuditorHygieneAuditor extends BaseAuditor<AuditorHomebrewRuleId> {
  constructor(projectRoot?: string);
  private collectTargetFiles;
  runAudit(): Promise<void>;
}
//#endregion
export { AUDITOR_HOMEBREW_RULES, type AuditorHomebrewRuleId };