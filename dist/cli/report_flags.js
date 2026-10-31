#!/usr/bin/env -S node --experimental-strip-types
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs, resolveHumanModeFromArgs } from "../core/cli/cittyHarness.js";
import { executeFallowJsonCommand, isHumanConsoleMode, isMainModule } from "./cliUtils.js";
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { resolveFallowBinary } from "../suites/architecture/validate_similar_code.js";
import { styleText } from "node:util";
// src/cli/report_flags.ts
/**
* src/cli/report_flags.ts
*
* CLI TOOL: FEATURE FLAGS GOVERNANCE (Fallow Flags)
*
* Analyzes feature flag usage patterns, branches, single-read sites,
* and identifies retirement candidates.
*/
const RADIX_DECIMAL = 10;
const DEFAULT_TOP_LIMIT = 20;
function formatRetirementReason(reason) {
	switch (reason) {
		case "single-read-site": return "Single read site";
		case "empty-branch": return "Empty branch";
		case "literal-constant": return "Literal constant";
		case "defined-never-read": return "Defined but never read";
		case "identical-branches": return "Identical branches";
		case "guards-dead-code": return "Guards dead code";
		case "fully-rolled-out": return "Fully rolled out";
		default: return reason;
	}
}
function renderRetirementFlagsView(parsed, topLimit = DEFAULT_TOP_LIMIT, options = {}) {
	const candidates = parsed?.retirement?.flags ?? [];
	const displayed = candidates.slice(0, topLimit);
	if (displayed.length === 0) {
		console.log("\n  " + styleText(["bold", "green"], "[OK] No feature flags candidate for retirement detected.\n"));
		return;
	}
	if (!isHumanConsoleMode(options)) {
		console.log(`[Flags] Found ${candidates.length} candidate(s) for retirement:`);
		for (const item of displayed) {
			const reasonsList = (item.reasons ?? []).map(formatRetirementReason);
			const reasonsStr = reasonsList.length > 0 ? reasonsList.join(", ") : "none";
			console.log(`• ${item.name} (${item.age_days !== void 0 ? `${item.age_days}d` : "n/a"}, ${item.read_sites ?? 0} sites): ${reasonsStr}`);
		}
		console.log("");
		return;
	}
	console.log(`  Candidates for retirement: ${styleText("yellow", String(candidates.length))}\n`);
	const tableRows = displayed.map((item) => {
		const ageStr = item.age_days !== void 0 ? `${item.age_days}d` : styleText("dim", "n/a");
		const sitesStr = item.read_sites !== void 0 ? String(item.read_sites) : styleText("dim", "0");
		const reasonsList = (item.reasons ?? []).map(formatRetirementReason);
		const reasonsStr = reasonsList.length > 0 ? reasonsList.join(", ") : styleText("dim", "none");
		return {
			name: styleText("cyan", item.name),
			age: ageStr,
			sites: sitesStr,
			reasons: reasonsStr
		};
	});
	console.log(renderBoxTable([
		{
			header: "FEATURE FLAG",
			width: 30,
			align: "left",
			key: "name"
		},
		{
			header: "AGE",
			width: 8,
			align: "right",
			key: "age"
		},
		{
			header: "READ SITES",
			width: 10,
			align: "right",
			key: "sites"
		},
		{
			header: "RECOMMENDED RETIREMENT REASON",
			width: 44,
			align: "left",
			key: "reasons"
		}
	], tableRows));
	console.log();
}
function renderActiveFlagsView(parsed, topLimit = DEFAULT_TOP_LIMIT, options = {}) {
	const flags = parsed?.feature_flags ?? [];
	if (flags.length === 0) {
		console.log("\n  " + styleText("dim", "[Notice] No feature flags configured in this project.\n"));
		return;
	}
	if (!isHumanConsoleMode(options)) {
		console.log(`[Flags] ${flags.length} active feature flag(s):`);
		for (const f of flags.slice(0, topLimit)) console.log(`• ${f.name ?? "unknown"}: ${f.read_sites ?? 0} read sites`);
		console.log("");
		return;
	}
	const tableRows = flags.slice(0, topLimit).map((f) => ({
		name: styleText("cyan", f.name ?? "unknown"),
		sites: String(f.read_sites ?? 0)
	}));
	console.log("\n" + renderBoxTable([{
		header: "FEATURE FLAG",
		width: 40,
		align: "left",
		key: "name"
	}, {
		header: "READ SITES",
		width: 20,
		align: "right",
		key: "sites"
	}], tableRows));
	console.log(styleText("dim", "  [Notice] Run auditor-flags --retirement to see retirement recommendations.\n"));
}
function runFlagsReport(projectRoot = process.cwd(), options = {}) {
	const fallowBin = resolveFallowBinary(projectRoot);
	if (!fallowBin) {
		console.error(styleText("red", "[Error] Fallow binary not found in node_modules."));
		return 1;
	}
	const runArgs = [
		"flags",
		"--format",
		"json"
	];
	if (options.retirement) runArgs.push("--retirement");
	const { parsed, status, rawOutput } = executeFallowJsonCommand(fallowBin, runArgs, projectRoot);
	if (options.json) {
		console.log(parsed ? JSON.stringify(parsed, null, 2) : JSON.stringify({
			error: "Fallow flags execution failed",
			raw: rawOutput
		}));
		return status;
	}
	const isRetirement = Boolean(options.retirement);
	if (isHumanConsoleMode(options)) {
		console.log("\n" + renderBanner("FEATURE FLAGS GOVERNANCE (FALLOW FLAGS)", isRetirement ? "Retirement analysis for stale or redundant flags" : "Feature flag detection and usage"));
		const totalFlags = parsed?.total_flags ?? parsed?.feature_flags?.length ?? 0;
		console.log(`  Total feature flags detected: ${styleText("bold", String(totalFlags))}\n`);
	}
	if (isRetirement) renderRetirementFlagsView(parsed, options.top, options);
	else renderActiveFlagsView(parsed, options.top, options);
	return status;
}
const FLAGS_CLI_ARGS = {
	...COMMON_CLI_ARGS,
	retirement: {
		type: "boolean",
		default: false,
		description: "Show retirement candidates"
	},
	top: {
		type: "string",
		default: "20",
		description: "Maximum flags to display"
	}
};
if (isMainModule(import.meta.url)) {
	const parsed = parseCittyArgs(FLAGS_CLI_ARGS, getProcessCliArgs());
	const rawTop = String(parsed.top || "20");
	const top = rawTop === "all" ? Number.MAX_SAFE_INTEGER : parseInt(rawTop, RADIX_DECIMAL) || DEFAULT_TOP_LIMIT;
	const exitCode = runFlagsReport(process.cwd(), {
		retirement: Boolean(parsed.retirement),
		top,
		json: Boolean(parsed.json),
		human: resolveHumanModeFromArgs(parsed)
	});
	process.exit(exitCode);
}
export { runFlagsReport };
