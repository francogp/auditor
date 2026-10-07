#!/usr/bin/env -S node --experimental-strip-types
/**
 * scripts/maintenance/audit_full.ts
 *
 * MASTER AUDIT ORCHESTRATOR & UNIFIED RUNNER (Node.js 26+)
 * Dynamically discovers and executes all sub-auditors in scripts/auditors/:
 *   1. Displays formatted step-by-step progress with clean newlines.
 *   2. Renders the complete Box-Drawing summary table grouped by family.
 *   3. Persists the complete structured JSON report to scratch/audits/latest_audit.json.
 */
var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { parseArgs, styleText } from 'node:util';
import { enableCompileCache } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { resolveFamilyMetadata, getActiveFamilies, groupResultsByFamily, sortFindingsByFileAndLine, groupFindingsByFileMap, FALLBACK_FAMILY_ORDER } from "../core/auditContract.js";
import { loadAuditConfig, assertAuditConfigComplete, buildRatchetConfig } from "../core/auditConfig.js";
import { runWarningRatchet, initWarningBaseline } from "./auditRatchet.js";
import { migrateLegacyAuditConfig } from "./migrateAuditConfig.js";
import { COVERAGE_LEDGER_DIR, COVERAGE_RUN_ID_ENV, COVERAGE_RUN_MODE_ENV, COVERAGE_EXPECTED_SUITES_ENV } from "../core/auditCoverage.js";
import { renderBanner, renderConsolidatedFooter, renderMarkdownReport, renderFindingsBreakdownTable, renderSampleFindings, renderSimilarCodeWarningBanner, renderAutoFixNoticeBanner, renderAuditorsRegistryTable, renderAuditorDetailCard, renderCliHelp } from "../core/unifiedTheme.js";
import { discoverAuditors } from "./auditScanner.js";
import { executeAuditorStreaming, isNodeInternalWarning, TaskStreamCoordinator } from "../core/streamingRunner.js";
import { SharedAstContext } from "../core/astContext.js";
import { BaseAuditor } from "../core/auditorBase.js";
import { evaluateSuiteStatus } from "../core/suiteGating.js";
import { AUDITOR_VERSION } from "../core/version.js";
import { isMainModule } from "./cliUtils.js";
import "../core/permissionGuard.js";
enableCompileCache();
const CPU_CORE_DIVISOR = 2;
const MIN_CONCURRENCY = 1;
const DECIMAL_RADIX = 10;
const DEFAULT_SUBPROCESS_TIMEOUT_MS = 0;
export function resolveTargetFamily(familyOption, positionals, activeFamilies) {
    const positionalFamily = positionals.find(p => activeFamilies.includes(p));
    return familyOption || positionalFamily;
}
export function resolveFormattedRules(values, positionals) {
    const rawRuleArgs = [];
    if (values.rule) {
        const list = Array.isArray(values.rule) ? values.rule : [values.rule];
        for (const item of list)
            rawRuleArgs.push(String(item));
    }
    if (values.rules) {
        const list = Array.isArray(values.rules) ? values.rules : [values.rules];
        for (const item of list)
            rawRuleArgs.push(String(item));
    }
    for (const pos of positionals) {
        if (pos.toLowerCase() === 'dox' || pos.includes(',')) {
            rawRuleArgs.push(pos);
        }
    }
    return rawRuleArgs.join(',');
}
export function resolveTargetSuites(values) {
    if (values.suites) {
        return String(values.suites).split(',').map(s => s.trim()).filter(Boolean);
    }
    if (values.tasks) {
        return String(values.tasks).split(',').map(s => s.trim()).filter(Boolean);
    }
    if (typeof values.task === 'string' && values.task.includes(',')) {
        return String(values.task).split(',').map(s => s.trim()).filter(Boolean);
    }
    return undefined;
}
export function resolveConcurrencyLimit(concurrencyValue) {
    const availableCpus = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
    const defaultConcurrency = Math.max(MIN_CONCURRENCY, Math.floor(availableCpus / CPU_CORE_DIVISOR));
    if (concurrencyValue) {
        return Math.max(MIN_CONCURRENCY, Number.parseInt(concurrencyValue, DECIMAL_RADIX) || defaultConcurrency);
    }
    return defaultConcurrency;
}
export function resolveSkipSimilar() {
    return (process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS === 'true' ||
        process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS === '1' ||
        process.env.AUDIT_SKIP_SIMILAR === 'true' ||
        process.env.AUDIT_SKIP_SIMILAR === '1');
}
export function resolveTargetPreset(values, positionals) {
    if (values.preset)
        return values.preset;
    if (values.build)
        return 'build';
    if (positionals.includes('build'))
        return 'build';
    if (positionals.includes('lint'))
        return 'lint';
    if (positionals.includes('md'))
        return 'md';
    return undefined;
}
export function parseAuditFullCliArgs(activeFamilies, rawArgs = process.argv.slice(2)) {
    const args = [...rawArgs];
    const BOOLEAN_FLAGS = [
        'errors-only', 'fix', 'all', 'build', 'with-build', 'init-baseline', 'help', 'list', 'json', 'enabled', 'disabled'
    ];
    const normalized = args.map(a => a.includes('=') && !a.startsWith('-') ? `--${a}` : (BOOLEAN_FLAGS.includes(a) ? `--${a}` : a));
    const { values, positionals } = parseArgs({
        args: normalized,
        options: {
            help: { type: 'boolean', short: 'h' },
            list: { type: 'boolean', short: 'l' },
            info: { type: 'string' },
            json: { type: 'boolean' },
            enabled: { type: 'boolean' },
            disabled: { type: 'boolean' },
            family: { type: 'string' },
            task: { type: 'string' },
            tasks: { type: 'string' },
            suites: { type: 'string' },
            preset: { type: 'string' },
            concurrency: { type: 'string' },
            output: { type: 'string', short: 'o' },
            'changed-since': { type: 'string' },
            'errors-only': { type: 'boolean' },
            all: { type: 'boolean', short: 'a' },
            top: { type: 'string', short: 't' },
            rule: { type: 'string', short: 'r', multiple: true },
            rules: { type: 'string', multiple: true },
            fix: { type: 'boolean' },
            build: { type: 'boolean' },
            'with-build': { type: 'boolean' },
            'init-baseline': { type: 'boolean' }
        },
        allowPositionals: true,
        strict: false
    });
    return {
        values,
        positionals,
        targetFamily: resolveTargetFamily(values.family, positionals, activeFamilies),
        formattedRules: resolveFormattedRules(values, positionals),
        targetPreset: resolveTargetPreset(values, positionals),
        targetSuites: resolveTargetSuites(values),
        concurrencyLimit: resolveConcurrencyLimit(values.concurrency),
        skipSimilar: resolveSkipSimilar(),
        isEnabledFilter: Boolean(values.enabled ||
            positionals.includes('enabled') ||
            positionals.includes('list:enabled')),
        isDisabledFilter: Boolean(values.disabled ||
            positionals.includes('disabled') ||
            positionals.includes('list:disabled'))
    };
}
export function determineRunMode(targetPreset, targetSuites, taskArg, targetFamily) {
    if (targetPreset)
        return 'preset';
    if (targetSuites && targetSuites.length > 1)
        return 'suites';
    if (taskArg || (targetSuites && targetSuites.length === 1))
        return 'single';
    if (targetFamily)
        return 'family';
    return 'full';
}
export function buildTaskArgs(task, values, formattedRules) {
    const taskArgs = [...task.args];
    if (values['errors-only'] && !taskArgs.includes('--errors-only'))
        taskArgs.push('--errors-only');
    if (formattedRules && !taskArgs.includes('--rule'))
        taskArgs.push('--rule', formattedRules);
    if (values.top && !taskArgs.includes('--top'))
        taskArgs.push('--top', values.top);
    if (values['changed-since'] && task.capabilities?.changedSince && !taskArgs.includes('--changed-since')) {
        taskArgs.push('--changed-since', values['changed-since']);
    }
    if (values.fix && !taskArgs.includes('fix'))
        taskArgs.push('fix');
    return taskArgs;
}
async function executeTaskInProcess(task, sharedAstContext, onSubLine) {
    const taskStart = performance.now();
    try {
        const fullScriptPath = path.resolve(process.cwd(), task.scriptPath);
        const mod = await import(__rewriteRelativeImportExtension(fullScriptPath));
        let AuditorClass;
        for (const val of Object.values(mod)) {
            if (typeof val === 'function' && val.prototype instanceof BaseAuditor) {
                AuditorClass = val;
                break;
            }
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
            return { result, durationMs };
        }
    }
    catch {
        // catch-ok: Fallback to streaming execution if in-process execution fails
    }
    return null;
}
async function tryReadTaskResult(taskJsonPath, stdout, durationMs) {
    try {
        const fileContent = await fs.readFile(taskJsonPath, 'utf-8');
        const parsed = JSON.parse(fileContent);
        parsed.durationMs = durationMs;
        return parsed;
    }
    catch {
        // catch-ok: fallback to parsing JSON from stdout
    }
    if (stdout) {
        try {
            const raw = stdout.trim();
            const firstBrace = raw.indexOf('{');
            const lastBrace = raw.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                const parsed = JSON.parse(raw.substring(firstBrace, lastBrace + 1));
                parsed.durationMs = durationMs;
                return parsed;
            }
        }
        catch {
            // catch-ok: stdout does not contain valid JSON payload
        }
    }
    return null;
}
export function extractSubprocessErrorMessage(proc, timeoutMs = DEFAULT_SUBPROCESS_TIMEOUT_MS, task) {
    if (proc.timedOut) {
        if (task) {
            return `Timeout excedido (${timeoutMs}ms) al ejecutar el auditor '${task.name}' (${task.id}).`;
        }
        return `Timeout excedido (${timeoutMs}ms) en la ejecución de la suite.`;
    }
    const cleanStderr = proc.stderr
        .split('\n')
        .filter(l => !isNodeInternalWarning(l.trim()) && l.trim().length > 0)
        .join('\n')
        .trim();
    const cleanStdout = proc.stdout
        .split('\n')
        .filter(l => !isNodeInternalWarning(l.trim()) && l.trim().length > 0)
        .join('\n')
        .trim();
    return cleanStderr || cleanStdout || `Código de salida ${proc.status}`;
}
async function parseSubprocessOutput(task, proc, scratchAuditsDir) {
    const taskJsonPath = path.join(scratchAuditsDir, task.family, `${task.id}.json`);
    const parsed = await tryReadTaskResult(taskJsonPath, proc.stdout, proc.durationMs);
    if (parsed) {
        return parsed;
    }
    const isSuccess = !proc.timedOut && proc.status === 0;
    const findings = [];
    if (!isSuccess) {
        const errorMsg = extractSubprocessErrorMessage(proc, task.timeoutMs ?? DEFAULT_SUBPROCESS_TIMEOUT_MS, task);
        findings.push({
            severity: 'error',
            message: errorMsg,
            file: task.scriptPath
        });
    }
    return {
        id: task.id,
        name: task.name,
        description: task.description || task.name,
        family: task.family,
        status: isSuccess ? 'passed' : 'failed',
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
    const results = new Array(tasks.length);
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
const ERROR_WEIGHT_FACTOR = 1000;
export function computeAuditCategoryCounts(results) {
    const categoryCounts = new Map();
    for (const suite of results) {
        for (const finding of (suite.findings || [])) {
            const catKey = finding.ruleDescription ?? finding.ruleId ?? suite.name;
            if (!categoryCounts.has(catKey)) {
                categoryCounts.set(catKey, { errors: 0, warnings: 0, findings: [] });
            }
            const entry = categoryCounts.get(catKey);
            if (finding.severity === 'error')
                entry.errors++;
            else
                entry.warnings++;
            entry.findings.push(finding);
        }
    }
    return Array.from(categoryCounts.entries()).sort((a, b) => {
        return (b[1].errors * ERROR_WEIGHT_FACTOR + b[1].warnings) - (a[1].errors * ERROR_WEIGHT_FACTOR + a[1].warnings);
    });
}
function printFindingsSummary(results, sortedCategories) {
    if (sortedCategories.length === 0) {
        console.log('\n' + styleText(['bold', 'green'], `✨ 100% de las suites aprobadas (${results.length}/${results.length}) sin errores ni advertencias.`));
    }
    else {
        console.log('\n' + styleText('bold', '📊 DESGLOSE POR TIPO DE ERROR Y ADVERTENCIA:\n'));
        console.log(renderFindingsBreakdownTable(sortedCategories, 'TIPO DE INCIDENCIA / REGLA'));
        const allErrors = results.flatMap(suite => (suite.findings || []).filter(f => f.severity === 'error'));
        if (allErrors.length > 0) {
            console.log(renderSampleFindings(allErrors, 5));
        }
    }
}
function buildConsolidatedReport(params) {
    const { ctx, totalErrors, totalWarnings, suitesPassed, anyFailed, isFullAudit, byFamily, ratchet } = params;
    const meta = {
        version: AUDITOR_VERSION,
        timestamp: Temporal.Now.instant().toString(),
        isFullAudit,
        runMode: ctx.runMode,
        preset: ctx.cliOptions.targetPreset ?? null,
        targetFamily: ctx.cliOptions.targetFamily ?? null,
        totalDiscoveredSuites: ctx.allAvailableTasks.length,
        executedSuiteCount: ctx.tasksToRun.length,
        executedSuites: ctx.tasksToRun.map(t => t.id),
        omittedSuites: ctx.omittedSuiteIds,
        skipSimilar: ctx.cliOptions.skipSimilar || undefined,
        ratchet,
        environment: { nodeVersion: process.version, platform: process.platform, cwd: process.cwd() }
    };
    const rawFindings = ctx.results.flatMap(r => r.findings);
    const sortedFindings = sortFindingsByFileAndLine(rawFindings);
    const fileSummaryMap = groupFindingsByFileMap(sortedFindings);
    const findingsByFile = {};
    for (const [file, summary] of Object.entries(fileSummaryMap)) {
        findingsByFile[file] = summary.findings;
    }
    const consolidatedReport = {
        meta,
        status: anyFailed ? 'failed' : 'passed',
        summary: {
            totalViolations: totalErrors + totalWarnings,
            errors: totalErrors,
            warnings: totalWarnings,
            suitesTotal: ctx.results.length,
            suitesPassed,
            suitesFailed: ctx.results.length - suitesPassed,
            durationMs: ctx.totalDuration,
            ...(params.fixableErrors !== undefined && { fixableErrors: params.fixableErrors }),
            ...(params.fixableWarnings !== undefined && { fixableWarnings: params.fixableWarnings }),
            ...(params.autoFixRecommended !== undefined && { autoFixRecommended: params.autoFixRecommended }),
            ...(params.autoFixRecommended && { autoFixCommand: 'npm run audit:fix' })
        },
        families: Object.fromEntries(ctx.activeFamilies.map(f => [
            f,
            { title: resolveFamilyMetadata(f, ctx.config.customFamilies).title, suites: byFamily.get(f) ?? [] }
        ])),
        allFindings: sortedFindings,
        findingsByFile
    };
    return { meta, consolidatedReport, fileSummaryMap };
}
async function exportCustomOutputReport(cliOptions, consolidatedReport, results, suitesPassed, totalDuration) {
    if (!cliOptions.values.output)
        return;
    const outputPath = path.resolve(process.cwd(), cliOptions.values.output);
    if (outputPath.endsWith('.json')) {
        await fs.writeFile(outputPath, JSON.stringify(consolidatedReport, null, 2), 'utf-8');
    }
    else if (outputPath.endsWith('.md')) {
        const md = renderMarkdownReport(results, suitesPassed, totalDuration);
        await fs.writeFile(outputPath, md, 'utf-8');
    }
    else {
        const lines = results.map(r => `[${r.status.toUpperCase()}] ${r.name} (${r.durationMs}ms) - Errors: ${r.summary.errors}, Warnings: ${r.summary.warnings}`);
        await fs.writeFile(outputPath, lines.join('\n'), 'utf-8');
    }
    console.log(styleText('cyan', `✨ Reporte exportado en: ${cliOptions.values.output}\n`));
}
/** Ratchet applies only to the canonical full run: every default suite, no filters, no build/fix mode. */
export function isRatchetScope(cliOptions, isFullAudit) {
    const v = cliOptions.values;
    return isFullAudit && !cliOptions.formattedRules &&
        !v['errors-only'] && !v.top && !v['changed-since'] && !v['with-build'] && !v.all;
}
function printRatchetVerdict(verdict, newWarnings, baselineFile) {
    if (verdict.status === 'initialized') {
        console.log(styleText(['bold', 'green'], `\n🔒 Línea base de warnings creada (${verdict.resolvedWarnings} warnings) en ${baselineFile}.`));
        console.log(styleText('dim', `   Commiteala y publícala en '${verdict.productionRef}' para activar el ratchet.\n`));
        return;
    }
    if (verdict.error) {
        console.log(styleText(['bold', 'red'], `\n🔒 RATCHET DE WARNINGS BLOQUEADO: ${verdict.error}\n`));
        return;
    }
    if (verdict.newWarnings > 0) {
        console.log(styleText(['bold', 'red'], `\n🔒 RATCHET DE WARNINGS: ${verdict.newWarnings} warning(s) NUEVO(S) respecto de '${verdict.productionRef}'. Deben corregirse.`));
        console.log(renderSampleFindings(newWarnings, 'all'));
        return;
    }
    const shrinkNote = verdict.baselineUpdated ? ` Línea base reducida (${verdict.resolvedWarnings} resueltos): commitea ${baselineFile}.` : '';
    console.log(styleText('green', `\n🔒 Ratchet de warnings OK: 0 nuevos respecto de '${verdict.productionRef}'.${shrinkNote}\n`));
}
function handleInitBaseline(ratchet, ctx, canWriteBaseline, base) {
    if (!canWriteBaseline || ctx.cliOptions.skipSimilar) {
        throw new Error('--init-baseline requires 0 errors and similar-code analysis enabled.');
    }
    const count = initWarningBaseline(process.cwd(), ratchet, ctx.results);
    return {
        verdict: { ...base, status: 'initialized', resolvedWarnings: count, baselineUpdated: true },
        newWarnings: []
    };
}
function handleStandardRatchet(ratchet, ctx, canWriteBaseline, base) {
    const outcome = runWarningRatchet(process.cwd(), ratchet, ctx.results, canWriteBaseline);
    if (outcome.source === 'local-bootstrap') {
        console.log(styleText('yellow', `\n⚠️  '${ratchet.productionRef}' aún no contiene ${ratchet.baselineFile}: se usa la copia local (bootstrap). Publícala para blindar el ratchet.`));
    }
    return {
        verdict: {
            ...base,
            status: outcome.newWarnings.length > 0 ? 'failed' : 'passed',
            newWarnings: outcome.newWarnings.length,
            resolvedWarnings: outcome.resolvedCount,
            baselineUpdated: outcome.baselineUpdated
        },
        newWarnings: outcome.newWarnings
    };
}
function applyWarningRatchet(ctx, isFullAudit, totalErrors) {
    const ratchet = buildRatchetConfig(ctx.config.ratchet);
    const initRequested = Boolean(ctx.cliOptions.values['init-baseline']);
    const inScope = isRatchetScope(ctx.cliOptions, isFullAudit);
    if (initRequested && (!ratchet.enabled || !inScope)) {
        throw new Error('[Ratchet] --init-baseline requires ratchet.enabled and a full default run (no preset, family, task, rule, changed-since, build or fix filters).');
    }
    if (!ratchet.enabled) {
        if (inScope)
            console.log(styleText('yellow', `\n⚠️  Ratchet de warnings DESACTIVADO (ratchet.enabled: false en .auditor/audit.config.ts).\n`));
        return undefined;
    }
    if (!inScope)
        return undefined;
    const canWriteBaseline = totalErrors === 0;
    const base = { productionRef: ratchet.productionRef, newWarnings: 0, resolvedWarnings: 0, baselineUpdated: false };
    let verdict;
    let newWarnings = [];
    try {
        const executed = initRequested
            ? handleInitBaseline(ratchet, ctx, canWriteBaseline, base)
            : handleStandardRatchet(ratchet, ctx, canWriteBaseline, base);
        verdict = executed.verdict;
        newWarnings = executed.newWarnings;
    }
    catch (err) {
        // catch-ok: converted into a blocking ratchet failure that is persisted in latest_audit.json and fails the run.
        verdict = { ...base, status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
    printRatchetVerdict(verdict, newWarnings, ratchet.baselineFile);
    return verdict;
}
async function renderAndPersistMasterReport(ctx) {
    const { results, tasksToRun, allAvailableTasks, omittedSuiteIds, totalDuration, activeFamilies, cliOptions, scratchAuditsDir } = ctx;
    const totalErrors = results.reduce((acc, r) => acc + (r.summary?.errors ?? 0), 0);
    const totalWarnings = results.reduce((acc, r) => acc + (r.summary?.warnings ?? 0), 0);
    const suitesPassed = results.filter(r => r.status === 'passed' && (r.summary?.errors ?? 0) === 0).length;
    const suitesSkipped = results.filter(r => r.status === 'skipped').length;
    const isFixMode = Boolean(cliOptions.values.fix);
    const isBuildMode = cliOptions.targetPreset === 'build' || Boolean(cliOptions.values.build);
    const isFullAudit = !isBuildMode && !isFixMode && tasksToRun.length === allAvailableTasks.length && omittedSuiteIds.length === 0;
    const byFamily = groupResultsByFamily(results, activeFamilies);
    const sortedCategories = computeAuditCategoryCounts(results);
    printFindingsSummary(results, sortedCategories);
    console.log(renderConsolidatedFooter(results.length, suitesPassed, totalErrors, totalWarnings, totalDuration, undefined, suitesSkipped));
    const hasSimilarCodeSetupFailure = results.some(r => r.findings?.some(f => f.ruleId === 'fallow-similar-code-failed' && (f.context === 'manual-setup-required' || f.context === 'model-not-ready')));
    if (hasSimilarCodeSetupFailure) {
        console.log('\n' + renderSimilarCodeWarningBanner() + '\n');
    }
    const ratchet = applyWarningRatchet(ctx, isFullAudit, totalErrors);
    const anyFailed = totalErrors > 0 || (suitesPassed + suitesSkipped) < results.length || ratchet?.status === 'failed';
    const fixableSuiteIds = new Set(tasksToRun.filter(t => t.capabilities?.fix).map(t => t.id));
    const fixableErrors = results.reduce((acc, r) => {
        const isFixSuite = fixableSuiteIds.has(r.id);
        const errCount = r.findings?.filter(f => f.severity === 'error' && (isFixSuite || f.fixable)).length ?? 0;
        return acc + errCount;
    }, 0);
    const fixableWarnings = results.reduce((acc, r) => {
        const isFixSuite = fixableSuiteIds.has(r.id);
        const warnCount = r.findings?.filter(f => f.severity === 'warning' && (isFixSuite || f.fixable)).length ?? 0;
        return acc + warnCount;
    }, 0);
    const autoFixRecommended = !isFixMode && (fixableErrors > 0 || fixableWarnings > 0);
    if (autoFixRecommended) {
        console.log('\n' + renderAutoFixNoticeBanner(fixableErrors, fixableWarnings) + '\n');
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
        autoFixRecommended
    });
    const latestAuditPath = path.join(scratchAuditsDir, 'latest_audit.json');
    const latestSummaryPath = path.join(scratchAuditsDir, 'latest_summary.json');
    const latestByFilePath = path.join(scratchAuditsDir, 'by_file.json');
    await fs.writeFile(latestAuditPath, JSON.stringify(consolidatedReport, null, 2), 'utf-8');
    await fs.writeFile(latestSummaryPath, JSON.stringify({
        meta,
        status: consolidatedReport.status,
        summary: consolidatedReport.summary,
        suites: results.map(r => ({
            id: r.id, name: r.name, family: r.family, status: r.status, durationMs: r.durationMs,
            metrics: r.metrics, errors: r.summary.errors, warnings: r.summary.warnings
        }))
    }, null, 2), 'utf-8');
    const byFileReport = {
        meta,
        status: consolidatedReport.status,
        summary: consolidatedReport.summary,
        totalAffectedFiles: Object.keys(fileSummaryMap).length,
        files: fileSummaryMap
    };
    await fs.writeFile(latestByFilePath, JSON.stringify(byFileReport, null, 2), 'utf-8');
    if (!isFullAudit && !isBuildMode && !isFixMode) {
        console.log(styleText('yellow', `⚠️  ADVERTENCIA DE AUDITORÍA PARCIAL:`));
        console.log(styleText('yellow', `   latest_audit.json se actualizó con meta.isFullAudit = false (${tasksToRun.length}/${allAvailableTasks.length} suites).`));
        console.log(styleText('dim', `   Los inspectores de calidad exigirán una corrida completa ('npm run audit').\n`));
    }
    console.log(styleText('dim', `💾 Reporte detallado para IA / herramientas disponible en:`));
    console.log(styleText('cyan', `   📄 ${path.relative(process.cwd(), latestAuditPath)}\n`));
    await exportCustomOutputReport(cliOptions, consolidatedReport, results, suitesPassed, totalDuration);
    return anyFailed;
}
function findTaskByUidOrName(allTasks, targetUid) {
    const matchById = allTasks.find(t => t.id === targetUid);
    if (matchById) {
        return matchById;
    }
    const targetQuery = targetUid.toLowerCase(); // domain-ok: Open dynamic text or non-domain string payload
    return allTasks.find(t => t.name.toLowerCase() === targetQuery);
}
function handleHelpCommand(cliOptions, allAvailableTasks, activeFamilies) {
    const requestedUid = typeof cliOptions.values.info === 'string'
        ? cliOptions.values.info
        : cliOptions.positionals.find(p => p !== 'help' && !activeFamilies.includes(p));
    if (requestedUid) {
        const task = findTaskByUidOrName(allAvailableTasks, requestedUid);
        if (!task) {
            console.error(styleText('red', `\n❌ Suite no encontrada: '${requestedUid}'. Ejecuta 'auditor --list' para ver todas las disponibles.\n`));
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
        icon: t.icon ?? '🏛️',
        description: t.description ?? t.name,
        enabled,
        ...(disabledReason ? { disabledReason } : {}),
        capabilities: {
            fix: Boolean(t.capabilities?.fix),
            lint: Boolean(t.capabilities?.lint),
            md: Boolean(t.capabilities?.md),
            ast: Boolean(t.capabilities?.ast || t.requiresAst),
            changedSince: Boolean(t.capabilities?.changedSince),
            heavy: Boolean(t.capabilities?.heavy),
            requiresBuild: Boolean(t.capabilities?.requiresBuild),
            postRun: Boolean(t.capabilities?.postRun)
        },
        rules: t.ruleDescriptions ?? {},
        configKey: t.configKey
    }));
    console.log(JSON.stringify(manifests, null, 2));
    process.exit(0);
}
function handleListCommand(cliOptions, allAvailableTasks, activeFamilies, config) {
    const evaluated = allAvailableTasks.map(t => {
        const status = evaluateSuiteStatus(t.id, config, t.configKey);
        return { task: t, enabled: status.enabled, disabledReason: status.reason };
    });
    let filtered = evaluated;
    let listFilter = 'all';
    if (cliOptions.isEnabledFilter) {
        filtered = evaluated.filter(item => item.enabled);
        listFilter = 'enabled';
    }
    else if (cliOptions.isDisabledFilter) {
        filtered = evaluated.filter(item => !item.enabled);
        listFilter = 'disabled';
    }
    if (cliOptions.values.json) {
        handleListJsonOutput(filtered);
    }
    const disabledMap = new Map();
    for (const item of evaluated) {
        if (!item.enabled && item.disabledReason) {
            disabledMap.set(item.task.id, item.disabledReason);
        }
    }
    console.log(renderAuditorsRegistryTable(filtered.map(item => item.task), activeFamilies, { filter: listFilter, disabledReasons: disabledMap }));
    process.exit(0);
}
function handleInfoCommand(targetUid, allAvailableTasks) {
    const task = findTaskByUidOrName(allAvailableTasks, targetUid);
    if (!task) {
        console.error(styleText('red', `\n❌ Suite no encontrada: '${targetUid}'. Ejecuta 'auditor --list' para ver todas las disponibles.\n`));
        process.exit(1);
    }
    console.log(renderAuditorDetailCard(task));
    process.exit(0);
}
function handleIntrospectionCommands(cliOptions, allAvailableTasks, activeFamilies, config) {
    if (cliOptions.values.help || cliOptions.positionals.includes('help')) {
        handleHelpCommand(cliOptions, allAvailableTasks, activeFamilies);
    }
    const isListCommand = Boolean(cliOptions.values.list ||
        cliOptions.positionals.includes('list') ||
        cliOptions.positionals.includes('list:enabled') ||
        cliOptions.positionals.includes('list:disabled') ||
        cliOptions.isEnabledFilter ||
        cliOptions.isDisabledFilter);
    if (isListCommand) {
        handleListCommand(cliOptions, allAvailableTasks, activeFamilies, config);
    }
    const targetUid = typeof cliOptions.values.info === 'string'
        ? cliOptions.values.info
        : (cliOptions.positionals.includes('info')
            ? cliOptions.positionals.find(p => p !== 'info' && !activeFamilies.includes(p))
            : undefined);
    if (targetUid) {
        handleInfoCommand(targetUid, allAvailableTasks);
    }
    return false;
}
export function createAuditBannerDetails(cliOptions, isFixMode, isBuildMode, tasksCount, allAvailableCount, omittedCount) {
    const subtitleDetails = [
        `v${AUDITOR_VERSION}`,
        isFixMode
            ? `Suites con Auto-Reparación: ${tasksCount} suites`
            : `Auto-descubiertas: ${tasksCount}/${allAvailableCount} suites`
    ];
    if (isFixMode) {
        subtitleDetails.push('Modo: AUTO-FIX 🛠️');
    }
    else if (isBuildMode) {
        subtitleDetails.push('Modo: POST-BUILD 🏗️');
    }
    else {
        if (cliOptions.targetPreset)
            subtitleDetails.push(`Preset: ${cliOptions.targetPreset.toUpperCase()}`);
        if (cliOptions.values.family)
            subtitleDetails.push(`Familia: ${String(cliOptions.values.family).toUpperCase()}`);
        if (cliOptions.skipSimilar)
            subtitleDetails.push('Similar-Code: OMITIDO ⏭️');
        if (tasksCount !== allAvailableCount || omittedCount > 0)
            subtitleDetails.push('Modo: PARCIAL ⚠️');
    }
    return subtitleDetails;
}
async function runTaskExecution(task, ctx, subLines) {
    const taskArgs = buildTaskArgs(task, ctx.cliOptions.values, ctx.cliOptions.formattedRules);
    if (task.requiresAst && ctx.sharedAstContext) {
        const inProcess = await executeTaskInProcess(task, ctx.sharedAstContext, (line) => subLines.push(line));
        if (inProcess) {
            return { result: inProcess.result, durationMs: inProcess.durationMs };
        }
    }
    const proc = await executeAuditorStreaming(task, taskArgs, (subLine) => subLines.push(subLine));
    const parsed = await parseSubprocessOutput(task, proc, ctx.scratchAuditsDir);
    return { result: parsed, durationMs: proc.durationMs };
}
function normalizeTaskSummaryAndSubLines(result, subLines) {
    if (!result.summary) {
        const errCount = result.findings?.filter(f => f.severity === 'error').length ?? (result.status === 'failed' ? 1 : 0);
        const warnCount = result.findings?.filter(f => f.severity === 'warning').length ?? 0;
        result.summary = { errors: errCount, warnings: warnCount, info: 0 };
    }
    const isSkipped = result.status === 'skipped' || result.metrics?.['Estado'] === 'OMITIDO ⏭️';
    if (isSkipped) {
        result.status = 'skipped';
        subLines.length = 0;
        const reason = result.metrics?.['Skip-Reason'] || 'Análisis omitido';
        subLines.push(`⏭️  ${reason}`);
        return true;
    }
    if (subLines.length === 0 && result.subAuditors && result.subAuditors.length > 0) {
        const total = result.subAuditors.length;
        for (let i = 0; i < total; i++) {
            const s = result.subAuditors[i];
            const badge = s.count > 0 ? ` (🐛 ${s.count})` : '';
            subLines.push(`🔍 [${i + 1}/${total}] ${s.name}${badge}`);
        }
    }
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
        isSuccess: result.status === 'passed',
        hasWarnings: (result.summary?.warnings ?? 0) > 0,
        isSkipped,
        isBuiltin: task.isBuiltin !== false,
        icon: result.icon ?? task.icon,
        taskIndex
    });
    return result;
}
function checkEarlyCliCommands() {
    if (process.argv.includes('-v') || process.argv.includes('--version') || process.argv.includes('version')) {
        console.log(`@francogp/auditor v${AUDITOR_VERSION}`);
        const exit = process.exit;
        exit(0);
        return;
    }
    process.env.AUDIT_SUBPROCESS = 'true';
    if (process.argv.slice(2).some(a => a === 'fix' || a === '--fix')) {
        for (const moved of migrateLegacyAuditConfig(process.cwd())) {
            console.log(styleText('green', `🛠️  ${moved} movido a .auditor/${moved} (imports relativos reescritos).`));
        }
    }
}
async function setupMasterAuditDirectories(activeFamilies) {
    const scratchAuditsDir = path.resolve(process.cwd(), 'scratch/audits');
    await fs.mkdir(scratchAuditsDir, { recursive: true });
    for (const family of activeFamilies) {
        await fs.mkdir(path.join(scratchAuditsDir, family), { recursive: true });
    }
    return scratchAuditsDir;
}
async function setupCoverageRunEnvironment(runMode, workerTasks) {
    const runId = `run_${Temporal.Now.instant().epochMilliseconds}_${Math.random().toString(36).substring(2, 8)}`;
    process.env[COVERAGE_RUN_ID_ENV] = runId;
    process.env[COVERAGE_RUN_MODE_ENV] = runMode;
    process.env[COVERAGE_EXPECTED_SUITES_ENV] = workerTasks.map(t => t.id).join(',');
    const coverageLedgerDir = path.resolve(process.cwd(), COVERAGE_LEDGER_DIR);
    await fs.rm(coverageLedgerDir, { recursive: true, force: true });
    await fs.mkdir(coverageLedgerDir, { recursive: true });
}
function displayMasterBanner(config, cliOptions, isFixMode, isBuildMode, tasksToRun, allAvailableTasks, omittedSuiteIds) {
    const subtitleDetails = createAuditBannerDetails(cliOptions, isFixMode, isBuildMode, tasksToRun.length, allAvailableTasks.length, omittedSuiteIds.length);
    let bannerTitle = config.name ? `${config.name.toUpperCase()} - SUITE DE AUDITORÍA GLOBAL Y VALIDACIÓN` : 'SUITE DE AUDITORÍA GLOBAL Y VALIDACIÓN';
    if (isFixMode) {
        bannerTitle = '[ 🛠️ MODO REPARACIÓN AUTOMÁTICA ]';
    }
    else if (isBuildMode) {
        bannerTitle = '[ 🏗️ MODO POST-BUILD / ARTEFACTOS COMPILADOS ]';
    }
    console.log(renderBanner(bannerTitle, subtitleDetails.join('  |  ')));
}
function sortTasksByOrder(tasks) {
    tasks.sort((a, b) => {
        const orderA = (a.order ?? FALLBACK_FAMILY_ORDER);
        const orderB = (b.order ?? FALLBACK_FAMILY_ORDER);
        if (orderA !== orderB)
            return orderA - orderB;
        return a.id.localeCompare(b.id);
    });
}
async function executeAllAuditTasks(workerTasks, postRunTasks, taskCtx, concurrencyLimit) {
    console.log(styleText('bold', `⏳ Progreso de ejecución de suites (Concurrencia: ${concurrencyLimit} workers):\n`));
    const executeSingleTask = (task, index) => {
        return executeSingleAuditTask(task, taskCtx, index);
    };
    const workerResults = await runAuditWorkers(workerTasks, concurrencyLimit, executeSingleTask);
    const postRunResults = [];
    for (let pIdx = 0; pIdx < postRunTasks.length; pIdx++) {
        const postTask = postRunTasks[pIdx];
        postRunResults.push(await executeSingleTask(postTask, workerTasks.length + pIdx));
    }
    return [...workerResults, ...postRunResults];
}
export async function runMasterAudit() {
    checkEarlyCliCommands();
    const startTime = performance.now();
    const config = await loadAuditConfig();
    assertAuditConfigComplete(config);
    const activeFamilies = getActiveFamilies(config.customFamilies);
    const cliOptions = parseAuditFullCliArgs(activeFamilies);
    if (cliOptions.skipSimilar) {
        process.env.AUDIT_SKIP_SIMILAR = 'true';
    }
    const scratchAuditsDir = await setupMasterAuditDirectories(activeFamilies);
    const isFixMode = Boolean(cliOptions.values.fix);
    const isBuildMode = cliOptions.targetPreset === 'build' || Boolean(cliOptions.values.build);
    const withBuild = Boolean(cliOptions.values['with-build'] || cliOptions.values.all);
    const discoveryBase = {
        fixOnly: isFixMode,
        buildOnly: isBuildMode,
        withBuild,
        includeHeavy: (cliOptions.targetPreset === 'lint' || cliOptions.targetPreset === 'md') ? false : true
    };
    const allAvailableTasks = await discoverAuditors(isBuildMode ? { buildOnly: true } : { withBuild });
    handleIntrospectionCommands(cliOptions, allAvailableTasks, activeFamilies, config);
    const tasksToRun = await discoverAuditors({
        ...discoveryBase,
        family: cliOptions.targetFamily,
        task: cliOptions.targetSuites ? undefined : cliOptions.values.task,
        suites: cliOptions.targetSuites,
        preset: cliOptions.targetPreset
    });
    const executedSuiteIds = tasksToRun.map(t => t.id);
    const allSuiteIds = allAvailableTasks.map(t => t.id);
    const omittedSuiteIds = allSuiteIds.filter(id => !executedSuiteIds.includes(id));
    const runMode = determineRunMode(cliOptions.targetPreset, cliOptions.targetSuites, cliOptions.values.task, cliOptions.targetFamily);
    sortTasksByOrder(tasksToRun);
    const workerTasks = tasksToRun.filter(t => !t.capabilities?.postRun);
    const postRunTasks = tasksToRun.filter(t => t.capabilities?.postRun);
    await setupCoverageRunEnvironment(runMode, workerTasks);
    displayMasterBanner(config, cliOptions, isFixMode, isBuildMode, tasksToRun, allAvailableTasks, omittedSuiteIds);
    if (tasksToRun.length === 0) {
        console.log(styleText('yellow', '⚠️ No se encontraron auditores que coincidan con los filtros especificados.'));
        process.exit(0);
    }
    const astTasks = tasksToRun.filter(t => t.requiresAst);
    let sharedAstContext;
    if (astTasks.length > 0) {
        console.log(styleText('cyan', `🧠 [AST Engine] Detectados ${astTasks.length} sub-auditor(es) que requieren AST. Inicializando contexto AST compartido...\n`));
        sharedAstContext = new SharedAstContext();
    }
    const coordinator = new TaskStreamCoordinator(tasksToRun.length, { indent: '  ' });
    const taskCtx = { cliOptions, sharedAstContext, scratchAuditsDir, coordinator };
    const results = await executeAllAuditTasks(workerTasks, postRunTasks, taskCtx, cliOptions.concurrencyLimit);
    const totalDuration = Math.round(performance.now() - startTime);
    const anyFailed = await renderAndPersistMasterReport({
        results, tasksToRun, allAvailableTasks, omittedSuiteIds, totalDuration,
        config, activeFamilies, cliOptions, runMode, scratchAuditsDir
    });
    if (anyFailed) {
        process.exit(1);
    }
}
if (isMainModule(import.meta.url)) {
    runMasterAudit().catch(err => {
        console.error(styleText('red', `\n💥 Error fatal en audit_full: ${err.message}`));
        process.exit(1);
    });
}
//# sourceMappingURL=audit_full.js.map