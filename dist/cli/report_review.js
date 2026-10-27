#!/usr/bin/env -S node --experimental-strip-types
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs, resolveHumanModeFromArgs } from "../core/cli/cittyHarness.js";
import { renderBanner } from "../core/unifiedTheme.js";
import { isMainModule } from "./cliUtils.js";
import { resolveFallowBinary } from "../suites/architecture/validate_similar_code.js";
import { styleText } from "node:util";
import { spawnSync } from "node:child_process";
// src/cli/report_review.ts
/**
* packages/auditor/src/cli/report_review.ts
*
* CLI TOOL: CHANGE REVIEW AND PR RISK (Fallow Review)
*
* Runs graph-grounded change review via fallow review, displaying structural
* decisions, blast radius, public API changes, and code risk.
*/
const REVIEW_CLI_ARGS = {
	...COMMON_CLI_ARGS,
	base: {
		type: "string",
		description: "Git base branch or ref for review"
	},
	"changed-since": {
		type: "string",
		description: "Git ref to review changes since"
	},
	ref: {
		type: "positional",
		required: false,
		description: "Git ref to review changes since"
	}
};
function runReviewReport(projectRoot = process.cwd()) {
	const parsed = parseCittyArgs(REVIEW_CLI_ARGS, getProcessCliArgs());
	const fallowBin = resolveFallowBinary(projectRoot);
	if (!fallowBin) {
		console.error(styleText("red", "[Error] Fallow binary not found in node_modules."));
		process.exit(1);
	}
	const isJson = Boolean(parsed.json);
	const args = ["review"];
	const targetRef = parsed.ref ?? parsed["changed-since"];
	if (parsed.base) args.push("--base", String(parsed.base));
	else if (targetRef) args.push("--changed-since", targetRef);
	if (isJson) args.push("--format", "json");
	const isHuman = resolveHumanModeFromArgs(parsed);
	if (!isJson && isHuman) console.log(renderBanner("CHANGE REVIEW (FALLOW REVIEW)", "Structural decisions and blast radius"));
	const result = spawnSync("node", [fallowBin, ...args], {
		cwd: projectRoot,
		stdio: "inherit"
	});
	if (result.status !== null && result.status !== 0) process.exit(result.status);
}
if (isMainModule(import.meta.url)) runReviewReport();
export { runReviewReport };
