import { AUDIT_CONFIG_JSON_FILE } from "./auditConfigTypes.js";
import { assertNoLegacyRootConfig } from "./auditConfigValidators.js";
import { DEFAULT_AUDIT_CONFIG } from "./auditConfigDefaults.js";
import { safeJsonParse, safeReadFileSync, safeRmSync, tryCatchSync, tryOrNull } from "./safeUtils.js";
import { defineAuditConfig } from "./auditConfigBuilders.js";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
// src/core/auditConfigLoader.ts
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
const configCache = /* @__PURE__ */ new Map();
function tryLoadJsonConfig(jsonConfigPath, projectRoot, logWarning = false) {
	if (!fs.existsSync(jsonConfigPath)) return null;
	try {
		const content = fs.readFileSync(jsonConfigPath, "utf-8");
		const parsed = JSON.parse(content);
		const config = defineAuditConfig(parsed);
		const resolvedRoot = path.resolve(projectRoot);
		configCache.set(resolvedRoot, config);
		cachedConfig = config;
		cachedProjectRoot = resolvedRoot;
		return config;
	} catch (err) {
		if (logWarning) {
			const msg = err instanceof Error ? err.message : String(err);
			throw new Error(`[AuditConfig] Failed to load ${AUDIT_CONFIG_JSON_FILE}: ${msg}`, { cause: err });
		}
		return null;
	}
}
function serializeAuditConfigToEnv(config, projectRoot = process.cwd()) {
	tryCatchSync(() => {
		process.env.AUDIT_ACTIVE_CONFIG_ROOT = projectRoot;
		const serialized = JSON.stringify(config, (_key, value) => {
			if (value instanceof Set) return Array.from(value);
			return value;
		});
		const cacheDir = path.resolve(projectRoot, "scratch", "cache");
		if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
		const ephemeralConfigFile = path.resolve(cacheDir, `active_audit_config_${process.pid}.json`);
		fs.writeFileSync(ephemeralConfigFile, serialized, "utf-8");
		process.env.AUDIT_ACTIVE_CONFIG_FILE = ephemeralConfigFile;
		if (serialized.length < 16384) process.env.AUDIT_CONFIG_DATA = serialized;
	});
}
function tryLoadConfigFromEnv(projectRoot) {
	const activeRoot = process.env.AUDIT_ACTIVE_CONFIG_ROOT || process.cwd();
	if (path.resolve(projectRoot) !== path.resolve(activeRoot)) return null;
	const rawEnvFile = process.env.AUDIT_ACTIVE_CONFIG_FILE;
	if (rawEnvFile) {
		const envFilePath = sanitizePath(rawEnvFile);
		if (fs.existsSync(envFilePath)) {
			const raw = safeReadFileSync(envFilePath);
			if (raw) {
				const parsed = safeJsonParse(raw);
				if (parsed) {
					cachedConfig = defineAuditConfig(parsed);
					cachedProjectRoot = projectRoot;
					return cachedConfig;
				}
			}
		}
	}
	const rawData = process.env.AUDIT_CONFIG_DATA;
	if (rawData) {
		const parsed = safeJsonParse(rawData);
		if (parsed) {
			cachedConfig = defineAuditConfig(parsed);
			cachedProjectRoot = projectRoot;
			return cachedConfig;
		}
	}
	return null;
}
let dynamicImportCounter = 0;
function resolveCurrentAuditorEntryUrl() {
	return tryOrNull(() => {
		const isTs = import.meta.url.endsWith(".ts");
		const auditorRoot = path.resolve(import.meta.dirname, "..", "..");
		const entryFile = isTs ? path.resolve(auditorRoot, "src", "index.ts") : path.resolve(auditorRoot, "dist", "index.js");
		if (fs.existsSync(entryFile)) return pathToFileURL(entryFile).href;
		return null;
	});
}
function resolveConfigModuleUrl(configPath, projectRoot, auditorRoot = path.resolve(import.meta.dirname, "..", "..")) {
	const isRemoteProject = !auditorRoot.split(path.sep).includes("node_modules") && path.resolve(projectRoot) !== auditorRoot;
	const auditorEntryUrl = resolveCurrentAuditorEntryUrl();
	if (isRemoteProject && auditorEntryUrl) {
		const rewrittenConfig = tryOrNull(() => {
			const rawContent = fs.readFileSync(configPath, "utf-8");
			if (!rawContent.includes("@francogp/auditor")) return null;
			const rewritten = rawContent.replace(/from\s+['"]@francogp\/auditor['"]/g, `from '${auditorEntryUrl}'`).replace(/import\s*\(\s*['"]@francogp\/auditor['"]\s*\)/g, `import('${auditorEntryUrl}')`);
			const scratchDir = path.resolve(auditorRoot, "scratch");
			if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
			const tempFilePath = path.resolve(scratchDir, `remote_config_${Temporal.Now.instant().epochMilliseconds}_${++dynamicImportCounter}.ts`);
			fs.writeFileSync(tempFilePath, rewritten, "utf-8");
			const tempUrl = pathToFileURL(tempFilePath);
			tempUrl.searchParams.set("t", `${performance.now()}_${dynamicImportCounter}`);
			return {
				importUrl: tempUrl.href,
				cleanupFilePath: tempFilePath
			};
		});
		if (rewrittenConfig) return rewrittenConfig;
	}
	const fileUrl = pathToFileURL(configPath);
	fileUrl.searchParams.set("t", `${performance.now()}_${++dynamicImportCounter}`);
	return {
		importUrl: fileUrl.href,
		cleanupFilePath: null
	};
}
async function loadAuditConfig(projectRoot = process.cwd()) {
	if (cachedConfig && cachedProjectRoot === projectRoot) return cachedConfig;
	if (process.env.AUDIT_SUBPROCESS === "true" || process.env.AUDIT_ACTIVE_CONFIG_FILE || process.env.AUDIT_CONFIG_DATA) {
		const envConfig = tryLoadConfigFromEnv(projectRoot);
		if (envConfig) return envConfig;
	}
	assertNoLegacyRootConfig(projectRoot);
	const customConfig = process.env.AUDIT_CONFIG;
	const configPath = path.resolve(projectRoot, customConfig ?? ".auditor/audit.config.ts");
	const jsonConfigPath = path.resolve(projectRoot, AUDIT_CONFIG_JSON_FILE);
	if (fs.existsSync(configPath)) {
		const { importUrl, cleanupFilePath } = resolveConfigModuleUrl(configPath, projectRoot);
		try {
			const mod = await import(importUrl);
			if (!mod.default) throw new Error(`[AuditConfig] ${path.relative(projectRoot, configPath)} must default-export defineAuditConfig({...}).`);
			cachedConfig = defineAuditConfig(mod.default);
			const resolvedRoot = path.resolve(projectRoot);
			configCache.set(resolvedRoot, cachedConfig);
			cachedProjectRoot = resolvedRoot;
			serializeAuditConfigToEnv(cachedConfig, projectRoot);
			return cachedConfig;
		} finally {
			if (cleanupFilePath) safeRmSync(cleanupFilePath);
		}
	}
	const loaded = tryLoadJsonConfig(jsonConfigPath, projectRoot, true);
	if (loaded) {
		serializeAuditConfigToEnv(loaded, projectRoot);
		return loaded;
	}
	cachedConfig = DEFAULT_AUDIT_CONFIG;
	const resolvedRoot = path.resolve(projectRoot);
	configCache.set(resolvedRoot, cachedConfig);
	cachedProjectRoot = resolvedRoot;
	return cachedConfig;
}
function getAuditConfig(projectRoot = process.cwd()) {
	const resolvedRoot = path.resolve(projectRoot);
	const fromCache = configCache.get(resolvedRoot);
	if (fromCache) return fromCache;
	if (cachedConfig && cachedProjectRoot && path.resolve(cachedProjectRoot) === resolvedRoot) return cachedConfig;
	const envConfig = tryLoadConfigFromEnv(projectRoot);
	if (envConfig) {
		configCache.set(resolvedRoot, envConfig);
		return envConfig;
	}
	const loaded = tryLoadJsonConfig(path.resolve(projectRoot, AUDIT_CONFIG_JSON_FILE), projectRoot, false);
	if (loaded) {
		configCache.set(resolvedRoot, loaded);
		return loaded;
	}
	return cachedConfig ?? DEFAULT_AUDIT_CONFIG;
}
function setAuditConfig(config, projectRoot = process.cwd()) {
	const resolvedRoot = path.resolve(projectRoot);
	configCache.set(resolvedRoot, config);
	cachedConfig = config;
	cachedProjectRoot = resolvedRoot;
	serializeAuditConfigToEnv(config, projectRoot);
}
function resetAuditConfig() {
	configCache.clear();
	cachedConfig = null;
	cachedProjectRoot = null;
	const rawEnvFile = process.env.AUDIT_ACTIVE_CONFIG_FILE;
	if (rawEnvFile) {
		const cleanEnvFile = sanitizePath(rawEnvFile);
		if (cleanEnvFile) safeRmSync(cleanEnvFile);
	}
	delete process.env.AUDIT_CONFIG_DATA;
	delete process.env.AUDIT_ACTIVE_CONFIG_FILE;
	delete process.env.AUDIT_ACTIVE_CONFIG_ROOT;
}
export { MAX_INLINE_ENV_CONFIG_CHARS, getAuditConfig, loadAuditConfig, resetAuditConfig, resolveConfigModuleUrl, sanitizePath, serializeAuditConfigToEnv, setAuditConfig, tryLoadConfigFromEnv, tryLoadJsonConfig };
