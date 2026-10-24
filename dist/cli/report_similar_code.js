#!/usr/bin/env -S node --experimental-strip-types
import { getAuditConfig } from "../core/auditConfigLoader.js";
import { toPosixRelative } from "../core/safePath.js";
import "../core/auditConfig.js";
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs, resolveHumanModeFromArgs } from "../core/cli/cittyHarness.js";
import { renderBanner, renderBoxTable, renderSimilarCodeWarningBanner } from "../core/unifiedTheme.js";
import { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES, bootstrapCliProject, isMainModule } from "./cliUtils.js";
import { checkOrInitializeModel, resolveFallowBinary } from "../suites/architecture/validate_similar_code.js";
import path from "node:path";
import { styleText } from "node:util";
import { execSync } from "node:child_process";
// src/cli/report_similar_code.ts
/**
* packages/auditor/src/cli/report_similar_code.ts
*
* CLI TOOL: SEMANTIC SIMILARITY REPORT (Fallow Similar-Code)
*
* Generates an 80-column Box-Drawing report of semantically similar functions
* detected via local vector embeddings.
*/
const MAX_FUNCTION_NAME_COL_WIDTH = 16;
const MAX_LOCATION_COL_WIDTH = 20;
function runSimilarCodeReport(projectRoot = process.cwd()) {
	const fallowCfg = getAuditConfig(projectRoot).fallow?.similarCode;
	const SIMILAR_CODE_ARGS = {
		...COMMON_CLI_ARGS,
		threshold: {
			type: "string",
			default: String(fallowCfg?.threshold ?? .95),
			description: "Similarity threshold (0.0 to 1.0)"
		},
		"min-lines": {
			type: "string",
			default: String(fallowCfg?.minLines ?? 3),
			description: "Minimum function lines to evaluate"
		},
		"include-same-file": {
			type: "boolean",
			default: false,
			description: "Include candidate pairs within the same file"
		}
	};
	const parsed = parseCittyArgs(SIMILAR_CODE_ARGS, getProcessCliArgs());
	const threshold = parseFloat(String(parsed.threshold || String(.95)));
	const minLines = parseInt(String(parsed["min-lines"] || "3"), 10);
	const ignoreSameFile = !parsed["include-same-file"];
	const isJson = Boolean(parsed.json);
	const fallowBin = resolveFallowBinary(projectRoot);
	if (!fallowBin) {
		console.error(styleText("red", "[Error] Fallow binary not found in node_modules."));
		process.exit(1);
	}
	if (!checkOrInitializeModel(fallowBin, projectRoot)) {
		console.error("\n" + renderSimilarCodeWarningBanner() + "\n");
		process.exit(1);
	}
	const isHuman = resolveHumanModeFromArgs(parsed);
	if (!isJson && isHuman) {
		console.log(renderBanner("SEMANTIC SIMILARITY REPORT (FALLOW SIMILAR-CODE)", "Vector function embeddings"));
		console.log(styleText("dim", `[Scan] Analyzing similarity (Threshold: ${(threshold * 100).toFixed(0)}%, Min-Lines: ${minLines}, Exclude same file: ${ignoreSameFile ? "Yes" : "No"})...\n`));
	}
	let candidates = [];
	try {
		const cmd = `node "${fallowBin}" similar-code --format json --threshold ${threshold} --min-lines ${minLines}`;
		const stdout = execSync(cmd, {
			cwd: projectRoot,
			encoding: "utf8",
			stdio: [
				"pipe",
				"pipe",
				"ignore"
			],
			maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
		});
		const jsonStart = stdout.indexOf("{");
		if (jsonStart !== -1) candidates = JSON.parse(stdout.substring(jsonStart)).candidates ?? [];
	} catch (err) {
		console.error(styleText("red", `[Error] Failed to execute fallow similar-code: ${err.message}`));
		process.exit(1);
	}
	if (ignoreSameFile) candidates = candidates.filter((c) => {
		return toPosixRelative(process.cwd(), c.left?.path || "") !== toPosixRelative(process.cwd(), c.right?.path || "");
	});
	if (isJson) {
		console.log(JSON.stringify(candidates, null, 2));
		return;
	}
	if (candidates.length === 0) {
		console.log(styleText("green", `[OK] No semantic code duplicates detected with threshold >= ${(threshold * 100).toFixed(0)}%.\n`));
		return;
	}
	if (!isHuman) {
		console.log(`[SimilarCode] Found ${candidates.length} semantic clone pair(s) (threshold: ${(threshold * 100).toFixed(0)}%):`);
		for (const [idx, c] of candidates.entries()) {
			const leftFile = path.basename(c.left.path);
			const rightFile = path.basename(c.right.path);
			console.log(`• Pair ${idx + 1} (${(c.similarity * 100).toFixed(1)}%): ${c.left.name} (${leftFile}:${c.left.start_line}) ~ ${c.right.name} (${rightFile}:${c.right.start_line})`);
		}
		console.log("");
		return;
	}
	console.log(`CANDIDATES DETECTED (${candidates.length} pairs):\n`);
	const cols = [
		{
			header: "#",
			width: 2,
			align: "center",
			key: "index"
		},
		{
			header: "SIMIL.",
			width: 7,
			align: "right",
			key: "similarity"
		},
		{
			header: "FUNCTION A",
			width: 16,
			align: "left",
			key: "funcA"
		},
		{
			header: "FUNCTION B",
			width: 16,
			align: "left",
			key: "funcB"
		},
		{
			header: "FILE LOCATIONS",
			width: 20,
			align: "left",
			key: "location"
		}
	];
	const rows = candidates.map((c, idx) => {
		const pct = `${(c.similarity * 100).toFixed(1)}%`;
		const simFormatted = c.similarity >= .95 ? styleText("red", pct) : styleText("yellow", pct);
		const leftFile = path.basename(c.left.path);
		const rightFile = path.basename(c.right.path);
		const loc = `${leftFile}:${c.left.start_line} ~ ${rightFile}:${c.right.start_line}`;
		return {
			index: String(idx + 1),
			similarity: simFormatted,
			funcA: c.left.name.length > MAX_FUNCTION_NAME_COL_WIDTH ? c.left.name.slice(0, 15) + "…" : c.left.name,
			funcB: c.right.name.length > MAX_FUNCTION_NAME_COL_WIDTH ? c.right.name.slice(0, 15) + "…" : c.right.name,
			location: loc.length > MAX_LOCATION_COL_WIDTH ? loc.slice(0, 19) + "…" : loc
		};
	});
	console.log(renderBoxTable(cols, rows));
	console.log(`\n[Notice] Total semantic pairs detected: ${candidates.length}\n`);
}
if (isMainModule(import.meta.url)) {
	bootstrapCliProject();
	runSimilarCodeReport();
}
export { runSimilarCodeReport };
