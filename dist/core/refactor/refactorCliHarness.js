import { renderBanner, renderBoxTable } from "../unifiedTheme.js";
import { scanProjectSourceFiles } from "./refactorFileScanner.js";
import { applyPlanFileWithWorktreeVerification } from "./worktreeSandbox.js";
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
function renderHarnessHelp(def) {
	console.log(renderBanner(def.bannerTitle, def.bannerSubtitle));
	const scriptAlias = def.toolName.replace(/^auditor-/, "auditor:");
	console.log(`
Uso directo (binario en node_modules/.bin):
  ${def.toolName} discover [--project <ruta>]
  ${def.toolName} inspect <archivo> [--project <ruta>]
  ${def.toolName} apply <plan.json> [--worktree] [--project <ruta>]
  ${def.toolName} help

Uso vía scripts npm de proyecto:
  npm run ${scriptAlias} discover
  npm run ${scriptAlias} inspect <archivo>
  npm run ${scriptAlias} apply <plan.json>
  npm run ${scriptAlias} help

💡 Consulta de Ayuda vía npm:
   Ejecuta siempre: npm run ${scriptAlias} help
   Evita usar '--help' con npm (ej: 'npm run ${scriptAlias} -- --help') porque el gestor
   npm intercepta el flag y muestra la ayuda genérica de npm en lugar de esta herramienta.

💡 Opciones con guiones (--file, --project, --worktree):
   Antepone '--' para pasarlas a través de npm:
   npm run ${scriptAlias} -- --project <ruta>
`);
}
function handleDiscoverCommand(def, projectRoot, engine) {
	console.log(styleText("cyan", `🔍 ${def.scanningMessage}: ${projectRoot}...\n`));
	const files = engine ? engine.getScannableFiles() : scanProjectSourceFiles(projectRoot);
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
}
function handleInspectCommand(def, projectRoot, targetFile) {
	if (!targetFile) {
		console.error(styleText("red", `❌ Debes especificar un archivo para inspeccionar. Ej: ${def.toolName} inspect src/components/Modal.vue o --file <ruta>`));
		process.exit(1);
	}
	const fullPath = path.isAbsolute(targetFile) ? path.normalize(targetFile) : path.resolve(projectRoot, targetFile);
	if (!fs.existsSync(fullPath)) {
		console.error(styleText("red", `❌ Archivo inexistente: ${fullPath}`));
		process.exit(1);
	}
	const findings = def.discoverInFile(fullPath);
	if (findings.length === 0) {
		console.log(styleText("green", `✨ El archivo ${targetFile} no presenta incidencias de ${def.toolDescription}.`));
		return;
	}
	console.log(styleText("cyan", `\n📦 Micro-Contexto Dirac para: ${targetFile} (${findings.length} ítems):\n`));
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
}
async function handleApplyCommand(def, projectRoot, planFile, worktree = false) {
	if (!planFile) {
		console.error(styleText("red", `❌ Debes especificar un archivo de plan para aplicar. Ej: ${def.toolName} apply plan.json o --plan <ruta>`));
		process.exit(1);
	}
	await applyPlanFileWithWorktreeVerification(projectRoot, planFile, worktree, async (targetDir, plan) => {
		const res = def.applyPlan(targetDir, plan);
		console.log(styleText("green", `✅ Plan aplicado con éxito: ${res.filesChanged} archivos modificados (${res.changesApplied} cambios).`));
	}, `${def.toolName} apply --plan <ruta-al-plan.json>`);
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
	if (args.values.help || command === "help" || command === "--help" || command === "-h") {
		renderHarnessHelp(def);
		return;
	}
	const projectRoot = path.resolve(args.values.project || ".");
	const engine = def.engineFactory?.(projectRoot);
	if (engine && !engine.isToolEnabled()) {
		console.log(styleText("yellow", `\n⚠️  El subsistema '${engine.toolId}' está desactivado en .auditor/audit.config.ts.\n`));
		return;
	}
	switch (command) {
		case "discover":
			handleDiscoverCommand(def, projectRoot, engine);
			break;
		case "inspect":
			handleInspectCommand(def, projectRoot, args.values.file || args.positionals[1]);
			break;
		case "apply":
			await handleApplyCommand(def, projectRoot, args.values.plan || args.positionals[1], Boolean(args.values.worktree));
			break;
		default:
			console.error(styleText("red", `❌ Comando desconocido: ${command}`));
			process.exit(1);
	}
}
//#endregion
export { formatCliRelativeFilePath, runRefactorCliHarness };
