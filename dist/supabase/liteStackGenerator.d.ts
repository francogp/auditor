import { SupabaseDockerConfig, SupabaseLiteComposeTarget, SupabaseLiteCredentials } from "./supabaseConfigTypes.js";
/**
 * Resolves `POSTGRES_PASSWORD` and `JWT_SECRET` for a `lite` profile:
 * 1. Master `.env` (`LITE_<PROFILE>_*` -> `POSTGRES_PASSWORD`/`JWT_SECRET`) if non-placeholder.
 * 2. Profile-local `.env` inside `<supabaseDir>/generated/lite/<profile>/.env` (created if missing).
 */
export declare function resolveLiteCredentials(projectRoot: string, config: SupabaseDockerConfig, profileName: string): Promise<{
  readonly postgresPassword: string;
  readonly jwtSecret: string;
  readonly envFilePath: string;
}>;
/**
 * Generates Nginx reverse proxy config forwarding `/rest/v1/` to PostgREST.
 */
export declare function generateLiteNginxConf(restServiceName: string): string;
/**
 * Generates idempotent SQL ensuring Supabase roles (`anon`, `authenticated`, `service_role`,
 * `authenticator`), JWT GUC settings, and `supabase_migrations.schema_migrations`.
 */
export declare function generateLiteBootstrapSql(jwtSecret: string, postgresPassword: string): string;
/**
 * Generates the 3-container `docker-compose.yml` for a `lite` profile.
 */
export declare function generateLiteComposeYaml(target: SupabaseLiteComposeTarget, creds: SupabaseLiteCredentials): string;
/**
 * Materializes `docker-compose.yml`, `nginx.conf`, and `.env` for a `lite` profile,
 * returning `bootstrapSql` in memory for direct `docker exec psql` application.
 */
export declare function writeLiteProfileArtifacts(projectRoot: string, config: SupabaseDockerConfig, profileName: string): Promise<{
  readonly composePath: string;
  readonly nginxPath: string;
  readonly envFilePath: string;
  readonly bootstrapSql: string;
}>;