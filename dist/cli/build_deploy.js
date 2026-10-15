#!/usr/bin/env -S node --experimental-strip-types
import "../core/permissionGuard.js";
import { isMainModule } from "./cliUtils.js";
import { runNpmCommandSync } from "../core/npmCommandUtils.js";
//#region src/cli/build_deploy.ts
/**
* src/cli/build_deploy.ts
*
* CI/CD DEPLOYMENT BUILD RUNNER CLI (Node.js 26+ Native)
* Executes npm run build under AUDITOR_ENV=production, cleanly omitting
* development-only suites (similar-code Candle ML embeddings, test coverage, and git config)
* while maintaining strict 100% enforcement across all architectural, linting,
* styles, and post-build bundle budget verification gates.
*/
function runBuildDeploy(extraArgs = []) {
	process.env.AUDITOR_ENV = "production";
	const args = [
		"run",
		"build",
		...extraArgs
	];
	return runNpmCommandSync(args, {
		stdio: "inherit",
		cwd: process.cwd(),
		env: process.env
	}).status ?? 0;
}
if (isMainModule(import.meta.url)) {
	const exitCode = runBuildDeploy(process.argv.slice(2));
	process.exit(exitCode);
}
//#endregion
export { runBuildDeploy };
