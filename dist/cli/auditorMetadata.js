import "../core/auditContract.js";
import { BaseAuditor, DEFAULT_AUDITOR_CAPABILITIES } from "../core/auditorBase.js";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
//#region src/cli/auditorMetadata.ts
/**
* packages/auditor/src/cli/auditorMetadata.ts
*
* Dedicated metadata extractor for auditor suites and tasks.
*/
const DYNAMIC_IMPORT_TIMEOUT_MS = 2e3;
function extractStaticMetadataFromFile(fullPath) {
	const result = {
		capabilities: DEFAULT_AUDITOR_CAPABILITIES,
		gitIgnoreEntries: []
	};
	try {
		const content = fs.readFileSync(fullPath, "utf-8");
		const iconMatch = content.match(/icon\s*:\s*['"]([^'"]+)['"]/);
		if (iconMatch?.[1]) result.icon = iconMatch[1];
		const hasLight = content.includes("speed: 'light'") || content.includes("['light'");
		const hasHeavy = content.includes("speed: 'heavy'") || content.includes("'heavy'");
		const hasFull = content.includes("speed: 'full'") || content.includes("'full']");
		const speeds = [];
		if (hasLight) speeds.push("light");
		if (hasHeavy) speeds.push("heavy");
		if (hasFull) speeds.push("full");
		result.capabilities = {
			speed: speeds.length > 1 ? speeds : speeds[0] ?? "light",
			phase: content.includes("phase: 'post-build'") ? "post-build" : content.includes("phase: 'post-run'") ? "post-run" : "normal",
			fix: content.includes("fix: 'priority'") ? "priority" : content.includes("fix: 'normal'") ? "normal" : "none",
			md: content.includes("md: true"),
			ast: content.includes("ast: true") || content.includes("requiresAst: true") || content.includes("AST_RULE_CAPABILITIES"),
			changedOnly: content.includes("changedOnly: true"),
			critical: content.includes("critical: true")
		};
		const descMatch = content.match(/description\s*[:=]\s*['"]([^'"]+)['"]/);
		const configKeyMatch = content.match(/configKey\s*[:=]\s*['"]([^'"]+)['"]/);
		const hasDefaultConfig = /defaultConfig\s*[:=]/.test(content);
		let staticDefaultConfig;
		if (hasDefaultConfig) staticDefaultConfig = content.includes("enabled: true") ? { enabled: true } : {};
		return {
			...result,
			description: descMatch?.[1],
			configKey: configKeyMatch?.[1],
			defaultConfig: staticDefaultConfig
		};
	} catch {}
	return result;
}
function extractMetadataFromAuditorInstance(val, result) {
	try {
		const instance = new val();
		if (instance?.capabilities && typeof instance.capabilities === "object") result.capabilities = instance.capabilities;
		if (instance?.ruleCapabilities && typeof instance.ruleCapabilities === "object") result.ruleCapabilities = instance.ruleCapabilities;
		if (instance?.icon && typeof instance.icon === "string") result.icon = instance.icon;
		if (Array.isArray(instance?.gitIgnoreEntries)) result.gitIgnoreEntries = instance.gitIgnoreEntries;
		if (Array.isArray(instance?.scripts)) result.scripts = instance.scripts;
		if (typeof instance?.toManifest === "function") {
			const manifest = instance.toManifest();
			result.manifest = manifest;
			result.description = manifest.description;
			result.ruleDescriptions = manifest.rules;
			result.ruleRemediations = manifest.remediations ?? instance.ruleRemediations;
			result.configKey = manifest.configKey;
			result.defaultConfig = manifest.defaultConfig;
		} else if (instance?.description) {
			result.description = instance.description;
			result.ruleDescriptions = instance.ruleDescriptions;
			result.ruleRemediations = instance.ruleRemediations;
			result.configKey = instance.configKey;
			result.defaultConfig = instance.defaultConfig;
		}
		if (instance?.criticalConfig) result.criticalConfig = instance.criticalConfig;
	} catch {}
}
function extractMetadataFromFunction(val, result) {
	if (typeof val !== "function") return;
	const withStatic = val;
	if (withStatic.capabilities && typeof withStatic.capabilities === "object") result.capabilities = {
		...DEFAULT_AUDITOR_CAPABILITIES,
		...withStatic.capabilities
	};
	if (typeof withStatic.icon === "string") result.icon = withStatic.icon;
	if (Array.isArray(withStatic.gitIgnoreEntries)) result.gitIgnoreEntries = withStatic.gitIgnoreEntries;
	if (Array.isArray(withStatic.scripts)) result.scripts = withStatic.scripts;
	if (val.prototype instanceof BaseAuditor) extractMetadataFromAuditorInstance(val, result);
}
async function extractAuditorMetadataFromFile(fullPath) {
	const result = {
		capabilities: DEFAULT_AUDITOR_CAPABILITIES,
		gitIgnoreEntries: []
	};
	const scriptArg = process.argv[1];
	if (scriptArg) {
		if (path.basename(scriptArg, path.extname(scriptArg)).toLowerCase() === path.basename(fullPath, path.extname(fullPath)).toLowerCase()) return extractStaticMetadataFromFile(fullPath);
	}
	let timer;
	try {
		const fileUrl = pathToFileURL(fullPath).href;
		const timeoutPromise = new Promise((_, reject) => {
			timer = setTimeout(() => reject(/* @__PURE__ */ new Error(`Import timeout for ${fullPath}`)), DYNAMIC_IMPORT_TIMEOUT_MS);
			if (timer.unref) timer.unref();
		});
		const mod = await Promise.race([import(fileUrl), timeoutPromise]);
		if (typeof mod.icon === "string") result.icon = mod.icon;
		if (Array.isArray(mod.gitIgnoreEntries)) result.gitIgnoreEntries = mod.gitIgnoreEntries;
		else if (Array.isArray(mod.GITIGNORE_ENTRIES)) result.gitIgnoreEntries = mod.GITIGNORE_ENTRIES;
		for (const val of Object.values(mod)) extractMetadataFromFunction(val, result);
		const staticMeta = extractStaticMetadataFromFile(fullPath);
		if (!result.configKey && staticMeta.configKey) result.configKey = staticMeta.configKey;
		if (!result.defaultConfig && staticMeta.defaultConfig) result.defaultConfig = staticMeta.defaultConfig;
		if (!result.description && staticMeta.description) result.description = staticMeta.description;
		if (!result.icon && staticMeta.icon) result.icon = staticMeta.icon;
	} catch {
		return extractStaticMetadataFromFile(fullPath);
	} finally {
		if (timer) clearTimeout(timer);
	}
	return result;
}
//#endregion
export { extractAuditorMetadataFromFile, extractStaticMetadataFromFile };
