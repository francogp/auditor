import { getAuditConfig, sanitizePath } from "../core/auditConfigLoader.js";
import { parseJsonObjectOutput } from "../core/reportUtils.js";
import "../core/auditConfig.js";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
//#region src/cli/cliUtils.ts
/**
* src/cli/cliUtils.ts
*
* Shared utilities for CLI tools and entrypoints.
*/
/**
* Checks whether the current module is being executed directly as the CLI entrypoint.
*/
function isMainModule(metaUrl, binaryAliases) {
	const scriptArg = process.argv[1];
	if (!scriptArg) return false;
	try {
		const targetPath = path.resolve(fileURLToPath(metaUrl));
		let realScript;
		try {
			realScript = path.resolve(fs.realpathSync(scriptArg));
		} catch {
			realScript = path.resolve(scriptArg);
		}
		if (process.platform === "win32" ? realScript.toLowerCase() === targetPath.toLowerCase() : realScript === targetPath) return true;
		const targetBase = path.basename(targetPath, path.extname(targetPath));
		const scriptBase = path.basename(realScript, path.extname(realScript));
		if (targetBase.toLowerCase() === scriptBase.toLowerCase()) return true;
		if (binaryAliases && binaryAliases.some((alias) => scriptBase.toLowerCase() === alias.toLowerCase())) return true;
		return false;
	} catch {
		return false;
	}
}
const DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES = 52428800;
const DEFAULT_SUBPROCESS_TIMEOUT_MS = 0;
/**
* Early Pre-flight CLI Bootstrap:
* Parses --project=<path>, --project <path>, project=<path>, -p <path>, -p=<path>
* before any configuration load or sub-auditor discovery.
* If targeting a remote project, verifies the directory and package.json,
* records AUDITOR_HOME_DIR and AUDIT_PROJECT_ROOT, and switches process.cwd().
*/
function bootstrapCliProject(argv = process.argv) {
	let targetCandidate = null;
	const rawHome = process.env.AUDITOR_HOME_DIR || process.cwd();
	const auditorHomeDir = sanitizePath(rawHome);
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg) continue;
		if (arg.startsWith("--project=")) {
			targetCandidate = arg.slice(10);
			break;
		}
		if (arg === "--project" && i + 1 < argv.length) {
			targetCandidate = argv[i + 1] ?? null;
			break;
		}
		if (arg.startsWith("project=")) {
			targetCandidate = arg.slice(8);
			break;
		}
		if (arg === "-p" && i + 1 < argv.length) {
			targetCandidate = argv[i + 1] ?? null;
			break;
		}
		if (arg.startsWith("-p=")) {
			targetCandidate = arg.slice(3);
			break;
		}
	}
	if (!targetCandidate && process.env.AUDIT_PROJECT_ROOT) targetCandidate = process.env.AUDIT_PROJECT_ROOT;
	if (!targetCandidate) return {
		projectRoot: auditorHomeDir,
		isRemote: false,
		auditorHomeDir
	};
	const cleanCandidate = sanitizePath(targetCandidate);
	const resolved = path.resolve(auditorHomeDir, cleanCandidate);
	if (!fs.existsSync(resolved)) throw new Error(`[Remote Execution Error] Target project directory does not exist: '${resolved}'`);
	if (!fs.statSync(resolved).isDirectory()) throw new Error(`[Remote Execution Error] Target project path is not a directory: '${resolved}'`);
	if (!fs.existsSync(path.join(resolved, "package.json"))) throw new Error(`[Remote Execution Error] Target directory does not contain a package.json: '${resolved}'`);
	process.env.AUDITOR_HOME_DIR = auditorHomeDir;
	process.env.AUDIT_PROJECT_ROOT = resolved;
	const currentResolved = path.resolve(process.cwd());
	const targetResolved = path.resolve(resolved);
	const isRemote = path.resolve(auditorHomeDir) !== targetResolved;
	if (currentResolved !== targetResolved) process.chdir(targetResolved);
	if (argv === process.argv && process.argv.length >= 2) {
		const stripped = stripProjectCliArgs(process.argv.slice(2));
		process.argv = [
			process.argv[0],
			process.argv[1],
			...stripped
		];
	}
	return {
		projectRoot: targetResolved,
		isRemote,
		auditorHomeDir
	};
}
/**
* Strips project-targeting CLI flags (--project, project=, -p) from an argument list.
*/
function stripProjectCliArgs(argv) {
	const strippedArgs = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg) continue;
		if (arg.startsWith("--project=") || arg.startsWith("project=") || arg.startsWith("-p=")) continue;
		if ((arg === "--project" || arg === "-p") && i + 1 < argv.length) {
			i++;
			continue;
		}
		strippedArgs.push(arg);
	}
	return strippedArgs;
}
/** Canonical flags indicating user requested human console output. */
const HUMAN_CONSOLE_FLAGS = /* @__PURE__ */ new Set([
	"human",
	"--human",
	"format=human",
	"verbose",
	"--verbose",
	"format=verbose"
]);
/**
* Resolves whether the current invocation requested human Box-Drawing output.
*/
function isHumanConsoleMode(options, argv = process.argv) {
	if (options?.human === true || options?.verbose === true || options?.format === "human" || options?.format === "verbose") return true;
	return argv.some((arg) => HUMAN_CONSOLE_FLAGS.has(arg));
}
/**
* Runs a Node.js CLI binary with standard permission warning suppressions and returns combined stdout + stderr.
*/
function executeNodeCli(binPath, args, options) {
	const proc = spawnSync("node", [
		"--disable-warning=PERM0001",
		"--disable-warning=PERM0002",
		"--disable-warning=ExperimentalWarning",
		binPath,
		...args
	], {
		cwd: options?.cwd || process.cwd(),
		encoding: "utf-8",
		maxBuffer: options?.maxBuffer ?? 52428800,
		timeout: options?.timeout ?? 0
	});
	return `${proc.stdout || ""}\n${proc.stderr || ""}`;
}
/**
* Resolves a binary or script path inside node_modules, searching project root and parent traversals.
*/
function resolveNodeModuleBin(projectRoot, relativeBinPath) {
	let current = path.resolve(projectRoot);
	for (let i = 0; i < 5; i++) {
		const candidate = path.resolve(current, "node_modules", relativeBinPath);
		if (fs.existsSync(candidate)) return candidate;
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	if (process.env.AUDITOR_HOME_DIR) {
		const cleanHome = sanitizePath(process.env.AUDITOR_HOME_DIR);
		const homeCandidate = path.resolve(cleanHome, "node_modules", relativeBinPath);
		if (fs.existsSync(homeCandidate)) return homeCandidate;
	}
	return path.resolve(projectRoot, "node_modules", relativeBinPath);
}
function resolveBinFromPackageJson(pkgDir, packageName) {
	const pkgJsonPath = path.join(pkgDir, "package.json");
	if (!fs.existsSync(pkgJsonPath)) return null;
	try {
		const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
		const relBin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.[packageName] || (pkg.bin ? Object.values(pkg.bin)[0] : void 0);
		if (typeof relBin === "string") {
			const binFile = path.resolve(pkgDir, relBin);
			if (fs.existsSync(binFile)) return binFile;
		}
	} catch {}
	return null;
}
/**
* Resolves the executable binary file of a package, inspecting package.json or createRequire.
*/
function resolvePackageBin(packageName, options) {
	try {
		const pkgJsonUrl = import.meta.resolve(`${packageName}/package.json`);
		const pkgJsonPath = fileURLToPath(pkgJsonUrl);
		const fromPkgJson = resolveBinFromPackageJson(path.dirname(pkgJsonPath), packageName);
		if (fromPkgJson) return fromPkgJson;
	} catch {}
	const lookupPaths = Array.from(new Set([
		options?.projectRoot,
		process.env.AUDITOR_HOME_DIR,
		process.cwd()
	].filter((p) => Boolean(p))));
	const req = createRequire(import.meta.url);
	try {
		const mainPath = req.resolve(packageName, { paths: lookupPaths.length > 0 ? lookupPaths : void 0 });
		let dir = path.dirname(mainPath);
		while (dir && !fs.existsSync(path.join(dir, "package.json"))) {
			const parent = path.dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
		const fromMainDir = resolveBinFromPackageJson(dir, packageName);
		if (fromMainDir) return fromMainDir;
	} catch {}
	if (options?.fallbackRelativeBin) {
		if (options.projectRoot) {
			const candidate = resolveNodeModuleBin(options.projectRoot, path.join(packageName, options.fallbackRelativeBin));
			if (fs.existsSync(candidate)) return candidate;
		}
		if (process.env.AUDITOR_HOME_DIR) {
			const cleanHome = sanitizePath(process.env.AUDITOR_HOME_DIR);
			const homeCandidate = path.resolve(cleanHome, "node_modules", packageName, options.fallbackRelativeBin);
			if (fs.existsSync(homeCandidate)) return homeCandidate;
		}
	}
	return null;
}
/**
* Runs a CLI tool via spawnSync, piping output directly to an isolated ephemeral file descriptor.
* Completely avoids stdout truncation and in-memory heap spikes.
*/
function executeCliToFile(command, args, outputFilePath, options) {
	const outFd = fs.openSync(outputFilePath, "w");
	try {
		spawnSync(command, args, {
			cwd: options?.cwd || process.cwd(),
			stdio: [
				"ignore",
				outFd,
				"pipe"
			],
			shell: options?.shell ?? true,
			encoding: "utf-8",
			maxBuffer: options?.maxBuffer ?? 52428800,
			timeout: options?.timeout ?? 0
		});
	} finally {
		fs.closeSync(outFd);
	}
}
/**
* Runs a CLI tool via spawnSync, pipes output to an isolated ephemeral file descriptor,
* and parses the resulting JSON content cleanly without stdout truncation or heap spikes.
*/
function executeCliAndReadJson(command, args, outputFilePath, options) {
	executeCliToFile(command, args, outputFilePath, options);
	if (!fs.existsSync(outputFilePath)) return null;
	try {
		const rawContent = fs.readFileSync(outputFilePath, "utf-8");
		if (rawContent.trim()) return JSON.parse(rawContent);
	} catch {
		return null;
	}
	return null;
}
/**
* Resolves coverage CLI arguments for Fallow commands (health, complexity).
* Discovers configured coverage path or default 'coverage/coverage-final.json'.
*/
function resolveCoverageArgs(projectRoot = process.cwd()) {
	const configuredPath = getAuditConfig().fallow?.coverage?.path;
	if (configuredPath && fs.existsSync(path.resolve(projectRoot, configuredPath))) return ["--coverage", path.resolve(projectRoot, configuredPath)];
	const defaultCoveragePath = path.resolve(projectRoot, "coverage/coverage-final.json");
	if (fs.existsSync(defaultCoveragePath)) return ["--coverage", defaultCoveragePath];
	return [];
}
/**
* Executes a Fallow sub-command with JSON formatting, returning parsed object payload and exit code.
*/
function executeFallowJsonCommand(fallowBin, subCommandArgs, projectRoot = process.cwd()) {
	const proc = spawnSync("node", [fallowBin, ...subCommandArgs], {
		cwd: projectRoot,
		encoding: "utf8",
		stdio: [
			"pipe",
			"pipe",
			"pipe"
		]
	});
	return {
		parsed: parseJsonObjectOutput(proc.stdout),
		status: proc.status ?? 0,
		rawOutput: (proc.stderr || proc.stdout || "").trim()
	};
}
//#endregion
export { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES, DEFAULT_SUBPROCESS_TIMEOUT_MS, HUMAN_CONSOLE_FLAGS, bootstrapCliProject, executeCliAndReadJson, executeCliToFile, executeFallowJsonCommand, executeNodeCli, isHumanConsoleMode, isMainModule, resolveCoverageArgs, resolveNodeModuleBin, resolvePackageBin, stripProjectCliArgs };
