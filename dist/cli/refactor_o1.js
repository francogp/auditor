#!/usr/bin/env -S node --experimental-strip-types
import { isMainModule } from "./cliUtils.js";
import { formatCliRelativeFilePath, runRefactorCliHarness } from "../core/refactor/refactorCliHarness.js";
import { O1RefactorEngine } from "../core/refactor/o1RefactorEngine.js";
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
	toolDescription: "cuellos de botella O(N) o búsquedas lineales",
	bannerTitle: "AUDITOR O(1): DATA STRUCTURES & LINEAR SEARCH OPTIMIZER",
	bannerSubtitle: "Auto-remediación determinista de búsquedas lineales y structuredClone",
	scanningMessage: "Escaneando anti-patrones O(N) y búsquedas lineales en",
	zeroFindingsMessage: "¡Cero cuellos de botella O(N) o búsquedas lineales detectadas!",
	tableColumns: [
		{
			key: "file",
			header: "Archivo",
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
		return `Resumen: ${filesCount} archivos con ${allFindings.length} oportunidades O(1) (${membership} membresías, ${json} structuredClone, ${spread} spreads).`;
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
async function runRefactorO1Cli(argv = process.argv.slice(2)) {
	await runRefactorCliHarness(o1CliDef, argv);
}
if (isMainModule(import.meta.url, ["auditor-o1", "refactor_o1"])) runRefactorO1Cli().catch((err) => {
	console.error(styleText("red", `\n💥 Error fatal en auditor-o1: ${err.message}`));
	process.exit(1);
});
//#endregion
export { runRefactorO1Cli };
