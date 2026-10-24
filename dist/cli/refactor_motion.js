#!/usr/bin/env -S node --experimental-strip-types
import { isMainModule } from "./cliUtils.js";
import { MotionRefactorEngine } from "../core/refactor/motionRefactorEngine.js";
import { formatCliRelativeFilePath, runRefactorCliHarness } from "../core/refactor/refactorCliHarness.js";
import { styleText } from "node:util";
// src/cli/refactor_motion.ts
/**
* src/cli/refactor_motion.ts
*
* CANONICAL MOTION & UI ANIMATION REFACTORING CLI (Node.js 26+ Native)
* Provides interactive discovery, Dirac micro-context inspection, and safe worktree application
* for UI timers, GPU transforms, and GSAP animation hygiene.
*/
const motionCliDef = {
	toolName: "auditor-motion",
	toolDescription: "UI animations and banned timers",
	bannerTitle: "AUDITOR MOTION: UI ANIMATION & GSAP GOVERNANCE",
	bannerSubtitle: "Deterministic auto-remediation of UI timers and GPU transform optimization",
	scanningMessage: "Scanning UI animations and timers in",
	zeroFindingsMessage: "Zero UI animation violations or timers detected!",
	tableColumns: [
		{
			key: "file",
			header: "File",
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
		return `Summary: ${filesCount} file(s) with ${allFindings.length} findings (${timers} timers, ${layout} layout props, ${eases} eases).`;
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
async function runRefactorMotionCli(argv) {
	await runRefactorCliHarness(motionCliDef, argv);
}
if (isMainModule(import.meta.url, ["auditor-motion", "refactor_motion"])) runRefactorMotionCli().catch((err) => {
	console.error(styleText("red", `\n[Error] Fatal error in auditor-motion: ${err.message}`));
	process.exit(1);
});
export { runRefactorMotionCli };
