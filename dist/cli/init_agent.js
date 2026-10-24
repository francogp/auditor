#!/usr/bin/env -S node --experimental-strip-types
import { safeJsonParse, safeReadFileSync } from "../core/safeUtils.js";
import { isSelfProviderProject } from "../core/auditProjectIdentity.js";
import "../core/auditConfig.js";
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs } from "../core/cli/cittyHarness.js";
import { isMainModule } from "./cliUtils.js";
import path from "node:path";
import fs from "node:fs";
// src/cli/init_agent.ts
/**
* src/cli/init_agent.ts
*
* Antigravity Agent Plugin Registrator (Node.js 26+ Native)
* Automatically registers @francogp/auditor in .agents/plugins.json of the host project
* so Antigravity AI agents instantly discover the official auditor skill and rules.
*/
function loadAgentEntriesConfig(filePath) {
	const raw = safeReadFileSync(filePath);
	if (!raw) return { entries: [] };
	const parsed = safeJsonParse(raw);
	return Array.isArray(parsed?.entries) ? parsed : { entries: [] };
}
function registerAgentEntry(filePath, entryPath, matchFn, dryRun) {
	const config = loadAgentEntriesConfig(filePath);
	if (config.entries?.some((e) => matchFn(e.path))) return false;
	config.entries = config.entries ?? [];
	config.entries.push({ path: entryPath });
	if (!dryRun) fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n", "utf8");
	return true;
}
function initAgentSkill(options = {}) {
	const rawInitCwd = process.env.INIT_CWD;
	const safeInitCwd = rawInitCwd ? path.resolve(rawInitCwd) : void 0;
	const targetDir = options.targetDir ? path.resolve(options.targetDir) : safeInitCwd || process.cwd();
	if (isSelfProviderProject(targetDir)) return {
		success: true,
		message: "Provider repository @francogp/auditor detected. Registration skipped.",
		created: false
	};
	const agentsDir = path.join(targetDir, ".agents");
	if (!fs.existsSync(agentsDir) && !options.dryRun) fs.mkdirSync(agentsDir, { recursive: true });
	const pluginCreated = registerAgentEntry(path.join(agentsDir, "plugins.json"), "node_modules/@francogp/auditor", (p) => p === "node_modules/@francogp/auditor" || p.endsWith("@francogp/auditor"), options.dryRun);
	const skillsCreated = registerAgentEntry(path.join(agentsDir, "skills.json"), "node_modules/@francogp/auditor/.agents/skills", (p) => p === "node_modules/@francogp/auditor/.agents/skills" || p.includes("@francogp/auditor"), options.dryRun);
	const anyCreated = pluginCreated || skillsCreated;
	return {
		success: true,
		message: anyCreated ? `Successfully registered @francogp/auditor in .agents/plugins.json and .agents/skills.json` : `@francogp/auditor plugin and skills are already registered in .agents`,
		created: anyCreated
	};
}
const INIT_AGENT_ARGS = {
	...COMMON_CLI_ARGS,
	"dry-run": {
		type: "boolean",
		default: false,
		description: "Preview registration without writing"
	},
	"from-postinstall": {
		type: "boolean",
		default: false,
		description: "Invoked from npm postinstall hook"
	}
};
if (isMainModule(import.meta.url)) {
	const parsed = parseCittyArgs(INIT_AGENT_ARGS, getProcessCliArgs());
	const isDryRun = Boolean(parsed["dry-run"]);
	const isPostinstall = Boolean(parsed["from-postinstall"]);
	if (!isPostinstall) {
		console.log("\n┌────────────────────────────────────────────────────────┐");
		console.log("│  Antigravity Agent Skill Registrator (@francogp/auditor) │");
		console.log("└────────────────────────────────────────────────────────┘\n");
	}
	try {
		const result = initAgentSkill({ dryRun: isDryRun });
		if (result.success) {
			if (result.created || !isPostinstall) console.log(`[OK] ${result.message}`);
			if (!isPostinstall) {
				console.log("\nAntigravity agent now has native access to:");
				console.log("  - Skills: auditor and bundled skills from @francogp/auditor\n");
			}
		} else if (!isPostinstall) {
			console.error(`[Error] Failed to register plugin: ${result.message}`);
			process.exit(1);
		}
	} catch (err) {
		if (!isPostinstall) {
			console.error(err);
			process.exit(1);
		}
	}
}
export { initAgentSkill };
