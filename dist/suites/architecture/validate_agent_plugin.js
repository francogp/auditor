import { DEFAULT_AUDIT_CONFIG } from "../../core/auditConfigDefaults.js";
import { safeJsonParse, safeReadFileSync, tryOrNull } from "../../core/safeUtils.js";
import { getAuditConfig, loadAuditConfig } from "../../core/auditConfigLoader.js";
import { SKILLS_LOCK_CANDIDATE_PATHS, isLockedSkillPath, loadAuditorOwnedSkills } from "../../core/lockedSkills.js";
import { isPathContained, toPosixRelative } from "../../core/safePath.js";
import { isSelfProviderProject } from "../../core/auditProjectIdentity.js";
import "../../core/auditConfig.js";
import "../../core/auditCoverage.js";
import { BaseAuditor, createRuleCapabilities } from "../../core/auditorBase.js";
import { SharedAstContext } from "../../core/astContext.js";
import { initAgentSkill } from "../../cli/init_agent.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import "typescript";
import yaml from "yaml";
// src/suites/architecture/validate_agent_plugin.ts
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
const AGENT_PLUGIN_RULES = [
	"missing-agent-plugin-registration",
	"host-duplicate-auditor-skill",
	"skill-invalid-yaml-frontmatter",
	"skill-invalid-asset-syntax",
	"skill-exceeds-line-limit"
];
/** Empty Set allows collecting all file types within skill directories. */
const ALL_SKILL_EXTENSIONS = /* @__PURE__ */ new Set();
/** Maximum allowed lines for custom skills to satisfy 3-tier progressive disclosure (<500 lines). */
const MAX_CUSTOM_SKILL_LINES = 500;
/** Target maximum column wrap limit for YAML folded scalars. */
const MAX_DESCRIPTION_LINE_WRAP = 82;
function extractSkillName(absFile, projectRoot, skillsRoots) {
	for (const root of skillsRoots) {
		const absRoot = path.resolve(projectRoot, root);
		if (isPathContained(absRoot, absFile)) {
			let current = absFile;
			while (current !== absRoot && path.dirname(current) !== absRoot) current = path.dirname(current);
			return path.basename(current);
		}
	}
	return path.basename(path.dirname(absFile));
}
function isPluginRegisteredInAgents(projectRoot, primaryAgentDir = ".agents") {
	const pluginsJsonPath = path.join(projectRoot, primaryAgentDir, "plugins.json");
	const skillsJsonPath = path.join(projectRoot, primaryAgentDir, "skills.json");
	const checkFile = (filePath) => {
		if (!fs.existsSync(filePath)) return false;
		const raw = safeReadFileSync(filePath);
		if (!raw) return false;
		const data = safeJsonParse(raw);
		if (!data || !Array.isArray(data.entries)) return false;
		return data.entries.some((e) => e.path.includes("@francogp/auditor") || e.path.includes("packages/auditor"));
	};
	return checkFile(pluginsJsonPath) && checkFile(skillsJsonPath);
}
function fixMissingAgentPluginRegistration(context) {
	return initAgentSkill({ targetDir: context.projectRoot }).success;
}
var AgentPluginAuditor = class extends BaseAuditor {
	skillsRoots;
	primaryAgentDir;
	constructor(options = {}) {
		const effectiveRoot = options.projectRoot ?? process.cwd();
		const config = getAuditConfig(effectiveRoot);
		const defaultRoots = DEFAULT_AUDIT_CONFIG.documentation?.skillsRoots ?? [];
		const skillsRoots = config.documentation?.skillsRoots?.length ? config.documentation.skillsRoots : defaultRoots;
		const skillsCoverageGlobs = skillsRoots.map((r) => `${r}/**`);
		const primaryAgentDir = path.posix.dirname(skillsRoots[0] || ".agents/skills");
		const pluginsJsonRel = path.posix.join(primaryAgentDir, "plugins.json");
		const skillsJsonRel = path.posix.join(primaryAgentDir, "skills.json");
		super({
			ruleFixers: { "missing-agent-plugin-registration": fixMissingAgentPluginRegistration },
			fixableRuleIds: ["host-duplicate-auditor-skill", "skill-invalid-yaml-frontmatter"],
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(AGENT_PLUGIN_RULES, {
				speed: "light",
				phase: "normal",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_agent_plugin",
			name: "Agent Plugin & Skill Integration Validator",
			description: "Verifies agent audit plugin registration",
			family: "architecture",
			ruleIds: AGENT_PLUGIN_RULES,
			ruleRemediationPhases: {
				"missing-agent-plugin-registration": "setup",
				"host-duplicate-auditor-skill": "setup",
				"skill-invalid-yaml-frontmatter": "hygiene",
				"skill-invalid-asset-syntax": "hygiene",
				"skill-exceeds-line-limit": "hygiene"
			},
			packageName: "Agent",
			configKey: "agentPlugin.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "🤖",
			ruleDescriptions: {
				"missing-agent-plugin-registration": "Plugin/skills unregistered in .agents",
				"host-duplicate-auditor-skill": "Host duplicates auditor-owned skill",
				"skill-invalid-yaml-frontmatter": "Invalid YAML frontmatter in SKILL.md",
				"skill-invalid-asset-syntax": "Syntax error in skill asset file (JSON/TS)",
				"skill-exceeds-line-limit": "Custom skill exceeds 500 lines limit"
			},
			ruleRemediations: {
				"missing-agent-plugin-registration": "📖 REMEDIATION GUIDE: missing-agent-plugin-registration\n1. Root Cause: The host project does not have the `@francogp/auditor` plugin registered in `.agents/plugins.json` or lacks the corresponding skills catalog in `.agents/skills/`.\n2. Diagnosis: Check if `.agents/plugins.json` exists and references the auditor plugin.\n3. Canonical Solution:\n   a) Run canonical auto-fix: `npm run auditor:fix` or `auditor fix` to automatically register the plugin and sync skills.\n   b) Or run `auditor-init` in the host project.\n4. Example / Auto-fix command:\n   `npm run auditor:fix`",
				"host-duplicate-auditor-skill": "📖 REMEDIATION GUIDE: host-duplicate-auditor-skill\n1. Root Cause: A consumer host project cloned, updated, or registered in its local `.agents/skills/` or `skills-lock.json` a skill that belongs to `@francogp/auditor` (e.g. `fallow`, `gsap-*`, `vue-*`, `vitest`, `valibot`, `pinia`, `architecture`, `auditor`).\n2. Diagnosis: Run `npm run auditor:findings -- rule=host-duplicate-auditor-skill` to inspect the duplicated skill directory or lock entry.\n3. Canonical Solution: Each project may ONLY manage or lock its own project-local skills. Consumer host projects must never update or duplicate skills distributed by `@francogp/auditor` (ask the `@francogp/auditor` maintainer to update auditor skills upstream). Run `npm run auditor:fix` to remove the duplicate host skill or lock entry.\n4. Example / Auto-fix command:\n   `npm run auditor:fix`",
				"skill-invalid-yaml-frontmatter": "📖 REMEDIATION GUIDE: skill-invalid-yaml-frontmatter\n1. Root Cause: A `SKILL.md` file contains syntax errors in its YAML frontmatter, lacks required `name` or `description`, or in custom in-house skills fails to use folded block scalar (`description: >-`).\n2. Diagnosis: Run `npm run auditor:findings -- rule=skill-invalid-yaml-frontmatter` to identify the specific skill and YAML validation error.\n3. Canonical Solution: Use the folded block scalar `description: >-` with 2-space indentation (Invariant #15 of /architecture). Ensure `name: <name>` matches the directory name.\n4. Example / Auto-fix command:\n   `npm run auditor:fix` (auto-formats unquoted/quoted descriptions into canonical `description: >-`).",
				"skill-invalid-asset-syntax": "📖 REMEDIATION GUIDE: skill-invalid-asset-syntax\n1. Root Cause: A secondary asset file within an agent skill (such as an evaluation schema in evals/*.json, blueprint *.json, or code template/example *.ts) contains malformed JSON or TypeScript syntax errors.\n2. Diagnosis: Run `npm run auditor:findings -- rule=skill-invalid-asset-syntax` to inspect the reported file and parser error message.\n3. Canonical Solution: Repair the JSON syntax (ensure double quotes on keys, remove trailing commas) or fix TypeScript syntax errors in the reported template/example file.\n4. Example / Auto-fix command:\n   Inspect and repair syntax in the target file, then verify with `npm run auditor:agent-plugin`.",
				"skill-exceeds-line-limit": "📖 REMEDIATION GUIDE: skill-exceeds-line-limit\n1. Root Cause: A custom in-house skill exceeds the 500-line threshold in its primary SKILL.md, violating the 3-tier progressive disclosure mandate.\n2. Diagnosis: Run `npm run auditor:findings -- rule=skill-exceeds-line-limit` to identify the oversized skill and inspect its line count.\n3. Canonical Solution: Extract deep technical specifications, extensive rule dictionaries, or workflows into specialized reference files under `references/` or `workflows/`, linking them relatively.\n4. Example / Auto-fix command:\n   Modularize large sections into `references/<topic>.md` and link them relatively from `SKILL.md`."
			},
			coverage: { include: [
				pluginsJsonRel,
				skillsJsonRel,
				...SKILLS_LOCK_CANDIDATE_PATHS,
				...skillsCoverageGlobs
			] },
			unignoreDirs: [primaryAgentDir],
			...options
		});
		this.skillsRoots = skillsRoots;
		this.primaryAgentDir = primaryAgentDir;
	}
	async checkGating() {
		if ((this.projectRoot !== process.cwd() ? await loadAuditConfig(this.projectRoot) : getAuditConfig()).agentPlugin?.enabled === false) {
			this.context.setMetric("Agent Plugin Status", "Disabled");
			this.markRuleNotApplicable("missing-agent-plugin-registration", "config.agentPlugin.enabled = false");
			this.markRuleNotApplicable("host-duplicate-auditor-skill", "config.agentPlugin.enabled = false");
			this.markRuleNotApplicable("skill-invalid-yaml-frontmatter", "config.agentPlugin.enabled = false");
			this.markRuleNotApplicable("skill-invalid-asset-syntax", "config.agentPlugin.enabled = false");
			this.markRuleNotApplicable("skill-exceeds-line-limit", "config.agentPlugin.enabled = false");
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
		const pluginsJsonRel = path.posix.join(this.primaryAgentDir, "plugins.json");
		const skillsJsonRel = path.posix.join(this.primaryAgentDir, "skills.json");
		const pluginsJsonPath = path.join(this.projectRoot, pluginsJsonRel);
		const skillsJsonPath = path.join(this.projectRoot, skillsJsonRel);
		const missingFiles = [];
		if (!fs.existsSync(pluginsJsonPath)) missingFiles.push(pluginsJsonRel);
		if (!fs.existsSync(skillsJsonPath)) missingFiles.push(skillsJsonRel);
		const targetFile = missingFiles[0] || pluginsJsonRel;
		this.addViolation({
			ruleId: "missing-agent-plugin-registration",
			severity: "error",
			file: targetFile,
			line: 1,
			message: `Agent audit plugin and/or skills are not registered in ${pluginsJsonRel} and ${skillsJsonRel}. Run: npm run auditor:init-agent`,
			context: "auditor:init-agent",
			fixable: true
		});
		this.context.setMetric("Agent Plugin Status", "Missing");
	}
	validateSkillLineLimit(skillMdPath, skillName) {
		if (isLockedSkillPath(skillMdPath, this.projectRoot)) return;
		const relMdPath = toPosixRelative(this.projectRoot, skillMdPath);
		const content = safeReadFileSync(skillMdPath);
		if (!content) return;
		const lineCount = content.split(/\r?\n/).length;
		if (lineCount > MAX_CUSTOM_SKILL_LINES) this.addViolation({
			ruleId: "skill-exceeds-line-limit",
			severity: "error",
			file: relMdPath,
			line: 1,
			message: `Custom skill ${skillName}/SKILL.md has ${lineCount} lines (exceeds the 500 lines threshold). Apply 3-tier progressive disclosure by moving detailed specifications into references/ or workflows/.`,
			context: skillName
		});
	}
	findDescriptionBlockBounds(fmRaw) {
		const fmLines = fmRaw.split(/\r?\n/);
		const startLineIdx = fmLines.findIndex((line) => line.startsWith("description:"));
		if (startLineIdx === -1) return null;
		const firstValue = fmLines[startLineIdx].slice(12).trim();
		const valueLines = firstValue ? [firstValue] : [];
		let endLineIdx = startLineIdx;
		for (let i = startLineIdx + 1; i < fmLines.length; i++) {
			const line = fmLines[i];
			if (/^[ \t]+\S/.test(line)) {
				valueLines.push(line.trim());
				endLineIdx = i;
			} else break;
		}
		return {
			startLineIdx,
			endLineIdx,
			rawValue: valueLines.join(" ").replace(/^[>|]-?[ \t]*/, "").trim()
		};
	}
	tryAutoFixSkillDescription(skillMdPath, descriptionText) {
		if (!this.isFixActive()) return false;
		try {
			const content = safeReadFileSync(skillMdPath);
			if (!content) return false;
			const fmMatch = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
			if (!fmMatch) return false;
			const fmRaw = fmMatch[2];
			const bounds = this.findDescriptionBlockBounds(fmRaw);
			if (!bounds) return false;
			const words = descriptionText.replace(/\r?\n/g, " ").split(/\s+/).filter(Boolean);
			const lines = [];
			let currentLine = "  ";
			for (const word of words) if (currentLine.length + word.length + 1 > MAX_DESCRIPTION_LINE_WRAP) {
				lines.push(currentLine);
				currentLine = "  " + word;
			} else currentLine = currentLine === "  " ? "  " + word : currentLine + " " + word;
			if (currentLine.trim()) lines.push(currentLine);
			const formatted = "description: >-\n" + lines.join("\n");
			const fmLines = fmRaw.split(/\r?\n/);
			fmLines.splice(bounds.startLineIdx, bounds.endLineIdx - bounds.startLineIdx + 1, formatted);
			const updatedFm = fmLines.join("\n");
			const updated = fmMatch[1] + updatedFm + fmMatch[3] + content.slice(fmMatch[0].length);
			fs.writeFileSync(skillMdPath, updated, "utf8");
			const targetLabel = path.posix.join(path.basename(path.dirname(skillMdPath)), "SKILL.md");
			this.context.logProgress(`Auto-formatted 'description: >-' in ${targetLabel}`);
			return true;
		} catch {
			return false;
		}
	}
	tryRecoverFrontmatter(skillMdPath, frontmatterRaw) {
		if (!this.isFixActive()) return null;
		const bounds = this.findDescriptionBlockBounds(frontmatterRaw);
		if (!bounds || bounds.rawValue.length < 10) return null;
		if (!this.tryAutoFixSkillDescription(skillMdPath, bounds.rawValue)) return null;
		const freshContent = safeReadFileSync(skillMdPath);
		if (!freshContent) return null;
		const freshParts = freshContent.split("---");
		if (freshParts.length < 3) return null;
		const freshFrontmatterRaw = freshParts[1];
		const parsed = tryOrNull(() => yaml.parse(freshFrontmatterRaw));
		if (!parsed || typeof parsed !== "object") return null;
		return {
			parsed,
			freshFrontmatterRaw
		};
	}
	validateSkillFrontmatter(skillMdPath, skillName) {
		const relMdPath = toPosixRelative(this.projectRoot, skillMdPath);
		this.recordScanned(relMdPath);
		const content = safeReadFileSync(skillMdPath);
		if (!content) return;
		const isLocked = isLockedSkillPath(skillMdPath, this.projectRoot);
		if (!content.startsWith("---")) {
			this.addViolation({
				ruleId: "skill-invalid-yaml-frontmatter",
				severity: "error",
				file: relMdPath,
				line: 1,
				message: `File ${skillName}/SKILL.md does not contain frontmatter delimited by '---'`,
				context: skillName
			});
			return;
		}
		const parts = content.split("---");
		if (parts.length < 3) {
			this.addViolation({
				ruleId: "skill-invalid-yaml-frontmatter",
				severity: "error",
				file: relMdPath,
				line: 1,
				message: `Frontmatter of ${skillName}/SKILL.md is not closed with '---'`,
				context: skillName
			});
			return;
		}
		let frontmatterRaw = parts[1];
		let parsed = null;
		try {
			parsed = yaml.parse(frontmatterRaw);
		} catch (err) {
			if (!isLocked) {
				const recovered = this.tryRecoverFrontmatter(skillMdPath, frontmatterRaw);
				if (recovered) {
					parsed = recovered.parsed;
					frontmatterRaw = recovered.freshFrontmatterRaw;
				}
			}
			if (!parsed || typeof parsed !== "object") {
				const errMsg = err instanceof Error ? err.message : String(err);
				this.addViolation({
					ruleId: "skill-invalid-yaml-frontmatter",
					severity: "error",
					file: relMdPath,
					line: 1,
					message: `YAML syntax error in frontmatter of ${skillName}/SKILL.md: ${errMsg.split("\n")[0]}`,
					context: skillName,
					fixable: !isLocked
				});
				return;
			}
		}
		if (!parsed || typeof parsed !== "object") {
			this.addViolation({
				ruleId: "skill-invalid-yaml-frontmatter",
				severity: "error",
				file: relMdPath,
				line: 1,
				message: `Frontmatter of ${skillName}/SKILL.md is not a valid YAML object`,
				context: skillName
			});
			return;
		}
		const ctx = {
			skillName,
			skillMdPath,
			relMdPath,
			frontmatterRaw,
			parsed,
			isLocked
		};
		this.validateSkillName(parsed, relMdPath, skillName);
		this.validateSkillDescription(ctx);
	}
	validateSkillName(parsed, relMdPath, skillName) {
		if (!parsed.name || typeof parsed.name !== "string" || !parsed.name.trim()) this.addViolation({
			ruleId: "skill-invalid-yaml-frontmatter",
			severity: "error",
			file: relMdPath,
			line: 1,
			message: `Missing 'name' field in frontmatter of ${skillName}/SKILL.md`,
			context: skillName
		});
		else if (parsed.name.trim() !== skillName) this.addViolation({
			ruleId: "skill-invalid-yaml-frontmatter",
			severity: "error",
			file: relMdPath,
			line: 1,
			message: `Skill name '${parsed.name}' does not match directory name '${skillName}' in ${skillName}/SKILL.md`,
			context: skillName
		});
	}
	validateSkillDescription(ctx) {
		if (!ctx.parsed.description || typeof ctx.parsed.description !== "string" || !ctx.parsed.description.trim()) {
			this.addViolation({
				ruleId: "skill-invalid-yaml-frontmatter",
				severity: "error",
				file: ctx.relMdPath,
				line: 1,
				message: `Missing 'description' field in frontmatter of ${ctx.skillName}/SKILL.md`,
				context: ctx.skillName
			});
			return;
		}
		if (ctx.parsed.description.trim().length < 10) {
			this.addViolation({
				ruleId: "skill-invalid-yaml-frontmatter",
				severity: "error",
				file: ctx.relMdPath,
				line: 1,
				message: `Skill description in ${ctx.skillName}/SKILL.md is too short (must be at least 10 characters)`,
				context: ctx.skillName
			});
			return;
		}
		const descMatch = ctx.frontmatterRaw.match(/^description:\s*([^\r\n]*)/m);
		if (!descMatch) return;
		const lineAfterDesc = descMatch[1]?.trim() ?? "";
		if (ctx.isLocked) {
			const isFoldedOrBlock = lineAfterDesc.startsWith(">-") || lineAfterDesc.startsWith(">") || lineAfterDesc.startsWith("|-") || lineAfterDesc.startsWith("|");
			this.validateLockedSkillDescription(ctx, lineAfterDesc, isFoldedOrBlock);
		} else this.validateCustomSkillDescription(ctx, lineAfterDesc, descMatch);
	}
	validateLockedSkillDescription(ctx, lineAfterDesc, isFoldedOrBlock) {
		const isQuoted = lineAfterDesc.startsWith("\"") && lineAfterDesc.endsWith("\"") || lineAfterDesc.startsWith("'") && lineAfterDesc.endsWith("'");
		if (!isFoldedOrBlock && !isQuoted && lineAfterDesc.length > 0) {
			if (lineAfterDesc.includes(": ") || lineAfterDesc.includes("!")) this.addViolation({
				ruleId: "skill-invalid-yaml-frontmatter",
				severity: "error",
				file: ctx.relMdPath,
				line: 1,
				message: `Unquoted single-line 'description' in locked skill ${ctx.skillName}/SKILL.md contains ': ' or '!'. Quote the string or use folded block scalar for Go YAML compatibility.`,
				context: ctx.skillName
			});
		}
	}
	hasInvalidDescriptionBlockIndentation(frontmatterRaw, matchedDesc) {
		const descIndex = frontmatterRaw.indexOf(matchedDesc);
		const rawLines = frontmatterRaw.slice(descIndex + matchedDesc.length).split(/\r?\n/);
		for (const line of rawLines) {
			if (!line.trim()) continue;
			if (!line.startsWith(" ") && !line.startsWith("	")) break;
			if (!/^ {2}\S/.test(line)) return true;
		}
		return false;
	}
	validateCustomSkillDescription(ctx, lineAfterDesc, descMatch) {
		const isStrictFolded = lineAfterDesc === ">-";
		const hasInvalidIndentation = isStrictFolded ? this.hasInvalidDescriptionBlockIndentation(ctx.frontmatterRaw, descMatch[0]) : false;
		if (!isStrictFolded || hasInvalidIndentation) {
			if (this.isFixActive()) {
				if (this.tryAutoFixSkillDescription(ctx.skillMdPath, ctx.parsed.description)) return;
			}
			const issueDetail = !isStrictFolded ? `must define 'description' using folded block scalar syntax ('description: >-')` : `must indent description block lines with exactly 2 spaces`;
			this.addViolation({
				ruleId: "skill-invalid-yaml-frontmatter",
				severity: "error",
				file: ctx.relMdPath,
				line: 1,
				message: `Custom skill ${ctx.skillName}/SKILL.md ${issueDetail} (Invariant #15 of /architecture). Run 'npm run auditor:fix' or 'auditor fix' to format automatically.`,
				context: ctx.skillName,
				fixable: true
			});
		}
	}
	validateSkillAsset(relPath, absPath, skillName, astEngine) {
		const ext = path.extname(relPath).toLowerCase();
		if (ext === ".json") {
			const raw = safeReadFileSync(absPath);
			if (raw) try {
				JSON.parse(raw);
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : String(err);
				this.addViolation({
					ruleId: "skill-invalid-asset-syntax",
					severity: "error",
					file: relPath,
					line: 1,
					message: `JSON syntax error in skill asset '${relPath}': ${errMsg}`,
					context: skillName
				});
			}
		} else if (ext === ".ts" || ext === ".js" || ext === ".mjs" || ext === ".cjs") {
			const raw = safeReadFileSync(absPath);
			if (raw) {
				const sourceFile = astEngine.getSourceFile(absPath, raw);
				const diagnostics = sourceFile.parseDiagnostics;
				if (diagnostics && diagnostics.length > 0) {
					const first = diagnostics[0];
					const message = typeof first.messageText === "string" ? first.messageText : first.messageText.messageText;
					const { line } = sourceFile.getLineAndCharacterOfPosition(first.start ?? 0);
					this.addViolation({
						ruleId: "skill-invalid-asset-syntax",
						severity: "error",
						file: relPath,
						line: line + 1,
						message: `TypeScript syntax error in skill asset '${relPath}': ${message}`,
						context: skillName
					});
				}
			}
		}
	}
	validateHostLockFileOwnership(relLockPath, absLockPath, auditorOwnedSkills) {
		const raw = safeReadFileSync(absLockPath);
		if (!raw) return;
		const data = safeJsonParse(raw);
		if (!data?.skills || typeof data.skills !== "object") return;
		const offendingKeys = Object.keys(data.skills).filter((k) => auditorOwnedSkills.has(k.toLowerCase()));
		if (offendingKeys.length === 0) return;
		if (this.isFixActive()) {
			for (const key of offendingKeys) delete data.skills[key];
			if (Object.keys(data.skills).length === 0) fs.rmSync(absLockPath, { force: true });
			else fs.writeFileSync(absLockPath, JSON.stringify(data, null, 2) + "\n", "utf8");
			this.context.logProgress(`Removed auditor-owned skill lock entries (${offendingKeys.join(", ")}) from ${relLockPath}`);
			return;
		}
		for (const key of offendingKeys) this.addViolation({
			ruleId: "host-duplicate-auditor-skill",
			severity: "error",
			file: relLockPath,
			line: 1,
			message: `Host skills-lock file '${relLockPath}' locks skill '${key}' which belongs to @francogp/auditor. Each project may only lock its own project-local skills; request the @francogp/auditor maintainer to update auditor skills upstream.`,
			context: key,
			fixable: true
		});
	}
	validateHostDuplicateSkillDirs(auditorOwnedSkills, removedOrDuplicateSkills) {
		const skillsJsonRel = path.posix.join(this.primaryAgentDir, "skills.json");
		for (const root of this.skillsRoots) {
			const absRoot = path.resolve(this.projectRoot, root);
			if (!fs.existsSync(absRoot)) continue;
			const entries = tryOrNull(() => fs.readdirSync(absRoot, { withFileTypes: true })) ?? [];
			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				const skillName = entry.name;
				if (!auditorOwnedSkills.has(skillName.toLowerCase())) continue;
				removedOrDuplicateSkills.add(skillName);
				const skillDir = path.join(absRoot, skillName);
				if (this.isFixActive()) {
					fs.rmSync(skillDir, {
						recursive: true,
						force: true
					});
					this.context.logProgress(`Removed duplicate auditor-owned skill directory '${skillName}'`);
				} else this.addViolation({
					ruleId: "host-duplicate-auditor-skill",
					severity: "error",
					file: skillsJsonRel,
					line: 1,
					message: `Skill '${skillName}' in '${toPosixRelative(this.projectRoot, skillDir)}' belongs to @francogp/auditor and must not be duplicated or updated in a consumer host project. Only @francogp/auditor can manage its own skills; request the @francogp/auditor maintainer to update it upstream.`,
					context: skillName,
					fixable: true
				});
			}
		}
	}
	validateHostDuplicateAuditorSkills() {
		const removedOrDuplicateSkills = /* @__PURE__ */ new Set();
		const auditorOwnedSkills = loadAuditorOwnedSkills(this.projectRoot);
		if (auditorOwnedSkills.size === 0) return removedOrDuplicateSkills;
		this.validateHostDuplicateSkillDirs(auditorOwnedSkills, removedOrDuplicateSkills);
		for (const relLockPath of SKILLS_LOCK_CANDIDATE_PATHS) {
			const absLockPath = path.resolve(this.projectRoot, relLockPath);
			if (!fs.existsSync(absLockPath)) continue;
			this.recordScanned(relLockPath);
			this.validateHostLockFileOwnership(relLockPath, absLockPath, auditorOwnedSkills);
		}
		return removedOrDuplicateSkills;
	}
	repairSkillYamlFrontmatters() {
		const collectedFiles = this.context.collectFiles(this.skillsRoots, /* @__PURE__ */ new Set([".md"]));
		for (const absFile of collectedFiles) if (path.basename(absFile) === "SKILL.md") {
			const skillName = extractSkillName(absFile, this.projectRoot, this.skillsRoots);
			this.validateSkillFrontmatter(absFile, skillName);
		}
	}
	async runAudit(astContext) {
		if (await this.checkGating()) return;
		const pluginsJsonRel = path.posix.join(this.primaryAgentDir, "plugins.json");
		const skillsJsonRel = path.posix.join(this.primaryAgentDir, "skills.json");
		for (const registryFile of [
			pluginsJsonRel,
			skillsJsonRel,
			...SKILLS_LOCK_CANDIDATE_PATHS
		]) if (fs.existsSync(path.join(this.projectRoot, registryFile))) this.recordScanned(registryFile);
		const isProvider = isSelfProviderProject(this.projectRoot);
		if (isProvider) {
			this.context.setMetric("Agent Plugin Status", "Provider Validated");
			this.markRuleNotApplicable("missing-agent-plugin-registration", "Provider project for @francogp/auditor (self-registered)");
			this.markRuleNotApplicable("host-duplicate-auditor-skill", "Provider project for @francogp/auditor (owns canonical skills)");
		} else this.runSubAuditorSync("missing-agent-plugin-registration", () => {
			if (isPluginRegisteredInAgents(this.projectRoot, this.primaryAgentDir)) {
				this.context.setMetric("Agent Plugin Status", "Registered");
				return;
			}
			if (this.tryAutoFixPlugin()) return;
			this.reportMissingPluginViolation();
		});
		const astEngine = astContext ?? new SharedAstContext();
		const collectedFiles = this.context.collectFiles(this.skillsRoots, ALL_SKILL_EXTENSIONS);
		const skillMdFiles = [];
		const skillAssetFiles = [];
		for (const absFile of collectedFiles) {
			const relFile = toPosixRelative(this.projectRoot, absFile);
			this.recordScanned(relFile);
			const skillName = extractSkillName(absFile, this.projectRoot, this.skillsRoots);
			if (path.basename(absFile) === "SKILL.md") skillMdFiles.push({
				absFile,
				skillName
			});
			else skillAssetFiles.push({
				absFile,
				relFile,
				skillName
			});
		}
		let duplicateSkills = /* @__PURE__ */ new Set();
		if (!isProvider) this.runSubAuditorSync("host-duplicate-auditor-skill", () => {
			duplicateSkills = this.validateHostDuplicateAuditorSkills();
		});
		const activeSkillMdFiles = this.isFixActive() && duplicateSkills.size > 0 ? skillMdFiles.filter((s) => !duplicateSkills.has(s.skillName)) : skillMdFiles;
		const activeSkillAssetFiles = this.isFixActive() && duplicateSkills.size > 0 ? skillAssetFiles.filter((s) => !duplicateSkills.has(s.skillName)) : skillAssetFiles;
		this.runSubAuditorSync("skill-invalid-yaml-frontmatter", () => {
			for (const { absFile, skillName } of activeSkillMdFiles) this.validateSkillFrontmatter(absFile, skillName);
		});
		this.runSubAuditorSync("skill-exceeds-line-limit", () => {
			for (const { absFile, skillName } of activeSkillMdFiles) this.validateSkillLineLimit(absFile, skillName);
		});
		this.runSubAuditorSync("skill-invalid-asset-syntax", () => {
			for (const { absFile, relFile, skillName } of activeSkillAssetFiles) this.validateSkillAsset(relFile, absFile, skillName, astEngine);
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new AgentPluginAuditor());
export { AGENT_PLUGIN_RULES, AgentPluginAuditor, fixMissingAgentPluginRegistration };
