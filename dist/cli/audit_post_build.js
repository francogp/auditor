#!/usr/bin/env -S node --experimental-strip-types
import { DEFAULT_PERMISSIONS } from "../core/permissionGuard.js";
import { isMainModule } from "./cliUtils.js";
import "./auditTaskFactory.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
//#region src/cli/audit_post_build.ts
/**
* src/cli/audit_post_build.ts
*
* POST-BUILD ARTIFACT AUDITOR CLI (Node.js 26+ Native)
* Executes exclusively sub-auditors declaring capabilities.phase === 'post-build'
* against compiled production artifacts in dist/.
*/
async function runAuditPostBuild(extraArgs = []) {
	const currentDir = path.dirname(fileURLToPath(import.meta.url));
	const fullAuditorPath = path.resolve(currentDir, "audit_full.ts");
	const fullAuditorJsPath = path.resolve(currentDir, "audit_full.js");
	const targetScript = fs.existsSync(fullAuditorPath) ? fullAuditorPath : fullAuditorJsPath;
	const nodeArgs = [
		...DEFAULT_PERMISSIONS,
		targetScript,
		"phase=post-build",
		...extraArgs
	];
	return new Promise((resolve) => {
		spawn(process.execPath, nodeArgs, {
			stdio: "inherit",
			cwd: process.cwd(),
			env: process.env
		}).on("close", (code) => {
			resolve(code ?? 0);
		});
	});
}
if (isMainModule(import.meta.url)) {
	const exitCode = await runAuditPostBuild(process.argv.slice(2));
	process.exit(exitCode);
}
//#endregion
export { runAuditPostBuild };
