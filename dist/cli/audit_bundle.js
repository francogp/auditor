#!/usr/bin/env -S node --experimental-strip-types
import { assertAuditConfigComplete } from "../core/auditConfigValidators.js";
import { getAuditConfig, loadAuditConfig } from "../core/auditConfigLoader.js";
import { normalizePosixPath } from "../core/reportUtils.js";
import "../core/auditConfig.js";
import "../core/auditContract.js";
import { formatStatusBadge, renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { isMainModule } from "./cliUtils.js";
import "../core/safePath.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import zlib from "node:zlib";
//#region src/cli/audit_bundle.ts
/**
* src/cli/audit_bundle.ts
*
* PRODUCTION BUNDLE & CHUNK BOTTLENECK AUDITOR (Node.js 26+ Native)
*
* Audits production bundle artifacts and module compositions:
*   1. Inspects compiled chunks in `dist/` or `dist/assets/` against architectural budgets
*      configured in `audit.config.ts` (bundle.budgets).
*   2. Computes exact file size and native gzip compression metrics via `node:zlib`.
*   3. Enforces client chunk budgets and detects oversized bundle bottlenecks.
*   4. Outputs standardized 80-column Box-Drawing tables via `unifiedTheme`.
*/
enableCompileCache();
const BYTES_PER_KB = 1024;
const DEFAULT_HEAVY_CHUNK_THRESHOLD = 10 * BYTES_PER_KB;
const DEFAULT_UNBUDGETED_CHUNK_LIMIT = 500 * BYTES_PER_KB;
const DEFAULT_TOP_MODULES_LIMIT = 15;
const DEFAULT_DUPLICATE_MODULE_THRESHOLD_BYTES = 500 * BYTES_PER_KB;
function parseVisualizerData(content) {
	const match = content.match(/window\.data\s*=\s*(\{.*?\});<\/script>/s) || content.match(/const\s+data\s*=\s*(\{.*?\});/s);
	if (!match || !match[1]) return null;
	try {
		return JSON.parse(match[1]);
	} catch {
		return null;
	}
}
function aggregateModuleSizes(data, heavyChunkThreshold = DEFAULT_HEAVY_CHUNK_THRESHOLD) {
	const metaMap = new Map(Object.entries(data.nodeMetas || {}));
	const moduleMap = /* @__PURE__ */ new Map();
	for (const part of Object.values(data.nodeParts || {})) {
		const meta = metaMap.get(part.metaUid);
		if (!meta || part.renderedLength <= 0) continue;
		const existing = moduleMap.get(meta.id) || {
			rendered: 0,
			gzip: 0,
			heavyChunkCount: 0,
			count: 0
		};
		existing.rendered += part.renderedLength;
		existing.gzip += part.gzipLength;
		existing.count += 1;
		if (part.renderedLength > heavyChunkThreshold) existing.heavyChunkCount += 1;
		moduleMap.set(meta.id, existing);
	}
	return Array.from(moduleMap.entries()).map(([id, s]) => ({
		id,
		...s
	})).sort((a, b) => b.rendered - a.rendered);
}
function auditSingleChunk(filename, fullPath, budgets, unbudgetedLimit = DEFAULT_UNBUDGETED_CHUNK_LIMIT) {
	const sizeBytes = fs.statSync(fullPath).size;
	const sizeKB = (sizeBytes / BYTES_PER_KB).toFixed(1);
	let gzipBytes;
	let gzipKB;
	let compressionRatio;
	try {
		const content = fs.readFileSync(fullPath);
		gzipBytes = zlib.gzipSync(content).length;
		gzipKB = (gzipBytes / BYTES_PER_KB).toFixed(1);
		compressionRatio = sizeBytes > 0 ? `${((1 - gzipBytes / sizeBytes) * 100).toFixed(1)}%` : "0.0%";
	} catch {}
	for (const budget of budgets) if (budget.prefix ? filename.startsWith(budget.prefix) : budget.matcher ? filename.includes(budget.matcher) || filename.startsWith(budget.matcher) : filename.startsWith(budget.name)) {
		if (sizeBytes > budget.limitBytes) return {
			filename,
			sizeBytes,
			sizeKB,
			gzipBytes,
			gzipKB,
			compressionRatio,
			status: "failed",
			budgetName: budget.name,
			budgetLimitBytes: budget.limitBytes,
			note: `Supera presupuesto de ${(budget.limitBytes / 1024).toFixed(0)} KB`
		};
		return {
			filename,
			sizeBytes,
			sizeKB,
			gzipBytes,
			gzipKB,
			compressionRatio,
			status: "passed",
			budgetName: budget.name,
			budgetLimitBytes: budget.limitBytes,
			note: `Presupuesto: ${(budget.limitBytes / 1024).toFixed(0)} KB`
		};
	}
	if (sizeBytes > unbudgetedLimit) return {
		filename,
		sizeBytes,
		sizeKB,
		gzipBytes,
		gzipKB,
		compressionRatio,
		status: "failed",
		note: `Chunk no presupuestado excede límite ${(unbudgetedLimit / 1024).toFixed(0)} KB`
	};
	return {
		filename,
		sizeBytes,
		sizeKB,
		gzipBytes,
		gzipKB,
		compressionRatio,
		status: "passed",
		note: "Dentro de límite general"
	};
}
function auditVisualizerStats(statsFilePath, dupeLimitBytes, topLimit) {
	if (!fs.existsSync(statsFilePath)) return {
		topModules: [],
		duplicateViolations: [],
		dupeErrors: 0
	};
	const visualizerData = parseVisualizerData(fs.readFileSync(statsFilePath, "utf8"));
	if (!visualizerData) return {
		topModules: [],
		duplicateViolations: [],
		dupeErrors: 0
	};
	const topModules = aggregateModuleSizes(visualizerData);
	const duplicateViolations = [];
	let dupeErrors = 0;
	for (const m of topModules.slice(0, topLimit)) if (m.heavyChunkCount > 1 && m.rendered > dupeLimitBytes) {
		dupeErrors++;
		duplicateViolations.push(`Módulo duplicado en ${m.heavyChunkCount} chunks (${(m.rendered / 1024).toFixed(1)} KB): ${m.id}`);
	}
	return {
		topModules,
		duplicateViolations,
		dupeErrors
	};
}
function discoverCompiledChunks(targetDir) {
	if (!fs.existsSync(targetDir)) return [];
	try {
		const entries = fs.readdirSync(targetDir, {
			withFileTypes: true,
			recursive: true
		});
		const chunks = [];
		for (const entry of entries) {
			if (!entry.isFile()) continue;
			const name = entry.name;
			if ((name.endsWith(".js") || name.endsWith(".mjs") || name.endsWith(".cjs")) && !name.endsWith(".d.ts") && !name.endsWith(".map") && !name.endsWith(".gz") && !name.endsWith(".br")) {
				const parentPath = entry.parentPath ?? targetDir;
				const fullPath = path.join(parentPath, name);
				const relName = normalizePosixPath(path.relative(targetDir, fullPath));
				chunks.push({
					filename: relName,
					fullPath
				});
			}
		}
		return chunks;
	} catch {
		return [];
	}
}
function auditCompiledChunks(distDir, exemptPrefixes, budgets) {
	const discovered = discoverCompiledChunks(distDir);
	const chunkResults = [];
	let chunkErrors = 0;
	let chunkWarnings = 0;
	for (const chunk of discovered) {
		if (exemptPrefixes.some((prefix) => chunk.filename.startsWith(prefix))) continue;
		const res = auditSingleChunk(chunk.filename, chunk.fullPath, budgets);
		chunkResults.push(res);
		if (res.status === "failed") chunkErrors++;
		else if (res.status === "warning") chunkWarnings++;
	}
	return {
		chunkResults,
		chunkErrors,
		chunkWarnings
	};
}
function resolveDistDir(projectRoot, configuredDistDir) {
	const configured = configuredDistDir ?? "dist/assets";
	const resolved = path.resolve(projectRoot, configured);
	if (fs.existsSync(resolved)) return resolved;
	const fallbackDist = path.resolve(projectRoot, "dist");
	if (fs.existsSync(fallbackDist)) return fallbackDist;
	return resolved;
}
async function runBundleAudit(projectRoot = process.cwd()) {
	await loadAuditConfig(projectRoot);
	const bundleConfig = getAuditConfig().bundle;
	if (bundleConfig?.enabled === false) return {
		success: true,
		totalErrors: 0,
		totalWarnings: 0,
		topModules: [],
		chunkResults: [],
		duplicateViolations: []
	};
	const statsFilePath = path.resolve(projectRoot, bundleConfig?.statsFile ?? "scratch/bundle_stats.html");
	const distDir = resolveDistDir(projectRoot, bundleConfig?.distDir);
	const { topModules, duplicateViolations, dupeErrors } = auditVisualizerStats(statsFilePath, bundleConfig?.duplicateModuleThresholdBytes ?? 512e3, bundleConfig?.topModulesLimit ?? 15);
	const { chunkResults, chunkErrors, chunkWarnings } = auditCompiledChunks(distDir, bundleConfig?.exemptChunkPrefixes ?? [], bundleConfig?.budgets ?? []);
	let totalErrors = dupeErrors + chunkErrors;
	const totalWarnings = chunkWarnings;
	if (!(fs.existsSync(statsFilePath) || chunkResults.length > 0 || fs.existsSync(distDir))) totalErrors++;
	return {
		success: totalErrors === 0,
		totalErrors,
		totalWarnings,
		topModules,
		chunkResults,
		duplicateViolations
	};
}
async function executeCli() {
	const projectRoot = process.cwd();
	console.log(renderBanner("AUDITOR DE BUNDLE Y CHUNKS DE PRODUCCIÓN", "FrancoGP Auditor Framework"));
	await loadAuditConfig(projectRoot);
	const config = getAuditConfig();
	assertAuditConfigComplete(config);
	const bundleConfig = config.bundle;
	if (bundleConfig?.enabled === false) {
		console.log("\nℹ️ Auditoría de bundle omitida: deshabilitada explícitamente en audit.config.ts (bundle.enabled: false).\n");
		return;
	}
	const statsFilePath = path.resolve(projectRoot, bundleConfig?.statsFile ?? "scratch/bundle_stats.html");
	const distDir = resolveDistDir(projectRoot, bundleConfig?.distDir);
	if (!fs.existsSync(statsFilePath) && !fs.existsSync(distDir)) {
		console.error("\n❌ Error: No se encontraron artefactos de build de producción ni directorio dist.");
		console.error(`   - Directorio de distribución esperado: ${path.relative(projectRoot, distDir)}`);
		console.error("\nEjecuta primero: npm run build o vp pack\n");
		process.exit(1);
	}
	const result = await runBundleAudit(projectRoot);
	if (result.topModules.length > 0) {
		const topLimit = bundleConfig?.topModulesLimit ?? 15;
		const sample = result.topModules.slice(0, topLimit);
		const moduleColumns = [
			{
				header: "#",
				width: 4,
				align: "right",
				key: "idx"
			},
			{
				header: "TAMAÑO",
				width: 12,
				align: "right",
				key: "size"
			},
			{
				header: "GZIP",
				width: 12,
				align: "right",
				key: "gzip"
			},
			{
				header: "MÓDULO FUENTE",
				width: 44,
				align: "left",
				key: "id"
			}
		];
		const moduleRows = sample.map((m, idx) => {
			const dupeTag = m.heavyChunkCount > 1 ? ` [x${m.heavyChunkCount}]` : "";
			return {
				idx: (idx + 1).toString(),
				size: `${(m.rendered / 1024).toFixed(1)} KB`,
				gzip: `${(m.gzip / 1024).toFixed(1)} KB`,
				id: `${m.id}${dupeTag}`
			};
		});
		console.log("\n📦 Top Módulos más pesados en el Bundle:");
		console.log(renderBoxTable(moduleColumns, moduleRows));
	}
	if (result.chunkResults.length > 0) {
		const chunkColumns = [
			{
				header: "ESTADO",
				width: 8,
				align: "center",
				key: "status"
			},
			{
				header: "TAMAÑO",
				width: 10,
				align: "right",
				key: "size"
			},
			{
				header: "GZIP",
				width: 10,
				align: "right",
				key: "gzip"
			},
			{
				header: "COMPR.",
				width: 8,
				align: "right",
				key: "comp"
			},
			{
				header: "CHUNK / ARTEFACTO",
				width: 24,
				align: "left",
				key: "filename"
			},
			{
				header: "PRESUPUESTO",
				width: 14,
				align: "left",
				key: "note"
			}
		];
		const chunkRows = result.chunkResults.map((c) => ({
			status: formatStatusBadge(c.status),
			size: `${c.sizeKB} KB`,
			gzip: c.gzipKB ? `${c.gzipKB} KB` : "N/A",
			comp: c.compressionRatio ?? "N/A",
			filename: c.filename,
			note: c.note
		}));
		console.log("\n📊 Estado de Chunks JS de Producción (Compresión Nativa Gzip):");
		console.log(renderBoxTable(chunkColumns, chunkRows));
	}
	if (result.duplicateViolations.length > 0) {
		console.log("\n🚨 Violaciones Críticas de Módulos Duplicados:");
		for (const v of result.duplicateViolations) console.error(`  ❌ ${v}`);
	}
	const scratchDir = path.resolve(projectRoot, "scratch/audits/architecture");
	try {
		fs.mkdirSync(scratchDir, { recursive: true });
		fs.writeFileSync(path.join(scratchDir, "latest_audit_bundle.json"), JSON.stringify(result, null, 2), "utf8");
	} catch {}
	if (!result.success) {
		console.error(`\n❌ Falló la auditoría de bundle: ${result.totalErrors} errores detectados.\n`);
		process.exit(1);
	}
	console.log("\n✨ Auditoría de bundle aprobada: Chunks y presupuestos arquitectónicos satisfechos.\n");
	process.exit(0);
}
if (isMainModule(import.meta.url)) await executeCli();
//#endregion
export { BYTES_PER_KB, DEFAULT_DUPLICATE_MODULE_THRESHOLD_BYTES, DEFAULT_HEAVY_CHUNK_THRESHOLD, DEFAULT_TOP_MODULES_LIMIT, DEFAULT_UNBUDGETED_CHUNK_LIMIT, aggregateModuleSizes, auditSingleChunk, discoverCompiledChunks, executeCli, parseVisualizerData, resolveDistDir, runBundleAudit };
