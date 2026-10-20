import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { compareVersions, getAuditorEngines, parseSemver } from "../../cli/check_environment.js";
import { getPackageJson, writePackageJson } from "../../core/packageJson.js";
import { runNpmCommandSync } from "../../core/npmCommandUtils.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/validate_environment_engines.ts
/**
* src/suites/architecture/validate_environment_engines.ts
*
* SSoT ENVIRONMENT ENGINES & RUNTIME AUDITOR (Node.js 26+ Native)
*
* Verifies that package.json declares engines.node and engines.npm satisfying or
* exceeding the @francogp/auditor engine floor, and that the active runtime matches.
* In --fix mode, automatically repairs package.json engines or invokes the canonical
* setup script (setup-windows.ps1 / setup-linux.sh) to align the environment.
*/
enableCompileCache();
const ENVIRONMENT_ENGINES_RULES = [
	"environment-engines-missing",
	"environment-engines-below-floor",
	"environment-runtime-mismatch"
];
function detectNpmVersion() {
	const match = (process.env.npm_config_user_agent || "").match(/npm\/([0-9.]+)/);
	if (match?.[1]) return match[1];
	try {
		const res = runNpmCommandSync(["--version"], { encoding: "utf8" });
		if (res.status === 0 && res.stdout) return res.stdout.trim();
	} catch {}
	return "0.0.0";
}
function extractBaseNodeVersion(engineStr) {
	const v = parseSemver(engineStr);
	if (v.major === 0 && v.minor === 0 && v.patch === 0) return "";
	return `${v.major}.${v.minor}.${v.patch}`;
}
function syncNodeVersion(projectRoot, targetNodeEngine) {
	const baseVersion = extractBaseNodeVersion(targetNodeEngine);
	if (!baseVersion) return false;
	const nodeVersionPath = path.resolve(projectRoot, ".node-version");
	const currentContent = fs.existsSync(nodeVersionPath) ? fs.readFileSync(nodeVersionPath, "utf8").trim() : "";
	let updated = false;
	if (currentContent !== baseVersion) {
		fs.writeFileSync(nodeVersionPath, `${baseVersion}\n`, "utf8");
		updated = true;
	}
	const legacyNvmrc = path.resolve(projectRoot, ".nvmrc");
	if (fs.existsSync(legacyNvmrc)) try {
		fs.rmSync(legacyNvmrc, { force: true });
	} catch {}
	return updated;
}
var ValidateEnvironmentEnginesAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(ENVIRONMENT_ENGINES_RULES, {
				speed: "light",
				phase: "setup",
				fix: "priority",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}, ["environment-engines-missing", "environment-engines-below-floor"]),
			fixableRuleIds: ["environment-engines-missing", "environment-engines-below-floor"],
			id: "validate_environment_engines",
			name: "Environment Engines & Runtime Validator",
			description: "Valida versiones de Node.js y npm en package.json",
			family: "architecture",
			ruleIds: ENVIRONMENT_ENGINES_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(ENVIRONMENT_ENGINES_RULES, "setup"),
			packageName: "Entorno",
			configKey: "environment.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "⚡",
			ruleDescriptions: {
				"environment-engines-missing": "Falta engines en package.json",
				"environment-engines-below-floor": "Motores inferiores al piso auditor",
				"environment-runtime-mismatch": "Versión activa no coincide con engines"
			},
			ruleRemediations: {
				"environment-engines-missing": "Causa Raíz:\nEl archivo package.json no declara explícitamente el objeto \"engines\" con las versiones requeridas de \"node\" y \"npm\".\nSin esta declaración, las herramientas de CI/CD y los desarrolladores pueden ejecutar el proyecto sobre versiones obsoletas de Node que no soportan el modelo de permisos nativo (--permission) o TypeScript nativo (--experimental-strip-types).\n\nDiagnóstico:\nComprueba si existe el bloque \"engines\": { \"node\": \"...\", \"npm\": \"...\" } en package.json.\n\nSolución Canónica:\n1. Ejecuta \"npm run auditor:fix\" o \"auditor fix\". El auditor inyectará dinámicamente las versiones canónicas de Node y npm sincronizadas con el motor del auditor.\n2. O bien ejecuta \".\\setup-windows.ps1\" (Windows) o \"./setup-linux.sh\" (Linux).",
				"environment-engines-below-floor": "Causa Raíz:\nLas versiones de Node o npm especificadas en package.json.engines son inferiores al piso mínimo homologado por @francogp/auditor.\n\nDiagnóstico:\nEl mensaje de la advertencia detalla la versión declarada versus el piso mínimo requerido (ej. Node 26+).\n\nSolución Canónica:\n1. Ejecuta \"npm run auditor:fix\" para elevar automáticamente las declaraciones en package.json.\n2. Ejecuta \".\\update-windows.ps1\" o \"./update-linux.sh\" para sincronizar la versión instalada en la máquina.",
				"environment-runtime-mismatch": "Causa Raíz:\nLa terminal actual está ejecutando una versión activa de Node.js o npm diferente o inferior a la exigida en package.json.engines.\n\nDiagnóstico:\nEjecuta \"node -v\" y \"npm -v\" en tu terminal para comparar con las versiones requeridas en package.json.\n\nSolución Canónica:\n1. Ejecuta \".\\setup-windows.ps1\" en Windows o \"./setup-linux.sh\" en Linux para configurar y activar la versión correcta mediante el gestor de entornos (fnm / nvm).\n2. Si usas fnm o nvm manualmente, ejecuta \"fnm use\" o \"nvm use\".\n3. Cierra y vuelve a abrir tu terminal para que las variables de entorno refresquen su PATH."
			},
			coverage: { include: ["package.json"] },
			...options
		});
	}
	validatePackageJson(pkgPath) {
		if (!fs.existsSync(pkgPath)) {
			this.addViolation({
				ruleId: "environment-engines-missing",
				file: "package.json",
				message: `package.json no encontrado en ${this.projectRoot}.`,
				severity: "error",
				fixable: false
			});
			return null;
		}
		const pkg = getPackageJson(this.projectRoot, true);
		if (!pkg) {
			this.addViolation({
				ruleId: "environment-engines-missing",
				file: "package.json",
				message: "package.json no contiene un JSON válido.",
				severity: "error",
				fixable: false
			});
			return null;
		}
		return pkg;
	}
	auditMissingEngines(engines) {
		if (!engines.hasNodeEngine || !engines.hasNpmEngine) {
			const setupScript = process.platform === "win32" ? ".\\setup-windows.ps1" : "./setup-linux.sh";
			this.addViolation({
				ruleId: "environment-engines-missing",
				file: "package.json",
				message: `package.json debe declarar explícitamente "engines.node" y "engines.npm". Ejecuta "auditor fix" o ${setupScript} para sincronizar el entorno.`,
				severity: "error",
				fixable: true
			});
		}
	}
	auditEnginesBelowFloor(currentNodeEngine, currentNpmEngine, auditorEngines, minNodeReq, minNpmReq) {
		let nodeEngineReq = {
			major: 0,
			minor: 0,
			patch: 0
		};
		let npmEngineReq = {
			major: 0,
			minor: 0,
			patch: 0
		};
		if (currentNodeEngine && currentNpmEngine) {
			nodeEngineReq = parseSemver(currentNodeEngine);
			npmEngineReq = parseSemver(currentNpmEngine);
			const isNodeAdequate = compareVersions(nodeEngineReq, minNodeReq);
			const isNpmAdequate = compareVersions(npmEngineReq, minNpmReq);
			if (!isNodeAdequate || !isNpmAdequate) {
				const updateScript = process.platform === "win32" ? ".\\update-windows.ps1" : "./update-linux.sh";
				this.addViolation({
					ruleId: "environment-engines-below-floor",
					file: "package.json",
					message: `Versiones de motores en package.json inferiores al piso del auditor (Node: ${auditorEngines.node}, npm: ${auditorEngines.npm}). Ejecuta "auditor fix" o ${updateScript} para actualizar el entorno a la última versión.`,
					severity: "error",
					fixable: true
				});
			}
		}
		return {
			nodeReq: nodeEngineReq,
			npmReq: npmEngineReq
		};
	}
	auditRuntimeMismatch(pkg, auditorEngines, nodeEngineReq, npmEngineReq, minNodeReq, minNpmReq) {
		const runtimeNode = parseSemver(process.versions.node);
		const rawNpmVer = detectNpmVersion();
		const runtimeNpm = parseSemver(rawNpmVer);
		const targetNodeReq = nodeEngineReq.major > 0 ? nodeEngineReq : minNodeReq;
		const targetNpmReq = npmEngineReq.major > 0 ? npmEngineReq : minNpmReq;
		const isNodeMatch = compareVersions(runtimeNode, targetNodeReq);
		const isNpmMatch = runtimeNpm.major === 0 || compareVersions(runtimeNpm, targetNpmReq);
		if (!isNodeMatch || !isNpmMatch) {
			const isWin = process.platform === "win32";
			const setupScript = isWin ? ".\\setup-windows.ps1" : "./setup-linux.sh";
			const updateScript = isWin ? ".\\update-windows.ps1" : "./update-linux.sh";
			this.addViolation({
				ruleId: "environment-runtime-mismatch",
				file: "package.json",
				message: `Entorno de ejecución desalineado. Detectado Node v${process.versions.node} / npm ${rawNpmVer}, requerido Node ${pkg.engines?.node ?? auditorEngines.node} / npm ${pkg.engines?.npm ?? auditorEngines.npm}. Ejecuta ${setupScript} (o vp env use) para alinear tu terminal, o ${updateScript} para actualizar a la última versión.`,
				severity: "error",
				fixable: false
			});
		}
	}
	repairEnginesInPackageJson(pkg, auditorEngines, minNodeReq, minNpmReq) {
		const currentNode = pkg.engines?.node?.trim() ?? "";
		const currentNpm = pkg.engines?.npm?.trim() ?? "";
		const isNodeOk = currentNode.length > 0 && compareVersions(parseSemver(currentNode), minNodeReq);
		const isNpmOk = currentNpm.length > 0 && compareVersions(parseSemver(currentNpm), minNpmReq);
		if (isNodeOk && isNpmOk) {
			syncNodeVersion(this.projectRoot, currentNode);
			return pkg;
		}
		const updatedEngines = {
			...pkg.engines ?? {},
			node: isNodeOk ? currentNode : auditorEngines.node,
			npm: isNpmOk ? currentNpm : auditorEngines.npm
		};
		const updatedPkg = {
			...pkg,
			engines: updatedEngines
		};
		writePackageJson(this.projectRoot, updatedPkg);
		syncNodeVersion(this.projectRoot, updatedEngines.node);
		return updatedPkg;
	}
	async runAudit() {
		const pkgPath = path.resolve(this.projectRoot, "package.json");
		this.recordScanned("package.json");
		const auditorEngines = getAuditorEngines();
		const minNodeReq = parseSemver(auditorEngines.node);
		const minNpmReq = parseSemver(auditorEngines.npm);
		let pkg = this.validatePackageJson(pkgPath);
		if (!pkg) {
			this.runSubAuditorSync("environment-engines-missing", () => {});
			this.runSubAuditorSync("environment-engines-below-floor", () => {
				this.markRuleNotApplicable("environment-engines-below-floor", "package.json ausente o inválido");
			});
			this.runSubAuditorSync("environment-runtime-mismatch", () => {
				this.markRuleNotApplicable("environment-runtime-mismatch", "package.json ausente o inválido");
			});
			return;
		}
		if (this.isFixActive()) pkg = this.repairEnginesInPackageJson(pkg, auditorEngines, minNodeReq, minNpmReq);
		const hasNodeEngine = typeof pkg.engines?.node === "string" && pkg.engines.node.trim().length > 0;
		const hasNpmEngine = typeof pkg.engines?.npm === "string" && pkg.engines.npm.trim().length > 0;
		this.runSubAuditorSync("environment-engines-missing", () => {
			this.auditMissingEngines({
				hasNodeEngine,
				hasNpmEngine
			});
		});
		let belowFloorResult;
		this.runSubAuditorSync("environment-engines-below-floor", () => {
			belowFloorResult = this.auditEnginesBelowFloor(pkg.engines?.node ?? "", pkg.engines?.npm ?? "", auditorEngines, minNodeReq, minNpmReq);
		});
		this.runSubAuditorSync("environment-runtime-mismatch", () => {
			this.auditRuntimeMismatch(pkg, auditorEngines, belowFloorResult.nodeReq, belowFloorResult.npmReq, minNodeReq, minNpmReq);
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateEnvironmentEnginesAuditor());
//#endregion
export { ENVIRONMENT_ENGINES_RULES, ValidateEnvironmentEnginesAuditor, detectNpmVersion, extractBaseNodeVersion, syncNodeVersion };
