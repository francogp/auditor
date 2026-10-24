/**
 * src/cli/update_package.ts
 *
 * Dedicated CLI updater for @francogp/auditor across host repositories.
 * Performs a standard, hermetic npm update without ad-hoc scripts or git cloning.
 */
export interface UpdateAuditorOptions {
  cwd?: string;
  silent?: boolean;
  stopAt?: string;
  targetVersion?: string;
  checkOnly?: boolean;
}
export interface UpdateAuditorResult {
  success: boolean;
  projectRoot: string;
  previousVersion: string;
  newVersion: string;
  updated: boolean;
  updateAvailable?: boolean;
  error?: string;
}
export declare function findHostProjectRoot(startDir?: string, stopAt?: string): string;
export declare function readInstalledAuditorVersion(projectRoot: string): string;
export declare function parseTagSemver(tagStr: string): {
  major: number;
  minor: number;
  patch: number;
  isClean: boolean;
} | null;
export declare function compareTagsDescending(tagA: string, tagB: string): number;
export declare function extractTagsFromLsRemote(stdout: string): string[];
export declare function resolveLatestAuditorTag(repoUrl?: string): string;
export declare function preSyncHostPackageJson(projectRoot: string): boolean;
export declare function updateAuditorPackage(options?: UpdateAuditorOptions): UpdateAuditorResult;
export declare function runAuditorFixAutoRemediation(projectRoot: string, silent?: boolean): boolean;
export declare function renderUpdateHelp(): string;
export declare function runCli(): void;