import { AUDITOR_DIR, AUDIT_CONFIG_FILE, LEGACY_ROOT_CONFIG_FILES } from "./auditConfigTypes.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
// src/core/auditConfigLayout.ts
/**
* packages/auditor/src/core/auditConfigLayout.ts
*
* Layout governance and rule disablement assertions for audit configurations.
* Enforces pre-.auditor/ directory migration and rule severity evaluation.
*/
enableCompileCache();
/**
* Fails loudly when a configuration still lives at the project root (pre-`.auditor/` layout).
*/
function assertNoLegacyRootConfig(projectRoot) {
	const legacy = LEGACY_ROOT_CONFIG_FILES.filter((f) => fs.existsSync(path.resolve(projectRoot, f)));
	if (legacy.length > 0) throw new Error(`[AuditConfig] Root-level ${legacy.join(", ")} is no longer supported: auditor configuration lives in '${AUDITOR_DIR}/'. Run 'auditor fix' (or 'npm run auditor:fix') to move it to '${AUDIT_CONFIG_FILE}' and rewrite its relative imports.`);
}
/**
* Determines whether a linter or validator configuration rule value denotes a disabled rule.
* Recognizes boolean false, string 'off', numeric 0, or array configurations whose severity is disabled.
*/
function isConfigRuleDisabled(ruleValue) {
	if (ruleValue === false || ruleValue === "off" || ruleValue === 0) return true;
	if (Array.isArray(ruleValue) && ruleValue.length > 0) {
		const first = ruleValue[0];
		return first === false || first === "off" || first === 0;
	}
	return false;
}
export { AUDITOR_DIR, AUDIT_CONFIG_FILE, LEGACY_ROOT_CONFIG_FILES, assertNoLegacyRootConfig, isConfigRuleDisabled };
