import { AuditorOptions, BaseAuditor } from "../../core/auditorBase.js";
import { DeclaredDependency, findDeclaredDependency } from "../../core/auditorMinimums.js";
export declare const DEPENDENCY_MINIMUMS_RULES: readonly ["dependency-below-minimum-range", "dependency-below-minimum-installed", "dependency-exact-version-pinned", "dependency-exceeds-maximum-range", "dependency-exceeds-maximum-installed"];
export type DependencyMinimumsRuleId = (typeof DEPENDENCY_MINIMUMS_RULES)[number];
export declare function extractExactPinnedVersion(range: string): string | null;
export declare function normalizePinnedVersionToCaret(range: string): string | null;
export declare class ValidateDependencyMinimumsAuditor extends BaseAuditor<DependencyMinimumsRuleId> {
  constructor(options?: Partial<AuditorOptions<DependencyMinimumsRuleId>>);
  private readInstalledVersions;
  private installCommand;
  private auditDeclaredExactVersion;
  private auditDeclaredRange;
  private auditDeclaredRangeMaximum;
  private auditInstalledVersion;
  private auditInstalledVersionMaximum;
  private repairDeclaredRangesInPackageJson;
  runAudit(): Promise<void>;
}
export { type DeclaredDependency, findDeclaredDependency };