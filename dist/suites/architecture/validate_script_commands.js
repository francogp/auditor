import { tryOrNull } from "../../core/safeUtils.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import "../../core/safePath.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { GitIgnoreMatcher } from "../../core/gitignoreMatcher.js";
import { evaluateGenericCommandViolation, loadPackageScriptsAndBins } from "../../core/npmCommandUtils.js";
import { extractScriptCommands } from "../../core/scriptCommandExtractors.js";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/validate_script_commands.ts
/**
* src/suites/architecture/validate_script_commands.ts
*
* SCRIPT & PIPELINE COMMANDS VALIDATOR (Node.js 26+)
*
* Recursively audits executable scripts and infrastructure pipelines (.sh, .ps1, .bat, .cmd,
* Dockerfiles, .github/workflows/, and maintenance scripts) and guarantees that:
* 1. Every invoked `npm run <script>` strictly exists in `package.json.scripts`.
* 2. Every direct `npm <cmd>` is a valid npm lifecycle or builtin command.
* 3. Every `npx <bin>` references a binary installed in node_modules/.bin or declared in package.json.
*
* Enforces loud, immediate failures (severity: 'error', fix: 'none') to prevent runtime
* deployment crashes caused by missing or unmigrated npm scripts.
*/
const SCRIPT_COMMANDS_RULES = [
	"script-cmd-unregistered-npm",
	"script-cmd-invalid-npm-syntax",
	"script-cmd-unregistered-npx"
];
const SHELL_AND_BATCH_EXTENSIONS = /* @__PURE__ */ new Set([
	".sh",
	".bash",
	".zsh",
	".ps1",
	".bat",
	".cmd"
]);
const SCRIPTS_DIR_EXTENSIONS = /* @__PURE__ */ new Set([
	".sh",
	".bash",
	".zsh",
	".ps1",
	".bat",
	".cmd",
	".ts",
	".js",
	".mjs",
	".cjs"
]);
function isCandidateScriptPath(file, rootDir) {
	const relPosix = normalizePosixPath(path.relative(rootDir, file));
	const ext = path.extname(file).toLowerCase();
	if (SHELL_AND_BATCH_EXTENSIONS.has(ext)) return !relPosix.startsWith("src/") && !relPosix.startsWith("tests/");
	return relPosix.startsWith("scripts/") || relPosix.includes("/scripts/");
}
function isDockerfile(fileName) {
	const lower = fileName.toLowerCase();
	return lower === "dockerfile" || lower.startsWith("dockerfile.") || lower === "containerfile" || fileName.endsWith(".dockerfile");
}
const CANDIDATE_DOCKER_DIRS = [
	".",
	"deploy",
	"infra"
];
function collectDockerfiles(rootDir) {
	const dockerfiles = [];
	for (const d of CANDIDATE_DOCKER_DIRS) {
		const absDir = path.resolve(rootDir, d);
		if (!fs.existsSync(absDir)) continue;
		const entries = tryOrNull(() => fs.readdirSync(absDir, { withFileTypes: true })) ?? [];
		for (const entry of entries) if (entry.isFile() && isDockerfile(entry.name)) dockerfiles.push(path.resolve(absDir, entry.name));
	}
	return dockerfiles;
}
function collectWorkflowFiles(rootDir) {
	const workflowFiles = [];
	const workflowsDir = path.resolve(rootDir, ".github", "workflows");
	if (!fs.existsSync(workflowsDir)) return workflowFiles;
	const entries = tryOrNull(() => fs.readdirSync(workflowsDir, { withFileTypes: true })) ?? [];
	for (const entry of entries) if (entry.isFile() && (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml"))) workflowFiles.push(path.resolve(workflowsDir, entry.name));
	return workflowFiles;
}
var ValidateScriptCommandsAuditor = class extends BaseAuditor {
	rootDir;
	gitIgnoreMatcher;
	constructor(options = {}) {
		const root = options.projectRoot || process.cwd();
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(SCRIPT_COMMANDS_RULES, {
				speed: "light",
				phase: "setup",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_script_commands",
			name: "Script & Pipeline Commands Validator",
			description: "Validates npm and npx commands in scripts and CI/CD",
			family: "architecture",
			packageName: "ScriptCommands",
			configKey: "paths",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "🐚",
			ruleIds: SCRIPT_COMMANDS_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(SCRIPT_COMMANDS_RULES, "setup"),
			ruleDescriptions: {
				"script-cmd-unregistered-npm": "Unregistered npm run script",
				"script-cmd-invalid-npm-syntax": "Invalid direct npm command",
				"script-cmd-unregistered-npx": "Unregistered npx binary"
			},
			ruleRemediations: {
				"script-cmd-unregistered-npm": "1. Root Cause:\nAn executable script (.sh, .ps1, Dockerfile, or CI/CD workflow under .github/workflows/) attempts to run \"npm run <script>\", but \"<script>\" is not declared in package.json.scripts.\n\n2. Diagnosis:\nCheck the file and line number executing the command. Verify whether the script was renamed (e.g. \"build:prod\" migrated to \"build:deploy\") or never declared in package.json.\n\n3. Canonical Solution:\n1. If the script was renamed, update the invocation in the script to reference the registered canonical name.\n2. If the script is valid and required, declare it in \"scripts\" in package.json.\n3. If it was a typo, fix the command name in the script.\n\n4. Example / Auto-fix command:\n// package.json:\n\"scripts\": { \"build\": \"vp build\" }",
				"script-cmd-invalid-npm-syntax": "1. Root Cause:\nA script invokes \"npm <name>\" directly where \"<name>\" is not a native npm CLI command (like \"test\", \"install\", \"ci\") and omitted the \"run\" keyword.\nIn npm, custom scripts defined in package.json strictly require the \"run\" subcommand (e.g. \"npm run build\").\n\n2. Diagnosis:\nLocate the line in the script running \"npm <name>\".\n\n3. Canonical Solution:\nReplace \"npm <name>\" with \"npm run <name>\" (or \"vp run <name>\").\n\n4. Example / Auto-fix command:\nnpm run build",
				"script-cmd-unregistered-npx": "1. Root Cause:\nAn executable script or CI/CD pipeline runs \"npx <binary>\", but the binary is neither installed in node_modules/.bin nor declared in package.json.\nUnder repository supply-chain security rules, invoking npx to download binaries on the fly in scripts is strictly prohibited without explicit dependency declaration.\n\n2. Diagnosis:\nInspect the binary name invoked after \"npx\".\n\n3. Canonical Solution:\n1. For built-in Vite+ tools (e.g. \"npx vite\"), replace with \"vp dev\" or its canonical npm package script.\n2. For other packages, add them to devDependencies via \"npm install -D <pkg>\" and invoke via package.json scripts.\n3. For global system or runner utilities, declare them in \"config.scriptCommands.allowedNpxBinaries\" in .auditor/audit.config.ts upon approval.\n\n4. Example / Auto-fix command:\nnpm install -D <package>"
			},
			coverage: { include: [
				"**/*.sh",
				"**/*.bash",
				"**/*.zsh",
				"**/*.ps1",
				"**/*.bat",
				"**/*.cmd",
				"**/Dockerfile*",
				"**/*.dockerfile",
				"**/Containerfile",
				".github/workflows/**/*.{yml,yaml}",
				"scripts/**/*.{ts,js}"
			] },
			projectRoot: root
		});
		this.rootDir = root;
		this.gitIgnoreMatcher = new GitIgnoreMatcher(root);
	}
	async runAudit() {
		const config = getAuditConfig(this.rootDir);
		if (config.scriptCommands?.enabled === false) {
			this.markSkipped("Disabled in config (scriptCommands.enabled = false)");
			return;
		}
		const { scripts, declaredBins, installedBins } = loadPackageScriptsAndBins(this.rootDir);
		const customExemptGlobs = (config.coverage?.exemptGlobs ?? []).map((e) => e.glob);
		const scriptExemptGlobs = config.scriptCommands?.exemptGlobs ?? [];
		const env = {
			scripts,
			declaredBins,
			installedBins,
			allowedNpx: /* @__PURE__ */ new Set([...config.documentation?.allowedNpxBinaries ?? [], ...config.scriptCommands?.allowedNpxBinaries ?? []])
		};
		const candidateFiles = this.collectScriptFiles();
		if (candidateFiles.length === 0) {
			for (const rule of SCRIPT_COMMANDS_RULES) this.markRuleNotApplicable(rule, "No executable scripts found to audit");
			return;
		}
		const scannedFiles = this.readScannedFiles(candidateFiles, customExemptGlobs, scriptExemptGlobs);
		this.reportViolations("script-cmd-unregistered-npm", "unregistered-npm", scannedFiles, env);
		this.reportViolations("script-cmd-invalid-npm-syntax", "invalid-npm-syntax", scannedFiles, env);
		this.reportViolations("script-cmd-unregistered-npx", "unregistered-npx", scannedFiles, env);
	}
	readScannedFiles(candidateFiles, customExemptGlobs, scriptExemptGlobs) {
		const scannedFiles = [];
		for (const absFile of candidateFiles) {
			const relPosix = normalizePosixPath(path.relative(this.rootDir, absFile));
			if (this.gitIgnoreMatcher.isIgnored(absFile)) continue;
			if (this.isExempt(relPosix, customExemptGlobs, scriptExemptGlobs)) continue;
			this.recordScanned(relPosix);
			let content;
			try {
				content = fs.readFileSync(absFile, "utf8");
			} catch {
				continue;
			}
			const commands = extractScriptCommands(content, relPosix);
			if (commands.length > 0) scannedFiles.push({
				relPosix,
				commands
			});
		}
		return scannedFiles;
	}
	reportViolations(ruleId, targetKind, scannedFiles, env) {
		this.runSubAuditorSync(ruleId, () => {
			for (const file of scannedFiles) for (const cmd of file.commands) {
				const v = evaluateGenericCommandViolation(cmd, env);
				if (!v || v.kind !== targetKind) continue;
				const message = targetKind === "unregistered-npm" ? cmd.type === "npm-run" ? `The script '${file.relPosix}' (line ${v.line}) runs 'npm run ${cmd.target}', but the script is not registered in package.json.scripts.` : `The script '${file.relPosix}' (line ${v.line}) runs 'npm test', but no 'test' script is registered in package.json.scripts.` : `The script '${file.relPosix}' (line ${v.line}): ${v.message}`;
				this.addViolation({
					ruleId,
					severity: "error",
					file: file.relPosix,
					line: v.line,
					message,
					context: v.context
				});
			}
		});
	}
	isExempt(relPosix, customExempt, scriptExempt) {
		const allExempt = [...customExempt, ...scriptExempt];
		for (const glob of allExempt) if (path.posix.matchesGlob(relPosix, glob)) return true;
		return relPosix.includes("fixtures/") || relPosix.startsWith("tests/fixtures/");
	}
	collectScriptFiles() {
		const collected = /* @__PURE__ */ new Set();
		const scannableFiles = this.context.collectFiles(["."], SCRIPTS_DIR_EXTENSIONS);
		for (const file of scannableFiles) if (isCandidateScriptPath(file, this.rootDir)) collected.add(file);
		for (const file of collectDockerfiles(this.rootDir)) collected.add(file);
		for (const file of collectWorkflowFiles(this.rootDir)) collected.add(file);
		return Array.from(collected);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateScriptCommandsAuditor());
//#endregion
export { SCRIPT_COMMANDS_RULES, ValidateScriptCommandsAuditor as ScriptCommandsAuditor, ValidateScriptCommandsAuditor };
