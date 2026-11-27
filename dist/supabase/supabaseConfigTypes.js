// src/supabase/supabaseConfigTypes.ts
/**
* src/supabase/supabaseConfigTypes.ts
*
* Domain contracts and zero-hardcoding validation for `@francogp/auditor/supabase`.
*/
const SUPABASE_LITE_STORAGE_MODES = ["volume", "tmpfs"];
const SUPABASE_DOCKER_SCHEMA_VERSION = 3;
const SUPABASE_SCHEMA_HEADER_PREFIX = "# @auditor-supabase-schema:";
const SUPABASE_SCHEMA_HEADER_REGEX = /^#\s*@auditor-supabase-schema:\s*(\d+)\s*$/u;
const SCHEMA_HEADER_SCAN_LINES = 5;
/**
* Stamps `# @auditor-supabase-schema: <version>` as the first line of a generated Supabase
* Compose or Dockerfile artifact, replacing any prior schema header.
*/
function stampSupabaseSchemaHeader(content, version = 3) {
	const lines = content.split(/\r?\n/u);
	const startIdx = lines.length > 0 && SUPABASE_SCHEMA_HEADER_REGEX.test(lines[0] ?? "") ? 1 : 0;
	const body = lines.slice(startIdx).join("\n");
	return `${SUPABASE_SCHEMA_HEADER_PREFIX} ${version}\n${body}`;
}
/**
* Parses the `# @auditor-supabase-schema: <N>` version header from the top of a generated
* Supabase Docker artifact, returning `null` if missing or invalid.
*/
function parseSupabaseSchemaHeader(content) {
	const lines = content.split(/\r?\n/u).slice(0, SCHEMA_HEADER_SCAN_LINES);
	for (const line of lines) {
		const match = SUPABASE_SCHEMA_HEADER_REGEX.exec(line.trim());
		if (!match?.[1]) continue;
		const parsed = Number.parseInt(match[1], 10);
		if (Number.isInteger(parsed) && parsed > 0) return parsed;
	}
	return null;
}
const SUPABASE_PROFILE_KINDS = [
	"remote",
	"localFull",
	"lite"
];
const MAX_TCP_PORT = 65535;
const MIN_POSTGRES_MAJOR = 12;
const DEFAULT_SUPABASE_DOCKER_CONFIG = {
	enabled: false,
	projectSlug: "",
	upstreamRef: "",
	supabaseDir: "",
	masterEnvFile: "",
	postgres: {
		expectedMajor: 0,
		allowMajorUpgrade: false
	},
	profiles: {}
};
function requireNonEmpty(value, field, errors) {
	if (!value || value.trim().length === 0) errors.push(`supabaseDocker.${field} is required when supabaseDocker.enabled is true.`);
}
function requireValidPort(port, field, errors) {
	if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > MAX_TCP_PORT) errors.push(`supabaseDocker.${field} must be a valid TCP port (1-${MAX_TCP_PORT}).`);
}
function validateRemoteProfile(remote, errors) {
	if (!remote?.enabled) return;
	requireNonEmpty(remote.image?.user, "profiles.remote.image.user", errors);
	requireNonEmpty(remote.image?.repo, "profiles.remote.image.repo", errors);
	requireNonEmpty(remote.image?.tag, "profiles.remote.image.tag", errors);
	requireNonEmpty(remote.volumes?.shared, "profiles.remote.volumes.shared", errors);
	requireNonEmpty(remote.volumes?.dbData, "profiles.remote.volumes.dbData", errors);
	requireNonEmpty(remote.volumes?.dbConfig, "profiles.remote.volumes.dbConfig", errors);
	requireNonEmpty(remote.volumes?.storage, "profiles.remote.volumes.storage", errors);
}
function validateLocalFullProfile(localFull, errors) {
	if (!localFull?.enabled) return;
	requireNonEmpty(localFull.realtimeTenantName, "profiles.localFull.realtimeTenantName", errors);
	requireValidPort(localFull.ports?.api, "profiles.localFull.ports.api", errors);
	requireValidPort(localFull.ports?.postgres, "profiles.localFull.ports.postgres", errors);
	requireValidPort(localFull.ports?.pooler, "profiles.localFull.ports.pooler", errors);
	requireValidPort(localFull.ports?.studio, "profiles.localFull.ports.studio", errors);
}
function validateLiteProfiles(lite, errors) {
	if (!lite) return;
	for (const [name, profile] of lite.entries()) {
		if (!profile.enabled) continue;
		requireNonEmpty(profile.images?.postgres, `profiles.lite.${name}.images.postgres`, errors);
		requireNonEmpty(profile.images?.postgrest, `profiles.lite.${name}.images.postgrest`, errors);
		requireNonEmpty(profile.images?.nginx, `profiles.lite.${name}.images.nginx`, errors);
		requireValidPort(profile.ports?.postgres, `profiles.lite.${name}.ports.postgres`, errors);
		requireValidPort(profile.ports?.gateway, `profiles.lite.${name}.ports.gateway`, errors);
		if (!Array.isArray(profile.schemas) || profile.schemas.length === 0) errors.push(`supabaseDocker.profiles.lite.${name}.schemas must contain at least one schema.`);
	}
}
/**
* Validates that a `SupabaseDockerConfig` declares all mandatory fields when enabled.
*/
function validateSupabaseDockerConfig(config) {
	if (!config.enabled) return [];
	const errors = [];
	requireNonEmpty(config.projectSlug, "projectSlug", errors);
	requireNonEmpty(config.upstreamRef, "upstreamRef", errors);
	requireNonEmpty(config.supabaseDir, "supabaseDir", errors);
	requireNonEmpty(config.masterEnvFile, "masterEnvFile", errors);
	if (!Number.isInteger(config.postgres?.expectedMajor) || config.postgres.expectedMajor < 12) errors.push(`supabaseDocker.postgres.expectedMajor must be an integer >= 12.`);
	validateRemoteProfile(config.profiles?.remote, errors);
	validateLocalFullProfile(config.profiles?.localFull, errors);
	validateLiteProfiles(config.profiles?.lite, errors);
	return errors;
}
export { DEFAULT_SUPABASE_DOCKER_CONFIG, MIN_POSTGRES_MAJOR, SUPABASE_DOCKER_SCHEMA_VERSION, SUPABASE_LITE_STORAGE_MODES, SUPABASE_PROFILE_KINDS, SUPABASE_SCHEMA_HEADER_PREFIX, parseSupabaseSchemaHeader, stampSupabaseSchemaHeader, validateSupabaseDockerConfig };
