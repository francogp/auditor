// src/core/auditConfigTypes.ts
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
const NON_SUPABASE_PERSISTENCE_ENGINES = ["sqlite", "none"];
const NON_SUPABASE_PERSISTENCE_ENGINE_SET = new Set(NON_SUPABASE_PERSISTENCE_ENGINES);
const SUPABASE_EXCLUSIVE_PERSISTENCE_KEYS = [
	"dockerContainer",
	"supabaseDir",
	"exemptRlsTables",
	"schemaQualified"
];
const SUPABASE_EXCLUSIVE_PERSISTENCE_KEY_SET = new Set(SUPABASE_EXCLUSIVE_PERSISTENCE_KEYS);
function isSupabaseExclusivePersistenceKey(key, engine) {
	if (engine && NON_SUPABASE_PERSISTENCE_ENGINE_SET.has(engine)) return SUPABASE_EXCLUSIVE_PERSISTENCE_KEY_SET.has(key);
	return false;
}
const FALLOW_TARGET_PRIORITIES = [
	"critical",
	"high",
	"medium",
	"moderate",
	"low",
	"all"
];
const FALLOW_TYPE_AWARE_REQUIRE_POLICIES = ["best-effort", "complete"];
const FALLOW_MUTATION_RUNNERS = [
	"auto",
	"vitest",
	"node-test",
	"bun-test"
];
const FALLOW_MUTATION_OPT_IN_OPERATORS = [
	"block-statement",
	"array-literal",
	"object-literal",
	"method-expression",
	"switch-case",
	"call-expression",
	"throw-statement",
	"regex-constructor",
	"regex-assertion"
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
const CANONICAL_RULE_SEVERITY_LEVELS = [
	"error",
	"warn",
	"off"
];
const VITE_PLUS_NATIVE_LINTER_PLUGINS = [
	"vitest",
	"node",
	"promise",
	"unicorn",
	"typescript",
	"vue",
	"react",
	"import",
	"jsdoc",
	"jest",
	"jsx-a11y",
	"nextjs",
	"react-perf"
];
export { ACKNOWLEDGEABLE_EXEMPTION_POLICIES, AUDITOR_DIR, AUDIT_CONFIG_FILE, AUDIT_CONFIG_JSON_FILE, AUDIT_LIST_FILTERS, CANONICAL_RULE_SEVERITY_LEVELS, DEFAULT_MAX_AUDIT_STALENESS_MINUTES, FALLOW_MUTATION_OPT_IN_OPERATORS, FALLOW_MUTATION_RUNNERS, FALLOW_TARGET_PRIORITIES, FALLOW_TYPE_AWARE_REQUIRE_POLICIES, LEGACY_ROOT_CONFIG_FILES, NON_SUPABASE_PERSISTENCE_ENGINES, NON_SUPABASE_PERSISTENCE_ENGINE_SET, NPM_AUDIT_SEVERITY_LEVELS, PACKAGE_DISTRIBUTION_LEVELS, PERSISTENCE_ENGINES, SUPABASE_EXCLUSIVE_PERSISTENCE_KEYS, SUPABASE_EXCLUSIVE_PERSISTENCE_KEY_SET, VERSION_TARGET_TYPES, VITE_PLUS_NATIVE_LINTER_PLUGINS, isSupabaseExclusivePersistenceKey };
