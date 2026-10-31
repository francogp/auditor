import { safeRmSync, tryOrNull } from "../../core/safeUtils.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { compareVersions, getAuditorEngines, parseSemver } from "../../cli/check_environment.js";
import { getPackageJson, writePackageJson } from "../../core/packageJson.js";
import { runNpmCommandSync } from "../../core/npmCommandUtils.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
// src/suites/architecture/validate_environment_engines.ts
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
	const res = tryOrNull(() => runNpmCommandSync(["--version"], { encoding: "utf8" }));
	if (res && res.status === 0 && res.stdout) return res.stdout.trim();
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
	if (fs.existsSync(legacyNvmrc)) safeRmSync(legacyNvmrc);
	return updated;
}
var ValidateEnvironmentEnginesAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		super({
			ruleFixers: {},
			fixableRuleIds: ["environment-engines-missing", "environment-engines-below-floor"],
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(ENVIRONMENT_ENGINES_RULES, {
				speed: "light",
				phase: "setup",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_environment_engines",
			name: "Environment Engines & Runtime Validator",
			description: "Validates Node.js and npm versions in package.json",
			family: "architecture",
			ruleIds: ENVIRONMENT_ENGINES_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(ENVIRONMENT_ENGINES_RULES, "setup"),
			packageName: "Environment",
			configKey: "environment.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "⚡",
			ruleDescriptions: {
				"environment-engines-missing": "Missing engines in package.json",
				"environment-engines-below-floor": "Engines below auditor floor",
				"environment-runtime-mismatch": "Active runtime does not match engines"
			},
			ruleRemediations: {
				"environment-engines-missing": "1. Root Cause:\nThe package.json file does not explicitly declare the \"engines\" field with the required \"node\" and \"npm\" versions.\nWithout this declaration, CI/CD pipelines and developers may execute the project on legacy Node versions lacking the native permission model (--permission) or native TypeScript execution (--experimental-strip-types).\n\n2. Diagnosis:\nCheck whether the \"engines\": { \"node\": \"...\", \"npm\": \"...\" } block exists in package.json.\n\n3. Canonical Solution:\n1. Run \"npm run auditor:fix\" or \"auditor fix\". The auditor will dynamically inject canonical Node and npm versions synchronized with the auditor engine.\n2. Or run \".\\setup-windows.ps1\" (Windows) or \"./setup-linux.sh\" (Linux).\n\n4. Example / Auto-fix command:\nnpm run auditor:fix",
				"environment-engines-below-floor": "1. Root Cause:\nThe Node or npm versions specified in package.json.engines are below the minimum floor mandated by @francogp/auditor.\n\n2. Diagnosis:\nThe violation message details the declared version versus the required floor (e.g. Node 26+).\n\n3. Canonical Solution:\n1. Run \"npm run auditor:fix\" to automatically raise the declarations in package.json.\n2. Run \".\\update-windows.ps1\" or \"./update-linux.sh\" to synchronize the version installed on your machine.\n\n4. Example / Auto-fix command:\nnpm run auditor:fix",
				"environment-runtime-mismatch": "1. Root Cause:\nThe active terminal is running a Node.js or npm version different from or lower than what is required in package.json.engines.\n\n2. Diagnosis:\nRun \"node -v\" and \"npm -v\" in your terminal to compare with the versions required in package.json.\n\n3. Canonical Solution:\n1. Run \".\\setup-windows.ps1\" on Windows or \"./setup-linux.sh\" on Linux to configure and activate the correct version via your environment manager (fnm / nvm).\n2. If using fnm or nvm manually, run \"fnm use\" or \"nvm use\".\n3. Restart your terminal session so environment variables and PATH refresh properly.\n\n4. Example / Auto-fix command:\nfnm use"
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
				message: `package.json not found in ${this.projectRoot}.`,
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
				message: "package.json does not contain valid JSON.",
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
				message: `package.json must explicitly declare "engines.node" and "engines.npm". Run "auditor fix" or ${setupScript} to synchronize the environment.`,
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
					message: `Engine versions in package.json are below the auditor floor (Node: ${auditorEngines.node}, npm: ${auditorEngines.npm}). Run "auditor fix" or ${updateScript} to update the environment to the latest version.`,
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
				message: `Runtime environment misaligned. Detected Node v${process.versions.node} / npm ${rawNpmVer}, required Node ${pkg.engines?.node ?? auditorEngines.node} / npm ${pkg.engines?.npm ?? auditorEngines.npm}. Run ${setupScript} (or vp env use) to align your terminal, or ${updateScript} to update to the latest version.`,
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
			...pkg.engines,
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
				this.markRuleNotApplicable("environment-engines-below-floor", "Missing or invalid package.json");
			});
			this.runSubAuditorSync("environment-runtime-mismatch", () => {
				this.markRuleNotApplicable("environment-runtime-mismatch", "Missing or invalid package.json");
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
export { ENVIRONMENT_ENGINES_RULES, ValidateEnvironmentEnginesAuditor, detectNpmVersion, extractBaseNodeVersion, syncNodeVersion };
