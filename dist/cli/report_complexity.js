#!/usr/bin/env -S node --experimental-strip-types
import { getAuditConfig } from "../core/auditConfigLoader.js";
import { parseJsonObjectOutput } from "../core/reportUtils.js";
import "../core/auditConfig.js";
import { toPosixRelative } from "../core/auditCoverage.js";
import "../core/safePath.js";
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES, bootstrapCliProject, isMainModule, resolveCoverageArgs } from "./cliUtils.js";
import path from "node:path";
import fs from "node:fs";
import { parseArgs, styleText } from "node:util";
import { execSync } from "node:child_process";
//#region src/cli/report_complexity.ts
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
function extractLayerFromPath(relPath) {
	const codeRoots = getAuditConfig().paths?.codeRoots ?? ["src", "scripts"];
	for (const root of codeRoots) {
		const cleanRoot = toPosixRelative(process.cwd(), root);
		const relToRoot = path.posix.relative(cleanRoot, relPath);
		if (!relToRoot.startsWith("..") && !path.posix.isAbsolute(relToRoot)) return relToRoot.split("/").filter(Boolean)[0] || "root";
	}
	const segments = relPath.split("/").filter(Boolean);
	return segments.length > 1 && segments[0] ? segments[0] : "root";
}
const DEFAULT_TOP_LIMIT = 20;
const RADIX_DECIMAL = 10;
function parseCommandLineArgs() {
	const normalizedCliArgs = process.argv.slice(2).map((cliParam) => {
		if (cliParam.includes("=") && !cliParam.startsWith("-")) return `--${cliParam}`;
		return cliParam;
	});
	const { values } = parseArgs({
		args: normalizedCliArgs,
		options: {
			top: {
				type: "string",
				default: "20"
			},
			layer: { type: "string" },
			json: {
				type: "boolean",
				default: false
			}
		},
		strict: false,
		allowPositionals: true
	});
	return {
		top: parseInt(values.top, RADIX_DECIMAL) || DEFAULT_TOP_LIMIT,
		layerFilter: values.layer,
		jsonOutput: Boolean(values.json)
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
	try {
		const compFindings = (JSON.parse(fs.readFileSync(latestPath, "utf8")).allFindings || []).filter((f) => f.ruleId === "fallow-refactoring-targets");
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
	} catch {}
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
function renderBoxReport(findings, targets, maintainability, topLimit, layerFilter) {
	const filtered = layerFilter ? findings.filter((f) => f.layer.toLowerCase() === layerFilter.toLowerCase()) : findings;
	const subtitle = maintainability > 0 ? `Funciones fuera de umbral: ${findings.length} · Índice de mantenibilidad: ${maintainability.toFixed(1)}` : `Funciones fuera de umbral: ${findings.length}`;
	console.log("\n" + renderBanner("COMPLEJIDAD CICLOMÁTICA, COGNITIVA Y TAMAÑO DE FUNCIONES (FALLOW)", subtitle));
	const distribution = {};
	for (const f of findings) distribution[f.layer] = (distribution[f.layer] || 0) + 1;
	console.log("\n📁 DISTRIBUCIÓN POR CAPA / DIRECTORIO:\n");
	const layerCols = [
		{
			header: "CAPA DE ARQUITECTURA",
			width: 45,
			align: "left",
			key: "layer"
		},
		{
			header: "FUNCIONES",
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
	console.log(`\n🔥 TOP ${Math.min(topLimit, filtered.length)} HOTSPOTS (LÍNEAS Y COMPLEJIDAD) ${layerFilter ? `(Filtro: ${layerFilter})` : ""}:\n`);
	const hotspotCols = [
		{
			header: "#",
			width: 3,
			align: "center",
			key: "index"
		},
		{
			header: "FUNCIÓN",
			width: 18,
			align: "left",
			key: "name"
		},
		{
			header: "LÍNEAS",
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
			header: "ARCHIVO:LÍNEA",
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
		console.log(`\n🎯 OBJETIVOS DE REFACTORIZACIÓN PRIORITARIOS (FALLOW - TOP ${targets.length}):\n`);
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
				header: "TIPO",
				width: 14,
				align: "left",
				key: "category"
			},
			{
				header: "RECOMENDACIÓN DE REFACTORIZACIÓN",
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
	const { top, layerFilter, jsonOutput } = parseCommandLineArgs();
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
	renderBoxReport(findings, targets, maintainability, top, layerFilter);
}
if (isMainModule(import.meta.url)) {
	bootstrapCliProject();
	runComplexityReport();
}
//#endregion
export { FILE_PATH_TAIL_CHARS, MAX_FILE_PATH_DISPLAY_LENGTH, MAX_FUNCTION_NAME_CHARS, MAX_RECOMMENDATION_CHARS, MAX_RECOMMENDED_COGNITIVE, MAX_RECOMMENDED_CYCLOMATIC, MAX_RECOMMENDED_LOC, runComplexityReport };
