import { safeReadFile, safeResolve, safeWriteFile } from "../core/safePath.js";
import { tryCatchSync } from "../core/safeUtils.js";
import { randomAlphanumeric } from "./supabaseCryptoUtils.js";
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
// src/supabase/envOrchestrator.ts
/**
* src/supabase/envOrchestrator.ts
*
* Master `.env` parser, multi-server inventory manager, and Upstream-First key generator.
*/
const PASSWORD_BYTES_LENGTH = 32;
const REALTIME_DB_ENC_KEY_BYTES = 16;
const REALTIME_DB_ENC_KEY_RANDOM_BYTES = 8;
const JWT_TTL_FIVE_YEARS_SECONDS = 15768e4;
const SERVER_HEADER_REGEX = /^#\s*(?:===|---)\s*\[\s*SERVIDOR(?:\s+\d+)?:\s*([a-zA-Z0-9_-]+)\s*\]\s*(?:===|---)/gmu;
const KNOWN_SERVER_KEY_SUFFIX_REGEX = /^SERVER_([a-zA-Z0-9_-]+?)_(?:ID|NAME|REGION|TENANT_ID|DEPLOY_MODE|IS_CLOUD|IS_DEFAULT|PREFER_FOR|POSTGRES_PASSWORD|JWT_SECRET|ANON_KEY|SERVICE_ROLE_KEY|API_EXTERNAL_URL|SUPABASE_PUBLIC_URL|SITE_URL|DASHBOARD_USERNAME|DASHBOARD_PASSWORD|API_GW_HTTP_PORT|POOLER_TENANT_ID|STORAGE_TENANT_ID)$/u;
const ALPHANUMERIC_PASSWORD_REGEX = /^[A-Za-z0-9]+$/u;
const INSECURE_PLACEHOLDERS = [
	"your-super-secret",
	"this_password_is_insecure",
	"change-me",
	"example"
];
const MANAGED_CLOUD_MODE_VALUES = ["cloud", "managed"];
/**
* Returns true if `value` matches any known insecure upstream placeholder substring.
*/
function isInsecurePlaceholder(value) {
	const lower = value.toLowerCase();
	return INSECURE_PLACEHOLDERS.some((p) => lower.includes(p));
}
function base64UrlEncode(input) {
	return Buffer.from(input).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function signHs256Jwt(payload, secret) {
	const data = `${base64UrlEncode(JSON.stringify({
		alg: "HS256",
		typ: "JWT"
	}))}.${base64UrlEncode(JSON.stringify(payload))}`;
	return `${data}.${base64UrlEncode(crypto.createHmac("sha256", secret).update(data).digest())}`;
}
function nowEpochSeconds() {
	return Math.floor(Temporal.Now.instant().epochMilliseconds / 1e3);
}
/**
* Signs a 5-year HS256 `anon` and `service_role` JWT pair using `jwtSecret`.
*/
function signSupabaseJwtPair(jwtSecret) {
	const iat = nowEpochSeconds();
	const exp = iat + JWT_TTL_FIVE_YEARS_SECONDS;
	return {
		anonKey: signHs256Jwt({
			role: "anon",
			iss: "supabase",
			iat,
			exp
		}, jwtSecret),
		serviceRoleKey: signHs256Jwt({
			role: "service_role",
			iss: "supabase",
			iat,
			exp
		}, jwtSecret),
		iat,
		exp
	};
}
/**
* Parses `.env` text into a key-value Map (preserving last occurrence and stripping quotes).
*/
function parseEnvContent(content) {
	const result = /* @__PURE__ */ new Map();
	for (const rawLine of content.split(/\r?\n/u)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const eqIdx = line.indexOf("=");
		if (eqIdx <= 0) continue;
		const key = line.slice(0, eqIdx).trim();
		let val = line.slice(eqIdx + 1).trim();
		if (val.startsWith("\"") && val.endsWith("\"") || val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
		result.set(key, val);
	}
	return result;
}
/**
* Lists all server names registered via `# === [ SERVIDOR: <name> ] ===`,
* `# --- [ SERVIDOR ...: <name> ] ---`, or `SERVER_<name>_*` variables in master `.env`.
*/
function listMasterServers(envContent) {
	const servers = [];
	const seen = /* @__PURE__ */ new Set();
	const register = (name) => {
		if (!seen.has(name)) {
			seen.add(name);
			servers.push(name);
		}
	};
	for (const match of envContent.matchAll(SERVER_HEADER_REGEX)) if (match[1]) register(match[1]);
	for (const key of parseEnvContent(envContent).keys()) {
		const prefixMatch = KNOWN_SERVER_KEY_SUFFIX_REGEX.exec(key);
		if (prefixMatch?.[1]) register(prefixMatch[1]);
	}
	return servers;
}
/**
* Returns true if a server block represents a managed Supabase Cloud instance (not self-hosted Docker).
*/
function isManagedCloudServer(serverVars) {
	const rawMode = serverVars.get("DEPLOY_MODE");
	if (rawMode) {
		const normalizedMode = rawMode.trim().toLowerCase();
		if (MANAGED_CLOUD_MODE_VALUES.some((m) => m === normalizedMode)) return true;
	}
	const rawIsCloud = serverVars.get("IS_CLOUD");
	return rawIsCloud ? rawIsCloud.trim().toLowerCase() === "true" : false;
}
/**
* Extracts variables belonging to `SERVER_<name>_*` into unprefixed keys.
*/
function extractServerVars(envContent, serverName) {
	const parsed = parseEnvContent(envContent);
	const prefix = `SERVER_${serverName}_`;
	const out = /* @__PURE__ */ new Map();
	for (const [k, v] of parsed.entries()) if (k.startsWith(prefix)) out.set(k.slice(prefix.length), v);
	return out;
}
/**
* Upserts a server block and its `SERVER_<name>_*` variables into master `.env` content.
*/
function upsertServerBlock(envContent, serverName, vars) {
	const header = `# === [ SERVIDOR: ${serverName} ] ===`;
	const prefix = `SERVER_${serverName}_`;
	const serverHeaderPattern = new RegExp(`^#\\s*(?:===|---)\\s*\\[\\s*SERVIDOR(?:\\s+\\d+)?:\\s*${RegExp.escape(serverName)}\\s*\\]\\s*(?:===|---)`, "u");
	const nextLines = [...envContent.split(/\r?\n/u)];
	const headerIdx = nextLines.findIndex((l) => serverHeaderPattern.test(l.trim()));
	const lastKeyIdx = nextLines.findLastIndex((l) => l.trim().startsWith(prefix));
	let insertAnchor;
	if (headerIdx < 0 && lastKeyIdx < 0) {
		if (nextLines.length > 0 && nextLines.at(-1) !== "") nextLines.push("");
		nextLines.push(header);
		insertAnchor = nextLines.length - 1;
	} else insertAnchor = lastKeyIdx >= 0 ? lastKeyIdx : headerIdx;
	for (const [k, v] of vars.entries()) {
		const fullKey = k.startsWith(prefix) ? k : `${prefix}${k}`;
		const existingIdx = nextLines.findIndex((l) => l.trim().startsWith(`${fullKey}=`));
		if (existingIdx >= 0) nextLines[existingIdx] = `${fullKey}=${v}`;
		else {
			nextLines.splice(insertAnchor + 1, 0, `${fullKey}=${v}`);
			insertAnchor += 1;
		}
	}
	return `${nextLines.join("\n").replace(/\n+$/u, "")}\n`;
}
/**
* Validates secrets against upstream `.env.example` placeholders, URL-unsafe password chars,
* and required Compose placeholders.
*/
function validateEnvSecrets(envVars, requiredPlaceholders = []) {
	const errors = [];
	for (const key of [
		"POSTGRES_PASSWORD",
		"JWT_SECRET",
		"ANON_KEY",
		"SERVICE_ROLE_KEY"
	]) {
		const val = envVars.get(key) ?? "";
		if (!val) {
			errors.push(`Missing required secret '${key}'.`);
			continue;
		}
		if (isInsecurePlaceholder(val)) errors.push(`Secret '${key}' still contains an insecure upstream placeholder value.`);
	}
	const pgPass = envVars.get("POSTGRES_PASSWORD");
	if (pgPass && !ALPHANUMERIC_PASSWORD_REGEX.test(pgPass)) errors.push("'POSTGRES_PASSWORD' must contain only ASCII letters and digits (upstream interpolates it unencoded in URIs).");
	const dashPass = envVars.get("DASHBOARD_PASSWORD");
	if (dashPass && isInsecurePlaceholder(dashPass)) errors.push("Secret 'DASHBOARD_PASSWORD' still contains an insecure upstream placeholder.");
	const realtimeEncKey = envVars.get("REALTIME_DB_ENC_KEY");
	if (realtimeEncKey && Buffer.byteLength(realtimeEncKey, "utf8") !== REALTIME_DB_ENC_KEY_BYTES) errors.push(`'REALTIME_DB_ENC_KEY' must be exactly ${REALTIME_DB_ENC_KEY_BYTES} bytes (16 ASCII/hex characters) for Supabase Realtime AES-128-ECB.`);
	for (const reqKey of requiredPlaceholders) if (!envVars.has(reqKey)) errors.push(`Generated .env is missing required Compose placeholder '${reqKey}'.`);
	return errors;
}
function parseUpstreamKeysJson(rawJson) {
	if (!rawJson.trim().startsWith("{")) return null;
	const parsed = JSON.parse(rawJson);
	if (typeof parsed !== "object" || parsed === null) return null;
	const map = /* @__PURE__ */ new Map();
	for (const [k, v] of Object.entries(parsed)) if (typeof v === "string") map.set(k, v);
	return map.has("JWT_SECRET") && map.has("ANON_KEY") ? map : null;
}
function signEs256Jwt(payload, privateKey, kid) {
	const data = `${base64UrlEncode(JSON.stringify({
		alg: "ES256",
		typ: "JWT",
		kid
	}))}.${base64UrlEncode(JSON.stringify(payload))}`;
	return `${data}.${base64UrlEncode(crypto.sign("sha256", Buffer.from(data), {
		key: privateKey,
		dsaEncoding: "ieee-p1363"
	}))}`;
}
function mergeUpstreamAuthKeys(projectRoot, config, baseKeys) {
	const addKeysScript = safeResolve(projectRoot, config.supabaseDir, "docker", "utils", "add-new-auth-keys.sh");
	if (!fs.existsSync(addKeysScript)) return;
	const tmpEnvPath = safeResolve(projectRoot, "scratch", `supabase-auth-keys-${process.pid}.env`);
	try {
		fs.mkdirSync(path.dirname(tmpEnvPath), { recursive: true });
		const envLines = [...baseKeys.entries()].map(([k, v]) => `${k}=${v}`).join("\n");
		fs.writeFileSync(tmpEnvPath, `${envLines}\n`, "utf8");
		if (tryCatchSync(() => execFileSync("bash", [addKeysScript, tmpEnvPath], {
			cwd: path.dirname(addKeysScript),
			encoding: "utf8",
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		})).status === "success" && fs.existsSync(tmpEnvPath)) {
			const updated = parseEnvContent(fs.readFileSync(tmpEnvPath, "utf8"));
			for (const [k, v] of updated.entries()) if (v) baseKeys.set(k, v);
		}
	} finally {
		fs.rmSync(tmpEnvPath, { force: true });
	}
}
/**
* Upstream-First key generation: uses `docker/utils/generate-keys.sh` and `add-new-auth-keys.sh`
* when available with bash, falling back to native `node:crypto` (HS256 + ES256 JWK).
*/
function generateSupabaseKeys(projectRoot, config) {
	const genScript = safeResolve(projectRoot, config.supabaseDir, "docker", "utils", "generate-keys.sh");
	if (fs.existsSync(genScript)) {
		const res = tryCatchSync(() => execFileSync("bash", [genScript, "--json"], {
			cwd: path.dirname(genScript),
			encoding: "utf8",
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		}));
		if (res.status === "success") {
			const upstreamKeys = parseUpstreamKeysJson(res.value);
			if (upstreamKeys) {
				mergeUpstreamAuthKeys(projectRoot, config, upstreamKeys);
				return upstreamKeys;
			}
		}
	}
	const jwtSecret = crypto.randomBytes(PASSWORD_BYTES_LENGTH).toString("hex");
	const { anonKey, serviceRoleKey: serviceKey, iat, exp } = signSupabaseJwtPair(jwtSecret);
	const postgresPassword = randomAlphanumeric(PASSWORD_BYTES_LENGTH);
	const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
	const kid = crypto.randomBytes(8).toString("hex");
	const exportedJwk = publicKey.export({ format: "jwk" });
	const jwksPayload = JSON.stringify({ keys: [{
		...exportedJwk,
		kid,
		alg: "ES256",
		use: "sig"
	}] });
	const anonAsymmetric = signEs256Jwt({
		role: "anon",
		iss: "supabase",
		iat,
		exp
	}, privateKey, kid);
	const serviceAsymmetric = signEs256Jwt({
		role: "service_role",
		iss: "supabase",
		iat,
		exp
	}, privateKey, kid);
	return /* @__PURE__ */ new Map([
		["POSTGRES_PASSWORD", postgresPassword],
		["JWT_SECRET", jwtSecret],
		["ANON_KEY", anonKey],
		["SERVICE_ROLE_KEY", serviceKey],
		["SECRET_KEY_BASE", crypto.randomBytes(48).toString("hex")],
		["VAULT_ENC_KEY", crypto.randomBytes(16).toString("hex")],
		["PG_META_CRYPTO_KEY", crypto.randomBytes(16).toString("hex")],
		["REALTIME_DB_ENC_KEY", crypto.randomBytes(REALTIME_DB_ENC_KEY_RANDOM_BYTES).toString("hex")],
		["SUPABASE_PUBLISHABLE_KEY", `sb_publishable_${crypto.randomBytes(24).toString("hex")}`],
		["SUPABASE_SECRET_KEY", `sb_secret_${crypto.randomBytes(24).toString("hex")}`],
		["JWT_JWKS", jwksPayload],
		["ANON_KEY_ASYMMETRIC", anonAsymmetric],
		["SERVICE_ROLE_KEY_ASYMMETRIC", serviceAsymmetric]
	]);
}
/**
* Verifies an HS256 JWT against `secret` and asserts it is not expired.
*/
function isValidHs256Jwt(token, secret, nowEpochSec = nowEpochSeconds()) {
	const parts = token.split(".");
	if (parts.length !== 3) return false;
	const [headerB64, bodyB64, sigB64] = parts;
	if (!headerB64 || !bodyB64 || !sigB64) return false;
	const expectedSig = base64UrlEncode(crypto.createHmac("sha256", secret).update(`${headerB64}.${bodyB64}`).digest());
	const sigBuf = Buffer.from(sigB64);
	const expectedBuf = Buffer.from(expectedSig);
	if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;
	const payload = tryCatchSync(() => JSON.parse(Buffer.from(bodyB64, "base64url").toString("utf8")));
	if (payload.status !== "success" || typeof payload.value !== "object" || payload.value === null) return false;
	return "exp" in payload.value && typeof payload.value.exp === "number" && payload.value.exp > nowEpochSec;
}
const REQUIRED_CRYPTO_KEYS = [
	"POSTGRES_PASSWORD",
	"JWT_SECRET",
	"SECRET_KEY_BASE",
	"VAULT_ENC_KEY",
	"PG_META_CRYPTO_KEY",
	"REALTIME_DB_ENC_KEY"
];
/**
* Ensures all required server secrets exist and `ANON_KEY` / `SERVICE_ROLE_KEY` are valid and unexpired.
* Preserves existing valid secrets without overwriting them.
*/
function ensureServerKeys(projectRoot, config, existingVars) {
	const next = new Map(existingVars);
	let mutated = false;
	let generated = null;
	const getGenerated = () => {
		generated ??= generateSupabaseKeys(projectRoot, config);
		return generated;
	};
	for (const key of REQUIRED_CRYPTO_KEYS) {
		const val = next.get(key) ?? "";
		const invalidRealtimeLength = key === "REALTIME_DB_ENC_KEY" && val.length > 0 && Buffer.byteLength(val, "utf8") !== REALTIME_DB_ENC_KEY_BYTES;
		if (!val || isInsecurePlaceholder(val) || invalidRealtimeLength) {
			const freshVal = getGenerated().get(key);
			if (freshVal) {
				next.set(key, freshVal);
				mutated = true;
			}
		}
	}
	const jwtSecret = next.get("JWT_SECRET") ?? "";
	const iat = nowEpochSeconds();
	const exp = iat + JWT_TTL_FIVE_YEARS_SECONDS;
	for (const [key, role] of [["ANON_KEY", "anon"], ["SERVICE_ROLE_KEY", "service_role"]]) {
		const current = next.get(key) ?? "";
		if (!current || isInsecurePlaceholder(current) || !isValidHs256Jwt(current, jwtSecret, iat)) {
			next.set(key, signHs256Jwt({
				role,
				iss: "supabase",
				iat,
				exp
			}, jwtSecret));
			mutated = true;
		}
	}
	return {
		vars: next,
		mutated
	};
}
function formatEnvLines(serverName, vars) {
	const lines = [
		`# Generated for server: ${serverName}`,
		"# DO NOT EDIT MANUALLY",
		""
	];
	for (const [k, v] of [...vars.entries()].sort((a, b) => a[0].localeCompare(b[0]))) lines.push(`${k}=${v}`);
	return `${lines.join("\n")}\n`;
}
function buildMergedServerEnvVars(input) {
	const merged = new Map(input.baseVars);
	if (input.config.extensions?.extraEnvVars) for (const [k, v] of input.config.extensions.extraEnvVars.entries()) merged.set(k, v);
	for (const [k, v] of input.serverVars.entries()) merged.set(k, v);
	const tenantId = input.serverVars.get("TENANT_ID")?.trim();
	if (tenantId) for (const tenantKey of ["POOLER_TENANT_ID", "STORAGE_TENANT_ID"]) {
		const cur = merged.get(tenantKey)?.trim();
		if (!cur || cur === "your-tenant-id") merged.set(tenantKey, tenantId);
	}
	for (const gKey of [
		"DOCKER_USER",
		"DOCKER_REPO_DB",
		"DOCKER_TAG_DB"
	]) {
		const val = input.masterVars.get(gKey);
		if (val) merged.set(gKey, val);
	}
	return merged;
}
/**
* Emits `<supabaseDir>/generated/<server>.env` (and `local.env` for default local profile)
* for every server registered in master `.env`.
*/
async function generateServerEnvFiles(projectRoot, config, options = {}) {
	const masterPath = safeResolve(projectRoot, config.masterEnvFile);
	let masterContent = await safeReadFile(masterPath);
	const masterVars = parseEnvContent(masterContent);
	const servers = listMasterServers(masterContent);
	const examplePath = safeResolve(projectRoot, config.supabaseDir, "docker", ".env.example");
	const baseVars = fs.existsSync(examplePath) ? parseEnvContent(await safeReadFile(examplePath)) : /* @__PURE__ */ new Map();
	const emitted = [];
	let masterMutated = false;
	for (const serverName of servers) {
		let serverVars = extractServerVars(masterContent, serverName);
		if (options.ensureKeys && !isManagedCloudServer(serverVars)) {
			const ensured = ensureServerKeys(projectRoot, config, serverVars);
			if (ensured.mutated) {
				serverVars = ensured.vars;
				masterContent = upsertServerBlock(masterContent, serverName, serverVars);
				masterMutated = true;
			}
		}
		const merged = buildMergedServerEnvVars({
			baseVars,
			masterVars,
			serverVars,
			config
		});
		const outPath = safeResolve(projectRoot, config.supabaseDir, "generated", `${serverName}.env`);
		const formatted = formatEnvLines(serverName, merged);
		await safeWriteFile(outPath, formatted);
		if ((serverVars.get("IS_DEFAULT") ?? "").trim().toLowerCase() === "true" || (serverVars.get("PREFER_FOR") ?? "").trim().toLowerCase() === "local") {
			const localAliasPath = safeResolve(projectRoot, config.supabaseDir, "generated", "local.env");
			await safeWriteFile(localAliasPath, formatted);
		}
		emitted.push({
			server: serverName,
			filePath: outPath,
			vars: merged
		});
	}
	if (masterMutated) await safeWriteFile(masterPath, masterContent);
	return emitted;
}
export { ensureServerKeys, extractServerVars, generateServerEnvFiles, generateSupabaseKeys, isInsecurePlaceholder, isManagedCloudServer, isValidHs256Jwt, listMasterServers, parseEnvContent, signSupabaseJwtPair, upsertServerBlock, validateEnvSecrets };
