import { BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_ephemeral_storage_isolation.d.ts
export type EphemeralStorageRuleId = 'ephemeral-no-source-temp-dirs' | 'ephemeral-no-gitignore-source-temp' | 'ephemeral-no-source-temp-references';
export declare const EPHEMERAL_STORAGE_RULES: readonly EphemeralStorageRuleId[];
export declare const CANONICAL_SOURCE_ROOTS: readonly ["src", "scripts", "tests", "supabase", "data", "database"];
export declare function getEffectiveSourceRoots(projectRoot?: string): readonly string[];
export interface EphemeralStorageIsolationAuditorOptions {
  projectRoot?: string;
  roots?: readonly string[];
  allowedDatabaseDirs?: ReadonlySet<string>;
  allowedDatabaseFiles?: ReadonlySet<string>;
}
export declare class EphemeralStorageIsolationAuditor extends BaseAuditor<EphemeralStorageRuleId> {
  private readonly allowedDatabaseDirs;
  private readonly allowedDatabaseFiles;
  constructor(optionsOrRoot?: EphemeralStorageIsolationAuditorOptions | string);
  runAudit(): void;
  private scanSourceDirectoriesOnDisk;
  private checkDatabaseDirectoryEntry;
  private checkSubDirectory;
  private walkAndCheckDirectory;
  private scanGitignoreRules;
  private scanSourceCodeReferences;
}
//#endregion