#!/usr/bin/env -S node --experimental-strip-types
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs } from "../core/cli/cittyHarness.js";
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { isMainModule } from "./cliUtils.js";
import { MagicNumberHarness } from "../core/refactor/magicNumberHarness.js";
import { MagicNumberExtractor } from "../core/refactor/magicNumberExtractor.js";
import { applyPlanFileWithWorktreeVerification } from "../core/refactor/worktreeSandbox.js";
import path from "node:path";
import { styleText } from "node:util";
// src/cli/refactor_magic.ts
/**
* src/cli/refactor_magic.ts
*
* CANONICAL MAGIC LITERAL & DESIGN TOKEN REFACTORING CLI (Node.js 26+ Native)
* Provides interactive discovery, Super-Dirac batch inspection, and safe worktree application.
*/
const MAX_DISPLAY_FILE_PATH_LENGTH = 42;
function handleDiscover(projectRoot, extractor) {
	console.log(styleText("cyan", `Scanning files for magic numbers in: ${projectRoot}...\n`));
	const scannableFiles = extractor.getScannableFiles();
	const tableRows = [];
	let totalFound = 0;
	for (const relFile of scannableFiles) {
		const items = extractor.scanFile(projectRoot, relFile);
		if (items.length > 0) {
			totalFound += items.length;
			const zeroCount = items.filter((i) => i.isZeroTokenResolvable).length;
			tableRows.push({
				file: relFile.length > MAX_DISPLAY_FILE_PATH_LENGTH ? `...${relFile.slice(-39)}` : relFile,
				count: String(items.length),
				zero: String(zeroCount),
				pending: String(items.length - zeroCount)
			});
		}
	}
	if (tableRows.length === 0) {
		console.log(styleText("green", "[OK] Zero magic numbers detected in workspace!\n"));
		return;
	}
	console.log(renderBoxTable([
		{
			key: "file",
			header: "File",
			width: 44,
			align: "left"
		},
		{
			key: "count",
			header: "Total",
			width: 8,
			align: "right"
		},
		{
			key: "zero",
			header: "0-Token",
			width: 10,
			align: "right"
		},
		{
			key: "pending",
			header: "Pending",
			width: 11,
			align: "right"
		}
	], tableRows));
	console.log(styleText("yellow", `\nTotal: ${totalFound} magic literal(s) detected across ${tableRows.length} file(s).`));
	console.log(styleText("cyan", "\n[Notice] To generate Super-Dirac packet for a file:\n   npm run auditor:magic inspect <file>\n"));
}
function handleInspect(projectRoot, extractor, targetFile) {
	if (!targetFile) {
		console.error(styleText("red", "[Error] You must specify a file to inspect: auditor:magic inspect <file>"));
		process.exit(1);
	}
	const items = extractor.scanFile(projectRoot, targetFile);
	if (items.length === 0) {
		console.log(styleText("green", `[OK] No magic numbers detected in: ${targetFile}`));
		return;
	}
	const packet = extractor.generateSuperDiracPacket(projectRoot, targetFile, items);
	console.log(styleText("cyan", `[Dirac] Super-Dirac Packet for: ${targetFile}`));
	console.log(styleText("gray", `• Total: ${packet.totalItems} | 0-Token: ${packet.zeroTokenCount} | Pending: ${packet.pendingAmbiguousCount}`));
	console.log(styleText("green", `• Token Savings: ${packet.fullFileTokensBaseline} -> ${packet.superDiracBatchTokens} (${packet.tokenSavingsPercent}% savings)\n`));
	console.log(JSON.stringify(packet, null, 2));
	const suggestedPlan = extractor.createRefactorPlan(`magic-plan-${Date.now()}`, targetFile, items);
	console.log(styleText("yellow", "\n[Plan] Suggested declarative plan ready to apply (--plan):\n"));
	console.log(JSON.stringify(suggestedPlan, null, 2));
	console.log(styleText("cyan", "\n[Notice] To apply this plan automatically:\n   1. Save the plan JSON to a file (e.g. scratch/magic_plan.json)\n   2. Run: npm run auditor:magic apply scratch/magic_plan.json --worktree\n"));
}
async function handleApply(projectRoot, rawPlanPath, useWorktree) {
	await applyPlanFileWithWorktreeVerification(projectRoot, rawPlanPath, useWorktree, (dir, plan) => MagicNumberHarness.execute(dir, plan), "auditor:magic apply <plan.json>");
	console.log(styleText("green", "\n[OK] Magic numbers refactoring applied successfully!"));
}
const REFACTOR_MAGIC_ARGS = {
	...COMMON_CLI_ARGS,
	subcommand: {
		type: "positional",
		required: false,
		default: "discover",
		description: "Subcommand to run (discover | inspect | apply | help)"
	},
	target: {
		type: "positional",
		required: false,
		description: "File to inspect or MagicRefactorPlan JSON file to apply"
	},
	file: {
		type: "string",
		description: "Target file to inspect for magic literals"
	},
	plan: {
		type: "string",
		description: "Path to MagicRefactorPlan JSON file"
	},
	worktree: {
		type: "boolean",
		default: false,
		description: "Execute mutations in an isolated Git worktree"
	}
};
const MAGIC_SUBCOMMANDS = /* @__PURE__ */ new Set([
	"discover",
	"inspect",
	"apply",
	"help"
]);
async function runRefactorMagicCli(rawInputArgs) {
	const rawArgs = rawInputArgs ? [...rawInputArgs] : getProcessCliArgs();
	const parsed = parseCittyArgs(REFACTOR_MAGIC_ARGS, rawArgs, MAGIC_SUBCOMMANDS);
	const command = parsed.subcommand || "discover";
	const targetArg = parsed.target || (typeof parsed.file === "string" ? parsed.file : void 0) || (typeof parsed.plan === "string" ? parsed.plan : void 0);
	const projectRoot = path.resolve(String(parsed.project || process.cwd()));
	if (parsed.help || command === "help") {
		renderBanner("auditor-magic", "Deterministic Magic Numbers Governance & Refactoring");
		console.log(`
Usage:
  npm run auditor:magic [command] [options]

Commands:
  discover                  Scan workspace and list files with magic numbers or tokens
  inspect <file>            Extract Super-Dirac packet for a specific file
  apply <plan.json>         Apply refactor plan (supports --worktree)

Options:
  --project <path>          Path to target project root (default: cwd)
  --plan <path>             Path to MagicRefactorPlan JSON
  --worktree                Execute mutations in ephemeral Git Worktree
  -h, --help                Show this help manual
`);
		return;
	}
	renderBanner("auditor-magic", "Deterministic Magic Numbers Governance & Refactoring");
	const extractor = new MagicNumberExtractor({ projectRoot });
	if (!extractor.isToolEnabled()) {
		console.log(styleText("yellow", `\n[Warning] Tool 'auditor-magic' (constants) is disabled in .auditor/audit.config.ts.\n`));
		return;
	}
	extractor.indexProjectConstants(projectRoot);
	switch (command) {
		case "discover":
			handleDiscover(projectRoot, extractor);
			break;
		case "inspect":
			handleInspect(projectRoot, extractor, targetArg);
			break;
		case "apply":
			await handleApply(projectRoot, targetArg || (typeof parsed.plan === "string" ? parsed.plan : void 0), Boolean(parsed.worktree));
			break;
		default:
			console.error(styleText("red", `[Error] Unknown command: ${command}`));
			process.exit(1);
	}
}
if (isMainModule(import.meta.url, ["auditor-magic", "refactor_magic"])) runRefactorMagicCli().catch((err) => {
	console.error("\n[Error] Fatal error in auditor-magic:", err);
	process.exit(1);
});
export { runRefactorMagicCli };
