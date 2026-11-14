import { safeJsonParse, safeReadFileSync, tryOrNull } from "./safeUtils.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
// src/core/stylelintConfigResolver.ts
/**
* src/core/stylelintConfigResolver.ts
*
* Pre-resolves Stylelint JSON configs (`extends`, `plugins`, and `overrides[*].extends`)
* relative to each config file's own directory so Stylelint 18+ resolves nested
* presets (e.g. `stylelint-config-standard-scss` inside `@francogp/auditor/node_modules`)
* independently of npm hoisting or host `cwd`.
*/
const SPECIAL_CONFIG_KEYS = /* @__PURE__ */ new Set([
	"extends",
	"plugins",
	"overrides",
	"rules",
	"$schema"
]);
function toStringArray(value) {
	if (typeof value === "string") return [value];
	if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
	return [];
}
function resolveStylelintModuleFromDir(specifier, baseDir) {
	if (specifier.startsWith(".") || path.isAbsolute(specifier)) return path.resolve(baseDir, specifier);
	const parentUrl = pathToFileURL(path.join(baseDir, "noop.js")).href;
	return tryOrNull(() => fileURLToPath(import.meta.resolve(specifier, parentUrl))) ?? specifier;
}
function resolveStylelintOverrides(overrides, baseDir) {
	if (!Array.isArray(overrides)) return [];
	return overrides.map((entry) => {
		const resolved = { ...entry };
		if (entry.extends !== void 0) resolved.extends = toStringArray(entry.extends).map((ext) => resolveStylelintModuleFromDir(ext, baseDir));
		if (entry.plugins !== void 0) resolved.plugins = toStringArray(entry.plugins).map((plugin) => resolveStylelintModuleFromDir(plugin, baseDir));
		return resolved;
	});
}
function mergeConfigFields(acc, source) {
	if (source.rules && typeof source.rules === "object") acc.rules = {
		...acc.rules,
		...source.rules
	};
	for (const [k, v] of Object.entries(source)) if (!SPECIAL_CONFIG_KEYS.has(k)) acc.rest[k] = v;
}
function flattenStylelintJsonConfig(filePath, visited = /* @__PURE__ */ new Set()) {
	if (!filePath.endsWith(".json") || !fs.existsSync(filePath) || visited.has(filePath)) return null;
	visited.add(filePath);
	const raw = safeReadFileSync(filePath);
	if (!raw) return null;
	const parsed = safeJsonParse(raw);
	if (!parsed) return null;
	const baseDir = path.dirname(filePath);
	const acc = {
		extendsList: [],
		plugins: [],
		overrides: [],
		rules: {},
		rest: {}
	};
	for (const ext of toStringArray(parsed.extends)) {
		const resolvedPath = resolveStylelintModuleFromDir(ext, baseDir);
		const nested = flattenStylelintJsonConfig(resolvedPath, visited);
		if (nested) {
			acc.extendsList.push(...toStringArray(nested.extends));
			if (Array.isArray(nested.plugins)) acc.plugins.push(...nested.plugins);
			if (Array.isArray(nested.overrides)) acc.overrides.push(...nested.overrides);
			mergeConfigFields(acc, nested);
		} else acc.extendsList.push(resolvedPath);
	}
	for (const plugin of toStringArray(parsed.plugins)) acc.plugins.push(resolveStylelintModuleFromDir(plugin, baseDir));
	acc.overrides.push(...resolveStylelintOverrides(parsed.overrides, baseDir));
	mergeConfigFields(acc, parsed);
	return {
		...acc.rest,
		...acc.extendsList.length > 0 ? { extends: acc.extendsList } : {},
		...acc.plugins.length > 0 ? { plugins: acc.plugins } : {},
		...acc.overrides.length > 0 ? { overrides: acc.overrides } : {},
		rules: acc.rules
	};
}
export { flattenStylelintJsonConfig };
