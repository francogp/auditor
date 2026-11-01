import { enableCompileCache } from "node:module";
import path from "node:path";
// src/core/satelliteConfigParity.ts
/**
* src/core/satelliteConfigParity.ts
*
* UNIVERSAL RECURSIVE SATELLITE CONFIG PARITY ENGINE & REGISTRY (Node.js 26+ Native)
*
* Enforces the Single Source of Truth (SSoT) Sovereignty Mandate:
*   1. Maintains the canonical catalog of all governed satellite configuration files.
*   2. Provides deep recursive comparison (deepCompareSatelliteConfig) detecting undeclared,
*      missing, or divergent properties and sub-properties at any nesting depth.
*   3. Provides deep recursive projection merging (mergeSatelliteConfigProjection) for deterministic
*      auto-fix synchronization in `npm run auditor:fix` (phase: 'setup').
*/
enableCompileCache();
/**
* Immutable catalog of all satellite configuration file basenames governed by @francogp/auditor.
*/
const GOVERNED_SATELLITE_FILES = Object.freeze([
	".fallowrc.json",
	".fallowrc",
	".fallowrc.js",
	".fallowrc.cjs",
	"fallow.config.js",
	"fallow.config.ts",
	".stylelintrc.json",
	".stylelintrc",
	".stylelintrc.js",
	".stylelintrc.cjs",
	".stylelintrc.mjs",
	"stylelint.config.js",
	"stylelint.config.cjs",
	"stylelint.config.mjs",
	".htmlvalidate.json",
	".htmlvalidate.js",
	".htmlvalidate.cjs",
	".markdownlint.json",
	".markdownlint.yaml",
	".markdownlint.yml",
	"tsconfig.json",
	"tsconfig.app.json",
	"tsconfig.node.json",
	"tsconfig.vitest.json",
	"tsconfig.build.json",
	"tsconfig.ts7.json",
	"vite.config.ts",
	"vite.config.js",
	"vite.config.mjs"
]);
const GOVERNED_SATELLITE_SET = new Set(GOVERNED_SATELLITE_FILES);
/**
* Checks whether a given file path corresponds to a governed satellite configuration file.
*/
function isGovernedSatelliteFile(filePath) {
	if (!filePath || typeof filePath !== "string") return false;
	const basename = path.basename(filePath.trim());
	return GOVERNED_SATELLITE_SET.has(basename);
}
function isPlainObject(val) {
	return typeof val === "object" && val !== null && !Array.isArray(val);
}
function arePrimitiveArraysEqual(a, b) {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}
function detectUndeclaredObjectEntries(actualConfig, ssotRecord, allowedExtraKeys, pathPrefix) {
	const diffs = [];
	for (const key of Object.keys(actualConfig)) {
		const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;
		if (allowedExtraKeys.has(fullPath) || allowedExtraKeys.has(key)) continue;
		if (!(key in ssotRecord)) diffs.push({
			path: fullPath,
			kind: "undeclared_entry",
			expected: void 0,
			actual: actualConfig[key],
			message: `Undeclared configuration entry '${fullPath}' in satellite configuration. To legitimize this entry, declare it in .auditor/audit.config.ts, or remove it from the satellite file.`
		});
	}
	return diffs;
}
function detectMissingOrDivergentObjectEntries(ssotRecord, actualConfig, allowedExtraKeys, pathPrefix, ignoreMissingInActual) {
	const diffs = [];
	for (const [key, ssotVal] of Object.entries(ssotRecord)) {
		if (ssotVal === void 0) continue;
		const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;
		if (!(key in actualConfig)) {
			if (!ignoreMissingInActual) diffs.push({
				path: fullPath,
				kind: "missing_required_entry",
				expected: ssotVal,
				actual: void 0,
				message: `Missing required entry '${fullPath}' in satellite configuration.`
			});
			continue;
		}
		const actualVal = actualConfig[key];
		const nestedDiffs = deepCompareSatelliteConfig({
			ssotProjection: ssotVal,
			actualConfig: actualVal,
			allowedExtraKeys,
			pathPrefix: fullPath,
			ignoreMissingInActual
		});
		diffs.push(...nestedDiffs);
	}
	return diffs;
}
/**
* Recursively compares an actual satellite configuration against the SSoT projection.
* Flags any undeclared sub-properties, divergent values, or missing mandatory properties.
*/
function deepCompareSatelliteConfig(options) {
	const { ssotProjection, actualConfig, allowedExtraKeys = /* @__PURE__ */ new Set(), pathPrefix = "", ignoreMissingInActual = false } = options;
	const diffs = [];
	if (actualConfig === void 0) {
		if (!ignoreMissingInActual) diffs.push({
			path: pathPrefix || "(root)",
			kind: "missing_required_entry",
			expected: ssotProjection,
			actual: void 0,
			message: `Missing required configuration section '${pathPrefix || "(root)"}'.`
		});
		return diffs;
	}
	if (isPlainObject(ssotProjection)) {
		if (!isPlainObject(actualConfig)) {
			diffs.push({
				path: pathPrefix || "(root)",
				kind: "divergent_value",
				expected: ssotProjection,
				actual: actualConfig,
				message: `Expected object at '${pathPrefix || "(root)"}', found ${typeof actualConfig}.`
			});
			return diffs;
		}
		diffs.push(...detectUndeclaredObjectEntries(actualConfig, ssotProjection, allowedExtraKeys, pathPrefix), ...detectMissingOrDivergentObjectEntries(ssotProjection, actualConfig, allowedExtraKeys, pathPrefix, ignoreMissingInActual));
		return diffs;
	}
	if (Array.isArray(ssotProjection)) {
		if (!Array.isArray(actualConfig)) {
			diffs.push({
				path: pathPrefix,
				kind: "divergent_value",
				expected: ssotProjection,
				actual: actualConfig,
				message: `Expected array at '${pathPrefix}', found ${typeof actualConfig}.`
			});
			return diffs;
		}
		if (!arePrimitiveArraysEqual(ssotProjection, actualConfig)) diffs.push({
			path: pathPrefix,
			kind: "divergent_value",
			expected: ssotProjection,
			actual: actualConfig,
			message: `Divergent array elements at '${pathPrefix}'. Expected: ${JSON.stringify(ssotProjection)}, Found: ${JSON.stringify(actualConfig)}.`
		});
		return diffs;
	}
	if (ssotProjection !== actualConfig) diffs.push({
		path: pathPrefix,
		kind: "divergent_value",
		expected: ssotProjection,
		actual: actualConfig,
		message: `Divergent value at '${pathPrefix}'. Expected: ${JSON.stringify(ssotProjection)}, Found: ${JSON.stringify(actualConfig)}.`
	});
	return diffs;
}
const CANONICAL_EXTRA_SATELLITE_KEYS = ["$schema"];
/**
* Deep merges/projects an SSoT configuration onto a target satellite config object.
* Overwrites divergent values and removes undeclared entries from governed sections.
* Returns true if modifications were applied.
*/
function mergeSatelliteConfigProjection(target, projection, allowedExtraKeys = new Set(CANONICAL_EXTRA_SATELLITE_KEYS)) {
	let modified = false;
	for (const [key, projVal] of Object.entries(projection)) {
		if (projVal === void 0) continue;
		if (!(key in target)) {
			target[key] = structuredClone(projVal);
			modified = true;
			continue;
		}
		const currentVal = target[key];
		if (isPlainObject(projVal) && isPlainObject(currentVal)) {
			if (mergeSatelliteConfigProjection(currentVal, projVal, allowedExtraKeys)) modified = true;
			for (const curKey of Object.keys(currentVal)) if (!(curKey in projVal) && !allowedExtraKeys.has(curKey)) {
				delete currentVal[curKey];
				modified = true;
			}
		} else if (Array.isArray(projVal) && Array.isArray(currentVal)) {
			if (!arePrimitiveArraysEqual(projVal, currentVal)) {
				target[key] = structuredClone(projVal);
				modified = true;
			}
		} else if (currentVal !== projVal) {
			target[key] = projVal;
			modified = true;
		}
	}
	return modified;
}
export { CANONICAL_EXTRA_SATELLITE_KEYS, GOVERNED_SATELLITE_FILES, deepCompareSatelliteConfig, isGovernedSatelliteFile, mergeSatelliteConfigProjection };
