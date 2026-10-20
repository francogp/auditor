#!/usr/bin/env -S node --experimental-strip-types
import { isMainModule } from "./cliUtils.js";
import { MotionRefactorEngine } from "../core/refactor/motionRefactorEngine.js";
import { formatCliRelativeFilePath, runRefactorCliHarness } from "../core/refactor/refactorCliHarness.js";
import { styleText } from "node:util";
//#region src/cli/refactor_motion.ts
/**
* src/cli/refactor_motion.ts
*
* CANONICAL MOTION & UI ANIMATION REFACTORING CLI (Node.js 26+ Native)
* Provides interactive discovery, Dirac micro-context inspection, and safe worktree application
* for UI timers, GPU transforms, and GSAP animation hygiene.
*/
const motionCliDef = {
	toolName: "auditor-motion",
	toolDescription: "UI Animation y timers",
	bannerTitle: "AUDITOR MOTION: UI ANIMATION & GSAP GOVERNANCE",
	bannerSubtitle: "Auto-remediación determinista de timers y optimización de transforms GPU",
	scanningMessage: "Escaneando animaciones y timers UI en",
	zeroFindingsMessage: "¡Cero infracciones de UI Animation o timers detectadas!",
	tableColumns: [
		{
			key: "file",
			header: "Archivo",
			width: 46,
			align: "left"
		},
		{
			key: "timers",
			header: "Timers",
			width: 8,
			align: "right"
		},
		{
			key: "layout",
			header: "Layout",
			width: 8,
			align: "right"
		},
		{
			key: "eases",
			header: "Eases",
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
	engineFactory: (projectRoot) => new MotionRefactorEngine({ projectRoot }),
	discoverInFile: (filePath) => MotionRefactorEngine.discoverInFile(filePath),
	buildTableRow: (relFile, findings) => {
		const timers = findings.filter((f) => f.kind === "banned-ui-timer").length;
		const layout = findings.filter((f) => f.kind === "layout-property").length;
		const eases = findings.filter((f) => f.kind === "legacy-ease").length;
		return {
			file: formatCliRelativeFilePath(relFile),
			timers: String(timers),
			layout: String(layout),
			eases: String(eases),
			total: String(findings.length)
		};
	},
	buildSummaryMessage: (filesCount, allFindings) => {
		const timers = allFindings.filter((f) => f.kind === "banned-ui-timer").length;
		const layout = allFindings.filter((f) => f.kind === "layout-property").length;
		const eases = allFindings.filter((f) => f.kind === "legacy-ease").length;
		return `Resumen: ${filesCount} archivos con ${allFindings.length} incidencias (${timers} timers, ${layout} layout props, ${eases} eases).`;
	},
	toDiracItem: (f) => ({
		line: f.line,
		kind: f.kind,
		originalSnippet: f.originalSnippet,
		suggestedReplacement: f.suggestedReplacement,
		explanation: f.explanation
	}),
	createPlan: (id, findings) => MotionRefactorEngine.createPlan(id, findings),
	applyPlan: (dir, plan) => MotionRefactorEngine.applyPlan(dir, plan)
};
async function runRefactorMotionCli(argv = process.argv.slice(2)) {
	await runRefactorCliHarness(motionCliDef, argv);
}
if (isMainModule(import.meta.url, ["auditor-motion", "refactor_motion"])) runRefactorMotionCli().catch((err) => {
	console.error(styleText("red", `\n💥 Error fatal en auditor-motion: ${err.message}`));
	process.exit(1);
});
//#endregion
export { runRefactorMotionCli };
