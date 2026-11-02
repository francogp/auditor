import "./auditConfigTypes.js";
import { checkInfrastructureSubsystems } from "./auditConfigInfra.js";
import { checkUiSubsystems } from "./auditConfigUi.js";
import "./auditConfigSubsystems.js";
// src/core/auditConfigValidators.ts
/**
* packages/auditor/src/core/auditConfigValidators.ts
*
* Completeness assertions for the audit configuration engine.
* Validates that all required subsystems have valid active or explicitly disabled settings.
*/
function checkSubsystemDeclarations(config) {
	return [...checkInfrastructureSubsystems(config), ...checkUiSubsystems(config)];
}
/**
* Validates that all required subsystems have valid active or explicitly disabled settings.
* Enforces the "Active by Default Subsystem Mandate & Zero Silent Skips".
*/
function assertAuditConfigComplete(config) {
	const missing = checkSubsystemDeclarations(config);
	if (missing.length > 0) throw new Error(`[AuditConfig] Invalid or incomplete configuration in audit.config.ts (Active-by-Default Configuration Mandate):\n` + missing.join("\n") + `\n\nAll subsystems must be properly configured (active by default or disabled with enabled: false or engine: 'none').`);
}
export { assertAuditConfigComplete, checkInfrastructureSubsystems, checkSubsystemDeclarations, checkUiSubsystems };
