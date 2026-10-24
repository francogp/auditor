import { AUDITOR_DIR } from "../../core/auditConfigTypes.js";
import { DEFAULT_AUDIT_CONFIG } from "../../core/auditConfigDefaults.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import { getAuditConfig, loadAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/safePath.js";
import "../../core/auditConfig.js";
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs } from "../../core/cli/cittyHarness.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { BaseAuditor, createRuleCapabilities, isPathIgnored } from "../../core/auditorBase.js";
import { matchesRule } from "../../analyzers/auditRuleTypes.js";
import { auditRulesConfig } from "./audit_rules.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import fs$1 from "node:fs/promises";
import { styleText } from "node:util";
import { execSync } from "node:child_process";
// src/suites/architecture/audit_project.ts
/**
* scripts/audit_project.ts
*
* STABLE PROJECT AUDIT ENGINE (Node.js 26+)
*
* Final Safe Version: Context-aware GPU checking.
*/
enableCompileCache();
function printTerminal(msg) {
	process.stdout.write(`${msg}\n`);
}
const AUDIT_EXTENSIONS = /* @__PURE__ */ new Set([
	".vue",
	".scss",
	".css",
	".ts",
	".js",
	".md"
]);
async function getFilesToAudit(dir, roots) {
	const files = [];
	const effectiveRoots = roots && roots.length > 0 ? roots : ["."];
	for (const root of effectiveRoots) {
		const fullRoot = path.resolve(dir, root);
		if (!fs.existsSync(fullRoot)) continue;
		const pattern = `**/*{${Array.from(AUDIT_EXTENSIONS).join(",")}}`;
		for await (const entry of fs$1.glob(pattern, {
			cwd: fullRoot,
			exclude: (p) => isPathIgnored(root === "." ? p : path.join(root, p))
		})) files.push(path.resolve(fullRoot, entry));
	}
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
	let content = await fs$1.readFile(filePath, "utf-8");
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
	if (fix && modified) await fs$1.writeFile(filePath, content, "utf-8");
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
function getChangedFiles(ref, projectRoot = process.cwd()) {
	try {
		return execSync(`git diff --name-only ${ref}`, {
			cwd: projectRoot,
			encoding: "utf8",
			stdio: [
				"pipe",
				"pipe",
				"ignore"
			]
		}).split("\n").map((f) => f.trim()).filter((f) => f !== "" && AUDIT_EXTENSIONS.has(path.extname(f)) && !isPathIgnored(f, [], [], projectRoot)).map((f) => path.resolve(projectRoot, f));
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
const PROJECT_AUDIT_CLI_ARGS = {
	...COMMON_CLI_ARGS,
	fix: {
		type: "boolean",
		alias: "f",
		default: false
	},
	path: {
		type: "string",
		alias: "p",
		default: "."
	},
	output: {
		type: "string",
		alias: "o"
	},
	summary: {
		type: "boolean",
		alias: "s",
		default: false
	},
	top: {
		type: "string",
		alias: "t"
	},
	"changed-since": { type: "string" },
	"errors-only": {
		type: "boolean",
		default: false
	},
	"css-only": {
		type: "boolean",
		default: false
	},
	rule: {
		type: "string",
		alias: "r"
	},
	rules: { type: "string" }
};
function parseProjectCliContext(cliArgs) {
	const rawCliArgs = cliArgs || getProcessCliArgs();
	const parsed = parseCittyArgs(PROJECT_AUDIT_CLI_ARGS, rawCliArgs);
	const positionals = parsed._.map(String);
	const posLower = new Set(positionals.map((p) => p.toLowerCase()));
	const values = {
		...parsed,
		fix: Boolean(parsed.fix) || posLower.has("fix"),
		summary: Boolean(parsed.summary) || posLower.has("summary"),
		json: Boolean(parsed.json) || posLower.has("json"),
		human: Boolean(parsed.human) || posLower.has("human"),
		pretty: Boolean(parsed.pretty) || posLower.has("pretty"),
		"errors-only": Boolean(parsed["errors-only"]) || posLower.has("errors-only"),
		"css-only": Boolean(parsed["css-only"]) || posLower.has("css-only")
	};
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
	printTerminal(styleText("bold", "\n--- 📊 CODE AUDIT SUMMARY ---"));
	printTerminal("\nBy rule category:");
	Object.entries(typeGroups).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
		printTerminal(`  - ${cat}: ${count}`);
	});
	printTerminal(`\nTop ${topLimit} files with most issues:`);
	topFiles.forEach((f) => {
		printTerminal(`  - ${f.file}: ${f.total} violations (${f.errors} ❌, ${f.warnings} ⚠️)`);
	});
}
function renderHumanFileViolations(file, violations) {
	const fileErrors = violations.filter((v) => v.severity === "error").length;
	const fileWarns = violations.filter((v) => v.severity === "warning").length;
	printTerminal(`\n📁 ${styleText("bold", file)} (${violations.length} notices: ${fileErrors} ❌, ${fileWarns} ⚠️)`);
	for (const v of violations.slice(0, MAX_VIOLATIONS_PER_FILE_IN_TERMINAL)) {
		const icon = v.severity === "error" ? "❌ ERROR" : "⚠️ WARN ";
		const color = v.severity === "error" ? "red" : "yellow";
		const lineStr = `L${v.line}`.padEnd(5);
		const snippet = sanitizeContext(v.context);
		const snippetStr = snippet ? ` ("${snippet}")` : "";
		printTerminal(`  ${lineStr} ${styleText(color, icon)} [${getViolationCategory(v)}] ${v.message}${snippetStr}`);
	}
	if (violations.length > MAX_VIOLATIONS_PER_FILE_IN_TERMINAL) printTerminal(styleText("cyan", `  ... and ${violations.length - MAX_VIOLATIONS_PER_FILE_IN_TERMINAL} more notice(s) in this file.`));
}
function renderHumanDetailView(fileGroups) {
	printTerminal(styleText("bold", "\n--- 🔎 VIOLATIONS DETAIL BY FILE ---"));
	const entries = Object.entries(fileGroups);
	const filesToShow = entries.slice(0, MAX_FILES_TO_SHOW_IN_TERMINAL);
	for (const [file, violations] of filesToShow) renderHumanFileViolations(file, violations);
	if (entries.length > MAX_FILES_TO_SHOW_IN_TERMINAL) {
		printTerminal(styleText("cyan", `\n[INFO] Showing ${MAX_FILES_TO_SHOW_IN_TERMINAL} of ${entries.length} files with findings to prevent terminal saturation.`));
		printTerminal(styleText("cyan", `👉 Use "npm run auditor:errors" to filter only errors or consult scratch/audits/latest_audit.json for complete output.`));
	}
}
function renderHumanTerminalReport(fileGroups, typeGroups, topFiles, errorsCount, warningsCount, topLimit, values, archJsonPath) {
	if (values.summary) renderHumanSummaryView(typeGroups, topFiles, topLimit);
	else renderHumanDetailView(fileGroups);
	printTerminal(styleText("bold", "\n======================================================"));
	printTerminal(`📊 TOTAL: ${errorsCount === 0 ? styleText("green", "0 Errors") : styleText("red", `${errorsCount} Errors`)} | ${styleText("yellow", `${warningsCount} Warnings`)} | ${Object.keys(fileGroups).length} Files`);
	printTerminal("======================================================");
	printTerminal(styleText("dim", `💾 Detailed report saved to: ${path.relative(process.cwd(), archJsonPath)}\n`));
}
async function exportProjectReportOutput(values, jsonReport, all, fileGroups, typeGroups, topFiles, errorsCount, warningsCount, logProgress) {
	if (!values.output) return;
	const outputPath = path.resolve(process.cwd(), values.output);
	if (outputPath.endsWith(".json")) await fs$1.writeFile(outputPath, JSON.stringify(jsonReport, null, 2), "utf-8");
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
		await fs$1.writeFile(outputPath, md, "utf-8");
	} else {
		const lines = all.map((v) => `[${v.severity.toUpperCase()}] ${path.relative(process.cwd(), v.file)}:${v.line} -> [${getViolationCategory(v)}] ${v.message} ("${sanitizeContext(v.context)}")`);
		await fs$1.writeFile(outputPath, lines.join("\n"), "utf-8");
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
	await fs$1.mkdir(scratchArchDir, { recursive: true });
	const archJsonPath = path.join(scratchArchDir, "audit_project.json");
	const latestArchJsonPath = path.resolve(process.cwd(), "scratch/audits/latest_audit_project.json");
	const jsonReportStr = JSON.stringify(jsonReport, null, 2);
	await fs$1.writeFile(archJsonPath, jsonReportStr, "utf-8");
	await fs$1.writeFile(latestArchJsonPath, jsonReportStr, "utf-8");
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
		viewport: "Configure and respect standard responsive viewport tags.",
		hardcodedTimezone: "Avoid hardcoded timezones; use canonical regional configuration.",
		nodePrefix: "Use \"node:\" prefix when importing built-in modules (e.g. \"node:fs\", \"node:path\").",
		esmExtensions: "Ensure explicit extensions (.ts, .js) in relative imports under ESM.",
		timersPromises: "Use \"node:timers/promises\" (setTimeout) instead of callbacks for asynchronous delays.",
		explicitResource: "Manage handles and resources explicitly by closing file descriptors or connections.",
		zeroTimerLogic: "Avoid setTimeout(..., 0) in UI logic; use animation APIs or canonical nextTick().",
		jsonStringifyInWatch: "Avoid JSON.stringify in reactive Vue watchers to prevent performance degradation.",
		intersectionObserverRoot: "Provide an explicit root container for intersection observers.",
		functionCallsInTemplates: "Avoid invoking expensive functions directly inside Vue templates; use computed properties.",
		forbiddenFallbacks: "Remove unauthorized fallbacks and propagate errors deterministically.",
		noDomainIdFallbacks: "Do not assign synthetic IDs or empty fallbacks to domain entities.",
		noInlineTypeImports: "Use declaration-level \"import type { ... }\" instead of mixed inline type imports.",
		noRawJsonImportsOutsideData: "Centralize JSON data loading in authorized data layers instead of components.",
		noSassAtImport: "Migrate obsolete @import directives to @use or @forward in SCSS/Sass stylesheets."
	};
}
function getProjectArchitectureRuleRemediationPhases() {
	const phases = {};
	for (const [key, rule] of Object.entries(auditRulesConfig)) {
		const r = rule;
		const id = r.id ? r.id : key;
		if ([
			"constantDuplicates",
			"constantDisparities",
			"constantAliases"
		].includes(id) || id.startsWith("constant")) phases[id] = "dedup";
		else if ([
			"noAny",
			"noDoubleCast",
			"noStringCast",
			"noDomainIdFallbacks",
			"noDomainRawStrings",
			"nodePrefix",
			"noInlineTypeImports"
		].includes(id)) phases[id] = "contracts";
		else if (["esmExtensions"].includes(id)) phases[id] = "polish";
		else phases[id] = "behavior";
	}
	return phases;
}
var ProjectArchitectureAuditor = class extends BaseAuditor {
	effectiveRoots;
	constructor(options = {}) {
		const projectRoot = options.projectRoot ?? process.cwd();
		const cfg = getAuditConfig(projectRoot);
		const defaultCodeRoots = DEFAULT_AUDIT_CONFIG.paths?.codeRoots ?? [];
		const defaultTestRoots = DEFAULT_AUDIT_CONFIG.paths?.testRoots ?? [];
		const resolvedRoots = options.roots && options.roots.length > 0 ? options.roots : [...cfg.paths?.codeRoots ?? defaultCodeRoots, ...cfg.paths?.testRoots ?? defaultTestRoots];
		const ruleDescriptions = getProjectArchitectureRuleDescriptions();
		const ruleRemediations = getProjectArchitectureRuleRemediations();
		const ruleRemediationPhases = getProjectArchitectureRuleRemediationPhases();
		const ruleIds = Object.keys(ruleDescriptions);
		const fixableRuleIds = Object.entries(auditRulesConfig).filter(([, rule]) => typeof rule.fix === "function" || rule.fixable === true).map(([key, rule]) => rule.id || key);
		super({
			usesThirdPartyTool: false,
			requiredPermissions: ["--allow-child-process"],
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
			ruleRemediationPhases,
			id: "audit_project",
			name: "Project Architecture & Style Rules",
			description: "Audits architecture, TypeScript, and style rules",
			family: "architecture",
			packageName: "Architecture",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "🏛️",
			coverage: {
				...deriveCoverageFromRoots(resolvedRoots, AUDIT_EXTENSIONS, projectRoot),
				exclude: [path.posix.join(AUDITOR_DIR, "**")]
			},
			projectRoot
		});
		this.effectiveRoots = resolvedRoots;
	}
	async runAudit() {
		activeProjectRuleTimings.clear();
		const files = await getFilesToAudit(this.projectRoot, this.effectiveRoots);
		for (const f of files) this.recordScanned(f);
		for (const r of Object.keys(this.ruleDescriptions ?? {})) {
			this.markRuleEvaluated(r);
			if (!activeProjectRuleTimings.has(r)) activeProjectRuleTimings.set(r, 0);
		}
		const violations = await main(this.isFixActive() ? [...getProcessCliArgs(), "--fix"] : void 0);
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
				fixable: this.isFixActive() ? false : v.fixable
			});
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ProjectArchitectureAuditor());
export { ProjectArchitectureAuditor, activeProjectRuleTimings, applyRuleFix, buildProjectTopFiles, createLineLocator, extractAllBlocks, extractSelectedRules, filterActiveConfigRules, filterAndGroupViolations, getProjectArchitectureRuleDescriptions, getProjectArchitectureRuleRemediationPhases, getProjectArchitectureRuleRemediations, getViolationCategory, isInsideComment, main, runRules };
