//#region src/cli/sync_env_scripts.d.ts
/**
 * src/cli/sync_env_scripts.ts
 *
 * Environment Scripts Synchronizer (Node.js 26+ Native)
 * Synchronizes the canonical setup-linux.sh and setup-windows.ps1 from @francogp/auditor
 * into the host project root, ensuring zero code divergence.
 */
export interface SyncEnvOptions {
  targetDir?: string;
  dryRun?: boolean;
}
export declare function syncEnvScripts(options?: SyncEnvOptions): {
  success: boolean;
  filesUpdated: string[];
  message: string;
};
//#endregion