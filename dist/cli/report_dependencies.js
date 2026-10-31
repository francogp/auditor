#!/usr/bin/env -S node --experimental-strip-types
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs, resolveHumanModeFromArgs } from "../core/cli/cittyHarness.js";
import { bootstrapCliProject, isHumanConsoleMode, isMainModule } from "./cliUtils.js";
import { buildNoticeBox, renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { evaluateProjectDependencies } from "../core/auditorMinimums.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import { styleText } from "node:util";
// src/cli/report_dependencies.ts
/**
* src/cli/report_dependencies.ts
*
* STANDALONE AUDITOR DEPENDENCY MINIMUMS CLI REPORTER (Node.js 26+ Native)
*
* Inspects, evaluates, and reports the status of mandatory minimum library versions
* governed by @francogp/auditor against the target host project's package.json
* and package-lock.json. Operates hermetically without loading auditor suites
* or executing host extensions.
*/
enableCompileCache();
const DEPENDENCIES_CLI_ARGS = {
	...COMMON_CLI_ARGS,
	commands: {
		type: "boolean",
		alias: "c",
		description: "Print upgrade install commands only"
	},
	"install-cmd": {
		type: "boolean",
		description: "Print upgrade install commands only"
	},
	all: {
		type: "boolean",
		alias: "a",
		description: "Include undeclared governed libraries"
	},
	"no-fail": {
		type: "boolean",
		description: "Exit with code 0 even if dependencies are outdated"
	}
};
function parseCliArgs(rawArgs = getProcessCliArgs()) {
	const parsed = parseCittyArgs(DEPENDENCIES_CLI_ARGS, rawArgs);
	return {
		project: typeof parsed.project === "string" && parsed.project !== "." ? parsed.project : void 0,
		json: Boolean(parsed.json),
		commandsOnly: Boolean(parsed.commands || parsed["install-cmd"]),
		all: Boolean(parsed.all),
		noFail: Boolean(parsed["no-fail"]),
		human: resolveHumanModeFromArgs(parsed)
	};
}
function formatStatusCell(item) {
	switch (item.status) {
		case "satisfied": return styleText("green", "[OK] Satisfied");
		case "outdated_range": return styleText("red", "[FAIL] Range low");
		case "outdated_installed": return styleText("yellow", "[WARN] Lockfile low");
		case "undeclared": return styleText("dim", "[-] Undeclared");
		case "exceeds_max_range": return styleText("red", "[FAIL] Exceeds ceiling");
		case "exceeds_max_installed": return styleText("red", "[FAIL] Lockfile high");
	}
}
function formatDeclaredCell(item) {
	if (!item.declaredRange) return styleText("dim", "---");
	if (item.status === "outdated_range" || item.status === "exceeds_max_range") return styleText("red", item.declaredRange);
	return styleText("cyan", item.declaredRange);
}
function formatInstalledCell(item) {
	if (!item.installedVersion) return styleText("dim", "---");
	if (item.status === "outdated_installed") return styleText("yellow", item.installedVersion);
	if (item.status === "exceeds_max_installed") return styleText("red", item.installedVersion);
	return styleText("white", item.installedVersion);
}
function renderDependenciesCompact(report, itemsToDisplay, options) {
	console.log(`[Dependencies] Governed: ${report.totalGoverned} | Declared: ${report.declaredCount} | Satisfied: ${report.satisfiedCount} | Outdated: ${report.outdatedCount}`);
	if (report.outdatedCount > 0) {
		for (const item of itemsToDisplay.filter((i) => i.status !== "satisfied" && i.status !== "undeclared")) console.log(`• ${item.name}: declared ${item.declaredRange ?? "none"}, installed ${item.installedVersion ?? "none"}, required >= ${item.requiredFloor} (${item.status})`);
		if (report.prodInstallCommand) console.log(`[Upgrade] ${report.prodInstallCommand}`);
		if (report.devInstallCommand) console.log(`[Upgrade] ${report.devInstallCommand}`);
	} else console.log("[OK] All declared dependencies meet minimum required versions.");
	if (!options.all && report.undeclaredCount > 0) console.log(`[Notice] ${report.undeclaredCount} governed libraries are not declared by this host (pass "--all" to view).`);
}
function runDependenciesReport(projectRoot = process.cwd(), options = {
	json: false,
	commandsOnly: false,
	all: false,
	noFail: false
}) {
	const report = evaluateProjectDependencies(projectRoot);
	if (options.json) {
		console.log(JSON.stringify(report, null, 2));
		return report;
	}
	if (options.commandsOnly) {
		if (report.prodInstallCommand) console.log(report.prodInstallCommand);
		if (report.devInstallCommand) console.log(report.devInstallCommand);
		if (!report.prodInstallCommand && !report.devInstallCommand) console.log("# All declared dependencies satisfy the auditor minimum baselines.");
		return report;
	}
	const rawItems = options.all ? report.evaluated : report.evaluated.filter((e) => e.status !== "undeclared");
	const statusOrder = {
		outdated_range: 0,
		outdated_installed: 1,
		satisfied: 2,
		undeclared: 3
	};
	const itemsToDisplay = [...rawItems].sort((a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99) || a.name.localeCompare(b.name));
	if (!isHumanConsoleMode(options)) {
		renderDependenciesCompact(report, itemsToDisplay, options);
		return report;
	}
	const bannerSubtitle = `Project: ${path.basename(report.projectRoot)} | Governed: ${report.totalGoverned} | Declared: ${report.declaredCount}`;
	console.log("\n" + renderBanner("MINIMUM REQUIRED DEPENDENCIES (@francogp/auditor)", bannerSubtitle));
	console.log("\n" + renderBoxTable([
		{
			header: "LIBRARY",
			width: 22,
			render: (row) => row.status === "satisfied" ? styleText("green", row.name) : row.status === "undeclared" ? styleText("dim", row.name) : styleText("bold", row.name)
		},
		{
			header: "MIN REQUIRED",
			width: 14,
			align: "center",
			render: (row) => styleText("yellow", row.requiredFloor)
		},
		{
			header: "DECLARED",
			width: 14,
			align: "center",
			render: formatDeclaredCell
		},
		{
			header: "INSTALLED",
			width: 14,
			align: "center",
			render: formatInstalledCell
		},
		{
			header: "STATUS",
			width: 18,
			align: "center",
			render: formatStatusCell
		}
	], itemsToDisplay, { emptyMessage: "No declared dependencies found in project." }) + "\n");
	const summaryLine = [
		`Total governed: ${styleText("bold", String(report.totalGoverned))}`,
		`Declared in host: ${styleText("bold", String(report.declaredCount))}`,
		`Satisfied: ${styleText("green", String(report.satisfiedCount))}`,
		`Requires update: ${report.outdatedCount > 0 ? styleText("red", String(report.outdatedCount)) : styleText("green", "0")}`
	].join(" | ");
	console.log(`  ${summaryLine}\n`);
	if (report.outdatedCount > 0) {
		const commandLines = [];
		if (report.prodInstallCommand) commandLines.push(`Production:   ${styleText("cyan", report.prodInstallCommand)}`);
		if (report.devInstallCommand) commandLines.push(`Development:  ${styleText("cyan", report.devInstallCommand)}`);
		const notice = buildNoticeBox({
			title: "COMMANDS TO UPDATE DEPENDENCIES TO MINIMUM REQUIRED VERSIONS",
			lines: commandLines,
			borderColor: "yellow"
		});
		console.log(notice + "\n");
	} else console.log(`  ${styleText("green", "[OK] All dependencies declared in the project meet the required minimums.")}\n`);
	if (!options.all && report.undeclaredCount > 0) console.log(styleText("dim", `  [Notice] ${report.undeclaredCount} governed libraries are not declared by this host (pass '--all' to view).\n`));
	return report;
}
if (isMainModule(import.meta.url)) {
	const bootstrap = bootstrapCliProject();
	const options = parseCliArgs();
	if (runDependenciesReport(bootstrap.projectRoot, options).outdatedCount > 0 && !options.noFail && !options.commandsOnly && !options.json) process.exitCode = 1;
}
export { parseCliArgs, runDependenciesReport };
