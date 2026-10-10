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
import type { AuditorConfigFileRequirement, AuditTaskDefinition } from '../../core/auditContract.ts';
export declare function formatSectionObjectLiteral(value: unknown): string;
export declare function appendMissingSectionsToConfigFile(configFilePath: string, sectionsToInsert: Record<string, Record<string, unknown>>): void;
export declare function createDefaultAuditConfigContent(packageName?: string, tasks?: readonly AuditTaskDefinition[]): string;
export type AuditConfigRuleId = 'audit-config-missing-path' | 'audit-config-missing-file' | 'audit-config-invalid-extension' | 'audit-config-missing-gitignore-entry' | 'audit-config-missing-section' | 'audit-config-unknown-field';
export declare const AUDIT_CONFIG_RULES: readonly AuditConfigRuleId[];
export declare const PATH_ROOT_KEYS: readonly (keyof AuditEngineConfig['paths'])[];
export interface ValidateAuditConfigOptions {
    projectRoot?: string;
    fix?: boolean;
}
export declare const AUDIT_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<AuditConfigRuleId>;
export declare class ValidateAuditConfigAuditor extends BaseAuditor<AuditConfigRuleId> {
    constructor(targetPathOrOptions?: string | ValidateAuditConfigOptions);
    runAudit(): Promise<void>;
    private verifyUnknownFields;
    private verifyUnknownTopLevelSections;
    private verifyUnknownPathsFields;
    private verifyUnknownConstantsFields;
    private verifyRequiredSections;
    private applyMissingSectionsFix;
    private reportMissingSectionViolations;
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
}
//# sourceMappingURL=validate_audit_config.d.ts.map