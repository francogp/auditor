#!/usr/bin/env -S node --experimental-strip-types
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs, resolveHumanModeFromArgs } from "../core/cli/cittyHarness.js";
import { bootstrapCliProject, isHumanConsoleMode, isMainModule } from "./cliUtils.js";
import { buildNoticeBox, renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { appendMissingSectionsToConfigFile } from "../core/auditConfigAst.js";
import { evaluateProjectConfigAsync } from "../core/configAdvisor.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import { styleText } from "node:util";
// src/cli/report_config_recommendations.ts
/**
* src/cli/report_config_recommendations.ts
*
* CANONICAL AUDITOR CONFIGURATION ADVISOR CLI (Node.js 26+ Native)
*
* Inspects, evaluates, and advises on hardening opportunities for .auditor/audit.config.ts
* against canonical defaults and subauditor contracts under the Unidirectional Config
* Ratchet principle. Never recommends relaxing rules when project settings are stricter.
*/
enableCompileCache();
const CONFIG_ADVISOR_ARGS = {
	...COMMON_CLI_ARGS,
	diff: {
		type: "boolean",
		alias: "d",
		description: "Display proposed TypeScript configuration diff"
	},
	apply: {
		type: "boolean",
		alias: "a",
		description: "Additively apply recommended settings to .auditor/audit.config.ts"
	},
	subsystem: {
		type: "string",
		alias: "s",
		description: "Filter recommendations by subsystem identifier (e.g. fallow, vitePlusConfig)"
	}
};
function parseCliArgs(rawArgs = getProcessCliArgs()) {
	const parsed = parseCittyArgs(CONFIG_ADVISOR_ARGS, rawArgs);
	return {
		project: typeof parsed.project === "string" && parsed.project !== "." ? parsed.project : void 0,
		json: Boolean(parsed.json),
		diff: Boolean(parsed.diff),
		apply: Boolean(parsed.apply),
		subsystem: typeof parsed.subsystem === "string" ? parsed.subsystem : void 0,
		human: resolveHumanModeFromArgs(parsed),
		help: Boolean(parsed.help)
	};
}
function formatValuePreview(val) {
	if (val === void 0) return styleText("dim", "undefined");
	if (val === null) return styleText("dim", "null");
	if (typeof val === "boolean") return val ? styleText("green", "true") : styleText("red", "false");
	if (typeof val === "number") return styleText("yellow", String(val));
	if (typeof val === "string") return styleText("cyan", val);
	if (Array.isArray(val)) {
		const strItems = val.map((item) => typeof item === "object" && item !== null ? JSON.stringify(item) : String(item));
		if (strItems.length <= 3) return `[${strItems.join(", ")}]`;
		return `[${strItems.slice(0, 2).join(", ")}, +${strItems.length - 2} more]`;
	}
	if (typeof val === "object") {
		const keys = Object.keys(val);
		return `{ ${keys.slice(0, 2).join(", ")}${keys.length > 2 ? "..." : ""} }`;
	}
	return typeof val === "symbol" || typeof val === "function" ? val.toString() : JSON.stringify(val) ?? "";
}
function renderRecommendationsTable(recommendations) {
	return renderBoxTable([
		{
			header: "SUBSYSTEM",
			width: 14,
			render: (row) => styleText("bold", row.subsystem)
		},
		{
			header: "SETTING",
			width: 24,
			render: (row) => styleText("cyan", row.path)
		},
		{
			header: "CURRENT",
			width: 16,
			align: "center",
			render: (row) => formatValuePreview(row.currentValue)
		},
		{
			header: "RECOMMENDED",
			width: 18,
			align: "center",
			render: (row) => formatValuePreview(row.recommendedValue)
		},
		{
			header: "RATIONALE",
			width: 44,
			render: (row) => styleText("white", row.rationale)
		}
	], recommendations);
}
function renderHardenedTable(hardened) {
	return renderBoxTable([
		{
			header: "SUBSYSTEM",
			width: 14,
			render: (row) => styleText("bold", row.subsystem)
		},
		{
			header: "HARDENED SETTING",
			width: 26,
			render: (row) => styleText("green", row.path)
		},
		{
			header: "PROJECT VAL",
			width: 14,
			align: "center",
			render: (row) => styleText("yellow", String(row.currentValue))
		},
		{
			header: "DEFAULT",
			width: 14,
			align: "center",
			render: (row) => styleText("dim", String(row.defaultValue))
		},
		{
			header: "STATUS",
			width: 42,
			render: (row) => styleText("dim", row.reason)
		}
	], hardened);
}
function buildDiffPatchTree(recommendations) {
	const tree = {};
	for (const rec of recommendations) {
		const parts = rec.path.split(".");
		let curr = tree;
		for (let i = 0; i < parts.length - 1; i++) {
			const p = parts[i];
			if (!curr[p] || typeof curr[p] !== "object" || Array.isArray(curr[p])) curr[p] = {};
			curr = curr[p];
		}
		curr[parts[parts.length - 1]] = rec.recommendedValue;
	}
	return tree;
}
async function runConfigAdvisor(projectRoot = process.cwd(), options = {
	json: false,
	diff: false,
	apply: false
}) {
	if (options.help) {
		console.log(`
Usage: auditor-config [options]

Inspects and advises on hardening opportunities for .auditor/audit.config.ts
under the Unidirectional Config Ratchet principle (never relaxes strict rules).

Options:
  -p, --project <dir>      Target project directory (default: ".")
  -s, --subsystem <name>   Filter by subsystem (e.g. fallow, vitePlusConfig)
  -d, --diff               Display proposed TypeScript configuration diff
  -a, --apply              Additively apply recommended settings to audit.config.ts
      --json               Output structured JSON report
      --human              Render interactive Box-Drawing tables
  -h, --help               Display this help manual
`);
		return {
			projectRoot,
			configFile: path.join(projectRoot, ".auditor", "audit.config.ts"),
			totalChecked: 0,
			optimalCount: 0,
			hardenedCount: 0,
			recommendationsCount: 0,
			recommendations: [],
			hardenedSettings: []
		};
	}
	const report = await evaluateProjectConfigAsync(projectRoot, {
		projectRoot,
		targetSubsystem: options.subsystem
	});
	if (options.json) {
		console.log(JSON.stringify(report, null, 2));
		return report;
	}
	if (options.apply && report.recommendationsCount > 0) {
		const patchTree = buildDiffPatchTree(report.recommendations);
		appendMissingSectionsToConfigFile(report.configFile, patchTree);
		console.log(styleText("green", `\n[Applied] Successfully applied ${report.recommendationsCount} configuration hardening recommendations to .auditor/audit.config.ts\n`));
		return report;
	}
	if (options.diff && report.recommendationsCount > 0) {
		const patchTree = buildDiffPatchTree(report.recommendations);
		console.log(styleText("bold", "\n--- Proposed Configuration Hardening Additions ---"));
		console.log(styleText("cyan", JSON.stringify(patchTree, null, 2)));
		console.log(styleText("dim", "\nPass \"--apply\" to additively write these to .auditor/audit.config.ts\n"));
		return report;
	}
	if (!isHumanConsoleMode(options)) {
		console.log(`[Config Advisor] Checked: ${report.totalChecked} | Optimal: ${report.optimalCount} | Hardened: ${report.hardenedCount} | Recommendations: ${report.recommendationsCount}`);
		if (report.recommendationsCount > 0) {
			for (const rec of report.recommendations) console.log(`• ${rec.path}: current ${formatValuePreview(rec.currentValue)}, recommended ${formatValuePreview(rec.recommendedValue)} (${rec.kind})`);
			console.log("Run with \"--diff\" to inspect code changes, or \"--apply\" to auto-harden.");
		} else console.log("[OK] All configurations align with or exceed canonical architectural standards.");
		return report;
	}
	const subtitle = `Project: ${path.basename(report.projectRoot)} | Checked: ${report.totalChecked} | Optimal: ${report.optimalCount} | Hardened: ${report.hardenedCount}`;
	console.log("\n" + renderBanner("AUDITOR CONFIG ADVISOR: ARCHITECTURAL HARDENING", subtitle));
	if (report.recommendationsCount > 0) {
		console.log(styleText("bold", "\n[RECOMMENDATIONS] HARDENING OPPORTUNITIES:"));
		console.log(renderRecommendationsTable(report.recommendations));
		console.log(styleText("yellow", `\n[Notice] ${report.recommendationsCount} hardening recommendation(s) identified. Run with "--diff" to inspect proposed additions, or "--apply" to update.`));
	} else console.log("\n" + buildNoticeBox({
		title: "[OK] ZERO RELAXATIONS DETECTED",
		lines: ["All project settings meet or exceed canonical @francogp/auditor architectural standards.", "No relaxation or degradation needed."],
		borderColor: "green"
	}));
	if (report.hardenedCount > 0) {
		console.log(styleText("bold", "\n[PRESERVED] PREEXISTING STRICT RULES (NEVER RELAXED):"));
		console.log(renderHardenedTable(report.hardenedSettings));
	}
	console.log();
	return report;
}
if (isMainModule(import.meta.url, ["auditor-config", "auditor:config"])) {
	const bootstrap = bootstrapCliProject();
	const options = parseCliArgs();
	runConfigAdvisor(options.project ?? bootstrap.projectRoot, options).catch((err) => {
		console.error("Fatal CLI Error:", err);
		process.exitCode = 1;
	});
}
export { parseCliArgs, runConfigAdvisor };
