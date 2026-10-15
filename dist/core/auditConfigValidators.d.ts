import { AUDITOR_DIR, AUDIT_CONFIG_FILE, AuditEngineConfig, LEGACY_ROOT_CONFIG_FILES } from "./auditConfigTypes.js";
//#region src/core/auditConfigValidators.d.ts
export declare function checkInfrastructureSubsystems(config: AuditEngineConfig, missing: string[]): void;
export declare function checkUiSubsystems(config: AuditEngineConfig, missing: string[]): void;
export declare function checkSubsystemDeclarations(config: AuditEngineConfig): string[];
/**
 * Validates that all required subsystems have valid active or explicitly disabled settings.
 * Enforces the "Active by Default Subsystem Mandate & Zero Silent Skips".
 */
export declare function assertAuditConfigComplete(config: AuditEngineConfig): void;
/** Fails loudly when a configuration still lives at the project root (pre-`.auditor/` layout). */
export declare function assertNoLegacyRootConfig(projectRoot: string): void;
//#endregion
export { AUDITOR_DIR, AUDIT_CONFIG_FILE, LEGACY_ROOT_CONFIG_FILES };