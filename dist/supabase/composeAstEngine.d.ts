import { SupabaseComposeTransformOptions, SupabaseComposeTransformResult, SupabaseDockerConfig } from "./supabaseConfigTypes.js";
import { Document } from "yaml";
export declare function mergeOverlay(doc: Document, overlayYaml: string): void;
/**
 * Transforms an upstream Supabase `docker-compose.yml` into a bind-mount-free `remote` stack.
 */
export declare function transformRemoteComposeYaml(composeYaml: string, config: SupabaseDockerConfig, options?: SupabaseComposeTransformOptions): SupabaseComposeTransformResult;
/**
 * Transforms an upstream compose file for isolated concurrent `localFull` execution.
 */
export declare function transformLocalFullComposeYaml(composeYaml: string, config: SupabaseDockerConfig, options?: SupabaseComposeTransformOptions): SupabaseComposeTransformResult;
export interface ExtractComposePlaceholdersOptions {
  readonly requiredOnly?: boolean;
}
/**
 * Extracts `${VAR}` placeholder names referenced inside non-comment YAML nodes of a compose file.
 * When `requiredOnly` is true, excludes placeholders with defaults or conditionals (`${VAR:-...}`, `${VAR-...}`, `${VAR:+...}`, `${VAR+...}`).
 */
export declare function extractComposeEnvPlaceholders(composeYaml: string, options?: ExtractComposePlaceholdersOptions): readonly string[];
/**
 * Builds deterministic dummy values for `docker compose config -q` when no server `.env` exists yet.
 */
export declare function buildDummyValidationEnv(placeholders: readonly string[]): Map<string, string>;
/**
 * Runs `docker compose -f <composePath> config -q` to validate final Compose syntax.
 */
export declare function validateComposeWithDocker(composePath: string, envFilePath?: string): {
  readonly ok: boolean;
  readonly stderr: string;
};