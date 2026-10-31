#!/usr/bin/env -S node --experimental-strip-types
import { parseJsonObjectOutput } from "../core/reportUtils.js";
import { getAuditConfig } from "../core/auditConfigLoader.js";
import { toPosixRelative } from "../core/safePath.js";
import { isInCodeRoots } from "../core/auditCodeRoots.js";
import "../core/auditConfig.js";
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs, resolveHumanModeFromArgs } from "../core/cli/cittyHarness.js";
import { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES, bootstrapCliProject, isMainModule, resolveCoverageArgs } from "./cliUtils.js";
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { resolveFallowBinary } from "../suites/architecture/validate_similar_code.js";
import { runFlagsReport } from "./report_flags.js";
import { runGuardReport } from "./report_guard.js";
import path from "node:path";
import fs from "node:fs";
import { styleText } from "node:util";
import { execSync } from "node:child_process";
// src/cli/report_fallow.ts
/**
* src/cli/report_fallow.ts
*/
const DEFAULT_TOP_LIMIT = 20;
const RADIX_DECIMAL = 10;
const VALID_CATEGORY_ALIASES = /* @__PURE__ */ new Set([
	"dupes",
	"duplicates",
	"security",
	"cwe",
	"dead-code",
	"deadcode",
	"unused",
	"complexity",
	"circular",
	"exports",
	"orphans",
	"boundaries",
	"architecture",
	"boundary",
	"coverage-gaps",
	"coverage_gaps",
	"gaps",
	"guard",
	"flags",
	"suppressions",
	"stale-suppressions",
	"viz",
	"all"
]);
const FALLOW_REPORT_ARGS = {
	...COMMON_CLI_ARGS,
	category: {
		type: "string",
		description: "Fallow analysis category"
	},
	categoryPos: {
		type: "positional",
		required: false,
		description: "Fallow analysis category"
	},
	top: {
		type: "string",
		default: "20",
		description: "Maximum items to display"
	},
	retirement: {
		type: "boolean",
		default: false,
		description: "Show retirement candidates for flags"
	}
};
function parseCommandLineArgs() {
	const parsed = parseCittyArgs(FALLOW_REPORT_ARGS, getProcessCliArgs());
	const positionals = parsed._.map(String);
	const rawPosCategory = typeof parsed.categoryPos === "string" && VALID_CATEGORY_ALIASES.has(parsed.categoryPos.toLowerCase()) ? parsed.categoryPos.toLowerCase() : "";
	let category = typeof parsed.category === "string" ? parsed.category.toLowerCase() : rawPosCategory;
	const rawTopStr = String(parsed.top || "20");
	const top = rawTopStr === "all" ? Number.MAX_SAFE_INTEGER : parseInt(rawTopStr, RADIX_DECIMAL) || DEFAULT_TOP_LIMIT;
	const jsonOutput = Boolean(parsed.json);
	const human = resolveHumanModeFromArgs(parsed);
	for (const pos of positionals) {
		const cleanPos = pos.toLowerCase();
		if (!category && VALID_CATEGORY_ALIASES.has(cleanPos)) category = cleanPos;
	}
	return {
		category: category.length > 0 ? category : "all",
		top,
		jsonOutput,
		human,
		retirement: Boolean(parsed.retirement),
		positionals
	};
}
let customFallowRunner = null;
function setFallowCommandRunner(runner) {
	customFallowRunner = runner;
}
function runFallowCommand(command, extraArgs = []) {
	if (customFallowRunner) return customFallowRunner(command, extraArgs);
	try {
		const effectiveExtra = [...extraArgs];
		if (command.startsWith("health")) {
			if (!effectiveExtra.includes("--report-only")) effectiveExtra.push("--report-only");
			if (!effectiveExtra.includes("--coverage")) {
				const covArgs = resolveCoverageArgs();
				if (covArgs.length > 0) effectiveExtra.push(...covArgs);
			}
		}
		const args = [
			"--format",
			"json",
			...effectiveExtra
		];
		const cmd = `node "${resolveFallowBinary(process.cwd()) ?? path.resolve(process.cwd(), "node_modules/fallow/bin/fallow")}" ${command} ${args.join(" ")}`;
		const stdout = execSync(cmd, {
			encoding: "utf8",
			stdio: [
				"pipe",
				"pipe",
				"ignore"
			],
			maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
		});
		return parseJsonObjectOutput(stdout);
	} catch (e) {
		return parseJsonObjectOutput(e);
	}
}
function reportDupes(top, json, human = false) {
	const groups = runFallowCommand("dupes")?.clone_groups || [];
	if (json) {
		console.log(JSON.stringify({
			totalGroups: groups.length,
			groups: groups.slice(0, top)
		}, null, 2));
		return;
	}
	if (!human) {
		console.log(`[Fallow] Clone groups: ${groups.length}`);
		for (const g of groups.slice(0, top)) {
			const locs = (g.instances || []).map((i) => `${path.basename(i.path || i.file || "")}:${i.start_line || i.line || 0}`).join(", ");
			console.log(`  [Clone] tokens=${g.token_count || g.duplicated_tokens || 0} locations=${locs}`);
		}
		return;
	}
	console.log("\n" + renderBanner("CODE DUPLICATION & CLONES (FALLOW)", `Detected groups: ${groups.length}`));
	if (groups.length === 0) {
		console.log("\n  " + styleText(["bold", "green"], "[OK] Zero duplicate code blocks found.\n"));
		return;
	}
	console.log(`\n[Notice] Top ${Math.min(top, groups.length)} duplicate groups:\n`);
	const dupeCols = [
		{
			header: "#",
			width: 3,
			align: "center",
			key: "index"
		},
		{
			header: "TYPE",
			width: 14,
			align: "center",
			key: "type"
		},
		{
			header: "TOKENS",
			width: 8,
			align: "right",
			key: "tokens"
		},
		{
			header: "CLONED CODE LOCATIONS",
			width: 41,
			align: "left",
			key: "locations"
		}
	];
	const dupeRows = groups.slice(0, top).map((g, idx) => {
		const tokens = g.token_count || g.duplicated_tokens || 0;
		const instances = g.instances || [];
		const typeLabel = instances.length >= 3 ? styleText("yellow", "TRIPLICATE") : styleText("cyan", "DUPLICATE");
		const locs = instances.map((i) => `${path.basename(i.path || i.file || "")}:${i.start_line || i.line || 0}`).join(", ");
		return {
			index: String(idx + 1),
			type: typeLabel,
			tokens: String(tokens),
			locations: locs
		};
	});
	console.log(renderBoxTable(dupeCols, dupeRows));
	console.log("");
}
function reportSecurity(top, json, human = false) {
	const rawFindings = runFallowCommand("security")?.security_findings || [];
	const config = getAuditConfig();
	const findings = rawFindings.filter((f) => {
		const norm = toPosixRelative(process.cwd(), f.path || "");
		return isInCodeRoots(norm, config);
	});
	if (json) {
		console.log(JSON.stringify({
			totalSecurity: findings.length,
			findings: findings.slice(0, top)
		}, null, 2));
		return;
	}
	if (!human) {
		console.log(`[Fallow] Security findings: ${findings.length}`);
		for (const f of findings.slice(0, top)) console.log(`  [Security] ${f.path}:${f.line} [CWE-${f.cwe || "?"}] ${f.evidence || f.kind || ""}`);
		return;
	}
	console.log("\n" + renderBanner("SECURITY & CWE VULNERABILITIES (FALLOW)", `Source code findings: ${findings.length}`));
	if (findings.length === 0) {
		console.log("\n  " + styleText(["bold", "green"], "[OK] 0 security vulnerabilities detected in source code.\n"));
		return;
	}
	console.log(`\n[Notice] Top ${Math.min(top, findings.length)} CWE findings:\n`);
	const secCols = [
		{
			header: "#",
			width: 3,
			align: "center",
			key: "index"
		},
		{
			header: "CWE",
			width: 9,
			align: "center",
			key: "cwe"
		},
		{
			header: "LOCATION",
			width: 25,
			align: "left",
			key: "location"
		},
		{
			header: "DESCRIPTION",
			width: 29,
			align: "left",
			key: "description"
		}
	];
	const secRows = findings.slice(0, top).map((f, idx) => ({
		index: String(idx + 1),
		cwe: styleText("red", `CWE-${f.cwe || "?"}`),
		location: `${f.path}:${f.line}`,
		description: f.evidence || f.kind || ""
	}));
	console.log(renderBoxTable(secCols, secRows));
	console.log("");
}
function formatCycleString(c) {
	const filesList = Array.isArray(c.files) && c.files.length > 0 ? c.files : Array.isArray(c.cycle) ? c.cycle : [];
	return filesList.length > 0 ? filesList.join(" → ") : c.path || "";
}
function printCircularCycles(circular) {
	circular.forEach((c, idx) => {
		console.log(`  [${idx + 1}] ${formatCycleString(c)}`);
	});
}
function getArrayField(data, field) {
	if (!data) return [];
	const val = data[field];
	return Array.isArray(val) ? val : [];
}
function parseDeadCodeStructural(data) {
	return {
		unusedFiles: getArrayField(data, "unused_files"),
		unusedExports: getArrayField(data, "unused_exports"),
		unusedDeps: getArrayField(data, "unused_dependencies"),
		circular: getArrayField(data, "circular_dependencies"),
		boundaryViolations: getArrayField(data, "boundary_violations"),
		unresolvedImports: getArrayField(data, "unresolved_imports")
	};
}
function parseDeadCodeComponent(data) {
	return {
		unusedStoreMembers: getArrayField(data, "unused_store_members"),
		unusedClassMembers: getArrayField(data, "unused_class_members"),
		unusedTypes: getArrayField(data, "unused_types"),
		unusedEmits: getArrayField(data, "unused_component_emits"),
		unlistedDeps: getArrayField(data, "unlisted_dependencies"),
		duplicateExports: getArrayField(data, "duplicate_exports"),
		unusedProps: getArrayField(data, "unused_component_props"),
		unrenderedComponents: getArrayField(data, "unrendered_components"),
		unprovidedInjects: getArrayField(data, "unprovided_injects")
	};
}
function parseDeadCodeReportData(data) {
	const structural = parseDeadCodeStructural(data);
	const component = parseDeadCodeComponent(data);
	const totalGranular = structural.unusedFiles.length + structural.unusedExports.length + structural.unusedDeps.length + structural.circular.length + structural.boundaryViolations.length + component.unusedStoreMembers.length + component.unusedClassMembers.length + component.unusedTypes.length + component.unusedEmits.length + component.unlistedDeps.length + component.duplicateExports.length + component.unusedProps.length + component.unrenderedComponents.length + component.unprovidedInjects.length;
	return {
		...structural,
		...component,
		totalGranular
	};
}
function renderDeadCodeJson(report, top) {
	console.log(JSON.stringify({
		totalIssues: report.totalGranular,
		unusedFilesCount: report.unusedFiles.length,
		unusedExportsCount: report.unusedExports.length,
		unusedDepsCount: report.unusedDeps.length,
		circularDepsCount: report.circular.length,
		unusedStoreMembersCount: report.unusedStoreMembers.length,
		unusedClassMembersCount: report.unusedClassMembers.length,
		unusedTypesCount: report.unusedTypes.length,
		unusedEmitsCount: report.unusedEmits.length,
		unlistedDepsCount: report.unlistedDeps.length,
		duplicateExportsCount: report.duplicateExports.length,
		boundaryViolationsCount: report.boundaryViolations.length,
		unusedPropsCount: report.unusedProps.length,
		unrenderedComponentsCount: report.unrenderedComponents.length,
		unprovidedInjectsCount: report.unprovidedInjects.length,
		unusedFiles: report.unusedFiles.slice(0, top),
		unusedExports: report.unusedExports.slice(0, top),
		unusedStoreMembers: report.unusedStoreMembers.slice(0, top),
		unusedClassMembers: report.unusedClassMembers.slice(0, top),
		unusedTypes: report.unusedTypes.slice(0, top),
		unusedEmits: report.unusedEmits.slice(0, top),
		unlistedDeps: report.unlistedDeps.slice(0, top),
		duplicateExports: report.duplicateExports.slice(0, top),
		boundaryViolations: report.boundaryViolations,
		unusedProps: report.unusedProps.slice(0, top),
		unrenderedComponents: report.unrenderedComponents.slice(0, top),
		unprovidedInjects: report.unprovidedInjects.slice(0, top),
		unusedDeps: report.unusedDeps,
		circular: report.circular
	}, null, 2));
}
function renderDeadCodeSummaryTable(report) {
	const deadCodeCols = [
		{
			header: "CATEGORY / FINDING TYPE",
			width: 49,
			align: "left",
			key: "category"
		},
		{
			header: "FINDINGS",
			width: 13,
			align: "right",
			key: "count"
		},
		{
			header: "STATUS",
			width: 8,
			align: "center",
			key: "status"
		}
	];
	const deadCodeRows = [
		{
			category: "Circular dependencies",
			count: String(report.circular.length),
			status: report.circular.length === 0 ? styleText("green", "OK") : styleText("red", "FAIL")
		},
		{
			category: "Architectural boundaries",
			count: String(report.boundaryViolations.length),
			status: report.boundaryViolations.length === 0 ? styleText("green", "OK") : styleText("red", "FAIL")
		},
		{
			category: "Orphan files",
			count: String(report.unusedFiles.length),
			status: report.unusedFiles.length === 0 ? styleText("green", "OK") : styleText("red", "FAIL")
		},
		{
			category: "Unresolved imports",
			count: String(report.unresolvedImports.length),
			status: report.unresolvedImports.length === 0 ? styleText("green", "OK") : styleText("yellow", "WARN")
		},
		{
			category: "Unused dependencies",
			count: String(report.unusedDeps.length),
			status: report.unusedDeps.length === 0 ? styleText("green", "OK") : styleText("yellow", "WARN")
		},
		{
			category: "Unused value exports",
			count: String(report.unusedExports.length),
			status: report.unusedExports.length === 0 ? styleText("green", "OK") : styleText("yellow", "WARN")
		},
		{
			category: "Unused store members",
			count: String(report.unusedStoreMembers.length),
			status: report.unusedStoreMembers.length === 0 ? styleText("green", "OK") : styleText("yellow", "WARN")
		},
		{
			category: "Unused class members",
			count: String(report.unusedClassMembers.length),
			status: report.unusedClassMembers.length === 0 ? styleText("green", "OK") : styleText("yellow", "WARN")
		},
		{
			category: "Unused exported types",
			count: String(report.unusedTypes.length),
			status: report.unusedTypes.length === 0 ? styleText("green", "OK") : styleText("yellow", "WARN")
		},
		{
			category: "Unlisted dependencies",
			count: String(report.unlistedDeps.length),
			status: report.unlistedDeps.length === 0 ? styleText("green", "OK") : styleText("yellow", "WARN")
		},
		{
			category: "Duplicate exports",
			count: String(report.duplicateExports.length),
			status: report.duplicateExports.length === 0 ? styleText("green", "OK") : styleText("yellow", "WARN")
		},
		{
			category: "Component emits (Vue)",
			count: String(report.unusedEmits.length),
			status: report.unusedEmits.length === 0 ? styleText("green", "OK") : styleText("yellow", "WARN")
		},
		{
			category: "Unused props (Vue SFC)",
			count: String(report.unusedProps.length),
			status: report.unusedProps.length === 0 ? styleText("green", "OK") : styleText("yellow", "WARN")
		},
		{
			category: "Unrendered components",
			count: String(report.unrenderedComponents.length),
			status: report.unrenderedComponents.length === 0 ? styleText("green", "OK") : styleText("yellow", "WARN")
		},
		{
			category: "Unprovided injections",
			count: String(report.unprovidedInjects.length),
			status: report.unprovidedInjects.length === 0 ? styleText("green", "OK") : styleText("yellow", "WARN")
		}
	];
	console.log("\n" + renderBoxTable(deadCodeCols, deadCodeRows));
}
function printDeadCodeStructural(report, top) {
	if (report.boundaryViolations.length > 0) {
		console.log("\n[FAIL] Architectural Boundary Violations:");
		report.boundaryViolations.forEach((b, idx) => {
			console.log(`  [${idx + 1}] '${b.from_zone}' -> '${b.to_zone}' in ${b.from_path}:${b.line}`);
			console.log(`       Import: ${b.import_specifier || b.to_path}`);
		});
	}
	if (report.circular.length > 0) {
		console.log("\n[FAIL] Critical Circular Dependencies:");
		printCircularCycles(report.circular);
	}
	if (report.unusedFiles.length > 0) {
		console.log(`\n[WARN] Orphan Files (${report.unusedFiles.length}):`);
		report.unusedFiles.slice(0, top).forEach((f, idx) => console.log(`  [${idx + 1}] ${f.path}`));
	}
	if (report.unusedDeps.length > 0) {
		console.log(`\n[WARN] Unused package.json Dependencies (${report.unusedDeps.length}):`);
		report.unusedDeps.forEach((d) => console.log(`  • ${d.package_name}`));
	}
	if (report.duplicateExports.length > 0) {
		console.log(`\n[WARN] Duplicate Exports (${report.duplicateExports.length}):`);
		report.duplicateExports.forEach((d, idx) => {
			const locs = d.locations?.map((l) => `${l.path}:${l.line}`).join(", ") || "";
			console.log(`  [${idx + 1}] '${d.export_name}' in: ${locs}`);
		});
	}
	if (report.unlistedDeps.length > 0) {
		console.log(`\n[FAIL] Unlisted Dependencies in package.json (${report.unlistedDeps.length}):`);
		report.unlistedDeps.forEach((d, idx) => {
			const firstLoc = d.imported_from?.[0] ? ` (imported in ${d.imported_from[0].path}:${d.imported_from[0].line})` : "";
			console.log(`  [${idx + 1}] '${d.package_name}'${firstLoc}`);
		});
	}
}
function printDeadCodeSymbols(report, top) {
	if (report.unusedEmits.length > 0) {
		console.log(`\n[INFO] Unused Component Emits (${report.unusedEmits.length}):`);
		report.unusedEmits.forEach((e, idx) => {
			console.log(`  [${idx + 1}] ${e.path}:${e.line} -> '${e.component_name}' emit '${e.emit_name}'`);
		});
	}
	if (report.unusedStoreMembers.length > 0) {
		console.log(`\n[INFO] Top Unused Store Members (${Math.min(top, report.unusedStoreMembers.length)} of ${report.unusedStoreMembers.length}):`);
		report.unusedStoreMembers.slice(0, top).forEach((sm, idx) => console.log(`  [${idx + 1}] ${sm.path}:${sm.line} -> ${sm.parent_name}.${sm.member_name}`));
	}
	if (report.unusedClassMembers.length > 0) {
		console.log(`\n[INFO] Top Unused Class Members (${Math.min(top, report.unusedClassMembers.length)} of ${report.unusedClassMembers.length}):`);
		report.unusedClassMembers.slice(0, top).forEach((cm, idx) => console.log(`  [${idx + 1}] ${cm.path}:${cm.line} -> ${cm.parent_name}.${cm.member_name}`));
	}
	if (report.unusedTypes.length > 0) {
		console.log(`\n[INFO] Top Unused Exported Types (${Math.min(top, report.unusedTypes.length)} of ${report.unusedTypes.length}):`);
		report.unusedTypes.slice(0, top).forEach((ut, idx) => console.log(`  [${idx + 1}] ${ut.path}:${ut.line} -> type '${ut.export_name}'`));
	}
	if (report.unusedExports.length > 0) {
		console.log(`\n[INFO] Top Unused Value Exports (${Math.min(top, report.unusedExports.length)} of ${report.unusedExports.length}):`);
		report.unusedExports.slice(0, top).forEach((x, idx) => console.log(`  [${idx + 1}] ${x.path}:${x.line} -> export '${x.export_name}'`));
	}
}
function reportDeadCode(top, json, human = false) {
	const report = parseDeadCodeReportData(runFallowCommand("dead-code"));
	if (json) {
		renderDeadCodeJson(report, top);
		return;
	}
	if (!human) {
		console.log(`[Fallow] Dead code findings: ${report.totalGranular} (circular: ${report.circular.length}, boundaries: ${report.boundaryViolations.length}, orphan files: ${report.unusedFiles.length}, unused exports: ${report.unusedExports.length})`);
		if (report.boundaryViolations.length > 0) {
			console.log(`  [Boundaries] ${report.boundaryViolations.length} boundary violation(s):`);
			for (const b of report.boundaryViolations.slice(0, top)) console.log(`    • ${b.from_zone} -> ${b.to_zone} in ${b.from_path}:${b.line}`);
		}
		if (report.circular.length > 0) {
			console.log(`  [Circular] ${report.circular.length} cycle(s):`);
			for (const c of report.circular.slice(0, top)) console.log(`    • ${(c.files || c.cycle || []).join(" -> ")}`);
		}
		if (report.unusedFiles.length > 0) {
			console.log(`  [Orphans] ${report.unusedFiles.length} orphan file(s):`);
			for (const f of report.unusedFiles.slice(0, top)) console.log(`    • ${f.path}`);
		}
		return;
	}
	console.log("\n" + renderBanner("DEAD CODE & DEPENDENCIES (FALLOW)", `Total findings: ${report.totalGranular}`));
	renderDeadCodeSummaryTable(report);
	printDeadCodeStructural(report, top);
	printDeadCodeSymbols(report, top);
	console.log("");
}
function reportCircular(json, human = false) {
	const circular = runFallowCommand("dead-code", ["--circular-deps"])?.circular_dependencies || [];
	if (json) {
		console.log(JSON.stringify({
			circularDepsCount: circular.length,
			circular
		}, null, 2));
		return;
	}
	if (!human) {
		console.log(`[Fallow] Circular dependencies: ${circular.length}`);
		for (const c of circular) console.log(`  [Circular] ${(c.files || c.cycle || []).join(" -> ")}`);
		return;
	}
	console.log("\n" + renderBanner("CIRCULAR DEPENDENCIES (FALLOW)", `Detected cycles: ${circular.length}`));
	if (circular.length === 0) {
		console.log("\n  " + styleText(["bold", "green"], "[OK] Zero circular dependencies detected in the project.\n"));
		return;
	}
	console.log("\n[Notice] Detected cycles:\n");
	printCircularCycles(circular);
	console.log("");
}
function reportExports(top, json, human = false) {
	const unusedExports = runFallowCommand("dead-code", ["--unused-exports"])?.unused_exports || [];
	if (json) {
		console.log(JSON.stringify({
			unusedExportsCount: unusedExports.length,
			unusedExports: unusedExports.slice(0, top)
		}, null, 2));
		return;
	}
	if (!human) {
		console.log(`[Fallow] Unused exports: ${unusedExports.length}`);
		for (const x of unusedExports.slice(0, top)) console.log(`  [Export] ${x.path}:${x.line} -> ${x.export_name}`);
		return;
	}
	console.log("\n" + renderBanner("UNUSED EXPORTS (FALLOW)", `Total unused: ${unusedExports.length}`));
	if (unusedExports.length === 0) {
		console.log("\n  " + styleText(["bold", "green"], "[OK] 0 unused exports detected.\n"));
		return;
	}
	const showCount = Math.min(top, unusedExports.length);
	console.log(`\n[Notice] Top Unused Exports (${showCount} of ${unusedExports.length}):\n`);
	const expCols = [
		{
			header: "#",
			width: 3,
			align: "center",
			key: "index"
		},
		{
			header: "UNUSED EXPORT",
			width: 28,
			align: "left",
			key: "exportName"
		},
		{
			header: "CODE LOCATION",
			width: 39,
			align: "left",
			key: "location"
		}
	];
	const expRows = unusedExports.slice(0, top).map((x, idx) => ({
		index: String(idx + 1),
		exportName: x.export_name,
		location: `${x.path}:${x.line}`
	}));
	console.log(renderBoxTable(expCols, expRows));
	console.log("");
}
function reportBoundaries(json, human = false) {
	const boundaries = runFallowCommand("dead-code")?.boundary_violations || [];
	if (json) {
		console.log(JSON.stringify({
			totalBoundaries: boundaries.length,
			violations: boundaries
		}, null, 2));
		return;
	}
	if (!human) {
		console.log(`[Fallow] Architectural boundary violations: ${boundaries.length}`);
		for (const b of boundaries) console.log(`  [Boundary] ${b.from_zone} -> ${b.to_zone} in ${b.from_path}:${b.line} (${b.import_specifier || b.to_path})`);
		return;
	}
	console.log("\n" + renderBanner("ARCHITECTURAL BOUNDARIES (FALLOW)", `Violations detected: ${boundaries.length}`));
	if (boundaries.length === 0) {
		console.log("\n  " + styleText(["bold", "green"], "[OK] 0 architectural boundary violations. Layer architecture is 100% isolated.\n"));
		return;
	}
	console.log("\n[Notice] Detected violations:\n");
	const bndCols = [
		{
			header: "#",
			width: 3,
			align: "center",
			key: "index"
		},
		{
			header: "LAYER TRANSITION",
			width: 28,
			align: "left",
			key: "transition"
		},
		{
			header: "CODE LOCATION",
			width: 39,
			align: "left",
			key: "location"
		}
	];
	const bndRows = boundaries.map((b, idx) => ({
		index: String(idx + 1),
		transition: `${b.from_zone} → ${b.to_zone}`,
		location: `${b.from_path}:${b.line}`
	}));
	console.log(renderBoxTable(bndCols, bndRows));
	console.log("");
}
function countArrayItems(record, key) {
	if (!record) return 0;
	const val = record[key];
	return Array.isArray(val) ? val.length : 0;
}
function extractHealthMetrics(healthData) {
	const summaryObj = healthData && typeof healthData.summary === "object" && healthData.summary !== null ? healthData.summary : null;
	return {
		maintainability: summaryObj?.average_maintainability ?? summaryObj?.maintainability_index ?? 0,
		complexityCount: countArrayItems(healthData, "findings"),
		largeCount: countArrayItems(healthData, "large_functions"),
		targetsCount: countArrayItems(healthData, "targets"),
		hotspotsCount: countArrayItems(healthData, "hotspots")
	};
}
function extractDeadCodeMetrics(deadCodeData) {
	const unusedDeps = countArrayItems(deadCodeData, "unused_dependencies") + countArrayItems(deadCodeData, "unused_dev_dependencies");
	return {
		circularCount: countArrayItems(deadCodeData, "circular_dependencies"),
		boundaryCount: countArrayItems(deadCodeData, "boundary_violations"),
		unusedFilesCount: countArrayItems(deadCodeData, "unused_files"),
		unusedExportsCount: countArrayItems(deadCodeData, "unused_exports"),
		unresolvedImportsCount: countArrayItems(deadCodeData, "unresolved_imports"),
		unusedDepsCount: unusedDeps
	};
}
function collectSummaryMetrics() {
	const health = extractHealthMetrics(runFallowCommand("health"));
	const deadCode = extractDeadCodeMetrics(runFallowCommand("dead-code"));
	const dupesData = runFallowCommand("dupes");
	const securityData = runFallowCommand("security");
	const dupeGroupsCount = (dupesData?.clone_groups)?.length ?? 0;
	const securityCount = (securityData?.security_findings)?.length ?? 0;
	const totalWarnings = health.complexityCount + health.largeCount + health.targetsCount + deadCode.unusedFilesCount + deadCode.unusedExportsCount + deadCode.unresolvedImportsCount + deadCode.unusedDepsCount + dupeGroupsCount + securityCount;
	return {
		...health,
		...deadCode,
		dupeGroupsCount,
		securityCount,
		totalWarnings
	};
}
function printJsonSummary(m) {
	console.log(JSON.stringify({
		maintainability: m.maintainability,
		totalQualityIndicators: m.totalWarnings,
		health: {
			complexityHotspots: m.complexityCount,
			largeFunctions: m.largeCount,
			refactoringTargets: m.targetsCount,
			churnHotspots: m.hotspotsCount
		},
		deadCode: {
			circularDependencies: m.circularCount,
			boundaryViolations: m.boundaryCount,
			unusedFiles: m.unusedFilesCount,
			unusedExports: m.unusedExportsCount,
			unresolvedImports: m.unresolvedImportsCount,
			unusedDependencies: m.unusedDepsCount
		},
		dupes: { cloneGroups: m.dupeGroupsCount },
		security: { findings: m.securityCount }
	}, null, 2));
}
function printTableSummary(m, human = false) {
	const maintStr = m.maintainability > 0 ? `${m.maintainability.toFixed(1)} / 100` : "-";
	if (!human) {
		console.log(`[Fallow] Maintainability: ${maintStr} | Quality Indicators: ${m.totalWarnings}`);
		console.log(`  • Complexity: ${m.complexityCount} hotspots | Large functions: ${m.largeCount} | Refactor targets: ${m.targetsCount} | Churn: ${m.hotspotsCount}`);
		console.log(`  • Dead code: ${m.unusedFilesCount} orphan files | ${m.unusedExportsCount} unused exports | ${m.unusedDepsCount} unused deps`);
		console.log(`  • Architecture: ${m.boundaryCount} boundary violations | ${m.circularCount} circular deps | ${m.dupeGroupsCount} clone groups | ${m.securityCount} security findings`);
		return;
	}
	console.log("\n" + renderBanner("CODEBASE INTELLIGENCE DASHBOARD (FALLOW)", `Maintainability Index: ${maintStr}`));
	const sumCols = [{
		header: "PROJECT METRIC / INDICATOR",
		width: 56,
		align: "left",
		key: "metric"
	}, {
		header: "VALUE",
		width: 14,
		align: "right",
		key: "value"
	}];
	const sumRows = [
		{
			metric: "Code maintainability index (Fallow)",
			value: maintStr
		},
		{
			metric: "High complexity functions (cognitive/cyclomatic)",
			value: String(m.complexityCount)
		},
		{
			metric: "Large functions (>60 LOC)",
			value: String(m.largeCount)
		},
		{
			metric: "Files with high churn / change hotspots",
			value: String(m.hotspotsCount)
		},
		{
			metric: "Recommended refactoring targets",
			value: String(m.targetsCount)
		},
		{
			metric: "Orphan / unreachable files",
			value: String(m.unusedFilesCount)
		},
		{
			metric: "Unused value exports",
			value: String(m.unusedExportsCount)
		},
		{
			metric: "Unresolved imports",
			value: String(m.unresolvedImportsCount)
		},
		{
			metric: "Unused package.json dependencies",
			value: String(m.unusedDepsCount)
		},
		{
			metric: "Critical circular dependencies",
			value: String(m.circularCount)
		},
		{
			metric: "Architectural boundary violations",
			value: String(m.boundaryCount)
		},
		{
			metric: "Duplicated / cloned code blocks",
			value: String(m.dupeGroupsCount)
		},
		{
			metric: "Security candidates (CWE in src/)",
			value: String(m.securityCount)
		}
	];
	console.log("\n" + renderBoxTable(sumCols, sumRows));
	console.log("\nAVAILABLE COMMANDS IN NPM:");
	console.log("─────────────────────────────────────────────────────────────────────────────");
	console.log("  • npm run auditor:complexity         → Cyclomatic and cognitive complexity report");
	console.log("  • npm run auditor:fallow:dupes       → Cloned code detection");
	console.log("  • npm run auditor:fallow:circular    → Circular dependency detection");
	console.log("  • npm run auditor:fallow:exports     → Unused exports detection");
	console.log("  • npm run auditor:fallow:security    → Security and CWE audit");
	console.log("  • npm run auditor:fallow:dead-code   → Dead code and dependencies detection");
	console.log("  • npm run auditor:fallow:boundaries  → Architectural boundaries audit");
	console.log("  • npm run auditor                    → Unified audit suite");
	console.log("─────────────────────────────────────────────────────────────────────────────\n");
}
function reportAllSummary(json, human = false) {
	const metrics = collectSummaryMetrics();
	if (json) printJsonSummary(metrics);
	else printTableSummary(metrics, human);
}
function reportCoverageGaps(top, json, human = false) {
	const rawGaps = runFallowCommand("health", ["--coverage-gaps"])?.coverage_gaps;
	const isArray = Array.isArray(rawGaps);
	const gaps = isArray ? rawGaps : rawGaps?.exports ?? [];
	const summary = !isArray ? rawGaps?.summary : void 0;
	if (json) {
		console.log(JSON.stringify({
			summary,
			totalGaps: gaps.length,
			gaps: gaps.slice(0, top)
		}, null, 2));
		return;
	}
	if (!human) {
		console.log(`[Fallow] Coverage gaps: ${gaps.length}`);
		for (const g of gaps.slice(0, top)) console.log(`  [Gap] ${g.path || "General"}:${g.line || 1} -> ${g.export_name || "export"} (${g.actions?.[0]?.note || "Runtime export without test references"})`);
		return;
	}
	const subtitle = summary?.file_coverage_pct !== void 0 ? `Coverage: ${summary.file_coverage_pct}% (${summary.covered_files}/${summary.runtime_files} files) • Gaps: ${gaps.length}` : `Reachable exports without tests: ${gaps.length}`;
	console.log("\n" + renderBanner("TEST COVERAGE GAPS (FALLOW COVERAGE GAPS)", subtitle));
	if (gaps.length === 0) {
		console.log("\n  " + styleText(["bold", "green"], "[OK] No coverage gaps detected in reachable exports.\n"));
		return;
	}
	const rows = gaps.slice(0, top).map((item, idx) => {
		const loc = `${item.path || "General"}:${item.line || 1}`;
		const name = styleText("cyan", item.export_name || "export");
		const note = item.actions?.[0]?.note || "Runtime export without test references";
		return {
			index: String(idx + 1),
			location: loc,
			name,
			note
		};
	});
	console.log("\n" + renderBoxTable([
		{
			header: "#",
			width: 3,
			align: "center",
			key: "index"
		},
		{
			header: "LOCATION",
			width: 38,
			align: "left",
			key: "location"
		},
		{
			header: "SYMBOL / EXPORT",
			width: 24,
			align: "left",
			key: "name"
		},
		{
			header: "COVERAGE STATUS",
			width: 44,
			align: "left",
			key: "note"
		}
	], rows));
	console.log();
}
function executeComplexityReport(jsonOutput) {
	const currentDir = import.meta.filename ? path.dirname(import.meta.filename) : path.resolve(process.cwd(), "src/cli");
	const compScript = path.resolve(currentDir, "report_complexity.ts");
	execSync(`node --permission --experimental-strip-types --allow-fs-read=* --allow-child-process "${compScript}" ${jsonOutput ? "json" : ""}`, { stdio: "inherit" });
}
function reportSuppressions(top, json, human = false) {
	const data = runFallowCommand("suppressions");
	const files = data?.files ?? [];
	const summary = data?.summary;
	const flattened = [];
	for (const f of files) for (const s of f.suppressions || []) flattened.push({
		path: f.path,
		suppression: s
	});
	if (json) {
		console.log(JSON.stringify({
			summary,
			total: flattened.length,
			suppressions: flattened.slice(0, top)
		}, null, 2));
		return;
	}
	if (!human) {
		console.log(`[Fallow] Active suppressions: ${flattened.length} (unjustified: ${summary?.without_reason ?? 0}, stale: ${summary?.stale ?? 0})`);
		for (const item of flattened.slice(0, top)) console.log(`  [Suppression] ${item.path}:${item.suppression.line} [${item.suppression.kind}] reason: ${item.suppression.reason || "unjustified"}`);
		return;
	}
	const sub = summary ? `Total: ${summary.total ?? flattened.length} • Without justification: ${summary.without_reason ?? 0} • Stale: ${summary.stale ?? 0}` : `Total: ${flattened.length}`;
	console.log("\n" + renderBanner("ACTIVE SUPPRESSIONS INVENTORY (FALLOW SUPPRESSIONS)", sub));
	if (flattened.length === 0) {
		console.log("\n  " + styleText(["bold", "green"], "[OK] No active suppression comments or rules found.\n"));
		return;
	}
	const cols = [
		{
			header: "#",
			width: 3,
			align: "center",
			key: "index"
		},
		{
			header: "LOCATION",
			width: 32,
			align: "left",
			key: "location"
		},
		{
			header: "TYPE / RULE",
			width: 18,
			align: "left",
			key: "kind"
		},
		{
			header: "LEVEL",
			width: 8,
			align: "center",
			key: "level"
		},
		{
			header: "JUSTIFICATION",
			width: 38,
			align: "left",
			key: "reason"
		}
	];
	const rows = flattened.slice(0, top).map((item, idx) => {
		const loc = `${item.path}:${item.suppression.line}`;
		const kind = styleText("cyan", item.suppression.kind || "unknown");
		const level = item.suppression.level || "line";
		const reasonText = item.suppression.reason ? item.suppression.reason : styleText("yellow", "Unjustified");
		return {
			index: String(idx + 1),
			location: loc,
			kind,
			level,
			reason: reasonText
		};
	});
	console.log("\n" + renderBoxTable(cols, rows));
	console.log();
}
function reportViz(json, human = false) {
	const fallowBin = resolveFallowBinary(process.cwd()) ?? path.resolve(process.cwd(), "node_modules/fallow/bin/fallow");
	const scratchDir = path.resolve(process.cwd(), "scratch");
	const targetHtml = path.resolve(scratchDir, "fallow_map.html");
	const defaultHtml = path.resolve(process.cwd(), "fallow-viz.html");
	if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
	try {
		if (customFallowRunner) {
			fs.writeFileSync(targetHtml, "<html><body>Mock Viz</body></html>", "utf-8");
			if (json) console.log(JSON.stringify({
				success: true,
				outputPath: "scratch/fallow_map.html",
				message: "Mock viz generated"
			}, null, 2));
			else console.log("[Fallow] Visual map generated at: scratch/fallow_map.html");
			return;
		}
		const cmd = `node "${fallowBin}" viz --no-open --out "${targetHtml}"`;
		const stdout = execSync(cmd, {
			cwd: process.cwd(),
			encoding: "utf8",
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			],
			maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
		});
		if (fs.existsSync(defaultHtml)) {
			if (!fs.existsSync(targetHtml)) fs.copyFileSync(defaultHtml, targetHtml);
			fs.unlinkSync(defaultHtml);
		}
		if (json) {
			console.log(JSON.stringify({
				success: true,
				outputPath: "scratch/fallow_map.html",
				message: stdout.trim()
			}, null, 2));
			return;
		}
		if (!human) {
			console.log("[Fallow] Interactive codebase map generated at: scratch/fallow_map.html");
			return;
		}
		console.log("\n" + renderBanner("INTERACTIVE CODEBASE MAP (FALLOW VIZ)", "Interactive HTML visualization"));
		console.log("\n  " + styleText(["bold", "green"], "[OK] Interactive map generated successfully!\n"));
		console.log(`  Generated file: ${styleText("cyan", "scratch/fallow_map.html")}`);
		console.log(`  Open it in your browser to inspect.\n`);
	} catch (err) {
		if (json) {
			console.log(JSON.stringify({
				success: false,
				error: err instanceof Error ? err.message : String(err)
			}, null, 2));
			return;
		}
		console.error(styleText("red", `Error generating fallow viz: ${err instanceof Error ? err.message : String(err)}`));
	}
}
const REPORT_DISPATCH_MAP = {
	dupes: (top, json, human) => reportDupes(top, json, human),
	duplicates: (top, json, human) => reportDupes(top, json, human),
	security: (top, json, human) => reportSecurity(top, json, human),
	cwe: (top, json, human) => reportSecurity(top, json, human),
	circular: (_top, json, human) => reportCircular(json, human),
	"circular-deps": (_top, json, human) => reportCircular(json, human),
	exports: (top, json, human) => reportExports(top, json, human),
	"unused-exports": (top, json, human) => reportExports(top, json, human),
	"dead-code": (top, json, human) => reportDeadCode(top, json, human),
	deadcode: (top, json, human) => reportDeadCode(top, json, human),
	unused: (top, json, human) => reportDeadCode(top, json, human),
	boundaries: (_top, json, human) => reportBoundaries(json, human),
	architecture: (_top, json, human) => reportBoundaries(json, human),
	boundary: (_top, json, human) => reportBoundaries(json, human),
	"coverage-gaps": (top, json, human) => reportCoverageGaps(top, json, human),
	coverage_gaps: (top, json, human) => reportCoverageGaps(top, json, human),
	gaps: (top, json, human) => reportCoverageGaps(top, json, human),
	guard: (_top, json, _human, extra) => {
		const posArgs = extra.positionals.filter((a) => a !== "guard");
		return runGuardReport(process.cwd(), posArgs, { json });
	},
	flags: (top, json, _human, extra) => {
		return runFlagsReport(process.cwd(), {
			retirement: extra.retirement,
			top,
			json
		});
	},
	suppressions: (top, json, human) => reportSuppressions(top, json, human),
	"stale-suppressions": (top, json, human) => reportSuppressions(top, json, human),
	viz: (_top, json, human) => reportViz(json, human),
	complexity: (_top, json) => executeComplexityReport(json)
};
function runFallowReportCli() {
	const { category, top, jsonOutput, human, retirement, positionals } = parseCommandLineArgs();
	const handler = REPORT_DISPATCH_MAP[category];
	const exitCode = handler ? handler(top, jsonOutput, human, {
		retirement,
		positionals
	}) ?? 0 : (reportAllSummary(jsonOutput, human), 0);
	if (exitCode !== 0) process.exit(exitCode);
}
if (isMainModule(import.meta.url)) {
	bootstrapCliProject();
	runFallowReportCli();
}
export { runFallowReportCli, setFallowCommandRunner };
