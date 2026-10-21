#!/usr/bin/env -S node --experimental-strip-types
import { AUDITOR_VERSION } from "../core/version.js";
import { isSelfProviderProject } from "../core/auditProjectIdentity.js";
import "../core/auditConfig.js";
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs, resolveHumanModeFromArgs } from "../core/cli/cittyHarness.js";
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { bootstrapCliProject, isMainModule } from "./cliUtils.js";
import { initAgentSkill } from "./init_agent.js";
import { syncEnvScripts } from "./sync_env_scripts.js";
import { ensureNpmrcAllowGit } from "../core/npmrcAllowGit.js";
import { runNpmCommandSync } from "../core/npmCommandUtils.js";
import path from "node:path";
import fs from "node:fs";
import { styleText } from "node:util";
import childProcess from "node:child_process";
//#region src/cli/update_package.ts
/**
* src/cli/update_package.ts
*
* Dedicated CLI updater for @francogp/auditor across host repositories.
* Performs a standard, hermetic npm update without ad-hoc scripts or git cloning.
*/
function findHostProjectRoot(startDir = process.cwd(), stopAt) {
	let current = path.resolve(startDir);
	const boundary = stopAt ? path.resolve(stopAt) : void 0;
	while (true) {
		const pkgPath = path.join(current, "package.json");
		if (fs.existsSync(pkgPath)) return current;
		if (boundary && current === boundary) break;
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return path.resolve(startDir);
}
function readInstalledAuditorVersion(projectRoot) {
	try {
		const pkgJsonPath = path.join(projectRoot, "node_modules/@francogp/auditor/package.json");
		if (fs.existsSync(pkgJsonPath)) return JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")).version || "(unknown)";
	} catch {}
	return "(not installed)";
}
function parseTagSemver(tagStr) {
	const match = tagStr.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?$/);
	if (!match) return null;
	return {
		major: parseInt(match[1], 10),
		minor: parseInt(match[2], 10),
		patch: parseInt(match[3], 10),
		isClean: !match[4]
	};
}
function compareTagsDescending(tagA, tagB) {
	const semA = parseTagSemver(tagA);
	const semB = parseTagSemver(tagB);
	if (!semA && !semB) return 0;
	if (!semA) return 1;
	if (!semB) return -1;
	if (semA.major !== semB.major) return semB.major - semA.major;
	if (semA.minor !== semB.minor) return semB.minor - semA.minor;
	if (semA.patch !== semB.patch) return semB.patch - semA.patch;
	if (semA.isClean && !semB.isClean) return -1;
	if (!semA.isClean && semB.isClean) return 1;
	return tagB.localeCompare(tagA);
}
function extractTagsFromLsRemote(stdout) {
	const tags = /* @__PURE__ */ new Set();
	const lines = stdout.split("\n");
	for (const line of lines) {
		const match = line.replace(/\^\{\}$/, "").trim().match(/refs\/tags\/(v?\d+\.\d+\.\d+(?:-[\w.-]+)?)$/);
		if (match && match[1]) {
			const tag = match[1].startsWith("v") ? match[1] : `v${match[1]}`;
			tags.add(tag);
		}
	}
	return Array.from(tags).sort(compareTagsDescending);
}
function resolveLatestAuditorTag(repoUrl = "https://github.com/francogp/auditor.git") {
	try {
		const sortedTags = extractTagsFromLsRemote(childProcess.execSync(`git ls-remote --tags ${repoUrl}`, {
			encoding: "utf-8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			timeout: 1e4
		}));
		if (sortedTags.length > 0 && sortedTags[0]) return sortedTags[0];
	} catch {}
	return `v${AUDITOR_VERSION.split("-")[0]}`;
}
function updateAuditorPackage(options = {}) {
	const projectRoot = findHostProjectRoot(options.cwd ?? process.cwd(), options.stopAt);
	const hostPkgJsonPath = path.join(projectRoot, "package.json");
	if (!fs.existsSync(hostPkgJsonPath)) return {
		success: false,
		projectRoot,
		previousVersion: "(n/a)",
		newVersion: "(n/a)",
		updated: false,
		error: `package.json not found in ${projectRoot}`
	};
	let hostPkg;
	try {
		hostPkg = JSON.parse(fs.readFileSync(hostPkgJsonPath, "utf-8"));
	} catch (err) {
		return {
			success: false,
			projectRoot,
			previousVersion: "(n/a)",
			newVersion: "(n/a)",
			updated: false,
			error: `Failed to read package.json: ${err.message}`
		};
	}
	const deps = hostPkg.dependencies || {};
	const devDeps = hostPkg.devDependencies || {};
	if (!Boolean(devDeps["@francogp/auditor"] || deps["@francogp/auditor"])) return {
		success: false,
		projectRoot,
		previousVersion: "(undeclared)",
		newVersion: "(undeclared)",
		updated: false,
		error: "Package @francogp/auditor is not declared in dependencies or devDependencies."
	};
	const targetTag = options.targetVersion ? options.targetVersion.startsWith("v") ? options.targetVersion : `v${options.targetVersion}` : resolveLatestAuditorTag();
	const npmArgs = [
		"install",
		"-D",
		`github:francogp/auditor#${targetTag}`
	];
	ensureNpmrcAllowGit(projectRoot);
	const previousVersion = readInstalledAuditorVersion(projectRoot);
	if (!options.silent) {
		console.log(renderBanner("@FRANCOGP/AUDITOR - NATIVE PACKAGE UPDATER", `Directory: ${projectRoot}  |  Current Version: ${previousVersion}  |  Target: ${targetTag}`));
		console.log(styleText("cyan", `[Update] Running native update via npm ${npmArgs.join(" ")}...\n`));
	}
	const proc = runNpmCommandSync(npmArgs, {
		cwd: projectRoot,
		stdio: options.silent ? "pipe" : "inherit",
		encoding: "utf-8"
	});
	if (proc.error || proc.status !== 0) return {
		success: false,
		projectRoot,
		previousVersion,
		newVersion: previousVersion,
		updated: false,
		error: proc.error?.message || proc.stderr?.toString() || `npm ${npmArgs[0]} failed with exit code ${proc.status}`
	};
	const newVersion = readInstalledAuditorVersion(projectRoot);
	const updated = previousVersion !== newVersion;
	const agentInitResult = initAgentSkill({ targetDir: projectRoot });
	if (!options.silent && agentInitResult.created) console.log(styleText("green", `[OK] ${agentInitResult.message}\n`));
	const envSyncResult = syncEnvScripts({ targetDir: projectRoot });
	if (!options.silent && envSyncResult.filesUpdated.length > 0) console.log(styleText("green", `[OK] ${envSyncResult.message}\n`));
	runAuditorFixAutoRemediation(projectRoot, options.silent);
	return {
		success: true,
		projectRoot,
		previousVersion,
		newVersion,
		updated
	};
}
function runAuditorFixAutoRemediation(projectRoot, silent) {
	try {
		const isSelf = isSelfProviderProject(projectRoot);
		if (!silent) console.log(styleText("cyan", "[Fix] Running auditor fix automatically to synchronize scripts and configs...\n"));
		const hostAuditorPkg = path.join(projectRoot, "node_modules/@francogp/auditor/dist/cli/audit_full.js");
		let cmd = process.platform === "win32" ? "npm.cmd" : "npm";
		let args = ["run", "auditor:fix"];
		if (!isSelf && fs.existsSync(hostAuditorPkg)) {
			cmd = "node";
			args = [
				"--permission",
				"--allow-fs-read=*",
				"--allow-fs-write=*",
				"--allow-child-process",
				"--allow-addons",
				hostAuditorPkg,
				"fix"
			];
		}
		const pkgPath = path.join(projectRoot, "package.json");
		const pkgBefore = fs.existsSync(pkgPath) ? fs.readFileSync(pkgPath, "utf-8") : "";
		const isWindows = process.platform === "win32";
		const proc = childProcess.spawnSync(cmd, args, {
			cwd: projectRoot,
			stdio: silent ? "pipe" : "inherit",
			encoding: "utf-8",
			shell: cmd === "npm.cmd" && isWindows
		});
		const pkgAfter = fs.existsSync(pkgPath) ? fs.readFileSync(pkgPath, "utf-8") : "";
		if (pkgBefore && pkgAfter && pkgBefore !== pkgAfter) {
			const npmCmd = isWindows ? "npm.cmd" : "npm";
			childProcess.spawnSync(npmCmd, [
				"install",
				"--ignore-scripts",
				"--no-audit",
				"--no-fund"
			], {
				cwd: projectRoot,
				stdio: silent ? "pipe" : "inherit",
				encoding: "utf-8",
				shell: isWindows
			});
		}
		return proc.status === 0;
	} catch {
		return false;
	}
}
const UPDATE_PACKAGE_ARGS = {
	...COMMON_CLI_ARGS,
	silent: {
		type: "boolean",
		alias: "s",
		default: false,
		description: "Suppress console progress output"
	}
};
function runCli() {
	const parsed = parseCittyArgs(UPDATE_PACKAGE_ARGS, getProcessCliArgs());
	const targetVersion = parsed._.map(String)[0];
	const result = updateAuditorPackage({
		targetVersion,
		silent: Boolean(parsed.silent)
	});
	if (!result.success) {
		console.error(styleText("red", `\n[Error] Failed to update @francogp/auditor: ${result.error}`));
		process.exit(1);
	}
	if (!resolveHumanModeFromArgs(parsed)) {
		const status = result.updated ? "UPDATED" : "UP-TO-DATE";
		console.log(`[Update] Package: @francogp/auditor | Previous: ${result.previousVersion} | Installed: ${result.newVersion} | Status: ${status}`);
		process.exit(0);
	}
	const columns = [{
		header: "PARAMETER",
		width: 26,
		render: (r) => r.param
	}, {
		header: "VALUE / STATUS",
		width: 48,
		render: (r) => r.val
	}];
	const statusVal = result.updated ? "SUCCESSFULLY UPDATED" : "ALREADY UP TO DATE (NO CHANGES)";
	const rows = [
		{
			param: "Package",
			val: "@francogp/auditor"
		},
		{
			param: "Previous Version",
			val: result.previousVersion
		},
		{
			param: "Installed Version",
			val: result.newVersion
		},
		{
			param: "Status",
			val: statusVal
		}
	];
	console.log("\n" + renderBoxTable(columns, rows));
	if (result.updated) console.log(styleText("green", `\n[OK] @francogp/auditor was successfully updated from v${result.previousVersion} to v${result.newVersion}.\n`));
	else console.log(styleText("cyan", `\n[Notice] @francogp/auditor is already up to date (v${result.newVersion}).\n`));
	process.exit(0);
}
if (isMainModule(import.meta.url)) {
	bootstrapCliProject();
	runCli();
}
//#endregion
export { compareTagsDescending, extractTagsFromLsRemote, findHostProjectRoot, parseTagSemver, readInstalledAuditorVersion, resolveLatestAuditorTag, runAuditorFixAutoRemediation, runCli, updateAuditorPackage };
