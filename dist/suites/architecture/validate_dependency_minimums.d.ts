import { AuditorOptions, BaseAuditor } from "../../core/auditorBase.js";
import { DependencyMaximumSpec, LockfileShape, LockfileSyncCheckResult } from "../../core/auditorMinimums.js";
import { PackageJsonDTO } from "../../core/packageJson.js";
export declare const DEPENDENCY_MINIMUMS_RULES: readonly ["dependency-below-minimum-range", "dependency-below-minimum-installed", "dependency-exact-version-pinned", "dependency-exceeds-maximum-range", "dependency-exceeds-maximum-installed", "dependency-conflicting-override", "dependency-lockfile-out-of-sync"];
export type DependencyMinimumsRuleId = (typeof DEPENDENCY_MINIMUMS_RULES)[number];
export type LockfileSyncChecker = (projectRoot: string, pkg: PackageJsonDTO, lock: LockfileShape | null) => LockfileSyncCheckResult;
export type LockfileInstaller = (projectRoot: string) => void;
export interface ValidateDependencyMinimumsOptions extends Partial<AuditorOptions<DependencyMinimumsRuleId>> {
  readonly lockfileSyncChecker?: LockfileSyncChecker;
  readonly lockfileInstaller?: LockfileInstaller;
}
export declare class ValidateDependencyMinimumsAuditor extends BaseAuditor<DependencyMinimumsRuleId> {
  private readonly lockfileSyncChecker;
  private readonly lockfileInstaller;
  constructor(options?: ValidateDependencyMinimumsOptions);
  private readInstalledVersions;
  private installCommand;
  private auditDeclaredExactVersion;
  private auditDeclaredRange;
  private auditDeclaredRangeMaximum;
  private auditInstalledVersion;
  private auditInstalledVersionMaximum;
  private needsLockfileResync;
  repairDeclaredRangesInPackageJson(pkg: PackageJsonDTO, minimums: Readonly<Record<string, string>>, maximums: Readonly<Record<string, DependencyMaximumSpec>>): PackageJsonDTO;
  runAudit(): Promise<void>;
}