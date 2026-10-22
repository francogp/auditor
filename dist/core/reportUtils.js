import { safeJsonParse } from "./safeUtils.js";
import path from "node:path";
import fs from "node:fs/promises";
import { styleText } from "node:util";
//#region src/core/reportUtils.ts
/**
* @file reportUtils.ts
* @description Shared utilities for report formatting and validation script output.
* Avoids duplication of report file generation logic.
*/
function printConsoleHeader(title) {
	console.log(styleText("bold", `\n--- 🛡️  ${title} ---`));
}
const MAX_REPORT_SAMPLE_ITEMS = 30;
function printConsoleSummary(summary, verbose = true) {
	console.log(`\n════════════════════════════════════`);
	console.log(`    ${summary.title.toUpperCase()}`);
	console.log(`════════════════════════════════════`);
	for (const [key, value] of Object.entries(summary.scannedMetrics)) console.log(`📦 ${key}: ${value}`);
	console.log(`════════════════════════════════════\n`);
	if (!verbose) console.log(styleText("cyan", `\n[INFO] Modo resumen activo: ${summary.errors.length} errores, ${summary.warnings.length} advertencias.`));
	else {
		if (summary.warnings.length) {
			console.log(styleText("yellow", `⚠️  WARNINGS (${summary.warnings.length}):`));
			const limit = 30;
			summary.warnings.slice(0, limit).forEach((w) => console.log(`   ${w}`));
			if (summary.warnings.length > limit) console.log(styleText("cyan", `   ... and ${summary.warnings.length - limit} more warnings (use -o to see all)`));
			console.log("");
		}
		if (summary.errors.length) {
			console.log(styleText("red", `❌ ERRORS (${summary.errors.length}):`));
			const limit = 30;
			summary.errors.slice(0, limit).forEach((e) => console.log(`   ${e}`));
			if (summary.errors.length > limit) console.log(styleText("cyan", `   ... and ${summary.errors.length - limit} more errors (use -o to see all)`));
			console.log("\n" + styleText("red", "Fix these errors to ensure data integrity."));
		} else console.log(styleText("green", "✅ All components passed validation successfully!"));
	}
}
async function writeReportFile(outputPathArg, summary) {
	const outputPath = path.resolve(process.cwd(), outputPathArg);
	const metricLines = Object.entries(summary.scannedMetrics).map(([key, val]) => `${key}: ${val}`);
	const lines = [
		`--- ${summary.title.toUpperCase()} ---`,
		...metricLines,
		`\nErrors (${summary.errors.length}):`,
		...summary.errors.map((e) => `  - ${e}`),
		`\nWarnings (${summary.warnings.length}):`,
		...summary.warnings.map((w) => `  - ${w}`)
	];
	await fs.writeFile(outputPath, lines.join("\n"), "utf-8");
	console.log(styleText("cyan", `\n✨ Reporte completo escrito en: ${outputPathArg}`));
}
/**
* Parses raw JSON output containing an array, stripping Node.js permission and runtime noise.
*/
function parseJsonArrayOutput(input, options) {
	if (!input) return [];
	if (Array.isArray(input)) return input;
	if (typeof input !== "string") return [];
	const trimmed = input.split("\n").filter((line) => !line.startsWith("(node:") && !line.startsWith("(Use `node") && !line.includes("SecurityWarning") && !line.startsWith("[PERM") && !line.startsWith("npm notice")).join("\n").trim();
	if (!trimmed) return [];
	const startIdx = trimmed.indexOf("[");
	const endIdx = trimmed.lastIndexOf("]");
	if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return [];
	try {
		return JSON.parse(trimmed.substring(startIdx, endIdx + 1));
	} catch (err) {
		if (options?.throwOnError) {
			const toolSuffix = options.toolName ? ` de ${options.toolName}` : "";
			throw new Error(`Error al procesar salida JSON${toolSuffix}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
		}
		return [];
	}
}
/**
* Normalizes any absolute or relative path to a clean POSIX relative path from CWD.
*/
function normalizePosixPath(filePath, cwd = process.cwd()) {
	if (!filePath) return "";
	const posix = (path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath).split(path.sep).join(path.posix.sep);
	return posix.startsWith("./") ? posix.slice(2) : posix;
}
/**
* Evaluates whether a relative file path matches any configured exemption pattern or prefix.
* Supports exact matches, sub-directory prefixes, and glob wildcards (e.g. '/**' or '/*').
*/
function isPathExempt(relPath, exemptPaths) {
	if (!exemptPaths || exemptPaths.length === 0) return false;
	const norm = normalizePosixPath(relPath);
	for (const p of exemptPaths) {
		const normP = normalizePosixPath(p);
		if (p.includes("*") || p.includes("?")) {
			if (path.posix.matchesGlob(norm, normP) || path.posix.matchesGlob(norm, `**/${normP}`)) return true;
		}
		let cleanPrefix = normP;
		if (cleanPrefix.endsWith("/**")) cleanPrefix = cleanPrefix.slice(0, -3);
		else if (cleanPrefix.endsWith("/*")) cleanPrefix = cleanPrefix.slice(0, -2);
		else if (cleanPrefix.endsWith("/")) cleanPrefix = cleanPrefix.slice(0, -1);
		if (norm === cleanPrefix || norm.startsWith(`${cleanPrefix}/`) || norm.includes(`/${cleanPrefix}/`) || norm.endsWith(`/${cleanPrefix}`)) return true;
	}
	return false;
}
/**
* Parses raw JSON output containing an object, handling stdout strings or execSync error objects.
*/
function parseJsonObjectOutput(input) {
	if (!input) return null;
	let str = "";
	if (typeof input === "string") str = input;
	else if (Buffer.isBuffer(input)) str = input.toString("utf-8");
	else if (typeof input === "object" && input !== null && "stdout" in input) {
		const rawStdout = input.stdout;
		if (typeof rawStdout === "string") str = rawStdout;
		else if (Buffer.isBuffer(rawStdout)) str = rawStdout.toString("utf-8");
	}
	const jsonStart = str.indexOf("{");
	const jsonEnd = str.lastIndexOf("}");
	if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) return null;
	try {
		return JSON.parse(str.substring(jsonStart, jsonEnd + 1));
	} catch {
		return null;
	}
}
/**
* Parses raw JSON output or an array of file reports from standard linters (ESLint, HTML-Validate)
* into canonical AuditFindings, elevating both warnings and errors to severity: 'error' (Zero-Warning Policy).
*/
function parseLintResultsToFindings(input, options) {
	const findings = [];
	if (!input) return findings;
	const rawList = parseJsonArrayOutput(input);
	const cwd = options.cwd || process.cwd();
	for (const fileReport of rawList) {
		const cleanFile = normalizePosixPath(fileReport.filePath || "", cwd);
		if (!fileReport.messages || fileReport.messages.length === 0) continue;
		for (const msg of fileReport.messages) {
			if (options.transform) {
				const custom = options.transform(msg, cleanFile, options);
				if (custom) {
					findings.push(custom);
					continue;
				}
			}
			const rule = msg.ruleId || options.defaultRuleName || options.ruleId;
			const text = msg.message || options.defaultMessage || "Lint issue";
			findings.push({
				suiteId: options.suiteId,
				suiteName: options.suiteName,
				ruleId: options.ruleId,
				ruleDescription: options.ruleDescription,
				severity: "error",
				file: cleanFile,
				line: msg.line || 1,
				context: rule,
				message: `[${rule}] ${text}`,
				fixable: Boolean(msg.fix)
			});
		}
	}
	return findings;
}
/**
* Extracts scanned file paths from a JSON report containing an array of objects with `filePath`,
* falling back to finding file paths if JSON parsing fails or output is not an array.
*/
function extractJsonReportFilePaths(rawJson, fallbackFindings) {
	const result = [];
	const parsed = safeJsonParse(rawJson);
	if (Array.isArray(parsed)) {
		for (const item of parsed) if (item && typeof item.filePath === "string") result.push(item.filePath);
		return result;
	}
	if (fallbackFindings) {
		for (const f of fallbackFindings) if (f.file) result.push(f.file);
	}
	return result;
}
//#endregion
export { MAX_REPORT_SAMPLE_ITEMS, extractJsonReportFilePaths, isPathExempt, normalizePosixPath, parseJsonArrayOutput, parseJsonObjectOutput, parseLintResultsToFindings, printConsoleHeader, printConsoleSummary, writeReportFile };
