import { ACKNOWLEDGEABLE_EXEMPTION_POLICIES } from "./auditConfigTypes.js";
import { getAuditConfig } from "./auditConfigLoader.js";
import { isTestPath } from "./auditTestPredicates.js";
import { isCliPath, isScriptPath } from "./auditCodeRoots.js";
import { isDataPath, isDemoPath, isExemptFile } from "./auditPathPredicates.js";
import "./auditConfig.js";
// src/core/exemptionPolicies.ts
/**
* src/core/exemptionPolicies.ts
*
* EXEMPTION POLICY REGISTRY (Node.js 26+ Native)
* Single registry of every path-based policy that silences rules for a set of files.
* `validate_audit_coverage` replays these policies over every tracked file to report
* DEGRADED coverage: files that are scanned but have rules silenced by configuration.
*
* - `configured` policies depend on host configuration and degrade coverage unless acknowledged
*   through `coverage.acknowledgedDegradations`.
* - `structural` policies are framework design (e.g. tests are not production code) and only
*   appear in the coverage map for transparency.
*/
const STRUCTURAL_EXEMPTION_POLICIES = ["test"];
const EXEMPTION_POLICY_IDS = [...ACKNOWLEDGEABLE_EXEMPTION_POLICIES, ...STRUCTURAL_EXEMPTION_POLICIES];
const EXEMPTION_POLICY_KINDS = ["configured", "structural"];
function isCodeFile(relPosixPath) {
	return /\.(?:ts|tsx|js|jsx|mjs|cjs|vue)$/i.test(relPosixPath);
}
const EXEMPTION_POLICIES = [
	{
		id: "cli",
		kind: "configured",
		configKey: "paths.cliRoots",
		silences: "console, CWE security, and production rules",
		matches: (p, config) => isCodeFile(p) && isCliPath(p, config)
	},
	{
		id: "scripts",
		kind: "configured",
		configKey: "paths.scriptsRoots",
		silences: "console, duplicate constants, and production rules",
		matches: (p, config) => isCodeFile(p) && isScriptPath(p, config)
	},
	{
		id: "data",
		kind: "configured",
		configKey: "paths.dataRoots",
		silences: "complexity, LOC, and magic numbers",
		matches: (p) => isCodeFile(p) && isDataPath(p)
	},
	{
		id: "demo",
		kind: "configured",
		configKey: "paths.demoRoots",
		silences: "complexity, LOC, and magic numbers",
		matches: (p) => isCodeFile(p) && isDemoPath(p)
	},
	{
		id: "exemptFiles",
		kind: "configured",
		configKey: "paths.exemptFiles",
		silences: "domain, date, and timezone rules",
		matches: (p, config) => isCodeFile(p) && isExemptFile(p, config)
	},
	{
		id: "test",
		kind: "structural",
		configKey: "paths.testRoots",
		silences: "production code rules",
		matches: (p) => isCodeFile(p) && isTestPath(p)
	}
];
/** Every policy matching the given file, in registry order. */
function getMatchingExemptionPolicies(relPosixPath, config = getAuditConfig()) {
	return EXEMPTION_POLICIES.filter((policy) => policy.matches(relPosixPath, config));
}
export { EXEMPTION_POLICIES, EXEMPTION_POLICY_IDS, EXEMPTION_POLICY_KINDS, STRUCTURAL_EXEMPTION_POLICIES, getMatchingExemptionPolicies, isCodeFile };
