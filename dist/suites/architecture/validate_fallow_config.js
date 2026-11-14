import { ensureMandatoryDirectoriesExist } from "../../core/auditBootstrap.js";
import "../../core/auditConfig.js";
import { DEFAULT_SIMILAR_CODE_THRESHOLD } from "../../core/auditConfigDefaults.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { CANONICAL_RULE_SEVERITY_LEVELS } from "../../core/auditConfigTypes.js";
import { SATELLITE_CONFIG_EXPLANATIONS } from "../../core/auditContract.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { getEffectiveIgnoreGlobs } from "../../core/canonicalIgnoreRegistry.js";
import { isPathContained, toPosixRelative } from "../../core/safePath.js";
import { safeJsonParse, safeReadFileSync, tryCatchSync } from "../../core/safeUtils.js";
import { deepCompareSatelliteConfig, mergeSatelliteConfigProjection } from "../../core/satelliteConfigParity.js";
import { getAllowedSatellitePathExcludes, validateSatelliteUndeclaredEntries } from "../../core/satelliteGlobMatcher.js";
import "./validate_fallow.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
// src/suites/architecture/validate_fallow_config.ts
/**
* scripts/auditors/architecture/validate_fallow_config.ts
*
* FALLOW CONFIGURATION & EXPORTS HYGIENE AUDITOR (Node.js 26+)
*
* Enforces the integrity of .fallowrc.json:
*   1. Prohibits banned blanket entry globs (e.g. src/components/**) that suppress dead code.
*   2. Guarantees that 100% of files listed in ignoreExports actually exist on disk.
*   3. Guarantees that 100% of symbols in ignoreExports are legitimately exported in their files.
*   4. Flags duplicate entries and empty export lists.
*/
enableCompileCache();
const FALLOW_CONFIG_RULES = [
	"fallow-config-missing",
	"fallow-config-syntax",
	"fallow-banned-entry-glob",
	"fallow-stale-file",
	"fallow-stale-export",
	"fallow-empty-export-list",
	"fallow-duplicate-entry",
	"fallow-config-workspace-diagnostic",
	"fallow-undeclared-config-entry",
	"fallow-config-doctor"
];
const FALLOW_CONFIG_EXECUTION_TIMEOUT_MS = 3e4;
function getBannedEntryGlobs(projectRoot) {
	const config = getAuditConfig(projectRoot);
	const globs = [];
	const compRoots = config.paths.componentsRoots ?? [];
	const viewRoots = config.paths.viewsRoots ?? [];
	for (const c of compRoots) globs.push(`${c}/**/*.vue`, `${c}/**`);
	for (const v of viewRoots) globs.push(`${v}/**/*.vue`, `${v}/**`);
	return globs;
}
const BANNED_ENTRY_GLOBS = getBannedEntryGlobs();
const escapeRegExp = (s) => RegExp.escape(s);
/**
* Checks whether a symbol is exported from file content.
*/
function isSymbolExportedInContent(content, symbol, isVue = false) {
	if (symbol === "default") return /export\s+default\b/.test(content) || isVue;
	const escaped = escapeRegExp(symbol);
	if (!new RegExp(`\\b${escaped}\\b`).test(content)) return false;
	return new RegExp(`export\\s+(?:const|let|var|function|async\\s+function|type|interface|enum|class|abstract\\s+class)\\s+${escaped}\\b|export\\s+(?:const|let|var)\\s+\\{[^}]*\\b${escaped}\\b|export\\s+(?:const|let|var)\\s+\\[[^\\]]*\\b${escaped}\\b|export\\s+(?:type\\s+)?\\{[^}]*\\b${escaped}\\b|export\\s+\\*\\s+as\\s+${escaped}\\b`).test(content);
}
const FALLOW_CYCLOMATIC_POLICIES = ["standard", "literal-membership"];
const VALID_CYCLOMATIC_POLICIES = new Set(FALLOW_CYCLOMATIC_POLICIES);
function createDefaultFallowConfigContent() {
	return JSON.stringify({
		$schema: "https://fallow.tools/schema/config.json",
		entry: ["src/index.ts"],
		ignorePatterns: [
			"dist/**",
			"scratch/**",
			"tests/**"
		],
		duplicates: {
			nearMiss: true,
			mode: "strict"
		},
		health: { maxCrap: 0 }
	}, null, 2) + "\n";
}
const VALID_SEVERITIES = new Set(CANONICAL_RULE_SEVERITY_LEVELS);
function validateFallowSchemaFields(parsed, auditor) {
	if (parsed.audit?.worsened && !VALID_SEVERITIES.has(parsed.audit.worsened)) auditor.addViolation({
		ruleId: "fallow-config-syntax",
		severity: "error",
		file: ".fallowrc.json",
		line: 1,
		message: `Invalid value for audit.worsened in .fallowrc.json: '${parsed.audit.worsened}'. Must be one of: 'error', 'warn', 'off'.`,
		context: ".fallowrc.json"
	});
	if (parsed.health?.cyclomaticPolicy !== void 0) {
		if (typeof parsed.health.cyclomaticPolicy !== "string" || !VALID_CYCLOMATIC_POLICIES.has(parsed.health.cyclomaticPolicy)) auditor.addViolation({
			ruleId: "fallow-config-syntax",
			severity: "error",
			file: ".fallowrc.json",
			line: 1,
			message: `Invalid value for health.cyclomaticPolicy in .fallowrc.json: '${String(parsed.health.cyclomaticPolicy)}'. Must be one of: 'standard', 'literal-membership'.`,
			context: ".fallowrc.json"
		});
	}
	if (parsed.markupExtensions !== void 0) {
		if (!(Array.isArray(parsed.markupExtensions) && parsed.markupExtensions.every((item) => typeof item === "string" && item.trim().length > 0))) auditor.addViolation({
			ruleId: "fallow-config-syntax",
			severity: "error",
			file: ".fallowrc.json",
			line: 1,
			message: `Invalid value for markupExtensions in .fallowrc.json: must be an array of non-empty extension strings.`,
			context: ".fallowrc.json"
		});
	}
	if (parsed.mutation?.runnerConfig !== void 0) {
		const runnerConfig = parsed.mutation.runnerConfig;
		if (!(typeof runnerConfig === "string" && runnerConfig.trim().length > 0 && !path.isAbsolute(runnerConfig) && isPathContained(auditor.projectRoot, runnerConfig, auditor.projectRoot))) auditor.addViolation({
			ruleId: "fallow-config-syntax",
			severity: "error",
			file: ".fallowrc.json",
			line: 1,
			message: `Invalid value for mutation.runnerConfig in .fallowrc.json: must be a non-empty relative file path string within the project root.`,
			context: ".fallowrc.json"
		});
	}
}
function loadFallowConfig(configPath, auditor) {
	if (!fs.existsSync(configPath)) return null;
	try {
		const raw = fs.readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(raw);
		validateFallowSchemaFields(parsed, auditor);
		return parsed;
	} catch (err) {
		auditor.addViolation({
			ruleId: "fallow-config-syntax",
			severity: "error",
			file: ".fallowrc.json",
			line: 1,
			message: `Error parsing .fallowrc.json: ${err.message}`,
			context: ".fallowrc.json"
		});
		return null;
	}
}
function validateFallowEntries(config, bannedGlobs, auditor) {
	if (!Array.isArray(config.entry)) return false;
	let modified = false;
	const keptEntries = [];
	for (let i = 0; i < config.entry.length; i++) {
		const pattern = config.entry[i];
		let isBanned = false;
		for (const banned of bannedGlobs) if (pattern === banned || pattern.startsWith(banned.replace(/\*.*$/, ""))) {
			isBanned = true;
			if (auditor.isFixActive()) modified = true;
			else auditor.addViolation({
				ruleId: "fallow-banned-entry-glob",
				severity: "error",
				file: ".fallowrc.json",
				line: i + 1,
				message: `Banned entry pattern '${pattern}' detected. Masks dead components or views.`,
				context: pattern,
				fixable: true
			});
		}
		if (!isBanned) keptEntries.push(pattern);
	}
	if (modified) config.entry = keptEntries.length > 0 ? keptEntries : ["src/index.ts"];
	return modified;
}
function validateExportSymbols(params) {
	const seenExportsInFile = /* @__PURE__ */ new Set();
	const keptExports = [];
	let exportCount = 0;
	let modified = false;
	for (const exp of params.entry.exports) {
		exportCount++;
		const isDup = seenExportsInFile.has(exp);
		if (isDup) {
			if (params.auditor.isFixActive()) modified = true;
			else params.auditor.addViolation({
				ruleId: "fallow-duplicate-entry",
				severity: "error",
				file: ".fallowrc.json",
				line: params.lineNum,
				message: `Duplicate export '${exp}' in '${params.relFile}'.`,
				context: `${params.relFile} -> ${exp}`,
				fixable: true
			});
		}
		seenExportsInFile.add(exp);
		const isStale = !isSymbolExportedInContent(params.content, exp, params.isVue);
		if (isStale) {
			if (params.auditor.isFixActive()) modified = true;
			else params.auditor.addViolation({
				ruleId: "fallow-stale-export",
				severity: "error",
				file: ".fallowrc.json",
				line: params.lineNum,
				message: `Symbol '${exp}' is not exported in real file '${params.relFile}'.`,
				context: `${params.relFile} -> ${exp}`,
				fixable: true
			});
		}
		if (!isDup && !isStale) keptExports.push(exp);
	}
	if (modified) params.entry.exports = keptExports;
	return {
		exportCount: modified ? keptExports.length : exportCount,
		modified
	};
}
function validateSingleIgnoreEntry(params) {
	const { entry, lineNum, projectRoot, seenFiles, auditor } = params;
	const relFile = entry.file;
	let isDuplicateFile = false;
	let modified = false;
	auditor.runSubAuditorSync("fallow-duplicate-entry", () => {
		if (seenFiles.has(relFile)) {
			isDuplicateFile = true;
			if (auditor.isFixActive()) modified = true;
			else auditor.addViolation({
				ruleId: "fallow-duplicate-entry",
				severity: "error",
				file: ".fallowrc.json",
				line: lineNum,
				message: `Duplicate file in ignoreExports: '${relFile}'.`,
				context: relFile,
				fixable: true
			});
		}
	});
	seenFiles.add(relFile);
	if (isDuplicateFile && auditor.isFixActive()) return {
		symbolCount: 0,
		keepEntry: false,
		modified: true
	};
	let hasEmptyList = false;
	auditor.runSubAuditorSync("fallow-empty-export-list", () => {
		if (!Array.isArray(entry.exports) || entry.exports.length === 0) {
			hasEmptyList = true;
			if (auditor.isFixActive()) modified = true;
			else auditor.addViolation({
				ruleId: "fallow-empty-export-list",
				severity: "error",
				file: ".fallowrc.json",
				line: lineNum,
				message: `Entry for '${relFile}' does not declare any exports in its exports array.`,
				context: relFile,
				fixable: true
			});
		}
	});
	if (hasEmptyList) return {
		symbolCount: 0,
		keepEntry: !auditor.isFixActive(),
		modified
	};
	const fullFilePath = path.resolve(projectRoot, relFile);
	let isStale = false;
	auditor.runSubAuditorSync("fallow-stale-file", () => {
		if (!fs.existsSync(fullFilePath)) {
			isStale = true;
			if (auditor.isFixActive()) modified = true;
			else auditor.addViolation({
				ruleId: "fallow-stale-file",
				severity: "error",
				file: ".fallowrc.json",
				line: lineNum,
				message: `File '${relFile}' declared in ignoreExports does not exist on disk.`,
				context: relFile,
				fixable: true
			});
		}
	});
	if (isStale) return {
		symbolCount: 0,
		keepEntry: !auditor.isFixActive(),
		modified
	};
	let symbolCount = 0;
	let keepEntry = true;
	auditor.runSubAuditorSync("fallow-stale-export", () => {
		let content;
		try {
			content = fs.readFileSync(fullFilePath, "utf-8");
		} catch (err) {
			if (auditor.isFixActive()) {
				modified = true;
				keepEntry = false;
			} else auditor.addViolation({
				ruleId: "fallow-stale-file",
				severity: "error",
				file: ".fallowrc.json",
				line: lineNum,
				message: `Could not read file '${relFile}': ${err.message}`,
				context: relFile,
				fixable: true
			});
			return;
		}
		const res = validateExportSymbols({
			entry,
			content,
			relFile,
			isVue: relFile.endsWith(".vue"),
			lineNum,
			auditor
		});
		symbolCount = res.exportCount;
		if (res.modified) {
			modified = true;
			if (entry.exports.length === 0) keepEntry = false;
		}
	});
	return {
		symbolCount,
		keepEntry,
		modified
	};
}
function validateFallowIgnoreExports(config, projectRoot, auditor) {
	if (!Array.isArray(config.ignoreExports)) return {
		fileCount: 0,
		exportCount: 0,
		modified: false
	};
	const seenFiles = /* @__PURE__ */ new Set();
	const keptEntries = [];
	let totalExports = 0;
	let modified = false;
	for (let entryIdx = 0; entryIdx < config.ignoreExports.length; entryIdx++) {
		const entry = config.ignoreExports[entryIdx];
		const res = validateSingleIgnoreEntry({
			entry,
			lineNum: entryIdx + 1,
			projectRoot,
			seenFiles,
			auditor
		});
		totalExports += res.symbolCount;
		if (res.modified) modified = true;
		if (res.keepEntry) keptEntries.push(entry);
	}
	if (modified) {
		if (keptEntries.length > 0) config.ignoreExports = keptEntries;
		else delete config.ignoreExports;
	}
	return {
		fileCount: modified ? keptEntries.length : seenFiles.size,
		exportCount: totalExports,
		modified
	};
}
function pruneRedundantFallowConfigDiagnostic(diag, config) {
	if (!config || !diag.pattern) return false;
	if (diag.kind === "entry-pattern-redundant" && Array.isArray(config.entry)) {
		const before = config.entry.length;
		config.entry = config.entry.filter((p) => p !== diag.pattern);
		if (config.entry.length === 0) delete config.entry;
		return (config.entry?.length ?? 0) !== before;
	}
	if (diag.kind === "ignore-dependencies-entry-redundant" && Array.isArray(config.ignoreDependencies)) {
		const before = config.ignoreDependencies.length;
		config.ignoreDependencies = config.ignoreDependencies.filter((p) => p !== diag.pattern);
		if (config.ignoreDependencies.length === 0) delete config.ignoreDependencies;
		return (config.ignoreDependencies?.length ?? 0) !== before;
	}
	if (diag.kind === "ignore-patterns-entry-redundant" && Array.isArray(config.ignorePatterns)) {
		const before = config.ignorePatterns.length;
		config.ignorePatterns = config.ignorePatterns.filter((p) => p !== diag.pattern);
		if (config.ignorePatterns.length === 0) delete config.ignorePatterns;
		return (config.ignorePatterns?.length ?? 0) !== before;
	}
	return false;
}
const FALLOW_REDUNDANT_CONFIG_DIAGNOSTIC_KINDS = [
	"entry-pattern-redundant",
	"ignore-dependencies-entry-redundant",
	"ignore-patterns-entry-redundant"
];
const REDUNDANT_CONFIG_DIAGNOSTIC_SET = new Set(FALLOW_REDUNDANT_CONFIG_DIAGNOSTIC_KINDS);
function executeFallowJsonCommand(projectRoot, subcmdArgs, timeoutMs = FALLOW_CONFIG_EXECUTION_TIMEOUT_MS) {
	if (process.env.FALLOW_SKIP_BINARY_VERIFY === "1" || process.env.FALLOW_SKIP_BINARY_VERIFY === "true") return {
		data: null,
		skipped: "env"
	};
	const fallowBin = [path.resolve(projectRoot, "node_modules/fallow/bin/fallow"), path.resolve(process.cwd(), "node_modules/fallow/bin/fallow")].find((c) => fs.existsSync(c));
	if (!fallowBin) return {
		data: null,
		skipped: "binary_not_found"
	};
	let stdout;
	try {
		stdout = spawnSync(process.execPath, [
			fallowBin,
			...subcmdArgs,
			"--format",
			"json",
			"--root",
			projectRoot
		], {
			encoding: "utf8",
			stdio: [
				"pipe",
				"pipe",
				"ignore"
			],
			timeout: timeoutMs
		}).stdout;
	} catch (err) {
		stdout = err?.stdout?.toString();
	}
	return { data: safeJsonParse(stdout ?? "") ?? null };
}
function formatDoctorRemediation(remediation) {
	if (typeof remediation === "string" && remediation) return ` | Remediation: ${remediation}`;
	if (remediation && typeof remediation === "object" && remediation.command) return ` | Remediation: ${remediation.command}`;
	return "";
}
function validateFallowDoctorResults(parsed, auditor) {
	if (parsed.status !== "fail" && parsed.status !== "warn") return;
	const defectiveChecks = (Array.isArray(parsed.checks) ? parsed.checks : []).filter((c) => c.status === "fail" || c.status === "warn");
	if (defectiveChecks.length === 0) {
		const severity = parsed.status === "fail" ? "error" : "warning";
		auditor.addViolation({
			ruleId: "fallow-config-doctor",
			severity,
			file: ".fallowrc.json",
			line: 1,
			message: `Fallow doctor reported ${parsed.status} status. Run 'npm run auditor:fallow:doctor' to inspect.`,
			context: "doctor"
		});
		return;
	}
	for (const check of defectiveChecks) {
		const severity = check.status === "fail" ? "error" : "warning";
		const remediation = formatDoctorRemediation(check.remediation);
		const checkId = check.id ?? check.name ?? "check";
		auditor.addViolation({
			ruleId: "fallow-config-doctor",
			severity,
			file: ".fallowrc.json",
			line: 1,
			message: `[doctor:${checkId}] ${check.message ?? "Fallow health check failed"}${remediation}`,
			context: checkId
		});
	}
}
function repairSkippedSourceDotdir(d, config) {
	const cleanPath = d.path ? normalizePosixPath(d.path) : ".auditor";
	const dotdir = `${cleanPath.startsWith("!") ? cleanPath.slice(1) : cleanPath}/**`;
	const patterns = Array.isArray(config.ignorePatterns) ? [...config.ignorePatterns] : [];
	let modified = false;
	const invertedDotdir = `!${dotdir}`;
	const invertedIdx = patterns.indexOf(invertedDotdir);
	if (invertedIdx !== -1) {
		patterns.splice(invertedIdx, 1);
		modified = true;
	}
	if (!patterns.includes(dotdir)) {
		patterns.push(dotdir);
		config.ignorePatterns = patterns;
		modified = true;
	}
	return modified;
}
function isSsotDeclaredRedundantEntry(diag, auditConfig) {
	if (!diag.pattern) return false;
	if (diag.kind === "ignore-patterns-entry-redundant") return collectDeclaredFallowIgnorePatterns(auditConfig).includes(normalizePosixPath(diag.pattern));
	if (diag.kind === "ignore-dependencies-entry-redundant") return collectDeclaredFallowIgnoreDependencies(auditConfig).includes(diag.pattern);
	if (diag.kind === "entry-pattern-redundant") return (projectFallowConfigFromAuditConfig(auditConfig).entry ?? []).includes(diag.pattern);
	return false;
}
function validateFallowWorkspaceDiagnostics(diagnostics, auditor, config) {
	if (!Array.isArray(diagnostics)) return false;
	const auditConfig = getAuditConfig(auditor.projectRoot);
	let modified = false;
	for (const d of diagnostics) {
		if (d.kind === "boundaries-not-configured" || d.kind === "rule-packs-not-configured") continue;
		const isRedundantConfigEntry = Boolean(d.kind && REDUNDANT_CONFIG_DIAGNOSTIC_SET.has(d.kind));
		if (isRedundantConfigEntry && isSsotDeclaredRedundantEntry(d, auditConfig)) continue;
		if (isRedundantConfigEntry && auditor.isFixActive() && pruneRedundantFallowConfigDiagnostic(d, config)) {
			modified = true;
			continue;
		}
		if (d.kind === "skipped-source-dotdir" && auditor.isFixActive() && config) {
			if (repairSkippedSourceDotdir(d, config)) {
				modified = true;
				continue;
			}
		}
		auditor.addViolation({
			ruleId: "fallow-config-workspace-diagnostic",
			severity: "error",
			file: d.path && d.path !== "." ? d.path : ".fallowrc.json",
			line: 1,
			message: `Workspace diagnostic (Fallow): [${d.kind || "diagnostic"}] ${d.message || ""}`,
			context: d.kind || "workspace_diagnostic",
			fixable: isRedundantConfigEntry && Boolean(d.pattern)
		});
	}
	return modified;
}
function projectDuplicatesConfig(fallow) {
	const duplicatesCfg = {
		nearMiss: fallow?.duplicates?.nearMiss ?? true,
		mode: fallow?.duplicates?.mode ?? "strict"
	};
	if (fallow?.duplicates?.minLines !== void 0) duplicatesCfg["minLines"] = fallow.duplicates.minLines;
	if (fallow?.duplicates?.minTokens !== void 0) duplicatesCfg["minTokens"] = fallow.duplicates.minTokens;
	if (fallow?.duplicates?.minOccurrences !== void 0) duplicatesCfg["minOccurrences"] = fallow.duplicates.minOccurrences;
	return duplicatesCfg;
}
function projectHealthConfig(fallow) {
	const healthCfg = { maxCrap: fallow?.health?.maxCrap ?? 0 };
	if (fallow?.health?.maxCyclomatic !== void 0) healthCfg["maxCyclomatic"] = fallow.health.maxCyclomatic;
	if (fallow?.health?.maxCognitive !== void 0) healthCfg["maxCognitive"] = fallow.health.maxCognitive;
	if (fallow?.health?.cyclomaticPolicy !== void 0) healthCfg["cyclomaticPolicy"] = fallow.health.cyclomaticPolicy;
	return healthCfg;
}
function projectMutationConfig(mutation) {
	if (!mutation?.enabled) return void 0;
	const mutationCfg = {};
	if (mutation.runner) mutationCfg["runner"] = mutation.runner;
	if (mutation.mutantsPerLine !== void 0) mutationCfg["mutantsPerLine"] = mutation.mutantsPerLine;
	if (mutation.functionScope !== void 0) mutationCfg["functionScope"] = mutation.functionScope;
	if (mutation.typecheck !== void 0) mutationCfg["typecheck"] = mutation.typecheck;
	if (mutation.runnerConfig) mutationCfg["runnerConfig"] = mutation.runnerConfig;
	if (mutation.minScore !== void 0) mutationCfg["minScore"] = mutation.minScore;
	if (mutation.concurrency !== void 0) mutationCfg["concurrency"] = mutation.concurrency;
	if (mutation.timeBudget) mutationCfg["timeBudget"] = mutation.timeBudget;
	if (mutation.operators) mutationCfg["operators"] = [...mutation.operators];
	return mutationCfg;
}
function projectFallowConfigFromAuditConfig(auditConfig) {
	const fallow = auditConfig.fallow;
	const projected = {
		duplicates: projectDuplicatesConfig(fallow),
		health: projectHealthConfig(fallow)
	};
	if (fallow?.minimumVersion) projected.minimumVersion = fallow.minimumVersion;
	if (fallow?.entry && fallow.entry.length > 0) projected.entry = [...fallow.entry];
	if (fallow?.ignoreExports && fallow.ignoreExports.length > 0) projected.ignoreExports = fallow.ignoreExports.map((item) => ({
		file: item.file,
		exports: [...item.exports]
	}));
	if (fallow?.architecture?.sharedState !== void 0) projected.architecture = { sharedState: fallow.architecture.sharedState };
	const mutationCfg = projectMutationConfig(fallow?.mutation);
	if (mutationCfg) projected.mutation = mutationCfg;
	return projected;
}
function collectDeclaredFallowIgnoreDependencies(auditConfig) {
	const raw = [...auditConfig.fallow?.ignoreDependencies ?? [], ...auditConfig.fallow?.exemptDependencies ?? []];
	return Array.from(new Set(raw));
}
function collectDeclaredFallowIgnorePatterns(auditConfig) {
	const raw = [
		...auditConfig.fallow?.ignoreGlobs ?? [],
		...auditConfig.fallow?.ignorePatterns ?? [],
		...auditConfig.fallow?.exemptPaths ?? []
	].map((p) => normalizePosixPath(p));
	return Array.from(new Set(raw));
}
function appendMissingStringEntries(existing, declared) {
	const current = Array.isArray(existing) ? [...existing] : [];
	const existingSet = new Set(current);
	let changed = false;
	for (const item of declared) if (!existingSet.has(item)) {
		current.push(item);
		existingSet.add(item);
		changed = true;
	}
	return {
		next: current,
		changed
	};
}
function applyFallowConfigFixes(config, projected, auditConfig) {
	const patch = {};
	if (projected.duplicates) patch["duplicates"] = projected.duplicates;
	if (projected.health) patch["health"] = projected.health;
	if (projected.minimumVersion) patch["minimumVersion"] = projected.minimumVersion;
	if (projected.entry) patch["entry"] = projected.entry;
	if (projected.architecture) patch["architecture"] = projected.architecture;
	if (projected.mutation) patch["mutation"] = projected.mutation;
	let pruned = false;
	if (projected.ignoreExports && JSON.stringify(config.ignoreExports ?? []) !== JSON.stringify(projected.ignoreExports)) {
		config.ignoreExports = structuredClone(projected.ignoreExports);
		pruned = true;
	}
	const declaredDeps = collectDeclaredFallowIgnoreDependencies(auditConfig);
	if (declaredDeps.length > 0) {
		const { next, changed } = appendMissingStringEntries(config.ignoreDependencies, declaredDeps);
		if (changed) {
			config.ignoreDependencies = next;
			pruned = true;
		}
	}
	const declaredPatterns = collectDeclaredFallowIgnorePatterns(auditConfig);
	if (declaredPatterns.length > 0) {
		const { next, changed } = appendMissingStringEntries(config.ignorePatterns, declaredPatterns);
		if (changed) {
			config.ignorePatterns = next;
			pruned = true;
		}
	}
	if ("typeAware" in config) {
		delete config["typeAware"];
		pruned = true;
	}
	if (!projected.mutation && "mutation" in config) {
		delete config["mutation"];
		pruned = true;
	}
	if (!projected.architecture && "architecture" in config) {
		delete config["architecture"];
		pruned = true;
	}
	return mergeSatelliteConfigProjection(config, patch) || pruned;
}
function validateUndeclaredTypeAware(config, auditor) {
	if (config.typeAware !== void 0) auditor.addViolation({
		ruleId: "fallow-undeclared-config-entry",
		severity: "error",
		file: ".fallowrc.json",
		line: 1,
		message: "Prohibited typeAware configuration in .fallowrc.json. TypeScript type-checking is unified exclusively in Vite+/Oxlint. Remove typeAware from .fallowrc.json.",
		context: "typeAware",
		fixable: true
	});
}
function validateUndeclaredDuplicates(config, projected, auditor) {
	if (!config.duplicates) return;
	const dupDiffs = deepCompareSatelliteConfig({
		ssotProjection: projected.duplicates,
		actualConfig: config.duplicates,
		pathPrefix: "duplicates"
	});
	for (const diff of dupDiffs) auditor.addViolation({
		ruleId: "fallow-undeclared-config-entry",
		severity: "error",
		file: ".fallowrc.json",
		line: 1,
		message: diff.message,
		context: diff.path,
		fixable: true
	});
}
function validateUndeclaredHealth(config, projected, auditConfig, auditor) {
	if (!config.health) return;
	const allowedHealthKeys = /* @__PURE__ */ new Set();
	if (config.health.cyclomaticPolicy && VALID_CYCLOMATIC_POLICIES.has(config.health.cyclomaticPolicy) && auditConfig.fallow?.health?.cyclomaticPolicy === void 0) allowedHealthKeys.add("cyclomaticPolicy");
	const healthDiffs = deepCompareSatelliteConfig({
		ssotProjection: projected.health,
		actualConfig: config.health,
		allowedExtraKeys: allowedHealthKeys,
		pathPrefix: "health"
	});
	for (const diff of healthDiffs) auditor.addViolation({
		ruleId: "fallow-undeclared-config-entry",
		severity: "error",
		file: ".fallowrc.json",
		line: 1,
		message: diff.message,
		context: diff.path,
		fixable: true
	});
}
function validateUndeclaredIgnorePatterns(config, auditConfig, auditor) {
	if (!Array.isArray(config.ignorePatterns)) return;
	const testGlobs = (auditConfig.paths?.testRoots ?? []).map((t) => `${normalizePosixPath(t)}/**`);
	const effectiveGlobs = getEffectiveIgnoreGlobs(auditor.projectRoot, { extraGlobs: testGlobs });
	const allowedGlobs = /* @__PURE__ */ new Set([
		...getAllowedSatellitePathExcludes(auditConfig, auditor.projectRoot),
		...(auditConfig.fallow?.ignoreGlobs ?? []).map((p) => normalizePosixPath(p)),
		...(auditConfig.fallow?.ignorePatterns ?? []).map((p) => normalizePosixPath(p)),
		...(auditConfig.fallow?.exemptPaths ?? []).map((p) => normalizePosixPath(p))
	]);
	validateSatelliteUndeclaredEntries(config.ignorePatterns, allowedGlobs, effectiveGlobs, (pattern, index) => {
		auditor.addViolation({
			ruleId: "fallow-undeclared-config-entry",
			severity: "error",
			file: ".fallowrc.json",
			line: index + 1,
			message: `Undeclared ignore pattern '${pattern}' in .fallowrc.json. To legitimize this exemption, declare it in .auditor/audit.config.ts under 'fallow.ignoreGlobs' or 'paths.ignoreGlobs', or remove it from .fallowrc.json.`,
			context: pattern
		});
	});
}
function validateUndeclaredIgnoreDependencies(config, auditConfig, auditor) {
	if (!Array.isArray(config.ignoreDependencies)) return;
	const allowedDeps = /* @__PURE__ */ new Set([...auditConfig.fallow?.ignoreDependencies ?? [], ...auditConfig.fallow?.exemptDependencies ?? []]);
	for (let i = 0; i < config.ignoreDependencies.length; i++) {
		const dep = config.ignoreDependencies[i];
		if (!allowedDeps.has(dep)) auditor.addViolation({
			ruleId: "fallow-undeclared-config-entry",
			severity: "error",
			file: ".fallowrc.json",
			line: i + 1,
			message: `Undeclared dependency exemption '${dep}' in .fallowrc.json. To legitimize this exemption, declare it in .auditor/audit.config.ts under 'fallow.ignoreDependencies', or remove it from .fallowrc.json.`,
			context: dep
		});
	}
}
function validateUndeclaredArchitecture(config, projected, auditor) {
	if (!config.architecture) return;
	const archDiffs = deepCompareSatelliteConfig({
		ssotProjection: projected.architecture ?? {},
		actualConfig: config.architecture,
		pathPrefix: "architecture"
	});
	for (const diff of archDiffs) auditor.addViolation({
		ruleId: "fallow-undeclared-config-entry",
		severity: "error",
		file: ".fallowrc.json",
		line: 1,
		message: diff.message,
		context: diff.path,
		fixable: true
	});
}
function validateUndeclaredMutation(config, projected, auditor) {
	if (!config.mutation) return;
	const mutDiffs = deepCompareSatelliteConfig({
		ssotProjection: projected.mutation ?? {},
		actualConfig: config.mutation,
		pathPrefix: "mutation"
	});
	for (const diff of mutDiffs) auditor.addViolation({
		ruleId: "fallow-undeclared-config-entry",
		severity: "error",
		file: ".fallowrc.json",
		line: 1,
		message: diff.message,
		context: diff.path,
		fixable: true
	});
}
function validateUndeclaredMinimumVersion(config, projected, auditor) {
	if (config.minimumVersion === void 0) return;
	if (projected.minimumVersion !== void 0 && config.minimumVersion === projected.minimumVersion) return;
	auditor.addViolation({
		ruleId: "fallow-undeclared-config-entry",
		severity: "error",
		file: ".fallowrc.json",
		line: 1,
		message: `Divergent or undeclared minimumVersion in .fallowrc.json. Expected: '${projected.minimumVersion ?? "undefined"}', actual: '${config.minimumVersion}'.`,
		context: "minimumVersion",
		fixable: true
	});
}
function validateUndeclaredEntry(config, projected, auditor) {
	if (!projected.entry) return;
	if (JSON.stringify(config.entry ?? []) === JSON.stringify(projected.entry)) return;
	auditor.addViolation({
		ruleId: "fallow-undeclared-config-entry",
		severity: "error",
		file: ".fallowrc.json",
		line: 1,
		message: `Divergent entry points in .fallowrc.json vs .auditor/audit.config.ts (fallow.entry). Run 'npm run auditor:fix' to synchronize.`,
		context: "entry",
		fixable: true
	});
}
function validateUndeclaredIgnoreExports(config, projected, auditor) {
	if (!projected.ignoreExports) return;
	if (JSON.stringify(config.ignoreExports ?? []) === JSON.stringify(projected.ignoreExports)) return;
	auditor.addViolation({
		ruleId: "fallow-undeclared-config-entry",
		severity: "error",
		file: ".fallowrc.json",
		line: 1,
		message: `Divergent ignoreExports in .fallowrc.json vs .auditor/audit.config.ts (fallow.ignoreExports). Run 'npm run auditor:fix' to synchronize.`,
		context: "ignoreExports",
		fixable: true
	});
}
function validateMissingDeclaredEntries(params) {
	if (params.declared.length === 0) return;
	const actualSet = new Set(params.actual ?? []);
	const missing = params.declared.filter((item) => !actualSet.has(item));
	if (missing.length === 0) return;
	params.auditor.addViolation({
		ruleId: "fallow-undeclared-config-entry",
		severity: "error",
		file: ".fallowrc.json",
		line: 1,
		message: `Missing declared ${params.ssotField} [${missing.join(", ")}] in .fallowrc.json. Run 'npm run auditor:fix' to synchronize from .auditor/audit.config.ts.`,
		context: params.ssotField,
		fixable: true
	});
}
function validateUndeclaredFallowEntries(config, auditor) {
	const auditConfig = getAuditConfig(auditor.projectRoot);
	const projected = projectFallowConfigFromAuditConfig(auditConfig);
	let modified = false;
	if (auditor.isFixActive()) modified = applyFallowConfigFixes(config, projected, auditConfig);
	else {
		validateUndeclaredTypeAware(config, auditor);
		validateUndeclaredDuplicates(config, projected, auditor);
		validateUndeclaredHealth(config, projected, auditConfig, auditor);
		validateUndeclaredArchitecture(config, projected, auditor);
		validateUndeclaredMutation(config, projected, auditor);
		validateUndeclaredMinimumVersion(config, projected, auditor);
		validateUndeclaredEntry(config, projected, auditor);
		validateUndeclaredIgnoreExports(config, projected, auditor);
		validateMissingDeclaredEntries({
			actual: config.ignoreDependencies,
			declared: collectDeclaredFallowIgnoreDependencies(auditConfig),
			ssotField: "fallow.ignoreDependencies",
			auditor
		});
		validateMissingDeclaredEntries({
			actual: config.ignorePatterns,
			declared: collectDeclaredFallowIgnorePatterns(auditConfig),
			ssotField: "fallow.ignorePatterns",
			auditor
		});
	}
	validateUndeclaredIgnorePatterns(config, auditConfig, auditor);
	validateUndeclaredIgnoreDependencies(config, auditConfig, auditor);
	return modified;
}
const FALLOW_CONFIG_REQUIREMENT = {
	id: "fallow-config",
	file: ".fallowrc.json",
	description: "Fallow configuration and exports control",
	ruleId: "fallow-config-missing",
	generateDefaultContent: () => createDefaultFallowConfigContent()
};
const FALLOW_CONFIG_FIXERS = { "fallow-config-workspace-diagnostic": ({ projectRoot }) => {
	const configPath = path.resolve(projectRoot, ".fallowrc.json");
	const parsed = safeJsonParse(safeReadFileSync(configPath) ?? "");
	if (!parsed) return;
	const auditConfig = getAuditConfig(projectRoot);
	if (applyFallowConfigFixes(parsed, projectFallowConfigFromAuditConfig(auditConfig), auditConfig)) fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
} };
var ValidateFallowConfigAuditor = class ValidateFallowConfigAuditor extends BaseAuditor {
	static cachePaths = [".fallow"];
	constructor(options = {}) {
		const projectRoot = options.projectRoot ?? process.cwd();
		const configPath = options.configFile ? path.resolve(projectRoot, options.configFile) : path.resolve(projectRoot, ".fallowrc.json");
		const relConfig = toPosixRelative(projectRoot, configPath) || ".fallowrc.json";
		const configRequirement = {
			...FALLOW_CONFIG_REQUIREMENT,
			file: relConfig,
			candidateFiles: [relConfig]
		};
		super({
			ruleFixers: FALLOW_CONFIG_FIXERS,
			usesThirdPartyTool: true,
			requiredPermissions: ["--allow-child-process"],
			thirdPartyToolPolicy: {
				toolName: "Fallow",
				fallbackBehavior: "violation",
				fallbackRuleId: "fallow-config-workspace-diagnostic",
				explainSatelliteConfig: SATELLITE_CONFIG_EXPLANATIONS.fallow
			},
			ruleCapabilities: {
				...createRuleCapabilities(FALLOW_CONFIG_RULES.filter((r) => r !== "fallow-config-doctor"), {
					speed: "light",
					phase: "setup",
					md: false,
					ast: false,
					changedOnly: false,
					critical: false
				}),
				"fallow-config-doctor": {
					speed: "full",
					phase: "setup",
					md: false,
					ast: false,
					changedOnly: false,
					critical: false
				}
			},
			configFiles: [configRequirement],
			cachePaths: ValidateFallowConfigAuditor.cachePaths,
			id: "validate_fallow_config",
			name: "Fallow Configuration & Exports Hygiene Validator",
			description: "Validates .fallowrc.json integrity and ignoreExports",
			family: "architecture",
			ruleIds: FALLOW_CONFIG_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(FALLOW_CONFIG_RULES, "setup"),
			packageName: "Fallow",
			configKey: "fallow.enabled",
			defaultConfig: {
				enabled: true,
				health: {
					maxCognitive: 20,
					maxCyclomatic: 25,
					cyclomaticPolicy: "standard"
				},
				enforceTargets: true,
				maxTargetPriority: "high",
				typeAware: false,
				showCascade: true,
				duplicates: {
					enabled: true,
					nearMiss: true,
					mode: "strict"
				},
				similarCode: {
					enabled: true,
					threshold: DEFAULT_SIMILAR_CODE_THRESHOLD,
					ignoreSameFile: true,
					minLines: 3
				},
				flags: {
					enabled: true,
					trackRetirement: true
				},
				coverage: { enabled: true },
				security: { enabled: true },
				viz: {
					enabled: true,
					outputPath: "scratch/fallow_map.html"
				}
			},
			criticalConfig: {},
			icon: "🌾",
			ruleDescriptions: {
				"fallow-config-missing": "Missing .fallowrc.json file",
				"fallow-config-syntax": "Invalid JSON in .fallowrc.json",
				"fallow-banned-entry-glob": "Banned glob in entry",
				"fallow-stale-file": "Non-existent file in config",
				"fallow-stale-export": "Non-existent export in config",
				"fallow-empty-export-list": "Empty entry in ignoreExports",
				"fallow-duplicate-entry": "Duplicate entry or export",
				"fallow-config-workspace-diagnostic": "Workspace diagnostic",
				"fallow-undeclared-config-entry": "Undeclared entry in config",
				"fallow-config-doctor": "Health and cache integrity"
			},
			ruleRemediations: {
				"fallow-config-missing": "📖 REMEDIATION GUIDE: fallow-config-missing\n1. Root Cause: The .fallowrc.json configuration file does not exist in the project root. Fallow requires this file to map canonical entry points and exceptions.\n2. Diagnosis: Check if the .fallowrc.json file exists in the repository root directory.\n3. Canonical Solution: Run npm run auditor:fix or auditor fix to generate the default configuration automatically.\n4. Example / Auto-fix command:\n   npm run auditor:fix",
				"fallow-config-syntax": "📖 REMEDIATION GUIDE: fallow-config-syntax\n1. Root Cause: The .fallowrc.json file contains a JSON syntax error (trailing commas, unclosed quotes, or invalid tokens).\n2. Diagnosis: Inspect the JSON parser error message to locate the defective line.\n3. Canonical Solution: Open .fallowrc.json and correct the syntax error using a JSON linter or code formatter.\n4. Example / Auto-fix command:\n   Format .fallowrc.json with a valid JSON schema.",
				"fallow-banned-entry-glob": "📖 REMEDIATION GUIDE: fallow-banned-entry-glob\n1. Root Cause: A banned entry pattern was declared in .fallowrc.json (such as wildcard components or views). This masks dead components.\n2. Diagnosis: Inspect the entry array in .fallowrc.json for broad component globs.\n3. Canonical Solution: Run npm run auditor:fix to purge banned globs and retain only genuine root entry points (e.g. src/main.ts, src/index.ts).\n4. Example / Auto-fix command:\n   npm run auditor:fix",
				"fallow-stale-file": "📖 REMEDIATION GUIDE: fallow-stale-file\n1. Root Cause: An entry in ignoreExports references a file that has been deleted, moved, or renamed on disk.\n2. Diagnosis: The warning message specifies the file path that is missing from the filesystem.\n3. Canonical Solution: Run npm run auditor:fix or auditor fix to automatically remove obsolete entries from .fallowrc.json.\n4. Example / Auto-fix command:\n   npm run auditor:fix",
				"fallow-stale-export": "📖 REMEDIATION GUIDE: fallow-stale-export\n1. Root Cause: A symbol declared in the exports array of an ignoreExports entry is no longer exported in the source file.\n2. Diagnosis: Check the source file to verify that the symbol was renamed or deleted.\n3. Canonical Solution: Run npm run auditor:fix to synchronize and purge obsolete symbol names.\n4. Example / Auto-fix command:\n   npm run auditor:fix",
				"fallow-empty-export-list": "📖 REMEDIATION GUIDE: fallow-empty-export-list\n1. Root Cause: A file entry in ignoreExports has an empty exports array (exports: []).\n2. Diagnosis: Review entries in .fallowrc.json where no symbols are declared.\n3. Canonical Solution: Run npm run auditor:fix to remove the redundant entry.\n4. Example / Auto-fix command:\n   npm run auditor:fix",
				"fallow-duplicate-entry": "📖 REMEDIATION GUIDE: fallow-duplicate-entry\n1. Root Cause: The same file or symbol is repeated more than once within .fallowrc.json.\n2. Diagnosis: The message indicates the duplicate entry.\n3. Canonical Solution: Run npm run auditor:fix to deduplicate entries and symbols automatically.\n4. Example / Auto-fix command:\n   npm run auditor:fix",
				"fallow-config-workspace-diagnostic": "📖 REMEDIATION GUIDE: fallow-config-workspace-diagnostic\n1. Root Cause: The Fallow engine emitted a workspace-level diagnostic, redundant config entry warning, or boundary configuration warning.\n2. Diagnosis: Inspect the diagnostic message emitted by the Fallow engine in the report.\n3. Canonical Solution: Run npm run auditor:fix to automatically prune redundant config entries (entry-pattern-redundant, ignore-dependencies-entry-redundant, ignore-patterns-entry-redundant), or adjust package/boundary settings in .fallowrc.json.\n4. Example / Auto-fix command:\n   npm run auditor:fix",
				"fallow-undeclared-config-entry": "📖 REMEDIATION GUIDE: fallow-undeclared-config-entry\n1. Root Cause: .fallowrc.json declares ignorePatterns or ignoreDependencies that are not authorized in .auditor/audit.config.ts (SSoT violation).\n2. Diagnosis: Inspect the diagnostic message to identify the undeclared pattern or dependency.\n3. Canonical Solution: If the exemption is genuine, declare it in .auditor/audit.config.ts (under fallow.ignoreGlobs, paths.ignoreGlobs, or fallow.ignoreDependencies). Otherwise, remove it from .fallowrc.json.\n4. Example / Auto-fix command:\n   Declare in .auditor/audit.config.ts: fallow: { ignoreGlobs: ['path/**'] }",
				"fallow-config-doctor": "📖 REMEDIATION GUIDE: fallow-config-doctor\n1. Root Cause: Fallow doctor preflight check detected health, cache, or configuration issues.\n2. Diagnosis: Run npm run auditor:fallow:doctor to view detailed diagnostic output.\n3. Canonical Solution: Follow the recommended remediation commands emitted by fallow doctor (e.g. \"fallow dead-code --quiet\" to refresh cache).\n4. Example / Auto-fix command:\n   npm run auditor:fallow:doctor"
			},
			coverage: { include: [".fallowrc.json"] },
			projectRoot
		});
	}
	async runAudit() {
		ensureMandatoryDirectoriesExist(this.projectRoot);
		const requirement = this.configFiles[0] ?? FALLOW_CONFIG_REQUIREMENT;
		const ensured = await this.runSubAuditor("fallow-config-missing", async () => {
			return await this.ensureConfigFile(requirement);
		});
		if (!ensured) return;
		const resolvedPath = ensured.resolvedPath;
		const config = this.runSubAuditorSync("fallow-config-syntax", () => {
			return loadFallowConfig(resolvedPath, this);
		});
		if (!config) return;
		const validConfig = config;
		this.recordScanned(".fallowrc.json");
		let modified = false;
		this.runSubAuditorSync("fallow-banned-entry-glob", () => {
			const bannedGlobs = getBannedEntryGlobs(this.projectRoot);
			if (validateFallowEntries(validConfig, bannedGlobs, this)) modified = true;
		});
		this.runSubAuditorSync("fallow-undeclared-config-entry", () => {
			if (validateUndeclaredFallowEntries(validConfig, this)) modified = true;
		});
		if (!Array.isArray(validConfig.ignoreExports) || validConfig.ignoreExports.length === 0) {
			this.markRuleNotApplicable("fallow-duplicate-entry", "No ignoreExports in .fallowrc.json");
			this.markRuleNotApplicable("fallow-empty-export-list", "No ignoreExports in .fallowrc.json");
			this.markRuleNotApplicable("fallow-stale-file", "No ignoreExports in .fallowrc.json");
			this.markRuleNotApplicable("fallow-stale-export", "No ignoreExports in .fallowrc.json");
		} else {
			const { fileCount, exportCount, modified: ignoreModified } = validateFallowIgnoreExports(validConfig, this.projectRoot, this);
			if (ignoreModified) modified = true;
			this.context.setMetric("Files in ignoreExports", fileCount);
			this.context.setMetric("Validated Exports", exportCount);
		}
		if (modified && this.isFixActive()) fs.writeFileSync(resolvedPath, JSON.stringify(validConfig, null, 2) + "\n", "utf-8");
		this.runSubAuditorSync("fallow-config-workspace-diagnostic", () => {
			tryCatchSync(() => {
				const subcmdArgs = fs.existsSync(path.join(this.projectRoot, "package.json")) ? ["dead-code", "--no-type-aware"] : [
					"list",
					"--workspaces",
					"--no-type-aware"
				];
				const result = executeFallowJsonCommand(this.projectRoot, subcmdArgs);
				if (result.data?.workspace_diagnostics) {
					if (validateFallowWorkspaceDiagnostics(result.data.workspace_diagnostics, this, validConfig) && this.isFixActive()) fs.writeFileSync(resolvedPath, JSON.stringify(validConfig, null, 2) + "\n", "utf-8");
				}
			});
		});
		this.runSubAuditorSync("fallow-config-doctor", () => {
			if (!this.isRuleActiveForCurrentRun("fallow-config-doctor")) {
				this.markRuleNotApplicable("fallow-config-doctor", "Requires full speed mode");
				return;
			}
			tryCatchSync(() => {
				const result = executeFallowJsonCommand(this.projectRoot, ["doctor"]);
				if (result.skipped === "env") {
					this.markRuleNotApplicable("fallow-config-doctor", "Fallow binary verification skipped");
					return;
				}
				if (result.skipped === "binary_not_found") {
					this.markRuleNotApplicable("fallow-config-doctor", "Fallow binary not found");
					return;
				}
				if (result.data?.status) validateFallowDoctorResults(result.data, this);
			});
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateFallowConfigAuditor());
export { BANNED_ENTRY_GLOBS, FALLOW_CONFIG_REQUIREMENT, FALLOW_CONFIG_RULES, FALLOW_CYCLOMATIC_POLICIES, FALLOW_REDUNDANT_CONFIG_DIAGNOSTIC_KINDS, ValidateFallowConfigAuditor, createDefaultFallowConfigContent, escapeRegExp, formatDoctorRemediation, getBannedEntryGlobs, isSymbolExportedInContent, projectFallowConfigFromAuditConfig, validateFallowDoctorResults, validateFallowWorkspaceDiagnostics, validateUndeclaredFallowEntries };
