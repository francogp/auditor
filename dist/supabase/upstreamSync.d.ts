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
 * Performs a clean sparse clone of `supabase/supabase` `docker/` at `upstreamRef` inside `scratch/` and emits `Dockerfile`.
 */
export declare function cloneUpstreamSupabaseDocker(projectRoot: string, config: SupabaseDockerConfig, refOverride?: string): Promise<SupabaseUpstreamMetadata>;