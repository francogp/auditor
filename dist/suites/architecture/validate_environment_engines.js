import { BaseAuditor, createRuleCapabilities } from "../../core/auditorBase.js";
import { compareVersions, getAuditorEngines, parseSemver } from "../../cli/check_environment.js";
import { getPackageJson } from "../../core/packageJson.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
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
		const res = spawnSync("npm", ["--version"], {
			encoding: "utf8",
			shell: true
		});
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
			ruleCapabilities: createRuleCapabilities(ENVIRONMENT_ENGINES_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_environment_engines",
			name: "Environment Engines & Runtime Validator",
			description: "Valida versiones de Node.js y npm en package.json",
			family: "architecture",
			ruleIds: ENVIRONMENT_ENGINES_RULES,
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
				"environment-engines-missing": "Guía de diagnóstico y remediación para environment-engines-missing. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"environment-engines-below-floor": "Guía de diagnóstico y remediación para environment-engines-below-floor. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"environment-runtime-mismatch": "Guía de diagnóstico y remediación para environment-runtime-mismatch. Revisa la incidencia detectada y ajusta el código correspondiente."
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
				severity: "error"
			});
			return null;
		}
		const pkg = getPackageJson(this.projectRoot, true);
		if (!pkg) {
			this.addViolation({
				ruleId: "environment-engines-missing",
				file: "package.json",
				message: "package.json no contiene un JSON válido.",
				severity: "error"
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
				message: `package.json debe declarar explícitamente "engines.node" y "engines.npm". Ejecuta ${setupScript} para sincronizar el entorno.`,
				severity: "error"
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
					message: `Versiones de motores en package.json inferiores al piso del auditor (Node: ${auditorEngines.node}, npm: ${auditorEngines.npm}). Ejecuta ${updateScript} para actualizar el entorno a la última versión.`,
					severity: "error"
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
				severity: "error"
			});
		}
	}
	async runAudit() {
		const pkgPath = path.resolve(this.projectRoot, "package.json");
		this.recordScanned("package.json");
		const auditorEngines = getAuditorEngines();
		const minNodeReq = parseSemver(auditorEngines.node);
		const minNpmReq = parseSemver(auditorEngines.npm);
		const pkg = this.validatePackageJson(pkgPath);
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
