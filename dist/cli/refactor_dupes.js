#!/usr/bin/env -S node --experimental-strip-types
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { isMainModule } from "./cliUtils.js";
import { HybridHarnessEngine } from "../core/refactor/hybridHarness.js";
import { DupesRefactorEngine, runFallowJson } from "../core/refactor/dupesRefactorEngine.js";
import { MicroContextExtractor } from "../core/refactor/microContextExtractor.js";
import { applyPlanFileWithWorktreeVerification } from "../core/refactor/worktreeSandbox.js";
import path from "node:path";
import { parseArgs, styleText } from "node:util";
//#region src/cli/refactor_dupes.ts
/**
* src/cli/refactor_dupes.ts
*
* CANONICAL REFACTORING & DUPLICATION REMEDIATION CLI (Node.js 26+ Native)
* Provides interactive discovery, micro-context inspection, and AST refactor application.
*/
function triageCandidates(projectRoot, minOccurrences) {
	const engine = new DupesRefactorEngine({ projectRoot });
	return Array.from(engine.triageCandidates(minOccurrences));
}
const MAX_COMPACT_CLONES = 15;
function handleDiscover(projectRoot, candidates, isJson, isVerbose = false) {
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
	console.log("\n" + renderBanner("REFACTORIZACIÓN DETERMINISTA: TRIAJE DE CLONES", `Directorio: ${path.basename(projectRoot)} | Total: ${candidates.length} grupos`));
	const cols = [
		{
			header: "#",
			width: 3,
			align: "center",
			key: "index"
		},
		{
			header: "HUELLA",
			width: 12,
			align: "center",
			key: "fingerprint"
		},
		{
			header: "TOPOLOGÍA",
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
			header: "ESTADO",
			width: 12,
			align: "center",
			key: "status"
		},
		{
			header: "ARCHIVOS AFECTADOS",
			width: 22,
			align: "left",
			key: "files"
		}
	];
	const rows = candidates.slice(0, 20).map((c, i) => {
		const statusLabel = c.isDeadCodeTarget ? styleText("red", "MUERTO 💀") : styleText("green", "ACTIVO ⚡");
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
	console.log(styleText("cyan", "\n💡 Para inspeccionar un clon y obtener su micro-contexto Dirac:\n   npm run auditor:dupes inspect <fingerprint>\n"));
}
function handleInspect(projectRoot, fp, isJson) {
	if (!fp) {
		console.error(styleText("red", "❌ Error: Debes especificar el fingerprint: auditor:dupes inspect <fingerprint>"));
		process.exit(1);
	}
	const group = runFallowJson("dupes", [], projectRoot).clone_groups.find((g) => g.fingerprint === fp || g.fingerprint === `dup:${fp}`);
	if (!group) {
		console.error(styleText("red", `❌ Error: No se encontró el grupo de clones con huella "${fp}".`));
		process.exit(1);
	}
	const packet = new MicroContextExtractor().extract(projectRoot, group);
	if (isJson) {
		console.log(JSON.stringify(packet, null, 2));
		return;
	}
	console.log("\n" + renderBanner("MICRO-CONTEXTO DIRAC ANCLADO POR HASH", `Huella: ${packet.fingerprint} | Instancias: ${packet.instances.length}`));
	console.log(`  📊 Reducción de Contexto: ${packet.traditionalTokensEstimate.toLocaleString()} tokens → ${packet.microContextTokensEstimate.toLocaleString()} tokens (${styleText("green", packet.tokenSavingsPercent + "% de ahorro")})`);
	console.log(`  📥 Parámetros Inferidos:  ${packet.candidateParameters.join(", ") || "ninguno"}`);
	console.log(`  📤 Retornos Inferidos:    ${packet.candidateReturns.join(", ") || "ninguno"}\n`);
	for (const [idx, inst] of packet.instances.entries()) {
		console.log(styleText("bold", `  Instancia #${idx + 1}: ${inst.file} (Líneas ${inst.startLine}-${inst.endLine}) [sha256: ${inst.sha256.slice(0, 8)}...]`));
		console.log(inst.contextSnippet.split("\n").map((l) => `    │ ${l}`).join("\n") + "\n");
	}
	console.log(styleText("cyan", "💡 Diseña el RefactorPlan JSON y aplícalo con:\n   npm run auditor:dupes apply --plan <plan.json> --worktree\n"));
}
async function handleApply(projectRoot, rawPlanPath, useWorktree) {
	await applyPlanFileWithWorktreeVerification(projectRoot, rawPlanPath, useWorktree, (dir, plan) => HybridHarnessEngine.execute(dir, plan), "auditor:dupes apply <plan.json>");
	console.log(styleText("green", "✅ Refactorización aplicada exitosamente en el repositorio."));
}
async function runRefactorCli() {
	const args = process.argv.slice(2);
	let subCommand = "discover";
	let targetArg;
	if (args[0] && !args[0].startsWith("-")) {
		subCommand = args[0];
		if (args[1] && !args[1].startsWith("-")) targetArg = args[1];
	}
	const { values } = parseArgs({
		args,
		options: {
			project: {
				type: "string",
				default: "."
			},
			"min-occurrences": {
				type: "string",
				default: "2"
			},
			plan: { type: "string" },
			fingerprint: { type: "string" },
			worktree: {
				type: "boolean",
				default: false
			},
			json: {
				type: "boolean",
				default: false
			},
			verbose: {
				type: "boolean",
				default: false
			}
		},
		strict: false,
		allowPositionals: true
	});
	const projectRoot = path.resolve(String(values.project || "."));
	const isJson = Boolean(values.json);
	const isVerbose = values.verbose === true || args.includes("--verbose") || args.includes("verbose") || args.includes("format=verbose");
	switch (subCommand) {
		case "discover":
			handleDiscover(projectRoot, triageCandidates(projectRoot, parseInt(String(values["min-occurrences"] || "2"), 10)), isJson, isVerbose);
			break;
		case "inspect":
			handleInspect(projectRoot, targetArg || (typeof values.fingerprint === "string" ? values.fingerprint : void 0), isJson);
			break;
		case "apply":
			await handleApply(projectRoot, targetArg || (typeof values.plan === "string" ? values.plan : void 0), Boolean(values.worktree));
			break;
		default: console.log("Comandos disponibles: discover, inspect, apply");
	}
}
if (isMainModule(import.meta.url, ["auditor-dupes", "refactor_dupes"])) runRefactorCli().catch((err) => {
	console.error(err);
	process.exit(1);
});
//#endregion
export { runRefactorCli };
