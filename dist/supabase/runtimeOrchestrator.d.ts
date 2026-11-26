import { SupabaseDockerConfig, SupabaseMigrationSyncResult } from "./supabaseConfigTypes.js";
export interface SupabaseMigrationFile {
  readonly version: string;
  readonly fileName: string;
  readonly filePath: string;
}
/**
 * Lists SQL migration files matching `^(\d{14})_.*\.sql$` in lexicographical order.
 */
export declare function listOrderedMigrationFiles(migrationsDir: string): readonly SupabaseMigrationFile[];
/**
 * Applies pending migrations from `migrationsDir` using `supabase_migrations.schema_migrations`
 * and reloads PostgREST schema cache.
 */
export declare function syncDatabaseMigrations(containerName: string, migrationsDir: string, bootstrapSql?: string): SupabaseMigrationSyncResult;
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
 * Starts a Compose stack (`up -d --wait`).
 */
export declare function composeUp(composePath: string, envFilePath?: string): void;
/**
 * Stops a Compose stack (`down` or `down -v`).
 */
export declare function composeDown(composePath: string, removeVolumes?: boolean): void;
/**
 * Restarts a Compose stack.
 */
export declare function composeRestart(composePath: string): void;
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