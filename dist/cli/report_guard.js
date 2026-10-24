#!/usr/bin/env -S node --experimental-strip-types
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs, resolveHumanModeFromArgs } from "../core/cli/cittyHarness.js";
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { executeFallowJsonCommand, isHumanConsoleMode, isMainModule } from "./cliUtils.js";
import { resolveFallowBinary } from "../suites/architecture/validate_similar_code.js";
import { styleText } from "node:util";
// src/cli/report_guard.ts
/**
* src/cli/report_guard.ts
*
* CLI TOOL: PRE-VUELO ARQUITECTÓNICO (Fallow Guard)
*
* Inspects architecture boundaries, allowed import zones, forbidden calls,
* and policy rules for target files before editing or creating them.
*/
function formatGuardRules(forbidden, policies) {
	const parts = [];
	if (forbidden.length > 0) parts.push(`forbidden: ${forbidden.join(", ")}`);
	if (policies.length > 0) parts.push(`policies: ${policies.join(", ")}`);
	return parts.length > 0 ? parts.join(" | ") : styleText("dim", "none");
}
function formatAllowedZones(boundary) {
	if (boundary?.unrestricted) return styleText("green", "all (unrestricted)");
	const allowed = boundary?.allowed_zones ?? [];
	return allowed.length > 0 ? allowed.join(", ") : styleText("dim", "none");
}
function formatGuardTableRow(item) {
	const zoneStr = item.zone ? styleText("cyan", item.zone) : styleText("dim", "no zone");
	const allowedStr = formatAllowedZones(item.boundary);
	const rulesStr = formatGuardRules(item.boundary?.forbidden_calls ?? [], item.policy_rules ?? []);
	return {
		file: item.path,
		zone: zoneStr,
		allowed: allowedStr,
		rules: rulesStr
	};
}
function renderGuardResultsTable(fileResults, options = {}) {
	if (!isHumanConsoleMode(options)) {
		console.log(`[Guard] Architecture pre-flight for ${fileResults.length} file(s):`);
		for (const item of fileResults) {
			const allowed = formatAllowedZones(item.boundary);
			console.log(`• ${item.path} (zone: ${item.zone ?? "none"}): can import [${allowed}]`);
			for (const note of item.notes ?? []) console.log(`  [Notice] ${note}`);
		}
		console.log("");
		return;
	}
	const tableRows = fileResults.map(formatGuardTableRow);
	console.log(renderBoxTable([
		{
			header: "EVALUATED FILE",
			width: 34,
			align: "left",
			key: "file"
		},
		{
			header: "LAYER / ZONE",
			width: 14,
			align: "left",
			key: "zone"
		},
		{
			header: "CAN IMPORT",
			width: 24,
			align: "left",
			key: "allowed"
		},
		{
			header: "POLICIES & RESTRICTIONS",
			width: 28,
			align: "left",
			key: "rules"
		}
	], tableRows));
	for (const item of fileResults) for (const note of item.notes ?? []) console.log(styleText("dim", `  [Notice] ${item.path}: ${note}`));
	console.log();
}
function runGuardReport(projectRoot = process.cwd(), files = [], options = {}) {
	const fallowBin = resolveFallowBinary(projectRoot);
	if (!fallowBin) {
		console.error(styleText("red", "[Error] Fallow binary not found in node_modules."));
		return 1;
	}
	if (files.length === 0) {
		if (options.json) {
			console.log(JSON.stringify({
				error: "No files specified for architecture guard check",
				files: []
			}));
			return 1;
		}
		console.log("\n" + renderBanner("ARCHITECTURE PRE-FLIGHT (FALLOW GUARD)", "Boundaries, allowed zones and policies"));
		console.log(styleText("yellow", "  [Notice] Usage: auditor-guard <path/file1.ts> [path/file2.vue...] [--json]"));
		console.log(styleText("dim", "  Inspect which architectural rules and import limits apply before editing.\n"));
		return 0;
	}
	const { parsed, status, rawOutput } = executeFallowJsonCommand(fallowBin, [
		"guard",
		...files,
		"--format",
		"json"
	], projectRoot);
	if (options.json) {
		console.log(parsed ? JSON.stringify(parsed, null, 2) : JSON.stringify({
			error: "Fallow guard execution failed",
			raw: rawOutput
		}));
		return status;
	}
	if (isHumanConsoleMode(options)) console.log("\n" + renderBanner("ARCHITECTURE PRE-FLIGHT (FALLOW GUARD)", `Evaluated files: ${files.length}`));
	const fileResults = parsed?.files ?? [];
	if (fileResults.length === 0) {
		console.log("  " + styleText("yellow", "[Notice] No architectural rules data received for the indicated files.\n"));
		return status;
	}
	renderGuardResultsTable(fileResults, options);
	return status;
}
if (isMainModule(import.meta.url)) {
	const parsed = parseCittyArgs(COMMON_CLI_ARGS, getProcessCliArgs());
	const files = parsed._.map(String).filter(Boolean);
	const exitCode = runGuardReport(process.cwd(), files, {
		json: Boolean(parsed.json),
		human: resolveHumanModeFromArgs(parsed)
	});
	process.exit(exitCode);
}
export { runGuardReport };
