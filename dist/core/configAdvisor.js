import { DEFAULT_AUDIT_CONFIG } from "./auditConfigDefaults.js";
import { safeReadFileSync } from "./safeUtils.js";
import { discoverAuditors } from "../cli/auditScanner.js";
import { parseAuditConfigTextToRecord } from "./configRatchet.js";
import { collectConfigSectionsFromTasks, deepMergeDefaultsObject } from "../suites/architecture/validate_audit_config.js";
import path from "node:path";
import fs from "node:fs";
// src/core/configAdvisor.ts
/**
* packages/auditor/src/core/configAdvisor.ts
*
* 100% DYNAMIC & AGNOSTIC CONFIGURATION ADVISOR ENGINE (Node.js 26+ Native)
*
* Evaluates target project configuration against canonical defaults and dynamically
* discovered subauditor contracts under the Unidirectional Config Ratchet principle:
*
* 1. 100% Dynamic Auto-Discovery: Discovers all active subauditors and host extensions
*    via `discoverAuditors()`. Whenever new tools or suites are added, the advisor
*    automatically inspects and advises on them with zero hardcoding.
* 2. Unidirectional Hardening: Suggests activating disabled suites, adding missing canonical
*    plugins/elements, lowering excessive complexity ceilings, and raising coverage floors.
* 3. Strictness Preserved: When a project configuration is stricter than canonical defaults
*    (lower ceilings, higher floors, extra enabled suites), it NEVER recommends relaxing them.
* 4. Non-Destructive AST Patch Generation: Generates additive TypeScript diffs for .auditor/audit.config.ts.
*/
function parseAuditConfigFileToRecord(configFilePath) {
	const code = safeReadFileSync(configFilePath);
	if (!code) return null;
	return parseAuditConfigTextToRecord(code);
}
/**
* Heuristically detects whether a numeric property represents a maximum ceiling
* (where lower is stricter, higher is more permissive).
*/
function isNumericCeiling(key, dotPath) {
	const lowerKey = key.toLowerCase();
	const lowerPath = dotPath.toLowerCase();
	if (lowerKey.startsWith("min") || lowerPath.includes(".min")) return false;
	return lowerKey.startsWith("max") || lowerKey.includes("depth") || lowerKey.includes("limit") || lowerKey.includes("lines") || lowerPath.includes("chunk") || lowerPath.includes("cognitive") || lowerPath.includes("cyclomatic") || lowerPath.includes("complexity");
}
/**
* Heuristically detects whether a numeric property represents a minimum floor
* (where higher is stricter, lower is more permissive).
*/
function isNumericFloor(key, dotPath) {
	const lowerKey = key.toLowerCase();
	const lowerPath = dotPath.toLowerCase();
	return lowerKey.startsWith("min") || lowerKey.includes("threshold") || lowerKey.includes("atleast") || lowerKey.includes("floor") || lowerPath.includes("coverage") || lowerPath.includes("similarity.threshold");
}
/**
* Assembles the full unified expected configuration tree by dynamically querying
* all discovered subauditors and falling back to canonical engine defaults.
*/
function buildUnifiedExpectedConfigTree(tasks) {
	const unified = {};
	for (const [key, val] of Object.entries(DEFAULT_AUDIT_CONFIG)) if (key !== "name" && key !== "auditorVersion" && typeof val === "object" && val !== null && !Array.isArray(val)) unified[key] = structuredClone(val);
	const taskSections = collectConfigSectionsFromTasks(tasks);
	for (const [rootKey, taskTree] of Object.entries(taskSections)) if (!unified[rootKey]) unified[rootKey] = structuredClone(taskTree);
	else deepMergeDefaultsObject(unified[rootKey], taskTree);
	return unified;
}
function handleMissingProperty(subsystem, currentPath, expectedVal, recommendations, projectRoot) {
	if (expectedVal === null || expectedVal === void 0) return;
	if (Array.isArray(expectedVal) && expectedVal.length === 0) return;
	if ((subsystem === "paths" || currentPath.startsWith("paths.") || currentPath.includes("Roots") || currentPath.endsWith("Dir") || currentPath.endsWith("Dirs")) && projectRoot) {
		if (typeof expectedVal === "string") {
			if (!fs.existsSync(path.resolve(projectRoot, expectedVal))) return;
		} else if (Array.isArray(expectedVal)) {
			if (!expectedVal.some((p) => typeof p === "string" && fs.existsSync(path.resolve(projectRoot, p)))) return;
		}
	}
	recommendations.push({
		path: currentPath,
		subsystem,
		kind: "missing_property",
		currentValue: void 0,
		recommendedValue: expectedVal,
		rationale: `Property '${currentPath}' is not configured in audit.config.ts. Setting canonical default ensures deterministic suite behavior.`,
		impact: "hygiene"
	});
}
function handleBooleanProperty(subsystem, currentPath, values, recommendations, hardenedSettings) {
	const { expectedVal, localVal } = values;
	if (expectedVal === true && localVal === false) recommendations.push({
		path: currentPath,
		subsystem,
		kind: "relaxed_boolean",
		currentValue: false,
		recommendedValue: true,
		rationale: `Setting '${currentPath}' is disabled. Enabling it satisfies canonical @francogp/auditor active-by-default standards.`,
		impact: "hardening"
	});
	else if (expectedVal === false && localVal === true) hardenedSettings.push({
		path: currentPath,
		subsystem,
		currentValue: true,
		defaultValue: false,
		reason: `Setting '${currentPath}' is explicitly enabled by the project. Stricter than default. NEVER relax.`
	});
}
function handleArrayProperty(subsystem, currentPath, expectedVal, localVal, recommendations, hardenedSettings) {
	const isPluginArray = currentPath.endsWith("plugins");
	const isPathOrScopeArray = subsystem === "paths" || currentPath.includes("Roots") || currentPath.endsWith("Dir") || currentPath.endsWith("Dirs") || currentPath.endsWith("extensions") || currentPath.endsWith("Files") || currentPath.endsWith("Globs");
	const itemKey = (item) => typeof item === "object" && item !== null ? JSON.stringify(item) : String(item);
	const localSet = new Set(localVal.map(itemKey));
	if (!isPathOrScopeArray) {
		const missingItems = expectedVal.filter((item) => !localSet.has(itemKey(item)));
		if (missingItems.length > 0) recommendations.push({
			path: currentPath,
			subsystem,
			kind: isPluginArray ? "missing_plugin" : "missing_elements",
			currentValue: [...localVal],
			recommendedValue: [...localVal, ...missingItems],
			rationale: isPluginArray ? `Missing ${missingItems.length} canonical plugin(s): [${missingItems.map(itemKey).join(", ")}]. Adding them enforces modern Node.js, Vitest, Vue, and Promise standards without altering custom plugins.` : `Missing ${missingItems.length} canonical default element(s) in '${currentPath}': [${missingItems.map(itemKey).join(", ")}].`,
			impact: "hardening"
		});
	}
	const extraItems = localVal.filter((item) => !expectedVal.map(itemKey).includes(itemKey(item)));
	if (extraItems.length > 0) hardenedSettings.push({
		path: currentPath,
		subsystem,
		currentValue: localVal,
		defaultValue: expectedVal,
		reason: `Project configured ${extraItems.length} additional custom item(s): [${extraItems.map(itemKey).join(", ")}]. Stricter than default baseline.`
	});
}
function handleNumericProperty(subsystem, currentPath, expectedVal, localVal, recommendations, hardenedSettings) {
	const pathTokens = currentPath.split(".");
	const propKey = pathTokens[pathTokens.length - 1] ?? currentPath;
	if (isNumericCeiling(propKey, currentPath)) {
		if (localVal > expectedVal) recommendations.push({
			path: currentPath,
			subsystem,
			kind: "relaxed_ceiling",
			currentValue: localVal,
			recommendedValue: expectedVal,
			rationale: `Maximum ceiling '${currentPath}' (${localVal}) is higher than canonical standard (${expectedVal}). Lowering hardens code quality.`,
			impact: "hardening"
		});
		else if (localVal < expectedVal) hardenedSettings.push({
			path: currentPath,
			subsystem,
			currentValue: localVal,
			defaultValue: expectedVal,
			reason: `Maximum ceiling '${currentPath}' (${localVal}) is stricter than canonical default (${expectedVal}). NEVER relax.`
		});
		return;
	}
	if (isNumericFloor(propKey, currentPath)) {
		if (localVal < expectedVal) recommendations.push({
			path: currentPath,
			subsystem,
			kind: "relaxed_floor",
			currentValue: localVal,
			recommendedValue: expectedVal,
			rationale: `Minimum floor '${currentPath}' (${localVal}) is lower than canonical standard (${expectedVal}). Raising increases verification rigor.`,
			impact: "hardening"
		});
		else if (localVal > expectedVal) hardenedSettings.push({
			path: currentPath,
			subsystem,
			currentValue: localVal,
			defaultValue: expectedVal,
			reason: `Minimum floor '${currentPath}' (${localVal}) is stricter than canonical standard (${expectedVal}). NEVER relax.`
		});
	}
}
function handleSeverityProperty(subsystem, currentPath, expectedVal, localVal, recommendations, hardenedSettings) {
	const severityRank = {
		error: 3,
		warning: 2,
		suggestion: 1
	};
	const expRank = severityRank[expectedVal];
	const locRank = severityRank[localVal];
	if (expRank === void 0 || locRank === void 0) return;
	if (locRank < expRank) recommendations.push({
		path: currentPath,
		subsystem,
		kind: "relaxed_severity",
		currentValue: localVal,
		recommendedValue: expectedVal,
		rationale: `Severity level '${currentPath}' ('${localVal}') is more permissive than canonical default ('${expectedVal}'). Raising to '${expectedVal}' prevents defect accumulation.`,
		impact: "hardening"
	});
	else if (locRank > expRank) hardenedSettings.push({
		path: currentPath,
		subsystem,
		currentValue: localVal,
		defaultValue: expectedVal,
		reason: `Severity level '${currentPath}' ('${localVal}') is stricter than default ('${expectedVal}'). NEVER relax.`
	});
}
/**
* Fully agnostic, recursive property evaluator. Works across ANY subsystem,
* current or future, inspecting objects, arrays, numbers, booleans, and severities.
*/
function evaluateAgnosticPropertyTree(subsystem, currentPath, expectedVal, localVal, recommendations, hardenedSettings, projectRoot) {
	if (localVal === void 0) {
		handleMissingProperty(subsystem, currentPath, expectedVal, recommendations, projectRoot);
		return;
	}
	if (typeof expectedVal === "boolean" && typeof localVal === "boolean") {
		handleBooleanProperty(subsystem, currentPath, {
			expectedVal,
			localVal
		}, recommendations, hardenedSettings);
		return;
	}
	if (Array.isArray(expectedVal) && Array.isArray(localVal)) {
		handleArrayProperty(subsystem, currentPath, expectedVal, localVal, recommendations, hardenedSettings);
		return;
	}
	if (typeof expectedVal === "number" && typeof localVal === "number") {
		handleNumericProperty(subsystem, currentPath, expectedVal, localVal, recommendations, hardenedSettings);
		return;
	}
	if (typeof expectedVal === "string" && typeof localVal === "string") {
		handleSeverityProperty(subsystem, currentPath, expectedVal, localVal, recommendations, hardenedSettings);
		return;
	}
	if (typeof expectedVal === "object" && expectedVal !== null && !Array.isArray(expectedVal) && typeof localVal === "object" && localVal !== null && !Array.isArray(localVal)) {
		const expRecord = expectedVal;
		const locRecord = localVal;
		for (const [subKey, subExpected] of Object.entries(expRecord)) {
			if (subExpected === void 0) continue;
			evaluateAgnosticPropertyTree(subsystem, `${currentPath}.${subKey}`, subExpected, locRecord[subKey], recommendations, hardenedSettings, projectRoot);
		}
	}
}
/**
* 100% Dynamic Project Configuration Evaluator.
* Accepts sync tasks when provided, or dynamically loads them via `discoverAuditors`.
*/
async function evaluateProjectConfigAsync(projectRoot = process.cwd(), options = {}) {
	const configFile = path.join(projectRoot, ".auditor", "audit.config.ts");
	return evaluateProjectConfigFromData(projectRoot, configFile, options.rawConfigOverride ?? parseAuditConfigFileToRecord(configFile) ?? {}, options.tasks ?? await discoverAuditors({
		projectRoot,
		withBuild: true,
		speed: "full"
	}).catch(() => []), options);
}
/**
* Synchronous project config evaluator (when tasks are provided or loaded synchronously).
*/
function evaluateProjectConfig(projectRoot = process.cwd(), options = {}) {
	const configFile = path.join(projectRoot, ".auditor", "audit.config.ts");
	return evaluateProjectConfigFromData(projectRoot, configFile, options.rawConfigOverride ?? parseAuditConfigFileToRecord(configFile) ?? {}, options.tasks ?? [], options);
}
function evaluateProjectConfigFromData(projectRoot, configFile, rawLocalConfig, tasks, options) {
	const unifiedExpectedTree = buildUnifiedExpectedConfigTree(tasks);
	const recommendations = [];
	const hardenedSettings = [];
	let totalChecked = 0;
	for (const [sectionKey, sectionExpected] of Object.entries(unifiedExpectedTree)) {
		if (options.targetSubsystem && options.targetSubsystem !== sectionKey) continue;
		totalChecked++;
		const localSection = rawLocalConfig[sectionKey];
		if (localSection === void 0) {
			recommendations.push({
				path: sectionKey,
				subsystem: sectionKey,
				kind: "missing_section",
				currentValue: void 0,
				recommendedValue: sectionExpected,
				rationale: `Subsystem '${sectionKey}' is discovered from active auditor suites but not declared in audit.config.ts. Configuring defaults enables full architectural governance.`,
				impact: "feature"
			});
			continue;
		}
		if (typeof localSection === "object" && localSection !== null && !Array.isArray(localSection)) {
			const sectionRecord = localSection;
			if (sectionRecord.enabled === false) {
				if (sectionExpected.enabled === true) recommendations.push({
					path: `${sectionKey}.enabled`,
					subsystem: sectionKey,
					kind: "relaxed_boolean",
					currentValue: false,
					recommendedValue: true,
					rationale: `Subsystem '${sectionKey}' is currently disabled. Activating it enables architectural analysis.`,
					impact: "hardening"
				});
				continue;
			}
			for (const [key, expectedVal] of Object.entries(sectionExpected)) {
				if (expectedVal === void 0) continue;
				if (key === "enabled" && sectionRecord[key] === void 0) continue;
				evaluateAgnosticPropertyTree(sectionKey, `${sectionKey}.${key}`, expectedVal, sectionRecord[key], recommendations, hardenedSettings, projectRoot);
			}
		}
	}
	const optimalCount = Math.max(0, totalChecked - recommendations.length - hardenedSettings.length);
	return {
		projectRoot,
		configFile,
		totalChecked,
		optimalCount,
		hardenedCount: hardenedSettings.length,
		recommendationsCount: recommendations.length,
		recommendations,
		hardenedSettings
	};
}
export { buildUnifiedExpectedConfigTree, evaluateAgnosticPropertyTree, evaluateProjectConfig, evaluateProjectConfigAsync, isNumericCeiling, isNumericFloor, parseAuditConfigFileToRecord };
