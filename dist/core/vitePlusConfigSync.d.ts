import { AuditConfig } from "./auditConfigTypes.js";
//#region src/core/vitePlusConfigSync.d.ts
export declare const LEGACY_CONFIG_FILES: readonly ["eslint.config.js", "eslint.config.mjs", "eslint.config.ts", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yaml", ".eslintrc.yml", "vitest.config.ts", "vitest.config.js", "vitest.config.mjs", "tsdown.config.ts", "tsdown.config.js", "tsconfig.build.json", ".oxlintrc.json", ".oxfmtrc.json"];
export type VitePlusSyncTarget = 'lint' | 'fmt';
/**
 * Scans for legacy ESLint configuration files and extracts globalIgnores entries.
 */
export declare function findLegacyEslintIgnores(projectRoot: string): string[];
/**
 * Resolves all canonical ignore globs derived from audit.config.ts (SSoT).
 * Evaluates paths.ignoreGlobs, paths.ignoredDirs, paths.ignoredPatterns,
 * test roots (when paths.includeTestsInCodeAudit === false), legacy ESLint
 * globalIgnores, and target-specific exclusions (lint or fmt).
 */
export declare function resolveAuditConfigIgnoreGlobs(config: AuditConfig, target?: VitePlusSyncTarget, projectRoot?: string): string[];
export declare function buildCanonicalVitePlusConfig(auditConfig: AuditConfig, projectRoot?: string): string;
export declare function extractObjectPropertyBlock(fileContent: string, propName: string): string | null;
export declare const STRICT_RULE_CHECKS: readonly ["@typescript-eslint/no-explicit-any", "@typescript-eslint/ban-ts-comment", "@typescript-eslint/consistent-type-assertions", "@francogp/domain-type/no-double-cast-unknown", "@francogp/domain-type/no-legacy-date"];
export declare function syncViteConfigWithAuditConfig(projectRoot: string, auditConfig?: AuditConfig): {
  modified: boolean;
  content: string;
};
export declare function cleanLegacyConfigFiles(projectRoot: string): readonly string[];
export declare function rewriteImportsToVitePlus(projectRoot: string, dirs?: readonly string[]): number;
export declare function migrateNodeVersion(projectRoot: string): boolean;
export declare function getVitePlusDefaultExcludeGlobs(projectRoot: string): string[];
export declare function syncPackageJsonForVitePlus(projectRoot: string): boolean;
export declare function syncVSCodeSettings(projectRoot: string, auditConfig?: AuditConfig): boolean;
export declare function repairVitePlusProject(projectRoot: string): {
  removedConfigs: readonly string[];
  rewrittenFiles: number;
  viteConfigSync: {
    modified: boolean;
    content: string;
  };
  nodeVersionMigrated: boolean;
  packageJsonUpdated: boolean;
  vscodeSync: boolean;
};
//#endregion