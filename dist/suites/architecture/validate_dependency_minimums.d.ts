import { AuditorOptions, BaseAuditor } from "../../core/auditorBase.js";
import { DeclaredDependency, findDeclaredDependency } from "../../core/auditorMinimums.js";
//#region src/suites/architecture/validate_dependency_minimums.d.ts
export declare const DEPENDENCY_MINIMUMS_RULES: readonly ["dependency-below-minimum-range", "dependency-below-minimum-installed", "dependency-exceeds-maximum-range", "dependency-exceeds-maximum-installed"];
export type DependencyMinimumsRuleId = (typeof DEPENDENCY_MINIMUMS_RULES)[number];
export declare class ValidateDependencyMinimumsAuditor extends BaseAuditor<DependencyMinimumsRuleId> {
  constructor(options?: Partial<AuditorOptions<DependencyMinimumsRuleId>>);
  private readInstalledVersions;
  private installCommand;
  private auditDeclaredRange;
  private auditDeclaredRangeMaximum;
  private auditInstalledVersion;
  private auditInstalledVersionMaximum;
  runAudit(): Promise<void>;
}
//#endregion
export { type DeclaredDependency, findDeclaredDependency };