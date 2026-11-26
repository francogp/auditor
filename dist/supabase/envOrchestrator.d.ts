import { SupabaseDockerConfig } from "./supabaseConfigTypes.js";
/**
 * Returns true if `value` matches any known insecure upstream placeholder substring.
 */
export declare function isInsecurePlaceholder(value: string): boolean;
/**
 * Parses `.env` text into a key-value Map (preserving last occurrence and stripping quotes).
 */
export declare function parseEnvContent(content: string): Map<string, string>;
/**
 * Lists all server names registered via `# === [ SERVIDOR: <name> ] ===` headers in master `.env`.
 */
export declare function listMasterServers(envContent: string): readonly string[];
/**
 * Extracts variables belonging to `SERVER_<name>_*` into unprefixed keys.
 */
export declare function extractServerVars(envContent: string, serverName: string): Map<string, string>;
/**
 * Upserts a server block and its `SERVER_<name>_*` variables into master `.env` content.
 */
export declare function upsertServerBlock(envContent: string, serverName: string, vars: ReadonlyMap<string, string>): string;
/**
 * Validates secrets against upstream `.env.example` placeholders, URL-unsafe password chars,
 * and required Compose placeholders.
 */
export declare function validateEnvSecrets(envVars: ReadonlyMap<string, string>, requiredPlaceholders?: readonly string[]): readonly string[];
/**
 * Upstream-First key generation: uses `docker/utils/generate-keys.sh` and `add-new-auth-keys.sh`
 * when available with bash, falling back to native `node:crypto` (HS256 + ES256 JWK).
 */
export declare function generateSupabaseKeys(projectRoot: string, config: SupabaseDockerConfig): Map<string, string>;
export interface GeneratedServerEnvFile {
  readonly server: string;
  readonly filePath: string;
  readonly vars: ReadonlyMap<string, string>;
}
/**
 * Emits `<supabaseDir>/generated/<server>.env` for every server registered in master `.env`.
 */
export declare function generateServerEnvFiles(projectRoot: string, config: SupabaseDockerConfig): Promise<readonly GeneratedServerEnvFile[]>;