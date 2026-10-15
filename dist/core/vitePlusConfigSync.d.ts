import { AuditConfig } from "./auditConfigTypes.js";
//#region src/core/vitePlusConfigSync.d.ts
export declare const LEGACY_CONFIG_FILES: readonly ["eslint.config.js", "eslint.config.mjs", "eslint.config.ts", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yaml", ".eslintrc.yml", "vitest.config.ts", "vitest.config.js", "vitest.config.mjs", "tsdown.config.ts", "tsdown.config.js", "tsconfig.build.json", ".oxlintrc.json", ".oxfmtrc.json"];
export declare function buildCanonicalVitePlusConfig(auditConfig: AuditConfig): string;
export declare function extractObjectPropertyBlock(fileContent: string, propName: string): string | null;
export declare function syncViteConfigWithAuditConfig(projectRoot: string, auditConfig?: AuditConfig): {
  modified: boolean;
  content: string;
};
export declare function cleanLegacyConfigFiles(projectRoot: string): readonly string[];
export declare function rewriteImportsToVitePlus(projectRoot: string, dirs?: readonly string[]): number;
export declare function migrateNodeVersion(projectRoot: string): boolean;
export declare function syncPackageJsonForVitePlus(projectRoot: string): boolean;
export declare function repairVitePlusProject(projectRoot: string): {
  removedConfigs: readonly string[];
  rewrittenFiles: number;
  viteConfigSync: {
    modified: boolean;
    content: string;
  };
  nodeVersionMigrated: boolean;
  packageJsonUpdated: boolean;
};
//#endregion