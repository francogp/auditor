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
export type AuditConfigRuleId = 'audit-config-missing-path' | 'audit-config-missing-file' | 'audit-config-invalid-extension';
export declare const AUDIT_CONFIG_RULES: readonly AuditConfigRuleId[];
export declare const PATH_ROOT_KEYS: readonly (keyof AuditEngineConfig['paths'])[];
export declare class ValidateAuditConfigAuditor extends BaseAuditor<AuditConfigRuleId> {
    constructor(targetPath?: string);
    runAudit(): Promise<void>;
    private checkPathExists;
    private verifyPathRoots;
    private verifyPersistencePaths;
    private verifyDomainAndStylePaths;
    private verifyExtensionPaths;
}
//# sourceMappingURL=validate_audit_config.d.ts.map