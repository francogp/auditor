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
import { loadAuditConfig, assertAuditConfigComplete } from "../core/auditConfig.js";
import { renderBanner, renderConsolidatedFooter, renderMarkdownReport, renderFindingsBreakdownTable, renderSampleFindings, renderSimilarCodeWarningBanner } from "../core/unifiedTheme.js";
import { discoverAuditors } from "./auditScanner.js";
import { executeAuditorStreaming, isNodeInternalWarning, TaskStreamCoordinator } from "../core/streamingRunner.js";
import { SharedAstContext } from "../core/astContext.js";
import { BaseAuditor } from "../core/auditorBase.js";
import { AUDITOR_VERSION } from "../core/version.js";
import { isMainModule } from "./cliUtils.js";
import "../core/permissionGuard.js";
enableCompileCache();
const CPU_CORE_DIVISOR = 2;
const MIN_CONCURRENCY = 1;
const DECIMAL_RADIX = 10;
const DEFAULT_SUBPROCESS_TIMEOUT_MS = 0;
function resolveTargetFamily(familyOption, positionals, activeFamilies) {
    const positionalFamily = positionals.find(p => activeFamilies.includes(p));
    return familyOption || positionalFamily;
}
function resolveFormattedRules(values, positionals) {
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
function resolveTargetSuites(values) {
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
function resolveConcurrencyLimit(concurrencyValue) {
    const availableCpus = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
    const defaultConcurrency = Math.max(MIN_CONCURRENCY, Math.floor(availableCpus / CPU_CORE_DIVISOR));
    if (concurrencyValue) {
        return Math.max(MIN_CONCURRENCY, Number.parseInt(concurrencyValue, DECIMAL_RADIX) || defaultConcurrency);
    }
    return defaultConcurrency;
}
function resolveSkipSimilar() {
    return (process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS === 'true' ||
        process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS === '1' ||
        process.env.AUDIT_SKIP_SIMILAR === 'true' ||
        process.env.AUDIT_SKIP_SIMILAR === '1');
}
function resolveTargetPreset(values, positionals) {
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
function parseAuditFullCliArgs(activeFamilies) {
    const args = process.argv.slice(2);
    const BOOLEAN_FLAGS = [
        'errors-only', 'fix', 'all', 'build', 'with-build'
    ];
    const normalized = args.map(a => a.includes('=') && !a.startsWith('-') ? `--${a}` : (BOOLEAN_FLAGS.includes(a) ? `--${a}` : a));
    const { values, positionals } = parseArgs({
        args: normalized,
        options: {
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
            'with-build': { type: 'boolean' }
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
        skipSimilar: resolveSkipSimilar()
    };
}
function determineRunMode(targetPreset, targetSuites, taskArg, targetFamily) {
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
function buildTaskArgs(task, values, formattedRules) {
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
function extractSubprocessErrorMessage(proc, timeoutMs = DEFAULT_SUBPROCESS_TIMEOUT_MS, task) {
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
            results[idx] = await taskExecutor(tasks[idx]);
        }
    }
    const workerCount = Math.min(concurrency, tasks.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);
    return results;
}
const ERROR_WEIGHT_FACTOR = 1000;
function computeAuditCategoryCounts(results) {
    const categoryCounts = new Map();
    for (const suite of results) {
        for (const finding of (suite.findings || [])) {
            const catKey = finding.ruleDescription || suite.description || finding.ruleId || suite.name;
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
    const { ctx, totalErrors, totalWarnings, suitesPassed, anyFailed, isFullAudit, byFamily } = params;
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
            durationMs: ctx.totalDuration
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
async function renderAndPersistMasterReport(ctx) {
    const { results, tasksToRun, allAvailableTasks, omittedSuiteIds, totalDuration, activeFamilies, cliOptions, scratchAuditsDir } = ctx;
    const totalErrors = results.reduce((acc, r) => acc + (r.summary?.errors ?? 0), 0);
    const totalWarnings = results.reduce((acc, r) => acc + (r.summary?.warnings ?? 0), 0);
    const suitesPassed = results.filter(r => r.status === 'passed' && (r.summary?.errors ?? 0) === 0).length;
    const suitesSkipped = results.filter(r => r.status === 'skipped').length;
    const anyFailed = totalErrors > 0 || (suitesPassed + suitesSkipped) < results.length;
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
    const { meta, consolidatedReport, fileSummaryMap } = buildConsolidatedReport({
        ctx,
        totalErrors,
        totalWarnings,
        suitesPassed,
        anyFailed,
        isFullAudit,
        byFamily
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
export async function runMasterAudit() {
    if (process.argv.includes('-v') || process.argv.includes('--version') || process.argv.includes('version')) {
        console.log(`@francogp/auditor v${AUDITOR_VERSION}`);
        process.exit(0);
    }
    process.env.AUDIT_SUBPROCESS = 'true';
    const startTime = performance.now();
    const config = await loadAuditConfig();
    assertAuditConfigComplete(config);
    const activeFamilies = getActiveFamilies(config.customFamilies);
    const cliOptions = parseAuditFullCliArgs(activeFamilies);
    if (cliOptions.skipSimilar) {
        process.env.AUDIT_SKIP_SIMILAR = 'true';
    }
    const scratchAuditsDir = path.resolve(process.cwd(), 'scratch/audits');
    await fs.mkdir(scratchAuditsDir, { recursive: true });
    for (const family of activeFamilies) {
        await fs.mkdir(path.join(scratchAuditsDir, family), { recursive: true });
    }
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
    tasksToRun.sort((a, b) => {
        const orderA = (a.order ?? FALLBACK_FAMILY_ORDER);
        const orderB = (b.order ?? FALLBACK_FAMILY_ORDER);
        if (orderA !== orderB)
            return orderA - orderB;
        return a.id.localeCompare(b.id);
    });
    const subtitleDetails = [
        `v${AUDITOR_VERSION}`,
        isFixMode
            ? `Suites con Auto-Reparación: ${tasksToRun.length} suites`
            : `Auto-descubiertas: ${tasksToRun.length}/${allAvailableTasks.length} suites`
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
        if (tasksToRun.length !== allAvailableTasks.length || omittedSuiteIds.length > 0)
            subtitleDetails.push('Modo: PARCIAL ⚠️');
    }
    const defaultBannerTitle = config.name ? `${config.name.toUpperCase()} - SUITE DE AUDITORÍA GLOBAL Y VALIDACIÓN` : 'SUITE DE AUDITORÍA GLOBAL Y VALIDACIÓN';
    let bannerTitle = defaultBannerTitle;
    if (isFixMode) {
        bannerTitle = '[ 🛠️ MODO REPARACIÓN AUTOMÁTICA ]';
    }
    else if (isBuildMode) {
        bannerTitle = '[ 🏗️ MODO POST-BUILD / ARTEFACTOS COMPILADOS ]';
    }
    console.log(renderBanner(bannerTitle, subtitleDetails.join('  |  ')));
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
    console.log(styleText('bold', `⏳ Progreso de ejecución de suites (Concurrencia: ${cliOptions.concurrencyLimit} workers):\n`));
    const coordinator = new TaskStreamCoordinator(tasksToRun.length, { indent: '  ' });
    async function executeSingleTask(task) {
        const taskArgs = buildTaskArgs(task, cliOptions.values, cliOptions.formattedRules);
        const subLines = [];
        let parsedResult = null;
        let taskDuration = 0;
        if (task.requiresAst && sharedAstContext) {
            const inProcess = await executeTaskInProcess(task, sharedAstContext, (line) => subLines.push(line));
            if (inProcess) {
                parsedResult = inProcess.result;
                taskDuration = inProcess.durationMs;
            }
        }
        if (!parsedResult) {
            const proc = await executeAuditorStreaming(task, taskArgs, (subLine) => subLines.push(subLine));
            taskDuration = proc.durationMs;
            parsedResult = await parseSubprocessOutput(task, proc, scratchAuditsDir);
        }
        const currentResult = parsedResult;
        if (!currentResult.summary) {
            const errCount = currentResult.findings?.filter(f => f.severity === 'error').length ?? (currentResult.status === 'failed' ? 1 : 0);
            const warnCount = currentResult.findings?.filter(f => f.severity === 'warning').length ?? 0;
            currentResult.summary = { errors: errCount, warnings: warnCount, info: 0 };
        }
        const isSkipped = currentResult.status === 'skipped' || currentResult.metrics?.['Estado'] === 'OMITIDO ⏭️';
        if (isSkipped) {
            currentResult.status = 'skipped';
            subLines.length = 0;
            const reason = currentResult.metrics?.['Skip-Reason'] || 'Análisis omitido';
            subLines.push(`⏭️  ${reason}`);
        }
        else if (subLines.length === 0 && currentResult.subAuditors && currentResult.subAuditors.length > 0) {
            const total = currentResult.subAuditors.length;
            for (let i = 0; i < total; i++) {
                const s = currentResult.subAuditors[i];
                const badge = s.count > 0 ? ` (🐛 ${s.count})` : '';
                subLines.push(`🔍 [${i + 1}/${total}] ${s.name}${badge}`);
            }
        }
        await coordinator.onTaskComplete({
            taskName: task.name,
            taskId: task.id,
            subLines,
            durationMs: taskDuration,
            isSuccess: currentResult.status === 'passed',
            hasWarnings: (currentResult.summary?.warnings ?? 0) > 0,
            isSkipped,
            isBuiltin: task.isBuiltin !== false,
            icon: currentResult.icon ?? task.icon
        });
        return currentResult;
    }
    const results = await runAuditWorkers(tasksToRun, cliOptions.concurrencyLimit, executeSingleTask);
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