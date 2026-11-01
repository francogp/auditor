import { AUDITOR_DIR, AUDIT_CONFIG_FILE, LEGACY_ROOT_CONFIG_FILES } from "./auditConfigTypes.js";
/**
 * Fails loudly when a configuration still lives at the project root (pre-`.auditor/` layout).
 */
export declare function assertNoLegacyRootConfig(projectRoot: string): void;
/**
 * Determines whether a linter or validator configuration rule value denotes a disabled rule.
 * Recognizes boolean false, string 'off', numeric 0, or array configurations whose severity is disabled.
 */
export declare function isConfigRuleDisabled(ruleValue: unknown): boolean;
export { AUDITOR_DIR, AUDIT_CONFIG_FILE, LEGACY_ROOT_CONFIG_FILES };