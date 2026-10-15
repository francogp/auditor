import { AuditFinding, AuditorConfigFileRequirement } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_vite_plus_config.d.ts
export type VitePlusConfigRuleId = 'vite-plus-config-missing' | 'vite-plus-config-any-allowed' | 'vite-plus-config-ts-ignore-allowed' | 'vite-plus-legacy-config-forbidden';
export declare const VITE_PLUS_CONFIG_RULES: readonly VitePlusConfigRuleId[];
export interface VitePlusConfigAuditOptions {
  readonly projectRoot?: string;
  readonly configFile?: string;
  readonly fix?: boolean;
}
/**
 * Validates that a vite.config.ts file enforces strict /domain-type-first rules.
 */
export declare function auditVitePlusConfigContent(content: string, fileName: string): AuditFinding[];
export declare const VITE_PLUS_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<VitePlusConfigRuleId>;
export declare class ValidateVitePlusConfigAuditor extends BaseAuditor<VitePlusConfigRuleId> {
  constructor(options?: VitePlusConfigAuditOptions);
  runAudit(): Promise<void>;
}
//#endregion