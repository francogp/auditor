import { FALLOW_TARGET_PRIORITIES } from "./auditConfigTypes.js";
import { createDomainSet } from "./domainCollections.js";
// src/core/auditConfigUi.ts
/**
* packages/auditor/src/core/auditConfigUi.ts
*
* UI and tooling subsystem declaration validators for audit configurations.
* Enforces active-by-default configuration invariants for styles, templates, fallow, and runner subsystems.
*/
const FALLOW_TARGET_PRIORITIES_SET = createDomainSet(FALLOW_TARGET_PRIORITIES);
function checkUiSubsystems(config) {
	const missing = [];
	if (typeof config.styles?.zLayersEnabled !== "boolean") missing.push("  - 'styles': Field 'zLayersEnabled' must be boolean (true or false).");
	if (typeof config.templates?.requireInputIds !== "boolean") missing.push("  - 'templates': Field 'requireInputIds' must be boolean (true or false).");
	if (typeof config.agentPlugin?.enabled !== "boolean") missing.push("  - 'agentPlugin': Field 'enabled' must be boolean (true or false).");
	if (config.fallow?.maxTargetPriority !== void 0) {
		const val = config.fallow.maxTargetPriority;
		if (!(typeof val === "string" && FALLOW_TARGET_PRIORITIES_SET.has(val)) && !(typeof val === "number" && Number.isFinite(val) && val >= 0 && val <= 100)) missing.push(`  - 'fallow': Invalid target priority ('${val}'). Must be a number (0-100) or one of: ${FALLOW_TARGET_PRIORITIES.join(" | ")}.`);
	}
	if (config.runner?.maxStalenessMinutes !== void 0 && config.runner.maxStalenessMinutes <= 0) missing.push("  - 'runner': 'maxStalenessMinutes' must be a positive number greater than 0.");
	return missing;
}
export { checkUiSubsystems };
