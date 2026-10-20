import { getAuditConfig, loadAuditConfig } from "./auditConfigLoader.js";
import { isPathExempt } from "./reportUtils.js";
import { isTestFileForCodeAudit } from "./auditTestPredicates.js";
import "./auditConfig.js";
import { REMEDIATION_PHASE_IDS, isRemediationPhaseId } from "./remediationPhases.js";
import { AUDIT_EXECUTION_PHASES, AUDIT_EXECUTION_SPEEDS, AUDIT_FIX_CAPABILITIES, SPEED_RANK, computeResultsFixableViolations, countFixableFindings, deriveCanonicalAuditorScript, normalizeSpeeds, resolveEffectiveSpeed } from "./auditContract.js";
import "./permissionGuard.js";
import { GitIgnoreRegistry } from "./gitIgnoreRegistry.js";
import { ConfigFileRegistry } from "./configFileRegistry.js";
import { PackageScriptRegistry } from "./packageScriptRegistry.js";
import { CoverageRecorder, deriveCoverageFromRequiredFiles, deriveCoverageFromRoots, isDeclaredByCoverage, resolveActiveCoverageRunId, toPosixRelative, validateCoverageDeclaration, writeCoverageLedger } from "./auditCoverage.js";
import { formatDurationMs } from "./durationFormatter.js";
import { SKILLS_LOCK_CANDIDATE_PATHS, clearLockedSkillsCache, isLockedSkillPath, loadLockedSkills } from "./lockedSkills.js";
import { renderFindingsDetail } from "./fileTreeRenderer.js";
import { renderAuditTaskRow, renderBanner, renderSimilarCodeWarningBanner } from "./unifiedTheme.js";
import { isMainModule } from "../cli/cliUtils.js";
import { evaluateSuiteStatus } from "./suiteGating.js";
import { AuditedDocument } from "./auditedDocument.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import fs$1 from "node:fs/promises";
import { parseArgs, styleText } from "node:util";
import ts from "typescript";
//#region src/core/auditorBase.ts
/**
* scripts/lib/auditorBase.ts
*
* BASE AUDITOR FRAMEWORK (Node.js 26+ Native)
* Mandatory base orchestrator for all sub-auditors in scripts/auditors/.
* Enforces the StandardAuditResult contract:
*   1. Always outputs the clean Box-Drawing summary table to console.
*   2. Always writes 100% complete structured JSON to scratch/audits/<family>/<id>.json.
*/
enableCompileCache();
/** Directories that must ALWAYS be ignored across all tools, runners, and auditors (compilation, VCS, scratch, test artifacts) */
const ALWAYS_IGNORE_DIRS = /* @__PURE__ */ new Set([
	"node_modules",
	".git",
	".tsbuildinfo",
	".vitest-cache",
	".fallow",
	".vscode",
	".github",
	".gemini",
	"dist",
	"dev-dist",
	"build",
	"coverage",
	"results",
	"test-results",
	"scratch",
	"tmp",
	"volumes"
]);
/** Additional directories ignored during code scanning (documentation/skills and static assets) */
const CODE_ONLY_IGNORE_DIRS = /* @__PURE__ */ new Set([
	".agents",
	"skills",
	"public",
	"packages",
	"docs"
]);
/** Canonical ignore directories for application code auditors (union of ALWAYS + CODE_ONLY) */
const CANONICAL_IGNORE_DIRS = /* @__PURE__ */ new Set([...ALWAYS_IGNORE_DIRS, ...CODE_ONLY_IGNORE_DIRS]);
/** Returns the effective set of ignore directories combining canonical defaults with audit.config.ts paths.ignoredDirs */
function getEffectiveIgnoreDirs(projectRoot = process.cwd()) {
	const custom = getAuditConfig(projectRoot).paths?.ignoredDirs ?? [];
	return /* @__PURE__ */ new Set([...CANONICAL_IGNORE_DIRS, ...custom]);
}
/** Returns the effective set of unignore directories combining audit.config.ts paths.unignoreDirs, documentation.unignoreDirs, and derived skillsRoots */
function getEffectiveUnignoreDirs(projectRoot = process.cwd()) {
	const config = getAuditConfig(projectRoot);
	const customPaths = config.paths?.unignoreDirs;
	if (customPaths && customPaths.length > 0) return customPaths;
	const customDocs = config.documentation?.unignoreDirs;
	if (customDocs && customDocs.length > 0) return customDocs;
	const derived = /* @__PURE__ */ new Set();
	if (config.documentation?.skillsRoots && config.documentation.skillsRoots.length > 0) for (const r of config.documentation.skillsRoots) {
		const topSegment = toPosixRelative(process.cwd(), r).split("/")[0];
		if (topSegment) derived.add(topSegment);
	}
	if (derived.size > 0) return Array.from(derived);
	return [
		".agents",
		"skills",
		"docs"
	];
}
const SCANNABLE_EXTENSIONS = /* @__PURE__ */ new Set([
	".ts",
	".js",
	".vue",
	".cjs",
	".mjs"
]);
const CANONICAL_SCANNABLE_ROOTS = [
	"scripts",
	"src",
	"tests"
];
function resolvePersistenceExtraRoots(config) {
	if (config.persistence?.engine === "none") return [];
	const extra = [];
	if (config.persistence?.supabaseDir) extra.push(config.persistence.supabaseDir);
	if (config.paths?.migrationsDir) extra.push(config.paths.migrationsDir);
	return extra;
}
function resolveDeclaredPathRoots(paths) {
	if (!paths) return [
		"src",
		"scripts",
		"tests"
	];
	return [
		...paths.codeRoots ?? ["src", "scripts"],
		...paths.testRoots ?? ["tests"],
		...paths.integrationRoots ?? [],
		...paths.e2eRoots ?? [],
		...paths.demoRoots ?? [],
		...paths.dataRoots ?? [],
		...paths.cliRoots ?? []
	];
}
function getEffectiveScannableRoots(config = getAuditConfig()) {
	return Array.from(/* @__PURE__ */ new Set([...resolveDeclaredPathRoots(config.paths), ...resolvePersistenceExtraRoots(config)]));
}
/**
* Validates that a path component is safe against path traversal.
*/
function assertSafePathComponent(component) {
	if (component.includes("..")) throw new Error(`Path traversal attempt detected in path component: ${component}`);
}
/**
* Resolves the subsystem configuration section from AuditEngineConfig
* given a declared configKey (supporting direct keys like 'paths', 'constants',
* or dotted keys like 'htmlValidate.enabled', 'styles.zLayersEnabled', 'fallow.similarCode.enabled').
*/
function resolveSubsystemConfig(config, configKey) {
	if (!configKey || configKey === "core" || configKey === "none") return;
	if (configKey === "paths") return config.paths;
	const direct = Reflect.get(config, configKey);
	if (direct && typeof direct === "object") return direct;
	const parts = configKey.split(".");
	const topSection = Reflect.get(config, parts[0]);
	if (topSection && typeof topSection === "object") {
		if (parts.length > 2) {
			let current = topSection;
			for (let i = 1; i < parts.length - 1; i++) if (current && typeof current === "object" && parts[i] in current) current = Reflect.get(current, parts[i]);
			else break;
			if (current && typeof current === "object" && ("ignoreGlobs" in current || "exemptPaths" in current || "enabled" in current)) return current;
		}
		return topSection;
	}
}
function matchesDirectorySegments(normalized, segments, unignoreSet, configIgnoredDirs) {
	let hasUnignoredAncestor = false;
	const hasConfigIgnored = configIgnoredDirs.length > 0;
	for (const seg of segments) {
		if (unignoreSet.has(seg)) {
			hasUnignoredAncestor = true;
			continue;
		}
		if (ALWAYS_IGNORE_DIRS.has(seg)) return true;
		if (!hasUnignoredAncestor) {
			if (CODE_ONLY_IGNORE_DIRS.has(seg) || hasConfigIgnored && configIgnoredDirs.some((d) => d === seg || normalized === d || normalized.startsWith(d + "/") || normalized.includes("/" + d + "/"))) return true;
		}
	}
	return false;
}
function matchesSinglePattern(normalized, pattern) {
	const normPattern = pattern.split(path.sep).join(path.posix.sep).toLowerCase();
	if (path.posix.matchesGlob(normalized, normPattern)) return true;
	let cleanPattern = normPattern;
	const matchesAnywhere = cleanPattern.startsWith("**/");
	if (matchesAnywhere) {
		cleanPattern = cleanPattern.slice(3);
		if (path.posix.matchesGlob(normalized, `**/${cleanPattern}`)) return true;
	}
	cleanPattern = cleanPattern.replace(/\/\*\*$/, "").replace(/\/\*$/, "");
	if (!cleanPattern) return false;
	if (matchesAnywhere) return normalized === cleanPattern || normalized.startsWith(cleanPattern + "/") || normalized.endsWith("/" + cleanPattern) || normalized.includes("/" + cleanPattern + "/");
	return normalized === cleanPattern || normalized.startsWith(cleanPattern + "/");
}
/**
* Determines whether a relative POSIX path belongs to an ignored directory or matches directory ignore patterns.
*/
function isPathIgnored(relPath, extraIgnorePatterns = [], unignoreDirs = [], projectRoot = process.cwd()) {
	if (isLockedSkillPath(relPath, projectRoot)) return true;
	const normalized = (path.isAbsolute(relPath) ? path.relative(projectRoot, relPath) : relPath).split(path.sep).join(path.posix.sep).toLowerCase();
	const segments = normalized.split("/");
	const unignoreSet = unignoreDirs instanceof Set ? unignoreDirs : new Set(unignoreDirs);
	if (matchesDirectorySegments(normalized, segments, unignoreSet, (getAuditConfig(projectRoot)?.paths?.ignoredDirs ?? []).map((d) => toPosixRelative(projectRoot, d).toLowerCase()))) return true;
	const configPatterns = getAuditConfig(projectRoot)?.paths?.ignoredPatterns ?? [];
	const configGlobs = getAuditConfig(projectRoot)?.paths?.ignoreGlobs ?? [];
	const allPatterns = [
		...extraIgnorePatterns,
		...configPatterns,
		...configGlobs
	];
	for (const pattern of allPatterns) if (matchesSinglePattern(normalized, pattern)) {
		if (segments.some((seg) => unignoreSet.has(seg))) continue;
		return true;
	}
	return false;
}
function collectSingleFile(filePath, projectRoot, extraIgnorePatterns, allowedExtensions, unignoreDirs) {
	if (!isPathIgnored(path.relative(projectRoot, filePath).split(path.sep).join(path.posix.sep), extraIgnorePatterns, unignoreDirs, projectRoot)) {
		const ext = path.extname(filePath).toLowerCase();
		if (allowedExtensions.size === 0 || allowedExtensions.has(ext)) return [filePath];
	}
	return [];
}
function processDirentEntry(entry, dir, projectRoot, extraIgnorePatterns, allowedExtensions, unignoreDirs) {
	const fullPath = path.resolve(dir, entry.name);
	if (isPathIgnored(path.relative(projectRoot, fullPath).split(path.sep).join(path.posix.sep), extraIgnorePatterns, unignoreDirs, projectRoot)) return [];
	if (entry.isDirectory()) return collectRepositoryFiles(fullPath, projectRoot, extraIgnorePatterns, allowedExtensions, unignoreDirs);
	if (entry.isFile()) {
		const ext = path.extname(entry.name).toLowerCase();
		if (allowedExtensions.size === 0 || allowedExtensions.has(ext)) return [fullPath];
	}
	return [];
}
/**
* Recursively collects scannable files from a directory, applying ignore filters.
*/
function collectRepositoryFiles(dir, projectRoot = process.cwd(), extraIgnorePatterns = [], allowedExtensions = SCANNABLE_EXTENSIONS, unignoreDirs = []) {
	if (!fs.existsSync(dir)) return [];
	if (fs.statSync(dir).isFile()) return collectSingleFile(dir, projectRoot, extraIgnorePatterns, allowedExtensions, unignoreDirs);
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	const results = [];
	for (const entry of entries) results.push(...processDirentEntry(entry, dir, projectRoot, extraIgnorePatterns, allowedExtensions, unignoreDirs));
	return results;
}
async function persistAuditJsonReport(result, config, outputOption) {
	const scratchFamilyDir = path.resolve(process.cwd(), "scratch/audits", config.family);
	const targetJsonPath = path.join(scratchFamilyDir, `${config.id}.json`);
	const latestJsonPath = path.resolve(process.cwd(), "scratch/audits", `latest_${config.id}.json`);
	try {
		await fs$1.mkdir(scratchFamilyDir, { recursive: true });
		const jsonString = JSON.stringify(result, null, 2);
		await fs$1.writeFile(targetJsonPath, jsonString, "utf-8");
		await fs$1.writeFile(latestJsonPath, jsonString, "utf-8");
		if (typeof outputOption === "string" && outputOption) {
			const relOut = path.relative(process.cwd(), path.resolve(process.cwd(), outputOption));
			if (!relOut.startsWith("..") && !path.isAbsolute(relOut)) {
				const outPath = path.resolve(process.cwd(), outputOption);
				await fs$1.writeFile(outPath, jsonString, "utf-8");
			}
		}
	} catch {}
	return targetJsonPath;
}
function renderConsoleSummary(result, config, targetJsonPath) {
	console.log(renderBanner(config.name, `Familia: ${config.family.toUpperCase()}  |  ID: ${config.id}`));
	console.log(renderAuditTaskRow(result));
	if (result.findings.length > 0) console.log(renderFindingsDetail(result.findings));
	if (result.findings.some((f) => f.ruleId === "fallow-similar-code-failed" && (f.context === "manual-setup-required" || f.context === "model-not-ready"))) console.log("\n" + renderSimilarCodeWarningBanner() + "\n");
	if (result.status === "skipped") {
		const reason = result.metrics?.["Skip-Reason"] || "Omitido";
		console.log(styleText("cyan", `\n⏭️ Auditoría omitida: ${reason}\n`));
		return;
	}
	const relPath = path.relative(process.cwd(), targetJsonPath);
	console.log(`\n${result.status === "passed" ? styleText("green", "✨ Auditoría completada con éxito.") : styleText("red", "🚨 Auditoría finalizada con errores.")}`);
	console.log(styleText("dim", `💾 Reporte detallado guardado en: ${relPath}\n`));
}
function normalizeAuditorFilePath(file, projectRoot) {
	if (!file) return file;
	const normFile = toPosixRelative(projectRoot, file);
	if (isLockedSkillPath(normFile, projectRoot)) return null;
	return normFile;
}
const globalWorkspaceFileRamCache = /* @__PURE__ */ new Map();
/**
* Clears the in-memory RAM cache for workspace discovered files.
*/
function clearWorkspaceFileCache() {
	globalWorkspaceFileRamCache.clear();
}
function setupAuditor(config) {
	const fileRamCache = /* @__PURE__ */ new Map();
	const startTime = performance.now();
	const normalized = process.argv.slice(2).map((a) => a.includes("=") && !a.startsWith("-") ? `--${a}` : ["errors-only"].includes(a) ? `--${a}` : a);
	const { values } = parseArgs({
		args: normalized,
		options: {
			output: {
				type: "string",
				short: "o"
			},
			"errors-only": { type: "boolean" },
			speed: { type: "string" },
			"only-speed": { type: "string" }
		},
		strict: false
	});
	const projectRoot = config.projectRoot || process.cwd();
	const combinedIgnores = [...config.extraIgnorePatterns || []];
	const unignoreDirs = config.unignoreDirs ?? (config.family === "documentation" ? getEffectiveUnignoreDirs(projectRoot) : []);
	const isSubprocess = process.env.AUDIT_SUBPROCESS === "true";
	const findings = [];
	const metrics = {};
	let customLogProgress;
	let customLogStep;
	return {
		values,
		ignorePatterns: combinedIgnores,
		unignoreDirs,
		isPathIgnored: (relPath) => isPathIgnored(relPath, combinedIgnores, unignoreDirs, projectRoot),
		collectFiles: (roots = getEffectiveScannableRoots(), allowedExtensions = SCANNABLE_EXTENSIONS) => {
			const cacheKey = [
				projectRoot,
				[...roots].sort().join("|"),
				Array.from(allowedExtensions).sort().join("|"),
				combinedIgnores.join("|"),
				[...unignoreDirs].sort().join("|")
			].join(":::");
			const cached = fileRamCache.get(cacheKey) ?? globalWorkspaceFileRamCache.get(cacheKey);
			if (cached) {
				config.onFilesCollected?.(cached);
				return cached;
			}
			const seen = /* @__PURE__ */ new Set();
			const all = [];
			for (const root of roots) {
				const fullRoot = path.resolve(projectRoot, root);
				for (const file of collectRepositoryFiles(fullRoot, projectRoot, combinedIgnores, allowedExtensions, unignoreDirs)) if (!seen.has(file)) {
					seen.add(file);
					all.push(file);
				}
			}
			fileRamCache.set(cacheKey, all);
			config.onFilesCollected?.(all);
			return all;
		},
		logProgress: (msg) => {
			if (customLogProgress) customLogProgress(msg);
			else console.log(msg);
		},
		logStep: (stepNumber, totalSteps, description) => {
			if (customLogStep) customLogStep(stepNumber, totalSteps, description);
			else console.log(`🔍 [${stepNumber}/${totalSteps}] ${description}`);
		},
		setStepLogger: (logger) => {
			customLogStep = logger;
		},
		setProgressLogger: (logger) => {
			customLogProgress = logger;
		},
		addFinding: (f) => {
			const normFile = normalizeAuditorFilePath(f.file, projectRoot);
			if (normFile === null) return;
			findings.push({
				...f,
				file: normFile
			});
		},
		addError: (message, file, line, context, ruleId, ruleDescription, suiteId, suiteName) => {
			const normFile = normalizeAuditorFilePath(file, projectRoot);
			if (normFile === null) return;
			findings.push({
				severity: "error",
				message,
				file: normFile,
				line,
				context,
				ruleId,
				ruleDescription,
				suiteId,
				suiteName
			});
		},
		addWarning: (message, file, line, context, ruleId, ruleDescription, suiteId, suiteName) => {
			if (!values["errors-only"]) {
				const normFile = normalizeAuditorFilePath(file, projectRoot);
				if (normFile === null) return;
				findings.push({
					severity: "warning",
					message,
					file: normFile,
					line,
					context,
					ruleId,
					ruleDescription,
					suiteId,
					suiteName
				});
			}
		},
		setMetric: (key, value) => {
			metrics[key] = value;
		},
		getAst: (relPath, content) => {
			const fullPath = path.isAbsolute(relPath) ? relPath : path.resolve(projectRoot, relPath);
			const raw = content !== void 0 ? content : fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf-8") : "";
			const sf = new AuditedDocument(fullPath, raw, relPath).getAst();
			if (sf) return sf;
			return ts.createSourceFile(path.basename(fullPath), raw, ts.ScriptTarget.Latest, true);
		},
		checkFiles: async () => {
			if (!config.requiredFiles || config.requiredFiles.length === 0) return;
			try {
				for (const file of config.requiredFiles) await fs$1.access(file);
			} catch (_err) {
				console.error(styleText("red", `❌ Archivos requeridos no encontrados o no accesibles:\n${config.requiredFiles.map((f) => `   - ${f}`).join("\n")}`));
				if (isSubprocess) throw new Error(`Archivos requeridos no encontrados: ${config.requiredFiles.join(", ")}`, { cause: _err });
				process.exit(1);
			}
		},
		finish: async (finalMetrics, extra) => {
			if (finalMetrics) Object.assign(metrics, finalMetrics);
			const durationMs = Math.round(performance.now() - startTime);
			const errorsCount = findings.filter((f) => f.severity === "error").length;
			const warningsCount = findings.filter((f) => f.severity === "warning").length;
			const infoCount = findings.filter((f) => f.severity === "info").length;
			const { fixableErrors, fixableWarnings } = countFixableFindings(findings);
			const result = {
				id: config.id,
				name: config.name,
				description: config.description,
				family: config.family,
				status: errorsCount === 0 ? "passed" : "failed",
				durationMs,
				metrics,
				findings,
				summary: {
					errors: errorsCount,
					warnings: warningsCount,
					info: infoCount,
					fixableErrors,
					fixableWarnings
				},
				...extra
			};
			const targetJsonPath = await persistAuditJsonReport(result, config, values.output);
			if (!isSubprocess) {
				renderConsoleSummary(result, config, targetJsonPath);
				if (errorsCount > 0) process.exit(1);
			}
			return result;
		},
		getFindings: () => [...findings]
	};
}
const DEFAULT_AUDITOR_CAPABILITIES = Object.freeze({
	speed: "light",
	phase: "normal",
	fix: "none",
	md: false,
	ast: false,
	changedOnly: false,
	critical: false
});
const MAX_AUDITOR_DESCRIPTION_LENGTH = 50;
const MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH = 60;
/**
* Derives aggregate suite-level capabilities from the logical union of all its sub-auditor ruleCapabilities.
*/
function deriveSuiteCapabilities(ruleCapabilities) {
	if (!ruleCapabilities || typeof ruleCapabilities !== "object") return { ...DEFAULT_AUDITOR_CAPABILITIES };
	const entries = Object.values(ruleCapabilities);
	if (entries.length === 0) return { ...DEFAULT_AUDITOR_CAPABILITIES };
	const distinctSpeeds = [];
	for (const s of AUDIT_EXECUTION_SPEEDS) if (entries.some((c) => normalizeSpeeds(c.speed).includes(s))) distinctSpeeds.push(s);
	return {
		speed: distinctSpeeds.length === 0 ? "light" : distinctSpeeds.length === 1 ? distinctSpeeds[0] : distinctSpeeds,
		phase: entries.some((c) => c.phase === "post-build") ? "post-build" : entries.some((c) => c.phase === "post-run") ? "post-run" : entries.some((c) => c.phase === "setup") ? "setup" : "normal",
		fix: entries.some((c) => c.fix === "priority") ? "priority" : entries.some((c) => c.fix === "normal") ? "normal" : "none",
		md: entries.some((c) => c.md),
		ast: entries.some((c) => c.ast),
		changedOnly: entries.some((c) => c.changedOnly),
		critical: entries.some((c) => c.critical)
	};
}
/**
* Creates individual rule capabilities for suites, automatically adjusting
* the `fix` capability per rule based on declared fixableRuleIds.
*/
function createRuleCapabilities(ruleIds, baseCapabilities, fixableRuleIds) {
	const isBaseFix = baseCapabilities.fix !== "none";
	const fixType = baseCapabilities.fix === "priority" ? "priority" : "normal";
	const fixableSet = new Set(fixableRuleIds ?? (isBaseFix ? ruleIds : []));
	const result = {};
	for (const id of ruleIds) result[id] = {
		...baseCapabilities,
		fix: fixableSet.has(id) ? fixType : "none"
	};
	return result;
}
/**
* Creates uniform rule capabilities for suites where every declared rule
* shares the same operational capabilities.
*/
function createUniformRuleCapabilities(ruleIds, capabilities) {
	return createRuleCapabilities(ruleIds, capabilities);
}
/**
* Creates uniform strategic remediation phases for suites where every declared rule
* shares the same remediation phase.
*/
function createUniformRemediationPhases(ruleIds, phase) {
	const result = {};
	for (const id of ruleIds) result[id] = phase;
	return result;
}
/**
* Canonical capability template for standard fast/light rules (speed: 'light', phase: 'normal', fix: 'none').
*/
const LIGHT_RULE_CAPABILITIES = Object.freeze({
	...DEFAULT_AUDITOR_CAPABILITIES,
	speed: "light",
	phase: "normal",
	fix: "none"
});
/**
* Canonical capability template for rules requiring TypeScript AST context (speed: 'light', ast: true).
*/
const AST_RULE_CAPABILITIES = Object.freeze({
	...DEFAULT_AUDITOR_CAPABILITIES,
	speed: "light",
	phase: "normal",
	fix: "none",
	ast: true
});
/**
* Resolves effective roots for file scan auditors, dynamically consulting configured srcRoots.
*/
function resolveFileScanRoots(options = {}, defaultRootsResolver) {
	const effectiveRoot = options.projectRoot ?? process.cwd();
	const config = getAuditConfig(effectiveRoot);
	let resolvedDefault;
	if (typeof defaultRootsResolver === "function") resolvedDefault = defaultRootsResolver(config);
	else if (Array.isArray(defaultRootsResolver)) resolvedDefault = defaultRootsResolver;
	return {
		effectiveRoot,
		targetRoots: options.roots ?? resolvedDefault ?? config.paths?.srcRoots ?? ["src"]
	};
}
/**
* Base Object-Oriented Auditor class validation helpers.
*/
function validateAuditorIdentity(options) {
	if (typeof options.id !== "string" || options.id.trim() === "") throw new Error("Auditor must define an id");
	if (typeof options.name !== "string" || options.name.trim() === "") throw new Error(`Auditor [${options.id}] must define a name`);
	if (!options.packageName || options.packageName.trim().length === 0) throw new Error(`Auditor [${options.id}] must define a packageName`);
	if (!options.icon || typeof options.icon !== "string" || options.icon.trim().length === 0) throw new Error(`Auditor [${options.id}] must define a mandatory thematic icon/emoji`);
	if (!options.description || options.description.trim().length === 0) throw new Error(`Auditor [${options.id}] must define a human-friendly description`);
	if (options.description.length > 60 || options.description.includes("\n")) throw new Error(`Auditor [${options.id}] description exceeds 60 characters or contains newlines.`);
}
function validateAuditorConfigKey(options) {
	if (typeof options.configKey !== "string" || options.configKey.trim() === "") throw new Error(`Auditor [${options.id}] must define a mandatory 'configKey' (e.g. 'secretLeaks.enabled', 'packageDistribution.enabled', 'paths', 'core') to ensure zero hardcoded gating in the orchestrator.`);
}
function validateAuditorDefaultConfig(options) {
	if (!options.defaultConfig || typeof options.defaultConfig !== "object") throw new Error(`Auditor [${options.id}] must define a mandatory 'defaultConfig' (object). Zero-configuration or optional configurations are prohibited; every suite must self-declare its defaults.`);
	if (options.configKey !== "paths" && options.configKey !== "core") {
		if (typeof options.defaultConfig.enabled !== "boolean") throw new Error(`Auditor [${options.id}] must explicitly define 'defaultConfig.enabled' as a boolean (true or false). Ambiguous or optional activation states are strictly prohibited.`);
	}
}
function validateCriticalRationale(auditorId, criticalConfig) {
	const { rationale, requiredMinimums, forbiddenOverrides, validate } = criticalConfig;
	if ((requiredMinimums !== void 0 && Object.keys(requiredMinimums).length > 0 || forbiddenOverrides !== void 0 && Object.keys(forbiddenOverrides).length > 0 || typeof validate === "function") && (typeof rationale !== "string" || rationale.trim() === "")) throw new Error(`[Auditor Contract Violation] Auditor [${auditorId}] must define a non-empty 'rationale' in 'criticalConfig' when critical constraints are declared.`);
}
function validateCriticalMinimums(auditorId, requiredMinimums) {
	if (requiredMinimums === void 0) return;
	if (typeof requiredMinimums !== "object" || requiredMinimums === null) throw new Error(`[Auditor Contract Violation] Auditor [${auditorId}] 'criticalConfig.requiredMinimums' must be an object.`);
	for (const [key, list] of Object.entries(requiredMinimums)) if (!Array.isArray(list) || list.length === 0) throw new Error(`[Auditor Contract Violation] Auditor [${auditorId}] 'criticalConfig.requiredMinimums.${key}' must be a non-empty array.`);
}
function validateCriticalOverrides(auditorId, forbiddenOverrides) {
	if (forbiddenOverrides === void 0) return;
	if (typeof forbiddenOverrides !== "object" || forbiddenOverrides === null) throw new Error(`[Auditor Contract Violation] Auditor [${auditorId}] 'criticalConfig.forbiddenOverrides' must be an object.`);
	for (const [key, list] of Object.entries(forbiddenOverrides)) if (!Array.isArray(list) || list.length === 0) throw new Error(`[Auditor Contract Violation] Auditor [${auditorId}] 'criticalConfig.forbiddenOverrides.${key}' must be a non-empty array of disallowed values.`);
}
function validateCriticalCallbacks(auditorId, validate, repair) {
	if (validate !== void 0 && typeof validate !== "function") throw new Error(`[Auditor Contract Violation] Auditor [${auditorId}] 'criticalConfig.validate' must be a function.`);
	if (repair !== void 0 && typeof repair !== "function") throw new Error(`[Auditor Contract Violation] Auditor [${auditorId}] 'criticalConfig.repair' must be a function.`);
}
function validateAuditorCriticalConfig(options) {
	if (options.criticalConfig === void 0) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] must define mandatory 'criticalConfig' in its constructor (can be empty object {}, but cannot be undefined).`);
	if (typeof options.criticalConfig !== "object" || options.criticalConfig === null) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] 'criticalConfig' must be an object.`);
	validateCriticalRationale(options.id, options.criticalConfig);
	validateCriticalMinimums(options.id, options.criticalConfig.requiredMinimums);
	validateCriticalOverrides(options.id, options.criticalConfig.forbiddenOverrides);
	validateCriticalCallbacks(options.id, options.criticalConfig.validate, options.criticalConfig.repair);
}
const MANDATORY_AUDITOR_CAPABILITY_KEYS = [
	"speed",
	"phase",
	"fix",
	"md",
	"ast",
	"changedOnly",
	"critical"
];
const MANDATORY_BOOLEAN_CAPABILITY_KEYS = [
	"md",
	"ast",
	"changedOnly",
	"critical"
];
function isValidRuleSpeed(speed) {
	if (typeof speed === "string") return AUDIT_EXECUTION_SPEEDS.some((s) => s === speed);
	if (Array.isArray(speed) && speed.length > 0) return speed.every((s) => typeof s === "string" && AUDIT_EXECUTION_SPEEDS.some((x) => x === s));
	return false;
}
function validateAuditorRuleCapabilities(options) {
	if (options.ruleCapabilities === void 0 || typeof options.ruleCapabilities !== "object" || options.ruleCapabilities === null) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] must define mandatory 'ruleCapabilities' in its constructor. Every sub-auditor / rule must declare individual capabilities.`);
	for (const ruleId of options.ruleIds) {
		const caps = options.ruleCapabilities[ruleId];
		if (!caps || typeof caps !== "object") throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] is missing 'ruleCapabilities' for declared rule '${ruleId}'. Every sub-auditor must declare its individual capabilities.`);
		if (!isValidRuleSpeed(caps.speed)) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] must explicitly define 'ruleCapabilities.${ruleId}.speed' as ${AUDIT_EXECUTION_SPEEDS.map((s) => `'${s}'`).join(" | ")} (or a non-empty array of them).`);
		if (typeof caps.phase !== "string" || !AUDIT_EXECUTION_PHASES.some((p) => p === caps.phase)) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] must explicitly define 'ruleCapabilities.${ruleId}.phase' as ${AUDIT_EXECUTION_PHASES.map((p) => `'${p}'`).join(" | ")}.`);
		if (typeof caps.fix !== "string" || !AUDIT_FIX_CAPABILITIES.some((f) => f === caps.fix)) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] must explicitly define 'ruleCapabilities.${ruleId}.fix' as ${AUDIT_FIX_CAPABILITIES.map((f) => `'${f}'`).join(" | ")}.`);
		for (const key of MANDATORY_BOOLEAN_CAPABILITY_KEYS) if (typeof caps[key] !== "boolean") throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] must explicitly define sub-capability 'ruleCapabilities.${ruleId}.${key}' as a boolean (true or false).`);
		for (const key of Object.keys(caps)) if (!MANDATORY_AUDITOR_CAPABILITY_KEYS.includes(key)) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] declared unknown capability '${key}' in rule '${ruleId}'.`);
	}
	for (const ruleId of Object.keys(options.ruleCapabilities)) if (!options.ruleIds.includes(ruleId)) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] declares 'ruleCapabilities' for rule '${ruleId}' which is not in 'ruleIds'.`);
}
function validateAuditorFixContract(options, capabilities) {
	const isFix = capabilities.fix !== "none";
	const fixableList = options.fixableRuleIds ?? [];
	const configFilesWithFix = (options.configFiles ?? []).filter((c) => Boolean(c.ruleId && c.generateDefaultContent));
	if (isFix) {
		if (fixableList.length === 0 && configFilesWithFix.length === 0) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] declared capabilities.fix !== 'none' (${capabilities.fix}) but failed to explicitly initialize 'fixableRuleIds' in its constructor. Every auto-repairing suite must explicitly declare which ruleIds it can mechanically fix.`);
		for (const ruleId of fixableList) if (!options.ruleIds.includes(ruleId)) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] declared fixable rule '${ruleId}', but it is not registered in 'ruleIds'.`);
	} else if (fixableList.length > 0) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] declared 'fixableRuleIds' (${fixableList.join(", ")}) but capabilities.fix is 'none'.`);
}
function validateAuditorRules(options) {
	if (!Array.isArray(options.ruleIds) || options.ruleIds.length === 0) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] must define a mandatory 'ruleIds' array containing at least one ruleId. Zero-rule suites or omitted rule catalogs are strictly prohibited.`);
	if (!options.ruleDescriptions || typeof options.ruleDescriptions !== "object" || Object.keys(options.ruleDescriptions).length === 0) throw new Error(`Auditor [${options.id}] must define mandatory 'ruleDescriptions' covering all its declared rules.`);
	const descriptions = options.ruleDescriptions;
	for (const ruleId of options.ruleIds) if (!descriptions[ruleId]) throw new Error(`Auditor [${options.id}] is missing a rule description in 'ruleDescriptions' for declared rule '${ruleId}'.`);
	for (const ruleId of Object.keys(options.ruleDescriptions)) if (!options.ruleIds.includes(ruleId)) throw new Error(`Auditor [${options.id}] defines description for rule '${ruleId}' in 'ruleDescriptions' that is not declared in 'ruleIds'.`);
}
function validateAuditorRuleRemediations(options) {
	if (!options.ruleRemediations || typeof options.ruleRemediations !== "object" || Object.keys(options.ruleRemediations).length === 0) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] must define mandatory 'ruleRemediations' covering all its declared rules. Every sub-auditor and host extension is strictly required to expose on-demand diagnostic and remediation guides.`);
	const remediations = options.ruleRemediations;
	for (const ruleId of options.ruleIds) {
		const guide = remediations[ruleId];
		if (!guide || typeof guide !== "string" || guide.trim() === "") throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] is missing a mandatory remediation guide in 'ruleRemediations' for declared rule '${ruleId}'. Every rule must provide actionable guidance on root cause and steps to resolve.`);
		if (/^Guía de diagnóstico y remediación para/i.test(guide.trim())) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] contains a placeholder remediation guide for rule '${ruleId}'. Every rule must provide actionable guidance on root cause, diagnosis, and steps to resolve.`);
	}
	for (const ruleId of Object.keys(options.ruleRemediations)) if (!options.ruleIds.includes(ruleId)) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] defines remediation guide for rule '${ruleId}' in 'ruleRemediations' that is not declared in 'ruleIds'.`);
}
function validateAuditorRuleRemediationPhases(options) {
	const hasSuitePhase = Boolean(options.remediationPhase && isRemediationPhaseId(options.remediationPhase));
	const hasRulePhases = Boolean(options.ruleRemediationPhases && typeof options.ruleRemediationPhases === "object" && Object.keys(options.ruleRemediationPhases).length > 0);
	if (!hasSuitePhase && !hasRulePhases) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] must define mandatory 'remediationPhase' or 'ruleRemediationPhases' in its constructor options. Every sub-auditor and host extension is strictly required to declare how it is classified in the strategic remediation order.`);
	if (options.remediationPhase && !isRemediationPhaseId(options.remediationPhase)) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] defines invalid 'remediationPhase': '${String(options.remediationPhase)}'. Must be one of: ${REMEDIATION_PHASE_IDS.join(", ")}.`);
	const phases = options.ruleRemediationPhases ?? {};
	for (const ruleId of options.ruleIds) {
		const phase = phases[ruleId] ?? options.remediationPhase;
		if (!phase || !isRemediationPhaseId(phase)) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] is missing a valid remediation phase for declared rule '${ruleId}'. Declare 'remediationPhase' or 'ruleRemediationPhases' with one of: ${REMEDIATION_PHASE_IDS.join(", ")}.`);
	}
	if (options.ruleRemediationPhases) {
		for (const ruleId of Object.keys(options.ruleRemediationPhases)) if (!options.ruleIds.includes(ruleId)) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] defines remediation phase for rule '${ruleId}' in 'ruleRemediationPhases' that is not declared in 'ruleIds'.`);
	}
}
function validateAuditorScripts(options) {
	if (!Array.isArray(options.scripts) || options.scripts.length === 0) throw new Error(`Auditor [${options.id}] must define a mandatory 'scripts' contract (array of AuditorPackageScriptRequirement). Every sub-auditor and host extension must explicitly declare the canonical package.json script and CLI command used to execute it.`);
	for (const script of options.scripts) {
		if (!script.name || typeof script.name !== "string" || script.name.trim() === "") throw new Error(`Auditor [${options.id}] defines an invalid script requirement: 'name' must be a non-empty string.`);
		if (!script.command || typeof script.command !== "string" || script.command.trim() === "") throw new Error(`Auditor [${options.id}] defines an invalid script requirement for '${script.name}': 'command' must be a non-empty string.`);
		if (!script.description || typeof script.description !== "string" || script.description.trim() === "") throw new Error(`Auditor [${options.id}] defines an invalid script requirement for '${script.name}': 'description' must be a non-empty string.`);
	}
}
function validateAuditorThirdPartyToolContract(options) {
	if (typeof options.usesThirdPartyTool !== "boolean") throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] must define mandatory 'usesThirdPartyTool' as a boolean (true or false). Every sub-auditor and host extension must explicitly declare whether it delegates to third-party tools or binaries.`);
	if (options.usesThirdPartyTool) {
		if (!options.thirdPartyToolPolicy || typeof options.thirdPartyToolPolicy !== "object") throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] declared usesThirdPartyTool: true but failed to provide mandatory 'thirdPartyToolPolicy'. Every suite using third-party tools must declare what happens on failure or when output cannot be parsed.`);
		const policy = options.thirdPartyToolPolicy;
		if (!policy.toolName || typeof policy.toolName !== "string" || policy.toolName.trim() === "") throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] 'thirdPartyToolPolicy.toolName' must be a non-empty string naming the external tool.`);
		if (policy.fallbackBehavior !== "throw" && policy.fallbackBehavior !== "violation") throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] 'thirdPartyToolPolicy.fallbackBehavior' must be either 'throw' or 'violation'.`);
		if (policy.fallbackBehavior === "violation") {
			if (!policy.fallbackRuleId || typeof policy.fallbackRuleId !== "string") throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] declared fallbackBehavior: 'violation' but omitted mandatory 'fallbackRuleId'.`);
			if (!options.ruleIds.includes(policy.fallbackRuleId)) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] designated fallbackRuleId '${policy.fallbackRuleId}' which is not in declared 'ruleIds'.`);
		}
	} else if (options.thirdPartyToolPolicy !== void 0) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] declared usesThirdPartyTool: false but provided 'thirdPartyToolPolicy'. Suites that do not use third-party tools must not declare a thirdPartyToolPolicy.`);
}
function validateAuditorRequiredPermissions(options) {
	if (options.requiredPermissions === void 0 || !Array.isArray(options.requiredPermissions)) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] must define mandatory 'requiredPermissions' array in its constructor options (pass [] if no special permissions are needed).`);
}
function validateAuditorOptions(options, effectiveCapabilities) {
	validateAuditorIdentity(options);
	validateAuditorConfigKey(options);
	validateAuditorDefaultConfig(options);
	validateAuditorCriticalConfig(options);
	validateAuditorThirdPartyToolContract(options);
	validateAuditorRequiredPermissions(options);
	validateAuditorRules(options);
	validateAuditorRuleCapabilities(options);
	validateAuditorFixContract(options, effectiveCapabilities);
	validateAuditorRuleRemediations(options);
	validateAuditorRuleRemediationPhases(options);
	validateAuditorScripts(options);
	if (options.gitIgnoreEntries !== void 0 && !Array.isArray(options.gitIgnoreEntries)) throw new Error(`Auditor [${options.id}] 'gitIgnoreEntries' must be an array if defined.`);
	validateCoverageDeclaration(options.id, options.coverage);
}
function validateAuditorRuleDescriptions(options, formatFn) {
	if (!options.ruleDescriptions) return;
	const declaredRules = options.ruleIds && options.ruleIds.length > 0 ? options.ruleIds : Object.keys(options.ruleDescriptions);
	for (const rawRuleId of declaredRules) {
		const ruleId = rawRuleId;
		const desc = options.ruleDescriptions[ruleId];
		if (!desc || typeof desc !== "string" || !desc.trim()) throw new Error(`Auditor [${options.id}] is missing a rule description for rule '${ruleId}'.`);
		const formatted = formatFn(ruleId, desc);
		if (formatted.length > 50 || formatted.includes("\n")) throw new Error(`Auditor [${options.id}] rule description for '${ruleId}' ('${formatted}', length: ${formatted.length}) exceeds 50 characters or contains newlines.`);
	}
}
function extractStringList(candidate) {
	return Array.isArray(candidate) ? candidate.filter((item) => typeof item === "string") : [];
}
function resolveSubsystemIgnoresAndExemptions(options, config) {
	const section = resolveSubsystemConfig(config, options.configKey);
	if (!section || typeof section !== "object") return {
		extraIgnorePatterns: options.extraIgnorePatterns ?? [],
		exemptPaths: options.exemptPaths ?? []
	};
	const sectionObj = section;
	const ignoreGlobs = extractStringList(sectionObj.ignoreGlobs);
	const exemptPaths = [...extractStringList(sectionObj.exemptPaths), ...extractStringList(sectionObj.exemptFiles)];
	return {
		extraIgnorePatterns: Array.from(/* @__PURE__ */ new Set([...options.extraIgnorePatterns ?? [], ...ignoreGlobs])),
		exemptPaths: Array.from(/* @__PURE__ */ new Set([...options.exemptPaths ?? [], ...exemptPaths]))
	};
}
function resolveRulePhases(options) {
	const resolvedPhases = {};
	for (const ruleId of options.ruleIds) resolvedPhases[ruleId] = options.ruleRemediationPhases?.[ruleId] ?? options.remediationPhase;
	return Object.freeze(resolvedPhases);
}
function resolveFixableRuleIds(options) {
	const configFixableRules = (options.configFiles ?? []).filter((c) => Boolean(c.ruleId && c.generateDefaultContent)).map((c) => c.ruleId);
	return /* @__PURE__ */ new Set([...options.fixableRuleIds ?? [], ...configFixableRules]);
}
var BaseAuditor = class BaseAuditor {
	id;
	name;
	description;
	family;
	packageName;
	icon;
	capabilities;
	ruleCapabilities;
	gitIgnoreEntries;
	configFiles;
	scripts;
	requiredPermissions;
	ruleIds;
	ruleDescriptions;
	ruleRemediations;
	ruleRemediationPhases;
	explicitSubAuditors;
	roots;
	allowedExtensions;
	extraIgnorePatterns;
	exemptPaths;
	unignoreDirs;
	requiredFiles;
	requiresAst;
	projectRoot;
	configKey;
	defaultConfig;
	criticalConfig;
	usesThirdPartyTool;
	thirdPartyToolPolicy;
	fixableRuleIds;
	durationsByRule = /* @__PURE__ */ new Map();
	auditExecutionDurationMs;
	instanceStartTime = performance.now();
	declaredSubAuditors = /* @__PURE__ */ new Map();
	context;
	countsByRule = /* @__PURE__ */ new Map();
	errorsByRule = /* @__PURE__ */ new Map();
	warningsByRule = /* @__PURE__ */ new Map();
	fixableErrorsByRule = /* @__PURE__ */ new Map();
	fixableWarningsByRule = /* @__PURE__ */ new Map();
	subAuditorReports = [];
	coverageRecorder;
	fixMode;
	isSkipped = false;
	skipReason;
	getFixableRuleIds() {
		return Array.from(this.fixableRuleIds);
	}
	recordRuleDuration(ruleId, durationMs) {
		const current = this.durationsByRule.get(ruleId) ?? 0;
		this.durationsByRule.set(ruleId, current + Math.max(0, durationMs));
	}
	/**
	* Allows an external subprogram with its own telemetry (such as Fallow elapsed_ms)
	* or extension to report or override its net internally measured execution time.
	*/
	reportRuleDuration(ruleId, durationMs) {
		this.durationsByRule.set(ruleId, Math.max(0, durationMs));
	}
	/**
	* Formally declares a sub-tool or sub-auditor bound to a declared rule.
	* The superclass automatically orchestrates its execution and empirically measures
	* its execution runtime homogeneously and transparently.
	*/
	declareSubAuditor(ruleId, action) {
		if (!this.ruleIds.includes(ruleId)) throw new Error(`[Auditor Contract Violation] Auditor [${this.id}] attempted to declare sub-auditor for '${ruleId}', but that rule is not registered in 'ruleIds'.`);
		this.declaredSubAuditors.set(ruleId, action);
	}
	/**
	* Executes a sub-auditor or rule block empirically measuring its start and end
	* completely transparently.
	*/
	async runSubAuditor(ruleId, action) {
		this.markRuleEvaluated(ruleId);
		const start = performance.now();
		try {
			return await action();
		} finally {
			this.recordRuleDuration(ruleId, performance.now() - start);
		}
	}
	runSubAuditorSync(ruleId, action) {
		this.markRuleEvaluated(ruleId);
		const start = performance.now();
		try {
			return action();
		} finally {
			this.recordRuleDuration(ruleId, performance.now() - start);
		}
	}
	/**
	* @deprecated Prohibited under the Universal Empirical Individual Timing Contract.
	* Batch duration duplication is strictly forbidden. Measure rules individually with runSubAuditorSync or runSubAuditor.
	*/
	async runSubAuditorsBatch(ruleIds, _action) {
		throw new Error(`[BaseAuditor] 'runSubAuditorsBatch' is strictly prohibited under the Universal Empirical Individual Timing Contract. Batch stamping duplicates elapsed time across [${ruleIds.join(", ")}]. Measure each rule individually using 'this.runSubAuditorSync(ruleId, () => ...)' or 'await this.runSubAuditor(ruleId, async () => ...)'.`);
	}
	/**
	* @deprecated Prohibited under the Universal Empirical Individual Timing Contract.
	* Batch duration duplication is strictly forbidden. Measure rules individually with runSubAuditorSync or runSubAuditor.
	*/
	runSubAuditorsBatchSync(ruleIds, _action) {
		throw new Error(`[BaseAuditor] 'runSubAuditorsBatchSync' is strictly prohibited under the Universal Empirical Individual Timing Contract. Batch stamping duplicates elapsed time across [${ruleIds.join(", ")}]. Measure each rule individually using 'this.runSubAuditorSync(ruleId, () => ...)' or 'await this.runSubAuditor(ruleId, async () => ...)'.`);
	}
	getRuleDuration(ruleId) {
		return this.durationsByRule.get(ruleId);
	}
	getDurationsByRule() {
		return this.durationsByRule;
	}
	executedCommandTiers = /* @__PURE__ */ new Map();
	/**
	* Resolves the active speed ceiling (`maxSpeed`) and optional exact speed filter (`onlySpeed`)
	* from environment variables or CLI arguments.
	*/
	getExecutionSpeedOptions() {
		const rawValues = this.context.values;
		const rawOnly = rawValues?.["only-speed"] || process.env.AUDITOR_ONLY_SPEED;
		const onlySpeed = rawOnly && AUDIT_EXECUTION_SPEEDS.some((s) => s === rawOnly) ? rawOnly : void 0;
		const rawSpeed = rawValues?.speed || process.env.AUDITOR_SPEED;
		if (rawSpeed && AUDIT_EXECUTION_SPEEDS.some((s) => s === rawSpeed)) return {
			maxSpeed: rawSpeed,
			onlySpeed,
			isSpeedSpecified: true
		};
		const preset = process.env.AUDITOR_PRESET;
		if (preset === "lint") return {
			maxSpeed: "light",
			onlySpeed,
			isSpeedSpecified: true
		};
		if (preset === "full" || preset === "precommit") return {
			maxSpeed: "full",
			onlySpeed,
			isSpeedSpecified: true
		};
		if (preset === "critical") return {
			maxSpeed: "light",
			onlySpeed,
			isSpeedSpecified: true
		};
		return {
			maxSpeed: "heavy",
			onlySpeed,
			isSpeedSpecified: Boolean(onlySpeed)
		};
	}
	/**
	* Resolves the effective speed ('light' | 'heavy' | 'full') for a specific ruleId in the current run,
	* or null if the rule should be skipped under the current speed ceiling or exact speed filter.
	*/
	resolveRuleEffectiveSpeed(ruleId) {
		const caps = this.ruleCapabilities[ruleId];
		if (!caps) return null;
		const speedOpts = this.getExecutionSpeedOptions();
		if (caps.critical && !speedOpts.isSpeedSpecified) {
			const speeds = normalizeSpeeds(caps.speed);
			if (speeds.length >= 2) return speeds.reduce((fastest, current) => SPEED_RANK[current] < SPEED_RANK[fastest] ? current : fastest);
		}
		return resolveEffectiveSpeed(caps.speed, speedOpts);
	}
	/**
	* Returns the active execution tier ('light', 'heavy', 'full', 'md', 'fix', or 'post-build').
	*/
	getExecutionTier() {
		if (this.fixMode || this.isFixModeRequested()) return "fix";
		if (process.env.AUDITOR_PRESET === "md") return "md";
		if (process.env.AUDITOR_PHASE === "post-build" || process.env.AUDITOR_PRESET === "post-build" || process.env.AUDITOR_PRESET === "build") return "post-build";
		if (process.env.AUDITOR_PRESET === "critical") {
			if (normalizeSpeeds(this.capabilities.speed).includes("light")) return "light";
		}
		const speedOpts = this.getExecutionSpeedOptions();
		if (this.capabilities.critical && !speedOpts.isSpeedSpecified) {
			const speeds = normalizeSpeeds(this.capabilities.speed);
			if (speeds.length >= 2) return speeds.reduce((fastest, current) => SPEED_RANK[current] < SPEED_RANK[fastest] ? current : fastest);
		}
		return resolveEffectiveSpeed(this.capabilities.speed, speedOpts) ?? speedOpts.onlySpeed ?? speedOpts.maxSpeed;
	}
	/**
	* Returns true when the active run is a lightweight run ('light' or 'md').
	*/
	isFastMode() {
		const tier = this.getExecutionTier();
		return tier === "light" || tier === "md";
	}
	/**
	* Checks whether a specific declared ruleId is active for the current execution tier/speed.
	*/
	isRuleActiveForCurrentRun(ruleId) {
		const caps = this.ruleCapabilities[ruleId];
		if (!caps) return false;
		const tier = this.getExecutionTier();
		if (tier === "fix") return caps.fix !== "none";
		if (tier === "md") return caps.md;
		if (tier === "post-build") return caps.phase === "post-build";
		return this.resolveRuleEffectiveSpeed(ruleId) !== null;
	}
	isDualOrTieredProfile(val) {
		return typeof val === "object" && val !== null && "command" in val;
	}
	/**
	* Resolves arguments for a tiered or dual command profile,
	* enforcing the Anti-Repetition Invariant: a command cannot be resolved in multiple tiers in the same run.
	*/
	resolveCommandArgs(profile) {
		if (!this.isDualOrTieredProfile(profile)) return profile;
		const tier = this.getExecutionTier();
		const previousTier = this.executedCommandTiers.get(profile.command);
		if (previousTier !== void 0) throw new Error(`[Auditor Contract Violation] Auditor [${this.id}]: El comando '${profile.command}' ya fue resuelto/ejecutado con perfil '${previousTier}'. Ejecutar o resolver múltiples variantes de velocidad del MISMO comando en la misma corrida está estrictamente prohibido.`);
		this.executedCommandTiers.set(profile.command, tier);
		if ("profiles" in profile) return profile.profiles[tier] ?? profile.defaultArgs;
		return (this.isFastMode() ? "fast" : "heavy") === "fast" ? profile.fastArgs : profile.heavyArgs;
	}
	/** Derived from the coverage recorder: record real files with `recordScanned()` instead of counting. */
	get filesScannedCount() {
		return this.coverageRecorder.scannedCount;
	}
	set filesScannedCount(count) {
		this.coverageRecorder.recordExternalScanCount(count);
	}
	markSkipped(reason) {
		this.isSkipped = true;
		this.skipReason = reason;
	}
	resolveEffectiveCoverage(options, effectiveProjectRoot) {
		if (options.coverage) return options.coverage;
		if (options.roots !== void 0) {
			const targetRoots = options.roots.length > 0 ? options.roots : getEffectiveScannableRoots();
			return deriveCoverageFromRoots(targetRoots, options.allowedExtensions ?? SCANNABLE_EXTENSIONS);
		}
		if (options.requiredFiles && options.requiredFiles.length > 0) return deriveCoverageFromRequiredFiles(options.requiredFiles, effectiveProjectRoot, options.allowedExtensions);
	}
	resolveEffectiveScripts(options) {
		if (options.scripts && options.scripts.length > 0) return options.scripts;
		return [deriveCanonicalAuditorScript(options.id, options.description, {
			category: options.family,
			permissions: options.requiredPermissions ?? [],
			isApplicable: (config) => evaluateSuiteStatus(options.id, config, options.configKey).enabled !== false
		})];
	}
	registerAuditorDependencies(options, effectiveScripts) {
		if (options.gitIgnoreEntries && options.gitIgnoreEntries.length > 0) GitIgnoreRegistry.registerMany(options.gitIgnoreEntries);
		if (options.configFiles && options.configFiles.length > 0) ConfigFileRegistry.registerMany(options.configFiles);
		if (effectiveScripts && effectiveScripts.length > 0) PackageScriptRegistry.registerMany(effectiveScripts, options.id);
	}
	initExecutionContext(coverageDeclaration) {
		return setupAuditor({
			id: this.id,
			name: this.name,
			description: this.description,
			family: this.family,
			requiredFiles: [...this.requiredFiles],
			extraIgnorePatterns: [...this.extraIgnorePatterns],
			unignoreDirs: [...this.unignoreDirs],
			projectRoot: this.projectRoot,
			onFilesCollected: (files) => {
				for (const f of files) {
					const rel = toPosixRelative(this.projectRoot, f);
					if (isDeclaredByCoverage(rel, coverageDeclaration)) this.recordScanned(rel);
				}
			}
		});
	}
	initRuleLedger() {
		for (const ruleId of this.ruleIds) {
			this.countsByRule.set(ruleId, 0);
			this.errorsByRule.set(ruleId, 0);
			this.warningsByRule.set(ruleId, 0);
			this.fixableErrorsByRule.set(ruleId, 0);
			this.fixableWarningsByRule.set(ruleId, 0);
		}
	}
	constructor(options) {
		if (Object.hasOwn(options, "capabilities")) throw new Error(`[Auditor Contract Violation] Auditor [${options.id}] passed redundant 'capabilities' to constructor options. Suite-level capabilities must NOT be passed directly; define individual 'ruleCapabilities' for each sub-auditor/rule and BaseAuditor will automatically derive suite capabilities.`);
		validateAuditorRuleCapabilities(options);
		const effectiveProjectRoot = options.projectRoot || process.cwd();
		const effectiveCoverage = this.resolveEffectiveCoverage(options, effectiveProjectRoot);
		const effectiveScripts = this.resolveEffectiveScripts(options);
		const effectiveCapabilities = deriveSuiteCapabilities(options.ruleCapabilities);
		validateAuditorOptions({
			...options,
			coverage: effectiveCoverage,
			scripts: effectiveScripts
		}, effectiveCapabilities);
		this.ruleCapabilities = options.ruleCapabilities;
		this.capabilities = effectiveCapabilities;
		this.requiresAst = effectiveCapabilities.ast;
		this.packageName = options.packageName;
		this.icon = options.icon;
		this.id = options.id;
		this.name = options.name;
		this.description = options.description;
		this.family = options.family;
		this.configKey = options.configKey;
		this.defaultConfig = options.defaultConfig;
		this.criticalConfig = options.criticalConfig;
		this.usesThirdPartyTool = options.usesThirdPartyTool;
		this.thirdPartyToolPolicy = options.thirdPartyToolPolicy;
		this.gitIgnoreEntries = options.gitIgnoreEntries ?? [];
		this.configFiles = options.configFiles ?? [];
		this.scripts = effectiveScripts;
		this.requiredPermissions = options.requiredPermissions ?? [];
		this.registerAuditorDependencies(options, effectiveScripts);
		this.fixMode = Boolean(options.fix);
		this.ruleIds = options.ruleIds;
		this.ruleDescriptions = options.ruleDescriptions;
		this.ruleRemediations = options.ruleRemediations;
		this.ruleRemediationPhases = resolveRulePhases(options);
		this.explicitSubAuditors = options.subAuditors;
		this.roots = options.roots ?? getEffectiveScannableRoots();
		this.allowedExtensions = options.allowedExtensions ?? SCANNABLE_EXTENSIONS;
		const { extraIgnorePatterns, exemptPaths } = resolveSubsystemIgnoresAndExemptions(options, getAuditConfig(effectiveProjectRoot));
		this.extraIgnorePatterns = extraIgnorePatterns;
		this.exemptPaths = exemptPaths;
		this.unignoreDirs = options.unignoreDirs ?? (options.family === "documentation" ? getEffectiveUnignoreDirs(effectiveProjectRoot) : []);
		this.requiredFiles = options.requiredFiles ?? [];
		this.projectRoot = effectiveProjectRoot;
		this.coverageRecorder = new CoverageRecorder(this.projectRoot, effectiveCoverage);
		this.fixableRuleIds = resolveFixableRuleIds(options);
		validateAuditorRuleDescriptions(options, (r, d) => this.formatRuleDescription(r, d));
		this.initRuleLedger();
		this.context = this.initExecutionContext(this.coverageRecorder.declaration);
	}
	/**
	* Checks whether the given relative path is exempt according to suite options and configuration.
	*/
	isPathExempt(relPath) {
		return isPathExempt(relPath, this.exemptPaths);
	}
	/**
	* Determines whether a given project-relative path is scannable by this auditor,
	* taking into account its extraIgnorePatterns, unignoreDirs, exemptPaths, and global project ignores.
	*/
	isPathScannable(relPath) {
		const norm = toPosixRelative(this.projectRoot, relPath);
		if (isPathIgnored(norm, this.extraIgnorePatterns, this.unignoreDirs, this.projectRoot)) return false;
		if (this.isPathExempt(norm)) return false;
		if (this.family !== "testing" && isTestFileForCodeAudit(norm, this.projectRoot)) return false;
		return true;
	}
	/**
	* Resolves all target project-relative files that this auditor intends to scan,
	* applying declared roots, allowedExtensions, global ignores, and extraIgnorePatterns.
	*/
	getScannableFiles() {
		return this.context.collectFiles(this.roots, this.allowedExtensions).map((f) => toPosixRelative(this.projectRoot, f)).filter((rel) => this.isPathScannable(rel));
	}
	/** Full rule catalog used for dormancy detection (declared ruleIds, else ruleDescriptions keys). */
	getRuleCatalog() {
		if (this.ruleIds.length > 0) return this.ruleIds;
		return Object.keys(this.ruleDescriptions ?? {});
	}
	/** Returns the on-demand diagnostic and remediation guide for a declared rule. */
	getRuleRemediation(ruleId) {
		return this.ruleRemediations?.[ruleId];
	}
	/** Records a file that this suite actually analyzed (absolute or project-relative path). */
	recordScanned(filePath) {
		this.coverageRecorder.recordScanned(filePath);
	}
	unrecordScanned(filePath) {
		this.coverageRecorder.unrecordScanned(filePath);
	}
	recordScannedMany(filePaths) {
		for (const f of filePaths) this.coverageRecorder.recordScanned(f);
	}
	/**
	* Evaluates an assertion or check block for a declared rule.
	* Automatically marks the rule as evaluated in the coverage ledger.
	*/
	async evaluateRule(ruleId, evaluateFn) {
		this.markRuleEvaluated(ruleId);
		const start = performance.now();
		try {
			await evaluateFn();
		} finally {
			this.recordRuleDuration(ruleId, performance.now() - start);
		}
	}
	/** Synchronous variant for inline invariant evaluation. */
	evaluateRuleSync(ruleId, evaluateFn) {
		this.markRuleEvaluated(ruleId);
		const start = performance.now();
		try {
			evaluateFn();
		} finally {
			this.recordRuleDuration(ruleId, performance.now() - start);
		}
	}
	/**
	* Asserts a condition for a rule. Automatically marks the rule as evaluated.
	* If condition is false, adds a violation.
	*/
	assertRule(ruleId, condition, violation) {
		this.markRuleEvaluated(ruleId);
		if (!condition) this.addViolation({
			ruleId,
			...violation
		});
	}
	/** Refines the coverage declaration at runtime (e.g. from config-driven roots loaded after construction). */
	redeclareCoverage(declaration) {
		this.coverageRecorder.redeclare(this.id, declaration);
	}
	/** For `declared-only` suites whose external engine reports a file count but no file list. */
	recordExternalScanCount(count) {
		this.coverageRecorder.recordExternalScanCount(count);
	}
	/** Adds dynamically discovered rule ids (rule engines without static ruleIds) to the dormancy catalog. */
	declareRuleCatalog(ruleIds) {
		this.coverageRecorder.declareRuleCatalog(ruleIds);
	}
	/** Records that a rule passed its activation gates and was evaluated (per file, or per tool invocation). */
	markRuleEvaluated(ruleId, count = 1) {
		this.coverageRecorder.markRuleEvaluated(ruleId, count);
	}
	/**
	* Loud failure for obsolete v3 method name.
	* Enforces the Loud Failure Mandate under AGENTS.md.
	*/
	recordRuleEvaluation(ruleId) {
		throw new Error(`[BaseAuditor]: Method 'recordRuleEvaluation' is obsolete and was removed in v4+. Use 'this.markRuleEvaluated("${ruleId}")' instead.`);
	}
	/** Explicitly declares a rule as non-applicable for this run; never silent, always justified. */
	markRuleNotApplicable(ruleId, reason) {
		this.coverageRecorder.markRuleNotApplicable(ruleId, reason);
		if (!this.durationsByRule.has(ruleId)) this.recordRuleDuration(ruleId, 0);
	}
	/**
	* Evaluates suite gating against configuration and marks rules not applicable and suite skipped if disabled.
	* Returns true if the suite is disabled, allowing an immediate clean early return.
	*/
	isSuiteGatingDisabled(defaultReason = "Suite desactivada en config") {
		const config = getAuditConfig(this.projectRoot);
		const gating = evaluateSuiteStatus(this.id, config, this.configKey);
		if (!gating.enabled) {
			const reason = gating.reason ?? defaultReason;
			for (const ruleId of this.ruleIds) this.markRuleNotApplicable(ruleId, reason);
			this.markSkipped(reason);
			return true;
		}
		return false;
	}
	/** Gets evaluation count recorded so far for a given rule. */
	getEvaluations(ruleId) {
		return this.coverageRecorder.getEvaluations(ruleId);
	}
	getCoverageRecorder() {
		return this.coverageRecorder;
	}
	async persistCoverageLedger() {
		const runId = resolveActiveCoverageRunId();
		if (!runId) return;
		for (const [ruleId, count] of this.countsByRule) if (count > 0 && this.coverageRecorder.getEvaluations(ruleId) === 0) this.coverageRecorder.markRuleEvaluated(ruleId);
		await writeCoverageLedger(this.projectRoot, this.coverageRecorder.toLedger({
			runId,
			suiteId: this.id,
			skipped: this.isSkipped,
			ruleIds: this.getRuleCatalog()
		}));
	}
	getSubAuditors() {
		if (this.explicitSubAuditors && this.explicitSubAuditors.length > 0) return this.explicitSubAuditors;
		return this.ruleIds.map((ruleId) => ({
			id: ruleId,
			name: this.formatRuleDescription(ruleId),
			description: this.ruleDescriptions?.[ruleId]
		}));
	}
	resolveSubAuditorStatus(result, count, errorsCount, warningsCount) {
		if (errorsCount > 0 || result === "failed") return "failed";
		if (count > 0 || warningsCount > 0 || result === "warning") return "warning";
		return "passed";
	}
	formatSubAuditorBadge(result) {
		if (typeof result === "number") return result > 0 ? ` [🐛 ${result}]` : "";
		return result !== "passed" ? ` [${result}]` : "";
	}
	logSubAudit(stepNumber, totalSteps, name, result, detail, counts, durationMs, speed) {
		if (!speed || !AUDIT_EXECUTION_SPEEDS.some((s) => s === speed)) throw new Error(`[${this.id}] Sub-auditor step ${stepNumber} ('${name}') logged without mandatory execution speed (${AUDIT_EXECUTION_SPEEDS.map((s) => `'${s}'`).join(" | ")}). All sub-auditors must strictly declare their speed.`);
		const count = typeof result === "number" ? result : 0;
		const errorsCount = counts?.errors ?? (typeof result === "number" && result > 0 ? counts?.warnings !== void 0 ? 0 : result : 0);
		const warningsCount = counts?.warnings ?? 0;
		const badge = this.formatSubAuditorBadge(result);
		const speedBadge = speed === "light" ? " 🐇" : speed === "heavy" ? " 🐢" : " 🐘";
		const extra = detail ? ` (${detail})` : "";
		this.context.logStep(stepNumber, totalSteps, `${name}${badge}${speedBadge}${extra}`);
		const status = this.resolveSubAuditorStatus(result, count, errorsCount, warningsCount);
		this.subAuditorReports.push({
			id: `${this.id}_step_${stepNumber}`,
			name,
			status,
			count,
			errorsCount,
			warningsCount,
			detail,
			durationMs,
			speed
		});
	}
	getCountsByRule() {
		return this.countsByRule;
	}
	getErrorsByRule() {
		return this.errorsByRule;
	}
	getWarningsByRule() {
		return this.warningsByRule;
	}
	getFixableErrorsByRule() {
		return this.fixableErrorsByRule;
	}
	getFixableWarningsByRule() {
		return this.fixableWarningsByRule;
	}
	getFindings() {
		return this.context.getFindings();
	}
	getFixableFindings() {
		return this.context.getFindings().filter((f) => f.fixable === true);
	}
	getFixableErrors() {
		return this.context.getFindings().filter((f) => f.severity === "error" && f.fixable === true).length;
	}
	getFixableWarnings() {
		return this.context.getFindings().filter((f) => f.severity === "warning" && f.fixable === true).length;
	}
	static countFixableFindings(findings) {
		return countFixableFindings(findings);
	}
	static computeFixableViolations(results, isFixMode = false) {
		return computeResultsFixableViolations(results, isFixMode);
	}
	formatRuleDescription(ruleId, rawDescription) {
		const raw = rawDescription || this.ruleDescriptions?.[ruleId] || ruleId;
		if (this.packageName && !raw.toLowerCase().startsWith(this.packageName.toLowerCase() + ":")) return `${this.packageName}: ${raw}`;
		return raw;
	}
	getRuleLabel(ruleId) {
		return this.formatRuleDescription(ruleId);
	}
	getFilesScanned() {
		return this.filesScannedCount;
	}
	addViolation(v) {
		if (!(v.ruleId in this.ruleDescriptions)) throw new Error(`[Auditor Contract Violation] Rule '${v.ruleId}' emitted in '${this.id}' is NOT registered in 'ruleDescriptions'. All emitted rules must be registered in the constructor.`);
		const targetFile = v.file ?? v.filePath;
		const normalizedFile = targetFile ? toPosixRelative(this.projectRoot, targetFile) : targetFile;
		if (normalizedFile && this.isViolationSuppressed(normalizedFile)) return;
		const current = this.countsByRule.get(v.ruleId) ?? 0;
		this.countsByRule.set(v.ruleId, current + 1);
		const isFixable = v.fixable !== void 0 ? Boolean(v.fixable) : this.fixableRuleIds.has(v.ruleId);
		if (v.severity === "error") {
			const errCurrent = this.errorsByRule.get(v.ruleId) ?? 0;
			this.errorsByRule.set(v.ruleId, errCurrent + 1);
			if (isFixable) {
				const fixErrCurrent = this.fixableErrorsByRule.get(v.ruleId) ?? 0;
				this.fixableErrorsByRule.set(v.ruleId, fixErrCurrent + 1);
			}
		} else {
			const warnCurrent = this.warningsByRule.get(v.ruleId) ?? 0;
			this.warningsByRule.set(v.ruleId, warnCurrent + 1);
			if (isFixable) {
				const fixWarnCurrent = this.fixableWarningsByRule.get(v.ruleId) ?? 0;
				this.fixableWarningsByRule.set(v.ruleId, fixWarnCurrent + 1);
			}
		}
		const ruleDesc = this.formatRuleDescription(v.ruleId, v.ruleDescription);
		const targetCol = v.col ?? v.column;
		const effectiveRemediation = v.remediation ?? this.ruleRemediations?.[v.ruleId];
		const effectiveRemediationPhase = v.remediationPhase ?? this.ruleRemediationPhases?.[v.ruleId];
		if (v.severity === "error") this.context.addFinding({
			severity: "error",
			message: v.message,
			file: normalizedFile,
			line: v.line,
			col: targetCol,
			context: v.context,
			ruleId: v.ruleId,
			ruleDescription: ruleDesc,
			suiteId: this.id,
			suiteName: this.name,
			fixable: isFixable,
			remediation: effectiveRemediation,
			remediationPhase: effectiveRemediationPhase
		});
		else if (!this.context.values["errors-only"]) this.context.addFinding({
			severity: "warning",
			message: v.message,
			file: normalizedFile,
			line: v.line,
			col: targetCol,
			context: v.context,
			ruleId: v.ruleId,
			ruleDescription: ruleDesc,
			suiteId: this.id,
			suiteName: this.name,
			fixable: isFixable,
			remediation: effectiveRemediation,
			remediationPhase: effectiveRemediationPhase
		});
	}
	isLineIgnored(line, customTokens = []) {
		const baseTokens = [
			"domain-ok",
			"string-ok",
			"test-ok",
			"fallow-ignore-next-line",
			...customTokens
		];
		return new RegExp(`(?:--|\\/\\/|<!--)\\s*(?:${baseTokens.join("|")})\\b`, "i").test(line);
	}
	hasEscapeHatch(line, hatches) {
		return hatches.some((h) => {
			const cleanH = h.replace(/^(?:\/\/|\/\*|<!--)\s*/, "").trim();
			return line.includes(`// ${cleanH}`) || line.includes(`/* ${cleanH}`) || line.includes(`<!-- ${cleanH}`);
		});
	}
	isFixActive() {
		return this.fixMode || this.isFixModeRequested();
	}
	isFixModeRequested() {
		const rawValues = this.context.values;
		return this.fixMode || process.argv.includes("fix") || process.argv.includes("--fix") || process.env.AUDIT_FIX === "true" || Boolean(rawValues?.fix);
	}
	/**
	* Resolves whether any declared file or candidate file for this requirement exists on disk.
	* Returns the absolute path of the first existing candidate, or null if none exist.
	*/
	resolveConfigFile(requirement) {
		const candidates = requirement.candidateFiles && requirement.candidateFiles.length > 0 ? requirement.candidateFiles : [requirement.file];
		for (const candidate of candidates) {
			const fullPath = path.resolve(this.projectRoot, candidate);
			if (fs.existsSync(fullPath)) {
				this.recordScanned(toPosixRelative(this.projectRoot, fullPath));
				return fullPath;
			}
		}
		return null;
	}
	async scaffoldDefaultConfigFile(requirement, config) {
		if (requirement.ruleId) this.markRuleEvaluated(requirement.ruleId);
		const targetPath = path.resolve(this.projectRoot, requirement.file);
		fs.mkdirSync(path.dirname(targetPath), { recursive: true });
		const content = await requirement.generateDefaultContent({
			projectRoot: this.projectRoot,
			packageName: this.packageName,
			config
		});
		if (!fs.existsSync(targetPath)) fs.writeFileSync(targetPath, content, "utf-8");
		this.recordScanned(toPosixRelative(this.projectRoot, targetPath));
		return {
			resolvedPath: targetPath,
			created: true
		};
	}
	reportMissingConfigFileViolation(requirement, config) {
		if (!requirement.ruleId) return;
		this.markRuleEvaluated(requirement.ruleId);
		const fixCtx = {
			projectRoot: this.projectRoot,
			packageName: this.packageName,
			config
		};
		const message = typeof requirement.customMissingMessage === "function" ? requirement.customMissingMessage(fixCtx, requirement.file) : requirement.customMissingMessage ?? `No se encontró el archivo de configuración requerido '${requirement.file}' (${requirement.description}). Ejecuta con --fix para inicializarlo.`;
		const reportedFile = requirement.customMissingFile ? requirement.customMissingFile(fixCtx, requirement.file) : requirement.file;
		this.addViolation({
			ruleId: requirement.ruleId,
			severity: "error",
			file: reportedFile,
			line: 1,
			col: 1,
			context: requirement.file,
			message
		});
	}
	async ensureConfigFile(requirement) {
		const config = getAuditConfig(this.projectRoot);
		if (requirement.isApplicable && !requirement.isApplicable(config, this.projectRoot)) return null;
		const existingPath = this.resolveConfigFile(requirement);
		if (existingPath) {
			if (requirement.ruleId) this.markRuleEvaluated(requirement.ruleId);
			return {
				resolvedPath: existingPath,
				created: false
			};
		}
		if (this.isFixActive()) return this.scaffoldDefaultConfigFile(requirement, config);
		this.reportMissingConfigFileViolation(requirement, config);
		return null;
	}
	/**
	* Iterates through all declared `configFiles`, ensuring that every applicable requirement
	* is satisfied or scaffolded. Returns true if all applicable requirements are met, false otherwise.
	*/
	async verifyAndFixConfigFiles() {
		let allSatisfied = true;
		for (const requirement of this.configFiles) if (await this.ensureConfigFile(requirement) === null) {
			const config = getAuditConfig(this.projectRoot);
			if (requirement.isApplicable ? requirement.isApplicable(config, this.projectRoot) : true) allSatisfied = false;
		}
		return allSatisfied;
	}
	isPathIgnored(relPath) {
		return this.context.isPathIgnored(relPath);
	}
	/**
	* Determines whether a violation on the given relative path should be suppressed
	* due to locked skill protection, subsystem exemptions, subsystem ignore globs,
	* or user-configured paths.ignoreGlobs / paths.ignoredPatterns.
	*/
	isViolationSuppressed(relPath) {
		const effectiveRel = path.isAbsolute(relPath) ? path.relative(this.projectRoot, relPath) : relPath;
		if (isLockedSkillPath(effectiveRel, this.projectRoot)) return true;
		if (this.isPathExempt(effectiveRel)) return true;
		const norm = toPosixRelative(this.projectRoot, effectiveRel);
		for (const pattern of this.extraIgnorePatterns) if (matchesSinglePattern(norm, pattern)) return true;
		const config = getAuditConfig(this.projectRoot);
		const userGlobs = config?.paths?.ignoreGlobs ?? [];
		const userPatterns = config?.paths?.ignoredPatterns ?? [];
		for (const pattern of [...userGlobs, ...userPatterns]) if (matchesSinglePattern(norm, pattern)) return true;
		const userIgnoredDirs = config?.paths?.ignoredDirs ?? [];
		if (userIgnoredDirs.length > 0) {
			const segments = norm.toLowerCase().split("/");
			for (const d of userIgnoredDirs) {
				const cleanD = toPosixRelative(this.projectRoot, d).toLowerCase();
				if (cleanD && (segments.includes(cleanD) || segments.some((s) => s === cleanD))) return true;
			}
		}
		return false;
	}
	getLineNumber(content, charIndex) {
		return content.slice(0, charIndex).split("\n").length;
	}
	getLineAt(content, lineIndex) {
		return content.split("\n")[lineIndex - 1] ?? "";
	}
	scanRegexMatches(content, regex, relPath, ruleId, escapeHatches, message, filter, sourceForLines = content, charOffset = 0) {
		const start = performance.now();
		try {
			let match;
			const re = new RegExp(regex.source, regex.flags);
			this.markRuleEvaluated(ruleId);
			while ((match = re.exec(content)) !== null) {
				const line = this.getLineNumber(sourceForLines, charOffset + match.index);
				const lineContent = this.getLineAt(sourceForLines, line);
				if (filter && !filter(lineContent, match)) continue;
				const prevLine = line > 1 ? this.getLineAt(sourceForLines, line - 1) : "";
				const nextLine = this.getLineAt(sourceForLines, line + 1);
				if (this.hasEscapeHatch(lineContent, escapeHatches) || this.hasEscapeHatch(prevLine, escapeHatches) || this.hasEscapeHatch(nextLine, escapeHatches)) continue;
				this.addViolation({
					ruleId,
					severity: "error",
					file: relPath,
					line,
					message,
					context: lineContent.trim()
				});
			}
		} finally {
			this.recordRuleDuration(ruleId, performance.now() - start);
		}
	}
	async execute(astContext) {
		await loadAuditConfig(this.projectRoot);
		await this.context.checkFiles();
		for (const rf of this.requiredFiles) {
			const abs = path.isAbsolute(rf) ? rf : path.resolve(this.projectRoot, rf);
			try {
				if (fs.existsSync(abs) && !fs.statSync(abs).isDirectory()) this.recordScanned(toPosixRelative(this.projectRoot, rf));
			} catch {}
		}
		let effectiveAst = astContext;
		if (!effectiveAst && this.requiresAst) {
			const { SharedAstContext } = await import("./astContext.js");
			effectiveAst = new SharedAstContext();
		}
		const auditExecutionStart = performance.now();
		await this.runAudit(effectiveAst);
		this.auditExecutionDurationMs = Math.max(0, performance.now() - auditExecutionStart);
		if (this.ruleIds.length === 1) {
			const singleRuleId = this.ruleIds[0];
			if (!this.durationsByRule.has(singleRuleId)) this.durationsByRule.set(singleRuleId, this.auditExecutionDurationMs);
		}
		this.context.setMetric("Files Scanned", this.filesScannedCount);
		for (const [ruleId, count] of this.countsByRule.entries()) this.context.setMetric(`Rule: ${ruleId}`, count);
		return this.finishAudit();
	}
	async finishAudit() {
		await this.persistCoverageLedger();
		if (this.isSkipped) {
			const skipMessage = this.skipReason || "Omitido";
			this.context.logProgress(`⏭️  ${skipMessage}`);
			this.context.setMetric("Estado", "OMITIDO ⏭️");
			if (this.skipReason) this.context.setMetric("Skip-Reason", this.skipReason);
			return this.context.finish({ "Files Scanned": 0 }, {
				status: "skipped",
				icon: this.icon,
				subAuditors: [{
					id: `${this.id}_skipped`,
					name: skipMessage,
					status: "passed",
					count: 0,
					detail: "skipped",
					speed: "light"
				}]
			});
		}
		this.ensureSubAuditorsLogged();
		return this.context.finish({ "Files Scanned": this.filesScannedCount }, {
			icon: this.icon,
			subAuditors: this.subAuditorReports.length > 0 ? [...this.subAuditorReports] : void 0
		});
	}
	ensureSubAuditorsLogged() {
		if (this.subAuditorReports.length > 0) return;
		const subAuditors = this.getSubAuditors();
		const totalSteps = Math.max(1, subAuditors.length);
		for (let i = 0; i < subAuditors.length; i++) {
			const sub = subAuditors[i];
			const count = this.countsByRule.get(sub.id) ?? 0;
			const errorsCount = this.errorsByRule.get(sub.id) ?? 0;
			const warningsCount = this.warningsByRule.get(sub.id) ?? 0;
			let durationMs = this.durationsByRule.get(sub.id);
			if (durationMs === void 0 && this.ruleIds.length === 1 && this.auditExecutionDurationMs !== void 0) durationMs = this.auditExecutionDurationMs;
			const empiricalDurationMs = durationMs ?? 0;
			const formattedDuration = formatDurationMs(empiricalDurationMs);
			const ruleCap = this.ruleCapabilities[sub.id];
			if (!ruleCap || !ruleCap.speed) throw new Error(`[${this.id}] Missing rule capability or undefined 'speed' for sub-auditor '${sub.id}'. All sub-auditors and rules must strictly declare their execution speed contract.`);
			const speed = this.resolveRuleEffectiveSpeed(sub.id) ?? normalizeSpeeds(ruleCap.speed)[0] ?? "light";
			this.logSubAudit(i + 1, totalSteps, sub.name, count, formattedDuration, {
				errors: errorsCount,
				warnings: warningsCount
			}, empiricalDurationMs, speed);
		}
	}
	importAuditFindings(findings, fallbackRuleId, fallbackContext = this.id) {
		for (const f of findings) this.addViolation({
			ruleId: f.ruleId || fallbackRuleId,
			severity: f.severity === "warning" ? "warning" : "error",
			file: f.file || "",
			line: f.line || 1,
			context: f.context || fallbackContext,
			message: f.message,
			fixable: f.fixable
		});
	}
	setStepLogger(logger) {
		this.context.setStepLogger?.(logger);
	}
	setProgressLogger(logger) {
		this.context.setProgressLogger?.(logger);
	}
	/**
	* Generates the canonical AuditorManifestDTO for clean and typed introspection,
	* allowing external tools and AI agents to dynamically inspect capabilities and rules.
	*/
	toManifest() {
		const rulesRecord = {};
		if (this.ruleDescriptions) {
			for (const [k, v] of Object.entries(this.ruleDescriptions)) if (typeof v === "string") rulesRecord[k] = v;
		}
		return {
			id: this.id,
			name: this.name,
			family: this.family,
			icon: this.icon,
			description: this.description,
			capabilities: {
				speed: Array.isArray(this.capabilities.speed) ? [...this.capabilities.speed] : this.capabilities.speed,
				phase: this.capabilities.phase,
				fix: this.capabilities.fix,
				md: this.capabilities.md,
				ast: this.capabilities.ast,
				changedOnly: this.capabilities.changedOnly,
				critical: this.capabilities.critical
			},
			rules: rulesRecord,
			remediations: this.ruleRemediations ? { ...this.ruleRemediations } : void 0,
			remediationPhases: this.ruleRemediationPhases ? { ...this.ruleRemediationPhases } : void 0,
			fixableRules: this.getFixableRuleIds().map((r) => String(r)),
			configKey: this.configKey,
			defaultConfig: { ...this.defaultConfig },
			criticalConfig: {
				...this.criticalConfig.rationale ? { rationale: this.criticalConfig.rationale } : {},
				...this.criticalConfig.requiredMinimums ? { requiredMinimums: this.criticalConfig.requiredMinimums } : {},
				...this.criticalConfig.forbiddenOverrides ? { forbiddenOverrides: this.criticalConfig.forbiddenOverrides } : {}
			},
			usesThirdPartyTool: this.usesThirdPartyTool,
			thirdPartyToolPolicy: this.thirdPartyToolPolicy ? { ...this.thirdPartyToolPolicy } : void 0,
			scripts: [...this.scripts]
		};
	}
	/**
	* Scans a collection of files in a single pass in memory (RAM).
	* Reads each file from disk exactly once, splits into lines, and evaluates each
	* declared rule handler while automatically measuring empirical rule durations.
	*/
	async scanFilesSinglePass(files, handlers) {
		if (files.length === 0 || handlers.length === 0) return;
		const exempts = this.exemptPaths;
		for (const file of files) {
			const relPath = path.isAbsolute(file) ? path.relative(this.projectRoot, file).split(path.sep).join(path.posix.sep) : file.split(path.sep).join(path.posix.sep);
			if (isPathExempt(relPath, exempts)) continue;
			let content;
			try {
				content = fs.readFileSync(file, "utf-8");
			} catch {
				this.unrecordScanned(relPath);
				continue;
			}
			const lines = content.split("\n");
			const doc = new AuditedDocument(file, content, relPath);
			for (const handler of handlers) {
				const start = performance.now();
				try {
					const res = handler.scan(file, content, lines, doc);
					if (res instanceof Promise) await res;
				} finally {
					this.recordRuleDuration(handler.ruleId, performance.now() - start);
				}
			}
			this.recordScanned(relPath);
		}
	}
	static isExecutingCli = false;
	static async runCli(auditor) {
		if (BaseAuditor.isExecutingCli) return;
		BaseAuditor.isExecutingCli = true;
		try {
			const result = await auditor.execute();
			process.exit(result.summary.errors > 0 ? 1 : 0);
		} finally {
			BaseAuditor.isExecutingCli = false;
		}
	}
	static async runCliIfMain(metaUrl, auditor) {
		if (isMainModule(metaUrl)) setImmediate(async () => {
			await BaseAuditor.runCli(auditor);
		});
	}
};
/**
* Specialized File-Scanning Auditor.
* Automates recursive file discovery, ignore filtering, reading, and line-by-line scanning dispatch.
*/
var FileScanAuditor = class extends BaseAuditor {
	declaredFileSubAuditors = /* @__PURE__ */ new Map();
	/**
	* Primary file scanning entry point receiving an immutable AuditedDocument.
	* Automatically executes declared file sub-auditors measuring their runtimes
	* before delegating to scanFile(relPath, content, sourceFile, doc).
	*/
	scanDocument(doc) {
		if (isPathExempt(doc.relPath, this.exemptPaths)) return;
		const pending = [];
		for (const [ruleId, handler] of this.declaredFileSubAuditors.entries()) {
			this.markRuleEvaluated(ruleId);
			const start = performance.now();
			try {
				const res = handler(doc);
				if (res instanceof Promise) pending.push(res.finally(() => {
					this.recordRuleDuration(ruleId, performance.now() - start);
				}));
				else this.recordRuleDuration(ruleId, performance.now() - start);
			} catch (err) {
				this.recordRuleDuration(ruleId, performance.now() - start);
				throw err;
			}
		}
		const singleRuleId = this.declaredFileSubAuditors.size === 0 && this.ruleIds.length === 1 ? this.ruleIds[0] : void 0;
		const startScan = singleRuleId ? performance.now() : 0;
		const scanFileRes = this.scanFile(doc.relPath, doc.rawContent, this.requiresAst ? doc.getAst() : void 0, doc);
		if (singleRuleId) {
			if (scanFileRes instanceof Promise) pending.push(scanFileRes.finally(() => {
				this.recordRuleDuration(singleRuleId, performance.now() - startScan);
			}));
			else this.recordRuleDuration(singleRuleId, performance.now() - startScan);
		} else if (scanFileRes instanceof Promise) pending.push(scanFileRes);
		if (pending.length > 0) return Promise.all(pending).then(() => {});
	}
	/**
	* Helper for in-memory testing of file scanning logic without touching the filesystem.
	*/
	testScanFile(relPath, content, _sourceFile) {
		const doc = new AuditedDocument(path.resolve(this.projectRoot, relPath), content, relPath);
		const prevTotalEvals = this.getRuleCatalog().reduce((acc, r) => acc + this.getEvaluations(r), 0);
		const finishScan = () => {
			this.recordScanned(relPath);
			if (this.getRuleCatalog().reduce((acc, r) => acc + this.getEvaluations(r), 0) === prevTotalEvals) for (const ruleId of this.getRuleCatalog()) this.markRuleEvaluated(ruleId);
		};
		const res = this.scanDocument(doc);
		if (res instanceof Promise) return res.then(finishScan);
		finishScan();
	}
	/**
	* Declares a file-scoped sub-auditor tied to a declared rule.
	* The superclass executes the handler for each audited file and empirically accumulates duration.
	*/
	declareFileSubAuditor(ruleId, handler) {
		if (!this.ruleIds.includes(ruleId)) throw new Error(`[Auditor Contract Violation] Auditor [${this.id}] attempted to declare file sub-auditor for '${ruleId}', but that rule is not registered in 'ruleIds'.`);
		this.declaredFileSubAuditors.set(ruleId, handler);
	}
	/**
	* Declares a regex pattern sub-auditor tied to a declared rule.
	* Scans safe patterns skipping comments and strings automatically.
	*/
	declarePatternSubAuditor(ruleId, options) {
		this.declareFileSubAuditor(ruleId, (doc) => {
			this.scanSafePattern(doc, {
				ruleId,
				regex: options.regex,
				message: options.message,
				severity: options.severity,
				skipComments: options.skipComments,
				skipStrings: options.skipStrings,
				fixable: options.fixable
			}, options.onMatch);
		});
	}
	/**
	* Overridable file scanning method for sub-auditors.
	*/
	scanFile(_relPath, _content, _sourceFile, _doc) {}
	constructor(options) {
		super(options.coverage || options.roots !== void 0 ? options : {
			...options,
			roots: getEffectiveScannableRoots()
		});
	}
	/**
	* Determines whether a given project-relative path is scannable by this file-scan auditor.
	*/
	isPathScannable(relPath) {
		return super.isPathScannable(relPath);
	}
	/**
	* Checks whether the given relative path is exempt according to suite options.
	*/
	isCurrentPathExempt(relPath) {
		return this.isPathExempt(relPath);
	}
	/**
	* Adds a violation calculating 1-indexed line and column numbers from a string offset.
	*/
	addViolationAtMatch(params) {
		const pos = params.doc ? params.doc.getLineAndColumn(params.matchIndex) : (() => {
			const preceding = params.content.slice(0, params.matchIndex);
			return {
				line: preceding.split("\n").length,
				column: (preceding.split("\n").pop()?.length ?? 0) + 1,
				lineText: params.context ?? ""
			};
		})();
		this.addViolation({
			ruleId: params.ruleId,
			severity: params.severity ?? "error",
			filePath: params.filePath,
			line: pos.line,
			column: pos.column,
			message: params.message,
			context: params.context ?? pos.lineText.trim(),
			fixable: params.fixable
		});
	}
	/**
	* High-level pattern scanner that skips comments and strings automatically
	* and verifies escape hatches before registering violations.
	*/
	scanSafePattern(doc, options, onMatch) {
		const start = performance.now();
		try {
			const skipComments = options.skipComments ?? true;
			const skipStrings = options.skipStrings ?? true;
			const regex = new RegExp(options.regex.source, options.regex.flags.includes("g") ? options.regex.flags : options.regex.flags + "g");
			let m;
			while ((m = regex.exec(doc.rawContent)) !== null) {
				const matchIdx = m.index;
				if (skipComments && doc.isInsideComment(matchIdx)) continue;
				if (skipStrings && doc.isInsideString(matchIdx)) continue;
				const pos = doc.getLineAndColumn(matchIdx);
				if (doc.hasEscapeHatch(pos.line, options.ruleId)) continue;
				if (onMatch) {
					if (onMatch(m, pos) === false) continue;
				}
				const msg = typeof options.message === "function" ? options.message(m, pos) : options.message;
				this.addViolation({
					ruleId: options.ruleId,
					filePath: doc.relPath,
					line: pos.line,
					column: pos.column,
					message: msg,
					severity: options.severity ?? "error",
					context: pos.lineText.trim(),
					fixable: options.fixable
				});
			}
		} finally {
			this.recordRuleDuration(options.ruleId, performance.now() - start);
		}
	}
	/**
	* Superclass pattern scanner that executes a regex search over content or file lines,
	* skips comments, evaluates filters, records violations, and automatically measures
	* and records the empirical rule duration in the superclass.
	*/
	scanPattern(content, lines, file, regex, ruleId, filter, message, severity = "error") {
		const start = performance.now();
		try {
			regex.lastIndex = 0;
			let match;
			while ((match = regex.exec(content)) !== null) {
				const matchIndex = match.index;
				const before = content.slice(0, matchIndex);
				const lineNum = (before.match(/\n/g) ?? []).length + 1;
				const col = matchIndex - before.lastIndexOf("\n");
				const line = lines[lineNum - 1] ?? "";
				const trimmed = line.trim();
				if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
				if (filter && !filter(match, line)) continue;
				const msg = typeof message === "function" ? message(match, line) : message ?? `Violación de regla ${ruleId}`;
				this.addViolation({
					ruleId,
					severity,
					file,
					line: lineNum,
					column: col,
					message: msg,
					context: match[0].trim()
				});
			}
		} finally {
			this.recordRuleDuration(ruleId, performance.now() - start);
		}
	}
	async resolveEffectiveAst(astContext) {
		if (astContext || !this.requiresAst) return astContext;
		const { SharedAstContext } = await import("./astContext.js");
		return new SharedAstContext();
	}
	async scanSingleDiscoveredFile(file, effectiveAst, catalog) {
		const relPath = path.relative(this.projectRoot, file).split(path.sep).join(path.posix.sep);
		let content;
		try {
			content = fs.readFileSync(file, "utf-8");
		} catch {
			this.unrecordScanned(relPath);
			return;
		}
		const doc = new AuditedDocument(file, content, relPath, effectiveAst);
		const prevTotalEvals = catalog.reduce((acc, r) => acc + this.getEvaluations(r), 0);
		await this.scanDocument(doc);
		if (this.isFixActive() && doc.hasFixes()) doc.applyFixesToFile();
		this.recordScanned(relPath);
		if (catalog.reduce((acc, r) => acc + this.getEvaluations(r), 0) === prevTotalEvals) for (const ruleId of catalog) this.markRuleEvaluated(ruleId);
	}
	async runAudit(astContext) {
		const files = this.context.collectFiles(this.roots, this.allowedExtensions);
		const effectiveAst = await this.resolveEffectiveAst(astContext);
		const catalog = this.getRuleCatalog();
		if (files.length === 0) {
			for (const ruleId of catalog) this.runSubAuditorSync(ruleId, () => {
				this.markRuleNotApplicable(ruleId, "No matching files found in scanned roots");
			});
			this.ensureSubAuditorsLogged();
			return;
		}
		for (const file of files) await this.scanSingleDiscoveredFile(file, effectiveAst, catalog);
	}
};
//#endregion
export { ALWAYS_IGNORE_DIRS, AST_RULE_CAPABILITIES, AuditedDocument, BaseAuditor, CANONICAL_IGNORE_DIRS, CANONICAL_SCANNABLE_ROOTS, CODE_ONLY_IGNORE_DIRS, DEFAULT_AUDITOR_CAPABILITIES, FileScanAuditor, LIGHT_RULE_CAPABILITIES, MANDATORY_AUDITOR_CAPABILITY_KEYS, MANDATORY_BOOLEAN_CAPABILITY_KEYS, MAX_AUDITOR_DESCRIPTION_LENGTH, MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH, REMEDIATION_PHASE_IDS, SCANNABLE_EXTENSIONS, SKILLS_LOCK_CANDIDATE_PATHS, assertSafePathComponent, clearLockedSkillsCache, clearWorkspaceFileCache, collectRepositoryFiles, createRuleCapabilities, createUniformRemediationPhases, createUniformRuleCapabilities, deriveCanonicalAuditorScript, deriveSuiteCapabilities, getEffectiveIgnoreDirs, getEffectiveScannableRoots, getEffectiveUnignoreDirs, isLockedSkillPath, isPathExempt, isPathIgnored, loadLockedSkills, matchesSinglePattern, normalizeSpeeds, resolveEffectiveSpeed, resolveFileScanRoots, resolveSubsystemConfig, setupAuditor };
