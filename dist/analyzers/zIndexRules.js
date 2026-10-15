import { getAuditConfig } from "../core/auditConfigLoader.js";
import { Z_LAYERS } from "../core/auditZLayers.js";
import { isExemptFile } from "../core/auditPathPredicates.js";
import "../core/auditConfig.js";
import { normalizeFilePath } from "./auditRuleTypes.js";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
//#region src/analyzers/zIndexRules.ts
/**
* packages/auditor/src/analyzers/zIndexRules.ts
*
* Z-Index Design System Parity and isolated constant rules.
*/
const Z_INDEX_CONSISTENCY_DESCRIPTOR = {
	id: "z-index-parity",
	name: "Z-Index Parity (Design System Layers)",
	category: "Z-Index fuera de estándar",
	aliases: [
		"z-index",
		"zindex",
		"visuals",
		"parity",
		"z-index-parity"
	]
};
const CANONICAL_DEFAULT_Z_LAYERS = {
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
};
function parseZLayersFromContent(content) {
	const match = content.match(/export\s+const\s+Z_LAYERS\s*=\s*\{([\s\S]*?)\}\s*(?:as\s+const)?;/);
	if (!match?.[1]) return null;
	const result = {};
	for (const line of match[1].split("\n")) {
		const m = line.match(/([A-Z_]\w*)\s*:\s*(-?\d+)/i);
		if (m?.[1] && m?.[2]) result[m[1]] = parseInt(m[2], 10);
	}
	return result;
}
function tryReadZLayersFile(relFile) {
	const absPath = path.resolve(process.cwd(), relFile);
	if (!existsSync(absPath)) return null;
	try {
		return parseZLayersFromContent(readFileSync(absPath, "utf-8"));
	} catch {
		return null;
	}
}
function loadZLayers() {
	const config = getAuditConfig();
	if (config.styles?.zLayers && Object.keys(config.styles.zLayers).length > 0) return { ...config.styles.zLayers };
	const relFile = config.styles?.zLayersTsFile ?? config.domain?.zLayersFile;
	if (relFile) {
		const parsed = tryReadZLayersFile(relFile);
		if (parsed) return parsed;
	}
	return CANONICAL_DEFAULT_Z_LAYERS;
}
const ACTIVE_Z_LAYERS = loadZLayers();
const Z_VALUE_MAP = Object.fromEntries(Object.entries(ACTIVE_Z_LAYERS).map(([key, value]) => [value, key]));
const Z_SORTED_ENTRIES = Object.entries(ACTIVE_Z_LAYERS).sort((a, b) => a[1] - b[1]);
/** Sentinel: initial minDiff larger than any possible difference between Z layer values. */
const Z_LAYERS_DIFF_SENTINEL = Z_SORTED_ENTRIES.length + 1;
function resolveZLayer(val) {
	const entry = Z_VALUE_MAP[val];
	if (entry) return {
		exactKey: entry,
		cssVarExpr: `var(--z-${entry.toLowerCase().replace(/_/g, "-")})`
	};
	let nearestKey = "";
	let minDiff = Z_LAYERS_DIFF_SENTINEL;
	for (const [key, zVal] of Z_SORTED_ENTRIES) {
		const diff = Math.abs(val - zVal);
		if (diff < minDiff) {
			minDiff = diff;
			nearestKey = key;
		}
	}
	if (nearestKey) {
		const key = nearestKey.toLowerCase().replace(/_/g, "-");
		const offset = val - (ACTIVE_Z_LAYERS[nearestKey] ?? 0);
		return {
			nearestKey,
			offset,
			cssVarExpr: `calc(var(--z-${key}) ${offset >= 0 ? "+" : "-"} ${Math.abs(offset)})`
		};
	}
	return {};
}
function fixZIndexLiteral(match) {
	const valMatch = match.match(/-?\d+/);
	if (!valMatch || !valMatch[0]) return match;
	const { cssVarExpr } = resolveZLayer(parseInt(valMatch[0], 10));
	if (!cssVarExpr) return match;
	const isJsProp = match.startsWith("zIndex");
	const propName = isJsProp ? "zIndex" : "z-index";
	return isJsProp ? `${propName}: '${cssVarExpr}'` : `${propName}: ${cssVarExpr}`;
}
const zIndexAudit = {
	id: "zIndexAudit",
	name: "Z-Index Audit",
	category: "Z-Index fuera de estándar",
	aliases: [
		"z-index",
		"zindex",
		"z_index"
	],
	regex: /(?:z-index|zIndex)\s*:\s*(-?\d+)\b/gi,
	message: (match) => {
		const numMatch = match.match(/-?\d+/);
		if (!numMatch || !numMatch[0]) return `Z-Index hardcodeado detectado: '${match}'. Usa 'var(--z-layer)'.`;
		const { exactKey, nearestKey, cssVarExpr } = resolveZLayer(parseInt(numMatch[0], 10));
		if (exactKey && cssVarExpr) return `Z-Index hardcodeado detectado: '${match}'. Corresponde a Z_LAYERS.${exactKey}. Usa '${cssVarExpr}'.`;
		if (nearestKey && cssVarExpr) return `Z-Index relativo detectado: '${match}'. Cerca de Z_LAYERS.${nearestKey}. Usa '${cssVarExpr}'.`;
		const zFile = getAuditConfig().styles?.zLayersTsFile ?? getAuditConfig().domain?.zLayersFile;
		return `Z-Index hardcodeado fuera de estándar: '${match}'. Define una nueva capa ${zFile ? `en '${zFile}'` : "en la configuración de estilos"} o usa una existente.`;
	},
	severity: "error",
	check: (_content, _match, filePath) => {
		if (getAuditConfig().styles?.zLayersEnabled === false) return false;
		if (filePath && isExemptFile(filePath)) return false;
		return true;
	},
	fix: fixZIndexLiteral,
	fixable: true
};
const zIndexConstantDeclaration = {
	regex: /const\s+(\w*Z_INDEX\w*)\s*=\s*(?:'[^']+'|"[^"]+"|\d+)/gi,
	message: (match) => {
		const zFile = getAuditConfig().styles?.zLayersTsFile ?? getAuditConfig().domain?.zLayersFile;
		return `Declaración de constante de Z-Index aislada detectada: '${match}'. Está PROHIBIDO declarar constantes de Z-Index fuera de ${zFile ? `'${zFile}' (Z_LAYERS)` : "la configuración canónica de Z_LAYERS"}. Registra la capa en Z_LAYERS o consume 'Z_LAYERS.<CAPA>'.`;
	},
	severity: "error",
	check: (_content, _match, filePath) => {
		const config = getAuditConfig();
		if (config.styles?.zLayersEnabled === false) return false;
		if (!filePath) return false;
		const norm = normalizeFilePath(filePath);
		const zFile = config.styles?.zLayersTsFile ?? config.domain?.zLayersFile;
		if (zFile && norm.includes(zFile.replace(/^\/+|\/+$/g, "").toLowerCase())) return false;
		return !norm.includes("node_modules");
	},
	fixable: false
};
//#endregion
export { ACTIVE_Z_LAYERS, CANONICAL_DEFAULT_Z_LAYERS, Z_INDEX_CONSISTENCY_DESCRIPTOR, Z_LAYERS, Z_SORTED_ENTRIES, Z_VALUE_MAP, fixZIndexLiteral, resolveZLayer, zIndexAudit, zIndexConstantDeclaration };
