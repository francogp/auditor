/**
 * packages/auditor/src/core/auditConfigAstValidator.ts
 *
 * Single Source of Truth AST validator and schema enforcer for .auditor/audit.config.ts.
 * Parses TypeScript AST to detect:
 * 1. Duplicate keys in object literals (which silently overwrite earlier keys in JavaScript)
 * 2. Duplicate entries in configuration arrays (redundant items in unique sets)
 * 3. Declared subsystems missing explicit 'enabled: boolean' (strict schema / DTD conformance)
 */
export type AuditConfigAstRuleId = 'audit-config-duplicate-key' | 'audit-config-duplicate-entry' | 'audit-config-missing-enabled';
export interface AuditConfigAstViolation {
  readonly ruleId: AuditConfigAstRuleId;
  readonly key: string;
  readonly path: string;
  readonly line: number;
  readonly col: number;
  readonly originalLine?: number;
  readonly originalCol?: number;
  readonly message: string;
}
/**
 * Top-level entries in defineAuditConfig that are NOT toggleable subsystems
 * and therefore do not require an `enabled: boolean` property.
 */
export declare const SUBSYSTEMS_WITHOUT_ENABLED: Set<string>;
/**
 * Parses and analyzes the TypeScript AST of .auditor/audit.config.ts to detect:
 * - Duplicate properties in object literals
 * - Duplicate entries in array collections
 * - Missing 'enabled' in declared subsystems
 */
export declare function validateAuditConfigAst(sourceText: string, fileName?: string): AuditConfigAstViolation[];
/**
 * Asserts that the configuration file does not contain duplicate property keys.
 * Throws a loud descriptive Error if duplicate keys are detected, preventing
 * JavaScript/Node runtime from silently overwriting earlier configurations.
 */
export declare function assertNoDuplicateKeysInAuditConfig(sourceText: string, filePath?: string): void;
/**
 * Asserts that the configuration file on disk does not contain duplicate keys.
 */
export declare function assertNoDuplicateKeysInAuditConfigFile(configPath: string): void;