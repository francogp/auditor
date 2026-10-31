import { AuditorConfigFileRequirement } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
export declare const NPMRC_CONFIG_RULES: readonly ["npmrc-config-missing", "npmrc-config-missing-setting"];
export type NpmrcConfigRuleId = (typeof NPMRC_CONFIG_RULES)[number];
export declare const CANONICAL_NPMRC_LINES: readonly ["# Estandares de reproducibilidad de paquetes (francogp/auditor)", "engine-strict=true", "package-lock=true", ""];
export declare const CANONICAL_NPMRC_CONTENT: string;
export declare const MANDATORY_NPMRC_SETTINGS: readonly {
  key: string;
  expected: string;
}[];
export declare const NPMRC_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<NpmrcConfigRuleId>;
export interface NpmrcConfigAuditorOptions {
  readonly projectRoot?: string;
  readonly configFile?: string;
}
export declare class ValidateNpmrcConfigAuditor extends BaseAuditor<NpmrcConfigRuleId> {
  constructor(options?: NpmrcConfigAuditorOptions);
  runAudit(): Promise<void>;
}