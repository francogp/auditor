#!/usr/bin/env -S node --experimental-strip-types
import { AUDITOR_VERSION } from "../core/version.js";
import { buildTestCoverageConfig } from "../core/auditConfigBuilders.js";
import { getAuditConfig } from "../core/auditConfigLoader.js";
import { parseJsonObjectOutput } from "../core/reportUtils.js";
import "../core/auditConfig.js";
import "../core/permissionGuard.js";
import { toPosixRelative } from "../core/auditCoverage.js";
import "../core/safePath.js";
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES, isMainModule, resolvePackageBin } from "./cliUtils.js";
import { analyzeTestCoverage, resolveCoverageFile } from "../core/testCoverageCore.js";
import fs from "node:fs";
import { parseArgs, styleText } from "node:util";
import { execSync, spawnSync } from "node:child_process";
//#region src/cli/report_test_coverage.ts
/**
* @file report_test_coverage.ts
* @description AUDITOR TEST COVERAGE CLI (Node.js 26+)
* Canonical test execution coverage reporting, analysis, and verification tool.
* Evaluates Istanbul/V8 coverage JSON, aggregates directory metrics, detects untracked files,
* displays uncovered line ranges, and gates pull requests / commits.
*/
const RADIX_DECIMAL = 10;
const DEFAULT_TOP_LIMIT = 20;
const DIR_COL_WIDTH = 24;
const ARCH_COL_WIDTH = 5;
const STATS_COL_WIDTH = 8;
const FILE_COL_WIDTH = 36;
const STATS_SHORT_WIDTH = 7;
const UNCOVERED_COL_WIDTH = 17;
const UNCOVERED_MAX_CHARS = 14;
const HOTSPOT_FILE_WIDTH = 32;
const COMPLEXITY_COL_WIDTH = 11;
const UNTRACKED_FILE_WIDTH = 56;
const BADGE_COL_WIDTH = 10;
function parseCommandLineArgs() {
	const normalizedCliArgs = process.argv.slice(2).map((arg) => {
		if (arg.includes("=") && !arg.startsWith("-")) return `--${arg}`;
		return arg;
	});
	const { values } = parseArgs({
		args: normalizedCliArgs,
		options: {
			run: {
				type: "boolean",
				default: false
			},
			check: {
				type: "boolean",
				default: false
			},
			threshold: { type: "string" },
			min: { type: "string" },
			dir: { type: "string" },
			file: { type: "string" },
			below: {
				type: "boolean",
				default: false
			},
			zero: {
				type: "boolean",
				default: false
			},
			untracked: {
				type: "boolean",
				default: false
			},
			hotspots: {
				type: "boolean",
				default: false
			},
			top: {
				type: "string",
				default: "20"
			},
			json: {
				type: "boolean",
				default: false
			},
			help: {
				type: "boolean",
				short: "h",
				default: false
			}
		},
		strict: false,
		allowPositionals: true
	});
	const thresholdRaw = values.threshold ?? values.min;
	const threshold = thresholdRaw ? parseInt(thresholdRaw, RADIX_DECIMAL) : void 0;
	const topLimit = parseInt(values.top, RADIX_DECIMAL) || DEFAULT_TOP_LIMIT;
	return {
		run: Boolean(values.run),
		check: Boolean(values.check),
		threshold: Number.isNaN(threshold) ? void 0 : threshold,
		dirFilter: values.dir,
		fileFilter: values.file,
		belowOnly: Boolean(values.below),
		zeroOnly: Boolean(values.zero),
		untrackedOnly: Boolean(values.untracked),
		hotspotsOnly: Boolean(values.hotspots),
		topLimit,
		jsonOutput: Boolean(values.json),
		help: Boolean(values.help)
	};
}
function printUsage() {
	console.log(`
${styleText("bold", "AUDITOR TEST COVERAGE CLI")} - v${AUDITOR_VERSION}
Herramienta canónica de inspección y análisis de cobertura de pruebas.

${styleText("bold", "USO:")}
  auditor-test-coverage [OPCIONES]
  npm run auditor:test-coverage [-- OPCIONES]

${styleText("bold", "OPCIONES:")}
  --run              Ejecuta los tests con cobertura antes de analizar ('npm test -- --coverage').
  --check            Verifica que la cobertura cumpla el umbral; sale con código 1 si falla.
  --threshold=<N>    Umbral objetivo de cobertura (porcentaje 0-100, ej: 80). Alias: --min=<N>.
  --dir=<ruta>       Filtra archivos y métricas por prefijo de directorio (ej: src/core).
  --file=<ruta>      Muestra el detalle y líneas descubiertas de un archivo específico.
  --below            Muestra únicamente archivos cuya cobertura esté por debajo del umbral.
  --zero             Muestra únicamente archivos con 0% de cobertura.
  --untracked        Muestra archivos presentes en disco que no fueron rastreados por los tests.
  --hotspots         Muestra correlación entre complejidad ciclomática/cognitiva y falta de tests.
  --top=<N>          Límite de filas en listados detallados (por defecto: 20).
  --json             Emite el reporte completo en formato JSON para integración continua.
  -h, --help         Muestra este mensaje de ayuda.
`);
}
function loadFallowComplexityMap(projectRoot) {
	const complexityMap = /* @__PURE__ */ new Map();
	try {
		const fallowBin = resolvePackageBin("fallow", { projectRoot });
		if (!fallowBin) return complexityMap;
		const cmd = `node "${fallowBin}" health --format json`;
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
		const data = parseJsonObjectOutput(stdout);
		if (data?.findings && Array.isArray(data.findings)) for (const finding of data.findings) {
			if (!finding.path) continue;
			const relPath = toPosixRelative(projectRoot, finding.path);
			const cog = finding.cognitive ?? 0;
			const cyc = finding.cyclomatic ?? 0;
			const current = complexityMap.get(relPath) ?? 0;
			complexityMap.set(relPath, current + Math.max(cog, cyc));
		}
	} catch {}
	return complexityMap;
}
function formatPct(pct) {
	if (pct >= 80) return styleText("green", `${pct}%`);
	if (pct >= 50) return styleText("yellow", `${pct}%`);
	if (pct > 0) return styleText("red", `${pct}%`);
	return styleText("dim", "0%");
}
function renderDirectoriesTable(directories, overall) {
	const columns = [
		{
			header: "DIRECTORIO / SUBSISTEMA",
			width: DIR_COL_WIDTH,
			align: "left",
			key: "dir"
		},
		{
			header: "ARCH",
			width: ARCH_COL_WIDTH,
			align: "right",
			key: "files"
		},
		{
			header: "STMTS %",
			width: STATS_COL_WIDTH,
			align: "right",
			key: "stmts"
		},
		{
			header: "RAMAS %",
			width: STATS_COL_WIDTH,
			align: "right",
			key: "branches"
		},
		{
			header: "FUNCS %",
			width: STATS_COL_WIDTH,
			align: "right",
			key: "funcs"
		},
		{
			header: "LÍNEAS %",
			width: STATS_COL_WIDTH,
			align: "right",
			key: "lines"
		}
	];
	const rows = directories.map((d) => ({
		dir: d.directory.length > DIR_COL_WIDTH ? d.directory.slice(0, 23) + "…" : d.directory,
		files: String(d.fileCount),
		stmts: formatPct(d.statements.pct),
		branches: formatPct(d.branches.pct),
		funcs: formatPct(d.functions.pct),
		lines: formatPct(d.lines.pct)
	}));
	const totalFiles = directories.reduce((acc, d) => acc + d.fileCount, 0);
	const footerRow = {
		dir: styleText("bold", "TOTAL CONSOLIDADO"),
		files: styleText("bold", String(totalFiles)),
		stmts: formatPct(overall.statements.pct),
		branches: formatPct(overall.branches.pct),
		funcs: formatPct(overall.functions.pct),
		lines: formatPct(overall.lines.pct)
	};
	return renderBoxTable(columns, rows, {
		footerRows: [footerRow],
		emptyMessage: "No se encontraron directorios con datos de cobertura."
	});
}
function renderFilesTable(files, topLimit) {
	const columns = [
		{
			header: "ARCHIVO",
			width: FILE_COL_WIDTH,
			align: "left",
			key: "file"
		},
		{
			header: "STMTS",
			width: STATS_SHORT_WIDTH,
			align: "right",
			key: "stmts"
		},
		{
			header: "LÍNEAS",
			width: STATS_SHORT_WIDTH,
			align: "right",
			key: "lines"
		},
		{
			header: "DESCUBIERTAS",
			width: UNCOVERED_COL_WIDTH,
			align: "left",
			key: "uncovered"
		}
	];
	const rows = files.slice(0, topLimit).map((f) => {
		const uncovStr = f.uncoveredLines.join(", ");
		const displayUncov = uncovStr.length > UNCOVERED_COL_WIDTH ? `${uncovStr.slice(0, UNCOVERED_MAX_CHARS)}...` : uncovStr;
		return {
			file: f.relPath.length > FILE_COL_WIDTH ? `...${f.relPath.slice(-33)}` : f.relPath,
			stmts: formatPct(f.statements.pct),
			lines: formatPct(f.lines.pct),
			uncovered: displayUncov || styleText("green", "ninguna")
		};
	});
	return renderBoxTable(columns, rows, { emptyMessage: "Ningún archivo coincide con el filtro especificado." });
}
function renderHotspotsTable(hotspots, topLimit) {
	const columns = [
		{
			header: "ARCHIVO",
			width: HOTSPOT_FILE_WIDTH,
			align: "left",
			key: "file"
		},
		{
			header: "COMPLEJIDAD",
			width: COMPLEXITY_COL_WIDTH,
			align: "right",
			key: "complexity"
		},
		{
			header: "STMTS %",
			width: STATS_COL_WIDTH,
			align: "right",
			key: "stmts"
		},
		{
			header: "RIESGO",
			width: STATS_COL_WIDTH,
			align: "right",
			key: "risk"
		}
	];
	const rows = hotspots.slice(0, topLimit).map((h) => {
		return {
			file: h.relPath.length > HOTSPOT_FILE_WIDTH ? `...${h.relPath.slice(-29)}` : h.relPath,
			complexity: styleText("yellow", String(h.complexity)),
			stmts: styleText("red", `${h.statementsPct}%`),
			risk: styleText(["bold", "red"], String(h.riskScore))
		};
	});
	return renderBoxTable(columns, rows, { emptyMessage: "No se detectaron hotspots de complejidad sin testear." });
}
function renderUntrackedTable(untracked, topLimit) {
	const columns = [{
		header: "ARCHIVO NO RASTREADO EN TESTS",
		width: UNTRACKED_FILE_WIDTH,
		align: "left",
		key: "file"
	}, {
		header: "ESTADO",
		width: BADGE_COL_WIDTH,
		align: "center",
		key: "status"
	}];
	const rows = untracked.slice(0, topLimit).map((file) => {
		return {
			file: file.length > UNTRACKED_FILE_WIDTH ? `...${file.slice(-53)}` : file,
			status: styleText(["bold", "red"], "SIN TEST")
		};
	});
	return renderBoxTable(columns, rows, { emptyMessage: "¡Excelente! Todos los archivos fuente son ejecutados por los tests." });
}
function renderFileDrillDown(report, fileFilter) {
	const targetFile = fileFilter.replace(/^\.\//, "");
	const found = report.files.find((f) => f.relPath === targetFile || f.relPath.endsWith(targetFile));
	if (!found) {
		console.log(styleText("yellow", `\n⚠️  No se encontró cobertura para el archivo '${fileFilter}'.`));
		return false;
	}
	console.log(styleText("bold", `\n📄 DETALLE DE ARCHIVO: ${found.relPath}\n`));
	console.log(`  • Statements: ${found.statements.pct}% (${found.statements.covered}/${found.statements.total})`);
	console.log(`  • Ramas:      ${found.branches.pct}% (${found.branches.covered}/${found.branches.total})`);
	console.log(`  • Funciones:  ${found.functions.pct}% (${found.functions.covered}/${found.functions.total})`);
	console.log(`  • Líneas:     ${found.lines.pct}% (${found.lines.covered}/${found.lines.total})`);
	if (found.uncoveredLines.length > 0) console.log(styleText("red", `\n  ❌ Líneas sin testear: ${found.uncoveredLines.join(", ")}`));
	else console.log(styleText("green", `\n  ✨ 100% de las líneas cubiertas por pruebas.`));
	console.log();
	return true;
}
function renderUntrackedView(untrackedFiles, topLimit) {
	console.log(styleText("bold", `\n📦 ARCHIVOS EN DISCO NO RASTREADOS POR TESTS (${untrackedFiles.length}):\n`));
	console.log(renderUntrackedTable(untrackedFiles, topLimit));
	if (untrackedFiles.length > topLimit) console.log(styleText("dim", `   ... y ${untrackedFiles.length - topLimit} archivos más (usa --top=${untrackedFiles.length} para ver todos).`));
	console.log();
}
function renderHotspotsView(hotspots, topLimit) {
	console.log(styleText("bold", `\n🔥 HOTSPOTS DE RIESGO (Complejidad Fallow + Baja Cobertura) (${hotspots.length}):\n`));
	console.log(renderHotspotsTable(hotspots, topLimit));
	if (hotspots.length > topLimit) console.log(styleText("dim", `   ... y ${hotspots.length - topLimit} hotspots más.`));
	console.log();
}
function renderFilteredFilesView(files, args, effectiveThreshold) {
	let filtered = files;
	if (args.zeroOnly) {
		filtered = filtered.filter((f) => f.statements.pct === 0);
		console.log(styleText("bold", `\n⚪ ARCHIVOS CON 0% DE COBERTURA (${filtered.length}):\n`));
	} else {
		filtered = filtered.filter((f) => f.statements.pct < effectiveThreshold);
		console.log(styleText("bold", `\n⚠️ ARCHIVOS POR DEBAJO DEL UMBRAL (${effectiveThreshold}%) (${filtered.length}):\n`));
	}
	if (args.dirFilter) filtered = filtered.filter((f) => f.relPath.startsWith(args.dirFilter));
	console.log(renderFilesTable(filtered, args.topLimit));
	if (filtered.length > args.topLimit) console.log(styleText("dim", `   ... y ${filtered.length - args.topLimit} archivos más (usa --top=${filtered.length} para ver todos).`));
	console.log();
}
function renderGlobalCoverageSummary(report, args, effectiveThreshold) {
	const o = report.overall;
	const b = report.buckets;
	console.log(`
${styleText("bold", "📊 MÉTRICAS GLOBALES DE COBERTURA:")}
  Statements: ${o.statements.pct >= effectiveThreshold ? styleText("green", `${o.statements.pct}%`) : styleText("red", `${o.statements.pct}%`)} (${o.statements.covered}/${o.statements.total})
  Ramas:      ${o.branches.pct >= effectiveThreshold ? styleText("green", `${o.branches.pct}%`) : styleText("yellow", `${o.branches.pct}%`)} (${o.branches.covered}/${o.branches.total})
  Funciones:  ${o.functions.pct >= effectiveThreshold ? styleText("green", `${o.functions.pct}%`) : styleText("yellow", `${o.functions.pct}%`)} (${o.functions.covered}/${o.functions.total})
  Líneas:     ${o.lines.pct >= effectiveThreshold ? styleText("green", `${o.lines.pct}%`) : styleText("red", `${o.lines.pct}%`)} (${o.lines.covered}/${o.lines.total})

${styleText("bold", "🎯 DISTRIBUCIÓN DE ARCHIVOS:")}
  🟢 Excelentes (>= ${effectiveThreshold}%): ${styleText("green", String(b.excellent))}
  🟡 Aceptables (50-${effectiveThreshold - 1}%): ${styleText("yellow", String(b.acceptable))}
  🔴 Bajas (< 50%):       ${styleText("red", String(b.low))}
  ⚪ Sin tests (0%):      ${styleText("dim", String(b.untested))}
  ⚠️  No rastreados:      ${b.untracked > 0 ? styleText(["bold", "yellow"], String(b.untracked)) : styleText("green", "0")}
`);
	let dirs = report.directories;
	if (args.dirFilter) dirs = dirs.filter((d) => d.directory.startsWith(args.dirFilter));
	console.log(styleText("bold", "🗺️  DESGLOSE POR DIRECTORIO / SUBSISTEMA:\n"));
	console.log(renderDirectoriesTable(dirs, report.overall));
	console.log();
	if (report.hotspots && report.hotspots.length > 0) {
		const topHotspot = report.hotspots[0];
		console.log(styleText("yellow", `💡 Sugerencia: Hay ${report.hotspots.length} archivo(s) con alta complejidad y baja cobertura.`));
		console.log(styleText("dim", `   Ejecuta 'npm run auditor:test-coverage -- --hotspots' para ver la lista de riesgo (Top: ${topHotspot.relPath}).\n`));
	}
}
function runTestRunnerIfRequested(shouldRun, runCommand, projectRoot) {
	if (!shouldRun) return;
	console.log(styleText("cyan", `\n🚀 Ejecutando pruebas con cobertura: '${runCommand}'...\n`));
	const res = spawnSync(runCommand, {
		cwd: projectRoot,
		stdio: "inherit",
		shell: true
	});
	if (res.status !== 0) {
		console.error(styleText("red", `\n💥 La ejecución de pruebas terminó con código ${res.status}.`));
		process.exit(res.status ?? 1);
	}
}
function loadCoveragePayloadOrExit(projectRoot, configPath) {
	const coverageFile = resolveCoverageFile(projectRoot, configPath);
	if (!coverageFile) {
		console.error(styleText("red", `\n❌ No se encontró el archivo de cobertura en '${configPath}'.`));
		console.log(styleText("yellow", "   Ejecuta tus pruebas con cobertura primero usando:"));
		console.log(styleText("bold", `   npm run auditor:test-coverage -- --run\n`));
		process.exit(1);
	}
	return JSON.parse(fs.readFileSync(coverageFile, "utf8"));
}
function renderSpecificCoverageView(report, args, effectiveThreshold) {
	if (args.fileFilter) {
		renderFileDrillDown(report, args.fileFilter);
		return true;
	}
	if (args.untrackedOnly) {
		renderUntrackedView(report.untrackedFiles, args.topLimit);
		return true;
	}
	if (args.hotspotsOnly) {
		renderHotspotsView(report.hotspots ?? [], args.topLimit);
		return true;
	}
	if (args.belowOnly || args.zeroOnly) {
		renderFilteredFilesView(report.files, args, effectiveThreshold);
		return true;
	}
	return false;
}
function evaluateCoverageQualityGate(report, effectiveThreshold) {
	if (report.overall.statements.pct < effectiveThreshold) {
		console.error(styleText(["bold", "red"], `❌ FALLO DE CALIDAD: Cobertura global de statements (${report.overall.statements.pct}%) inferior al umbral configurado (${effectiveThreshold}%).`));
		process.exit(1);
	}
	console.log(styleText(["bold", "green"], `✅ PUERTA DE CALIDAD APROBADA: Cobertura (${report.overall.statements.pct}%) >= ${effectiveThreshold}%.`));
}
async function runTestCoverageReport() {
	const args = parseCommandLineArgs();
	if (args.help) {
		printUsage();
		return;
	}
	const projectRoot = process.cwd();
	const config = getAuditConfig();
	const resolvedConfig = buildTestCoverageConfig(config.testCoverage);
	const effectiveThreshold = args.threshold ?? resolvedConfig.threshold;
	runTestRunnerIfRequested(args.run, resolvedConfig.runCommand, projectRoot);
	const rawJson = loadCoveragePayloadOrExit(projectRoot, resolvedConfig.path);
	const complexityMap = args.hotspotsOnly || !args.jsonOutput ? loadFallowComplexityMap(projectRoot) : void 0;
	const report = analyzeTestCoverage(rawJson, projectRoot, {
		...resolvedConfig,
		threshold: effectiveThreshold
	}, complexityMap);
	if (args.jsonOutput) {
		console.log(JSON.stringify(report, null, 2));
		if (args.check && report.overall.statements.pct < effectiveThreshold) process.exit(1);
		return;
	}
	console.log(renderBanner("REPORTE DE COBERTURA DE PRUEBAS", `v${AUDITOR_VERSION}  |  Vitest & Istanbul Analytics`));
	if (!renderSpecificCoverageView(report, args, effectiveThreshold)) renderGlobalCoverageSummary(report, args, effectiveThreshold);
	if (args.check) evaluateCoverageQualityGate(report, effectiveThreshold);
}
if (isMainModule(import.meta.url)) runTestCoverageReport().catch((err) => {
	console.error(styleText("red", `\n💥 Error en auditor-test-coverage: ${err.message}`));
	process.exit(1);
});
//#endregion
export { runTestCoverageReport };
