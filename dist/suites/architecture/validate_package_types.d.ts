/**
 * src/suites/architecture/validate_package_types.ts
 *
 * PACKAGE TYPES RESOLUTION AUDITOR (Node.js 26+ Native)
 * Validates TypeScript declaration (.d.ts) resolution and dual ESM/CJS compatibility
 * for compiled packages in dist/ via @arethetypeswrong/core (ATTW).
 *
 * Capabilities: requiresBuild (executed exclusively post-build via preset=build).
 */
import { Package, type Problem } from '@arethetypeswrong/core';
import { BaseAuditor } from '../../core/auditorBase.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
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
//# sourceMappingURL=validate_package_types.d.ts.map