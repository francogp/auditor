#!/usr/bin/env -S node --experimental-strip-types
import { assertAuditConfigComplete } from "../core/auditConfigValidators.js";
import { AUDITOR_VERSION } from "../core/version.js";
import { safeJsonParse, safeReadFileAsync, safeRmSync } from "../core/safeUtils.js";
import { buildRatchetConfig } from "../core/auditConfigBuilders.js";
import { loadAuditConfig, sanitizePath } from "../core/auditConfigLoader.js";
import "../core/auditConfig.js";
import { REMEDIATION_PHASE_IDS, getRemediationPhaseMetadata } from "../core/remediationPhases.js";
import { getActiveFamilies, groupFindingsByFileMap, groupResultsByFamily, normalizeSpeeds, resolveFamilyMetadata, sortFindingsByFileAndLine } from "../core/auditContract.js";
import { COMMON_CLI_ARGS, getProcessCliArgs, parseCittyArgs } from "../core/cli/cittyHarness.js";
import "../core/permissionGuard.js";
import { COVERAGE_EXPECTED_SUITES_ENV, COVERAGE_LEDGER_DIR, COVERAGE_RUN_ID_ENV, COVERAGE_RUN_MODE_ENV } from "../core/auditCoverage.js";
import { stringWidth } from "../core/terminalVisuals.js";
import { formatDurationMs, formatNumber } from "../core/durationFormatter.js";
import { renderMarkdownReport } from "../core/markdownReport.js";
import { extractPhaseBreakdown, renderExecutiveFailSummary, renderExecutiveFixSummary, renderExecutivePassSummary, renderExecutiveSetupBlockingSummary } from "../core/executiveTheme.js";
import { renderAuditorDetailCard, renderAuditorsRegistryTable, renderAutoFixCompletionBanner, renderAutoFixNoticeBanner, renderBanner, renderCliHelp, renderConsolidatedFooter, renderFindingsBreakdownTable, renderSampleFindings, renderSetupBlockingBanner, renderSimilarCodeWarningBanner, renderTieredFindingsBreakdownTable } from "../core/unifiedTheme.js";
import { bootstrapCliProject, isHumanConsoleMode, isMainModule } from "./cliUtils.js";
import { evaluateSuiteStatus } from "../core/suiteGating.js";
import { BaseAuditor } from "../core/auditorBase.js";
import { SharedAstContext } from "../core/astContext.js";
import { TaskStreamCoordinator, executeAuditorStreaming, isNodeInternalWarning } from "../core/streamingRunner.js";
import { discoverAuditors } from "./auditScanner.js";
import { migrateLegacyAuditConfig } from "./migrateAuditConfig.js";
import { ensureProjectBootstrapped } from "../core/auditBootstrap.js";
import { initWarningBaseline, runWarningRatchet } from "./auditRatchet.js";
import { findRuleGuide, renderFamilyGuideIndex, renderGlobalGuideIndex, renderRuleGuideCard, renderSuiteGuideCards } from "./guideRenderer.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs/promises";
import { styleText } from "node:util";
import { pathToFileURL } from "node:url";
import os from "node:os";
// src/cli/audit_full.ts
/**
* scripts/maintenance/audit_full.ts
*
* MASTER AUDIT ORCHESTRATOR & UNIFIED RUNNER (Node.js 26+)
* Dynamically discovers and executes all sub-auditors in scripts/auditors/:
*   1. Displays formatted step-by-step progress with clean newlines.
*   2. Renders the complete Box-Drawing summary table grouped by family.
*   3. Persists the complete structured JSON report to scratch/audits/latest_audit.json.
*/
enableCompileCache();
const CPU_CORE_DIVISOR = 2;
const MIN_CONCURRENCY = 1;
const DECIMAL_RADIX = 10;
const DEFAULT_SUBPROCESS_TIMEOUT_MS = 0;
function resolveTargetFamily(familyOption, positionals, activeFamilies) {
	const positionalFamily = positionals.find((p) => activeFamilies.includes(p));
	return familyOption || positionalFamily;
}
function resolveFormattedRules(values, positionals) {
	const rawRuleArgs = [];
	if (values.rule) {
		const list = Array.isArray(values.rule) ? values.rule : [values.rule];
		for (const item of list) rawRuleArgs.push(String(item));
	}
	if (values.rules) {
		const list = Array.isArray(values.rules) ? values.rules : [values.rules];
		for (const item of list) rawRuleArgs.push(String(item));
	}
	for (const pos of positionals) if (pos.toLowerCase() === "dox" || pos.includes(",")) rawRuleArgs.push(pos);
	return rawRuleArgs.join(",");
}
function toOptionString(v) {
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return "";
}
function resolveTargetSuites(values) {
	if (values["only-suite"]) return toOptionString(values["only-suite"]).split(",").map((s) => s.trim()).filter(Boolean);
	if (values["only-task"]) return toOptionString(values["only-task"]).split(",").map((s) => s.trim()).filter(Boolean);
	if (values.suites) return toOptionString(values.suites).split(",").map((s) => s.trim()).filter(Boolean);
	if (values.suite) return toOptionString(values.suite).split(",").map((s) => s.trim()).filter(Boolean);
	if (values.tasks) return toOptionString(values.tasks).split(",").map((s) => s.trim()).filter(Boolean);
	if (typeof values.task === "string" && values.task.includes(",")) return values.task.split(",").map((s) => s.trim()).filter(Boolean);
}
function resolveConcurrencyLimit(concurrencyValue) {
	const availableCpus = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
	const defaultConcurrency = Math.max(MIN_CONCURRENCY, Math.floor(availableCpus / CPU_CORE_DIVISOR));
	if (concurrencyValue) return Math.max(MIN_CONCURRENCY, Number.parseInt(concurrencyValue, DECIMAL_RADIX) || defaultConcurrency);
	return defaultConcurrency;
}
function resolveSkipSimilar() {
	return process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS === "true" || process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS === "1" || process.env.AUDIT_SKIP_SIMILAR === "true" || process.env.AUDIT_SKIP_SIMILAR === "1";
}
function resolveTargetPreset(values, positionals) {
	if (values.preset) return values.preset;
	if (values.critical || positionals.includes("critical")) return "critical";
	if (values["post-build"] || positionals.includes("post-build") || values.phase === "post-build") return "post-build";
	if (values.full || positionals.includes("full") || values.speed === "full") return "full";
	if (values.speed === "light" || positionals.includes("lint")) return "lint";
	if (values.md || positionals.includes("md")) return "md";
}
const AUDIT_SPEED_NAMES = /* @__PURE__ */ new Set([
	"light",
	"heavy",
	"full"
]);
const AUDIT_PHASE_NAMES = /* @__PURE__ */ new Set([
	"setup",
	"normal",
	"post-run",
	"post-build"
]);
function parseSpeedValue(raw) {
	if (typeof raw === "string" && AUDIT_SPEED_NAMES.has(raw)) return raw;
}
function parsePhaseValue(raw) {
	if (typeof raw === "string" && AUDIT_PHASE_NAMES.has(raw)) return raw;
}
function resolveConsoleMode(values, positionals) {
	if (isHumanConsoleMode({
		human: values.human === true,
		verbose: values.verbose === true,
		format: typeof values.format === "string" ? values.format : void 0
	}, positionals)) return "human";
	return "compact";
}
const AUDIT_FULL_ARGS = {
	...COMMON_CLI_ARGS,
	subcommand: {
		type: "positional",
		required: false,
		description: "Subcommand to run (e.g. guide, fix, critical, human)"
	},
	subcommandTarget: {
		type: "positional",
		required: false,
		description: "Target rule or suite for guide or subcommand"
	},
	list: {
		type: "boolean",
		alias: "l",
		description: "List available auditor suites"
	},
	info: {
		type: "string",
		description: "Show detailed metadata for a suite"
	},
	enabled: {
		type: "boolean",
		description: "Filter list by enabled suites"
	},
	disabled: {
		type: "boolean",
		description: "Filter list by disabled suites"
	},
	critical: {
		type: "boolean",
		description: "Run only critical suites"
	},
	family: {
		type: "string",
		description: "Filter suites by family"
	},
	task: {
		type: "string",
		description: "Filter by single task ID"
	},
	tasks: {
		type: "string",
		description: "Comma-separated list of task IDs"
	},
	suites: {
		type: "string",
		description: "Comma-separated list of suite IDs"
	},
	suite: {
		type: "string",
		description: "Filter by suite ID"
	},
	"only-suite": {
		type: "string",
		description: "Run only specified suite(s)"
	},
	"only-task": {
		type: "string",
		description: "Run only specified task(s)"
	},
	guide: {
		type: "string",
		description: "Show remediation guide for a rule or suite"
	},
	preset: {
		type: "string",
		description: "Execution preset (lint, full, critical, md, post-build)"
	},
	speed: {
		type: "string",
		description: "Target speed tier (light, heavy, full)"
	},
	"only-speed": {
		type: "string",
		description: "Exclusive speed tier filter"
	},
	phase: {
		type: "string",
		description: "Execution phase filter (setup, normal, post-run, post-build)"
	},
	concurrency: {
		type: "string",
		description: "Maximum parallel worker concurrency"
	},
	output: {
		type: "string",
		alias: "o",
		description: "Custom output path for report"
	},
	"changed-since": {
		type: "string",
		description: "Git ref to filter changed files"
	},
	"errors-only": {
		type: "boolean",
		description: "Report only error-severity findings"
	},
	all: {
		type: "boolean",
		alias: "a",
		description: "Include post-build and all suites"
	},
	top: {
		type: "string",
		alias: "t",
		description: "Limit top findings displayed"
	},
	rule: {
		type: "string",
		alias: "r",
		description: "Filter by rule ID"
	},
	rules: {
		type: "string",
		description: "Filter by rule IDs"
	},
	fix: {
		type: "boolean",
		description: "Run in automatic repair mode"
	},
	"post-build": {
		type: "boolean",
		description: "Run post-build artifact verification suites"
	},
	full: {
		type: "boolean",
		description: "Run full comprehensive verification"
	},
	"with-build": {
		type: "boolean",
		description: "Include post-build suites in run"
	},
	"init-baseline": {
		type: "boolean",
		description: "Initialize warning ratchet baseline"
	}
};
function parseAuditFullCliArgs(activeFamilies, rawArgs = getProcessCliArgs()) {
	const parsed = parseCittyArgs(AUDIT_FULL_ARGS, rawArgs);
	const positionals = parsed._.map(String);
	const values = {
		...parsed,
		fix: Boolean(parsed.fix) || positionals.includes("fix")
	};
	const targetPreset = resolveTargetPreset(values, positionals);
	const explicitSpeed = parseSpeedValue(values.speed) ?? (targetPreset === "full" ? "full" : targetPreset === "lint" ? "light" : void 0);
	const onlySpeed = parseSpeedValue(values["only-speed"]);
	const explicitPhase = parsePhaseValue(values.phase) ?? (targetPreset === "post-build" ? "post-build" : void 0);
	const consoleMode = resolveConsoleMode(values, positionals);
	return {
		values,
		positionals,
		project: typeof values.project === "string" && values.project !== "." ? values.project : void 0,
		targetFamily: resolveTargetFamily(values.family, positionals, activeFamilies),
		formattedRules: resolveFormattedRules(values, positionals),
		targetPreset,
		targetSuites: resolveTargetSuites(values),
		speed: explicitSpeed,
		onlySpeed,
		phase: explicitPhase,
		concurrencyLimit: resolveConcurrencyLimit(values.concurrency),
		skipSimilar: resolveSkipSimilar(),
		isEnabledFilter: Boolean(values.enabled || positionals.includes("enabled") || positionals.includes("list:enabled")),
		isDisabledFilter: Boolean(values.disabled || positionals.includes("disabled") || positionals.includes("list:disabled")),
		consoleMode
	};
}
function determineRunMode(targetPreset, targetSuites, taskArg, targetFamily, extraOptions) {
	if (targetPreset === "full") return "full";
	if (targetPreset) return "preset";
	if (targetSuites && targetSuites.length > 1) return "suites";
	if (taskArg || targetSuites && targetSuites.length === 1) return "single";
	if (targetFamily) return "family";
	if (extraOptions?.speed === "light" || Boolean(extraOptions?.onlySpeed) || extraOptions?.phase === "post-build" || Boolean(extraOptions?.changedOnly)) return "preset";
	return "full";
}
function buildTaskArgs(task, values, formattedRules) {
	const taskArgs = [...task.args];
	if (values["errors-only"] && !taskArgs.includes("--errors-only")) taskArgs.push("--errors-only");
	if (formattedRules && !taskArgs.includes("--rule")) taskArgs.push("--rule", formattedRules);
	if (values.top && !taskArgs.includes("--top")) taskArgs.push("--top", values.top);
	if (values.speed && !taskArgs.includes("--speed")) taskArgs.push("--speed", toOptionString(values.speed));
	if (values["only-speed"] && !taskArgs.includes("--only-speed")) taskArgs.push("--only-speed", toOptionString(values["only-speed"]));
	if (values["changed-since"] && task.capabilities?.changedOnly && !taskArgs.includes("--changed-since")) taskArgs.push("--changed-since", values["changed-since"]);
	if (values.fix && !taskArgs.includes("fix")) taskArgs.push("fix");
	return taskArgs;
}
async function executeTaskInProcess(task, sharedAstContext, onSubLine) {
	const taskStart = performance.now();
	try {
		const baseDir = process.env.AUDITOR_HOME_DIR ?? process.cwd();
		const fullScriptPath = path.isAbsolute(task.scriptPath) ? task.scriptPath : path.resolve(baseDir, task.scriptPath);
		const mod = await import(pathToFileURL(fullScriptPath).href);
		let AuditorClass;
		for (const val of Object.values(mod)) if (typeof val === "function" && val.prototype instanceof BaseAuditor) {
			AuditorClass = val;
			break;
		}
		if (AuditorClass) {
			const auditor = new AuditorClass();
			if (onSubLine) {
				auditor.setStepLogger((stepNumber, totalSteps, description) => {
					onSubLine(`🔍 [${stepNumber}/${totalSteps}] ${description}`);
				});
				auditor.setProgressLogger((msg) => {
					onSubLine(msg);
				});
			}
			const result = await auditor.execute(sharedAstContext);
			const durationMs = Math.round(performance.now() - taskStart);
			result.durationMs = durationMs;
			return {
				result,
				durationMs
			};
		}
	} catch (err) {
		if (process.env.DEBUG === "true") console.warn(`[AuditFull] in-process execution failed for ${task.id}: ${err.message}`);
	}
	return null;
}
async function tryReadTaskResult(taskJsonPath, stdout, durationMs) {
	const fileContent = await safeReadFileAsync(taskJsonPath);
	if (fileContent) {
		const parsed = safeJsonParse(fileContent);
		if (parsed) {
			if (parsed.durationMs === void 0 || parsed.durationMs === 0) parsed.durationMs = durationMs;
			return parsed;
		}
	}
	if (stdout) {
		const raw = stdout.trim();
		const firstBrace = raw.indexOf("{");
		const lastBrace = raw.lastIndexOf("}");
		if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
			const parsed = safeJsonParse(raw.substring(firstBrace, lastBrace + 1));
			if (parsed) {
				if (parsed.durationMs === void 0 || parsed.durationMs === 0) parsed.durationMs = durationMs;
				return parsed;
			}
		}
	}
	return null;
}
function extractSubprocessErrorMessage(proc, timeoutMs = DEFAULT_SUBPROCESS_TIMEOUT_MS, task) {
	if (proc.timedOut) {
		if (task) return `Timeout exceeded (${timeoutMs}ms) while executing auditor '${task.name}' (${task.id}).`;
		return `Timeout exceeded (${timeoutMs}ms) during suite execution.`;
	}
	const cleanStderr = proc.stderr.split("\n").filter((l) => !isNodeInternalWarning(l.trim()) && l.trim().length > 0).join("\n").trim();
	const cleanStdout = proc.stdout.split("\n").filter((l) => !isNodeInternalWarning(l.trim()) && l.trim().length > 0).join("\n").trim();
	return cleanStderr || cleanStdout || `Exit code ${proc.status}`;
}
async function parseSubprocessOutput(task, proc, scratchAuditsDir) {
	const parsed = await tryReadTaskResult(path.join(scratchAuditsDir, task.family, `${task.id}.json`), proc.stdout, proc.durationMs);
	if (parsed) return parsed;
	const isSuccess = !proc.timedOut && proc.status === 0;
	const findings = [];
	if (!isSuccess) {
		const errorMsg = extractSubprocessErrorMessage(proc, task.timeoutMs ?? DEFAULT_SUBPROCESS_TIMEOUT_MS, task);
		findings.push({
			severity: "error",
			message: errorMsg,
			file: task.scriptPath
		});
	}
	return {
		id: task.id,
		name: task.name,
		description: task.description || task.name,
		family: task.family,
		status: isSuccess ? "passed" : "failed",
		durationMs: proc.durationMs,
		metrics: {},
		findings,
		summary: {
			errors: isSuccess ? 0 : 1,
			warnings: 0,
			info: 0
		}
	};
}
async function runAuditWorkers(tasks, concurrency, taskExecutor) {
	const results = Array.from({ length: tasks.length });
	let nextTaskIndex = 0;
	async function worker() {
		while (nextTaskIndex < tasks.length) {
			const idx = nextTaskIndex++;
			results[idx] = await taskExecutor(tasks[idx], idx);
		}
	}
	const workerCount = Math.min(concurrency, tasks.length);
	const workers = Array.from({ length: workerCount }, () => worker());
	await Promise.all(workers);
	return results;
}
const ERROR_WEIGHT_FACTOR = 1e3;
function sortCategoryEntries(entries) {
	return entries.sort((a, b) => {
		return b[1].errors * ERROR_WEIGHT_FACTOR + b[1].warnings - (a[1].errors * ERROR_WEIGHT_FACTOR + a[1].warnings);
	});
}
function computeAuditCategoryCounts(results) {
	const categoryCounts = /* @__PURE__ */ new Map();
	for (const suite of results) for (const finding of suite.findings || []) {
		const catKey = finding.ruleDescription ?? finding.ruleId ?? suite.name;
		if (!categoryCounts.has(catKey)) categoryCounts.set(catKey, {
			errors: 0,
			warnings: 0,
			findings: []
		});
		const entry = categoryCounts.get(catKey);
		if (finding.severity === "error") entry.errors++;
		else entry.warnings++;
		entry.findings.push(finding);
	}
	return sortCategoryEntries(Array.from(categoryCounts.entries()));
}
function computeTieredAuditCategoryCounts(results) {
	const phaseMaps = /* @__PURE__ */ new Map();
	for (const phaseId of REMEDIATION_PHASE_IDS) phaseMaps.set(phaseId, /* @__PURE__ */ new Map());
	for (const suite of results) for (const finding of suite.findings || []) {
		const phase = finding.remediationPhase ?? "hygiene";
		const catMap = phaseMaps.get(phase) ?? phaseMaps.get("hygiene");
		const catKey = finding.ruleDescription ?? finding.ruleId ?? suite.name;
		if (!catMap.has(catKey)) catMap.set(catKey, {
			errors: 0,
			warnings: 0,
			findings: []
		});
		const entry = catMap.get(catKey);
		if (finding.severity === "error") entry.errors++;
		else entry.warnings++;
		entry.findings.push(finding);
	}
	const groups = [];
	for (const phaseId of REMEDIATION_PHASE_IDS) {
		const catMap = phaseMaps.get(phaseId);
		if (catMap.size === 0) continue;
		const items = sortCategoryEntries(Array.from(catMap.entries()));
		const errors = items.reduce((sum, [, d]) => sum + d.errors, 0);
		const warnings = items.reduce((sum, [, d]) => sum + d.warnings, 0);
		groups.push({
			phaseId,
			items,
			errors,
			warnings
		});
	}
	return groups;
}
function formatSetupBlockingRemediationHint(setupErrors, hasFixableErrors = false) {
	return `   Resolve the ${setupErrors} configuration error(s) first${hasFixableErrors ? " (e.g. 'npm run auditor:fix')" : " manually (see error details above; no automatic fix available)"} to unblock full project analysis.\n`;
}
function printFindingsSummary(results, sortedCategories, blockingContext, tieredGroups) {
	if (sortedCategories.length === 0) {
		console.log("\n" + styleText(["bold", "green"], `✨ 100% of suites passed (${results.length}/${results.length}) with zero errors or warnings.`));
		return;
	}
	if (blockingContext?.isSetupBlocking) {
		console.log("\n" + renderSetupBlockingBanner(blockingContext.setupErrors, blockingContext.postponedAppErrors, {
			hasLockfileMismatch: blockingContext.hasLockfileMismatch,
			hasEngineMismatch: blockingContext.hasEngineMismatch,
			hasFixableErrors: blockingContext.hasFixableErrors
		}) + "\n");
		console.log(styleText("bold", "📊 EXCLUSIVE SETUP & PROJECT BREAKDOWN (PHASE 1: SETUP):\n"));
		if (tieredGroups && tieredGroups.length > 0) console.log(renderTieredFindingsBreakdownTable(tieredGroups, "ISSUE TYPE / SETUP RULE"));
		else console.log(renderFindingsBreakdownTable(sortedCategories, "ISSUE TYPE / SETUP RULE"));
		const setupErrors = sortedCategories.flatMap(([, data]) => data.findings.filter((f) => f.severity === "error"));
		if (setupErrors.length > 0) console.log(renderSampleFindings(setupErrors, 5));
		console.log(styleText(["yellow", "bold"], blockingContext.postponedAppErrors > 0 ? `\n⚠️  ATTENTION: Reporting of ${formatNumber(blockingContext.postponedAppErrors)} application error(s) was postponed to prevent induced false positives.` : "\n⚠️  ATTENTION: Downstream application code checks are halted until setup errors are resolved."));
		console.log(styleText("dim", formatSetupBlockingRemediationHint(blockingContext.setupErrors, Boolean(blockingContext.hasFixableErrors))));
	} else {
		console.log("\n" + styleText("bold", "📊 BREAKDOWN BY ISSUE TYPE & SEVERITY (STRATEGIC RESOLUTION ORDER):\n"));
		if (tieredGroups && tieredGroups.length > 0) console.log(renderTieredFindingsBreakdownTable(tieredGroups, "ISSUE TYPE / RULE"));
		else console.log(renderFindingsBreakdownTable(sortedCategories, "ISSUE TYPE / RULE"));
		const allErrors = results.flatMap((suite) => (suite.findings || []).filter((f) => f.severity === "error"));
		if (allErrors.length > 0) console.log(renderSampleFindings(allErrors, 5));
	}
}
function buildConsolidatedReport(params) {
	const { ctx, totalErrors, totalWarnings, suitesPassed, anyFailed, isFullAudit, byFamily, ratchet, setupBlocking, setupErrors, postponedAppErrors } = params;
	const meta = {
		version: AUDITOR_VERSION,
		timestamp: Temporal.Now.instant().toString(),
		isFullAudit,
		runMode: ctx.runMode,
		preset: ctx.cliOptions.targetPreset ?? null,
		targetFamily: ctx.cliOptions.targetFamily ?? null,
		totalDiscoveredSuites: ctx.allAvailableTasks.length,
		executedSuiteCount: ctx.tasksToRun.length,
		executedSuites: ctx.tasksToRun.map((t) => t.id),
		omittedSuites: ctx.omittedSuiteIds,
		skipSimilar: ctx.cliOptions.skipSimilar || void 0,
		setupBlocking: setupBlocking || void 0,
		setupErrors: setupBlocking ? setupErrors : void 0,
		postponedAppErrors: setupBlocking ? postponedAppErrors : void 0,
		ratchet,
		environment: {
			nodeVersion: process.version,
			platform: process.platform,
			cwd: process.cwd()
		}
	};
	const rawFindings = ctx.results.flatMap((r) => r.findings);
	const sortedFindings = sortFindingsByFileAndLine(rawFindings);
	const fileSummaryMap = groupFindingsByFileMap(sortedFindings);
	const findingsByFile = {};
	for (const [file, summary] of Object.entries(fileSummaryMap)) findingsByFile[file] = summary.findings;
	return {
		meta,
		consolidatedReport: {
			meta,
			status: anyFailed ? "failed" : "passed",
			summary: {
				totalViolations: totalErrors + totalWarnings,
				errors: totalErrors,
				warnings: totalWarnings,
				suitesTotal: ctx.results.length,
				suitesPassed,
				suitesFailed: ctx.results.length - suitesPassed,
				durationMs: ctx.totalDuration,
				...params.fixableErrors !== void 0 && { fixableErrors: params.fixableErrors },
				...params.fixableWarnings !== void 0 && { fixableWarnings: params.fixableWarnings },
				...params.autoFixRecommended !== void 0 && { autoFixRecommended: params.autoFixRecommended },
				...params.autoFixRecommended && { autoFixCommand: "npm run auditor:fix" }
			},
			families: Object.fromEntries(ctx.activeFamilies.map((f) => [f, {
				title: resolveFamilyMetadata(f, ctx.config.customFamilies).title,
				suites: byFamily.get(f) ?? []
			}])),
			allFindings: sortedFindings,
			findingsByFile,
			remediationPhases: (() => {
				const summary = {};
				for (const phaseId of REMEDIATION_PHASE_IDS) {
					const pMeta = getRemediationPhaseMetadata(phaseId);
					summary[phaseId] = {
						title: pMeta.title,
						order: pMeta.order,
						errors: 0,
						warnings: 0,
						violations: 0
					};
				}
				for (const f of rawFindings) {
					const entry = summary[f.remediationPhase ?? "hygiene"] ?? summary["hygiene"];
					if (f.severity === "error") entry.errors++;
					else entry.warnings++;
					entry.violations++;
				}
				return summary;
			})()
		},
		fileSummaryMap
	};
}
async function exportCustomOutputReport(cliOptions, consolidatedReport, results, suitesPassed, totalDuration) {
	if (!cliOptions.values.output) return;
	const outputPath = path.resolve(process.cwd(), cliOptions.values.output);
	if (outputPath.endsWith(".json")) await fs.writeFile(outputPath, JSON.stringify(consolidatedReport, null, 2), "utf-8");
	else if (outputPath.endsWith(".md")) {
		const md = renderMarkdownReport(results, suitesPassed, totalDuration);
		await fs.writeFile(outputPath, md, "utf-8");
	} else {
		const lines = results.map((r) => `[${r.status.toUpperCase()}] ${r.name} (${r.durationMs}ms) - Errors: ${r.summary.errors}, Warnings: ${r.summary.warnings}`);
		await fs.writeFile(outputPath, lines.join("\n"), "utf-8");
	}
	console.log(styleText("cyan", `✨ Reporte exportado en: ${outputPath}\n`));
}
/** Ratchet applies only to the canonical full run: every default suite, no filters, no build/fix mode. */
function isRatchetScope(cliOptions, isFullAudit) {
	const v = cliOptions.values;
	return isFullAudit && !cliOptions.formattedRules && !v["errors-only"] && !v.top && !v["changed-since"] && !v["with-build"] && !v.all;
}
function printRatchetVerdict(verdict, newWarnings, baselineFile, consoleMode = "human") {
	if (consoleMode === "compact") {
		if (verdict.status === "passed") return;
		if (verdict.newWarnings > 0) {
			console.log(styleText(["bold", "red"], `\n🔒 Ratchet Failed: ${verdict.newWarnings} new warning(s) relative to '${verdict.productionRef}'.`));
			return;
		}
		if (verdict.error) {
			console.log(styleText(["bold", "red"], `\n🔒 Ratchet Blocked: ${verdict.error}\n`));
			return;
		}
		if (verdict.status === "initialized") {
			console.log(styleText(["bold", "green"], `\n🔒 Warning baseline created (${verdict.resolvedWarnings} warnings) at ${baselineFile}.\n`));
			return;
		}
		return;
	}
	if (verdict.status === "initialized") {
		console.log(styleText(["bold", "green"], `\n🔒 Warnings baseline created (${verdict.resolvedWarnings} warnings) at ${baselineFile}.`));
		console.log(styleText("dim", `   Commit and publish it to '${verdict.productionRef}' to activate the ratchet.\n`));
		return;
	}
	if (verdict.error) {
		console.log(styleText(["bold", "red"], `\n🔒 WARNINGS RATCHET BLOCKED: ${verdict.error}\n`));
		return;
	}
	if (verdict.newWarnings > 0) {
		console.log(styleText(["bold", "red"], `\n🔒 WARNINGS RATCHET: ${verdict.newWarnings} NEW warning(s) compared to '${verdict.productionRef}'. Must be fixed.`));
		console.log(renderSampleFindings(newWarnings, 5));
		return;
	}
	const shrinkNote = verdict.baselineUpdated ? ` Baseline reduced (${verdict.resolvedWarnings} resolved): commit ${baselineFile}.` : "";
	console.log(styleText("green", `\n🔒 Warnings ratchet OK: 0 new compared to '${verdict.productionRef}'.${shrinkNote}\n`));
}
function handleInitBaseline(ratchet, ctx, canWriteBaseline, base) {
	if (!canWriteBaseline || ctx.cliOptions.skipSimilar) throw new Error("--init-baseline requires 0 errors and similar-code analysis enabled.");
	const count = initWarningBaseline(process.cwd(), ratchet, ctx.results);
	return {
		verdict: {
			...base,
			status: "initialized",
			resolvedWarnings: count,
			baselineUpdated: true
		},
		newWarnings: []
	};
}
function handleStandardRatchet(ratchet, ctx, canWriteBaseline, base) {
	const outcome = runWarningRatchet(process.cwd(), ratchet, ctx.results, canWriteBaseline);
	if (outcome.source === "local-bootstrap") console.log(styleText("yellow", `\n⚠️  '${ratchet.productionRef}' does not contain ${ratchet.baselineFile} yet: using local copy (bootstrap). Publish it to lock the ratchet.`));
	return {
		verdict: {
			...base,
			status: outcome.newWarnings.length > 0 ? "failed" : "passed",
			newWarnings: outcome.newWarnings.length,
			resolvedWarnings: outcome.resolvedCount,
			baselineUpdated: outcome.baselineUpdated
		},
		newWarnings: outcome.newWarnings
	};
}
function applyWarningRatchet(ctx, isFullAudit, totalErrors) {
	const ratchet = buildRatchetConfig(ctx.config.ratchet);
	const initRequested = Boolean(ctx.cliOptions.values["init-baseline"]);
	const inScope = isRatchetScope(ctx.cliOptions, isFullAudit);
	if (initRequested && (!ratchet.enabled || !inScope)) throw new Error("[Ratchet] --init-baseline requires ratchet.enabled and a full default run (no preset, family, task, rule, changed-since, build or fix filters).");
	if (!ratchet.enabled) {
		if (inScope && ctx.cliOptions.consoleMode === "human") console.log(styleText("yellow", `\n⚠️  Warnings ratchet DISABLED (ratchet.enabled: false in .auditor/audit.config.ts).\n`));
		return;
	}
	if (!inScope) return void 0;
	const canWriteBaseline = totalErrors === 0;
	const base = {
		productionRef: ratchet.productionRef,
		newWarnings: 0,
		resolvedWarnings: 0,
		baselineUpdated: false
	};
	let verdict;
	let newWarnings = [];
	try {
		const executed = initRequested ? handleInitBaseline(ratchet, ctx, canWriteBaseline, base) : handleStandardRatchet(ratchet, ctx, canWriteBaseline, base);
		verdict = executed.verdict;
		newWarnings = executed.newWarnings;
	} catch (err) {
		verdict = {
			...base,
			status: "failed",
			error: err instanceof Error ? err.message : String(err)
		};
	}
	printRatchetVerdict(verdict, newWarnings, ratchet.baselineFile, ctx.cliOptions.consoleMode);
	return verdict;
}
/**
* Computes strictly fixable errors and warnings according to the Zero False-Fix Mandate.
* A finding is fixable IF AND ONLY IF finding.fixable === true.
* In fix mode (isFixMode === true), any remaining error could not be resolved,
* so fixableErrors and autoFixRecommended are always 0/false.
*/
const computeFixableViolations = BaseAuditor.computeFixableViolations;
async function persistAuditReportsToDisk(params) {
	const prefix = params.isFixMode ? "latest_fix_" : "latest_";
	const byFilePrefix = params.isFixMode ? "by_file_fix.json" : "by_file.json";
	const latestAuditPath = path.join(params.scratchAuditsDir, `${prefix}audit.json`);
	const latestSummaryPath = path.join(params.scratchAuditsDir, `${prefix}summary.json`);
	const latestByFilePath = path.join(params.scratchAuditsDir, byFilePrefix);
	await fs.writeFile(latestAuditPath, JSON.stringify(params.consolidatedReport, null, 2), "utf-8");
	await fs.writeFile(latestSummaryPath, JSON.stringify({
		meta: params.meta,
		status: params.consolidatedReport.status,
		summary: params.consolidatedReport.summary,
		suites: params.results.map((r) => ({
			id: r.id,
			name: r.name,
			family: r.family,
			status: r.status,
			durationMs: r.durationMs,
			metrics: r.metrics,
			errors: r.summary.errors,
			warnings: r.summary.warnings
		}))
	}, null, 2), "utf-8");
	const byFileReport = {
		meta: params.meta,
		status: params.consolidatedReport.status,
		summary: params.consolidatedReport.summary,
		totalAffectedFiles: Object.keys(params.fileSummaryMap).length,
		files: params.fileSummaryMap
	};
	await fs.writeFile(latestByFilePath, JSON.stringify(byFileReport, null, 2), "utf-8");
	return latestAuditPath;
}
async function renderAndPersistMasterReport(ctx) {
	const { results, tasksToRun, allAvailableTasks, omittedSuiteIds, totalDuration, activeFamilies, cliOptions, scratchAuditsDir } = ctx;
	const totalErrors = results.reduce((acc, r) => acc + (r.summary?.errors ?? 0), 0);
	const totalWarnings = results.reduce((acc, r) => acc + (r.summary?.warnings ?? 0), 0);
	const suitesPassed = results.filter((r) => r.status === "passed" && (r.summary?.errors ?? 0) === 0).length;
	const suitesSkipped = results.filter((r) => r.status === "skipped").length;
	const isFixMode = Boolean(cliOptions.values.fix);
	if (isFixMode) {
		const { meta, consolidatedReport, fileSummaryMap } = buildConsolidatedReport({
			ctx,
			totalErrors,
			totalWarnings,
			suitesPassed,
			anyFailed: false,
			isFullAudit: false,
			byFamily: groupResultsByFamily(results, activeFamilies),
			ratchet: void 0,
			fixableErrors: 0,
			fixableWarnings: 0,
			autoFixRecommended: false,
			setupBlocking: false
		});
		await persistAuditReportsToDisk({
			scratchAuditsDir,
			isFixMode: true,
			meta,
			consolidatedReport,
			fileSummaryMap,
			results
		});
		if (cliOptions.consoleMode === "compact") {
			const filesModified = Object.keys(fileSummaryMap ?? {}).length;
			console.log("\n" + renderExecutiveFixSummary({
				durationMs: totalDuration,
				totalViolationsRepaired: totalErrors + totalWarnings,
				filesModified
			}));
		} else console.log("\n" + renderAutoFixCompletionBanner(totalDuration) + "\n");
		await exportCustomOutputReport(cliOptions, consolidatedReport, results, suitesPassed, totalDuration);
		return false;
	}
	const isBuildMode = cliOptions.phase === "post-build" || cliOptions.targetPreset === "post-build" || Boolean(cliOptions.values["post-build"]);
	const isFullAudit = !isBuildMode && !isFixMode && !cliOptions.onlySpeed && (cliOptions.speed === void 0 || cliOptions.speed === "heavy" || cliOptions.speed === "full") && tasksToRun.length === allAvailableTasks.length && omittedSuiteIds.length === 0;
	const byFamily = groupResultsByFamily(results, activeFamilies);
	const setupTaskIds = new Set(allAvailableTasks.filter((t) => t.capabilities?.phase === "setup").map((t) => t.id));
	const setupResults = results.filter((r) => setupTaskIds.has(r.id));
	const setupErrors = setupResults.reduce((acc, r) => acc + (r.summary?.errors ?? 0), 0);
	const isSetupBlocking = setupErrors > 0;
	const postponedAppErrors = results.filter((r) => !setupTaskIds.has(r.id)).reduce((acc, r) => acc + (r.summary?.errors ?? 0), 0);
	const displayResults = isSetupBlocking ? setupResults : results;
	const sortedCategories = computeAuditCategoryCounts(displayResults);
	const tieredGroups = computeTieredAuditCategoryCounts(displayResults);
	const setupFindings = setupResults.flatMap((r) => r.findings ?? []);
	const lockfileMismatchRules = /* @__PURE__ */ new Set([
		"package-lockfile-integrity",
		"dependency-below-minimum-installed",
		"dependency-exceeds-maximum-installed"
	]);
	const hasLockfileMismatch = setupFindings.some((f) => Boolean(f.ruleId && lockfileMismatchRules.has(f.ruleId)));
	const hasEngineMismatch = setupFindings.some((f) => f.ruleId === "environment-runtime-mismatch" || f.ruleId === "environment-engines-below-floor");
	const hasFixableErrors = setupFindings.some((f) => f.fixable && f.severity === "error");
	const hasSimilarCodeSetupFailure = results.some((r) => r.findings?.some((f) => f.ruleId === "fallow-similar-code-failed" && (f.context === "manual-setup-required" || f.context === "model-not-ready")));
	const ratchet = applyWarningRatchet(ctx, isFullAudit, totalErrors);
	const anyFailed = totalErrors > 0 || suitesPassed + suitesSkipped < results.length || ratchet?.status === "failed";
	const { fixableErrors, fixableWarnings, autoFixRecommended } = computeFixableViolations(results, isFixMode);
	if (cliOptions.consoleMode === "compact") {
		if (isSetupBlocking) {
			const blockingSuites = setupResults.filter((r) => (r.summary?.errors ?? 0) > 0).map((r) => `${r.name} (${r.id})`);
			console.log("\n" + renderExecutiveSetupBlockingSummary({
				totalSuites: results.length,
				setupErrors,
				postponedAppErrors,
				durationMs: totalDuration,
				blockingSuites,
				hasFixableErrors
			}));
		} else if (totalErrors === 0 && !anyFailed) console.log("\n" + renderExecutivePassSummary({
			totalSuites: results.length,
			passedSuites: suitesPassed,
			skippedSuites: suitesSkipped,
			totalErrors,
			totalWarnings,
			durationMs: totalDuration,
			ratchetOk: ratchet?.status !== "failed"
		}));
		else {
			const phaseBreakdown = extractPhaseBreakdown(results);
			const failedSuites = results.filter((r) => (r.summary?.errors ?? 0) > 0).length;
			console.log("\n" + renderExecutiveFailSummary({
				totalSuites: results.length,
				failedSuites,
				totalErrors,
				totalWarnings,
				durationMs: totalDuration,
				phaseBreakdown,
				fixableErrors,
				fixableWarnings
			}));
		}
	} else {
		printFindingsSummary(results, sortedCategories, {
			isSetupBlocking,
			setupErrors,
			postponedAppErrors,
			hasLockfileMismatch,
			hasEngineMismatch,
			hasFixableErrors
		}, tieredGroups);
		console.log(renderConsolidatedFooter(results.length, suitesPassed, totalErrors, totalWarnings, totalDuration, void 0, suitesSkipped));
		if (hasSimilarCodeSetupFailure) console.log("\n" + renderSimilarCodeWarningBanner() + "\n");
		if (autoFixRecommended) console.log("\n" + renderAutoFixNoticeBanner(fixableErrors, fixableWarnings) + "\n");
	}
	const { meta, consolidatedReport, fileSummaryMap } = buildConsolidatedReport({
		ctx,
		totalErrors,
		totalWarnings,
		suitesPassed,
		anyFailed,
		isFullAudit,
		byFamily,
		ratchet,
		fixableErrors,
		fixableWarnings,
		autoFixRecommended,
		setupBlocking: isSetupBlocking,
		setupErrors: isSetupBlocking ? setupErrors : void 0,
		postponedAppErrors: isSetupBlocking ? postponedAppErrors : void 0
	});
	const latestAuditPath = await persistAuditReportsToDisk({
		scratchAuditsDir,
		isFixMode: false,
		meta,
		consolidatedReport,
		fileSummaryMap,
		results
	});
	if (cliOptions.consoleMode === "human") {
		if (!isFullAudit && !isBuildMode) {
			console.log(styleText("yellow", `⚠️  PARTIAL AUDIT WARNING:`));
			console.log(styleText("yellow", `   latest_audit.json updated with meta.isFullAudit = false (${tasksToRun.length}/${allAvailableTasks.length} suites).`));
			console.log(styleText("dim", `   Quality gates will require a full audit run ('npm run auditor').\n`));
		}
		console.log(styleText("dim", `💾 Detailed report for AI / tooling available at:`));
		console.log(styleText("cyan", `   📄 ${path.relative(process.cwd(), latestAuditPath)}\n`));
		if (anyFailed) {
			console.log(styleText("yellow", "💡 Questions about a rule or command? Do not inspect node_modules or source code. See:"));
			console.log(styleText("dim", "   📖 Guide & canonical fix:   ") + styleText("cyan", "npm run auditor:guide -- <rule>"));
			console.log(styleText("dim", "   ❓ Global help catalog:     ") + styleText("cyan", "npm run auditor:help"));
			console.log(styleText("dim", "   🔧 Refactoring tools help:  ") + styleText("cyan", "npm run auditor:types help | auditor:domain help | auditor:motion help\n"));
		}
	}
	await exportCustomOutputReport(cliOptions, consolidatedReport, results, suitesPassed, totalDuration);
	return anyFailed;
}
function findTaskByUidOrName(allTasks, targetUid) {
	const matchById = allTasks.find((t) => t.id === targetUid);
	if (matchById) return matchById;
	const targetQuery = targetUid.toLowerCase().trim();
	const normalizedQuery = targetQuery.replace(/-/g, "_");
	const matchByName = allTasks.find((t) => t.name.toLowerCase() === targetQuery);
	if (matchByName) return matchByName;
	const matchByNormalizedId = allTasks.find((t) => t.id.toLowerCase().replace(/-/g, "_") === normalizedQuery);
	if (matchByNormalizedId) return matchByNormalizedId;
	const matchWithoutPrefix = allTasks.find((t) => {
		const idWithoutValidate = t.id.toLowerCase().replace(/^validate_/, "");
		return idWithoutValidate === normalizedQuery || idWithoutValidate.replace(/_/g, "-") === targetQuery;
	});
	if (matchWithoutPrefix) return matchWithoutPrefix;
}
function handleHelpCommand(cliOptions, allAvailableTasks, activeFamilies) {
	const requestedUid = typeof cliOptions.values.info === "string" ? cliOptions.values.info : cliOptions.positionals.find((p) => p !== "help" && !activeFamilies.includes(p));
	if (requestedUid) {
		const task = findTaskByUidOrName(allAvailableTasks, requestedUid);
		if (!task) {
			console.error(styleText("red", `\n❌ Suite not found: '${requestedUid}'. Run 'auditor --list' to view all available suites.\n`));
			process.exit(1);
		}
		console.log(renderAuditorDetailCard(task));
		process.exit(0);
	}
	console.log(renderCliHelp(activeFamilies));
	process.exit(0);
}
function handleListJsonOutput(filtered) {
	const manifests = filtered.map(({ task: t, enabled, disabledReason }) => ({
		id: t.id,
		name: t.name,
		family: t.family,
		icon: t.icon ?? "🏛️",
		description: t.description ?? t.name,
		enabled,
		...disabledReason ? { disabledReason } : {},
		capabilities: {
			speed: t.capabilities?.speed ?? "light",
			phase: t.capabilities?.phase ?? "normal",
			fix: t.capabilities?.fix ?? "none",
			md: Boolean(t.capabilities?.md),
			ast: Boolean(t.capabilities?.ast || t.requiresAst),
			changedOnly: Boolean(t.capabilities?.changedOnly),
			critical: Boolean(t.capabilities?.critical)
		},
		rules: t.ruleDescriptions ?? {},
		configKey: t.configKey
	}));
	console.log(JSON.stringify(manifests, null, 2));
	process.exit(0);
}
function handleListCommand(cliOptions, allAvailableTasks, activeFamilies, config) {
	const evaluated = allAvailableTasks.map((t) => {
		const status = evaluateSuiteStatus(t.id, config, t.configKey);
		return {
			task: t,
			enabled: status.enabled,
			disabledReason: status.reason
		};
	});
	let filtered = evaluated;
	let listFilter = "all";
	if (cliOptions.isEnabledFilter) {
		filtered = evaluated.filter((item) => item.enabled);
		listFilter = "enabled";
	} else if (cliOptions.isDisabledFilter) {
		filtered = evaluated.filter((item) => !item.enabled);
		listFilter = "disabled";
	}
	if (cliOptions.values.json) handleListJsonOutput(filtered);
	const disabledMap = /* @__PURE__ */ new Map();
	for (const item of evaluated) if (!item.enabled && item.disabledReason) disabledMap.set(item.task.id, item.disabledReason);
	console.log(renderAuditorsRegistryTable(filtered.map((item) => item.task), activeFamilies, {
		filter: listFilter,
		disabledReasons: disabledMap
	}));
	process.exit(0);
}
function handleInfoCommand(targetUid, allAvailableTasks) {
	const task = findTaskByUidOrName(allAvailableTasks, targetUid);
	if (!task) {
		console.error(styleText("red", `\n❌ Suite not found: '${targetUid}'. Run 'auditor --list' to view all available suites.\n`));
		process.exit(1);
	}
	console.log(renderAuditorDetailCard(task));
	process.exit(0);
}
function handleGuideCommand(cliOptions, allAvailableTasks, activeFamilies) {
	let target = typeof cliOptions.values.guide === "string" && cliOptions.values.guide.trim() !== "" ? cliOptions.values.guide.trim() : typeof cliOptions.values.subcommandTarget === "string" && cliOptions.values.subcommandTarget.trim() !== "" ? cliOptions.values.subcommandTarget.trim() : void 0;
	if (!target) {
		const guideIdx = cliOptions.positionals.indexOf("guide");
		if (guideIdx !== -1) target = cliOptions.positionals.slice(guideIdx + 1).find((t) => t && !t.startsWith("-"))?.trim();
	}
	const suiteParam = typeof cliOptions.values.suite === "string" ? cliOptions.values.suite.trim() : typeof cliOptions.values.task === "string" ? cliOptions.values.task.trim() : void 0;
	if (suiteParam) {
		const task = findTaskByUidOrName(allAvailableTasks, suiteParam);
		if (!task) {
			console.error(styleText("red", `\n❌ Suite not found: '${suiteParam}'. Run 'auditor --list' to view available suites.\n`));
			process.exit(1);
		}
		console.log(renderSuiteGuideCards(task));
		process.exit(0);
	}
	if (cliOptions.values.family && typeof cliOptions.values.family === "string") {
		const fam = cliOptions.values.family.trim();
		const tasksInFam = allAvailableTasks.filter((t) => t.family === fam);
		if (tasksInFam.length === 0) {
			console.error(styleText("red", `\n❌ Family not found or has no suites: '${fam}'. Valid families: ${activeFamilies.join(", ")}\n`));
			process.exit(1);
		}
		console.log(renderFamilyGuideIndex(fam, tasksInFam));
		process.exit(0);
	}
	if (!target) {
		console.log(renderGlobalGuideIndex(allAvailableTasks));
		process.exit(0);
	}
	if (activeFamilies.includes(target)) {
		const tasksInFam = allAvailableTasks.filter((t) => t.family === target);
		console.log(renderFamilyGuideIndex(target, tasksInFam));
		process.exit(0);
	}
	const isHumanGuide = cliOptions.consoleMode === "human";
	const ruleMatch = findRuleGuide(allAvailableTasks, target);
	if (ruleMatch) {
		console.log(renderRuleGuideCard(ruleMatch, isHumanGuide));
		process.exit(0);
	}
	const taskMatch = findTaskByUidOrName(allAvailableTasks, target);
	if (taskMatch) {
		console.log(renderSuiteGuideCards(taskMatch, isHumanGuide));
		process.exit(0);
	}
	const allRuleIds = allAvailableTasks.flatMap((t) => Object.keys(t.ruleDescriptions ?? t.manifest?.rules ?? {}));
	const allSuiteIds = allAvailableTasks.map((t) => t.id);
	const candidates = [...allRuleIds, ...allSuiteIds];
	const queryLower = target.toLowerCase();
	const suggestions = candidates.filter((c) => c.toLowerCase().includes(queryLower) || queryLower.includes(c.toLowerCase())).slice(0, 5);
	console.error(styleText("red", `\n❌ No rule, suite, or family found matching identifier '${target}'.`));
	if (suggestions.length > 0) console.error(styleText("yellow", `\n💡 Did you mean:\n`) + suggestions.map((s) => `   - ${s}`).join("\n") + "\n");
	console.error(styleText("dim", `   Run 'auditor guide' to view the global catalog of available rules.\n`));
	process.exit(1);
}
function handleIntrospectionCommands(cliOptions, allAvailableTasks, activeFamilies, config) {
	if (cliOptions.values.help || cliOptions.positionals.includes("help")) handleHelpCommand(cliOptions, allAvailableTasks, activeFamilies);
	if (Boolean(cliOptions.values.guide !== void 0 || cliOptions.positionals.includes("guide"))) handleGuideCommand(cliOptions, allAvailableTasks, activeFamilies);
	if (Boolean(cliOptions.values.list || cliOptions.positionals.includes("list") || cliOptions.positionals.includes("list:enabled") || cliOptions.positionals.includes("list:disabled") || cliOptions.isEnabledFilter || cliOptions.isDisabledFilter)) handleListCommand(cliOptions, allAvailableTasks, activeFamilies, config);
	const targetUid = typeof cliOptions.values.info === "string" ? cliOptions.values.info : cliOptions.positionals.includes("info") ? cliOptions.positionals.find((p) => p !== "info" && !activeFamilies.includes(p)) : void 0;
	if (targetUid) handleInfoCommand(targetUid, allAvailableTasks);
	return false;
}
function createAuditBannerDetails(options) {
	const { cliOptions, isFixMode = false, isBuildMode = false, tasksCount, allAvailableCount, omittedCount = 0 } = options;
	const subtitleDetails = [`v${AUDITOR_VERSION}`, isFixMode ? `Auto-fixable suites: ${tasksCount} suites` : `Auto-discovered: ${tasksCount}/${allAvailableCount} suites`];
	if (isFixMode) subtitleDetails.push("Mode: AUTO-FIX 🛠️");
	else if (isBuildMode) subtitleDetails.push("Mode: POST-BUILD 🏗️");
	else {
		if (cliOptions.onlySpeed) subtitleDetails.push(`Only-Speed: ${cliOptions.onlySpeed.toUpperCase()}`);
		else if (cliOptions.speed) subtitleDetails.push(`Speed: ${cliOptions.speed.toUpperCase()}`);
		else if (cliOptions.targetPreset) subtitleDetails.push(`Preset: ${cliOptions.targetPreset.toUpperCase()}`);
		if (cliOptions.values.family) subtitleDetails.push(`Family: ${toOptionString(cliOptions.values.family).toUpperCase()}`);
		if (cliOptions.skipSimilar) subtitleDetails.push("Similar-Code: SKIPPED ⏭️");
		if (tasksCount !== allAvailableCount || omittedCount > 0) subtitleDetails.push("Mode: PARTIAL ⚠️");
	}
	if (cliOptions.project) subtitleDetails.push(`🎯 Remote: ${path.basename(path.resolve(cliOptions.project))}`);
	else if (process.env.AUDITOR_HOME_DIR && process.env.AUDIT_PROJECT_ROOT) {
		const cleanHome = sanitizePath(process.env.AUDITOR_HOME_DIR);
		const cleanProject = sanitizePath(process.env.AUDIT_PROJECT_ROOT);
		if (path.resolve(cleanHome) !== path.resolve(cleanProject)) subtitleDetails.push(`🎯 Remote: ${path.basename(cleanProject)}`);
	}
	return subtitleDetails;
}
const MAX_BANNER_SUBTITLE_WIDTH = 72;
function formatSubtitleDetails(details, maxLineWidth = 72) {
	if (details.length === 0) return "";
	const lines = [];
	let currentLine = "";
	for (const item of details) {
		const candidate = currentLine ? `${currentLine}  |  ${item}` : item;
		if (stringWidth(candidate) <= maxLineWidth) currentLine = candidate;
		else {
			if (currentLine) lines.push(currentLine);
			currentLine = item;
		}
	}
	if (currentLine) lines.push(currentLine);
	return lines.join("\n");
}
async function runTaskExecution(task, ctx, subLines) {
	const taskArgs = buildTaskArgs(task, ctx.cliOptions.values, ctx.cliOptions.formattedRules);
	if (task.requiresAst && ctx.sharedAstContext) {
		const inProcess = await executeTaskInProcess(task, ctx.sharedAstContext, (line) => subLines.push(line));
		if (inProcess) return {
			result: inProcess.result,
			durationMs: inProcess.durationMs
		};
	}
	const taskJsonPath = path.join(ctx.scratchAuditsDir, task.family, `${task.id}.json`);
	safeRmSync(taskJsonPath);
	const proc = await executeAuditorStreaming(task, taskArgs, (subLine) => subLines.push(subLine));
	const parsed = await parseSubprocessOutput(task, proc, ctx.scratchAuditsDir);
	return {
		result: parsed,
		durationMs: parsed.durationMs !== void 0 && parsed.durationMs > 0 ? parsed.durationMs : proc.durationMs
	};
}
function ensureTaskSummary(result) {
	if (result.summary) return;
	result.summary = {
		errors: result.findings?.filter((f) => f.severity === "error").length ?? (result.status === "failed" ? 1 : 0),
		warnings: result.findings?.filter((f) => f.severity === "warning").length ?? 0,
		info: 0
	};
}
function resolveSpeedEmoji(speed) {
	if (speed === "light") return " 🐇";
	if (speed === "heavy") return " 🐢";
	if (speed === "full") return " 🐘";
	return "";
}
function buildSubAuditorLine(s, index, total) {
	const badge = s.count > 0 ? ` [🐛 ${formatNumber(s.count)}]` : "";
	const speedEmoji = resolveSpeedEmoji(s.speed);
	const durationBadge = s.durationMs !== void 0 && s.durationMs >= 0 ? ` (${formatDurationMs(s.durationMs)})` : "";
	return `🔍 [${index + 1}/${total}] ${s.name}${badge}${speedEmoji}${durationBadge}`;
}
function populateSubAuditorSubLines(result, subLines) {
	if (subLines.length > 0 || !result.subAuditors || result.subAuditors.length === 0) return;
	const total = result.subAuditors.length;
	for (let i = 0; i < total; i++) subLines.push(buildSubAuditorLine(result.subAuditors[i], i, total));
}
function normalizeTaskSummaryAndSubLines(result, subLines) {
	ensureTaskSummary(result);
	if (result.status === "skipped" || result.metrics?.["Estado"] === "OMITIDO ⏭️") {
		result.status = "skipped";
		subLines.length = 0;
		const reason = result.metrics?.["Skip-Reason"] || "Análisis omitido";
		subLines.push(`⏭️  ${reason}`);
		return true;
	}
	populateSubAuditorSubLines(result, subLines);
	return false;
}
async function executeSingleAuditTask(task, ctx, taskIndex) {
	const subLines = [];
	const { result, durationMs } = await runTaskExecution(task, ctx, subLines);
	const isSkipped = normalizeTaskSummaryAndSubLines(result, subLines);
	await ctx.coordinator.onTaskComplete({
		taskName: task.name,
		taskId: task.id,
		subLines,
		durationMs,
		isSuccess: result.status === "passed",
		hasWarnings: (result.summary?.warnings ?? 0) > 0,
		isSkipped,
		isBuiltin: task.isBuiltin !== false,
		icon: result.icon ?? task.icon,
		taskIndex,
		subAuditors: result.subAuditors
	});
	return result;
}
async function checkEarlyCliCommands() {
	const cliTokens = getProcessCliArgs();
	if (cliTokens.includes("-v") || cliTokens.includes("--version") || cliTokens.includes("version")) {
		console.log(`@francogp/auditor v${AUDITOR_VERSION}`);
		process.exit(0);
	}
	const dependencyTokens = /* @__PURE__ */ new Set([
		"dependencies",
		"deps",
		"--dependencies"
	]);
	if (cliTokens.some((a) => dependencyTokens.has(a))) {
		const { runDependenciesReport, parseCliArgs } = await import("./report_dependencies.js");
		const options = parseCliArgs(cliTokens.filter((a) => !dependencyTokens.has(a)));
		const exitCode = runDependenciesReport(process.cwd(), options).outdatedCount > 0 && !options.noFail && !options.commandsOnly && !options.json ? 1 : 0;
		process.exit(exitCode);
	}
	process.env.AUDIT_SUBPROCESS = "true";
	if (cliTokens.some((a) => a === "fix" || a === "--fix")) for (const moved of migrateLegacyAuditConfig(process.cwd())) console.log(styleText("green", `🛠️  Moved ${moved} to .auditor/${moved} (relative imports rewritten).`));
}
async function setupMasterAuditDirectories(activeFamilies) {
	const scratchAuditsDir = path.resolve(process.cwd(), "scratch/audits");
	await fs.mkdir(scratchAuditsDir, { recursive: true });
	for (const family of activeFamilies) await fs.mkdir(path.join(scratchAuditsDir, family), { recursive: true });
	return scratchAuditsDir;
}
async function setupCoverageRunEnvironment(runMode, workerTasks) {
	const runId = `run_${Temporal.Now.instant().epochMilliseconds}_${Math.random().toString(36).substring(2, 8)}`;
	process.env[COVERAGE_RUN_ID_ENV] = runId;
	process.env[COVERAGE_RUN_MODE_ENV] = runMode;
	process.env[COVERAGE_EXPECTED_SUITES_ENV] = workerTasks.map((t) => t.id).join(",");
	const coverageLedgerDir = path.resolve(process.cwd(), COVERAGE_LEDGER_DIR);
	await fs.rm(coverageLedgerDir, {
		recursive: true,
		force: true
	});
	await fs.mkdir(coverageLedgerDir, { recursive: true });
}
function displayMasterBanner(options) {
	const { config, cliOptions, isFixMode, isBuildMode, tasksToRun, allAvailableTasks, omittedSuiteIds } = options;
	if (cliOptions.consoleMode === "compact") return;
	const subtitleDetails = createAuditBannerDetails({
		cliOptions,
		isFixMode,
		isBuildMode,
		tasksCount: tasksToRun.length,
		allAvailableCount: allAvailableTasks.length,
		omittedCount: omittedSuiteIds.length
	});
	let bannerTitle = config.name ? `${config.name.toUpperCase()} - GLOBAL AUDIT & VALIDATION SUITE` : "GLOBAL AUDIT & VALIDATION SUITE";
	if (isFixMode) bannerTitle = "[ 🛠️ AUTOMATIC REPAIR MODE ]";
	else if (isBuildMode) bannerTitle = "[ 🏗️ POST-BUILD / COMPILED ARTIFACTS MODE ]";
	else if (cliOptions.targetPreset === "critical") bannerTitle = "[ 🚨 EXCLUSIVE CRITICAL MODE ]";
	else if (config.name && stringWidth(bannerTitle) > 72) bannerTitle = `${config.name.toUpperCase()}\nGLOBAL AUDIT & VALIDATION SUITE`;
	const formattedSubtitle = formatSubtitleDetails(subtitleDetails);
	console.log(renderBanner(bannerTitle, formattedSubtitle));
}
const FIX_MODE_EXPLICIT_ORDER = {
	validate_audit_config: 10,
	validate_environment_engines: 20,
	validate_dependency_minimums: 30,
	validate_vite_plus_config: 40,
	validate_tsconfig: 50,
	validate_package_scripts: 60,
	validate_package_hygiene: 65,
	validate_stylelint_config: 70,
	validate_script_extensions: 75,
	validate_html_validate_config: 80,
	validate_fallow_config: 90,
	validate_markdown_lint_config: 100,
	validate_npmrc_config: 110,
	validate_editorconfig: 120,
	validate_docker_config: 130,
	validate_playwright_config: 140,
	validate_git_config: 150,
	validate_agent_plugin: 160,
	validate_agents_config_mandate: 170,
	validate_documentation_language: 180,
	validate_component_styles: 220,
	audit_project: 230,
	validate_error_suppression: 235,
	validate_z_index: 240,
	validate_domain_types: 245,
	validate_markdown_code_references: 260,
	validate_markdown_syntax: 270,
	validate_mermaid_syntax: 280,
	validate_oxlint: 310,
	validate_stylelint: 320,
	validate_html_validate: 330,
	validate_markdown_lint: 340,
	validate_oxfmt: 400
};
const FIX_ORDER_SETUP_FALLBACK = 190;
const FIX_ORDER_PRIORITY_FALLBACK = 205;
const FIX_ORDER_NORMAL_FALLBACK = 290;
function resolveFixOrderWeight(task) {
	const explicit = FIX_MODE_EXPLICIT_ORDER[task.id];
	if (explicit !== void 0) return explicit;
	if (task.capabilities?.phase === "setup") return FIX_ORDER_SETUP_FALLBACK;
	if (task.capabilities?.fix === "priority") return FIX_ORDER_PRIORITY_FALLBACK;
	return FIX_ORDER_NORMAL_FALLBACK;
}
function sortTasksByOrder(tasks, isFixMode) {
	tasks.sort((a, b) => {
		if (isFixMode) {
			const weightA = resolveFixOrderWeight(a);
			const weightB = resolveFixOrderWeight(b);
			if (weightA !== weightB) return weightA - weightB;
			return a.id.localeCompare(b.id);
		}
		const aSpeeds = normalizeSpeeds(a.capabilities?.speed ?? "light");
		const bSpeeds = normalizeSpeeds(b.capabilities?.speed ?? "light");
		const aHeavy = aSpeeds.includes("heavy") || aSpeeds.includes("full");
		const bHeavy = bSpeeds.includes("heavy") || bSpeeds.includes("full");
		if (aHeavy && !bHeavy) return -1;
		if (!aHeavy && bHeavy) return 1;
		const orderA = a.order ?? 99;
		const orderB = b.order ?? 99;
		if (orderA !== orderB) return orderA - orderB;
		return a.id.localeCompare(b.id);
	});
}
async function executeAllAuditTasks(workerTasks, postRunTasks, taskCtx, concurrencyLimit) {
	const isFixMode = Boolean(taskCtx.cliOptions.values.fix);
	const effectiveConcurrency = isFixMode ? 1 : concurrencyLimit;
	if (taskCtx.cliOptions.consoleMode === "human") console.log(styleText("bold", isFixMode ? "⏳ Suite execution progress (Concurrency: 1 worker — Serial Repair Mode):\n" : `⏳ Suite execution progress (Concurrency: ${effectiveConcurrency} workers):\n`));
	const executeSingleTask = (task, index) => {
		return executeSingleAuditTask(task, taskCtx, index);
	};
	const workerResults = await runAuditWorkers(workerTasks, effectiveConcurrency, executeSingleTask);
	const postRunResults = [];
	for (let pIdx = 0; pIdx < postRunTasks.length; pIdx++) {
		const postTask = postRunTasks[pIdx];
		postRunResults.push(await executeSingleTask(postTask, workerTasks.length + pIdx));
	}
	return [...workerResults, ...postRunResults];
}
async function runMasterAudit() {
	const bootstrapInfo = bootstrapCliProject();
	await checkEarlyCliCommands();
	await ensureProjectBootstrapped({ projectRoot: bootstrapInfo.projectRoot });
	const startTime = performance.now();
	const config = await loadAuditConfig(bootstrapInfo.projectRoot);
	assertAuditConfigComplete(config);
	const activeFamilies = getActiveFamilies(config.customFamilies);
	const cliOptions = parseAuditFullCliArgs(activeFamilies);
	if (cliOptions.targetPreset) process.env.AUDITOR_PRESET = cliOptions.targetPreset;
	if (cliOptions.speed) process.env.AUDITOR_SPEED = cliOptions.speed;
	if (cliOptions.onlySpeed) process.env.AUDITOR_ONLY_SPEED = cliOptions.onlySpeed;
	if (cliOptions.phase) process.env.AUDITOR_PHASE = cliOptions.phase;
	if (cliOptions.skipSimilar) process.env.AUDIT_SKIP_SIMILAR = "true";
	const scratchAuditsDir = await setupMasterAuditDirectories(activeFamilies);
	const isFixMode = Boolean(cliOptions.values.fix);
	const isBuildMode = cliOptions.phase === "post-build" || cliOptions.targetPreset === "post-build" || Boolean(cliOptions.values["post-build"]);
	const withBuild = Boolean(cliOptions.values["with-build"] || cliOptions.values.all);
	const discoveryBase = {
		fixOnly: isFixMode,
		buildOnly: isBuildMode,
		withBuild,
		speed: cliOptions.speed,
		onlySpeed: cliOptions.onlySpeed,
		phase: cliOptions.phase
	};
	const allAvailableTasks = await discoverAuditors(isBuildMode ? {
		buildOnly: true,
		phase: "post-build"
	} : { withBuild });
	handleIntrospectionCommands(cliOptions, allAvailableTasks, activeFamilies, config);
	const tasksToRun = await discoverAuditors({
		...discoveryBase,
		family: cliOptions.targetFamily,
		task: cliOptions.targetSuites ? void 0 : cliOptions.values.task,
		suites: cliOptions.targetSuites,
		preset: cliOptions.targetPreset
	});
	const executedSuiteIds = tasksToRun.map((t) => t.id);
	const omittedSuiteIds = allAvailableTasks.map((t) => t.id).filter((id) => !executedSuiteIds.includes(id));
	const runMode = determineRunMode(cliOptions.targetPreset, cliOptions.targetSuites, cliOptions.values.task, cliOptions.targetFamily, {
		speed: cliOptions.speed,
		onlySpeed: cliOptions.onlySpeed,
		phase: cliOptions.phase,
		changedOnly: cliOptions.values["changed-since"]
	});
	sortTasksByOrder(tasksToRun, isFixMode);
	const workerTasks = tasksToRun.filter((t) => t.capabilities?.phase !== "post-run");
	const postRunTasks = tasksToRun.filter((t) => t.capabilities?.phase === "post-run");
	await setupCoverageRunEnvironment(runMode, workerTasks);
	displayMasterBanner({
		config,
		cliOptions,
		isFixMode,
		isBuildMode,
		tasksToRun,
		allAvailableTasks,
		omittedSuiteIds
	});
	if (tasksToRun.length === 0) {
		console.log(styleText("yellow", "⚠️ No auditors found matching specified filters."));
		process.exit(0);
	}
	const astTasks = tasksToRun.filter((t) => t.requiresAst);
	let sharedAstContext;
	if (astTasks.length > 0 && !isFixMode) {
		if (cliOptions.consoleMode === "human") console.log(styleText("cyan", `🧠 [AST Engine] Detected ${astTasks.length} sub-auditor(s) requiring AST. Initializing shared AST context...\n`));
		sharedAstContext = new SharedAstContext();
	}
	const coordinator = new TaskStreamCoordinator(tasksToRun.length, {
		indent: "  ",
		mode: cliOptions.consoleMode
	});
	if (await renderAndPersistMasterReport({
		results: await executeAllAuditTasks(workerTasks, postRunTasks, {
			cliOptions,
			sharedAstContext,
			scratchAuditsDir,
			coordinator
		}, cliOptions.concurrencyLimit),
		tasksToRun,
		allAvailableTasks,
		omittedSuiteIds,
		totalDuration: Math.round(performance.now() - startTime),
		config,
		activeFamilies,
		cliOptions,
		runMode,
		scratchAuditsDir
	})) process.exit(1);
}
if (isMainModule(import.meta.url)) runMasterAudit().catch((err) => {
	console.error(styleText("red", `\n💥 Fatal error in audit_full: ${err.stack || err.message}`));
	process.exit(1);
});
export { MAX_BANNER_SUBTITLE_WIDTH, buildTaskArgs, computeAuditCategoryCounts, computeFixableViolations, computeTieredAuditCategoryCounts, createAuditBannerDetails, determineRunMode, extractSubprocessErrorMessage, formatSetupBlockingRemediationHint, formatSubtitleDetails, isRatchetScope, parseAuditFullCliArgs, renderAndPersistMasterReport, resolveConcurrencyLimit, resolveConsoleMode, resolveFixOrderWeight, resolveFormattedRules, resolveSkipSimilar, resolveTargetFamily, resolveTargetPreset, resolveTargetSuites, runMasterAudit, sortTasksByOrder };
