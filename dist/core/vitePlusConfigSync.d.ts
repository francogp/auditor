import { AuditConfig } from "./auditConfigTypes.js";
import { extractAstPropertyBlock } from "./viteConfigAst.js";
//#region src/core/vitePlusConfigSync.d.ts
export declare const LEGACY_CONFIG_FILES: readonly ["eslint.config.js", "eslint.config.mjs", "eslint.config.ts", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yaml", ".eslintrc.yml", "vitest.config.ts", "vitest.config.js", "vitest.config.mjs", "tsdown.config.ts", "tsdown.config.js", "tsconfig.build.json", ".oxlintrc.json", ".oxfmtrc.json"];
export type VitePlusSyncTarget = 'lint' | 'fmt';
export declare const STRICT_RULE_CHECKS: string[];
/**
 * Scans for legacy ESLint configuration files and extracts globalIgnores entries
 * using native JSON parsing (.eslintrc.json) and TypeScript Compiler AST (.js/.mjs/.ts).
 */
export declare function findLegacyEslintIgnores(projectRoot: string): string[];
/**
 * Resolves all canonical ignore globs derived from audit.config.ts (SSoT).
 */
export declare function resolveAuditConfigIgnoreGlobs(config: AuditConfig, target?: VitePlusSyncTarget, projectRoot?: string): string[];
/**
 * Generates the canonical Vite+ unified configuration (vite.config.ts)
 * using the TypeScript Compiler AST printer.
 */
export declare function buildCanonicalVitePlusConfig(auditConfig: AuditConfig, projectRoot?: string): string;
export declare function syncViteConfigWithAuditConfig(projectRoot: string, auditConfig?: AuditConfig): {
  modified: boolean;
  content: string;
};
export declare function cleanLegacyConfigFiles(projectRoot: string): readonly string[];
export declare const BANNED_COMPRESSION_MODULES: readonly ["vite-plugin-compression", "vite-plugin-compression2"];
/**
 * Searches for homebrew compression scripts in scripts/ or other project directories.
 */
export declare function findHomebrewCompressionFiles(projectRoot: string): string[];
/**
 * Detects homebrew or third-party compression plugin imports in vite.config.ts.
 */
export declare function detectHomebrewCompressionImports(viteConfigContent: string): string[];
export declare function migrateHomebrewCompressionInViteConfig(viteConfigContent: string): {
  content: string;
  modified: boolean;
};
/**
 * Removes homebrew compression scripts found on disk and cleans their stale entries
 * from the sibling AGENTS.md DOX index if present.
 */
export declare function cleanHomebrewCompressionFiles(projectRoot: string): string[];
export declare function rewriteImportsToVitePlus(projectRoot: string, dirs?: readonly string[]): number;
export declare function migrateNodeVersion(projectRoot: string): boolean;
export declare function getVitePlusDefaultExcludeGlobs(projectRoot: string): string[];
export declare function migrateViteCommandsToVp(cmd: string): string;
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
export { extractAstPropertyBlock as extractObjectPropertyBlock };