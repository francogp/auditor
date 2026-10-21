#!/usr/bin/env -S node --experimental-strip-types
import { isMainModule } from "./cliUtils.js";
import { O1RefactorEngine } from "../core/refactor/o1RefactorEngine.js";
import { formatCliRelativeFilePath, runRefactorCliHarness } from "../core/refactor/refactorCliHarness.js";
import { styleText } from "node:util";
//#region src/cli/refactor_o1.ts
/**
* src/cli/refactor_o1.ts
*
* CANONICAL O(1) DATA STRUCTURES REFACTORING CLI (Node.js 26+ Native)
* Provides interactive discovery, Dirac micro-context inspection, and safe worktree application
* for linear search anti-patterns, structuredClone migration, and ReadonlySet hoists.
*/
const o1CliDef = {
	toolName: "auditor-o1",
	toolDescription: "O(N) bottlenecks or linear searches",
	bannerTitle: "AUDITOR O(1): DATA STRUCTURES & LINEAR SEARCH OPTIMIZER",
	bannerSubtitle: "Deterministic auto-remediation of linear searches and structuredClone",
	scanningMessage: "Scanning O(N) anti-patterns and linear searches in",
	zeroFindingsMessage: "Zero O(N) bottlenecks or linear searches detected!",
	tableColumns: [
		{
			key: "file",
			header: "File",
			width: 46,
			align: "left"
		},
		{
			key: "membership",
			header: "Set.has",
			width: 9,
			align: "right"
		},
		{
			key: "json",
			header: "Clone",
			width: 7,
			align: "right"
		},
		{
			key: "spread",
			header: "Spread",
			width: 8,
			align: "right"
		},
		{
			key: "total",
			header: "Total",
			width: 7,
			align: "right"
		}
	],
	engineFactory: (projectRoot) => new O1RefactorEngine({ projectRoot }),
	discoverInFile: (filePath) => O1RefactorEngine.discoverInFile(filePath),
	buildTableRow: (relFile, findings) => {
		const membership = findings.filter((f) => f.kind === "linear-membership").length;
		const json = findings.filter((f) => f.kind === "json-clone").length;
		const spread = findings.filter((f) => f.kind === "redundant-spread").length;
		return {
			file: formatCliRelativeFilePath(relFile),
			membership: String(membership),
			json: String(json),
			spread: String(spread),
			total: String(findings.length)
		};
	},
	buildSummaryMessage: (filesCount, allFindings) => {
		const membership = allFindings.filter((f) => f.kind === "linear-membership").length;
		const json = allFindings.filter((f) => f.kind === "json-clone").length;
		const spread = allFindings.filter((f) => f.kind === "redundant-spread").length;
		return `Summary: ${filesCount} file(s) with ${allFindings.length} O(1) opportunities (${membership} set memberships, ${json} structuredClone, ${spread} spreads).`;
	},
	toDiracItem: (f) => ({
		line: f.line,
		kind: f.kind,
		originalSnippet: f.originalSnippet,
		suggestedReplacement: f.suggestedReplacement,
		explanation: f.explanation
	}),
	createPlan: (id, findings) => O1RefactorEngine.createPlan(id, findings),
	applyPlan: (dir, plan) => O1RefactorEngine.applyPlan(dir, plan)
};
async function runRefactorO1Cli(argv) {
	await runRefactorCliHarness(o1CliDef, argv);
}
if (isMainModule(import.meta.url, ["auditor-o1", "refactor_o1"])) runRefactorO1Cli().catch((err) => {
	console.error(styleText("red", `\n[Error] Fatal error in auditor-o1: ${err.message}`));
	process.exit(1);
});
//#endregion
export { runRefactorO1Cli };
