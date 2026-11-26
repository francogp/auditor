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
const JWT_TTL_FIVE_YEARS_SECONDS = 15768e4;
const SERVER_HEADER_REGEX = /^#\s*===\s*\[\s*SERVIDOR:\s*([a-zA-Z0-9_-]+)\s*\]\s*===/gmu;
const ALPHANUMERIC_PASSWORD_REGEX = /^[A-Za-z0-9]+$/u;
const INSECURE_PLACEHOLDERS = [
	"your-super-secret",
	"this_password_is_insecure",
	"change-me",
	"example"
];
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
* Lists all server names registered via `# === [ SERVIDOR: <name> ] ===` headers in master `.env`.
*/
function listMasterServers(envContent) {
	const servers = [];
	for (const match of envContent.matchAll(SERVER_HEADER_REGEX)) if (match[1]) servers.push(match[1]);
	return servers;
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
	const nextLines = [...envContent.split(/\r?\n/u)];
	if (!envContent.includes(header)) {
		if (nextLines.length > 0 && nextLines.at(-1) !== "") nextLines.push("");
		nextLines.push(header);
	}
	for (const [k, v] of vars.entries()) {
		const fullKey = k.startsWith(prefix) ? k : `${prefix}${k}`;
		const existingIdx = nextLines.findIndex((l) => l.trim().startsWith(`${fullKey}=`));
		if (existingIdx >= 0) nextLines[existingIdx] = `${fullKey}=${v}`;
		else {
			const headerIdx = nextLines.findIndex((l) => l.trim() === header);
			nextLines.splice(headerIdx + 1, 0, `${fullKey}=${v}`);
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
	for (const passKey of ["POSTGRES_PASSWORD", "DASHBOARD_PASSWORD"]) {
		const val = envVars.get(passKey);
		if (val && !ALPHANUMERIC_PASSWORD_REGEX.test(val)) errors.push(`'${passKey}' must contain only ASCII letters and digits (upstream interpolates it unencoded in URIs).`);
	}
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
	const iat = Math.floor(Temporal.Now.instant().epochMilliseconds / 1e3);
	const exp = iat + JWT_TTL_FIVE_YEARS_SECONDS;
	const anonKey = signHs256Jwt({
		role: "anon",
		iss: "supabase",
		iat,
		exp
	}, jwtSecret);
	const serviceKey = signHs256Jwt({
		role: "service_role",
		iss: "supabase",
		iat,
		exp
	}, jwtSecret);
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
		["REALTIME_DB_ENC_KEY", crypto.randomBytes(16).toString("hex")],
		["SUPABASE_PUBLISHABLE_KEY", `sb_publishable_${crypto.randomBytes(24).toString("hex")}`],
		["SUPABASE_SECRET_KEY", `sb_secret_${crypto.randomBytes(24).toString("hex")}`],
		["JWT_JWKS", jwksPayload],
		["ANON_KEY_ASYMMETRIC", anonAsymmetric],
		["SERVICE_ROLE_KEY_ASYMMETRIC", serviceAsymmetric]
	]);
}
/**
* Emits `<supabaseDir>/generated/<server>.env` for every server registered in master `.env`.
*/
async function generateServerEnvFiles(projectRoot, config) {
	const masterPath = safeResolve(projectRoot, config.masterEnvFile);
	const masterContent = await safeReadFile(masterPath);
	const masterVars = parseEnvContent(masterContent);
	const servers = listMasterServers(masterContent);
	const examplePath = safeResolve(projectRoot, config.supabaseDir, "docker", ".env.example");
	const baseVars = fs.existsSync(examplePath) ? parseEnvContent(await safeReadFile(examplePath)) : /* @__PURE__ */ new Map();
	const emitted = [];
	for (const serverName of servers) {
		const serverVars = extractServerVars(masterContent, serverName);
		const merged = new Map(baseVars);
		if (config.extensions?.extraEnvVars) for (const [k, v] of config.extensions.extraEnvVars.entries()) merged.set(k, v);
		for (const [k, v] of serverVars.entries()) merged.set(k, v);
		for (const gKey of [
			"DOCKER_USER",
			"DOCKER_REPO_DB",
			"DOCKER_TAG_DB"
		]) {
			const val = masterVars.get(gKey);
			if (val) merged.set(gKey, val);
		}
		const outPath = safeResolve(projectRoot, config.supabaseDir, "generated", `${serverName}.env`);
		const lines = [
			`# Generated for server: ${serverName}`,
			"# DO NOT EDIT MANUALLY",
			""
		];
		for (const [k, v] of [...merged.entries()].sort((a, b) => a[0].localeCompare(b[0]))) lines.push(`${k}=${v}`);
		await safeWriteFile(outPath, `${lines.join("\n")}\n`);
		emitted.push({
			server: serverName,
			filePath: outPath,
			vars: merged
		});
	}
	return emitted;
}
export { extractServerVars, generateServerEnvFiles, generateSupabaseKeys, isInsecurePlaceholder, listMasterServers, parseEnvContent, upsertServerBlock, validateEnvSecrets };
