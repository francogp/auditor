#!/usr/bin/env -S node --experimental-strip-types
import { safeJsonParse, safeReadFileSync } from "../core/safeUtils.js";
import { parseJsonObjectOutput } from "../core/reportUtils.js";
import { getAuditConfig } from "../core/auditConfigLoader.js";
import { toPosixRelative } from "../core/safePath.js";
import "../core/auditConfig.js";
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs, resolveHumanModeFromArgs } from "../core/cli/cittyHarness.js";
import { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES, bootstrapCliProject, isMainModule, resolveCoverageArgs } from "./cliUtils.js";
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import path from "node:path";
import fs from "node:fs";
import { styleText } from "node:util";
import { execSync } from "node:child_process";
// src/cli/report_complexity.ts
/**
* src/cli/report_complexity.ts
*/
const MAX_FUNCTION_NAME_CHARS = 18;
const MAX_RECOMMENDED_LOC = 60;
const MAX_RECOMMENDED_COGNITIVE = 20;
const MAX_RECOMMENDED_CYCLOMATIC = 25;
const MAX_FILE_PATH_DISPLAY_LENGTH = 27;
const FILE_PATH_TAIL_CHARS = 24;
const MAX_RECOMMENDATION_CHARS = 48;
function extractTopFolder(relativePosixPath) {
	const dir = path.posix.dirname(relativePosixPath);
	if (dir === ".") return "root";
	const slashIdx = dir.indexOf("/");
	return slashIdx === -1 ? dir : dir.slice(0, slashIdx);
}
function extractLayerFromPath(relPath) {
	const codeRoots = getAuditConfig().paths?.codeRoots ?? ["src", "scripts"];
	for (const root of codeRoots) {
		const cleanRoot = toPosixRelative(process.cwd(), root);
		const relToRoot = path.posix.relative(cleanRoot, relPath);
		if (!relToRoot.startsWith("..") && !path.posix.isAbsolute(relToRoot)) return extractTopFolder(relToRoot);
	}
	return extractTopFolder(relPath);
}
const DEFAULT_TOP_LIMIT = 20;
const RADIX_DECIMAL = 10;
const COMPLEXITY_CLI_ARGS = {
	...COMMON_CLI_ARGS,
	top: {
		type: "string",
		default: "20",
		description: "Number of top hotspots to display"
	},
	layer: {
		type: "string",
		description: "Filter hotspots by architectural layer"
	}
};
function parseCommandLineArgs() {
	const parsed = parseCittyArgs(COMPLEXITY_CLI_ARGS, getProcessCliArgs());
	return {
		top: parseInt(String(parsed.top || "20"), RADIX_DECIMAL) || DEFAULT_TOP_LIMIT,
		layerFilter: typeof parsed.layer === "string" ? parsed.layer : void 0,
		jsonOutput: Boolean(parsed.json),
		isHuman: resolveHumanModeFromArgs(parsed)
	};
}
function runFallowHealth() {
	try {
		const candidates = [
			path.resolve(process.cwd(), "node_modules/fallow/bin/fallow"),
			path.resolve(import.meta.dirname, "../../node_modules/fallow/bin/fallow"),
			path.resolve(import.meta.dirname, "../../../node_modules/fallow/bin/fallow")
		];
		const fallowBin = candidates.find((c) => fs.existsSync(c)) || candidates[0];
		if (!fs.existsSync(fallowBin)) return {};
		const covArgs = resolveCoverageArgs();
		const cmd = `node "${fallowBin}" health --format json${covArgs.length > 0 ? ` ${covArgs.join(" ")}` : ""}`;
		const stdout = execSync(cmd, {
			encoding: "utf8",
			stdio: [
				"pipe",
				"pipe",
				"ignore"
			],
			maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
		});
		return parseJsonObjectOutput(stdout) ?? {};
	} catch (e) {
		return parseJsonObjectOutput(e) ?? {};
	}
}
function ingestLargeFunctions(rawLarge, findingsMap) {
	if (!rawLarge) return;
	for (const lf of rawLarge) {
		const filePath = lf.path ?? "";
		const relPath = toPosixRelative(process.cwd(), filePath);
		const layer = extractLayerFromPath(relPath);
		const key = `${relPath}:${lf.line}:${lf.name}`;
		findingsMap.set(key, {
			name: lf.name || "<anónima>",
			file: relPath,
			line: lf.line || 1,
			lines: lf.line_count || 0,
			cog: 0,
			cyc: 0,
			total: 0,
			exceeded: "lines",
			layer
		});
	}
}
function ingestComplexityFindings(rawFindings, findingsMap) {
	if (!rawFindings) return;
	for (const f of rawFindings) {
		const filePath = f.path ?? "";
		const relPath = toPosixRelative(process.cwd(), filePath);
		const layer = extractLayerFromPath(relPath);
		const cog = f.cognitive || 0;
		const cyc = f.cyclomatic || 0;
		const lines = f.line_count || 0;
		const key = `${relPath}:${f.line}:${f.name}`;
		const existing = findingsMap.get(key);
		if (existing) {
			existing.cog = cog;
			existing.cyc = cyc;
			existing.total = cog + cyc;
			if (lines > 0) existing.lines = lines;
			existing.exceeded = "both";
		} else findingsMap.set(key, {
			name: f.name || "<anónima>",
			file: relPath,
			line: f.line || 1,
			lines,
			cog,
			cyc,
			total: cog + cyc,
			exceeded: f.exceeded || "complexity",
			layer
		});
	}
}
function parseAuditFindingContext(context) {
	const match = (context || "").match(/^([^\s(]+)\s*\(cog:\s*(\d+),\s*cyc:\s*(\d+),\s*(\d+)\s*lines\)/);
	return {
		name: match?.[1] || "<función>",
		cog: match?.[2] ? parseInt(match[2], RADIX_DECIMAL) : 0,
		cyc: match?.[3] ? parseInt(match[3], RADIX_DECIMAL) : 0,
		lines: match?.[4] ? parseInt(match[4], RADIX_DECIMAL) : 0
	};
}
function ingestFallbackAuditFindings(findingsMap) {
	if (findingsMap.size > 0) return;
	const latestPath = path.resolve(process.cwd(), "scratch/audits/latest_audit.json");
	if (!fs.existsSync(latestPath)) return;
	const raw = safeReadFileSync(latestPath);
	if (!raw) return;
	const auditData = safeJsonParse(raw);
	if (!auditData) return;
	const compFindings = (auditData.allFindings || []).filter((f) => f.ruleId === "fallow-refactoring-targets");
	for (const cf of compFindings) {
		const filePath = cf.file || "";
		const relPath = toPosixRelative(process.cwd(), filePath);
		const layer = extractLayerFromPath(relPath);
		const line = cf.line || 1;
		const { name, cog, cyc, lines } = parseAuditFindingContext(cf.context);
		const key = `${relPath}:${line}:${name}`;
		findingsMap.set(key, {
			name,
			file: relPath,
			line,
			lines,
			cog,
			cyc,
			total: cog + cyc,
			exceeded: "complexity",
			layer
		});
	}
}
function sortComplexityFindings(findings) {
	return findings.sort((a, b) => {
		if (a.total > 0 && b.total === 0) return -1;
		if (a.total === 0 && b.total > 0) return 1;
		if (b.lines !== a.lines) return b.lines - a.lines;
		return b.total - a.total;
	});
}
function loadComplexityFindings() {
	const healthData = runFallowHealth();
	const findingsMap = /* @__PURE__ */ new Map();
	ingestLargeFunctions(healthData.large_functions, findingsMap);
	ingestComplexityFindings(healthData.findings, findingsMap);
	ingestFallbackAuditFindings(findingsMap);
	return {
		findings: sortComplexityFindings(Array.from(findingsMap.values())),
		targets: healthData.targets || [],
		maintainability: healthData.summary?.average_maintainability ?? healthData.summary?.maintainability_index ?? 0
	};
}
function renderBoxReport(findings, targets, maintainability, topLimit, layerFilter, isHuman = false) {
	const filtered = layerFilter ? findings.filter((f) => f.layer.toLowerCase() === layerFilter.toLowerCase()) : findings;
	if (!isHuman) {
		if (findings.length === 0) {
			console.log(styleText("green", "[OK] 0 high complexity functions found."));
			return;
		}
		console.log(`\n[Complexity] Maintainability: ${maintainability.toFixed(1)}/100 | Functions exceeding threshold: ${findings.length}`);
		console.log(`[Hotspots] Top ${Math.min(topLimit, filtered.length)} of ${filtered.length}${layerFilter ? ` (Filter: ${layerFilter})` : ""}:`);
		for (const [idx, f] of filtered.slice(0, topLimit).entries()) console.log(`• ${idx + 1}. ${f.name} (${f.file}:${f.line}) [${f.layer}] - ${f.lines} LOC, cog: ${f.cog}, cyc: ${f.cyc}`);
		console.log("");
		return;
	}
	const subtitle = maintainability > 0 ? `Functions exceeding threshold: ${findings.length} · Maintainability index: ${maintainability.toFixed(1)}` : `Functions exceeding threshold: ${findings.length}`;
	console.log("\n" + renderBanner("CYCLOMATIC, COGNITIVE COMPLEXITY AND FUNCTION SIZE (FALLOW)", subtitle));
	const distribution = {};
	for (const f of findings) distribution[f.layer] = (distribution[f.layer] || 0) + 1;
	console.log("\nDISTRIBUTION BY LAYER / DIRECTORY:\n");
	const layerCols = [
		{
			header: "ARCHITECTURE LAYER",
			width: 45,
			align: "left",
			key: "layer"
		},
		{
			header: "FUNCTIONS",
			width: 11,
			align: "right",
			key: "count"
		},
		{
			header: "% TOTAL",
			width: 10,
			align: "right",
			key: "percentage"
		}
	];
	const layerRows = Object.entries(distribution).sort((a, b) => b[1] - a[1]).map(([layer, count]) => {
		const pct = (count / findings.length * 100).toFixed(1) + "%";
		return {
			layer,
			count: String(count),
			percentage: pct
		};
	});
	console.log(renderBoxTable(layerCols, layerRows));
	console.log(`\nTOP ${Math.min(topLimit, filtered.length)} HOTSPOTS (LINES AND COMPLEXITY) ${layerFilter ? `(Filter: ${layerFilter})` : ""}:\n`);
	const hotspotCols = [
		{
			header: "#",
			width: 3,
			align: "center",
			key: "index"
		},
		{
			header: "FUNCTION",
			width: 18,
			align: "left",
			key: "name"
		},
		{
			header: "LINES",
			width: 7,
			align: "right",
			key: "lines"
		},
		{
			header: "COG",
			width: 5,
			align: "right",
			key: "cog"
		},
		{
			header: "CYC",
			width: 5,
			align: "right",
			key: "cyc"
		},
		{
			header: "FILE:LINE",
			width: 32,
			align: "left",
			key: "fileLoc"
		}
	];
	const hotspotRows = filtered.slice(0, topLimit).map((f, idx) => ({
		index: String(idx + 1),
		name: f.name.length > 18 ? f.name.slice(0, 17) + "…" : f.name,
		lines: styleText(f.lines > 60 ? "red" : "green", String(f.lines)),
		cog: f.cog > 0 ? styleText(f.cog > 20 ? "red" : "yellow", String(f.cog)) : styleText("dim", "-"),
		cyc: f.cyc > 0 ? styleText(f.cyc > 25 ? "red" : "yellow", String(f.cyc)) : styleText("dim", "-"),
		fileLoc: f.file.length > 27 ? "…" + f.file.slice(-24) + `:${f.line}` : `${f.file}:${f.line}`
	}));
	console.log(renderBoxTable(hotspotCols, hotspotRows));
	if (targets.length > 0) {
		console.log(`\n[Notice] PRIORITY REFACTORING TARGETS (FALLOW - TOP ${targets.length}):\n`);
		const targetCols = [
			{
				header: "#",
				width: 3,
				align: "center",
				key: "index"
			},
			{
				header: "PRI",
				width: 5,
				align: "right",
				key: "pri"
			},
			{
				header: "TYPE",
				width: 14,
				align: "left",
				key: "category"
			},
			{
				header: "REFACTORING RECOMMENDATION",
				width: 48,
				align: "left",
				key: "recommendation"
			}
		];
		const targetRows = targets.map((t, idx) => ({
			index: String(idx + 1),
			pri: t.priority ? t.priority.toFixed(1) : "-",
			category: t.category.replace(/_/g, " "),
			recommendation: t.recommendation.length > 48 ? t.recommendation.slice(0, 47) + "…" : t.recommendation
		}));
		console.log(renderBoxTable(targetCols, targetRows));
	}
	console.log("");
}
function runComplexityReport() {
	const { top, layerFilter, jsonOutput, isHuman } = parseCommandLineArgs();
	const { findings, targets, maintainability } = loadComplexityFindings();
	if (jsonOutput) {
		console.log(JSON.stringify({
			total: findings.length,
			maintainability,
			findings: findings.slice(0, top),
			targets
		}, null, 2));
		return;
	}
	renderBoxReport(findings, targets, maintainability, top, layerFilter, isHuman);
}
if (isMainModule(import.meta.url)) {
	bootstrapCliProject();
	runComplexityReport();
}
export { FILE_PATH_TAIL_CHARS, MAX_FILE_PATH_DISPLAY_LENGTH, MAX_FUNCTION_NAME_CHARS, MAX_RECOMMENDATION_CHARS, MAX_RECOMMENDED_COGNITIVE, MAX_RECOMMENDED_CYCLOMATIC, MAX_RECOMMENDED_LOC, runComplexityReport };
