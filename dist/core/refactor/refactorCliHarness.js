import { renderBanner, renderBoxTable } from "../unifiedTheme.js";
import { applyPlanFileWithWorktreeVerification } from "./worktreeSandbox.js";
import { scanProjectSourceFiles } from "./refactorFileScanner.js";
import path from "node:path";
import fs from "node:fs";
import { parseArgs, styleText } from "node:util";
//#region src/core/refactor/refactorCliHarness.ts
/**
* src/core/refactor/refactorCliHarness.ts
*
* Generic CLI execution harness for Auditor interactive refactoring tools.
* Provides unified argument parsing, Dirac micro-context rendering, Box-Drawing tables,
* and safe Git Worktree application with 100% native Node.js path handling.
*/
const MAX_DISPLAY_FILE_PATH_LENGTH = 44;
function formatCliRelativeFilePath(relPath) {
	if (relPath.length <= MAX_DISPLAY_FILE_PATH_LENGTH) return relPath;
	return `...${relPath.slice(-41)}`;
}
async function runRefactorCliHarness(def, argv = process.argv.slice(2)) {
	const args = parseArgs({
		args: argv,
		options: {
			project: {
				type: "string",
				default: "."
			},
			file: { type: "string" },
			plan: { type: "string" },
			worktree: {
				type: "boolean",
				default: false
			},
			help: {
				type: "boolean",
				default: false
			}
		},
		allowPositionals: true
	});
	const command = args.positionals[0] || "discover";
	if (args.values.help || command === "help") {
		console.log(renderBanner(def.bannerTitle, def.bannerSubtitle));
		console.log(`
Uso:
  ${def.toolName} discover [--project <ruta>]
  ${def.toolName} inspect --file <archivo> [--project <ruta>]
  ${def.toolName} apply --plan <plan.json> [--worktree] [--project <ruta>]
    `);
		return;
	}
	const projectRoot = path.resolve(args.values.project || ".");
	switch (command) {
		case "discover": {
			console.log(styleText("cyan", `🔍 ${def.scanningMessage}: ${projectRoot}...\n`));
			const files = scanProjectSourceFiles(projectRoot);
			const tableRows = [];
			const allFindings = [];
			for (const file of files) {
				const fileFindings = def.discoverInFile(file);
				if (fileFindings.length > 0) {
					allFindings.push(...fileFindings);
					const relFile = path.relative(projectRoot, file);
					tableRows.push(def.buildTableRow(relFile, fileFindings));
				}
			}
			if (tableRows.length === 0) {
				console.log(styleText("green", `✨ ${def.zeroFindingsMessage}\n`));
				return;
			}
			console.log(renderBoxTable([...def.tableColumns], tableRows));
			console.log(styleText("yellow", `\n📊 ${def.buildSummaryMessage(tableRows.length, allFindings)}\n`));
			break;
		}
		case "inspect": {
			if (!args.values.file) {
				console.error(styleText("red", "❌ Debes especificar --file <ruta> para inspeccionar."));
				process.exit(1);
			}
			const fullPath = path.isAbsolute(args.values.file) ? path.normalize(args.values.file) : path.resolve(projectRoot, args.values.file);
			if (!fs.existsSync(fullPath)) {
				console.error(styleText("red", `❌ Archivo inexistente: ${fullPath}`));
				process.exit(1);
			}
			const findings = def.discoverInFile(fullPath);
			if (findings.length === 0) {
				console.log(styleText("green", `✨ El archivo ${args.values.file} no presenta incidencias de ${def.toolDescription}.`));
				return;
			}
			console.log(styleText("cyan", `\n📦 Micro-Contexto Dirac para: ${args.values.file} (${findings.length} ítems):\n`));
			for (const f of findings) {
				const d = def.toDiracItem(f);
				console.log(styleText("bold", `  [Línea ${d.line}] ${d.kind.toUpperCase()}`));
				console.log(`     Original:     ${styleText("red", d.originalSnippet)}`);
				console.log(`     Sugerencia:   ${styleText("green", d.suggestedReplacement)}`);
				console.log(`     Explicación:  ${d.explanation}\n`);
			}
			const plan = def.createPlan(`${def.toolName}-plan-${Date.now()}`, findings);
			console.log(styleText("yellow", "📄 Plan declarativo sugerido (--plan):\n"));
			console.log(JSON.stringify(plan, null, 2));
			break;
		}
		case "apply":
			if (!args.values.plan) {
				console.error(styleText("red", "❌ Debes especificar --plan <ruta-al-plan.json> para aplicar."));
				process.exit(1);
			}
			await applyPlanFileWithWorktreeVerification(projectRoot, args.values.plan, Boolean(args.values.worktree), async (targetDir, plan) => {
				const res = def.applyPlan(targetDir, plan);
				console.log(styleText("green", `✅ Plan aplicado con éxito: ${res.filesChanged} archivos modificados (${res.changesApplied} cambios).`));
			}, `${def.toolName} apply --plan <ruta-al-plan.json>`);
			break;
		default:
			console.error(styleText("red", `❌ Comando desconocido: ${command}`));
			process.exit(1);
	}
}
//#endregion
export { formatCliRelativeFilePath, runRefactorCliHarness };
