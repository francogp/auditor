import { BaseAuditor } from "../../core/auditorBase.js";
export type DoxRuleId = 'dox-missing-agents-md' | 'dox-unregistered-child' | 'dox-unindexed-file' | 'dox-missing-section' | 'dox-section-order' | 'dox-empty-section';
export declare const DOX_RULES: readonly DoxRuleId[];
export interface DoxIntegrityAuditorOptions {
  projectRoot?: string;
}
export declare class DoxIntegrityAuditor extends BaseAuditor<DoxRuleId> {
  private readonly rootDir;
  constructor(options?: DoxIntegrityAuditorOptions);
  runAudit(): Promise<void>;
}