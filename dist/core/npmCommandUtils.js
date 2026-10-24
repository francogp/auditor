import { tryOrNull } from "./safeUtils.js";
import { getPackageJson } from "./packageJson.js";
import path from "node:path";
import fs from "node:fs";
import childProcess from "node:child_process";
// src/core/npmCommandUtils.ts
/**
* src/core/npmCommandUtils.ts
*
* CANONICAL VITE+ (vp), NPM & NPX COMMAND UTILITIES (Node.js 26+)
* Provides shared parsers, package scripts / binaries resolvers, and violation evaluators
* for both documentation auditors (Markdown) and executable script auditors (Shell, PowerShell, Docker, CI).
*/
const VALID_NPM_BUILTINS = /* @__PURE__ */ new Set([
	"access",
	"adduser",
	"audit",
	"bugs",
	"cache",
	"ci",
	"completion",
	"config",
	"dedupe",
	"deprecate",
	"diff",
	"dist-tag",
	"docs",
	"doctor",
	"edit",
	"empty",
	"exec",
	"explain",
	"explore",
	"find-dupes",
	"fund",
	"get",
	"help",
	"hook",
	"init",
	"install",
	"install-ci-test",
	"install-test",
	"link",
	"ll",
	"login",
	"logout",
	"ls",
	"org",
	"outdated",
	"owner",
	"pack",
	"ping",
	"pkg",
	"prefix",
	"profile",
	"prune",
	"publish",
	"rebuild",
	"repo",
	"restart",
	"root",
	"run",
	"run-script",
	"search",
	"set",
	"set-script",
	"shrinkwrap",
	"star",
	"stars",
	"start",
	"stop",
	"team",
	"test",
	"token",
	"uninstall",
	"unpublish",
	"unstar",
	"update",
	"version",
	"view",
	"whoami",
	"info",
	"show",
	"why",
	"query",
	"c",
	"i",
	"r",
	"rb",
	"rm",
	"s",
	"se",
	"t",
	"tst",
	"up",
	"v"
]);
const VALID_VP_BUILTINS = /* @__PURE__ */ new Set([
	"dev",
	"build",
	"preview",
	"test",
	"check",
	"lint",
	"fmt",
	"pack",
	"run",
	"exec",
	"dlx",
	"create",
	"migrate",
	"env",
	"toolchain",
	"upgrade",
	"install",
	"add",
	"remove",
	"update",
	"config",
	"help"
]);
const COMMAND_INVOCATION_TYPES = [
	"npm-run",
	"npm-direct",
	"npx",
	"vp-run",
	"vp-direct",
	"vp-dlx"
];
const PLACEHOLDER_EXACT_NAMES = /* @__PURE__ */ new Set([
	"xxx",
	"target",
	"name",
	"script",
	"script-name",
	"command",
	"cmd",
	"bin",
	"arg",
	"package-name",
	"paquete"
]);
function isPlaceholder(token) {
	if (!token) return true;
	const t = token.trim();
	return t.startsWith("<") || t.endsWith(">") || t.startsWith("[") || t.endsWith("]") || t.startsWith("{") || t.endsWith("}") || t.startsWith("$") || t.includes("...") || t.includes("${") || t.includes("*") || t.includes("_or_") || t.startsWith("sim_") || t.endsWith(":") || t.includes(":*") || PLACEHOLDER_EXACT_NAMES.has(t);
}
function addPackageDependenciesToBins(deps, declaredBins) {
	for (const dep of Object.keys(deps ?? {})) {
		declaredBins.add(dep);
		if (dep.startsWith("@")) {
			const sub = dep.split("/")[1];
			if (sub) declaredBins.add(sub);
		}
	}
}
function populateBinsFromPackageJson(rootDir, scripts, declaredBins) {
	const pkg = getPackageJson(rootDir);
	if (!pkg) return;
	if (pkg.scripts) for (const k of Object.keys(pkg.scripts)) scripts.add(k);
	if (typeof pkg.bin === "string" && pkg.name) {
		const binName = pkg.name.startsWith("@") ? pkg.name.split("/")[1] : pkg.name;
		if (binName) declaredBins.add(binName);
	} else if (pkg.bin && typeof pkg.bin === "object") for (const k of Object.keys(pkg.bin)) declaredBins.add(k);
	addPackageDependenciesToBins(pkg.dependencies, declaredBins);
	addPackageDependenciesToBins(pkg.devDependencies, declaredBins);
}
function populateInstalledBins(binDir, installedBins) {
	const entries = tryOrNull(() => fs.existsSync(binDir) ? fs.readdirSync(binDir) : []) ?? [];
	for (const entry of entries) {
		const cleanName = entry.replace(/\.(cmd|ps1|exe)$/i, "");
		installedBins.add(cleanName);
	}
	installedBins.add("node");
	installedBins.add("npm");
	installedBins.add("npx");
	installedBins.add("git");
	installedBins.add("vp");
	installedBins.add("vpr");
	installedBins.add("vpx");
}
function loadPackageScriptsAndBins(rootDir) {
	const scripts = /* @__PURE__ */ new Set();
	const declaredBins = /* @__PURE__ */ new Set();
	const installedBins = /* @__PURE__ */ new Set();
	populateBinsFromPackageJson(rootDir, scripts, declaredBins);
	populateInstalledBins(path.resolve(rootDir, "node_modules/.bin"), installedBins);
	return {
		scripts,
		declaredBins,
		installedBins
	};
}
const KNOWN_OPTIONAL_ENVIRONMENT_HOOKS = ["env:post-setup", "env:pre-setup"];
const KNOWN_OPTIONAL_ENVIRONMENT_HOOKS_SET = new Set(KNOWN_OPTIONAL_ENVIRONMENT_HOOKS);
function cleanTarget(raw) {
	let cleaned = raw.trim();
	cleaned = cleaned.replace(/^[([{<"'`]+/, "");
	cleaned = cleaned.replace(/[)\]}>"'`,.:;]+$/, "");
	return cleaned;
}
function extractMatchingCommands(regex, line, lineNum, type, out, rawText, filter) {
	regex.lastIndex = 0;
	let match;
	while ((match = regex.exec(line)) !== null) {
		const rawTarget = match[1];
		if (isPlaceholder(rawTarget)) continue;
		const target = cleanTarget(rawTarget);
		if (!target || target.startsWith("-") || isPlaceholder(target)) continue;
		if (filter && !filter(target, match)) continue;
		out.push({
			lineNum,
			rawText,
			type,
			target
		});
	}
}
const VP_RUN_REGEX = /\b(?:vp\s+run|vpr)\s+([^\s;&|'"`]+)/g;
const VP_DIRECT_REGEX = /\bvp\s+([^\s;&|'"`]+)/g;
const VP_DLX_REGEX = /\b(?:vp\s+dlx|vpx)\s+(?:-[\w-]+(?:=\S+)?\s+)*([^\s;&|'"`]+)/g;
const NPM_RUN_REGEX = /\b(?:npm|pnpm|bun|yarn)\s+run\s+([^\s;&|'"`]+)/g;
const NPM_DIRECT_REGEX = /\bnpm\s+([^\s;&|'"`]+)/g;
const NPX_REGEX = /\b(?:npx|pnpm\s+dlx|yarn\s+dlx|bunx)\s+(?:-[\w-]+(?:=\S+)?\s+)*([^\s;&|'"`]+)/g;
const VP_IGNORED_DIRECT_COMMANDS = /* @__PURE__ */ new Set([
	"run",
	"dlx",
	"exec"
]);
const NPM_IGNORED_DIRECT_COMMANDS = /* @__PURE__ */ new Set(["run"]);
function isValidDirectCliCommand(target, match, line, ignoredSubcommands) {
	if (ignoredSubcommands.has(target)) return false;
	if (/[=<>&|!]/.test(target)) return false;
	const prefix = line.slice(Math.max(0, match.index - 5), match.index);
	return !/run\s*$/i.test(prefix);
}
/**
* Extracts Vite+ (vp), npm, and npx invocations from a single line of text.
*/
function extractCommandsFromLine(line, lineNum, out, overrideRawText) {
	if (!line) return;
	const rawText = overrideRawText ?? line.trim();
	extractMatchingCommands(VP_RUN_REGEX, line, lineNum, "vp-run", out, rawText);
	extractMatchingCommands(VP_DIRECT_REGEX, line, lineNum, "vp-direct", out, rawText, (target, match) => isValidDirectCliCommand(target, match, line, VP_IGNORED_DIRECT_COMMANDS));
	extractMatchingCommands(VP_DLX_REGEX, line, lineNum, "vp-dlx", out, rawText);
	extractMatchingCommands(NPM_RUN_REGEX, line, lineNum, "npm-run", out, rawText);
	extractMatchingCommands(NPM_DIRECT_REGEX, line, lineNum, "npm-direct", out, rawText, (target, match) => isValidDirectCliCommand(target, match, line, NPM_IGNORED_DIRECT_COMMANDS));
	extractMatchingCommands(NPX_REGEX, line, lineNum, "npx", out, rawText);
}
function evaluateBinaryExecution(cmd, env, runnerName) {
	const binName = cmd.target.startsWith("@") ? cmd.target.split("/")[1] || cmd.target : cmd.target;
	if (!(env.installedBins.has(binName) || env.declaredBins.has(cmd.target) || env.declaredBins.has(binName) || env.allowedNpx.has(cmd.target) || env.allowedNpx.has(binName))) {
		let detail = runnerName === "npx" ? `does not exist in node_modules/.bin nor is declared in package.json or allowedNpxBinaries.` : `does not exist nor is declared in dependencies.`;
		if (cmd.target === "vite" && runnerName === "npx") detail += ` In projects governed by Vite+, use 'vp dev' or 'node_modules/.bin/vite' instead of 'npx vite'.`;
		return {
			kind: "unregistered-npx",
			message: `Binary '${cmd.target}' executed via ${runnerName} ${detail}`,
			context: cmd.rawText,
			line: cmd.lineNum
		};
	}
	return null;
}
function evaluateVpDirectCommand(cmd, env) {
	if (VALID_VP_BUILTINS.has(cmd.target)) return null;
	if (env.scripts.has(cmd.target)) return {
		kind: "invalid-npm-syntax",
		message: `Incorrect syntax: '${cmd.target}' is a project script, not a native Vite+ command. Use 'vp run ${cmd.target}' or 'vpr ${cmd.target}'.`,
		context: cmd.rawText,
		line: cmd.lineNum
	};
	return {
		kind: "invalid-npm-syntax",
		message: `'vp ${cmd.target}' is not a native Vite+ command (${Array.from(VALID_VP_BUILTINS).join(", ")}).`,
		context: cmd.rawText,
		line: cmd.lineNum
	};
}
function evaluateNpmDirectCommand(cmd, env) {
	if (VALID_NPM_BUILTINS.has(cmd.target)) {
		if (cmd.target === "test" && !env.scripts.has("test")) return {
			kind: "unregistered-npm",
			message: `Command 'npm test' requires a 'test' script in package.json.`,
			context: cmd.rawText,
			line: cmd.lineNum
		};
		return null;
	}
	if (env.scripts.has(cmd.target)) return {
		kind: "invalid-npm-syntax",
		message: `Incorrect syntax: executed 'npm ${cmd.target}', but must be 'npm run ${cmd.target}'.`,
		context: cmd.rawText,
		line: cmd.lineNum
	};
	return {
		kind: "invalid-npm-syntax",
		message: `'npm ${cmd.target}' is not a native npm command nor a registered script.`,
		context: cmd.rawText,
		line: cmd.lineNum
	};
}
function evaluateGenericCommandViolation(cmd, env) {
	if (isPlaceholder(cmd.target)) return null;
	switch (cmd.type) {
		case "vp-run":
			if (env.scripts.has(cmd.target) || KNOWN_OPTIONAL_ENVIRONMENT_HOOKS_SET.has(cmd.target)) return null;
			return {
				kind: "unregistered-npm",
				message: `Command 'vp run ${cmd.target}' (or 'vpr ${cmd.target}') is not registered in package.json.scripts or run.tasks.`,
				context: cmd.rawText,
				line: cmd.lineNum
			};
		case "vp-direct": return evaluateVpDirectCommand(cmd, env);
		case "vp-dlx": return evaluateBinaryExecution(cmd, env, "vp dlx / vpx");
		case "npm-run":
			if (env.scripts.has(cmd.target) || KNOWN_OPTIONAL_ENVIRONMENT_HOOKS_SET.has(cmd.target)) return null;
			return {
				kind: "unregistered-npm",
				message: `Command 'npm run ${cmd.target}' is not registered in package.json.scripts.`,
				context: cmd.rawText,
				line: cmd.lineNum
			};
		case "npm-direct": return evaluateNpmDirectCommand(cmd, env);
		case "npx": return evaluateBinaryExecution(cmd, env, "npx");
		default: return null;
	}
}
/**
* Resolves the platform-specific npm executable and shell requirement.
* On Windows, npm is a batch script ('npm.cmd'). Node.js spawnSync requires 'npm.cmd'
* with shell: true to prevent EINVAL (CVE-2024-27980 mitigation) or ENOENT errors.
*/
function getNpmCommand() {
	const isWindows = process.platform === "win32";
	return {
		binary: isWindows ? "npm.cmd" : "npm",
		shell: isWindows
	};
}
/**
* Standardized cross-platform synchronous execution of npm commands.
* Automatically resolves 'npm.cmd' and 'shell: true' on Windows.
*/
function runNpmCommandSync(args, options = {}) {
	const { binary, shell } = getNpmCommand();
	return childProcess.spawnSync(binary, [...args], {
		cwd: options.cwd ?? process.cwd(),
		stdio: options.stdio ?? "pipe",
		encoding: options.encoding ?? "utf-8",
		timeout: options.timeout,
		maxBuffer: options.maxBuffer,
		shell,
		env: options.env ?? process.env
	});
}
export { COMMAND_INVOCATION_TYPES, KNOWN_OPTIONAL_ENVIRONMENT_HOOKS, KNOWN_OPTIONAL_ENVIRONMENT_HOOKS_SET, NPM_DIRECT_REGEX, NPM_RUN_REGEX, NPX_REGEX, VALID_NPM_BUILTINS, VALID_VP_BUILTINS, VP_DIRECT_REGEX, VP_DLX_REGEX, VP_RUN_REGEX, cleanTarget, evaluateGenericCommandViolation, extractCommandsFromLine, getNpmCommand, isPlaceholder, loadPackageScriptsAndBins, runNpmCommandSync };
