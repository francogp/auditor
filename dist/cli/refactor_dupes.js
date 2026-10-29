#!/usr/bin/env -S node --experimental-strip-types
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs, resolveHumanModeFromArgs } from "../core/cli/cittyHarness.js";
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { isMainModule } from "./cliUtils.js";
import { HybridHarnessEngine } from "../core/refactor/hybridHarness.js";
import { DupesRefactorEngine, runFallowJson } from "../core/refactor/dupesRefactorEngine.js";
import { MicroContextExtractor } from "../core/refactor/microContextExtractor.js";
import { applyPlanFileWithWorktreeVerification } from "../core/refactor/worktreeSandbox.js";
import { REFACTOR_POSITIONAL_CLI_ARGS, REFACTOR_SUBCOMMANDS } from "../core/refactor/refactorCliHarness.js";
import path from "node:path";
import { styleText } from "node:util";
// src/cli/refactor_dupes.ts
/**
* src/cli/refactor_dupes.ts
*
* CANONICAL REFACTORING & DUPLICATION REMEDIATION CLI (Node.js 26+ Native)
* Provides interactive discovery, micro-context inspection, and AST refactor application.
*/
const REFACTOR_DUPES_CLI_COMMAND = "auditor:dupes";
const REFACTOR_DUPES_ARGS = {
	...COMMON_CLI_ARGS,
	"min-occurrences": {
		type: "string",
		default: "2",
		description: "Minimum number of clone occurrences to triage"
	},
	plan: {
		type: "string",
		description: "Path to RefactorPlan JSON file"
	},
	...REFACTOR_POSITIONAL_CLI_ARGS,
	fingerprint: {
		type: "string",
		description: "Clone group fingerprint to inspect"
	},
	worktree: {
		type: "boolean",
		default: false,
		description: "Execute mutations in an isolated Git worktree"
	}
};
const MAX_COMPACT_CLONES = 15;
function handleDupesDiscover(projectRoot, candidates, isJson, isVerbose = false) {
	if (isJson) {
		console.log(JSON.stringify(candidates, null, 2));
		return;
	}
	if (!isVerbose) {
		if (candidates.length === 0) {
			console.log("✔ No duplicate clones found.");
			return;
		}
		console.log(`\n• Total: ${candidates.length} clone group(s) detected:`);
		for (const c of candidates.slice(0, MAX_COMPACT_CLONES)) {
			const fileNames = c.files.map((f) => path.basename(f)).join(", ");
			console.log(`  - [${c.fingerprint}] ${c.topology} (${c.tokenCount * c.occurrenceCount} tokens) -> ${fileNames}`);
		}
		if (candidates.length > MAX_COMPACT_CLONES) console.log(`  ... and ${candidates.length - MAX_COMPACT_CLONES} more group(s).`);
		console.log("\nNext action: npm run auditor:dupes inspect <fingerprint>\n");
		return;
	}
	console.log("\n" + renderBanner("DETERMINISTIC REFACTORING: CLONE TRIAGE", `Directory: ${path.basename(projectRoot)} | Total: ${candidates.length} groups`));
	const cols = [
		{
			header: "#",
			width: 3,
			align: "center",
			key: "index"
		},
		{
			header: "FINGERPRINT",
			width: 12,
			align: "center",
			key: "fingerprint"
		},
		{
			header: "TOPOLOGY",
			width: 15,
			align: "center",
			key: "topology"
		},
		{
			header: "TOKENS",
			width: 8,
			align: "right",
			key: "tokens"
		},
		{
			header: "STATUS",
			width: 12,
			align: "center",
			key: "status"
		},
		{
			header: "AFFECTED FILES",
			width: 22,
			align: "left",
			key: "files"
		}
	];
	const rows = candidates.slice(0, 20).map((c, i) => {
		const statusLabel = c.isDeadCodeTarget ? styleText("red", "DEAD") : styleText("green", "ACTIVE");
		const fileNames = c.files.map((f) => path.basename(f)).join(", ");
		return {
			index: String(i + 1),
			fingerprint: c.fingerprint,
			topology: c.topology,
			tokens: String(c.tokenCount * c.occurrenceCount),
			status: statusLabel,
			files: fileNames.length > 20 ? fileNames.slice(0, 19) + "…" : fileNames
		};
	});
	console.log(renderBoxTable(cols, rows));
	console.log(styleText("cyan", "\n[Notice] To inspect a clone and generate its Dirac micro-context:\n   npm run auditor:dupes inspect <fingerprint>\n"));
}
function handleDupesInspect(projectRoot, fp, isJson) {
	if (!fp) {
		console.error(styleText("red", "[Error] You must specify a fingerprint: auditor:dupes inspect <fingerprint>"));
		process.exit(1);
	}
	const group = runFallowJson("dupes", [], projectRoot).clone_groups.find((g) => g.fingerprint === fp || g.fingerprint === `dup:${fp}`);
	if (!group) {
		console.error(styleText("red", `[Error] Clone group not found for fingerprint: "${fp}".`));
		process.exit(1);
	}
	const packet = new MicroContextExtractor().extract(projectRoot, group);
	if (isJson) {
		console.log(JSON.stringify(packet, null, 2));
		return;
	}
	console.log("\n" + renderBanner("DIRAC MICRO-CONTEXT ANCHORED BY HASH", `Fingerprint: ${packet.fingerprint} | Instances: ${packet.instances.length}`));
	console.log(`  Context Reduction: ${packet.traditionalTokensEstimate.toLocaleString()} tokens → ${packet.microContextTokensEstimate.toLocaleString()} tokens (${styleText("green", packet.tokenSavingsPercent + "% savings")})`);
	console.log(`  Inferred Parameters: ${packet.candidateParameters.join(", ") || "none"}`);
	console.log(`  Inferred Returns:    ${packet.candidateReturns.join(", ") || "none"}\n`);
	for (const [idx, inst] of packet.instances.entries()) {
		console.log(styleText("bold", `  Instance #${idx + 1}: ${inst.file} (Lines ${inst.startLine}-${inst.endLine}) [sha256: ${inst.sha256.slice(0, 8)}...]`));
		console.log(inst.contextSnippet.split("\n").map((l) => `    │ ${l}`).join("\n") + "\n");
	}
	console.log(styleText("cyan", "[Notice] Design RefactorPlan JSON and apply with:\n   npm run auditor:dupes apply --plan <plan.json> --worktree\n"));
}
async function handleDupesApply(projectRoot, rawPlanPath, useWorktree) {
	await applyPlanFileWithWorktreeVerification(projectRoot, rawPlanPath, useWorktree, (dir, plan) => HybridHarnessEngine.execute(dir, plan), "auditor:dupes apply <plan.json>");
	console.log(styleText("green", "[OK] Refactoring successfully applied to workspace."));
}
async function executeDupesCli(parsed) {
	const subCommand = parsed.subcommand || "discover";
	const targetArg = parsed.target || (typeof parsed.fingerprint === "string" ? parsed.fingerprint : void 0) || (typeof parsed.plan === "string" ? parsed.plan : void 0);
	if (parsed.help || subCommand === "help" || !REFACTOR_SUBCOMMANDS.has(subCommand)) {
		console.log("Available commands: discover, inspect, apply (see also auditor:magic)");
		return;
	}
	const projectRoot = path.resolve(String(parsed.project || "."));
	const isJson = Boolean(parsed.json);
	const isVerbose = resolveHumanModeFromArgs(parsed);
	if (subCommand === "discover") {
		const minOcc = parseInt(String(parsed["min-occurrences"] || "2"), 10);
		handleDupesDiscover(projectRoot, new DupesRefactorEngine({ projectRoot }).triageCandidates(minOcc), isJson, isVerbose);
		return;
	}
	if (subCommand === "inspect") {
		handleDupesInspect(projectRoot, targetArg || (typeof parsed.fingerprint === "string" ? parsed.fingerprint : void 0), isJson);
		return;
	}
	if (subCommand === "apply") {
		await handleDupesApply(projectRoot, targetArg || (typeof parsed.plan === "string" ? parsed.plan : void 0), Boolean(parsed.worktree));
		return;
	}
	console.log("Available commands: discover, inspect, apply");
}
async function runRefactorCli(rawInputArgs) {
	const rawArgs = rawInputArgs ? [...rawInputArgs] : getProcessCliArgs();
	await executeDupesCli(parseCittyArgs(REFACTOR_DUPES_ARGS, rawArgs, REFACTOR_SUBCOMMANDS));
}
if (isMainModule(import.meta.url, ["auditor-dupes", "refactor_dupes"])) runRefactorCli().catch((err) => {
	console.error(err);
	process.exit(1);
});
export { REFACTOR_DUPES_CLI_COMMAND, executeDupesCli, handleDupesApply, handleDupesDiscover, handleDupesInspect, runRefactorCli };
