#!/usr/bin/env -S node --experimental-strip-types
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs } from "../core/cli/cittyHarness.js";
import { isMainModule } from "./cliUtils.js";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
//#region src/cli/setup_env.ts
/**
* src/cli/setup_env.ts
*
* Cross-platform Environment Setup Orchestrator (Node.js 26+ Native)
* Automatically delegates to setup-linux.sh or setup-windows.ps1 based on platform.
*/
const SETUP_ENV_ARGS = {
	...COMMON_CLI_ARGS,
	update: {
		type: "boolean",
		alias: "u",
		default: false,
		description: "Update runtime environment version"
	},
	"update-version": {
		type: "boolean",
		default: false,
		description: "Update runtime environment version"
	}
};
function runSetup(rawInputArgs = getProcessCliArgs(), targetDir = process.cwd()) {
	const parsed = parseCittyArgs(SETUP_ENV_ARGS, rawInputArgs);
	const isWindows = process.platform === "win32";
	const isUpdate = Boolean(parsed.update) || Boolean(parsed["update-version"]) || parsed._.map(String).includes("update");
	const forwardedArgs = rawInputArgs.filter((a) => a !== "update" && a !== "--update");
	if (isWindows) {
		const targetScript = isUpdate ? "update-windows.ps1" : "setup-windows.ps1";
		let scriptPath = path.resolve(targetDir, targetScript);
		if (!fs.existsSync(scriptPath)) {
			scriptPath = path.resolve(targetDir, "setup-windows.ps1");
			if (isUpdate && !forwardedArgs.includes("-UpdateVersion")) forwardedArgs.unshift("-UpdateVersion");
		}
		if (!fs.existsSync(scriptPath)) {
			console.error(`[auditor-setup-env] Script not found: ${scriptPath}`);
			return 1;
		}
		const psArgs = [
			"-ExecutionPolicy",
			"Bypass",
			"-File",
			scriptPath,
			...forwardedArgs
		];
		return spawnSync("powershell.exe", psArgs, {
			stdio: "inherit",
			cwd: targetDir
		}).status ?? 0;
	}
	const targetScript = isUpdate ? "update-linux.sh" : "setup-linux.sh";
	let scriptPath = path.resolve(targetDir, targetScript);
	if (!fs.existsSync(scriptPath)) {
		scriptPath = path.resolve(targetDir, "setup-linux.sh");
		if (isUpdate && !forwardedArgs.includes("--update-version")) forwardedArgs.unshift("--update-version");
	}
	if (!fs.existsSync(scriptPath)) {
		console.error(`[auditor-setup-env] Script not found: ${scriptPath}`);
		return 1;
	}
	return spawnSync("bash", [scriptPath, ...forwardedArgs], {
		stdio: "inherit",
		cwd: targetDir
	}).status ?? 0;
}
if (isMainModule(import.meta.url)) {
	const code = runSetup();
	process.exit(code);
}
//#endregion
export { runSetup };
