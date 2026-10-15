import { AuditFinding } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
import { Package, Problem } from "@arethetypeswrong/core";
//#region src/suites/architecture/validate_package_types.d.ts
export declare const PACKAGE_TYPES_RULES: readonly ["pkg-types-resolution", "pkg-types-dual-hazard", "pkg-types-missing-dts"];
export type PackageTypesRuleId = (typeof PACKAGE_TYPES_RULES)[number];
/**
 * Builds an in-memory Package representation for @arethetypeswrong/core from a disk directory.
 */
export declare function createPackageFromDirectory(pkgDir: string): Package;
/**
 * Parses @arethetypeswrong/core problems into canonical AuditFindings.
 */
export declare function parseAttwProblems(problems: readonly Problem[], pkgJson: Record<string, unknown>): AuditFinding[];
export declare class ValidatePackageTypesAuditor extends BaseAuditor<PackageTypesRuleId> {
  constructor(options?: {
    projectRoot?: string;
  });
  runAudit(): Promise<void>;
}
//#endregion