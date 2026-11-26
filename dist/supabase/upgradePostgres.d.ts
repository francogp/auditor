import { SupabaseDockerConfig, SupabaseUpgradeManifest, SupabaseUpgradeManifestInput, SupabaseUpgradeOptions } from "./supabaseConfigTypes.js";
/**
 * Discovers the official upstream upgrade script (`docker/utils/upgrade-pg<major>.sh`).
 */
export declare function findUpstreamUpgradeScript(dockerDir: string, targetMajor: number): string | null;
/**
 * Builds a `SupabaseUpgradeManifest` with SHA-256 checksum over the backup artifact.
 */
export declare function createUpgradeManifest(params: SupabaseUpgradeManifestInput): SupabaseUpgradeManifest;
/**
 * Executes the non-destructive `upgrade-pg` workflow using official upstream `upgrade-pg*.sh`.
 * Never mutates `.auditor/audit.config.ts`; prints exact post-upgrade config updates instead.
 */
export declare function runUpgradePostgres(projectRoot: string, config: SupabaseDockerConfig, options: SupabaseUpgradeOptions): Promise<SupabaseUpgradeManifest>;