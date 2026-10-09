/**
 * packages/auditor/src/core/auditConfigTypes.ts
 *
 * TypeScript types and interfaces for the audit configuration contract.
 */
export const AUDITOR_DIR = '.auditor';
export const AUDIT_CONFIG_FILE = `${AUDITOR_DIR}/audit.config.ts`; // path-ok: Canonical relative configuration path constant
export const AUDIT_CONFIG_JSON_FILE = `${AUDITOR_DIR}/audit.config.json`; // path-ok: Canonical relative configuration path constant
export const LEGACY_ROOT_CONFIG_FILES = ['audit.config.ts', 'audit.config.json'];
export const AUDIT_LIST_FILTERS = ['all', 'enabled', 'disabled'];
export const PERSISTENCE_ENGINES = ['supabase', 'sqlite', 'postgres', 'hybrid', 'none'];
export const FALLOW_TARGET_PRIORITIES = ['critical', 'high', 'medium', 'moderate', 'low', 'all'];
export const DEFAULT_MAX_AUDIT_STALENESS_MINUTES = 5;
export const PACKAGE_DISTRIBUTION_LEVELS = ['suggestion', 'warning', 'error'];
export const VERSION_TARGET_TYPES = ['json', 'ts'];
export const NPM_AUDIT_SEVERITY_LEVELS = ['info', 'low', 'moderate', 'high', 'critical'];
export const ACKNOWLEDGEABLE_EXEMPTION_POLICIES = ['cli', 'scripts', 'data', 'demo', 'exemptFiles'];
//# sourceMappingURL=auditConfigTypes.js.map