import { COMMON_CLI_ARGS, defineCommand, getProcessCliArgs, parseCittyArgs, resolveHumanModeFromArgs } from "../cli/cittyHarness.js";
import { renderBanner, renderBoxTable } from "../unifiedTheme.js";
import { scanProjectSourceFiles } from "./refactorFileScanner.js";
import { applyPlanFileWithWorktreeVerification } from "./worktreeSandbox.js";
import path from "node:path";
import fs from "node:fs";
import { styleText } from "node:util";
//#region src/core/refactor/refactorCliHarness.ts
/**
* src/core/refactor/refactorCliHarness.ts
*
* Generic CLI execution harness for Auditor interactive refactoring tools.
* Powered by Citty (`cittyHarness.ts`) for declarative argument parsing,
* Dirac micro-context rendering, Box-Drawing tables, and safe Git Worktree application.
*/
const MAX_DISPLAY_FILE_PATH_LENGTH = 44;
const REFACTOR_SUBCOMMANDS = /* @__PURE__ */ new Set([
	"discover",
	"inspect",
	"apply",
	"help"
]);
const REFACTOR_HARNESS_ARGS = {
	...COMMON_CLI_ARGS,
	file: {
		type: "string",
		description: "Target file path to inspect"
	},
	plan: {
		type: "string",
		description: "Path to declarative refactor plan JSON"
	},
	worktree: {
		type: "boolean",
		description: "Execute and verify mutation inside an ephemeral Git Worktree",
		default: false
	}
};
function formatCliRelativeFilePath(relPath) {
	if (relPath.length <= MAX_DISPLAY_FILE_PATH_LENGTH) return relPath;
	return `...${relPath.slice(-41)}`;
}
function renderHarnessHelp(def) {
	console.log(renderBanner(def.bannerTitle, def.bannerSubtitle));
	const scriptAlias = def.toolName.replace(/^auditor-/, "auditor:");
	console.log(`
Direct usage (binary in node_modules/.bin):
  ${def.toolName} discover [--project <path>] [--human]
  ${def.toolName} inspect <file> [--project <path>]
  ${def.toolName} apply <plan.json> [--worktree] [--project <path>]
  ${def.toolName} help

Usage via project npm scripts:
  npm run ${scriptAlias} discover
  npm run ${scriptAlias} inspect <file>
  npm run ${scriptAlias} apply <plan.json>
  npm run ${scriptAlias} help

[Notice] Help via npm:
   Always run: npm run ${scriptAlias} help
   Avoid using '--help' with npm (e.g. 'npm run ${scriptAlias} -- --help') because npm
   intercepts the flag and displays generic npm help instead of this tool.

[Notice] Options with dashes (--file, --project, --worktree):
   Prefix with '--' to pass through npm:
   npm run ${scriptAlias} -- --project <path>
`);
}
function handleDiscoverCommand(def, projectRoot, engine, isHuman = false) {
	const files = engine ? engine.getScannableFiles() : scanProjectSourceFiles(projectRoot);
	const tableRows = [];
	const allFindings = [];
	const fileSummaryList = [];
	for (const file of files) {
		const fullPath = path.isAbsolute(file) ? file : path.resolve(projectRoot, file);
		const fileFindings = def.discoverInFile(fullPath);
		if (fileFindings.length > 0) {
			allFindings.push(...fileFindings);
			const relFile = path.relative(projectRoot, fullPath);
			tableRows.push(def.buildTableRow(relFile, fileFindings));
			fileSummaryList.push({
				file: relFile,
				count: fileFindings.length
			});
		}
	}
	if (tableRows.length === 0) {
		if (isHuman) console.log(styleText("green", `✨ ${def.zeroFindingsMessage}\n`));
		else console.log(styleText("green", "✔ No refactoring opportunities found."));
		return;
	}
	if (isHuman) {
		console.log(styleText("cyan", `🔍 ${def.scanningMessage}: ${projectRoot}...\n`));
		console.log(renderBoxTable([...def.tableColumns], tableRows));
		console.log(styleText("yellow", `\n📊 ${def.buildSummaryMessage(tableRows.length, allFindings)}\n`));
	} else {
		console.log(`🔍 ${def.toolName} discover: ${allFindings.length} opportunity(ies) across ${tableRows.length} file(s):\n`);
		for (const item of fileSummaryList) console.log(`• ${item.file}: ${item.count} item(s)`);
		console.log(`\nNext Action: npm run ${def.toolName} inspect <file>`);
	}
}
function handleInspectCommand(def, projectRoot, targetFile) {
	if (!targetFile) {
		console.error(styleText("red", `[Error] You must specify a file to inspect. E.g.: ${def.toolName} inspect src/components/Modal.vue or --file <path>`));
		process.exit(1);
	}
	const fullPath = path.isAbsolute(targetFile) ? path.normalize(targetFile) : path.resolve(projectRoot, targetFile);
	if (!fs.existsSync(fullPath)) {
		console.error(styleText("red", `[Error] File not found: ${fullPath}`));
		process.exit(1);
	}
	const findings = def.discoverInFile(fullPath);
	if (findings.length === 0) {
		console.log(styleText("green", `[OK] File ${targetFile} has zero findings for ${def.toolDescription}.`));
		return;
	}
	console.log(styleText("cyan", `\n[Dirac] Micro-Context for: ${targetFile} (${findings.length} item(s)):\n`));
	for (const f of findings) {
		const d = def.toDiracItem(f);
		console.log(styleText("bold", `  [Line ${d.line}] ${d.kind.toUpperCase()}`));
		console.log(`     Original:     ${styleText("red", d.originalSnippet)}`);
		console.log(`     Suggestion:   ${styleText("green", d.suggestedReplacement)}`);
		console.log(`     Explanation:  ${d.explanation}\n`);
	}
	const plan = def.createPlan(`${def.toolName}-plan-${Date.now()}`, findings);
	console.log(styleText("yellow", "[Plan] Suggested declarative plan (--plan):\n"));
	console.log(JSON.stringify(plan, null, 2));
}
async function handleApplyCommand(def, projectRoot, planFile, worktree = false) {
	if (!planFile) {
		console.error(styleText("red", `[Error] You must specify a plan file to apply. E.g.: ${def.toolName} apply plan.json or --plan <path>`));
		process.exit(1);
	}
	await applyPlanFileWithWorktreeVerification(projectRoot, planFile, worktree, async (targetDir, plan) => {
		const res = def.applyPlan(targetDir, plan);
		console.log(styleText("green", `[OK] Plan applied successfully: ${res.filesChanged} file(s) modified (${res.changesApplied} change(s)).`));
	}, `${def.toolName} apply --plan <path-to-plan.json>`);
}
/**
* Creates a declarative Citty `CommandDef` for a refactoring CLI tool.
*/
function createRefactorCli(def) {
	return defineCommand({
		meta: {
			name: def.toolName,
			description: def.toolDescription
		},
		args: REFACTOR_HARNESS_ARGS,
		async run({ rawArgs }) {
			await runRefactorCliHarness(def, rawArgs);
		}
	});
}
async function runRefactorCliHarness(def, argv = getProcessCliArgs()) {
	const parsed = parseCittyArgs(REFACTOR_HARNESS_ARGS, argv, REFACTOR_SUBCOMMANDS);
	const isHuman = resolveHumanModeFromArgs({
		human: Boolean(parsed.human),
		verbose: Boolean(parsed.verbose),
		format: typeof parsed.format === "string" ? parsed.format : void 0
	}, argv);
	const command = parsed._[0] || "discover";
	if (parsed.help || command === "help") {
		renderHarnessHelp(def);
		return;
	}
	const rawProject = typeof parsed.project === "string" && parsed.project.length > 0 ? parsed.project : ".";
	const projectRoot = path.resolve(rawProject);
	const engine = def.engineFactory?.(projectRoot);
	if (engine && !engine.isToolEnabled()) {
		console.log(styleText("yellow", `\n[Warning] Tool '${engine.toolId}' is disabled in .auditor/audit.config.ts.\n`));
		return;
	}
	switch (command) {
		case "discover":
			handleDiscoverCommand(def, projectRoot, engine, isHuman);
			break;
		case "inspect":
			handleInspectCommand(def, projectRoot, (typeof parsed.file === "string" ? parsed.file : void 0) || parsed._[1]);
			break;
		case "apply":
			await handleApplyCommand(def, projectRoot, (typeof parsed.plan === "string" ? parsed.plan : void 0) || parsed._[1], Boolean(parsed.worktree));
			break;
		default:
			console.error(styleText("red", `[Error] Unknown command: ${command}`));
			process.exit(1);
	}
}
//#endregion
export { createRefactorCli, formatCliRelativeFilePath, runRefactorCliHarness };
