import { getAuditConfig } from "./auditConfigLoader.js";
import "./auditConfig.js";
import { AUDIT_EXECUTION_PHASES, AUDIT_EXECUTION_SPEEDS, AUDIT_FIX_CAPABILITIES, getActiveFamilies } from "./auditContract.js";
import { BaseAuditor } from "./auditorBase.js";
import { discoverAuditors } from "../cli/auditScanner.js";
import path from "node:path";
import fs from "node:fs";
//#region src/core/auditorContractConformance.ts
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
		scriptPath: path.relative(projectRoot, fullPath).replace(/\\/g, "/"),
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
* Safely instantiates an auditor class using supported constructor signatures.
*/
function instantiateAuditorClass(Cls, tempDir) {
	const attempts = [
		() => new Cls({ projectRoot: tempDir }),
		() => new Cls(tempDir),
		() => new Cls(void 0, tempDir),
		() => new Cls(void 0, void 0, tempDir),
		() => new Cls()
	];
	for (const attempt of attempts) try {
		return attempt();
	} catch {}
	throw new Error(`No se pudo instanciar la clase ${Cls.name} con ninguna firma conocida`);
}
function validateBasicMetadata(auditor, taskId, errors) {
	if (!auditor.id || typeof auditor.id !== "string") errors.push(`Auditor [${taskId}] no define un 'id' válido.`);
	else if (auditor.id !== taskId) errors.push(`Auditor [${taskId}] id '${auditor.id}' no coincide con el taskId '${taskId}'.`);
	if (!auditor.name || typeof auditor.name !== "string") errors.push(`Auditor [${taskId}] no define un 'name' válido.`);
	if (!auditor.description || typeof auditor.description !== "string") errors.push(`Auditor [${taskId}] no define una 'description' válida.`);
	else if (auditor.description.length > MAX_TASK_DESCRIPTION_LENGTH) errors.push(`Auditor [${taskId}] description ('${auditor.description}') excede ${MAX_TASK_DESCRIPTION_LENGTH} caracteres (${auditor.description.length}).`);
	if (!auditor.packageName || typeof auditor.packageName !== "string") errors.push(`Auditor [${taskId}] no define un 'packageName' obligatorio.`);
}
function validateAuditorManifest(auditor, taskId, errors) {
	try {
		const manifest = auditor.toManifest();
		if (typeof manifest.id !== "string" || manifest.id !== auditor.id) errors.push(`Auditor [${taskId}] toManifest() devuelve manifest con ID inválido.`);
	} catch (err) {
		errors.push(`Auditor [${taskId}] falló al generar toManifest(): ${String(err)}`);
	}
}
/**
* Validates in-memory constructor contract and metadata for an instantiated auditor.
*/
function validateAuditorConstruction(auditor, taskId = auditor.id) {
	const errors = [];
	validateBasicMetadata(auditor, taskId, errors);
	if (!getActiveFamilies().includes(auditor.family)) errors.push(`Auditor [${taskId}] familia '${auditor.family}' no es una familia arquitectónica válida.`);
	if (!Array.isArray(auditor.ruleIds) || auditor.ruleIds.length === 0) errors.push(`Auditor [${taskId}] no declara reglas en 'ruleIds'.`);
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
	if (typeof auditor.usesThirdPartyTool !== "boolean") {
		errors.push(`Auditor [${taskId}] no define 'usesThirdPartyTool' como un booleano obligatorio.`);
		return;
	}
	if (auditor.usesThirdPartyTool) {
		if (!auditor.thirdPartyToolPolicy || typeof auditor.thirdPartyToolPolicy !== "object") {
			errors.push(`Auditor [${taskId}] declaró usesThirdPartyTool: true pero omitió 'thirdPartyToolPolicy'.`);
			return;
		}
		const policy = auditor.thirdPartyToolPolicy;
		if (!policy.toolName || typeof policy.toolName !== "string" || policy.toolName.trim() === "") errors.push(`Auditor [${taskId}] 'thirdPartyToolPolicy.toolName' debe ser un string no vacío.`);
		if (policy.fallbackBehavior !== "throw" && policy.fallbackBehavior !== "violation") errors.push(`Auditor [${taskId}] 'thirdPartyToolPolicy.fallbackBehavior' debe ser 'throw' o 'violation'.`);
		if (policy.fallbackBehavior === "violation") {
			if (!policy.fallbackRuleId || typeof policy.fallbackRuleId !== "string") errors.push(`Auditor [${taskId}] declaró fallbackBehavior: 'violation' pero omitió 'fallbackRuleId'.`);
			else if (!auditor.ruleIds.includes(policy.fallbackRuleId)) errors.push(`Auditor [${taskId}] fallbackRuleId '${policy.fallbackRuleId}' no pertenece a 'ruleIds'.`);
		}
	} else if (auditor.thirdPartyToolPolicy !== void 0) errors.push(`Auditor [${taskId}] declaró usesThirdPartyTool: false pero proveyó 'thirdPartyToolPolicy'.`);
}
function validateAuditorRuleRemediationsContract(auditor, taskId, errors) {
	if (!auditor.ruleRemediations || typeof auditor.ruleRemediations !== "object") {
		errors.push(`Auditor [${taskId}] no define el mapa obligatorio de 'ruleRemediations'.`);
		return;
	}
	for (const ruleId of auditor.ruleIds) {
		const guide = auditor.getRuleRemediation(ruleId);
		if (!guide || typeof guide !== "string" || guide.trim() === "") errors.push(`Auditor [${taskId}] no define 'ruleRemediations' obligatoria para la regla '${ruleId}'.`);
		else if (/^Guía de diagnóstico y remediación para/i.test(guide.trim())) errors.push(`Auditor [${taskId}] define una guía placeholder para la regla '${ruleId}'. Debe proveer diagnóstico y solución accionables.`);
	}
}
function validateSpeedValue(speed) {
	if (typeof speed === "string") return AUDIT_EXECUTION_SPEEDS.some((s) => s === speed);
	if (Array.isArray(speed)) return speed.length > 0 && speed.every((s) => typeof s === "string" && AUDIT_EXECUTION_SPEEDS.some((v) => v === s));
	return false;
}
function validateSixFieldCapabilities(caps, label, errors) {
	if (!validateSpeedValue(caps.speed)) errors.push(`${label}.speed debe ser ${AUDIT_EXECUTION_SPEEDS.join(", ")} o un arreglo no vacío de ellos.`);
	if (!AUDIT_EXECUTION_PHASES.some((p) => p === caps.phase)) errors.push(`${label}.phase debe ser ${AUDIT_EXECUTION_PHASES.join(", ")}.`);
	if (!AUDIT_FIX_CAPABILITIES.some((f) => f === caps.fix)) errors.push(`${label}.fix debe ser ${AUDIT_FIX_CAPABILITIES.join(", ")}.`);
	for (const boolKey of [
		"md",
		"ast",
		"changedOnly",
		"critical"
	]) if (typeof caps[boolKey] !== "boolean") errors.push(`${label}.${boolKey} debe ser explícitamente booleano (true o false).`);
}
function validateAuditorRuleCapabilitiesContract(auditor, taskId, errors) {
	if (!auditor.ruleCapabilities || typeof auditor.ruleCapabilities !== "object") {
		errors.push(`Auditor [${taskId}] no define el mapa obligatorio de 'ruleCapabilities' por sub-auditor.`);
		return;
	}
	for (const ruleId of auditor.ruleIds) {
		const caps = auditor.ruleCapabilities[ruleId];
		if (!caps || typeof caps !== "object") {
			errors.push(`Auditor [${taskId}] no define 'ruleCapabilities' para la regla declarada '${ruleId}'.`);
			continue;
		}
		validateSixFieldCapabilities(caps, `Auditor [${taskId}] sub-auditor '${ruleId}' ruleCapabilities.${ruleId}`, errors);
	}
}
function validateAuditorCriticalConfigContract(auditor, taskId, errors) {
	if (auditor.criticalConfig === void 0) {
		errors.push(`Auditor [${taskId}] no define 'criticalConfig' obligatorio en su constructor.`);
		return;
	}
	if (typeof auditor.criticalConfig !== "object" || auditor.criticalConfig === null) {
		errors.push(`Auditor [${taskId}] define 'criticalConfig' inválido (debe ser un objeto).`);
		return;
	}
	const { rationale, requiredMinimums, forbiddenOverrides, validate } = auditor.criticalConfig;
	if ((requiredMinimums !== void 0 && Object.keys(requiredMinimums).length > 0 || forbiddenOverrides !== void 0 && Object.keys(forbiddenOverrides).length > 0 || typeof validate === "function") && (!rationale || typeof rationale !== "string" || rationale.trim() === "")) errors.push(`Auditor [${taskId}] criticalConfig debe definir un 'rationale' no vacío cuando declara restricciones críticas.`);
}
function validateAuditorConfigContract(auditor, taskId, errors) {
	if (!auditor.configKey || typeof auditor.configKey !== "string") errors.push(`Auditor [${taskId}] no define un 'configKey' obligatorio.`);
	if (!auditor.defaultConfig || typeof auditor.defaultConfig !== "object") errors.push(`Auditor [${taskId}] no define un 'defaultConfig' obligatorio.`);
	else if (auditor.configKey !== "paths" && auditor.configKey !== "core") {
		if (typeof auditor.defaultConfig.enabled !== "boolean") errors.push(`Auditor [${taskId}] defaultConfig.enabled debe ser explícitamente booleano (true o false).`);
	}
}
function validateAuditorCapabilitiesContract(auditor, taskId, errors) {
	if (!auditor.capabilities || typeof auditor.capabilities !== "object") {
		errors.push(`Auditor [${taskId}] no define un objeto de 'capabilities' obligatorio.`);
		return;
	}
	validateSixFieldCapabilities(auditor.capabilities, `Auditor [${taskId}] capabilities`, errors);
	const fixableRules = auditor.getFixableRuleIds();
	if (auditor.capabilities.fix !== "none") {
		if (fixableRules.length === 0) errors.push(`Auditor [${taskId}] declara capabilities.fix !== 'none' pero getFixableRuleIds() está vacío.`);
		for (const r of fixableRules) if (!auditor.ruleIds.includes(r)) errors.push(`Auditor [${taskId}] declara regla corregible '${r}' que no existe en 'ruleIds'.`);
	} else if (fixableRules.length > 0) errors.push(`Auditor [${taskId}] declara reglas corregibles (${fixableRules.join(", ")}) pero capabilities.fix es 'none'.`);
}
function validateAuditorScriptsContract(auditor, taskId, errors) {
	if (!Array.isArray(auditor.scripts) || auditor.scripts.length === 0) {
		errors.push(`Auditor [${taskId}] no define el contrato obligatorio de comandos de ejecución en 'scripts'.`);
		return;
	}
	for (const s of auditor.scripts) if (!s.name || !s.command || !s.description) errors.push(`Auditor [${taskId}] define un script inválido en 'scripts' (faltan campos obligatorios name, command o description).`);
}
function validateRuleDescriptions(auditor, taskId, errors) {
	if (!auditor.ruleDescriptions || typeof auditor.ruleDescriptions !== "object") {
		errors.push(`Auditor [${taskId}] no define un mapa de 'ruleDescriptions'.`);
		return;
	}
	for (const rule of auditor.ruleIds) {
		const desc = auditor.ruleDescriptions[rule];
		if (!desc) errors.push(`Auditor [${taskId}] falta descripción en ruleDescriptions para la regla '${rule}'.`);
		else {
			if (desc.includes("\n") || desc.includes("\r")) errors.push(`Auditor [${taskId}] descripción de regla '${rule}' contiene saltos de línea.`);
			const combined = `${auditor.packageName}: ${desc}`;
			if (combined.length > 50) errors.push(`Auditor [${taskId}] descripción combinada '${combined}' excede 50 caracteres (${combined.length}).`);
		}
	}
}
/**
* Finds dedicated test file(s) for an auditor across core and extension conventions.
*/
function findDedicatedTestFile(projectRoot, taskId, testRoots = ["tests"]) {
	const candidateRelPaths = [];
	for (const tr of testRoots) {
		const cleanTr = tr.replace(/^\/+|\/+$/g, "");
		candidateRelPaths.push(`${cleanTr}/${taskId}.test.ts`);
		candidateRelPaths.push(`${cleanTr}/node/auditors/${taskId}.test.ts`);
		candidateRelPaths.push(`${cleanTr}/unit/auditors/${taskId}.test.ts`);
		candidateRelPaths.push(`${cleanTr}/auditors/${taskId}.test.ts`);
	}
	candidateRelPaths.push(`packages/auditor/tests/${taskId}.test.ts`);
	candidateRelPaths.push(`tests/${taskId}.test.ts`);
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
		try {
			const siblings = fs.readdirSync(parentDir);
			for (const sib of siblings) if (sib.startsWith(`${taskId}_`) && sib.endsWith(".test.ts")) combinedSources.push(fs.readFileSync(path.join(parentDir, sib), "utf-8"));
		} catch {}
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
	return testSource.includes("fix: true") || testSource.includes("fix = true") || testSource.includes("'--fix'") || testSource.includes("\"--fix\"") || testSource.includes("isFixMode") || testSource.includes("auditZIndexParity(") || testSource.includes("fixZIndexLiteral") || testSource.includes("autoFix") || testSource.includes("applyAutoFix");
}
/**
* Validates that an auditor's dedicated test file adheres to the strict 6-point contract.
*/
function validateAuditorTestFileContent(testSource, testFileRel, auditor) {
	const errors = [];
	if (!checkConstructionVerification(testSource)) errors.push(`El archivo de prueba '${testFileRel}' no verifica la construcción o metadatos de '${auditor.id}'.`);
	if (!checkCleanVerification(testSource)) errors.push(`El archivo de prueba '${testFileRel}' no verifica la ruta limpia (cero errores / status passed) de '${auditor.id}'.`);
	if (!checkViolationVerification(testSource)) errors.push(`El archivo de prueba '${testFileRel}' no verifica la detección de errores o fallos (status failed / severity error) de '${auditor.id}'.`);
	if (auditor.capabilities.fix !== "none" && !checkFixVerification(testSource)) errors.push(`El archivo de prueba '${testFileRel}' no verifica la capacidad de auto-fix ('fix: true') de '${auditor.id}'.`);
	for (const rule of auditor.ruleIds) {
		const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		if (!new RegExp(`(?:['"\`]${escaped}['"\`]|\\b${escaped}\\b)`).test(testSource)) errors.push(`El archivo de prueba '${testFileRel}' no verifica la regla declarada '${rule}' de '${auditor.id}'.`);
	}
	return errors;
}
/**
* Universal Vitest runner registering dynamic conformance tests for all discovered sub-auditors and extensions.
*/
async function evaluateTaskContract(task, projectRoot, testRoots, tempDir) {
	const suitePath = path.isAbsolute(task.scriptPath) ? task.scriptPath : path.resolve(projectRoot, task.scriptPath);
	if (!fs.existsSync(suitePath)) return [`No se encontró el archivo de código fuente del auditor en '${suitePath}'.`];
	let mod;
	try {
		mod = await import(suitePath);
	} catch (err) {
		return [`Error al importar el módulo '${suitePath}': ${String(err)}`];
	}
	const Cls = findAuditorClass(mod);
	if (!Cls) return [`El módulo '${suitePath}' no exporta una subclase válida de BaseAuditor.`];
	let auditor;
	try {
		auditor = instantiateAuditorClass(Cls, tempDir);
	} catch (err) {
		return [`Error al instanciar '${task.id}': ${String(err)}`];
	}
	const constructionErrors = validateAuditorConstruction(auditor, task.id);
	const { testFileAbs, testFileRel, allTestSources } = findDedicatedTestFile(projectRoot, task.id, testRoots);
	if (!testFileAbs) return [...constructionErrors, `Falta archivo de prueba dedicado para '${task.id}'. Se esperaba '${testFileRel}'.`];
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
		try {
			fs.rmSync(tempDir, {
				recursive: true,
				force: true
			});
		} catch {}
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
				throw new Error(`Se encontraron ${allFailures.length} sub-auditor(es) que no cumplen el contrato estricto de testing:\n\n${failureSummary}`);
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
			throw new Error("runAuditorContractConformanceTests() requiere un entorno de prueba Vite+ / Vitest. Asegúrate de ejecutar tus tests con Vite+ ('vp test') o pasa las funciones de prueba explícitamente: runAuditorContractConformanceTests({ vitest: { describe, it, expect, beforeAll, afterAll } }).");
		}
	})();
}
//#endregion
export { checkCleanVerification, checkConstructionVerification, checkFixVerification, checkViolationVerification, findAuditorClass, findDedicatedTestFile, instantiateAuditorClass, isEligibleExtensionAuditorFile, runAuditorContractConformanceTests, scanAllAuditorTasks, scanExtensionAuditors, validateAuditorConstruction, validateAuditorTestFileContent };
