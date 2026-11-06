import { discoverAuditors } from "../cli/auditScanner.js";
import { getAuditConfig } from "./auditConfigLoader.js";
import "./auditConfig.js";
import { AUDIT_EXECUTION_PHASES, AUDIT_EXECUTION_SPEEDS, AUDIT_FIX_CAPABILITIES, collectAuditorThirdPartyToolErrors, getActiveFamilies } from "./auditContract.js";
import { BaseAuditor } from "./auditorBase.js";
import { toPosixRelative } from "./safePath.js";
import { safeRmSync, tryOrNull } from "./safeUtils.js";
import path from "node:path";
import fs from "node:fs";
// src/core/auditorContractConformance.ts
/**
* src/core/auditorContractConformance.ts
*
* DYNAMIC AUDITOR CONTRACT & TESTING CONFORMANCE ENGINE (Node.js 26+ Native)
* Automatically discovers all sub-auditors across core suites and extensions,
* validating live BaseAuditor instantiation, metadata integrity, and the strict
* 5-point test contract (Construction, Clean Path, Violation Path, Warnings, and 100% Rule Coverage).
*/
const DEFAULT_EXTENSION_TASK_TIMEOUT_MS = 0;
const DEFAULT_EXTENSION_TASK_ORDER = 99;
const MAX_TASK_DESCRIPTION_LENGTH = 60;
function isEligibleExtensionAuditorFile(name) {
	if (!name.endsWith(".ts") || name.startsWith("_")) return false;
	if (name.includes(".test.") || name.includes(".spec.")) return false;
	if (name.startsWith("report_") || name === "audit_rules.ts" || name.endsWith("Plugin.ts") || name.endsWith("Plugin.js")) return false;
	return true;
}
function registerExtensionAuditor(fullPath, entryName, projectRoot, tasks) {
	if (!isEligibleExtensionAuditorFile(entryName)) return;
	const id = path.basename(entryName, ".ts");
	if (tasks.some((t) => t.id === id)) return;
	tasks.push({
		id,
		name: id,
		family: "architecture",
		scriptPath: toPosixRelative(projectRoot, fullPath),
		command: "node",
		args: [],
		fast: true,
		timeoutMs: DEFAULT_EXTENSION_TASK_TIMEOUT_MS,
		order: DEFAULT_EXTENSION_TASK_ORDER,
		isBuiltin: false,
		isExtension: true,
		configKey: "paths",
		defaultConfig: {},
		criticalConfig: {}
	});
}
function processExtensionDir(currentDir, projectRoot, queue, tasks) {
	const entries = fs.readdirSync(currentDir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(currentDir, entry.name);
		if (entry.isDirectory()) {
			if (!entry.name.startsWith("_") && entry.name !== "node_modules") queue.push(fullPath);
		} else if (entry.isFile()) registerExtensionAuditor(fullPath, entry.name, projectRoot, tasks);
	}
}
function scanExtensionAuditors(projectRoot, tasks) {
	const scriptsAuditorsDir = path.join(projectRoot, "scripts/auditors");
	if (!fs.existsSync(scriptsAuditorsDir)) return;
	const queue = [scriptsAuditorsDir];
	while (queue.length > 0) processExtensionDir(queue.shift(), projectRoot, queue, tasks);
}
/**
* Discovers all auditor tasks: core suites in src/suites/ plus extensions in scripts/auditors and config.extensions.
*/
async function scanAllAuditorTasks(projectRoot = process.cwd()) {
	const tasks = [];
	const candidateSuitesDirs = [path.join(projectRoot, "src/suites"), path.join(projectRoot, "packages/auditor/src/suites")];
	for (const suitesDir of candidateSuitesDirs) if (fs.existsSync(suitesDir)) {
		const builtinTasks = await discoverAuditors({
			baseDir: suitesDir,
			withBuild: true
		});
		for (const t of builtinTasks) tasks.push({
			...t,
			isExtension: false
		});
	}
	scanExtensionAuditors(projectRoot, tasks);
	const config = getAuditConfig(projectRoot);
	if (config.extensions && config.extensions.length > 0) for (const ext of config.extensions) registerExtensionAuditor(path.resolve(projectRoot, ext), path.basename(ext), projectRoot, tasks);
	return tasks;
}
/**
* Finds the exported BaseAuditor subclass in a loaded module.
*/
function findAuditorClass(mod) {
	for (const value of Object.values(mod)) if (typeof value === "function" && value.prototype && value.prototype instanceof BaseAuditor) return value;
	return null;
}
/**
* Safely instantiates an auditor class using canonical constructor signatures.
* Mandate: Prohibits legacy positional arguments; strictly expects { projectRoot: tempDir } or ().
*/
function instantiateAuditorClass(Cls, tempDir) {
	const attempts = [() => new Cls({ projectRoot: tempDir }), () => new Cls()];
	for (const attempt of attempts) {
		const instance = tryOrNull(attempt);
		if (instance && path.resolve(instance.projectRoot) === path.resolve(tempDir)) return instance;
	}
	for (const attempt of attempts) {
		const instance = tryOrNull(attempt);
		if (instance) return instance;
	}
	throw new Error(`[Auditor Contract Violation] Could not instantiate class ${Cls.name}. It must support the canonical options signature ({ projectRoot?: string }) or default no-argument constructor.`);
}
function validateBasicMetadata(auditor, taskId, errors) {
	if (!auditor.id || typeof auditor.id !== "string") errors.push(`Auditor [${taskId}] does not define a valid 'id'.`);
	else if (auditor.id !== taskId) errors.push(`Auditor [${taskId}] id '${auditor.id}' does not match taskId '${taskId}'.`);
	if (!auditor.name || typeof auditor.name !== "string") errors.push(`Auditor [${taskId}] does not define a valid 'name'.`);
	if (!auditor.description || typeof auditor.description !== "string") errors.push(`Auditor [${taskId}] does not define a valid 'description'.`);
	else if (auditor.description.length > MAX_TASK_DESCRIPTION_LENGTH) errors.push(`Auditor [${taskId}] description ('${auditor.description}') exceeds ${MAX_TASK_DESCRIPTION_LENGTH} characters (${auditor.description.length}).`);
	if (!auditor.packageName || typeof auditor.packageName !== "string") errors.push(`Auditor [${taskId}] does not define mandatory 'packageName'.`);
}
function validateAuditorManifest(auditor, taskId, errors) {
	try {
		const manifest = auditor.toManifest();
		if (typeof manifest.id !== "string" || manifest.id !== auditor.id) errors.push(`Auditor [${taskId}] toManifest() returned manifest with invalid ID.`);
	} catch (err) {
		errors.push(`Auditor [${taskId}] failed to generate toManifest(): ${String(err)}`);
	}
}
/**
* Validates in-memory constructor contract and metadata for an instantiated auditor.
*/
function validateAuditorConstruction(auditor, taskId = auditor.id) {
	const errors = [];
	validateBasicMetadata(auditor, taskId, errors);
	if (!getActiveFamilies().includes(auditor.family)) errors.push(`Auditor [${taskId}] family '${auditor.family}' is not a valid architectural family.`);
	if (!Array.isArray(auditor.ruleIds) || auditor.ruleIds.length === 0) errors.push(`Auditor [${taskId}] does not declare rules in 'ruleIds'.`);
	validateRuleDescriptions(auditor, taskId, errors);
	validateAuditorManifest(auditor, taskId, errors);
	validateAuditorConfigContract(auditor, taskId, errors);
	validateAuditorCriticalConfigContract(auditor, taskId, errors);
	validateAuditorCapabilitiesContract(auditor, taskId, errors);
	validateAuditorRuleCapabilitiesContract(auditor, taskId, errors);
	validateAuditorRuleRemediationsContract(auditor, taskId, errors);
	validateAuditorThirdPartyToolContract(auditor, taskId, errors);
	validateAuditorScriptsContract(auditor, taskId, errors);
	return errors;
}
function validateAuditorThirdPartyToolContract(auditor, taskId, errors) {
	const contractErrors = collectAuditorThirdPartyToolErrors(auditor, taskId);
	errors.push(...contractErrors);
}
function validateAuditorRuleRemediationsContract(auditor, taskId, errors) {
	if (!auditor.ruleRemediations || typeof auditor.ruleRemediations !== "object") {
		errors.push(`Auditor [${taskId}] does not define mandatory map 'ruleRemediations'.`);
		return;
	}
	for (const ruleId of auditor.ruleIds) {
		const guide = auditor.getRuleRemediation(ruleId);
		if (!guide || typeof guide !== "string" || guide.trim() === "") errors.push(`Auditor [${taskId}] does not define mandatory 'ruleRemediations' for rule '${ruleId}'.`);
		else if (/^Guía de diagnóstico y remediación para/i.test(guide.trim())) errors.push(`Auditor [${taskId}] defines a placeholder remediation guide for rule '${ruleId}'. Must provide actionable diagnosis and remediation.`);
	}
}
function validateSpeedValue(speed) {
	if (typeof speed === "string") return AUDIT_EXECUTION_SPEEDS.some((s) => s === speed);
	if (Array.isArray(speed)) return speed.length > 0 && speed.every((s) => typeof s === "string" && AUDIT_EXECUTION_SPEEDS.some((v) => v === s));
	return false;
}
function validateSixFieldCapabilities(caps, label, errors) {
	if (!validateSpeedValue(caps.speed)) errors.push(`${label}.speed must be ${AUDIT_EXECUTION_SPEEDS.join(", ")} or a non-empty array of them.`);
	if (!AUDIT_EXECUTION_PHASES.some((p) => p === caps.phase)) errors.push(`${label}.phase must be ${AUDIT_EXECUTION_PHASES.join(", ")}.`);
	if (!AUDIT_FIX_CAPABILITIES.some((f) => f === caps.fix)) errors.push(`${label}.fix must be ${AUDIT_FIX_CAPABILITIES.join(", ")}.`);
	for (const boolKey of [
		"md",
		"ast",
		"changedOnly",
		"critical"
	]) if (typeof caps[boolKey] !== "boolean") errors.push(`${label}.${boolKey} must be explicitly boolean (true or false).`);
}
function validateAuditorRuleCapabilitiesContract(auditor, taskId, errors) {
	if (!auditor.ruleCapabilities || typeof auditor.ruleCapabilities !== "object") {
		errors.push(`Auditor [${taskId}] does not define mandatory map 'ruleCapabilities' per sub-auditor.`);
		return;
	}
	for (const ruleId of auditor.ruleIds) {
		const caps = auditor.ruleCapabilities[ruleId];
		if (!caps || typeof caps !== "object") {
			errors.push(`Auditor [${taskId}] does not define 'ruleCapabilities' for declared rule '${ruleId}'.`);
			continue;
		}
		validateSixFieldCapabilities(caps, `Auditor [${taskId}] sub-auditor '${ruleId}' ruleCapabilities.${ruleId}`, errors);
	}
}
function validateAuditorCriticalConfigContract(auditor, taskId, errors) {
	if (auditor.criticalConfig === void 0) {
		errors.push(`Auditor [${taskId}] does not define mandatory 'criticalConfig' in constructor.`);
		return;
	}
	if (typeof auditor.criticalConfig !== "object" || auditor.criticalConfig === null) {
		errors.push(`Auditor [${taskId}] defines invalid 'criticalConfig' (must be an object).`);
		return;
	}
	const { rationale, requiredMinimums, forbiddenOverrides, validate } = auditor.criticalConfig;
	if ((requiredMinimums !== void 0 && Object.keys(requiredMinimums).length > 0 || forbiddenOverrides !== void 0 && Object.keys(forbiddenOverrides).length > 0 || typeof validate === "function") && (!rationale || typeof rationale !== "string" || rationale.trim() === "")) errors.push(`Auditor [${taskId}] criticalConfig must define a non-empty 'rationale' when declaring critical constraints.`);
}
function validateAuditorConfigContract(auditor, taskId, errors) {
	if (!auditor.configKey || typeof auditor.configKey !== "string") errors.push(`Auditor [${taskId}] does not define mandatory 'configKey'.`);
	if (!auditor.defaultConfig || typeof auditor.defaultConfig !== "object") errors.push(`Auditor [${taskId}] does not define mandatory 'defaultConfig'.`);
	else if (auditor.configKey !== "paths" && auditor.configKey !== "core") {
		if (typeof auditor.defaultConfig.enabled !== "boolean") errors.push(`Auditor [${taskId}] defaultConfig.enabled must be explicitly boolean (true or false).`);
	}
}
function validateAuditorCapabilitiesContract(auditor, taskId, errors) {
	if (!auditor.capabilities || typeof auditor.capabilities !== "object") {
		errors.push(`Auditor [${taskId}] does not define mandatory 'capabilities' object.`);
		return;
	}
	validateSixFieldCapabilities(auditor.capabilities, `Auditor [${taskId}] capabilities`, errors);
	const fixableRules = auditor.getFixableRuleIds();
	if (auditor.capabilities.fix !== "none") {
		if (fixableRules.length === 0) errors.push(`Auditor [${taskId}] declares capabilities.fix !== 'none' but getFixableRuleIds() is empty.`);
		for (const r of fixableRules) if (!auditor.ruleIds.includes(r)) errors.push(`Auditor [${taskId}] declares fixable rule '${r}' that does not exist in 'ruleIds'.`);
	} else if (fixableRules.length > 0) errors.push(`Auditor [${taskId}] declares fixable rules (${fixableRules.join(", ")}) but capabilities.fix is 'none'.`);
}
function validateAuditorScriptsContract(auditor, taskId, errors) {
	if (!Array.isArray(auditor.scripts) || auditor.scripts.length === 0) {
		errors.push(`Auditor [${taskId}] does not define mandatory execution command contract in 'scripts'.`);
		return;
	}
	for (const s of auditor.scripts) if (!s.name || !s.command || !s.description) errors.push(`Auditor [${taskId}] defines invalid script in 'scripts' (missing mandatory name, command, or description).`);
}
function validateRuleDescriptions(auditor, taskId, errors) {
	if (!auditor.ruleDescriptions || typeof auditor.ruleDescriptions !== "object") {
		errors.push(`Auditor [${taskId}] does not define map 'ruleDescriptions'.`);
		return;
	}
	for (const rule of auditor.ruleIds) {
		const desc = auditor.ruleDescriptions[rule];
		if (!desc) errors.push(`Auditor [${taskId}] missing description in ruleDescriptions for rule '${rule}'.`);
		else {
			if (desc.includes("\n") || desc.includes("\r")) errors.push(`Auditor [${taskId}] rule description for '${rule}' contains line breaks.`);
			const combined = `${auditor.packageName}: ${desc}`;
			if (combined.length > 50) errors.push(`Auditor [${taskId}] combined description '${combined}' exceeds 50 characters (${combined.length}).`);
		}
	}
}
/**
* Finds dedicated test file(s) for an auditor across core and extension conventions.
*/
function findDedicatedTestFile(projectRoot, taskId, testRoots = ["tests"]) {
	const candidateRelPaths = [];
	for (const tr of testRoots) {
		const cleanTr = toPosixRelative(projectRoot, tr);
		candidateRelPaths.push(path.posix.join(cleanTr, `${taskId}.test.ts`));
		candidateRelPaths.push(path.posix.join(cleanTr, "node", "auditors", `${taskId}.test.ts`));
		candidateRelPaths.push(path.posix.join(cleanTr, "unit", "auditors", `${taskId}.test.ts`));
		candidateRelPaths.push(path.posix.join(cleanTr, "auditors", `${taskId}.test.ts`));
	}
	candidateRelPaths.push(path.posix.join("packages", "auditor", "tests", `${taskId}.test.ts`));
	candidateRelPaths.push(path.posix.join("tests", `${taskId}.test.ts`));
	let testFileAbs = null;
	let testFileRel = candidateRelPaths[0];
	for (const rel of candidateRelPaths) {
		const abs = path.resolve(projectRoot, rel);
		if (fs.existsSync(abs)) {
			testFileAbs = abs;
			testFileRel = rel;
			break;
		}
	}
	const combinedSources = [];
	if (testFileAbs) {
		combinedSources.push(fs.readFileSync(testFileAbs, "utf-8"));
		const parentDir = path.dirname(testFileAbs);
		const siblings = tryOrNull(() => fs.readdirSync(parentDir)) ?? [];
		for (const sib of siblings) if (sib.startsWith(`${taskId}_`) && sib.endsWith(".test.ts")) combinedSources.push(fs.readFileSync(path.join(parentDir, sib), "utf-8"));
	}
	return {
		testFileAbs,
		testFileRel,
		allTestSources: combinedSources.join("\n")
	};
}
function checkConstructionVerification(testSource) {
	return testSource.includes("initializes with correct") || testSource.includes("Metadata") || testSource.includes("Rule Declarations") || testSource.includes("expect(auditor.id)") || testSource.includes("expect(auditor.packageName)") || testSource.includes("ruleDescriptions") || testSource.includes("auditor.family") || testSource.includes("auditor.ruleIds");
}
function checkCleanVerification(testSource) {
	return testSource.includes("errors).toBe(0)") || testSource.includes("errors).toEqual(0)") || testSource.includes("status).toBe('passed')") || testSource.includes("violations).toHaveLength(0)") || testSource.includes("summary.errors).toBe(0)") || testSource.includes("summary.errors === 0");
}
function checkViolationVerification(testSource) {
	return testSource.includes("status).toBe('failed')") || testSource.includes("severity).toBe('error')") || testSource.includes("severity: 'error'") || testSource.includes("summary.errors).toBeGreaterThan(") || testSource.includes("summary.errors).toBeGreaterThanOrEqual(") || testSource.includes("errors).toBeGreaterThan(") || testSource.includes("errors).toBeGreaterThanOrEqual(") || testSource.includes("errorsCount).toBeGreaterThan(") || testSource.includes("violations.length).toBeGreaterThan(") || testSource.includes("violations).not.toHaveLength(0)") || testSource.includes("errors).toBe(1)") || testSource.includes("errors).toEqual(1)") || testSource.includes("errors).toBe(2)") || testSource.includes("errors).toEqual(2)");
}
function checkFixVerification(testSource) {
	return testSource.includes(".fix(") || testSource.includes(".fix()") || testSource.includes("fix: true") || testSource.includes("fix = true") || testSource.includes("'--fix'") || testSource.includes("\"--fix\"") || testSource.includes("isFixMode") || testSource.includes("auditZIndexParity(") || testSource.includes("fixZIndexLiteral") || testSource.includes("autoFix") || testSource.includes("applyAutoFix");
}
/**
* Validates that an auditor's dedicated test file adheres to the strict 6-point contract.
*/
function validateAuditorTestFileContent(testSource, testFileRel, auditor) {
	const errors = [];
	if (!checkConstructionVerification(testSource)) errors.push(`Test file '${testFileRel}' does not verify construction or metadata for '${auditor.id}'.`);
	if (!checkCleanVerification(testSource)) errors.push(`Test file '${testFileRel}' does not verify clean execution path (zero errors / status passed) for '${auditor.id}'.`);
	if (!checkViolationVerification(testSource)) errors.push(`Test file '${testFileRel}' does not verify violation detection (status failed / severity error) for '${auditor.id}'.`);
	if (auditor.capabilities.fix !== "none" && !checkFixVerification(testSource)) errors.push(`Test file '${testFileRel}' does not verify auto-fix capability ('auditor.fix()') for '${auditor.id}'.`);
	for (const rule of auditor.ruleIds) {
		const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		if (!new RegExp(`(?:['"\`]${escaped}['"\`]|\\b${escaped}\\b)`).test(testSource)) errors.push(`Test file '${testFileRel}' does not verify declared rule '${rule}' for '${auditor.id}'.`);
	}
	return errors;
}
/**
* Universal Vitest runner registering dynamic conformance tests for all discovered sub-auditors and extensions.
*/
async function evaluateTaskContract(task, projectRoot, testRoots, tempDir) {
	const suitePath = path.isAbsolute(task.scriptPath) ? task.scriptPath : path.resolve(projectRoot, task.scriptPath);
	if (!fs.existsSync(suitePath)) return [`Auditor source code file not found at '${suitePath}'.`];
	let mod;
	try {
		mod = await import(suitePath);
	} catch (err) {
		return [`Error importing module '${suitePath}': ${String(err)}`];
	}
	const Cls = findAuditorClass(mod);
	if (!Cls) return [`Module '${suitePath}' does not export a valid BaseAuditor subclass.`];
	let auditor;
	try {
		auditor = instantiateAuditorClass(Cls, tempDir);
	} catch (err) {
		return [`Error instantiating '${task.id}': ${String(err)}`];
	}
	const constructionErrors = validateAuditorConstruction(auditor, task.id);
	const { testFileAbs, testFileRel, allTestSources } = findDedicatedTestFile(projectRoot, task.id, testRoots);
	if (!testFileAbs) return [...constructionErrors, `Missing dedicated test file for '${task.id}'. Expected '${testFileRel}'.`];
	const testFileErrors = validateAuditorTestFileContent(allTestSources ?? fs.readFileSync(testFileAbs, "utf-8"), testFileRel, auditor);
	return [...constructionErrors, ...testFileErrors];
}
function registerConformanceSuite(hooks, projectRoot) {
	const { describe: describeFn, it: itFn, expect: expectFn, beforeAll: beforeAllFn, afterAll: afterAllFn } = hooks;
	let tempDir;
	let tasks = [];
	beforeAllFn(async () => {
		process.env.AUDIT_SUBPROCESS = "true";
		tempDir = fs.mkdtempSync(path.join(path.resolve(projectRoot, "scratch"), "auditor-conformance-"));
		tasks = await scanAllAuditorTasks(projectRoot);
	});
	afterAllFn(() => {
		delete process.env.AUDIT_SUBPROCESS;
		safeRmSync(tempDir, {
			recursive: true,
			force: true
		});
	});
	describeFn("Auditor Contract & Testing Conformance", () => {
		itFn("discovers at least one auditor task to validate", () => {
			expectFn(tasks.length).toBeGreaterThan(0);
		});
		itFn("validates 100% of discovered sub-auditors and extensions against the strict 5-point contract", async () => {
			const allFailures = [];
			const testRoots = getAuditConfig(projectRoot).paths?.testRoots ?? ["tests"];
			for (const task of tasks) {
				const errors = await evaluateTaskContract(task, projectRoot, testRoots, tempDir);
				if (errors.length > 0) allFailures.push({
					taskId: task.id,
					errors
				});
			}
			if (allFailures.length > 0) {
				const failureSummary = allFailures.map((f) => `❌ Auditor [${f.taskId}]:\n  - ${f.errors.join("\n  - ")}`).join("\n\n");
				throw new Error(`Found ${allFailures.length} sub-auditor(s) that do not satisfy the strict testing contract:\n\n${failureSummary}`);
			}
			expectFn(allFailures).toHaveLength(0);
		});
	});
}
function resolveGlobalVitestHooks() {
	const g = globalThis;
	if (typeof g.describe === "function" && typeof g.it === "function" && typeof g.expect === "function" && typeof g.beforeAll === "function" && typeof g.afterAll === "function") return {
		describe: g.describe,
		it: g.it,
		expect: g.expect,
		beforeAll: g.beforeAll,
		afterAll: g.afterAll
	};
	return null;
}
/**
* Universal Vitest runner registering dynamic conformance tests for all discovered sub-auditors and extensions.
* Operates with zero top-level static Vitest runtime imports so consumer packages never crash when Vitest is absent.
*/
function runAuditorContractConformanceTests(options = {}) {
	const projectRoot = options.projectRoot ?? process.cwd();
	const syncHooks = options.vitest ?? resolveGlobalVitestHooks();
	if (syncHooks) {
		registerConformanceSuite(syncHooks, projectRoot);
		return;
	}
	return (async () => {
		try {
			const toConformanceHooks = (mod) => mod;
			registerConformanceSuite(toConformanceHooks(await import("vite-plus/test")), projectRoot);
		} catch {
			throw new Error("runAuditorContractConformanceTests() requires a Vite+ / Vitest test environment. Make sure to run your tests with Vite+ ('vp test') or supply test functions explicitly: runAuditorContractConformanceTests({ vitest: { describe, it, expect, beforeAll, afterAll } }).");
		}
	})();
}
export { checkCleanVerification, checkConstructionVerification, checkFixVerification, checkViolationVerification, findAuditorClass, findDedicatedTestFile, instantiateAuditorClass, isEligibleExtensionAuditorFile, runAuditorContractConformanceTests, scanAllAuditorTasks, scanExtensionAuditors, validateAuditorConstruction, validateAuditorTestFileContent };
