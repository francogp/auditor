import { getAuditConfig } from "./auditConfigLoader.js";
import path from "node:path";
import fs from "node:fs";
//#region src/core/auditZLayers.ts
/**
* packages/auditor/src/core/auditZLayers.ts
*
* Z-Layers resolution helpers, TypeScript parser, and canonical default layer map.
*/
/**
* Resolves the primary SCSS file path for Z-Layers from config or stylesRoots.
*/
function resolveZLayersScssPath(projectRoot = process.cwd()) {
	const config = getAuditConfig(projectRoot);
	const rawTarget = config.styles?.zLayersScssFile ?? config.styles?.baseScssFile;
	if (rawTarget) {
		const configuredPath = path.resolve(projectRoot, rawTarget);
		if (fs.existsSync(configuredPath)) return configuredPath;
	}
	const stylesRoots = config.paths?.stylesRoots ?? ["src/styles"];
	const baseNames = [
		"_base.scss",
		"core/_base.scss",
		"base.scss",
		"main.scss",
		"index.scss"
	];
	for (const r of stylesRoots) for (const b of baseNames) {
		const candidate = path.resolve(projectRoot, r, b);
		if (fs.existsSync(candidate)) return candidate;
	}
}
/**
* Canonical fallback Z-Layers scale matching framework standards.
*/
const Z_LAYERS = Object.freeze({
	BASE: 0,
	LOW: 50,
	CONTENT: 100,
	HEADER: 500,
	SIDEBAR: 800,
	HUD: 1e3,
	NAVIGATION: 5e3,
	DROPDOWN: 7e3,
	OVERLAY: 1e4,
	MODAL: 11e3,
	MODAL_STEP: 10,
	TOOLTIP: 15e3,
	TOAST: 2e4,
	MAX: 1e5,
	CRITICAL: 999999
});
function parseZLayersFromTs(tsPath) {
	if (!fs.existsSync(tsPath)) return null;
	try {
		const objMatch = fs.readFileSync(tsPath, "utf-8").match(/(?:export\s+)?const\s+Z_LAYERS\s*=\s*\{([\s\S]*?)\}(?:\s*as\s+const)?\s*;/);
		if (!objMatch?.[1]) return null;
		const parsed = {};
		for (const line of objMatch[1].split("\n")) {
			const propMatch = line.match(/^\s*(\w+)\s*:\s*(-?\d+)/);
			if (propMatch?.[1] && propMatch[2]) parsed[propMatch[1]] = parseInt(propMatch[2], 10);
		}
		return Object.keys(parsed).length > 0 ? parsed : null;
	} catch {
		return null;
	}
}
/**
* Resolves the effective Z-Layers dictionary from config.styles.zLayers,
* or by parsing the TypeScript file defined in config.styles.zLayersTsFile or config.domain.zLayersFile,
* or falls back to the default Z_LAYERS.
*/
function getEffectiveZLayers(projectRoot = process.cwd()) {
	const config = getAuditConfig(projectRoot);
	if (config.styles?.zLayers && Object.keys(config.styles.zLayers).length > 0) return config.styles.zLayers;
	const rawTsTarget = config.styles?.zLayersTsFile ?? config.domain?.zLayersFile;
	if (rawTsTarget) {
		const parsed = parseZLayersFromTs(path.resolve(projectRoot, rawTsTarget));
		if (parsed) return parsed;
	}
	return Z_LAYERS;
}
//#endregion
export { Z_LAYERS, getEffectiveZLayers, resolveZLayersScssPath };
