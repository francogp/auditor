import { getRemediationPhaseMetadata } from "./remediationPhases.js";
import { FAMILY_METADATA, normalizeSpeeds } from "./auditContract.js";
import { TEXT_ALIGNMENTS, padVisual, stringWidth, truncateVisual } from "./terminalVisuals.js";
import { DURATION_PAD_LENGTH, formatDuration, formatDurationMs, formatNumber } from "./durationFormatter.js";
import { formatFindingEntry, formatSampleErrorLine, groupFindingsByFile, renderFindingsByFileTree, renderFindingsDetail, renderSampleErrors } from "./fileTreeRenderer.js";
import { renderMarkdownReport } from "./markdownReport.js";
import { extractPhaseBreakdown, renderExecutiveFailSummary, renderExecutiveFixSummary, renderExecutivePassSummary, renderExecutiveSetupBlockingSummary } from "./executiveTheme.js";
import path from "node:path";
import { styleText } from "node:util";
import boxen from "boxen";
import Table from "cli-table3";
// src/core/unifiedTheme.ts
/**
* scripts/lib/unifiedTheme.ts
*
* UNIFIED CLI & REPORT THEME ENGINE (Node.js 26+)
* Provides the single source of truth for visual presentation, Unicode Box-Drawing,
* fixed-width column alignment, status badges, and Markdown generation.
*/
if (!process.env.NO_COLOR && process.env.FORCE_COLOR === void 0) process.env.FORCE_COLOR = "1";
const REGISTRY_DESC_COL_WIDTH = 24;
const REGISTRY_DESC_TRUNCATE_LIMIT = 23;
const BREAKDOWN_LABEL_COL_WIDTH = 52;
const BREAKDOWN_COUNT_COL_WIDTH = 9;
function extractRowCellValues(columns, row) {
	return columns.map((c) => {
		if (c.render) return c.render(row);
		const val = row[c.key ?? ""];
		if (val === null || val === void 0) return "";
		if (typeof val === "string") return val;
		if (typeof val === "number" || typeof val === "boolean" || typeof val === "bigint") return String(val);
		return JSON.stringify(val);
	});
}
function renderBoxTable(columns, rows, options) {
	const head = columns.map((c) => styleText("bold", c.header));
	const colAligns = columns.map((c) => c.align === "center" ? "center" : c.align === "right" ? "right" : "left");
	const colWidths = columns.map((c) => c.width + 2);
	const table = new Table({
		head,
		colWidths,
		colAligns,
		wordWrap: true,
		chars: {
			top: "─",
			"top-mid": "┬",
			"top-left": "┌",
			"top-right": "┐",
			bottom: "─",
			"bottom-mid": "┴",
			"bottom-left": "└",
			"bottom-right": "┘",
			left: "│",
			"left-mid": "├",
			mid: "─",
			"mid-mid": "┼",
			right: "│",
			"right-mid": "┤",
			middle: "│"
		},
		style: {
			"padding-left": 1,
			"padding-right": 1,
			head: [],
			border: ["dim"],
			compact: true
		}
	});
	if (rows.length === 0) {
		const emptyMsg = options?.emptyMessage || "No records found.";
		table.push([{
			colSpan: columns.length,
			content: styleText("dim", emptyMsg),
			hAlign: "center"
		}]);
	} else for (const row of rows) table.push(extractRowCellValues(columns, row));
	if (options?.footerRows && options.footerRows.length > 0) {
		const footerTable = new Table({
			colWidths,
			colAligns,
			wordWrap: true,
			chars: {
				top: "─",
				"top-mid": "┼",
				"top-left": "├",
				"top-right": "┤",
				bottom: "─",
				"bottom-mid": "┴",
				"bottom-left": "└",
				"bottom-right": "┘",
				left: "│",
				"left-mid": "",
				mid: "",
				"mid-mid": "",
				right: "│",
				"right-mid": "",
				middle: "│"
			},
			style: {
				"padding-left": 1,
				"padding-right": 1,
				head: [],
				border: ["dim"],
				compact: true
			}
		});
		for (const fRow of options.footerRows) footerTable.push(extractRowCellValues(columns, fRow));
		const bodyLines = table.toString().split("\n");
		bodyLines.pop();
		const footerLines = footerTable.toString().split("\n");
		return [...bodyLines, ...footerLines].join("\n");
	}
	return table.toString();
}
function createBreakdownColumns(labelHeader) {
	return [
		{
			header: labelHeader,
			width: BREAKDOWN_LABEL_COL_WIDTH,
			align: "left",
			key: "label"
		},
		{
			header: "ERRORS",
			width: BREAKDOWN_COUNT_COL_WIDTH,
			align: "right",
			key: "errors"
		},
		{
			header: "WARNINGS",
			width: BREAKDOWN_COUNT_COL_WIDTH,
			align: "right",
			key: "warnings"
		}
	];
}
function formatCountCell(count, color, bold = false) {
	if (count <= 0) return styleText("dim", "0");
	const formatted = formatNumber(count);
	return bold ? styleText(["bold", color], formatted) : styleText(color, formatted);
}
function createConsolidatedFooterRow(totalErrors, totalWarnings) {
	return {
		label: styleText("bold", "CONSOLIDATED TOTAL"),
		errors: formatCountCell(totalErrors, "red", true),
		warnings: formatCountCell(totalWarnings, "yellow", true)
	};
}
function renderFindingsBreakdownTable(items, labelHeader = "FINDING TYPE / RULE") {
	return renderBoxTable(createBreakdownColumns(labelHeader), items.map(([name, data]) => ({
		label: name,
		errors: formatCountCell(data.errors, "red"),
		warnings: formatCountCell(data.warnings, "yellow")
	})), { footerRows: [createConsolidatedFooterRow(items.reduce((acc, [, data]) => acc + data.errors, 0), items.reduce((acc, [, data]) => acc + data.warnings, 0))] });
}
function renderTieredFindingsBreakdownTable(groups, labelHeader = "FINDING TYPE / RULE") {
	const cols = createBreakdownColumns(labelHeader);
	const rows = [];
	let totalErrors = 0;
	let totalWarnings = 0;
	for (const group of groups) {
		if (group.items.length === 0 && group.errors === 0 && group.warnings === 0) continue;
		const meta = getRemediationPhaseMetadata(group.phaseId);
		totalErrors += group.errors;
		totalWarnings += group.warnings;
		rows.push({
			label: styleText(["bold", "cyan"], `${meta.icon} ${meta.title}`),
			errors: "",
			warnings: ""
		});
		for (const [name, data] of group.items) rows.push({
			label: `  ${name}`,
			errors: formatCountCell(data.errors, "red"),
			warnings: formatCountCell(data.warnings, "yellow")
		});
		rows.push({
			label: styleText("bold", `  ↳ Subtotal Phase ${meta.order}`),
			errors: formatCountCell(group.errors, "red", true),
			warnings: formatCountCell(group.warnings, "yellow", true)
		});
	}
	return renderBoxTable(cols, rows, { footerRows: [createConsolidatedFooterRow(totalErrors, totalWarnings)] });
}
function renderSampleFindings(findings, limitOrAll = 5, options) {
	if (findings.length === 0) return "";
	const limit = limitOrAll === "all" ? findings.length : limitOrAll;
	const sample = limit >= findings.length ? findings : findings.slice(-limit);
	const countLabel = limit >= findings.length ? `all ${sample.length}` : `last ${sample.length}`;
	const defaultHeader = findings.length > 0 && findings.every((f) => f.severity === "warning") ? `\n⚠️  Sample of detected warnings (${countLabel} of ${findings.length}):\n` : `\n❌ Sample of detected errors (${countLabel} of ${findings.length}):\n`;
	return `${options?.title ? `\n${options.title} (${countLabel} of ${findings.length}):\n` : defaultHeader}${sample.map((f, idx) => {
		const fileLoc = f.file ? `${path.relative(process.cwd(), f.file)}${f.line ? `:${f.line}` : ""}` : "General";
		const cleanMsg = f.message.replace(/^Sugerencia de calidad \(Fallow\):\s*/i, "");
		const normalizedRuleDesc = (f.ruleDescription || "").replace(/^Fallow:\s*/i, "").trim().toLowerCase();
		const ruleTag = f.ruleDescription && !cleanMsg.toLowerCase().includes(normalizedRuleDesc) ? `[${f.ruleDescription}] ` : f.ruleDescription?.startsWith("Fallow:") ? "[Fallow] " : f.ruleId ? `[${f.ruleId}] ` : "";
		return `  ${idx + 1}. ${fileLoc}: ${ruleTag}${cleanMsg}`;
	}).join("\n")}\n`;
}
const NOTICE_BOX_COLORS = [
	"yellow",
	"cyan",
	"red",
	"green",
	"magenta",
	"blue"
];
function renderBanner(title, subtitle, borderColor) {
	let resolvedColor = borderColor ?? "cyan";
	if (!borderColor) {
		if (title.includes("REPAIR") || title.includes("REPARACIÓN")) resolvedColor = "magenta";
		else if (title.includes("CRITICAL") || title.includes("CRÍTIC") || title.includes("ERROR") || title.includes("FAIL") || title.includes("FALLO")) resolvedColor = "red";
		else if (title.includes("WARN") || title.includes("ADVERTENCIA")) resolvedColor = "yellow";
		else if (title.includes("PASS") || title.includes("APROBAD") || title.includes("SUCCESS") || title.includes("ÉXITO")) resolvedColor = "green";
	}
	const content = subtitle ? `${styleText(["bold", "white"], title)}\n${styleText("dim", subtitle)}` : styleText(["bold", "white"], title);
	return boxen(content, {
		borderColor: resolvedColor,
		borderStyle: "double",
		padding: {
			top: 0,
			bottom: 0,
			left: 1,
			right: 1
		}
	});
}
function buildNoticeBox(options) {
	const color = options.borderColor || "yellow";
	const content = [styleText(["bold", color], options.title), ...options.lines].join("\n");
	return boxen(content, {
		borderColor: color,
		borderStyle: "double",
		padding: {
			top: 0,
			bottom: 0,
			left: 1,
			right: 1
		}
	});
}
/**
* Renders a prominent 80-column Box-Drawing warning banner when the automatic
* installation of Fallow's vector embedding model fails, notifying both human
* developers and AI agents with the exact command to install it manually.
*/
function renderSimilarCodeWarningBanner() {
	const isWindows = process.platform === "win32";
	const lines = [
		styleText("white", "Automatic initialization of Fallow embedding model failed."),
		styleText("white", "The specialized similar-code sub-auditor could not execute."),
		styleText("dim", "This functionality requires manual installation or unblocking in this environment."),
		""
	];
	if (isWindows) lines.push(styleText(["bold", "yellow"], "If Windows Smart App Control or Antivirus blocked the binary (error 4551):"), styleText("white", "  1. In Windows notification: Click \"More info\" -> \"Run anyway\"."), styleText("white", "  2. Or try auto-repair with: npm run auditor:fix"), "");
	lines.push(styleText(["bold", "white"], "Manual installation command:"), styleText(["bold", "cyan"], "  👉  fallow similar-code setup --local --yes"), "", styleText("dim", "Note for CI/headless: you can bypass this suite with:"), styleText("dim", "  AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1 (or AUDITOR_ENV=production)"));
	return buildNoticeBox({
		borderColor: "yellow",
		title: "⚠️  ATTENTION: VECTOR SIMILAR CODE ANALYSIS NOT AVAILABLE",
		lines
	});
}
/**
* Renders a prominent 80-column Box-Drawing warning banner when fixable errors or warnings
* are detected at the end of an audit run, directing developers and AI agents to execute
* `auditor fix` before taking any action or attempting manual suppression.
*/
function renderAutoFixNoticeBanner(fixableErrors, fixableWarnings) {
	const errorText = fixableErrors > 0 ? `${fixableErrors} error(s)` : "";
	const warnText = fixableWarnings > 0 ? `${fixableWarnings} warning(s)` : "";
	const countStr = `${errorText}${fixableErrors > 0 && fixableWarnings > 0 ? " and " : ""}${warnText}`;
	return buildNoticeBox({
		borderColor: "yellow",
		title: "🛠️  ATTENTION: AUTOMATICALLY REPAIRABLE ISSUES DETECTED",
		lines: [
			styleText("white", `Detected ${countStr} repairable via auto-fix.`),
			styleText("dim", "The auditor provides automated mechanisms to resolve the vast majority."),
			styleText(["bold", "yellow"], "IT IS CATEGORICALLY PROHIBITED TO SILENCE OR DISABLE RULES IN PANIC."),
			"",
			styleText(["bold", "white"], "Run auto-repair first before continuing:"),
			styleText(["bold", "cyan"], "  👉  npm run auditor:fix   (or auditor fix)")
		]
	});
}
/**
* Renders a prominent 80-column Box-Drawing notice box when an auto-fix run (`auditor fix`)
* completes, informing developers and AI coding agents that auto-repairs were applied and
* explicitly instructing them to run the full auditor (`npm run auditor`) to inspect findings
* and continue working, without displaying intermediate partial error counts or conclusions.
*/
function renderAutoFixCompletionBanner(totalDurationMs) {
	return buildNoticeBox({
		borderColor: "green",
		title: `🛠️  AUTOMATIC REPAIR PHASE COMPLETED${totalDurationMs !== void 0 && totalDurationMs > 0 ? ` (${formatDurationMs(totalDurationMs)})` : ""}`,
		lines: [
			styleText("white", "Automated repair tasks and code/configuration synchronization completed."),
			styleText("dim", "--fix mode executes only auto-repairable suites and does not reflect global project state."),
			"",
			styleText(["bold", "yellow"], "IT IS CATEGORICALLY PROHIBITED TO DRAW ERRORS OR CONCLUSIONS FROM THIS OUTPUT."),
			"",
			styleText(["bold", "white"], "To verify repair results, audit the complete project and continue:"),
			styleText(["bold", "cyan"], "  👉  npm run auditor   (or vp run auditor)")
		]
	});
}
/**
* Renders a prominent Box-Drawing critical blocking banner when setup-phase errors exist,
* mandating that project infrastructure, configurations, dependencies, and scripts
* must be resolved first before application code or stylesheets.
*/
function renderSetupBlockingBanner(setupErrors, postponedAppErrors, hints) {
	const setupErrorStr = formatNumber(setupErrors);
	const postponedStr = formatNumber(postponedAppErrors);
	const lines = [
		styleText(["bold", "white"], `Detected ${styleText("red", setupErrorStr)} error(s) in Configuration, Dependency, and Script suites.`),
		styleText(["bold", "yellow"], "THESE ERRORS MUST BE FIXED FIRST BEFORE TOUCHING CODE OR STYLES."),
		styleText("dim", postponedAppErrors > 0 ? `To prevent induced false positives, reporting of ${postponedStr} application error(s) was postponed.` : "Downstream application code and stylesheet checks are halted until setup errors are resolved."),
		""
	];
	if (hints?.hasEngineMismatch) lines.push(styleText(["bold", "white"], "Imperative Step 1 — Synchronize runtime engine version:"), styleText(["bold", "cyan"], "  👉  nvm use / fnm use   (or install required version in .node-version)"));
	else if (hints?.hasLockfileMismatch) lines.push(styleText(["bold", "white"], "Imperative Step 1 — Synchronize dependencies with lockfile (Terminal):"), styleText(["bold", "cyan"], "  👉  npm install"), "", styleText(["bold", "white"], "Subsequent Step 2 — Run auditor auto-repair:"), styleText(["bold", "cyan"], "  👉  npm run auditor:fix   (or auditor fix)"));
	else if (hints?.hasFixableErrors !== false) lines.push(styleText(["bold", "white"], "Imperative Step 1 — Run setup auto-repair:"), styleText(["bold", "cyan"], "  👉  npm run auditor:fix   (or auditor fix)"));
	else lines.push(styleText(["bold", "white"], "Imperative Step 1 — Resolve configuration errors indicated in the table:"), styleText(["dim"], "  👉  npm run auditor:guide -- <ruleId>   (or auditor guide <ruleId>)"));
	return buildNoticeBox({
		borderColor: "red",
		title: "🚨  CRITICAL BLOCKING: CONFIGURATION AND PROJECT (SETUP PHASE)",
		lines
	});
}
function renderAuditorsRegistryTable(tasks, activeFamilies, options) {
	const output = [];
	const filter = options?.filter ?? "all";
	let bannerTitle = "DYNAMIC AUDITOR AND CAPABILITIES CATALOG";
	let bannerSubtitle = "Suites discovered at runtime (zero hardcoding)";
	if (filter === "disabled") {
		bannerTitle = "DISABLED AUDITORS CATALOG";
		bannerSubtitle = "Suites disabled in config (.auditor/audit.config.ts)";
	} else if (filter === "enabled") {
		bannerTitle = "ACTIVE AUDITORS CATALOG";
		bannerSubtitle = "Suites enabled and ready for execution";
	}
	output.push(renderBanner(bannerTitle, bannerSubtitle) + "\n");
	if (tasks.length === 0) {
		if (filter === "disabled") output.push(styleText("green", "✨ No disabled auditors! All discovered suites are active and enabled.\n"));
		else output.push(styleText("yellow", "⚠️ No auditors found matching the specified filters.\n"));
		return output.join("\n");
	}
	function renderFamilySectionHeader(familyKey, count, label) {
		const meta = FAMILY_METADATA[familyKey];
		const headerTitle = meta ? `${meta.icon} Family ${meta.order}: ${meta.title}` : familyKey.toUpperCase();
		return styleText("bold", `\n📌 ${headerTitle} (${count} ${label}):`);
	}
	const DISABLED_COLS = [
		{
			header: "AUDITOR / SUITE ID",
			width: 28,
			align: "left",
			key: "id"
		},
		{
			header: "STATUS",
			width: 12,
			align: "left",
			key: "state"
		},
		{
			header: "REASON / CONFIG KEY",
			width: 30,
			align: "left",
			key: "reason"
		}
	];
	function renderFamilyTables(activeFamilies, tasks, label, columns, buildRow) {
		const output = [];
		for (const familyKey of activeFamilies) {
			const familyTasks = tasks.filter((t) => t.family === familyKey);
			if (familyTasks.length === 0) continue;
			output.push(renderFamilySectionHeader(familyKey, familyTasks.length, label));
			const rows = familyTasks.map(buildRow);
			output.push(renderBoxTable(columns, rows));
		}
		return output;
	}
	function renderDisabledFamilyTables(activeFamilies, tasks, disabledReasons) {
		return renderFamilyTables(activeFamilies, tasks, "disabled suites", DISABLED_COLS, (t) => ({
			id: `${t.icon ?? "🏛️"} ${t.id}`,
			state: styleText("yellow", "⏭️  DISABLED"),
			reason: disabledReasons?.get(t.id) ?? "Disabled in config"
		}));
	}
	const ACTIVE_COLS = [
		{
			header: "AUDITOR / SUITE ID",
			width: 27,
			align: "left",
			key: "id"
		},
		{
			header: "FLAGS / CAPABILITIES",
			width: 19,
			align: "left",
			key: "flags"
		},
		{
			header: "DESCRIPTION",
			width: REGISTRY_DESC_COL_WIDTH,
			align: "left",
			key: "desc"
		}
	];
	function formatTaskFlags(caps) {
		const flags = [];
		if (caps?.fix && caps.fix !== "none") flags.push(styleText("green", caps.fix === "priority" ? "FIX!" : "FIX"));
		const speeds = normalizeSpeeds(caps?.speed ?? "light");
		if (speeds.includes("light")) flags.push(styleText("cyan", "🐇"));
		if (speeds.includes("heavy")) flags.push(styleText("yellow", "🐢"));
		if (speeds.includes("full")) flags.push(styleText("magenta", "🐘"));
		if (caps?.md) flags.push(styleText("magenta", "MD"));
		if (caps?.phase === "post-build") flags.push(styleText("red", "BLD"));
		if (caps?.phase === "post-run") flags.push(styleText("blue", "PST"));
		return flags.length > 0 ? flags.join(" ") : styleText("dim", "-");
	}
	function renderActiveFamilyTables(activeFamilies, tasks) {
		return renderFamilyTables(activeFamilies, tasks, "suites", ACTIVE_COLS, (t) => {
			const desc = t.description ?? t.manifest?.description ?? t.name;
			const safeDesc = desc.length > REGISTRY_DESC_COL_WIDTH ? desc.slice(0, REGISTRY_DESC_TRUNCATE_LIMIT) + "…" : desc;
			return {
				id: `${t.icon ?? "🏛️"} ${t.id}`,
				flags: formatTaskFlags(t.capabilities),
				desc: safeDesc
			};
		});
	}
	if (filter === "disabled") output.push(...renderDisabledFamilyTables(activeFamilies, tasks, options?.disabledReasons));
	else output.push(...renderActiveFamilyTables(activeFamilies, tasks));
	output.push(styleText("dim", `\n💡 To view manual and configuration for a suite: auditor --info=<suiteId>`));
	output.push(styleText("dim", `💡 To obtain full JSON specification: auditor --list --json\n`));
	return output.join("\n");
}
/**
* Renders a detailed inspection card for a single auditor suite (≤ 80 cols).
*/
function formatCapabilityList(caps) {
	const capList = [];
	if (caps?.fix === "priority") capList.push(styleText("green", "✔ Priority Auto-Repair (fix=priority)"));
	else if (caps?.fix === "normal") capList.push(styleText("green", "✔ Auto-Repair (--fix)"));
	const speeds = normalizeSpeeds(caps?.speed ?? "light");
	if (speeds.includes("light")) capList.push(styleText("cyan", "🐇 Fast Speed (speed=light)"));
	if (speeds.includes("heavy")) capList.push(styleText("yellow", "🐢 Heavy Speed (speed=heavy)"));
	if (speeds.includes("full")) capList.push(styleText("magenta", "🐘 Exhaustive Speed (speed=full)"));
	if (caps?.md) capList.push(styleText("magenta", "✔ Markdown Preset (preset=md)"));
	if (caps?.phase === "post-build") capList.push(styleText("red", "📦 Post-Build Phase (phase=post-build)"));
	if (caps?.phase === "post-run") capList.push(styleText("blue", "🏁 Post-Run Phase (phase=post-run)"));
	if (caps?.changedOnly) capList.push(styleText("white", "✔ Git Differential (changed-only)"));
	if (caps?.ast) capList.push(styleText("white", "✔ In-memory TypeScript AST (ast)"));
	return capList;
}
const themeStyles = {
	boldWhite: (s) => styleText(["bold", "white"], s),
	boldYellow: (s) => styleText(["bold", "yellow"], s),
	boldCyan: (s) => styleText(["bold", "cyan"], s),
	dim: (s) => styleText("dim", s),
	white: (s) => styleText("white", s)
};
/**
* Renders a detailed inspection card for a single auditor suite (≤ 80 cols).
*/
function renderAuditorDetailCard(task) {
	const { boldWhite, boldYellow, dim, white } = themeStyles;
	const sections = [];
	const title = `${task.icon ?? "🏛️"} ${task.name} [${task.id}]`;
	const subtitle = `Family: ${task.family} | Script: ${task.scriptPath}`;
	sections.push([boldWhite(title), dim(subtitle)]);
	const desc = task.description ?? task.manifest?.description ?? "No description declared.";
	sections.push([boldYellow("📋 PURPOSE:"), white(`  ${desc}`)]);
	const capList = formatCapabilityList(task.capabilities);
	const capLines = [boldYellow("⚙️ SUPPORTED CAPABILITIES / FLAGS:")];
	if (capList.length === 0) capLines.push(dim("  (Standard general execution)"));
	else for (const c of capList) capLines.push(`  ${c}`);
	sections.push(capLines);
	const rules = task.ruleDescriptions ?? task.manifest?.rules;
	if (rules && Object.keys(rules).length > 0) {
		const MAX_CARD_DISPLAY_RULES = 8;
		const count = Object.keys(rules).length;
		const ruleLines = [boldYellow(`🔍 EVALUATED RULES (${count}):`)];
		for (const [rId, rDesc] of Object.entries(rules).slice(0, MAX_CARD_DISPLAY_RULES)) ruleLines.push(`  • ${boldWhite(rId)}: ${dim(rDesc)}`);
		if (count > MAX_CARD_DISPLAY_RULES) ruleLines.push(dim(`  ... and ${count - MAX_CARD_DISPLAY_RULES} more rules.`));
		sections.push(ruleLines);
	}
	const configKey = task.configKey ?? task.manifest?.configKey;
	const configText = configKey ? `  Configurable key: ${boldWhite(configKey)}` : dim("  No configuration required (operates with canonical defaults).");
	sections.push([boldYellow("🛠️ CONFIGURATION (.auditor/audit.config.ts):"), configText]);
	const content = sections.map((sec) => sec.join("\n")).join("\n\n");
	return `${boxen(content, {
		borderColor: "cyan",
		borderStyle: "double",
		padding: {
			top: 0,
			bottom: 0,
			left: 1,
			right: 1
		}
	})}\n`;
}
/**
* Renders the CLI general interactive help (≤ 80 cols).
*/
function renderCliHelp(activeFamilies) {
	const lines = [];
	lines.push(renderBanner("@francogp/auditor — Static Analysis and Architecture Governance Engine", "Node.js 26+ Native | UnifiedTheme Box-Drawing | Zero Hardcoding") + "\n");
	const boldYellow = (s) => styleText(["bold", "yellow"], s);
	lines.push(boldYellow("USAGE:"));
	lines.push("  auditor [options] [commands]  (or npm run auditor [options])");
	lines.push("  ↳ npm note: use \"npm run auditor:help\" or \"npm run auditor help\" (npm intercepts \"--help\" directly).\n");
	lines.push(boldYellow("DISCOVERY & INTROSPECTION COMMANDS:"));
	lines.push("  --list, list                 Lists all discovered suites and their capabilities.");
	lines.push("  --list --enabled             Lists exclusively active/enabled suites in config.");
	lines.push("  --list --disabled            Lists exclusively deactivated/disabled suites in config.");
	lines.push("  --list --json                Emits the complete catalog in structured JSON format.");
	lines.push("  --info=<id>, info <id>       Shows technical card, evaluated rules, and configuration for a suite.");
	lines.push("  --guide=<id>, guide <id>     Shows remediation guide and solutions for a rule or suite.");
	lines.push("  -h, --help, help             Shows this interactive help catalog.\n");
	lines.push(boldYellow("DETERMINISTIC REFACTORING ENGINES (ZERO LLM TOKENS):"));
	lines.push("  npm run auditor:types        Remediation of as any, double casts, and return contracts.");
	lines.push("  npm run auditor:domain       Remediation of naked strings, unbranded catalogs, and raw IDs.");
	lines.push("  npm run auditor:dupes        Deduplication of syntactic clones and triplicates.");
	lines.push("  npm run auditor:magic        Extraction of magic numbers to design tokens.");
	lines.push("  npm run auditor:motion       Governance of UI animations and forbidden timers.");
	lines.push("  npm run auditor:o1           Optimization of linear O(N) searches to O(1).");
	lines.push("  ↳ Common subcommands: discover, inspect <file>, apply <plan.json>, help\n");
	lines.push(boldYellow("MODES, FORMATS & EXECUTION PHASES:"));
	lines.push("  format=compact (default)     Concise, direct output optimized for AI agents.");
	lines.push("  human, format=human          Human interactive mode with full Box-Drawing tables (or npm run auditor:human).");
	lines.push("  fix, --fix                   Repair mode: runs suites with auto-fix capability.");
	lines.push("  speed=light|heavy|full       Execution speed ceiling (default: heavy 🐢).");
	lines.push("  only-speed=light|heavy|full  Runs exclusively suites declaring that exact speed.");
	lines.push("  phase=post-build             Suites validating compiled dist/ artifacts.");
	lines.push("  preset=md                    Fast documentation and Markdown preset.");
	lines.push("  --with-build                 Includes post-build suites in general run.\n");
	lines.push(boldYellow("FILTERS & SELECTION:"));
	lines.push(`  family=<name>                Filters by family (${activeFamilies.join(", ")}).`);
	lines.push("  task=<id>, suites=<id1,id2>  Runs exclusively specified suite(s).");
	lines.push("  rule=<id1,id2>               Filters specific rules.");
	lines.push("  --errors-only                Displays errors only, suppressing warnings.");
	lines.push("  changed-since=<ref>          Filters files changed relative to git ref.\n");
	lines.push(boldYellow("ASSOCIATED TOOLS (NPM SCRIPTS):"));
	lines.push("  npm run auditor:help         Shows this interactive command catalog.");
	lines.push("  npm run auditor:guide -- <r> Consults the remediation manual for a rule.");
	lines.push("  npm run auditor:lint         Fast audit (speed=light 🐇).");
	lines.push("  npm run auditor:full         Exhaustive pre-build audit (speed=full 🐘).");
	lines.push("  npm run auditor:post-build   Audit of compiled artifacts (phase=post-build).");
	lines.push("  npm run auditor:by-file      Hierarchical issue tree by file and line.");
	lines.push("  npm run auditor:findings     Interactive query with filters and breakdowns.");
	lines.push("  npm run auditor:rules        Consolidated breakdown grouped and sorted by rule.");
	lines.push("  npm run auditor:fix          Applies mechanical auto-repairs in code.");
	lines.push("  npm run auditor:update       Updates upstream @francogp/auditor package.\n");
	return lines.join("\n");
}
function renderFamilyHeader(meta) {
	const line = "─".repeat(72);
	return styleText("bold", `\n${meta.icon} [FAMILY ${meta.order}] ${meta.title}\n${styleText("dim", `  ${line}`)}`);
}
const AUDIT_BADGE_STATUSES = [
	"passed",
	"failed",
	"warning",
	"info",
	"skipped"
];
function formatStatusBadge(status) {
	switch (status) {
		case "passed": return `[ ${styleText("green", "✅ PASS")} ]`;
		case "failed": return `[ ${styleText("red", "❌ FAIL")} ]`;
		case "warning": return `[ ${styleText("yellow", "⚠️ WARN")} ]`;
		case "info": return `[ ${styleText("cyan", "ℹ️ INFO")} ]`;
		case "skipped": return `[ ${styleText("cyan", "⏭️ SKIP")} ]`;
	}
}
const METRIC_COL_WIDTH = 16;
function formatTaskMetricCol(metrics) {
	const entries = Object.entries(metrics || {});
	if (entries.length === 0) return " ".repeat(METRIC_COL_WIDTH);
	const [k, v] = entries[0];
	const primaryMetric = `${typeof v === "number" ? formatNumber(v) : v} ${k.split(" ")[0] ?? ""}`.trim();
	return (primaryMetric.length > METRIC_COL_WIDTH ? primaryMetric.slice(0, 15) + "…" : primaryMetric).padEnd(METRIC_COL_WIDTH);
}
function computeTaskBadge(status, errors, warnings) {
	if (status === "skipped") return formatStatusBadge("skipped");
	if (status !== "passed" || errors > 0) return formatStatusBadge("failed");
	if (warnings > 0) return formatStatusBadge("warning");
	return formatStatusBadge("passed");
}
const COUNT_BADGE_COLORS = ["red", "yellow"];
function formatTaskCount(count, icon, color) {
	const text = `${formatNumber(count)} ${icon}`.padStart(6);
	return count > 0 ? styleText(color, text) : styleText("dim", text);
}
const TASK_NAME_COL_WIDTH = 38;
function renderAuditTaskRow(res) {
	const errors = res.summary?.errors ?? (res.status === "failed" ? 1 : 0);
	const warnings = res.summary?.warnings ?? 0;
	const badge = computeTaskBadge(res.status, errors, warnings);
	const nameStr = res.name.length > 38 ? res.name.slice(0, 37) + "…" : res.name.padEnd(38);
	const durationStr = formatDuration(res.durationMs);
	const metricStr = formatTaskMetricCol(res.metrics);
	const errStr = formatTaskCount(errors, "❌", "red");
	const warnStr = formatTaskCount(warnings, "⚠️", "yellow");
	return `  ${badge} │ ${styleText("bold", nameStr)} │ ${styleText("dim", durationStr)} │ ${metricStr} │ ${errStr} │ ${warnStr}`;
}
function renderConsolidatedFooter(suitesTotal, suitesPassed, totalErrors, totalWarnings, totalDurationMs, errorFindings, suitesSkipped = 0) {
	const statusText = totalErrors === 0 ? styleText(["bold", "green"], "🎉 GLOBAL AUDIT SUITE PASSED!") : styleText(["bold", "red"], "🚨 GLOBAL AUDIT FAILED WITH CRITICAL ERRORS");
	const skippedNote = suitesSkipped > 0 ? ` (${formatNumber(suitesSkipped)} Skipped)` : "";
	const rawLines = [
		statusText,
		styleText("dim", `Total Duration: ${formatDurationMs(totalDurationMs)} | Suites: ${formatNumber(suitesPassed)}/${formatNumber(suitesTotal)} Passed${skippedNote}`),
		`Errors: ${totalErrors === 0 ? styleText("green", "0") : styleText("red", formatNumber(totalErrors))}  |  Warnings: ${totalWarnings === 0 ? styleText("green", "0") : styleText("yellow", formatNumber(totalWarnings))}`
	];
	if (errorFindings && errorFindings.length > 0) rawLines.push(...renderSampleErrors(errorFindings));
	const borderColor = totalErrors > 0 ? "red" : totalWarnings > 0 ? "yellow" : "green";
	return `\n${boxen(rawLines.join("\n"), {
		borderColor,
		borderStyle: "double",
		padding: {
			top: 0,
			bottom: 0,
			left: 1,
			right: 1
		}
	})}\n`;
}
export { AUDIT_BADGE_STATUSES, COUNT_BADGE_COLORS, DURATION_PAD_LENGTH, NOTICE_BOX_COLORS, TASK_NAME_COL_WIDTH, TEXT_ALIGNMENTS, buildNoticeBox, extractPhaseBreakdown, formatDuration, formatDurationMs, formatFindingEntry, formatNumber, formatSampleErrorLine, formatStatusBadge, groupFindingsByFile, padVisual, renderAuditTaskRow, renderAuditorDetailCard, renderAuditorsRegistryTable, renderAutoFixCompletionBanner, renderAutoFixNoticeBanner, renderBanner, renderBoxTable, renderCliHelp, renderConsolidatedFooter, renderExecutiveFailSummary, renderExecutiveFixSummary, renderExecutivePassSummary, renderExecutiveSetupBlockingSummary, renderFamilyHeader, renderFindingsBreakdownTable, renderFindingsByFileTree, renderFindingsDetail, renderMarkdownReport, renderSampleErrors, renderSampleFindings, renderSetupBlockingBanner, renderSimilarCodeWarningBanner, renderTieredFindingsBreakdownTable, stringWidth, themeStyles, truncateVisual };
