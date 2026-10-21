import { isProductionEnvironment } from "../../core/auditorEnvironment.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
//#region src/suites/architecture/validate_git_config.ts
/**
* src/suites/architecture/validate_git_config.ts
*
* SSoT GIT CONFIGURATION & HYGIENE AUDITOR (Node.js 26+ Native)
*
* Verifies that the local Git repository (.git/config) enforces standard repository
* settings: core.filemode = false, core.autocrlf = input, and core.eol = lf.
* In --fix mode, automatically configures these settings locally via git config.
*/
enableCompileCache();
const GIT_CONFIG_RULES = [
	"git-config-filemode",
	"git-config-autocrlf",
	"git-config-eol"
];
const REQUIRED_GIT_CONFIGS = [
	{
		key: "core.filemode",
		expected: "false",
		ruleId: "git-config-filemode"
	},
	{
		key: "core.autocrlf",
		expected: "input",
		ruleId: "git-config-autocrlf"
	},
	{
		key: "core.eol",
		expected: "lf",
		ruleId: "git-config-eol"
	}
];
function getLocalGitConfig(key, projectRoot) {
	try {
		const res = spawnSync("git", [
			"config",
			"--local",
			"--get",
			key
		], {
			cwd: projectRoot,
			encoding: "utf8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		});
		if (res.status === 0 && res.stdout) return res.stdout.trim();
		return null;
	} catch {
		return null;
	}
}
function setLocalGitConfig(key, value, projectRoot) {
	try {
		return spawnSync("git", [
			"config",
			"--local",
			key,
			value
		], {
			cwd: projectRoot,
			encoding: "utf8",
			stdio: [
				"ignore",
				"ignore",
				"ignore"
			]
		}).status === 0;
	} catch {
		return false;
	}
}
var ValidateGitConfigAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		super({
			usesThirdPartyTool: false,
			requiredPermissions: ["--allow-child-process"],
			ruleCapabilities: createRuleCapabilities(GIT_CONFIG_RULES, {
				speed: "light",
				phase: "setup",
				fix: "priority",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}, [...GIT_CONFIG_RULES]),
			fixableRuleIds: [...GIT_CONFIG_RULES],
			id: "validate_git_config",
			name: "Git Configuration Validator",
			description: "Validates and synchronizes local Git configuration",
			family: "architecture",
			ruleIds: GIT_CONFIG_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(GIT_CONFIG_RULES, "setup"),
			packageName: "Git",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "🌿",
			ruleDescriptions: {
				"git-config-filemode": "core.filemode must be false in repository",
				"git-config-autocrlf": "core.autocrlf must be input in repository",
				"git-config-eol": "core.eol must be lf in repository"
			},
			ruleRemediations: {
				"git-config-filemode": "📖 REMEDIATION GUIDE: git-config-filemode\n1. Root Cause: Local property `core.filemode` is not configured as `false` in Git, causing Windows environments to detect false execution permission differences (+x) on source files.\n2. Diagnosis: Run `git config --local core.filemode` in the terminal to inspect current value.\n3. Canonical Solution: Configure the repository to ignore file mode changes on local filesystem via `git config --local core.filemode false` or run auditor auto-fix.\n4. Example / Auto-fix command:\n   `npm run auditor:fix` or `git config --local core.filemode false`",
				"git-config-autocrlf": "📖 REMEDIATION GUIDE: git-config-autocrlf\n1. Root Cause: Local property `core.autocrlf` is not configured as `input`, which may introduce Windows line endings (CRLF) into the remote repository.\n2. Diagnosis: Run `git config --local core.autocrlf` in the terminal.\n3. Canonical Solution: Configure `core.autocrlf input` so Git converts CRLF to LF on commit, preserving clean LF line endings.\n4. Example / Auto-fix command:\n   `npm run auditor:fix` or `git config --local core.autocrlf input`",
				"git-config-eol": "📖 REMEDIATION GUIDE: git-config-eol\n1. Root Cause: Local property `core.eol` is not set to `lf`, allowing local tooling to introduce line ending inconsistencies across source files and scripts.\n2. Diagnosis: Run `git config --local core.eol` in the terminal.\n3. Canonical Solution: Set `core.eol lf` in local Git configuration.\n4. Example / Auto-fix command:\n   `npm run auditor:fix` or `git config --local core.eol lf`"
			},
			coverage: { include: ["package.json"] },
			...options
		});
	}
	async runAudit() {
		if (isProductionEnvironment()) {
			this.markSkipped("Git config skipped in production environment (AUDITOR_ENV=production)");
			return;
		}
		this.recordScanned("package.json");
		const gitPath = path.resolve(this.projectRoot, ".git");
		if (!fs.existsSync(gitPath)) {
			for (const r of GIT_CONFIG_RULES) this.markRuleNotApplicable(r, "Not a Git repository (.git not found)");
			return;
		}
		for (const item of REQUIRED_GIT_CONFIGS) this.runSubAuditorSync(item.ruleId, () => {
			let currentVal = getLocalGitConfig(item.key, this.projectRoot);
			if (currentVal !== item.expected && this.isFixActive()) {
				if (setLocalGitConfig(item.key, item.expected, this.projectRoot)) currentVal = getLocalGitConfig(item.key, this.projectRoot);
			}
			if (currentVal !== item.expected) this.addViolation({
				ruleId: item.ruleId,
				file: ".git/config",
				line: 1,
				message: `${item.key} must be "${item.expected}" in local repository (detected: "${currentVal ?? "unset"}").`,
				severity: "error",
				context: `${item.key} = ${currentVal ?? "unset"}`
			});
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateGitConfigAuditor());
//#endregion
export { GIT_CONFIG_RULES, REQUIRED_GIT_CONFIGS, ValidateGitConfigAuditor, getLocalGitConfig, setLocalGitConfig };
