import { getAuditConfig } from "../core/auditConfigLoader.js";
import "../core/auditConfig.js";
import { Z_LAYERS, getEffectiveZLayers } from "../core/auditZLayers.js";
import { isExemptFile } from "../core/auditPathPredicates.js";
import { CANONICAL_Z_LAYERS } from "../modals/modalZLayers.js";
import { normalizeFilePath } from "./auditRuleTypes.js";
// src/analyzers/zIndexRules.ts
/**
* packages/auditor/src/analyzers/zIndexRules.ts
*
* Z-Index Design System Parity and isolated constant rules.
*/
const Z_INDEX_CONSISTENCY_DESCRIPTOR = {
	id: "z-index-parity",
	name: "Z-Index Parity (Design System Layers)",
	category: "Z-Index outside standard",
	aliases: [
		"z-index",
		"zindex",
		"visuals",
		"parity",
		"z-index-parity"
	]
};
const ACTIVE_Z_LAYERS = getEffectiveZLayers();
const Z_VALUE_MAP = Object.fromEntries(Object.entries(ACTIVE_Z_LAYERS).map(([key, value]) => [value, key]));
const Z_SORTED_ENTRIES = Object.entries(ACTIVE_Z_LAYERS).sort((a, b) => a[1] - b[1]);
const zLayerIndexCache = /* @__PURE__ */ new WeakMap();
function getZLayerIndex(layers) {
	const cached = zLayerIndexCache.get(layers);
	if (cached) return cached;
	const allEntries = Object.entries(layers);
	const layerEntries = allEntries.filter(([key]) => key !== "MODAL_STEP");
	const effectiveEntries = layerEntries.length > 0 ? layerEntries : allEntries;
	const exactByValue = /* @__PURE__ */ new Map();
	for (const [key, value] of effectiveEntries) exactByValue.set(value, key);
	const built = {
		exactByValue,
		sortedLayers: [...effectiveEntries].sort((a, b) => a[1] - b[1])
	};
	zLayerIndexCache.set(layers, built);
	return built;
}
function resolveZLayer(val, layers = getEffectiveZLayers()) {
	const index = getZLayerIndex(layers);
	const exactEntry = index.exactByValue.get(val);
	if (exactEntry) return {
		exactKey: exactEntry,
		cssVarExpr: `var(--z-${exactEntry.toLowerCase().replace(/_/g, "-")})`
	};
	let nearestKey = "";
	let nearestVal = 0;
	let minDiff = Number.POSITIVE_INFINITY;
	for (const [key, zVal] of index.sortedLayers) {
		const diff = Math.abs(val - zVal);
		if (diff < minDiff) {
			minDiff = diff;
			nearestKey = key;
			nearestVal = zVal;
		}
	}
	if (nearestKey) {
		const key = nearestKey.toLowerCase().replace(/_/g, "-");
		const offset = val - nearestVal;
		return {
			nearestKey,
			offset,
			cssVarExpr: `calc(var(--z-${key}) ${offset >= 0 ? "+" : "-"} ${Math.abs(offset)})`
		};
	}
	return {};
}
function fixZIndexLiteral(match, layers = getEffectiveZLayers()) {
	const valMatch = match.match(/-?\d+/);
	if (!valMatch || !valMatch[0]) return match;
	const { cssVarExpr } = resolveZLayer(parseInt(valMatch[0], 10), layers);
	if (!cssVarExpr) return match;
	const isJsProp = match.startsWith("zIndex");
	const propName = isJsProp ? "zIndex" : "z-index";
	return isJsProp ? `${propName}: '${cssVarExpr}'` : `${propName}: ${cssVarExpr}`;
}
const zIndexAudit = {
	id: "zIndexAudit",
	name: "Z-Index Audit",
	category: "Z-Index outside standard",
	aliases: [
		"z-index",
		"zindex",
		"z_index"
	],
	regex: /(?:z-index|zIndex)\s*:\s*(-?\d+)\b/gi,
	message: (match) => {
		const numMatch = match.match(/-?\d+/);
		if (!numMatch || !numMatch[0]) return `Hardcoded z-index detected: '${match}'. Use 'var(--z-layer)'.`;
		const { exactKey, nearestKey, cssVarExpr } = resolveZLayer(parseInt(numMatch[0], 10));
		if (exactKey && cssVarExpr) return `Hardcoded z-index detected: '${match}'. Corresponds to Z_LAYERS.${exactKey}. Use '${cssVarExpr}'.`;
		if (nearestKey && cssVarExpr) return `Relative z-index detected: '${match}'. Near Z_LAYERS.${nearestKey}. Use '${cssVarExpr}'.`;
		const zFile = getAuditConfig().styles?.zLayersTsFile ?? getAuditConfig().domain?.zLayersFile;
		return `Hardcoded non-standard z-index: '${match}'. Define a new layer ${zFile ? `in '${zFile}'` : "in styles configuration"} or use an existing one.`;
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
		return `Isolated z-index constant declaration detected: '${match}'. Declaring z-index constants outside of ${zFile ? `'${zFile}' (Z_LAYERS)` : "the canonical Z_LAYERS configuration"} is PROHIBITED. Register the layer in Z_LAYERS or consume 'Z_LAYERS.<LAYER>'.`;
	},
	severity: "error",
	check: (_content, _match, filePath) => {
		const config = getAuditConfig();
		if (config.styles?.zLayersEnabled === false) return false;
		if (!filePath) return false;
		const norm = normalizeFilePath(filePath);
		const zFile = config.styles?.zLayersTsFile ?? config.domain?.zLayersFile;
		if (zFile && norm.includes(normalizeFilePath(zFile))) return false;
		return !norm.includes("node_modules");
	},
	fixable: false
};
export { ACTIVE_Z_LAYERS, CANONICAL_Z_LAYERS, Z_INDEX_CONSISTENCY_DESCRIPTOR, Z_LAYERS, Z_SORTED_ENTRIES, Z_VALUE_MAP, fixZIndexLiteral, resolveZLayer, zIndexAudit, zIndexConstantDeclaration };
