import { BaseAuditor } from "../../core/auditorBase.js";
import { AUDITOR_HOMEBREW_RULES, AuditorHomebrewRuleId } from "../../analyzers/homebrew/homebrewTypes.js";
export declare class AuditorHygieneAuditor extends BaseAuditor<AuditorHomebrewRuleId> {
  constructor(options?: string | {
    projectRoot?: string;
  });
  private collectTargetFiles;
  runAudit(): Promise<void>;
}
export { AUDITOR_HOMEBREW_RULES, type AuditorHomebrewRuleId };