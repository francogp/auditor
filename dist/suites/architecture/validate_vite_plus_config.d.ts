import { AuditConfig } from "../../core/auditConfigTypes.js";
import { AuditFinding, AuditorConfigFileRequirement } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_vite_plus_config.d.ts
export declare const VITE_PLUS_CONFIG_RULES: readonly ["vite-plus-config-core", "vite-plus-config-lint", "vite-plus-config-fmt", "vite-plus-config-pack", "vite-plus-config-ts"];
export type VitePlusConfigRuleId = (typeof VITE_PLUS_CONFIG_RULES)[number];
export interface VitePlusConfigAuditOptions {
  readonly projectRoot?: string;
  readonly configFile?: string;
  readonly fix?: boolean;
}
/**
 * Validates that a vite.config.ts file enforces strict /domain-type-first rules and sections
 * using the TypeScript Compiler AST.
 */
export declare function auditVitePlusConfigContent(content: string, fileName: string, auditConfig?: AuditConfig, projectRoot?: string): AuditFinding[];
export declare const VITE_PLUS_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<VitePlusConfigRuleId>;
export declare class ValidateVitePlusConfigAuditor extends BaseAuditor<VitePlusConfigRuleId> {
  constructor(options?: VitePlusConfigAuditOptions);
  runAudit(): Promise<void>;
}
//#endregion