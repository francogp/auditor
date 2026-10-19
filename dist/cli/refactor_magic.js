#!/usr/bin/env -S node --experimental-strip-types
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { isMainModule } from "./cliUtils.js";
import { applyPlanFileWithWorktreeVerification } from "../core/refactor/worktreeSandbox.js";
import { MagicNumberExtractor } from "../core/refactor/magicNumberExtractor.js";
import { MagicNumberHarness } from "../core/refactor/magicNumberHarness.js";
import path from "node:path";
import { parseArgs, styleText } from "node:util";
//#region src/cli/refactor_magic.ts
/**
* src/cli/refactor_magic.ts
*
* CANONICAL MAGIC LITERAL & DESIGN TOKEN REFACTORING CLI (Node.js 26+ Native)
* Provides interactive discovery, Super-Dirac batch inspection, and safe worktree application.
*/
const MAX_DISPLAY_FILE_PATH_LENGTH = 42;
function handleDiscover(projectRoot, extractor) {
	console.log(styleText("cyan", `🔍 Escaneando archivos con números mágicos en: ${projectRoot}...\n`));
	const scannableFiles = MagicNumberExtractor.discoverScannableFiles(projectRoot);
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
		console.log(styleText("green", "✨ ¡Cero números mágicos detectados en el espacio de trabajo!\n"));
		return;
	}
	console.log(renderBoxTable([
		{
			key: "file",
			header: "Archivo",
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
			header: "Pendiente",
			width: 11,
			align: "right"
		}
	], tableRows));
	console.log(styleText("yellow", `\nTotal: ${totalFound} literales mágicos detectados en ${tableRows.length} archivo(s).`));
	console.log(styleText("cyan", "\n💡 Para generar el paquete Super-Dirac de un archivo:\n   npm run auditor:magic inspect <archivo>\n"));
}
function handleInspect(projectRoot, extractor, targetFile) {
	if (!targetFile) {
		console.error(styleText("red", "❌ Error: Debes especificar el archivo a inspeccionar: auditor:magic inspect <archivo>"));
		process.exit(1);
	}
	const items = extractor.scanFile(projectRoot, targetFile);
	if (items.length === 0) {
		console.log(styleText("green", `✨ No se detectaron números mágicos en: ${targetFile}`));
		return;
	}
	const packet = extractor.generateSuperDiracPacket(projectRoot, targetFile, items);
	console.log(styleText("cyan", `📦 Paquete Super-Dirac para: ${targetFile}`));
	console.log(styleText("gray", `• Total: ${packet.totalItems} | 0-Token: ${packet.zeroTokenCount} | Pendientes: ${packet.pendingAmbiguousCount}`));
	console.log(styleText("green", `• Ahorro de Tokens: ${packet.fullFileTokensBaseline} -> ${packet.superDiracBatchTokens} (${packet.tokenSavingsPercent}% ahorro)\n`));
	console.log(JSON.stringify(packet, null, 2));
	const suggestedPlan = extractor.createRefactorPlan(`magic-plan-${Date.now()}`, targetFile, items);
	console.log(styleText("yellow", "\n📄 Plan declarativo sugerido listo para aplicar (--plan):\n"));
	console.log(JSON.stringify(suggestedPlan, null, 2));
	console.log(styleText("cyan", "\n💡 Para aplicar este plan automáticamente:\n   1. Guarda el JSON del plan en un archivo (ej: scratch/magic_plan.json)\n   2. Ejecuta: npm run auditor:magic apply scratch/magic_plan.json --worktree\n"));
}
async function handleApply(projectRoot, rawPlanPath, useWorktree) {
	await applyPlanFileWithWorktreeVerification(projectRoot, rawPlanPath, useWorktree, (dir, plan) => MagicNumberHarness.execute(dir, plan), "auditor:magic apply <plan.json>");
	console.log(styleText("green", "\n🎉 ¡Refactorización de números mágicos aplicada exitosamente!"));
}
async function runRefactorMagicCli(cliArgs = process.argv.slice(2)) {
	const { values, positionals } = parseArgs({
		args: cliArgs,
		options: {
			project: {
				type: "string",
				default: process.cwd()
			},
			plan: { type: "string" },
			worktree: {
				type: "boolean",
				default: false
			},
			help: {
				type: "boolean",
				short: "h",
				default: false
			}
		},
		allowPositionals: true
	});
	const command = positionals[0] || "discover";
	const targetArg = positionals[1];
	const projectRoot = path.resolve(values.project || process.cwd());
	if (values.help || command === "help") {
		renderBanner("auditor-magic", "Gobernanza y Refactorización Determinista de Números Mágicos");
		console.log(`
Uso:
  npm run auditor:magic [comando] [opciones]

Comandos:
  discover                  Escanea el proyecto y lista archivos con números mágicos o tokens
  inspect <file>            Extrae el paquete tabular Super-Dirac para un archivo específico
  apply <plan.json>         Aplica un plan de refactorización (soporta --worktree)

Opciones:
  --project <path>          Ruta al proyecto anfitrión (por defecto: cwd)
  --plan <path>             Ruta al archivo MagicRefactorPlan JSON
  --worktree                Ejecuta la mutación y verificación en un Git Worktree efímero
  -h, --help                Muestra este manual de ayuda
`);
		return;
	}
	renderBanner("auditor-magic", "Gobernanza y Refactorización Determinista de Números Mágicos");
	const extractor = new MagicNumberExtractor();
	extractor.indexProjectConstants(projectRoot);
	switch (command) {
		case "discover":
			handleDiscover(projectRoot, extractor);
			break;
		case "inspect":
			handleInspect(projectRoot, extractor, targetArg);
			break;
		case "apply":
			await handleApply(projectRoot, targetArg || (typeof values.plan === "string" ? values.plan : void 0), Boolean(values.worktree));
			break;
		default:
			console.error(styleText("red", `❌ Comando desconocido: ${command}`));
			process.exit(1);
	}
}
if (isMainModule(import.meta.url, ["auditor-magic", "refactor_magic"])) runRefactorMagicCli().catch((err) => {
	console.error("\n❌ Error fatal en auditor-magic:", err);
	process.exit(1);
});
//#endregion
export { runRefactorMagicCli };
