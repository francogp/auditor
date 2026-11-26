/**
 * src/supabase/supabaseCryptoUtils.ts
 *
 * Shared cryptographic and SQL bootstrap helpers for `@francogp/auditor/supabase`.
 */
export declare const SCHEMA_MIGRATIONS_BOOTSTRAP_SQL: "CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); GRANT USAGE, CREATE ON SCHEMA supabase_migrations TO postgres; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA supabase_migrations TO postgres;";
/**
 * Generates an alphanumeric-only secret string of the given length.
 */
export declare function randomAlphanumeric(length: number): string;