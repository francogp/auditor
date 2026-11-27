import { SupabaseDockerConfig, SupabaseMigrationSyncResult } from "./supabaseConfigTypes.js";
export interface SupabaseMigrationFile {
  readonly version: string;
  readonly fileName: string;
  readonly filePath: string;
}
export declare const DEFAULT_MIGRATION_EXCLUDE_PATTERNS: readonly string[];
export interface ListMigrationFilesOptions {
  readonly excludePatterns?: readonly string[];
}
export interface SyncDatabaseMigrationsOptions {
  readonly bootstrapSql?: string;
  readonly preflightDryRun?: boolean;
  readonly postMigrateSql?: string;
  readonly adminRole?: string;
  readonly excludePatterns?: readonly string[];
}
export interface ComposeDownOptions {
  readonly removeVolumes?: boolean;
  readonly envFilePath?: string;
}
/**
 * Lists SQL migration files matching `^(\d{14})_.*\.sql$` in lexicographical order,
 * skipping any filename matching `excludePatterns` (defaults to `['*.sqlite.sql']`).
 */
export declare function listOrderedMigrationFiles(migrationsDir: string, options?: ListMigrationFilesOptions): readonly SupabaseMigrationFile[];
/**
 * Executes bootstrap SQL (roles, `authenticator` password, JWT GUC) via `adminRole`
 * (or `supabase_admin` with automatic fallback to `postgres` when `supabase_admin` is absent).
 */
export declare function applyBootstrapSql(containerName: string, sql: string, adminRole?: string): void;
/**
 * Applies pending migrations from `migrationsDir` using `supabase_migrations.schema_migrations`
 * with `-v ON_ERROR_STOP=1`, transactional pre-flight dry-run by default, optional `postMigrateSql`,
 * and reloads PostgREST schema cache.
 */
export declare function syncDatabaseMigrations(containerName: string, migrationsDir: string, options?: SyncDatabaseMigrationsOptions): SupabaseMigrationSyncResult;
/**
 * Resolves the full Docker image tag from `profiles.remote.image`.
 */
export declare function resolveRemoteImageRef(config: SupabaseDockerConfig, tagOverride?: string): string;
/**
 * Builds the custom PostgreSQL Docker image from `<supabaseDir>/docker`.
 */
export declare function buildCustomDbImage(projectRoot: string, config: SupabaseDockerConfig, tagOverride?: string): string;
/**
 * Pushes the custom PostgreSQL Docker image to the configured registry.
 * Performs `docker login --password-stdin` automatically if `DOCKER_REGISTRY_PASSWORD` or `DOCKER_PASSWORD` is set.
 */
export declare function publishCustomDbImage(config: SupabaseDockerConfig, tagOverride?: string): string;
/**
 * Detects the running PostgreSQL major version inside a container (`null` if stopped/unavailable).
 */
export declare function detectContainerPostgresMajor(containerName: string): number | null;
/**
 * Starts a Compose stack (`up -d --wait [services...]`).
 */
export declare function composeUp(composePath: string, envFilePath?: string, services?: readonly string[]): void;
/**
 * Stops a Compose stack (`down` or `down -v`).
 */
export declare function composeDown(composePath: string, options?: ComposeDownOptions): void;
/**
 * Restarts a Compose stack.
 */
export declare function composeRestart(composePath: string, envFilePath?: string): void;
/**
 * Returns formatted `docker ps` status filtered by `projectSlug`.
 */
export declare function getStackStatus(projectSlug: string): string;
/**
 * Resolves the canonical PostgreSQL container name for a given profile (`remote`, `localFull`, or `lite` key).
 */
export declare function resolveProfileDbContainerName(projectSlug: string, profile: string): string;
/**
 * Returns `docker ps` output plus live Postgres version and migration count for a profile or project.
 */
export declare function getDetailedStackStatus(config: SupabaseDockerConfig, profile?: string): string;