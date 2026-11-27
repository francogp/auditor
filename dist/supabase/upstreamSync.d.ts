import { SupabaseDockerConfig, SupabaseUpstreamMetadata } from "./supabaseConfigTypes.js";
/**
 * Extracts the leading major integer from Docker image tags (including 4-part tags like `17.6.1.136`).
 */
export declare function parsePostgresMajorVersion(imageTag: string): number;
/**
 * Inspects an upstream Supabase `docker-compose.yml` via YAML AST to extract image tags.
 */
export declare function inspectUpstreamCompose(composeYaml: string): SupabaseUpstreamMetadata;
/**
 * Generates the custom PostgreSQL `Dockerfile` packaging project `init/` SQL scripts and upstream assets.
 * Inspects `dockerDir` when present so `COPY` statements strictly match existing upstream `volumes/` entries.
 */
export declare function generateCustomDbDockerfile(postgresImage: string, projectSlug: string, dockerDir?: string): string;
/**
 * Selectively synchronizes upstream `docker/` files into `targetDir` while preserving
 * local runtime data volumes (`volumes/db/data`, `volumes/storage`), `.env`, `init/`, and `Dockerfile`.
 */
export declare function syncUpstreamDockerTree(sourceDir: string, targetDir: string): Promise<void>;
/**
 * Regenerates `<supabaseDir>/docker/Dockerfile` and syncs `init/` SQL scripts from the
 * already-cloned `<supabaseDir>/docker/docker-compose.yml` without touching GitHub or data volumes.
 */
export declare function regenerateCustomDbDockerfile(projectRoot: string, config: SupabaseDockerConfig): Promise<SupabaseUpstreamMetadata>;
/**
 * Performs a clean sparse clone of `supabase/supabase` `docker/` at `upstreamRef` inside `scratch/` and emits `Dockerfile`.
 */
export declare function cloneUpstreamSupabaseDocker(projectRoot: string, config: SupabaseDockerConfig, refOverride?: string): Promise<SupabaseUpstreamMetadata>;