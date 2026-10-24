import { AuditorOptions, BaseAuditor } from "../../core/auditorBase.js";
import { SemverVersion } from "../../cli/check_environment.js";
export declare const ENVIRONMENT_ENGINES_RULES: readonly ["environment-engines-missing", "environment-engines-below-floor", "environment-runtime-mismatch"];
export type EnvironmentEnginesRuleId = (typeof ENVIRONMENT_ENGINES_RULES)[number];
export interface EnvironmentEnginesConfig {
  readonly enabled?: boolean;
}
export interface EngineAvailability {
  readonly hasNodeEngine: boolean;
  readonly hasNpmEngine: boolean;
}
export interface EngineFloorCheckResult {
  readonly nodeReq: SemverVersion;
  readonly npmReq: SemverVersion;
}
export declare function detectNpmVersion(): string;
export declare function extractBaseNodeVersion(engineStr: string): string;
export declare function syncNodeVersion(projectRoot: string, targetNodeEngine: string): boolean;
export declare class ValidateEnvironmentEnginesAuditor extends BaseAuditor<EnvironmentEnginesRuleId> {
  constructor(options?: Partial<AuditorOptions<EnvironmentEnginesRuleId>>);
  private validatePackageJson;
  private auditMissingEngines;
  private auditEnginesBelowFloor;
  private auditRuntimeMismatch;
  private repairEnginesInPackageJson;
  runAudit(): Promise<void>;
}