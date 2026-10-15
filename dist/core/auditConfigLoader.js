import { AUDIT_CONFIG_FILE, AUDIT_CONFIG_JSON_FILE } from "./auditConfigTypes.js";
import { assertNoLegacyRootConfig } from "./auditConfigValidators.js";
import { DEFAULT_AUDIT_CONFIG, defineAuditConfig } from "./auditConfigDefaults.js";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
//#region src/core/auditConfigLoader.ts
/**
* packages/auditor/src/core/auditConfigLoader.ts
*
* Config loader, in-memory cache, and child process environment serialization.
*/
const MAX_INLINE_ENV_CONFIG_CHARS = 16384;
function sanitizePath(inputPath) {
	if (!inputPath || typeof inputPath !== "string") return "";
	return path.normalize(inputPath.trim());
}
let cachedConfig = null;
let cachedProjectRoot = null;
function tryLoadJsonConfig(jsonConfigPath, projectRoot, logWarning = false) {
	if (!fs.existsSync(jsonConfigPath)) return null;
	try {
		const content = fs.readFileSync(jsonConfigPath, "utf-8");
		const parsed = JSON.parse(content);
		cachedConfig = defineAuditConfig(parsed);
		cachedProjectRoot = projectRoot;
		return cachedConfig;
	} catch (err) {
		if (logWarning) {
			const msg = err instanceof Error ? err.message : String(err);
			throw new Error(`[AuditConfig] Failed to load ${AUDIT_CONFIG_JSON_FILE}: ${msg}`, { cause: err });
		}
		return null;
	}
}
function serializeAuditConfigToEnv(config, projectRoot = process.cwd()) {
	try {
		process.env.AUDIT_ACTIVE_CONFIG_ROOT = projectRoot;
		const serialized = JSON.stringify(config, (_key, value) => {
			if (value instanceof Set) return Array.from(value);
			return value;
		});
		try {
			const cacheDir = path.resolve(projectRoot, "scratch", "cache");
			if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
			const ephemeralConfigFile = path.resolve(cacheDir, `active_audit_config_${process.pid}.json`);
			fs.writeFileSync(ephemeralConfigFile, serialized, "utf-8");
			process.env.AUDIT_ACTIVE_CONFIG_FILE = ephemeralConfigFile;
		} catch {}
		if (serialized.length < 16384) process.env.AUDIT_CONFIG_DATA = serialized;
	} catch {}
}
function tryLoadConfigFromEnv(projectRoot) {
	const activeRoot = process.env.AUDIT_ACTIVE_CONFIG_ROOT || process.cwd();
	if (path.resolve(projectRoot) !== path.resolve(activeRoot)) return null;
	const rawEnvFile = process.env.AUDIT_ACTIVE_CONFIG_FILE;
	if (rawEnvFile) {
		const envFilePath = sanitizePath(rawEnvFile);
		if (fs.existsSync(envFilePath)) try {
			const content = fs.readFileSync(envFilePath, "utf-8");
			const parsed = JSON.parse(content);
			cachedConfig = defineAuditConfig(parsed);
			cachedProjectRoot = projectRoot;
			return cachedConfig;
		} catch {}
	}
	const rawData = process.env.AUDIT_CONFIG_DATA;
	if (rawData) try {
		const parsed = JSON.parse(rawData);
		cachedConfig = defineAuditConfig(parsed);
		cachedProjectRoot = projectRoot;
		return cachedConfig;
	} catch {}
	return null;
}
let dynamicImportCounter = 0;
async function loadAuditConfig(projectRoot = process.cwd()) {
	if (cachedConfig && cachedProjectRoot === projectRoot) return cachedConfig;
	if (process.env.AUDIT_SUBPROCESS === "true" || process.env.AUDIT_ACTIVE_CONFIG_FILE || process.env.AUDIT_CONFIG_DATA) {
		const envConfig = tryLoadConfigFromEnv(projectRoot);
		if (envConfig) return envConfig;
	}
	assertNoLegacyRootConfig(projectRoot);
	const customConfig = process.env.AUDIT_CONFIG;
	const configPath = path.resolve(projectRoot, customConfig ?? AUDIT_CONFIG_FILE);
	const jsonConfigPath = path.resolve(projectRoot, AUDIT_CONFIG_JSON_FILE);
	if (fs.existsSync(configPath)) {
		const fileUrl = pathToFileURL(configPath);
		fileUrl.searchParams.set("t", `${performance.now()}_${++dynamicImportCounter}`);
		const mod = await import(fileUrl.href);
		if (!mod.default) throw new Error(`[AuditConfig] ${path.relative(projectRoot, configPath)} must default-export defineAuditConfig({...}).`);
		cachedConfig = defineAuditConfig(mod.default);
		cachedProjectRoot = projectRoot;
		serializeAuditConfigToEnv(cachedConfig, projectRoot);
		return cachedConfig;
	}
	const loaded = tryLoadJsonConfig(jsonConfigPath, projectRoot, true);
	if (loaded) {
		serializeAuditConfigToEnv(loaded, projectRoot);
		return loaded;
	}
	cachedConfig = DEFAULT_AUDIT_CONFIG;
	cachedProjectRoot = projectRoot;
	return cachedConfig;
}
function getAuditConfig(projectRoot = process.cwd()) {
	if (cachedConfig && (!cachedProjectRoot || cachedProjectRoot === projectRoot)) return cachedConfig;
	const envConfig = tryLoadConfigFromEnv(projectRoot);
	if (envConfig) return envConfig;
	const loaded = tryLoadJsonConfig(path.resolve(projectRoot, AUDIT_CONFIG_JSON_FILE), projectRoot, false);
	if (loaded) return loaded;
	return cachedConfig ?? DEFAULT_AUDIT_CONFIG;
}
function setAuditConfig(config, projectRoot = process.cwd()) {
	cachedConfig = config;
	cachedProjectRoot = projectRoot;
	serializeAuditConfigToEnv(config, projectRoot);
}
function resetAuditConfig() {
	cachedConfig = null;
	cachedProjectRoot = null;
	const rawEnvFile = process.env.AUDIT_ACTIVE_CONFIG_FILE;
	if (rawEnvFile) {
		const cleanEnvFile = sanitizePath(rawEnvFile);
		if (fs.existsSync(cleanEnvFile)) try {
			fs.unlinkSync(cleanEnvFile);
		} catch {}
	}
	delete process.env.AUDIT_CONFIG_DATA;
	delete process.env.AUDIT_ACTIVE_CONFIG_FILE;
	delete process.env.AUDIT_ACTIVE_CONFIG_ROOT;
}
//#endregion
export { MAX_INLINE_ENV_CONFIG_CHARS, getAuditConfig, loadAuditConfig, resetAuditConfig, sanitizePath, serializeAuditConfigToEnv, setAuditConfig, tryLoadConfigFromEnv, tryLoadJsonConfig };
