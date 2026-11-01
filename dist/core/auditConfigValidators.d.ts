import { AuditEngineConfig } from "./auditConfigTypes.js";
import { checkInfrastructureSubsystems } from "./auditConfigInfra.js";
import { checkUiSubsystems } from "./auditConfigUi.js";
export declare function checkSubsystemDeclarations(config: AuditEngineConfig): readonly string[];
/**
 * Validates that all required subsystems have valid active or explicitly disabled settings.
 * Enforces the "Active by Default Subsystem Mandate & Zero Silent Skips".
 */
export declare function assertAuditConfigComplete(config: AuditEngineConfig): void;
export { checkInfrastructureSubsystems, checkUiSubsystems };