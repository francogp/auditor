import { AuditEngineConfig } from "../../core/auditConfigTypes.js";
import { RuleFixContext } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
export declare const PACKAGE_SCRIPTS_RULES: readonly ["package-scripts-missing-file", "package-scripts-build-missing-audit", "package-scripts-removed-commit-gate", "package-scripts-invalid-production-ref", "package-scripts-invalid-ratchet-baseline", "package-scripts-missing-recommended", "package-scripts-obsolete"];
export type PackageScriptsRuleId = (typeof PACKAGE_SCRIPTS_RULES)[number];
export interface ValidatePackageScriptsOptions {
  readonly projectRoot?: string;
}
interface MutablePackageJson {
  name?: string;
  scripts?: Record<string, string>;
  [key: string]: unknown;
}
export declare function fixRemovedCommitGate(context: RuleFixContext<'package-scripts-removed-commit-gate'>): Promise<boolean>;
export declare function fixBuildScriptChaining(context: RuleFixContext<'package-scripts-build-missing-audit'>): Promise<boolean>;
export declare function fixMissingRecommendedScripts(context: RuleFixContext<'package-scripts-missing-recommended'>): Promise<boolean>;
export declare function fixObsoleteScripts(context: RuleFixContext<'package-scripts-obsolete'>): Promise<boolean>;
export declare class ValidatePackageScriptsAuditor extends BaseAuditor<PackageScriptsRuleId> {
  constructor(options?: ValidatePackageScriptsOptions);
  runAudit(): Promise<void>;
  private loadPackageJson;
  private checkBuildScriptChainsPreAudit;
  private checkBuildScriptChainsPostAudit;
  private rewriteBuildScript;
  private describeBuildScriptDefect;
  verifyBuildScript(pkg: {
    scripts?: Record<string, string>;
  }, config: AuditEngineConfig, isFix?: boolean): boolean;
  verifyLintScript(scripts: Record<string, string>, isFix?: boolean): boolean;
  verifyVitePlusScripts(scripts: Record<string, string>, pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }, isFix?: boolean): boolean;
  private isObsoleteAuditorScript;
  pruneObsoleteAuditorScripts(scripts: Record<string, string>, isFix?: boolean): boolean;
  verifyCiWorkflows(isFix?: boolean): boolean;
  private buildCanonicalScriptCommand;
  private isScriptCommandOutdated;
  private getMissingOrOutdatedRecommendedScripts;
  verifyRecommendedScripts(pkg: MutablePackageJson, config: AuditEngineConfig, isFix?: boolean): Promise<boolean>;
  verifyRemovedCommitGate(scripts: Record<string, string>, isFix?: boolean): boolean;
  private verifyProductionRef;
  private verifyRatchetBaseline;
}
export { ValidatePackageScriptsAuditor as PackageScriptsAuditor };