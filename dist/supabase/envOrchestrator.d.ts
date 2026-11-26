import { SupabaseDockerConfig } from "./supabaseConfigTypes.js";
/**
 * Returns true if `value` matches any known insecure upstream placeholder substring.
 */
export declare function isInsecurePlaceholder(value: string): boolean;
export interface SignedSupabaseJwtPair {
  readonly anonKey: string;
  readonly serviceRoleKey: string;
  readonly iat: number;
  readonly exp: number;
}
/**
 * Signs a 5-year HS256 `anon` and `service_role` JWT pair using `jwtSecret`.
 */
export declare function signSupabaseJwtPair(jwtSecret: string): SignedSupabaseJwtPair;
/**
 * Parses `.env` text into a key-value Map (preserving last occurrence and stripping quotes).
 */
export declare function parseEnvContent(content: string): Map<string, string>;
/**
 * Lists all server names registered via `# === [ SERVIDOR: <name> ] ===`,
 * `# --- [ SERVIDOR ...: <name> ] ---`, or `SERVER_<name>_*` variables in master `.env`.
 */
export declare function listMasterServers(envContent: string): readonly string[];
/**
 * Returns true if a server block represents a managed Supabase Cloud instance (not self-hosted Docker).
 */
export declare function isManagedCloudServer(serverVars: ReadonlyMap<string, string>): boolean;
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
/**
 * Verifies an HS256 JWT against `secret` and asserts it is not expired.
 */
export declare function isValidHs256Jwt(token: string, secret: string, nowEpochSec?: number): boolean;
/**
 * Ensures all required server secrets exist and `ANON_KEY` / `SERVICE_ROLE_KEY` are valid and unexpired.
 * Preserves existing valid secrets without overwriting them.
 */
export declare function ensureServerKeys(projectRoot: string, config: SupabaseDockerConfig, existingVars: ReadonlyMap<string, string>): {
  readonly vars: Map<string, string>;
  readonly mutated: boolean;
};
export interface GeneratedServerEnvFile {
  readonly server: string;
  readonly filePath: string;
  readonly vars: ReadonlyMap<string, string>;
}
interface GenerateServerEnvFilesOptions {
  readonly ensureKeys?: boolean;
}
/**
 * Emits `<supabaseDir>/generated/<server>.env` (and `local.env` for default local profile)
 * for every server registered in master `.env`.
 */
export declare function generateServerEnvFiles(projectRoot: string, config: SupabaseDockerConfig, options?: GenerateServerEnvFilesOptions): Promise<readonly GeneratedServerEnvFile[]>;
export {};