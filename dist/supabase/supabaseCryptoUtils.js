import crypto from "node:crypto";
// src/supabase/supabaseCryptoUtils.ts
/**
* src/supabase/supabaseCryptoUtils.ts
*
* Shared cryptographic and SQL bootstrap helpers for `@francogp/auditor/supabase`.
*/
const ALPHANUMERIC_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const SCHEMA_MIGRATIONS_BOOTSTRAP_SQL = "CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); GRANT USAGE, CREATE ON SCHEMA supabase_migrations TO postgres; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA supabase_migrations TO postgres;";
/**
* Generates an alphanumeric-only secret string of the given length.
*/
function randomAlphanumeric(length) {
	const bytes = crypto.randomBytes(length);
	let out = "";
	for (let i = 0; i < length; i++) out += ALPHANUMERIC_CHARS[bytes[i] % 62];
	return out;
}
export { SCHEMA_MIGRATIONS_BOOTSTRAP_SQL, randomAlphanumeric };
