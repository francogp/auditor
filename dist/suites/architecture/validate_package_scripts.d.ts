/**
 * src/suites/architecture/validate_package_scripts.ts
 *
 * PACKAGE SCRIPTS & BUILD CHAINING INTEGRITY AUDITOR (Node.js 26+)
 *
 * Validates package.json scripts hygiene, build pipeline chaining (pre-audit + post-audit),
 * warning ratchet references and baselines, and canonical script naming.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* src/suites/architecture/validate_package_scripts.ts
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
export declare const PACKAGE_SCRIPTS_RULES: readonly ["package-scripts-missing-file", "package-scripts-build-missing-audit", "package-scripts-removed-commit-gate", "package-scripts-invalid-production-ref", "package-scripts-invalid-ratchet-baseline", "package-scripts-missing-recommended", "package-scripts-obsolete"];
export type PackageScriptsRuleId = (typeof PACKAGE_SCRIPTS_RULES)[number];
export interface ValidatePackageScriptsOptions {
    projectRoot?: string;
    fix?: boolean;
}
export declare class ValidatePackageScriptsAuditor extends BaseAuditor<PackageScriptsRuleId> {
    constructor(targetPathOrOptions?: string | ValidatePackageScriptsOptions);
    runAudit(): Promise<void>;
    private loadPackageJson;
    private checkBuildScriptChainsPreAudit;
    private checkBuildScriptChainsPostAudit;
    private verifyBuildScript;
    private verifyLintScript;
    private isObsoleteAuditorScript;
    private pruneObsoleteAuditorScripts;
    private getMissingRecommendedScripts;
    private verifyRecommendedScripts;
    private verifyRemovedCommitGate;
    private verifyProductionRef;
    private verifyRatchetBaseline;
}
export { ValidatePackageScriptsAuditor as PackageScriptsAuditor };
//# sourceMappingURL=validate_package_scripts.d.ts.map