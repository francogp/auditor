#!/usr/bin/env -S node --experimental-strip-types
import "../core/auditConfig.js";
import { evaluateProjectDependencies, findDeclaredDependency, getAuditorMaximumVersions, getAuditorMinimumVersions, normalizeToCaretRange, pruneStaleVitestClusterFromLockfile, readHostInstalledAuditorMinimums, repairPackageJsonMinimumRanges } from "../core/auditorMinimums.js";
import { isSelfProviderProject } from "../core/auditProjectIdentity.js";
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs, resolveHumanModeFromArgs } from "../core/cli/cittyHarness.js";
import { runNpmCommandSync } from "../core/npmCommandUtils.js";
import { ensureNpmrcAllowGit } from "../core/npmrcAllowGit.js";
import { getPackageJson, writePackageJson } from "../core/packageJson.js";
import { safeJsonParse, safeReadFileSync, tryOrNull } from "../core/safeUtils.js";
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { AUDITOR_VERSION } from "../core/version.js";
import { syncPackageJsonForVitePlus } from "../core/vitePlusConfigSync.js";
import { bootstrapCliProject, isMainModule } from "./cliUtils.js";
import { initAgentSkill } from "./init_agent.js";
import { syncEnvScripts } from "./sync_env_scripts.js";
import path from "node:path";
import fs from "node:fs";
import { styleText } from "node:util";
import childProcess from "node:child_process";
// src/cli/update_package.ts
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
	const pkgJsonPath = path.join(projectRoot, "node_modules/@francogp/auditor/package.json");
	if (fs.existsSync(pkgJsonPath)) {
		const raw = safeReadFileSync(pkgJsonPath);
		if (raw) return safeJsonParse(raw)?.version || "(unknown)";
	}
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
	const latestTag = tryOrNull(() => {
		const sortedTags = extractTagsFromLsRemote(childProcess.execFileSync("git", [
			"ls-remote",
			"--tags",
			repoUrl
		], {
			encoding: "utf-8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			timeout: 1e4
		}));
		return sortedTags.length > 0 && sortedTags[0] ? sortedTags[0] : null;
	});
	if (latestTag) return latestTag;
	return `v${AUDITOR_VERSION.split("-")[0]}`;
}
function preSyncHostPackageJson(projectRoot) {
	let modified = false;
	if (tryOrNull(() => syncPackageJsonForVitePlus(projectRoot))) modified = true;
	const minimums = getAuditorMinimumVersions();
	let currentPkg = getPackageJson(projectRoot, true);
	const cittyFloor = minimums.citty;
	if (currentPkg && cittyFloor && !findDeclaredDependency(currentPkg, "citty")) {
		currentPkg = {
			...currentPkg,
			devDependencies: {
				...currentPkg.devDependencies,
				citty: normalizeToCaretRange(cittyFloor)
			}
		};
		writePackageJson(projectRoot, currentPkg);
		modified = true;
	}
	if (currentPkg) {
		if (repairPackageJsonMinimumRanges(projectRoot, currentPkg, minimums, getAuditorMaximumVersions()).modified) modified = true;
	}
	if (pruneStaleVitestClusterFromLockfile(projectRoot)) modified = true;
	return modified;
}
function installMinimumBatch(options) {
	const { projectRoot, specs, isDev, silent } = options;
	if (specs.length === 0) return { ok: true };
	const scopeLabel = isDev ? "development" : "production";
	if (!silent) console.log(styleText("cyan", `[DEPS] Enforcing mandatory ${scopeLabel} minimums: ${specs.join(", ")}...\n`));
	const npmArgs = isDev ? [
		"install",
		"-D",
		"--no-audit",
		"--no-fund",
		...specs
	] : [
		"install",
		"--no-audit",
		"--no-fund",
		...specs
	];
	const proc = runNpmCommandSync(npmArgs, {
		cwd: projectRoot,
		stdio: silent ? "pipe" : "inherit",
		encoding: "utf-8"
	});
	if (proc.error || proc.status !== 0) return {
		ok: false,
		error: proc.error?.message || proc.stderr?.toString() || `Failed to install mandatory ${scopeLabel} minimums (exit code ${proc.status})`
	};
	return { ok: true };
}
function enforceHostMinimumDependencies(projectRoot, silent) {
	const installedMinimums = readHostInstalledAuditorMinimums(projectRoot);
	if (installedMinimums) {
		const hostPkg = getPackageJson(projectRoot, true);
		if (hostPkg) repairPackageJsonMinimumRanges(projectRoot, hostPkg, installedMinimums, getAuditorMaximumVersions());
	}
	const report = evaluateProjectDependencies(projectRoot, installedMinimums ?? void 0);
	const prodUpdates = [...report.prodUpdates];
	const devUpdates = [...report.devUpdates];
	const lockPath = path.join(projectRoot, "package-lock.json");
	const lockSnapshot = fs.existsSync(lockPath) ? fs.readFileSync(lockPath, "utf-8") : null;
	if (pruneStaleVitestClusterFromLockfile(projectRoot)) {
		const pkgNow = getPackageJson(projectRoot, true);
		const effectiveMinimums = installedMinimums ?? getAuditorMinimumVersions();
		for (const clusterDep of ["vite-plus", "@vitest/coverage-v8"]) {
			const declared = pkgNow ? findDeclaredDependency(pkgNow, clusterDep) : null;
			const floor = effectiveMinimums[clusterDep];
			if (declared && floor) {
				const spec = `${clusterDep}@${floor}`;
				const targetList = declared.isProduction ? prodUpdates : devUpdates;
				if (!targetList.includes(spec)) targetList.push(spec);
			}
		}
	}
	const restoreLockOnFailure = () => {
		if (lockSnapshot !== null) fs.writeFileSync(lockPath, lockSnapshot, "utf-8");
	};
	const prodRes = installMinimumBatch({
		projectRoot,
		specs: prodUpdates,
		isDev: false,
		silent
	});
	if (!prodRes.ok) {
		restoreLockOnFailure();
		return prodRes;
	}
	const devRes = installMinimumBatch({
		projectRoot,
		specs: devUpdates,
		isDev: true,
		silent
	});
	if (!devRes.ok) {
		restoreLockOnFailure();
		return devRes;
	}
	return { ok: true };
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
	const originalPkgRaw = fs.readFileSync(hostPkgJsonPath, "utf-8");
	let hostPkg;
	try {
		hostPkg = JSON.parse(originalPkgRaw);
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
	if (!Boolean(hostPkg.devDependencies?.["@francogp/auditor"] || hostPkg.dependencies?.["@francogp/auditor"])) return {
		success: false,
		projectRoot,
		previousVersion: "(undeclared)",
		newVersion: "(undeclared)",
		updated: false,
		error: "Package @francogp/auditor is not declared in dependencies or devDependencies."
	};
	const targetTag = options.targetVersion ? options.targetVersion.startsWith("v") ? options.targetVersion : `v${options.targetVersion}` : resolveLatestAuditorTag();
	const previousVersion = readInstalledAuditorVersion(projectRoot);
	if (options.checkOnly) {
		const cleanTarget = targetTag.replace(/^v/, "");
		const cleanPrev = previousVersion.replace(/^v/, "");
		return {
			success: true,
			projectRoot,
			previousVersion,
			newVersion: targetTag,
			updated: false,
			updateAvailable: previousVersion === "(not installed)" || previousVersion === "(unknown)" || cleanPrev !== cleanTarget
		};
	}
	const hostLockJsonPath = path.join(projectRoot, "package-lock.json");
	const hostNpmrcPath = path.join(projectRoot, ".npmrc");
	const originalLockRaw = fs.existsSync(hostLockJsonPath) ? fs.readFileSync(hostLockJsonPath, "utf-8") : null;
	const originalNpmrcRaw = fs.existsSync(hostNpmrcPath) ? fs.readFileSync(hostNpmrcPath, "utf-8") : null;
	const restoreHostManifestSnapshot = () => {
		fs.writeFileSync(hostPkgJsonPath, originalPkgRaw, "utf-8");
		if (originalLockRaw !== null) fs.writeFileSync(hostLockJsonPath, originalLockRaw, "utf-8");
		else if (fs.existsSync(hostLockJsonPath)) fs.rmSync(hostLockJsonPath, { force: true });
		if (originalNpmrcRaw !== null) fs.writeFileSync(hostNpmrcPath, originalNpmrcRaw, "utf-8");
		else if (fs.existsSync(hostNpmrcPath)) fs.rmSync(hostNpmrcPath, { force: true });
	};
	const npmArgs = [
		"install",
		"-D",
		`github:francogp/auditor#${targetTag}`
	];
	preSyncHostPackageJson(projectRoot);
	ensureNpmrcAllowGit(projectRoot);
	if (!options.silent) {
		console.log(renderBanner("@FRANCOGP/AUDITOR - NATIVE PACKAGE UPDATER", `Directory: ${projectRoot}  |  Current Version: ${previousVersion}  |  Target: ${targetTag}`));
		console.log(styleText("cyan", `[Update] Running native update via npm ${npmArgs.join(" ")}...\n`));
	}
	const proc = runNpmCommandSync(npmArgs, {
		cwd: projectRoot,
		stdio: options.silent ? "pipe" : "inherit",
		encoding: "utf-8"
	});
	if (proc.error || proc.status !== 0) {
		restoreHostManifestSnapshot();
		return {
			success: false,
			projectRoot,
			previousVersion,
			newVersion: previousVersion,
			updated: false,
			error: proc.error?.message || proc.stderr?.toString() || `npm ${npmArgs[0]} failed with exit code ${proc.status}`
		};
	}
	const newVersion = readInstalledAuditorVersion(projectRoot);
	const updated = previousVersion !== newVersion;
	const agentInitResult = initAgentSkill({ targetDir: projectRoot });
	if (!options.silent && agentInitResult.created) console.log(styleText("green", `[OK] ${agentInitResult.message}\n`));
	const envSyncResult = syncEnvScripts({ targetDir: projectRoot });
	if (!options.silent && envSyncResult.filesUpdated.length > 0) console.log(styleText("green", `[OK] ${envSyncResult.message}\n`));
	runAuditorFixAutoRemediation(projectRoot, options.silent);
	const minEnforcement = enforceHostMinimumDependencies(projectRoot, options.silent);
	if (!minEnforcement.ok) return {
		success: false,
		projectRoot,
		previousVersion,
		newVersion,
		updated,
		error: minEnforcement.error
	};
	const setupHealthy = runAuditorSetupCheck(projectRoot, options.silent);
	if (!options.silent) {
		if (setupHealthy) console.log(styleText("green", "[OK] Phase setup verification passed: Project infrastructure and satellite configurations are healthy.\n"));
		else console.log(styleText("yellow", "[Warning] Phase setup reported unresolved configuration issues. Run \"npm run auditor:setup\" to inspect.\n"));
		console.log(styleText("cyan", "[Tip] Run \"npm run auditor:config\" to discover new hardening opportunities and default settings for your project.\n"));
	}
	return {
		success: true,
		projectRoot,
		previousVersion,
		newVersion,
		updated,
		setupHealthy
	};
}
function runHostAuditorSubprocess(projectRoot, options) {
	const isSelf = isSelfProviderProject(projectRoot);
	if (!options.silent) console.log(styleText("cyan", options.logMessage));
	const hostAuditorPkg = path.join(projectRoot, "node_modules/@francogp/auditor/dist/cli/audit_full.js");
	let cmd = process.platform === "win32" ? "npm.cmd" : "npm";
	let args = ["run", options.scriptName];
	if (!isSelf && fs.existsSync(hostAuditorPkg)) {
		cmd = "node";
		args = [
			"--permission",
			"--allow-fs-read=*",
			"--allow-fs-write=*",
			"--allow-child-process",
			"--allow-addons",
			hostAuditorPkg,
			options.directCliArg
		];
	}
	const isWindows = process.platform === "win32";
	return childProcess.spawnSync(cmd, args, {
		cwd: projectRoot,
		stdio: options.silent ? "pipe" : "inherit",
		encoding: "utf-8",
		shell: cmd === "npm.cmd" && isWindows
	});
}
function runAuditorSetupCheck(projectRoot, silent) {
	try {
		return runHostAuditorSubprocess(projectRoot, {
			scriptName: "auditor:setup",
			directCliArg: "phase=setup",
			logMessage: "[Setup] Running auditor phase=setup verification to ensure infrastructure health...\n",
			silent
		}).status === 0;
	} catch {
		return false;
	}
}
function runAuditorFixAutoRemediation(projectRoot, silent) {
	try {
		const pkgPath = path.join(projectRoot, "package.json");
		const pkgBefore = fs.existsSync(pkgPath) ? fs.readFileSync(pkgPath, "utf-8") : "";
		const proc = runHostAuditorSubprocess(projectRoot, {
			scriptName: "auditor:fix",
			directCliArg: "fix",
			logMessage: "[Fix] Running auditor fix automatically to synchronize scripts and configs...\n",
			silent
		});
		const pkgAfter = fs.existsSync(pkgPath) ? fs.readFileSync(pkgPath, "utf-8") : "";
		if (pkgBefore && pkgAfter && pkgBefore !== pkgAfter) {
			pruneStaleVitestClusterFromLockfile(projectRoot);
			runNpmCommandSync([
				"install",
				"--ignore-scripts",
				"--no-audit",
				"--no-fund"
			], {
				cwd: projectRoot,
				stdio: silent ? "pipe" : "inherit",
				encoding: "utf-8"
			});
		}
		return proc.status === 0;
	} catch {
		return false;
	}
}
function renderUpdateHelp() {
	return [
		renderBanner("@FRANCOGP/AUDITOR - NATIVE PACKAGE UPDATER", "Diagnostic & Hermetic Update CLI"),
		"",
		styleText("bold", "USAGE:"),
		"  auditor-update [targetVersion] [options]",
		"  npm run auditor:update -- [targetVersion] [options]",
		"",
		styleText("bold", "ARGUMENTS:"),
		"  targetVersion                Optional target version or tag (e.g. 10.0.0, v10.0.0). Defaults to latest upstream tag.",
		"",
		styleText("bold", "OPTIONS:"),
		"  -c, --check, --dry-run       Check for available updates without modifying files (read-only mode)",
		"  -s, --silent                 Suppress progress output during installation",
		"  -h, --help                   Display this help manual and exit safely",
		"  --human                      Render interactive Box-Drawing summary table",
		"",
		styleText("bold", "READ-ONLY VERSION INSPECTION:"),
		"  To check currently installed or framework version without updating:",
		"  • npm run auditor:version",
		"  • auditor --version",
		""
	].join("\n");
}
const UPDATE_PACKAGE_ARGS = {
	...COMMON_CLI_ARGS,
	targetVersion: {
		type: "positional",
		required: false,
		description: "Target version or tag (e.g. 10.0.0, v10.0.0)"
	},
	check: {
		type: "boolean",
		alias: "c",
		default: false,
		description: "Check for available updates without applying changes (read-only)"
	},
	dryRun: {
		type: "boolean",
		default: false,
		description: "Alias for --check"
	},
	silent: {
		type: "boolean",
		alias: "s",
		default: false,
		description: "Suppress console progress output"
	}
};
function runCli() {
	const rawArgs = getProcessCliArgs();
	const parsed = parseCittyArgs(UPDATE_PACKAGE_ARGS, rawArgs);
	if (Boolean(parsed.help || parsed.targetVersion === "help" || parsed._.includes("help"))) {
		console.log(renderUpdateHelp());
		process.exit(0);
	}
	const isCheckMode = Boolean(parsed.check || parsed.dryRun);
	const targetVersion = typeof parsed.targetVersion === "string" && parsed.targetVersion !== "help" ? parsed.targetVersion : void 0;
	const silent = Boolean(parsed.silent);
	const isHuman = resolveHumanModeFromArgs(parsed);
	const result = updateAuditorPackage({
		targetVersion,
		silent,
		checkOnly: isCheckMode
	});
	if (!result.success) {
		console.error(styleText("red", `\n[Error] Failed to ${isCheckMode ? "check" : "update"} @francogp/auditor: ${result.error}`));
		process.exit(1);
	}
	if (isCheckMode) {
		if (!isHuman) {
			const status = result.updateAvailable ? "UPDATE-AVAILABLE" : "UP-TO-DATE";
			console.log(`[Check] Package: @francogp/auditor | Installed: ${result.previousVersion} | Latest: ${result.newVersion} | Status: ${status}`);
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
		const statusVal = result.updateAvailable ? "UPDATE AVAILABLE" : "UP TO DATE (NO ACTION REQUIRED)";
		const rows = [
			{
				param: "Package",
				val: "@francogp/auditor"
			},
			{
				param: "Installed Version",
				val: result.previousVersion
			},
			{
				param: "Latest Available",
				val: result.newVersion
			},
			{
				param: "Status",
				val: statusVal
			}
		];
		console.log("\n" + renderBoxTable(columns, rows));
		if (result.updateAvailable) console.log(styleText("yellow", `\n[Notice] A newer version of @francogp/auditor is available (v${result.previousVersion} -> ${result.newVersion}).\n         Run "npm run auditor:update" to upgrade.
`));
		else console.log(styleText("green", `\n[OK] @francogp/auditor is already up to date (v${result.previousVersion}).\n`));
		process.exit(0);
	}
	if (!isHuman) {
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
	if (result.updated) {
		console.log(styleText("green", `\n[OK] @francogp/auditor was successfully updated from v${result.previousVersion} to v${result.newVersion}.\n`));
		console.log(styleText("cyan", "[Tip] Run \"npm run auditor:config\" to evaluate recommended defaults and configuration hardening.\n"));
	} else console.log(styleText("cyan", `\n[Notice] @francogp/auditor is already up to date (v${result.newVersion}).\n`));
	process.exit(0);
}
if (isMainModule(import.meta.url)) {
	bootstrapCliProject();
	runCli();
}
export { compareTagsDescending, extractTagsFromLsRemote, findHostProjectRoot, parseTagSemver, preSyncHostPackageJson, readInstalledAuditorVersion, renderUpdateHelp, resolveLatestAuditorTag, runAuditorFixAutoRemediation, runAuditorSetupCheck, runCli, updateAuditorPackage };
