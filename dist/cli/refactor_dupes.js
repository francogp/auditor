#!/usr/bin/env -S node --experimental-strip-types
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { applyPlanFileWithWorktreeVerification } from "../core/refactor/worktreeSandbox.js";
import { resolveFallowBinary } from "../suites/architecture/validate_similar_code.js";
import { MicroContextExtractor } from "../core/refactor/microContextExtractor.js";
import { HybridHarnessEngine } from "../core/refactor/hybridHarness.js";
import path from "node:path";
import { parseArgs, styleText } from "node:util";
import { execSync } from "node:child_process";
//#region src/cli/refactor_dupes.ts
/**
* src/cli/refactor_dupes.ts
*
* CANONICAL REFACTORING & DUPLICATION REMEDIATION CLI (Node.js 26+ Native)
* Provides interactive discovery, micro-context inspection, and AST refactor application.
*/
function runFallowJson(cmd, args, projectRoot) {
	const fullCmd = `node "${resolveFallowBinary(projectRoot) ?? path.resolve(process.cwd(), "node_modules/fallow/bin/fallow")}" ${cmd} --root "${projectRoot}" ${args.join(" ")} --format json --quiet`;
	try {
		const stdout = execSync(fullCmd, {
			encoding: "utf8",
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			],
			maxBuffer: 52428800
		});
		return JSON.parse(stdout);
	} catch (err) {
		const out = err.stdout;
		if (out && out.trim().startsWith("{")) return JSON.parse(out);
		throw new Error(`Failed to execute fallow ${cmd}: ${err.message}`);
	}
}
function determineTopology(files) {
	const isSingle = files.length === 1;
	const hasVue = files.some((f) => f.endsWith(".vue"));
	if (isSingle) return hasVue ? "intra-file-vue" : "intra-file-ts";
	return hasVue ? "cross-file-vue-ts" : "cross-file-ts";
}
function triageCandidates(projectRoot, minOccurrences) {
	const dupes = runFallowJson("dupes", ["--min-occurrences", String(minOccurrences)], projectRoot);
	let deadFiles = /* @__PURE__ */ new Set();
	try {
		const dead = runFallowJson("dead-code", ["--include-dupes"], projectRoot);
		deadFiles = new Set(dead.unused_files.map((f) => path.normalize(f.path).replace(/\\/g, "/")));
	} catch {}
	return dupes.clone_groups.map((g) => {
		const files = Array.from(new Set(g.instances.map((i) => i.file.replace(/\\/g, "/"))));
		const topology = determineTopology(files);
		const isDead = files.some((f) => deadFiles.has(path.normalize(f).replace(/\\/g, "/")));
		return {
			fingerprint: g.fingerprint,
			topology,
			tokenCount: g.token_count,
			lineCount: g.line_count,
			occurrenceCount: g.instances.length,
			spread: g.spread ?? 0,
			files,
			instances: g.instances,
			suggestedName: g.suggested_name,
			isDeadCodeTarget: isDead
		};
	}).sort((a, b) => {
		const scoreA = a.tokenCount * a.occurrenceCount * (1 + .15 * a.spread);
		return b.tokenCount * b.occurrenceCount * (1 + .15 * b.spread) - scoreA;
	});
}
function handleDiscover(projectRoot, candidates, isJson) {
	if (isJson) {
		console.log(JSON.stringify(candidates, null, 2));
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
			}
		},
		strict: false,
		allowPositionals: true
	});
	const projectRoot = path.resolve(String(values.project || "."));
	const isJson = Boolean(values.json);
	switch (subCommand) {
		case "discover":
			handleDiscover(projectRoot, triageCandidates(projectRoot, parseInt(String(values["min-occurrences"] || "2"), 10)), isJson);
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
if (process.argv[1] && process.argv[1].endsWith("refactor_dupes.ts")) runRefactorCli().catch((err) => {
	console.error(err);
	process.exit(1);
});
//#endregion
export { runRefactorCli };
