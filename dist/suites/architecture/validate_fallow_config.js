import { CANONICAL_RULE_SEVERITY_LEVELS } from "../../core/auditConfigTypes.js";
import { safeJsonParse, tryCatchSync } from "../../core/safeUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isPathContained, toPosixRelative } from "../../core/safePath.js";
import "../../core/auditConfig.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
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
	"fallow-config-workspace-diagnostic"
];
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
		typeAware: true,
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
function validateFallowWorkspaceDiagnostics(diagnostics, auditor, config) {
	if (!Array.isArray(diagnostics)) return false;
	let modified = false;
	for (const d of diagnostics) {
		if (d.kind === "boundaries-not-configured" || d.kind === "rule-packs-not-configured") continue;
		const isRedundantConfigEntry = Boolean(d.kind && REDUNDANT_CONFIG_DIAGNOSTIC_SET.has(d.kind));
		if (isRedundantConfigEntry && auditor.isFixActive() && pruneRedundantFallowConfigDiagnostic(d, config)) {
			modified = true;
			continue;
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
const FALLOW_CONFIG_REQUIREMENT = {
	id: "fallow-config",
	file: ".fallowrc.json",
	description: "Fallow configuration and exports control",
	ruleId: "fallow-config-missing",
	generateDefaultContent: () => createDefaultFallowConfigContent()
};
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
			ruleFixers: {},
			usesThirdPartyTool: true,
			requiredPermissions: ["--allow-child-process"],
			thirdPartyToolPolicy: {
				toolName: "Fallow",
				fallbackBehavior: "violation",
				fallbackRuleId: "fallow-config-workspace-diagnostic"
			},
			ruleCapabilities: createRuleCapabilities(FALLOW_CONFIG_RULES, {
				speed: "light",
				phase: "setup",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
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
			defaultConfig: { enabled: true },
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
				"fallow-config-workspace-diagnostic": "Workspace diagnostic"
			},
			ruleRemediations: {
				"fallow-config-missing": "📖 REMEDIATION GUIDE: fallow-config-missing\n1. Root Cause: The .fallowrc.json configuration file does not exist in the project root. Fallow requires this file to map canonical entry points and exceptions.\n2. Diagnosis: Check if the .fallowrc.json file exists in the repository root directory.\n3. Canonical Solution: Run npm run auditor:fix or auditor fix to generate the default configuration automatically.\n4. Example / Auto-fix command:\n   npm run auditor:fix",
				"fallow-config-syntax": "📖 REMEDIATION GUIDE: fallow-config-syntax\n1. Root Cause: The .fallowrc.json file contains a JSON syntax error (trailing commas, unclosed quotes, or invalid tokens).\n2. Diagnosis: Inspect the JSON parser error message to locate the defective line.\n3. Canonical Solution: Open .fallowrc.json and correct the syntax error using a JSON linter or code formatter.\n4. Example / Auto-fix command:\n   Format .fallowrc.json with a valid JSON schema.",
				"fallow-banned-entry-glob": "📖 REMEDIATION GUIDE: fallow-banned-entry-glob\n1. Root Cause: A banned entry pattern was declared in .fallowrc.json (such as wildcard components or views). This masks dead components.\n2. Diagnosis: Inspect the entry array in .fallowrc.json for broad component globs.\n3. Canonical Solution: Run npm run auditor:fix to purge banned globs and retain only genuine root entry points (e.g. src/main.ts, src/index.ts).\n4. Example / Auto-fix command:\n   npm run auditor:fix",
				"fallow-stale-file": "📖 REMEDIATION GUIDE: fallow-stale-file\n1. Root Cause: An entry in ignoreExports references a file that has been deleted, moved, or renamed on disk.\n2. Diagnosis: The warning message specifies the file path that is missing from the filesystem.\n3. Canonical Solution: Run npm run auditor:fix or auditor fix to automatically remove obsolete entries from .fallowrc.json.\n4. Example / Auto-fix command:\n   npm run auditor:fix",
				"fallow-stale-export": "📖 REMEDIATION GUIDE: fallow-stale-export\n1. Root Cause: A symbol declared in the exports array of an ignoreExports entry is no longer exported in the source file.\n2. Diagnosis: Check the source file to verify that the symbol was renamed or deleted.\n3. Canonical Solution: Run npm run auditor:fix to synchronize and purge obsolete symbol names.\n4. Example / Auto-fix command:\n   npm run auditor:fix",
				"fallow-empty-export-list": "📖 REMEDIATION GUIDE: fallow-empty-export-list\n1. Root Cause: A file entry in ignoreExports has an empty exports array (exports: []).\n2. Diagnosis: Review entries in .fallowrc.json where no symbols are declared.\n3. Canonical Solution: Run npm run auditor:fix to remove the redundant entry.\n4. Example / Auto-fix command:\n   npm run auditor:fix",
				"fallow-duplicate-entry": "📖 REMEDIATION GUIDE: fallow-duplicate-entry\n1. Root Cause: The same file or symbol is repeated more than once within .fallowrc.json.\n2. Diagnosis: The message indicates the duplicate entry.\n3. Canonical Solution: Run npm run auditor:fix to deduplicate entries and symbols automatically.\n4. Example / Auto-fix command:\n   npm run auditor:fix",
				"fallow-config-workspace-diagnostic": "📖 REMEDIATION GUIDE: fallow-config-workspace-diagnostic\n1. Root Cause: The Fallow engine emitted a workspace-level diagnostic, redundant config entry warning, or boundary configuration warning.\n2. Diagnosis: Inspect the diagnostic message emitted by the Fallow engine in the report.\n3. Canonical Solution: Run npm run auditor:fix to automatically prune redundant config entries (entry-pattern-redundant, ignore-dependencies-entry-redundant, ignore-patterns-entry-redundant), or adjust package/boundary settings in .fallowrc.json.\n4. Example / Auto-fix command:\n   npm run auditor:fix"
			},
			coverage: { include: [".fallowrc.json"] },
			projectRoot
		});
	}
	async runAudit() {
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
		if (!Array.isArray(validConfig.ignoreExports) || validConfig.ignoreExports.length === 0) {
			this.markRuleNotApplicable("fallow-duplicate-entry", "Sin ignoreExports en .fallowrc.json");
			this.markRuleNotApplicable("fallow-empty-export-list", "Sin ignoreExports en .fallowrc.json");
			this.markRuleNotApplicable("fallow-stale-file", "Sin ignoreExports en .fallowrc.json");
			this.markRuleNotApplicable("fallow-stale-export", "Sin ignoreExports en .fallowrc.json");
		} else {
			const { fileCount, exportCount, modified: ignoreModified } = validateFallowIgnoreExports(validConfig, this.projectRoot, this);
			if (ignoreModified) modified = true;
			this.context.setMetric("Archivos en ignoreExports", fileCount);
			this.context.setMetric("Exports Validados", exportCount);
		}
		if (modified && this.isFixActive()) fs.writeFileSync(resolvedPath, JSON.stringify(validConfig, null, 2) + "\n", "utf-8");
		this.runSubAuditorSync("fallow-config-workspace-diagnostic", () => {
			tryCatchSync(() => {
				const fallowBin = [path.resolve(this.projectRoot, "node_modules/fallow/bin/fallow"), path.resolve(process.cwd(), "node_modules/fallow/bin/fallow")].find((c) => fs.existsSync(c));
				if (fallowBin) {
					const subcmd = fs.existsSync(path.join(this.projectRoot, "package.json")) ? "dead-code" : "list --workspaces";
					const stdout = execSync(`node "${fallowBin}" ${subcmd} --format json --root "${this.projectRoot}"`, {
						encoding: "utf8",
						stdio: [
							"pipe",
							"pipe",
							"ignore"
						],
						timeout: 1e4
					});
					const parsed = safeJsonParse(stdout);
					if (parsed?.workspace_diagnostics) {
						if (validateFallowWorkspaceDiagnostics(parsed.workspace_diagnostics, this, validConfig) && this.isFixActive()) fs.writeFileSync(resolvedPath, JSON.stringify(validConfig, null, 2) + "\n", "utf-8");
					}
				}
			});
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateFallowConfigAuditor());
export { BANNED_ENTRY_GLOBS, FALLOW_CONFIG_REQUIREMENT, FALLOW_CONFIG_RULES, FALLOW_CYCLOMATIC_POLICIES, FALLOW_REDUNDANT_CONFIG_DIAGNOSTIC_KINDS, ValidateFallowConfigAuditor, createDefaultFallowConfigContent, escapeRegExp, getBannedEntryGlobs, isSymbolExportedInContent, validateFallowWorkspaceDiagnostics };
