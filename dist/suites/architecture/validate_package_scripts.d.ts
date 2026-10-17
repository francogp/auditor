import { BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_package_scripts.d.ts
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
  private verifyVitePlusScripts;
  private isObsoleteAuditorScript;
  private pruneObsoleteAuditorScripts;
  private verifyCiWorkflows;
  private resolveTargetScriptCommand;
  private isScriptCommandOutdated;
  private getMissingOrOutdatedRecommendedScripts;
  private verifyRecommendedScripts;
  private verifyRemovedCommitGate;
  private verifyProductionRef;
  private verifyRatchetBaseline;
}
//#endregion
export { ValidatePackageScriptsAuditor as PackageScriptsAuditor };