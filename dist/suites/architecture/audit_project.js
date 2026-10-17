import { AUDITOR_DIR } from "../../core/auditConfigTypes.js";
import { loadAuditConfig } from "../../core/auditConfigLoader.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import "../../core/auditConfig.js";
import { BaseAuditor, CANONICAL_IGNORE_DIRS, createRuleCapabilities, isPathIgnored } from "../../core/auditorBase.js";
import "../../core/safePath.js";
import { matchesRule } from "../../analyzers/auditRuleTypes.js";
import { auditRulesConfig } from "./audit_rules.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs/promises";
import { parseArgs, styleText } from "node:util";
import { execSync } from "node:child_process";
//#region src/suites/architecture/audit_project.ts
/**
* scripts/audit_project.ts
*
* STABLE PROJECT AUDIT ENGINE (Node.js 26+)
*
* Final Safe Version: Context-aware GPU checking.
*/
enableCompileCache();
function printTerminal(msg) {
	console.log(msg);
}
const AUDIT_EXTENSIONS = /* @__PURE__ */ new Set([
	".vue",
	".scss",
	".css",
	".ts",
	".js",
	".md"
]);
async function getFilesToAudit(dir) {
	const files = [];
	const pattern = `**/*{${Array.from(AUDIT_EXTENSIONS).join(",")}}`;
	for await (const entry of fs.glob(pattern, {
		cwd: dir,
		exclude: (p) => isPathIgnored(p)
	})) files.push(path.resolve(dir, entry));
	return files;
}
function prependRequiredImports(block, rules) {
	let result = block;
	for (const rule of rules) {
		const importer = rule.addImport;
		if (importer && result.includes(importer.split(" ")[1]) && !result.includes(importer)) result = importer + "\n" + result;
	}
	return result;
}
function auditVueScriptBlocks(params) {
	let { content } = params;
	let modified = false;
	const scriptBlocks = extractAllBlocks(content, "script");
	const rules = params.candidateRules.filter((r) => !params.allStyleRules.includes(r) && r !== auditRulesConfig.functionCallsInTemplates);
	if (rules.length === 0) return {
		content,
		modified
	};
	for (let i = scriptBlocks.length - 1; i >= 0; i--) {
		const block = scriptBlocks[i];
		let newBlock = runRules(params.filePath, block.content, rules, params.violations, params.fix, block.startLine);
		if (params.fix && newBlock !== block.content) {
			newBlock = prependRequiredImports(newBlock, rules);
			content = content.substring(0, block.startIdx) + newBlock + content.substring(block.endIdx);
			modified = true;
		}
	}
	return {
		content,
		modified
	};
}
function auditVueTemplateBlocks(content, filePath, activeConfigRules, violations) {
	const templateBlocks = extractAllBlocks(content, "template");
	for (const block of templateBlocks) {
		const candidateTemplateRules = [auditRulesConfig.functionCallsInTemplates];
		const templateRules = activeConfigRules ? candidateTemplateRules.filter((r) => activeConfigRules.has(r)) : candidateTemplateRules;
		if (templateRules.length > 0) runRules(filePath, block.content, templateRules, violations, false, block.startLine);
	}
}
function auditLogicFile(params) {
	let { content } = params;
	let modified = false;
	const rules = params.candidateRules.filter((r) => !params.allStyleRules.includes(r) && r !== auditRulesConfig.functionCallsInTemplates);
	if (rules.length > 0) {
		const newBlock = runRules(params.filePath, content, rules, params.violations, params.fix, 0);
		if (params.fix && newBlock !== content) {
			content = prependRequiredImports(newBlock, rules);
			modified = true;
		}
	}
	return {
		content,
		modified
	};
}
function auditVueStyleBlocks(params) {
	let { content } = params;
	let modified = false;
	const styleBlocks = extractAllBlocks(content, "style");
	for (let i = styleBlocks.length - 1; i >= 0; i--) {
		const block = styleBlocks[i];
		const newBlock = runRules(params.filePath, block.content, params.styleRules, params.violations, params.fix, block.startLine);
		if (params.fix && newBlock !== block.content) {
			content = content.substring(0, block.startIdx) + newBlock + content.substring(block.endIdx);
			modified = true;
		}
	}
	return {
		content,
		modified
	};
}
function auditStyleFile(params) {
	let { content } = params;
	let modified = false;
	const newBlock = runRules(params.filePath, content, params.styleRules, params.violations, params.fix, 0);
	if (params.fix && newBlock !== content) {
		content = newBlock;
		modified = true;
	}
	return {
		content,
		modified
	};
}
function auditLogicOrVueScript(params) {
	let { content } = params;
	let modified = false;
	const allConfigRules = Object.values(auditRulesConfig);
	const candidateRules = params.activeConfigRules ? allConfigRules.filter((r) => params.activeConfigRules.has(r)) : allConfigRules;
	if (params.isVue) {
		const scriptRes = auditVueScriptBlocks({
			content,
			filePath: params.filePath,
			candidateRules,
			allStyleRules: params.allStyleRules,
			fix: params.fix,
			violations: params.violations
		});
		content = scriptRes.content;
		if (scriptRes.modified) modified = true;
		auditVueTemplateBlocks(content, params.filePath, params.activeConfigRules, params.violations);
	} else {
		const logicRes = auditLogicFile({
			content,
			filePath: params.filePath,
			candidateRules,
			allStyleRules: params.allStyleRules,
			fix: params.fix,
			violations: params.violations
		});
		content = logicRes.content;
		if (logicRes.modified) modified = true;
	}
	return {
		content,
		modified
	};
}
function auditStylesOrVueStyles(params) {
	let { content } = params;
	let modified = false;
	if (params.isVue) {
		const styleRes = auditVueStyleBlocks({
			content,
			filePath: params.filePath,
			styleRules: params.styleRules,
			fix: params.fix,
			violations: params.violations
		});
		content = styleRes.content;
		if (styleRes.modified) modified = true;
	} else {
		const styleRes = auditStyleFile({
			content,
			filePath: params.filePath,
			styleRules: params.styleRules,
			fix: params.fix,
			violations: params.violations
		});
		content = styleRes.content;
		if (styleRes.modified) modified = true;
	}
	return {
		content,
		modified
	};
}
async function auditFile(filePath, fix, activeConfigRules) {
	const violations = [];
	let content = await fs.readFile(filePath, "utf-8");
	let modified = false;
	const isVue = filePath.endsWith(".vue");
	const isLogic = filePath.endsWith(".ts") || filePath.endsWith(".js");
	const isStyle = filePath.endsWith(".scss") || filePath.endsWith(".css");
	const ALL_STYLE_RULES = [auditRulesConfig.viewport, auditRulesConfig.noSassAtImport];
	const STYLE_RULES = activeConfigRules ? ALL_STYLE_RULES.filter((r) => activeConfigRules.has(r)) : ALL_STYLE_RULES;
	if (isLogic || isVue) {
		const logicRes = auditLogicOrVueScript({
			filePath,
			content,
			isVue,
			activeConfigRules,
			allStyleRules: ALL_STYLE_RULES,
			fix,
			violations
		});
		content = logicRes.content;
		if (logicRes.modified) modified = true;
	}
	if ((isStyle || isVue) && STYLE_RULES.length > 0) {
		const styleRes = auditStylesOrVueStyles({
			filePath,
			content,
			isVue,
			styleRules: STYLE_RULES,
			fix,
			violations
		});
		content = styleRes.content;
		if (styleRes.modified) modified = true;
	}
	if (fix && modified) await fs.writeFile(filePath, content, "utf-8");
	return violations;
}
function isInsideComment(content, index) {
	const lastNewLine = content.lastIndexOf("\n", index);
	if (content.lastIndexOf("//", index) > lastNewLine) return true;
	if (content.lastIndexOf("/*", index) > content.lastIndexOf("*/", index)) return true;
	return false;
}
function createLineLocator(content, offset) {
	let lineBreakIndices = null;
	return (idx) => {
		if (!lineBreakIndices) {
			lineBreakIndices = [];
			for (let i = 0; i < content.length; i++) if (content[i] === "\n") lineBreakIndices.push(i);
		}
		let low = 0;
		let high = lineBreakIndices.length;
		while (low < high) {
			const mid = low + high >> 1;
			if (lineBreakIndices[mid] < idx) low = mid + 1;
			else high = mid;
		}
		return low + 1 + offset;
	};
}
function resolveAuditRuleDescription(rule, defaultText) {
	if (rule.category) return rule.category;
	if (rule.name) return rule.name;
	return defaultText;
}
function collectRuleViolations(rule, content, filePath, getLineNo, violations) {
	const flags = rule.regex.flags.includes("g") ? rule.regex.flags : rule.regex.flags + "g";
	const regex = new RegExp(rule.regex.source, flags);
	let match;
	while ((match = regex.exec(content)) !== null) {
		if (match.index === regex.lastIndex) regex.lastIndex++;
		if (rule.check && !rule.check(content, match, filePath)) continue;
		if (isInsideComment(content, match.index)) continue;
		const lineNo = getLineNo(match.index);
		violations.push({
			file: filePath,
			line: lineNo,
			message: typeof rule.message === "function" ? rule.message(match[0]) : rule.message,
			context: match[0],
			severity: rule.severity ?? "warning",
			fixable: Boolean(rule.fix),
			packageName: rule.packageName,
			ruleId: rule.id,
			ruleDescription: resolveAuditRuleDescription(rule, rule.id ?? "Regla")
		});
	}
}
function applyRuleFix(rule, content, filePath) {
	if (rule.appliesTo && !rule.appliesTo(filePath)) return content;
	const fixer = rule.fix;
	if (!fixer) return content;
	const gRegex = new RegExp(rule.regex.source, rule.regex.flags.includes("g") ? rule.regex.flags : rule.regex.flags + "g");
	return content.replace(gRegex, (match, ...args) => {
		const matchIdx = typeof args[args.length - 2] === "number" ? args[args.length - 2] : 0;
		if (isInsideComment(content, matchIdx)) return match;
		if (rule.check) {
			const currentMatch = new RegExp(rule.regex.source, rule.regex.flags.replace("g", "")).exec(content.substring(matchIdx));
			if (currentMatch) {
				currentMatch.index = matchIdx;
				if (!rule.check(content, currentMatch, filePath)) return match;
			}
		}
		return fixer(match);
	});
}
const activeProjectRuleTimings = /* @__PURE__ */ new Map();
function runRules(filePath, content, rules, violations, fix, offset) {
	let result = content;
	for (const rule of rules) {
		if (rule.appliesTo && !rule.appliesTo(filePath)) continue;
		const ruleKey = rule.id;
		const start = performance.now();
		if (fix && rule.fix) result = applyRuleFix(rule, result, filePath);
		const getLineNo = createLineLocator(result, offset);
		collectRuleViolations(rule, result, filePath, getLineNo, violations);
		if (ruleKey) {
			const elapsed = performance.now() - start;
			const current = activeProjectRuleTimings.get(ruleKey) ?? 0;
			activeProjectRuleTimings.set(ruleKey, current + elapsed);
		}
	}
	return result;
}
function extractAllBlocks(content, tag) {
	const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
	const blocks = [];
	let match;
	while ((match = regex.exec(content)) !== null) {
		const blockContent = match[1] ?? "";
		const startLine = content.substring(0, match.index).split("\n").length;
		const openingTagLength = match[0].indexOf(blockContent);
		const startIdx = match.index + openingTagLength;
		const endIdx = startIdx + blockContent.length;
		blocks.push({
			content: blockContent,
			startLine,
			startIdx,
			endIdx
		});
	}
	return blocks;
}
function getChangedFiles(ref) {
	try {
		return execSync(`git diff --name-only ${ref}`, {
			encoding: "utf8",
			stdio: [
				"pipe",
				"pipe",
				"ignore"
			]
		}).split("\n").map((f) => f.trim()).filter((f) => f !== "" && AUDIT_EXTENSIONS.has(path.extname(f)) && !Array.from(CANONICAL_IGNORE_DIRS).some((d) => f.split(/[/\\]/).includes(d))).map((f) => path.resolve(process.cwd(), f));
	} catch {
		process.stderr.write(styleText("yellow", `⚠️ No se pudo obtener la lista de archivos modificados desde git para ref: '${ref}'. Se auditará el proyecto completo.\n`));
		return [];
	}
}
function getViolationCategory(v) {
	const desc = v.ruleDescription || v.ruleId;
	if (desc) {
		if (v.packageName && !desc.toLowerCase().startsWith(v.packageName.toLowerCase() + ":")) {
			const combined = `${v.packageName}: ${desc}`;
			return combined.length <= 50 ? combined : desc;
		}
		return desc;
	}
	return "Otros";
}
const MAX_CONTEXT_SNIPPET_LENGTH = 50;
const DEFAULT_TOP_LIMIT = 15;
const MAX_FILES_TO_SHOW_IN_TERMINAL = 25;
const MAX_VIOLATIONS_PER_FILE_IN_TERMINAL = 10;
function sanitizeContext(ctx) {
	if (!ctx) return "";
	return ctx.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_CONTEXT_SNIPPET_LENGTH);
}
function extractSelectedRules(values, positionals) {
	const collectedRules = [
		...Array.isArray(values.rule) ? values.rule : [values.rule],
		...Array.isArray(values.rules) ? values.rules : [values.rules],
		...positionals.filter((p) => p.toLowerCase() === "dox" || p.includes(","))
	].filter(Boolean).map(String);
	const selectedRules = /* @__PURE__ */ new Set();
	for (const raw of collectedRules) for (const part of raw.split(",")) {
		const clean = part.trim().toLowerCase();
		if (clean) selectedRules.add(clean);
	}
	return selectedRules;
}
function filterActiveConfigRules(selectedRules) {
	const activeConfigRules = /* @__PURE__ */ new Set();
	for (const rule of Object.values(auditRulesConfig)) if (matchesRule(rule, selectedRules)) activeConfigRules.add(rule);
	return activeConfigRules;
}
function parseProjectCliContext(cliArgs) {
	const normalizedCliArgs = (cliArgs || process.argv.slice(2)).map((cliParam) => {
		if (cliParam.includes("=") && !cliParam.startsWith("-")) return `--${cliParam}`;
		if ([
			"fix",
			"summary",
			"json",
			"human",
			"pretty",
			"errors-only",
			"css-only"
		].includes(cliParam)) return `--${cliParam}`;
		return cliParam;
	});
	const parsedConfig = parseArgs({
		args: normalizedCliArgs,
		options: {
			fix: {
				type: "boolean",
				short: "f"
			},
			path: {
				type: "string",
				short: "p",
				default: "."
			},
			output: {
				type: "string",
				short: "o"
			},
			summary: {
				type: "boolean",
				short: "s"
			},
			json: {
				type: "boolean",
				short: "j"
			},
			human: {
				type: "boolean",
				short: "H"
			},
			pretty: { type: "boolean" },
			top: {
				type: "string",
				short: "t"
			},
			"changed-since": { type: "string" },
			"errors-only": { type: "boolean" },
			"css-only": { type: "boolean" },
			rule: {
				type: "string",
				short: "r",
				multiple: true
			},
			rules: {
				type: "string",
				multiple: true
			}
		},
		allowPositionals: true,
		strict: false
	});
	const values = parsedConfig.values;
	const positionals = parsedConfig.positionals;
	const selectedRules = extractSelectedRules(values, positionals);
	return {
		values,
		selectedRules,
		activeConfigRules: filterActiveConfigRules(selectedRules),
		isHumanMode: Boolean(values.human || values.pretty || values.summary)
	};
}
async function runAstFileScans(ctx, logProgress) {
	const shouldScanFiles = ctx.activeConfigRules.size > 0;
	const changedSince = ctx.values["changed-since"];
	let files = [];
	let violations = [];
	if (!shouldScanFiles) return {
		violations,
		files
	};
	if (changedSince) {
		files = getChangedFiles(changedSince);
		logProgress(styleText("cyan", `[3/6] 🔍 Auditando archivos modificados desde: '${changedSince}' (${files.length} archivos)...`));
	} else {
		files = await getFilesToAudit(path.resolve(process.cwd(), ctx.values.path));
		logProgress(styleText("cyan", `[3/6] 🔍 Auditando AST y reglas de código en ${files.length} archivos...`));
	}
	let processed = 0;
	const total = files.length;
	const AST_PROGRESS_BATCH_SIZE = 200;
	for (const f of files) {
		processed++;
		if (processed % AST_PROGRESS_BATCH_SIZE === 0 || processed === total) logProgress(styleText("cyan", `   ⏳ Progreso AST: ${processed}/${total} archivos (${Math.round(processed / total * 100)}%)`));
		violations = violations.concat(await auditFile(f, Boolean(ctx.values.fix), ctx.activeConfigRules));
	}
	return {
		violations,
		files
	};
}
function filterAndGroupViolations(rawViolations, ctx) {
	let all = rawViolations;
	if (ctx.values.path) {
		const normPath = path.normalize(ctx.values.path);
		all = all.filter((v) => path.normalize(v.file).includes(normPath));
	}
	if (ctx.values["errors-only"]) all = all.filter((v) => v.severity === "error");
	if (ctx.selectedRules.size > 0) all = all.filter((v) => {
		const category = getViolationCategory(v);
		const desc = {
			id: v.ruleId || category,
			name: v.message,
			category,
			aliases: v.context ? [v.context, path.basename(v.file)] : [path.basename(v.file)]
		};
		return matchesRule(desc, ctx.selectedRules);
	});
	all.sort((a, b) => {
		if (a.severity === "error" && b.severity !== "error") return -1;
		if (a.severity !== "error" && b.severity === "error") return 1;
		return 0;
	});
	const fileGroups = {};
	const typeGroups = {};
	for (const v of all) {
		const rawRel = path.isAbsolute(v.file) ? path.relative(process.cwd(), v.file) : v.file;
		const rel = normalizePosixPath(rawRel);
		if (!fileGroups[rel]) fileGroups[rel] = [];
		fileGroups[rel].push(v);
		const category = getViolationCategory(v);
		typeGroups[category] = (typeGroups[category] || 0) + 1;
	}
	return {
		all,
		fileGroups,
		typeGroups
	};
}
function renderHumanSummaryView(typeGroups, topFiles, topLimit) {
	printTerminal(styleText("bold", "\n--- 📊 RESUMEN DE AUDITORÍA DE CÓDIGO ---"));
	printTerminal("\nPor tipo de regla:");
	Object.entries(typeGroups).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
		printTerminal(`  - ${cat}: ${count}`);
	});
	printTerminal(`\nTop ${topLimit} archivos con más problemas:`);
	topFiles.forEach((f) => {
		printTerminal(`  - ${f.file}: ${f.total} violaciones (${f.errors} ❌, ${f.warnings} ⚠️)`);
	});
}
function renderHumanFileViolations(file, violations) {
	const fileErrors = violations.filter((v) => v.severity === "error").length;
	const fileWarns = violations.filter((v) => v.severity === "warning").length;
	printTerminal(`\n📁 ${styleText("bold", file)} (${violations.length} avisos: ${fileErrors} ❌, ${fileWarns} ⚠️)`);
	for (const v of violations.slice(0, MAX_VIOLATIONS_PER_FILE_IN_TERMINAL)) {
		const icon = v.severity === "error" ? "❌ ERROR" : "⚠️ WARN ";
		const color = v.severity === "error" ? "red" : "yellow";
		const lineStr = `L${v.line}`.padEnd(5);
		const snippet = sanitizeContext(v.context);
		const snippetStr = snippet ? ` ("${snippet}")` : "";
		printTerminal(`  ${lineStr} ${styleText(color, icon)} [${getViolationCategory(v)}] ${v.message}${snippetStr}`);
	}
	if (violations.length > MAX_VIOLATIONS_PER_FILE_IN_TERMINAL) printTerminal(styleText("cyan", `  ... y ${violations.length - MAX_VIOLATIONS_PER_FILE_IN_TERMINAL} aviso(s) más en este archivo.`));
}
function renderHumanDetailView(fileGroups) {
	printTerminal(styleText("bold", "\n--- 🔎 DETALLE DE VIOLACIONES POR ARCHIVO ---"));
	const entries = Object.entries(fileGroups);
	const filesToShow = entries.slice(0, MAX_FILES_TO_SHOW_IN_TERMINAL);
	for (const [file, violations] of filesToShow) renderHumanFileViolations(file, violations);
	if (entries.length > MAX_FILES_TO_SHOW_IN_TERMINAL) {
		printTerminal(styleText("cyan", `\n[INFO] Se muestran ${MAX_FILES_TO_SHOW_IN_TERMINAL} de ${entries.length} archivos con avisos para evitar saturar la terminal.`));
		printTerminal(styleText("cyan", `👉 Usa "npm run auditor errors-only" para filtrar solo errores o consulta scratch/audits/latest_audit.json para el volcado completo.`));
	}
}
function renderHumanTerminalReport(fileGroups, typeGroups, topFiles, errorsCount, warningsCount, topLimit, values, archJsonPath) {
	if (values.summary) renderHumanSummaryView(typeGroups, topFiles, topLimit);
	else renderHumanDetailView(fileGroups);
	printTerminal(styleText("bold", "\n======================================================"));
	printTerminal(`📊 TOTAL: ${errorsCount === 0 ? styleText("green", "0 Errores") : styleText("red", `${errorsCount} Errores`)} | ${styleText("yellow", `${warningsCount} Advertencias`)} | ${Object.keys(fileGroups).length} Archivos`);
	printTerminal("======================================================");
	printTerminal(styleText("dim", `💾 Reporte detallado guardado en: ${path.relative(process.cwd(), archJsonPath)}\n`));
}
async function exportProjectReportOutput(values, jsonReport, all, fileGroups, typeGroups, topFiles, errorsCount, warningsCount, logProgress) {
	if (!values.output) return;
	const outputPath = path.resolve(process.cwd(), values.output);
	if (outputPath.endsWith(".json")) await fs.writeFile(outputPath, JSON.stringify(jsonReport, null, 2), "utf-8");
	else if (outputPath.endsWith(".md")) {
		let md = `# Reporte de Auditoría del Proyecto\n\n`;
		md += `**Estado**: ${errorsCount === 0 ? "✅ Aprobado" : "❌ Fallido"}\n\n`;
		md += `| Métrica | Valor |\n| :--- | :--- |\n`;
		md += `| **Errores** | \`${errorsCount}\` |\n`;
		md += `| **Advertencias** | \`${warningsCount}\` |\n`;
		md += `| **Archivos Afectados** | \`${Object.keys(fileGroups).length}\` |\n\n`;
		md += `## 📊 Desglose por Categoría\n\n| Categoría | Cantidad |\n| :--- | :---: |\n`;
		Object.entries(typeGroups).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
			md += `| ${cat} | ${count} |\n`;
		});
		md += `\n## 📁 Top Archivos con Más Avisos\n\n| Archivo | Errores | Advertencias | Total |\n| :--- | :---: | :---: | :---: |\n`;
		topFiles.forEach((f) => {
			md += `| \`${f.file}\` | ${f.errors} | ${f.warnings} | ${f.total} |\n`;
		});
		await fs.writeFile(outputPath, md, "utf-8");
	} else {
		const lines = all.map((v) => `[${v.severity.toUpperCase()}] ${path.relative(process.cwd(), v.file)}:${v.line} -> [${getViolationCategory(v)}] ${v.message} ("${sanitizeContext(v.context)}")`);
		await fs.writeFile(outputPath, lines.join("\n"), "utf-8");
	}
	logProgress(styleText("cyan", `✨ Reporte completo escrito en: ${outputPath}`));
}
async function executeProjectAuditPhases(ctx, logProgress) {
	const astResult = await runAstFileScans(ctx, logProgress);
	return {
		all: astResult.violations,
		files: astResult.files
	};
}
function buildProjectTopFiles(fileGroups, topLimit) {
	return Object.entries(fileGroups).map(([file, violations]) => ({
		file,
		errors: violations.filter((v) => v.severity === "error").length,
		warnings: violations.filter((v) => v.severity === "warning").length,
		total: violations.length
	})).sort((a, b) => b.total - a.total).slice(0, topLimit);
}
function buildProjectJsonReport(params) {
	const { all, files, fileGroups, typeGroups, topFiles, errorsCount, warningsCount, durationMs } = params;
	return {
		id: "audit_project",
		name: "Project Architecture & Style Rules",
		family: "architecture",
		status: errorsCount > 0 ? "failed" : "passed",
		durationMs,
		metrics: {
			"Archivos Escaneados": files.length,
			"Archivos Afectados": Object.keys(fileGroups).length
		},
		findings: all.map((v) => ({
			severity: v.severity,
			message: v.message,
			file: v.file,
			line: v.line,
			context: sanitizeContext(v.context),
			ruleId: v.ruleId || getViolationCategory(v),
			ruleDescription: getViolationCategory(v)
		})),
		summary: {
			errors: errorsCount,
			warnings: warningsCount,
			info: 0,
			totalFilesScanned: files.length,
			totalViolations: all.length,
			filesWithIssues: Object.keys(fileGroups).length,
			byCategory: typeGroups
		},
		topFiles,
		files: Object.fromEntries(Object.entries(fileGroups).map(([file, violations]) => [file, violations.map((v) => ({
			line: v.line,
			severity: v.severity,
			category: getViolationCategory(v),
			message: v.message,
			context: sanitizeContext(v.context)
		}))]))
	};
}
async function persistProjectReports(jsonReport) {
	const scratchArchDir = path.resolve(process.cwd(), "scratch/audits/architecture");
	await fs.mkdir(scratchArchDir, { recursive: true });
	const archJsonPath = path.join(scratchArchDir, "audit_project.json");
	const latestArchJsonPath = path.resolve(process.cwd(), "scratch/audits/latest_audit_project.json");
	const jsonReportStr = JSON.stringify(jsonReport, null, 2);
	await fs.writeFile(archJsonPath, jsonReportStr, "utf-8");
	await fs.writeFile(latestArchJsonPath, jsonReportStr, "utf-8");
	return {
		archJsonPath,
		jsonReportStr
	};
}
async function main(cliArgs) {
	await loadAuditConfig();
	const startTime = performance.now();
	const ctx = parseProjectCliContext(cliArgs);
	function logProgress(msg) {
		if (process.env.AUDIT_SUBPROCESS === "true") return;
		if (ctx.isHumanMode) printTerminal(msg);
		else process.stderr.write(msg + "\n");
	}
	logProgress(styleText("bold", "--- 🔎 REGLAS DE CÓDIGO Y ESTRUCTURA DOX (audit_project.ts) ---"));
	if (ctx.selectedRules.size > 0) logProgress(styleText("cyan", `🎯 Ejecución selectiva de reglas: [ ${Array.from(ctx.selectedRules).join(", ")} ]`));
	const { all: rawAll, files } = await executeProjectAuditPhases(ctx, logProgress);
	const { all, fileGroups, typeGroups } = filterAndGroupViolations(rawAll, ctx);
	const topLimit = ctx.values.top ? parseInt(ctx.values.top, 10) : DEFAULT_TOP_LIMIT;
	const topFiles = buildProjectTopFiles(fileGroups, topLimit);
	const errorsCount = all.filter((v) => v.severity === "error").length;
	const warningsCount = all.filter((v) => v.severity === "warning").length;
	const jsonReport = buildProjectJsonReport({
		all,
		files,
		fileGroups,
		typeGroups,
		topFiles,
		errorsCount,
		warningsCount,
		durationMs: Math.round(performance.now() - startTime)
	});
	const { archJsonPath, jsonReportStr } = await persistProjectReports(jsonReport);
	if (process.env.AUDIT_SUBPROCESS !== "true") {
		if (ctx.isHumanMode) renderHumanTerminalReport(fileGroups, typeGroups, topFiles, errorsCount, warningsCount, topLimit, ctx.values, archJsonPath);
		else printTerminal(jsonReportStr);
	}
	await exportProjectReportOutput(ctx.values, jsonReport, all, fileGroups, typeGroups, topFiles, errorsCount, warningsCount, logProgress);
	if (ctx.values.fix) logProgress(styleText("cyan", "✨ Correcciones aplicadas."));
	return all;
}
function getProjectArchitectureRuleDescriptions() {
	const descriptions = {};
	for (const [key, rule] of Object.entries(auditRulesConfig)) {
		const r = rule;
		const id = r.id ? r.id : key;
		descriptions[id] = resolveAuditRuleDescription(r, key);
	}
	return descriptions;
}
function getProjectArchitectureRuleRemediations() {
	return {
		viewport: "Configura o respeta las etiquetas de viewport estándar y responsive.",
		hardcodedTimezone: "Evita zonas horarias hardcodeadas; utiliza la configuración regional canónica.",
		nodePrefix: "Usa el prefijo \"node:\" al importar módulos nativos (ej. \"node:fs\", \"node:path\").",
		esmExtensions: "Asegura extensiones explícitas (.ts, .js) en imports relativos bajo ESM.",
		timersPromises: "Usa \"node:timers/promises\" (setTimeout) en lugar de callbacks para esperas asíncronas.",
		explicitResource: "Gestiona recursos y handles explícitamente cerrando descriptores de archivo o conexiones.",
		zeroTimerLogic: "Evita setTimeout(..., 0) en lógica de UI; usa la API de animación o nextTick() canónico.",
		jsonStringifyInWatch: "Evita JSON.stringify en watchers reactivos de Vue para no degradar el rendimiento.",
		intersectionObserverRoot: "Provee un contenedor raíz explícito en observadores de intersección.",
		functionCallsInTemplates: "Evita invocar funciones pesadas directamente en plantillas de Vue; usa computeds.",
		forbiddenFallbacks: "Elimina fallbacks no autorizados y propaga errores de forma determinista.",
		noDomainIdFallbacks: "No asignes IDs ficticios o fallbacks vacíos a entidades del dominio.",
		noInlineTypeImports: "Usa \"import type { ... }\" a nivel de declaración en lugar de imports inline mezclados.",
		noRawJsonImportsOutsideData: "Centraliza la carga de JSON en capas de datos autorizadas en lugar de componentes.",
		noSassAtImport: "Migra directivas @import obsoletas a @use o @forward en hojas de estilo SCSS/Sass."
	};
}
var ProjectArchitectureAuditor = class extends BaseAuditor {
	constructor() {
		const ruleDescriptions = getProjectArchitectureRuleDescriptions();
		const ruleRemediations = getProjectArchitectureRuleRemediations();
		const ruleIds = Object.keys(ruleDescriptions);
		const fixableRuleIds = Object.entries(auditRulesConfig).filter(([, rule]) => typeof rule.fix === "function" || rule.fixable === true).map(([key, rule]) => rule.id || key);
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createRuleCapabilities(ruleIds, {
				speed: "light",
				phase: "normal",
				fix: "normal",
				md: true,
				ast: true,
				changedOnly: true,
				critical: false
			}, fixableRuleIds),
			fixableRuleIds,
			ruleIds,
			ruleDescriptions,
			ruleRemediations,
			id: "audit_project",
			name: "Project Architecture & Style Rules",
			description: "Audita reglas de arquitectura, TypeScript y estilo",
			family: "architecture",
			packageName: "Arquitectura",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "🏛️",
			coverage: {
				include: ["**/*.{vue,scss,css,ts,js,md}"],
				exclude: [path.posix.join(AUDITOR_DIR, "**")]
			}
		});
	}
	async runAudit() {
		activeProjectRuleTimings.clear();
		const files = await getFilesToAudit(this.projectRoot);
		for (const f of files) this.recordScanned(f);
		for (const r of Object.keys(this.ruleDescriptions ?? {})) {
			this.markRuleEvaluated(r);
			if (!activeProjectRuleTimings.has(r)) activeProjectRuleTimings.set(r, 0);
		}
		const violations = await main(this.isFixActive() ? [...process.argv.slice(2), "--fix"] : void 0);
		for (const [ruleId, durationMs] of activeProjectRuleTimings.entries()) this.reportRuleDuration(ruleId, durationMs);
		for (const v of violations) {
			const relFile = v.file ? normalizePosixPath(path.isAbsolute(v.file) ? path.relative(this.projectRoot, v.file) : v.file) : "";
			this.addViolation({
				ruleId: v.ruleId || getViolationCategory(v),
				ruleDescription: v.ruleDescription,
				severity: v.severity,
				file: relFile,
				line: v.line,
				message: v.message,
				context: v.context,
				fixable: v.fixable
			});
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ProjectArchitectureAuditor());
//#endregion
export { ProjectArchitectureAuditor, activeProjectRuleTimings, applyRuleFix, buildProjectTopFiles, createLineLocator, extractAllBlocks, extractSelectedRules, filterActiveConfigRules, filterAndGroupViolations, getProjectArchitectureRuleDescriptions, getProjectArchitectureRuleRemediations, getViolationCategory, isInsideComment, main, runRules };
