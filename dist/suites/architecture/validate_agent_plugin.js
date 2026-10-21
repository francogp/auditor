import { getAuditConfig, loadAuditConfig } from "../../core/auditConfigLoader.js";
import { isSelfProviderProject } from "../../core/auditProjectIdentity.js";
import "../../core/auditConfig.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { initAgentSkill } from "../../cli/init_agent.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import yaml from "yaml";
//#region src/suites/architecture/validate_agent_plugin.ts
/**
* src/suites/architecture/validate_agent_plugin.ts
*
* AGENT PLUGIN & SKILL INTEGRATION AUDITOR (Node.js 26+ Native)
*
* Verifies that the host project has properly integrated the official @francogp/auditor
* AI agent plugin in `.agents/plugins.json` (via `auditor-init-agent` / `npm run init-agent`).
* In --fix mode, automatically registers the plugin into `.agents/plugins.json`.
*/
enableCompileCache();
const AGENT_PLUGIN_RULES = ["missing-agent-plugin-registration", "skill-invalid-yaml-frontmatter"];
/** Agent registries read to verify the plugin/skills registration. */
const AGENT_REGISTRY_FILES = [".agents/plugins.json", ".agents/skills.json"];
function isPluginRegisteredInAgents(projectRoot) {
	const pluginsJsonPath = path.join(projectRoot, ".agents/plugins.json");
	const skillsJsonPath = path.join(projectRoot, ".agents/skills.json");
	const checkFile = (filePath) => {
		if (!fs.existsSync(filePath)) return false;
		try {
			const raw = fs.readFileSync(filePath, "utf8");
			const data = JSON.parse(raw);
			if (!Array.isArray(data.entries)) return false;
			return data.entries.some((e) => e.path === "node_modules/@francogp/auditor" || e.path.endsWith("@francogp/auditor") || e.path.includes("@francogp/auditor") || e.path === "./packages/auditor" || e.path === "packages/auditor");
		} catch {
			return false;
		}
	};
	return checkFile(pluginsJsonPath) && checkFile(skillsJsonPath);
}
var AgentPluginAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(AGENT_PLUGIN_RULES, {
				speed: "light",
				phase: "normal",
				fix: "priority",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}, ["missing-agent-plugin-registration"]),
			fixableRuleIds: ["missing-agent-plugin-registration"],
			id: "validate_agent_plugin",
			name: "Agent Plugin & Skill Integration Validator",
			description: "Verifies agent audit plugin registration",
			family: "architecture",
			ruleIds: AGENT_PLUGIN_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(AGENT_PLUGIN_RULES, "behavior"),
			packageName: "Agent",
			configKey: "agentPlugin.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "🤖",
			ruleDescriptions: {
				"missing-agent-plugin-registration": "Plugin/skills unregistered in .agents",
				"skill-invalid-yaml-frontmatter": "Invalid YAML frontmatter in SKILL.md"
			},
			ruleRemediations: {
				"missing-agent-plugin-registration": "📖 REMEDIATION GUIDE: missing-agent-plugin-registration\n1. Root Cause: The host project does not have the `@francogp/auditor` plugin registered in `.agents/plugins.json` or lacks the corresponding skills catalog in `.agents/skills/`.\n2. Diagnosis: Check if `.agents/plugins.json` exists and references the auditor plugin.\n3. Canonical Solution:\n   a) Run canonical auto-fix: `npm run auditor:fix` or `auditor fix` to automatically register the plugin and sync skills.\n   b) Or run `auditor-init` in the host project.\n4. Example / Auto-fix command:\n   `npm run auditor:fix`",
				"skill-invalid-yaml-frontmatter": "📖 REMEDIATION GUIDE: skill-invalid-yaml-frontmatter\n1. Root Cause: A `SKILL.md` file contains syntax errors in its YAML frontmatter (commonly unquoted colons `: ` or missing folded scalar `>-`), or lacks required `name` and `description` fields.\n2. Diagnosis: Run `npm run auditor:agent-plugin` to identify the specific skill and YAML parser error message.\n3. Canonical Solution: Use the folded scalar block `description: >-` for multi-line or special-character descriptions. Ensure `name: <name>` matches the skill folder name.\n4. Example / Auto-fix command:\n   - Before (Invalid): description: Rule: description\n   - After (Canonical): description: >-\n       Rule: description"
			},
			coverage: { include: [...AGENT_REGISTRY_FILES, ".agents/skills/**/SKILL.md"] },
			...options
		});
	}
	async checkGating() {
		if ((this.projectRoot !== process.cwd() ? await loadAuditConfig(this.projectRoot) : getAuditConfig()).agentPlugin?.enabled === false) {
			this.context.setMetric("Agent Plugin Status", "Disabled");
			this.markRuleNotApplicable("missing-agent-plugin-registration", "config.agentPlugin.enabled = false");
			this.markRuleNotApplicable("skill-invalid-yaml-frontmatter", "config.agentPlugin.enabled = false");
			return true;
		}
		return false;
	}
	tryAutoFixPlugin() {
		if (!this.isFixActive()) return false;
		this.context.logProgress("Auto-fixing missing agent plugin registration...");
		const result = initAgentSkill({ targetDir: this.projectRoot });
		if (result.success) {
			this.context.logProgress(`✅ ${result.message}`);
			this.context.setMetric("Agent Plugin Status", "Auto-Fixed");
			return true;
		}
		return false;
	}
	reportMissingPluginViolation() {
		const pluginsJsonPath = path.join(this.projectRoot, ".agents/plugins.json");
		const skillsJsonPath = path.join(this.projectRoot, ".agents/skills.json");
		const missingFiles = [];
		if (!fs.existsSync(pluginsJsonPath)) missingFiles.push(".agents/plugins.json");
		if (!fs.existsSync(skillsJsonPath)) missingFiles.push(".agents/skills.json");
		const targetFile = missingFiles[0] || ".agents/plugins.json";
		this.addViolation({
			ruleId: "missing-agent-plugin-registration",
			severity: "error",
			file: targetFile,
			line: 1,
			message: "Agent audit plugin and/or skills are not registered in .agents/plugins.json and .agents/skills.json. Run: npm run auditor:init-agent",
			context: "auditor:init-agent",
			fixable: true
		});
		this.context.setMetric("Agent Plugin Status", "Missing");
	}
	async runAudit() {
		if (await this.checkGating()) return;
		for (const registryFile of AGENT_REGISTRY_FILES) if (fs.existsSync(path.join(this.projectRoot, registryFile))) this.recordScanned(registryFile);
		if (isSelfProviderProject(this.projectRoot)) {
			this.context.setMetric("Agent Plugin Status", "Provider Validated");
			this.markRuleNotApplicable("missing-agent-plugin-registration", "Provider project for @francogp/auditor (self-registered)");
		} else this.runSubAuditorSync("missing-agent-plugin-registration", () => {
			if (isPluginRegisteredInAgents(this.projectRoot)) {
				this.context.setMetric("Agent Plugin Status", "Registered");
				return;
			}
			if (this.tryAutoFixPlugin()) return;
			this.reportMissingPluginViolation();
		});
		this.runSubAuditorSync("skill-invalid-yaml-frontmatter", () => {
			const skillsDir = path.join(this.projectRoot, ".agents/skills");
			if (!fs.existsSync(skillsDir)) return;
			const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				const skillName = entry.name;
				const skillMdPath = path.join(skillsDir, skillName, "SKILL.md");
				if (!fs.existsSync(skillMdPath)) continue;
				this.recordScanned(path.relative(this.projectRoot, skillMdPath));
				const content = fs.readFileSync(skillMdPath, "utf8");
				if (!content.startsWith("---")) {
					this.addViolation({
						ruleId: "skill-invalid-yaml-frontmatter",
						severity: "error",
						file: path.relative(this.projectRoot, skillMdPath),
						line: 1,
						message: `File ${skillName}/SKILL.md does not contain frontmatter delimited by '---'`,
						context: skillName
					});
					continue;
				}
				const parts = content.split("---");
				if (parts.length < 3) {
					this.addViolation({
						ruleId: "skill-invalid-yaml-frontmatter",
						severity: "error",
						file: path.relative(this.projectRoot, skillMdPath),
						line: 1,
						message: `Frontmatter of ${skillName}/SKILL.md is not closed with '---'`,
						context: skillName
					});
					continue;
				}
				const frontmatterRaw = parts[1];
				let parsed = null;
				try {
					parsed = yaml.parse(frontmatterRaw);
				} catch (err) {
					const errMsg = err instanceof Error ? err.message : String(err);
					this.addViolation({
						ruleId: "skill-invalid-yaml-frontmatter",
						severity: "error",
						file: path.relative(this.projectRoot, skillMdPath),
						line: 1,
						message: `YAML syntax error in frontmatter of ${skillName}/SKILL.md: ${errMsg.split("\n")[0]}`,
						context: skillName
					});
					continue;
				}
				if (!parsed || typeof parsed !== "object") {
					this.addViolation({
						ruleId: "skill-invalid-yaml-frontmatter",
						severity: "error",
						file: path.relative(this.projectRoot, skillMdPath),
						line: 1,
						message: `Frontmatter of ${skillName}/SKILL.md is not a valid YAML object`,
						context: skillName
					});
					continue;
				}
				if (!parsed.name || typeof parsed.name !== "string" || !parsed.name.trim()) this.addViolation({
					ruleId: "skill-invalid-yaml-frontmatter",
					severity: "error",
					file: path.relative(this.projectRoot, skillMdPath),
					line: 1,
					message: `Missing 'name' field in frontmatter of ${skillName}/SKILL.md`,
					context: skillName
				});
				if (!parsed.description || typeof parsed.description !== "string" || !parsed.description.trim()) this.addViolation({
					ruleId: "skill-invalid-yaml-frontmatter",
					severity: "error",
					file: path.relative(this.projectRoot, skillMdPath),
					line: 1,
					message: `Missing 'description' field in frontmatter of ${skillName}/SKILL.md`,
					context: skillName
				});
			}
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new AgentPluginAuditor());
//#endregion
export { AGENT_PLUGIN_RULES, AgentPluginAuditor };
