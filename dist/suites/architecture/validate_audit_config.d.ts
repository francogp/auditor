/**
 * packages/auditor/src/suites/architecture/validate_audit_config.ts
 *
 * AUDIT CONFIGURATION INTEGRITY VALIDATOR (Node.js 26+)
 *
 * Validates that 100% of files, paths, directories, modules, and extensions
 * declared in audit.config.ts physically exist on disk.
 * Emits severity: 'error' if any referenced path is missing.
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
import { type AuditEngineConfig } from '../../core/auditConfig.ts';
import type { AuditorConfigFileRequirement } from '../../core/auditContract.ts';
export declare function createDefaultAuditConfigContent(packageName?: string): string;
export type AuditConfigRuleId = 'audit-config-missing-path' | 'audit-config-missing-file' | 'audit-config-invalid-extension' | 'audit-config-missing-gitignore-entry' | 'audit-config-missing-build-audit' | 'audit-config-removed-commit-gate' | 'audit-config-invalid-production-ref' | 'audit-config-invalid-baseline' | 'audit-config-missing-recommended-script';
export declare const AUDIT_CONFIG_RULES: readonly AuditConfigRuleId[];
export declare const ESSENTIAL_AUDITOR_SCRIPTS: Readonly<Record<string, string>>;
export declare const PATH_ROOT_KEYS: readonly (keyof AuditEngineConfig['paths'])[];
export interface ValidateAuditConfigOptions {
    projectRoot?: string;
    fix?: boolean;
}
export declare const AUDIT_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<AuditConfigRuleId>;
export declare class ValidateAuditConfigAuditor extends BaseAuditor<AuditConfigRuleId> {
    constructor(targetPathOrOptions?: string | ValidateAuditConfigOptions);
    runAudit(): Promise<void>;
    /** Validates the committed baseline format when present (its absence is reported by the ratchet itself). */
    private verifyRatchetBaseline;
    private verifyProductionRef;
    /** Flags scripts still invoking the removed `audit:for-commit` gate. Returns true when fix mode rewrote them. */
    private verifyRemovedCommitGate;
    private handleMissingGitIgnoreFile;
    private appendMissingGitIgnoreEntries;
    private verifyGitIgnore;
    private checkPathExists;
    private verifyPathRoots;
    private verifyPersistencePaths;
    private verifyDomainPaths;
    private verifyStylesPaths;
    private verifyDomainAndStylePaths;
    private verifyExtensionPaths;
    private loadPackageJson;
    private checkBuildScriptChainsAuditor;
    private verifyBuildScript;
    private getMissingRecommendedScripts;
    private verifyRecommendedScripts;
    private verifyPackageScripts;
}
//# sourceMappingURL=validate_audit_config.d.ts.map