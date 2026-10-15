//#region src/core/auditConfigTypes.ts
/**
* packages/auditor/src/core/auditConfigTypes.ts
*
* TypeScript types and interfaces for the audit configuration contract.
*/
const AUDITOR_DIR = ".auditor";
const AUDIT_CONFIG_FILE = `${AUDITOR_DIR}/audit.config.ts`;
const AUDIT_CONFIG_JSON_FILE = `${AUDITOR_DIR}/audit.config.json`;
const LEGACY_ROOT_CONFIG_FILES = ["audit.config.ts", "audit.config.json"];
const AUDIT_LIST_FILTERS = [
	"all",
	"enabled",
	"disabled"
];
const PERSISTENCE_ENGINES = [
	"supabase",
	"sqlite",
	"postgres",
	"hybrid",
	"none"
];
const FALLOW_TARGET_PRIORITIES = [
	"critical",
	"high",
	"medium",
	"moderate",
	"low",
	"all"
];
const DEFAULT_MAX_AUDIT_STALENESS_MINUTES = 5;
const PACKAGE_DISTRIBUTION_LEVELS = [
	"suggestion",
	"warning",
	"error"
];
const VERSION_TARGET_TYPES = ["json", "ts"];
const NPM_AUDIT_SEVERITY_LEVELS = [
	"info",
	"low",
	"moderate",
	"high",
	"critical"
];
const ACKNOWLEDGEABLE_EXEMPTION_POLICIES = [
	"cli",
	"scripts",
	"data",
	"demo",
	"exemptFiles"
];
//#endregion
export { ACKNOWLEDGEABLE_EXEMPTION_POLICIES, AUDITOR_DIR, AUDIT_CONFIG_FILE, AUDIT_CONFIG_JSON_FILE, AUDIT_LIST_FILTERS, DEFAULT_MAX_AUDIT_STALENESS_MINUTES, FALLOW_TARGET_PRIORITIES, LEGACY_ROOT_CONFIG_FILES, NPM_AUDIT_SEVERITY_LEVELS, PACKAGE_DISTRIBUTION_LEVELS, PERSISTENCE_ENGINES, VERSION_TARGET_TYPES };
