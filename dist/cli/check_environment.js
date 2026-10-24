#!/usr/bin/env -S node --experimental-strip-types
import { safeJsonParse, safeReadFileSync } from "../core/safeUtils.js";
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs } from "../core/cli/cittyHarness.js";
import { isMainModule } from "./cliUtils.js";
import { runSetup } from "./setup_env.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
// src/cli/check_environment.ts
/**
* src/cli/check_environment.ts
*
* SSoT Environment Engine Validator (Node.js 26+ Native)
* Enforces Node.js and npm version invariants dynamically derived from package.json
* without hardcoded versions.
*/
function parseSemver(v) {
	const parts = v.replace(/[^0-9.]/g, "").split(".").map((n) => parseInt(n, 10) || 0);
	return {
		major: parts[0] ?? 0,
		minor: parts[1] ?? 0,
		patch: parts[2] ?? 0
	};
}
function compareVersions(current, required) {
	if (current.major > required.major) return true;
	if (current.major < required.major) return false;
	if (current.minor > required.minor) return true;
	if (current.minor < required.minor) return false;
	return current.patch >= required.patch;
}
function getAuditorEngines() {
	const currentFilePath = fileURLToPath(import.meta.url);
	let dir = path.dirname(currentFilePath);
	const auditorPackageJsonPath = path.resolve(dir, "../../package.json");
	if (fs.existsSync(auditorPackageJsonPath)) {
		const data = JSON.parse(fs.readFileSync(auditorPackageJsonPath, "utf8"));
		if (data.engines?.node && data.engines?.npm) return {
			node: data.engines.node,
			npm: data.engines.npm
		};
	}
	while (dir !== path.dirname(dir)) {
		const candidate = path.join(dir, "package.json");
		if (fs.existsSync(candidate)) {
			const raw = safeReadFileSync(candidate);
			if (raw) {
				const data = safeJsonParse(raw);
				if (data?.name === "@francogp/auditor" && data.engines?.node && data.engines?.npm) return {
					node: data.engines.node,
					npm: data.engines.npm
				};
			}
		}
		dir = path.dirname(dir);
	}
	throw new Error(`[getAuditorEngines] Could not determine @francogp/auditor engine requirements from package.json (${auditorPackageJsonPath}). Hardcoded fallbacks are strictly prohibited.`);
}
function validateHostEnginesDeclaration(hostPkg, projectName, verbose = true) {
	if (!hostPkg.engines?.node || !hostPkg.engines?.npm) {
		if (verbose) {
			console.error(`\n\x1b[31m\x1b[1m❌ ENVIRONMENT ERROR IN ${projectName}:\x1b[0m`);
			console.error("The package.json file must explicitly declare \"engines.node\" and \"engines.npm\".");
		}
		return false;
	}
	const hostNodeReq = parseSemver(hostPkg.engines.node);
	const hostNpmReq = parseSemver(hostPkg.engines.npm);
	const auditorEngines = getAuditorEngines();
	const auditorNodeReq = parseSemver(auditorEngines.node);
	const auditorNpmReq = parseSemver(auditorEngines.npm);
	const isHostNodeEngineAdequate = compareVersions(hostNodeReq, auditorNodeReq);
	const isHostNpmEngineAdequate = compareVersions(hostNpmReq, auditorNpmReq);
	if (!isHostNodeEngineAdequate || !isHostNpmEngineAdequate) {
		if (verbose) {
			console.error(`\n\x1b[31m\x1b[1m❌ ENVIRONMENT ERROR IN ${projectName}:\x1b[0m`);
			console.error("The Node.js or npm versions declared in package.json are LOWER than those required by @francogp/auditor:");
			console.error(`  - Auditor Requirement: Node ${auditorEngines.node} | npm ${auditorEngines.npm}`);
			console.error(`  - Declared in Host:    Node ${hostPkg.engines.node} | npm ${hostPkg.engines.npm}`);
			console.error("\nUpdate \"engines.node\" and \"engines.npm\" in package.json to meet or exceed the auditor baseline.");
		}
		return false;
	}
	return true;
}
function printEnvironmentRemediation(nodeReq, npmReq, npmDetected) {
	const isWindows = process.platform === "win32";
	const targetNodeVer = nodeReq.replace(/[^0-9.]/g, "");
	console.error(`Requirement configured in package.json ("engines"):`);
	console.error(`  - Node.js: \x1b[33m${nodeReq}\x1b[0m (Detected: v${process.versions.node})`);
	console.error(`  - npm:     \x1b[33m${npmReq}\x1b[0m (Detected: v${npmDetected})\n`);
	console.error("\x1B[32m\x1B[1m💡 HOW TO RESOLVE WITHOUT AFFECTING OTHER PROJECTS:\x1B[0m");
	console.error("Run the project setup script to activate the isolated environment:");
	if (isWindows) {
		console.error("  .\\setup-windows.ps1");
		console.error("  (or run: vp env use " + targetNodeVer + ")");
	} else {
		console.error("  ./setup-linux.sh");
		console.error("  (or run: vp env use " + targetNodeVer + ")");
	}
	console.error("\nℹ️  Multi-project isolation: The project reads .node-version locally without altering your other projects.\n");
}
function validateRuntimeEnvironment(hostPkg, projectName, verbose = true) {
	if (!hostPkg.engines?.node || !hostPkg.engines?.npm) return false;
	const hostNodeReq = parseSemver(hostPkg.engines.node);
	const hostNpmReq = parseSemver(hostPkg.engines.npm);
	const currentNode = parseSemver(process.versions.node);
	const npmMatch = (process.env.npm_config_user_agent || "").match(/npm\/([0-9.]+)/);
	const currentNpm = parseSemver(npmMatch ? npmMatch[1] : "0.0.0");
	const isCurrentNodeValid = compareVersions(currentNode, hostNodeReq);
	const isCurrentNpmValid = currentNpm.major === 0 || compareVersions(currentNpm, hostNpmReq);
	if (!isCurrentNodeValid || !isCurrentNpmValid) {
		if (verbose) {
			console.error(`\n\x1b[31m\x1b[1m❌ ENVIRONMENT ERROR IN ${projectName}:\x1b[0m`);
			printEnvironmentRemediation(hostPkg.engines.node, hostPkg.engines.npm, npmMatch ? npmMatch[1] : "unknown");
		}
		return false;
	}
	return true;
}
function checkEnvironment(targetDir = process.cwd(), autoRemediate = true) {
	const parsed = parseCittyArgs(COMMON_CLI_ARGS, getProcessCliArgs());
	const hostPkgPath = path.resolve(targetDir, "package.json");
	if (!fs.existsSync(hostPkgPath)) {
		console.error(`[check_environment] package.json not found in ${targetDir}`);
		return false;
	}
	const hostPkg = JSON.parse(fs.readFileSync(hostPkgPath, "utf8"));
	const projectName = hostPkg.name || path.basename(targetDir);
	const isDeclaredValid = validateHostEnginesDeclaration(hostPkg, projectName, false);
	const isRuntimeValid = isDeclaredValid && validateRuntimeEnvironment(hostPkg, projectName, false);
	if (isDeclaredValid && isRuntimeValid) return true;
	const setupScriptName = process.platform === "win32" ? "setup-windows.ps1" : "setup-linux.sh";
	const setupScriptPath = path.resolve(targetDir, setupScriptName);
	const isPreinstallHook = process.env.npm_lifecycle_event === "preinstall" || parsed._.map(String).includes("preinstall");
	if (autoRemediate && !isPreinstallHook && fs.existsSync(setupScriptPath)) {
		console.log(`\n\x1b[36m\x1b[1m🔄 Environment drift detected in ${projectName}. Automatically running ${setupScriptName} to synchronize environment...\x1b[0m\n`);
		if (runSetup([], targetDir) === 0) {
			const refreshedPkg = JSON.parse(fs.readFileSync(hostPkgPath, "utf8"));
			const refreshedDeclared = validateHostEnginesDeclaration(refreshedPkg, projectName, false);
			const refreshedRuntime = refreshedDeclared && validateRuntimeEnvironment(refreshedPkg, projectName, false);
			if (refreshedDeclared && refreshedRuntime) {
				console.log(`\n\x1b[32m\x1b[1m✅ Auto-remediation completed successfully. The ${projectName} environment has been updated and synchronized.\x1b[0m\n`);
				return true;
			}
		}
	}
	if (!validateHostEnginesDeclaration(hostPkg, projectName, true)) return false;
	return validateRuntimeEnvironment(hostPkg, projectName, true);
}
if (isMainModule(import.meta.url)) {
	if (!checkEnvironment()) process.exit(1);
}
export { checkEnvironment, compareVersions, getAuditorEngines, parseSemver };
