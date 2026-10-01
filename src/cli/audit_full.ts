/**
 * scripts/maintenance/audit_full.ts
 * 
 * MASTER AUDIT ORCHESTRATOR & UNIFIED RUNNER (Node.js 26+)
 * Dynamically discovers and executes all sub-auditors in scripts/auditors/:
 *   1. Displays formatted step-by-step progress with clean newlines.
 *   2. Renders the complete Box-Drawing summary table grouped by family.
 *   3. Persists the complete structured JSON report to scratch/audits/latest_audit.json.
 */

import { parseArgs, styleText } from 'node:util';
import { enableCompileCache } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  type StandardAuditResult,
  type AuditFinding,
  type AuditFamily,
  type AuditTaskDefinition,
  type AuditRunMetadata,
  type AuditRunMode,
  type ConsolidatedAuditReport,
  resolveFamilyMetadata,
  getActiveFamilies
} from '../core/auditContract.ts';
import { loadAuditConfig } from '../core/auditConfig.ts';
import {
  renderBanner,
  renderConsolidatedFooter,
  renderMarkdownReport,
  renderBoxTable,
  type TableColumn
} from '../core/unifiedTheme.ts';
import { discoverAuditors, type AuditPresetName } from './auditScanner.ts';
import { executeAuditorStreaming, isNodeInternalWarning } from '../core/streamingRunner.ts';
import { SharedAstContext } from '../core/astContext.ts';
import { BaseAuditor } from '../core/auditorBase.ts';

enableCompileCache();

const CPU_CORE_DIVISOR = 2 as const;
const MIN_CONCURRENCY = 1 as const;
const DECIMAL_RADIX = 10 as const;

async function runMasterAudit() {
  process.env.AUDIT_SUBPROCESS = 'true';
  const startTime = performance.now();
  const config = await loadAuditConfig();
  const activeFamilies = getActiveFamilies(config.customFamilies);
  const args = process.argv.slice(2);
  const normalized = args.map(a => a.includes('=') && !a.startsWith('-') ? `--${a}` : (['errors-only', 'fix', 'all'].includes(a) ? `--${a}` : a));

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
      fix: { type: 'boolean' }
    },
    allowPositionals: true,
    strict: false
  });

  const positionalFamily = positionals.find(p => (activeFamilies as readonly string[]).includes(p)); // domain-ok: Open dynamic text or non-domain string payload
  const targetFamily = values.family || positionalFamily;

  const rawRuleArgs: string[] = []; // no-domain: Non-domain utility collection or data structure
  if (values.rule) {
    if (Array.isArray(values.rule)) {
      for (const item of values.rule) rawRuleArgs.push(String(item));
    } else {
      rawRuleArgs.push(String(values.rule));
    }
  }
  if (values.rules) {
    if (Array.isArray(values.rules)) {
      for (const item of values.rules) rawRuleArgs.push(String(item));
    } else {
      rawRuleArgs.push(String(values.rules));
    }
  }
  for (const pos of positionals) {
    if (pos.toLowerCase() === 'dox' || pos.includes(',')) { // string-ok: Internal string formatting or DOM token identifier
      rawRuleArgs.push(pos);
    }
  }
  const formattedRules = rawRuleArgs.join(',');

  // 1. Prepare clean scratch/audits directory structure
  const scratchAuditsDir = path.resolve(process.cwd(), 'scratch/audits');
  await fs.mkdir(scratchAuditsDir, { recursive: true });
  for (const family of activeFamilies) {
    await fs.mkdir(path.join(scratchAuditsDir, family), { recursive: true });
  }

  // 2. Auto-discover all auditor tasks dynamically from scripts/auditors/
  const allAvailableTasks = await discoverAuditors();
  const targetPreset = values.preset as AuditPresetName | undefined;
  let targetSuites: string[] | undefined = undefined; // no-domain: Non-domain utility collection or data structure
  if (values.suites) {
    targetSuites = String(values.suites).split(',').map(s => s.trim()).filter(Boolean);
  } else if (values.tasks) {
    targetSuites = String(values.tasks).split(',').map(s => s.trim()).filter(Boolean);
  } else if (typeof values.task === 'string' && values.task.includes(',')) {
    targetSuites = String(values.task).split(',').map(s => s.trim()).filter(Boolean);
  }

  const tasksToRun = await discoverAuditors({
    family: targetFamily as string | undefined,
    task: targetSuites ? undefined : (values.task as string | undefined),
    suites: targetSuites,
    preset: targetPreset
  });

  const executedSuiteIds = tasksToRun.map(t => t.id);
  const allSuiteIds = allAvailableTasks.map(t => t.id);
  const omittedSuiteIds = allSuiteIds.filter(id => !executedSuiteIds.includes(id));
  const isFullAudit = tasksToRun.length === allAvailableTasks.length && omittedSuiteIds.length === 0;

  let runMode: AuditRunMode = 'full';
  if (targetPreset) {
    runMode = 'preset';
  } else if (targetSuites && targetSuites.length > 1) {
    runMode = 'suites';
  } else if (values.task || (targetSuites && targetSuites.length === 1)) {
    runMode = 'single';
  } else if (targetFamily) {
    runMode = 'family';
  }

  // Sort tasks by canonical family order
  tasksToRun.sort((a, b) => {
    const orderA = (a.order ?? 99);
    const orderB = (b.order ?? 99);
    if (orderA !== orderB) return orderA - orderB;
    return a.id.localeCompare(b.id);
  });

  const subtitleDetails: string[] = [`Auto-descubiertas: ${tasksToRun.length}/${allAvailableTasks.length} suites`]; // no-domain: Non-domain utility collection or data structure
  if (targetPreset) subtitleDetails.push(`Preset: ${targetPreset.toUpperCase()}`);
  if (values.family) subtitleDetails.push(`Familia: ${String(values.family).toUpperCase()}`);
  if (!isFullAudit) subtitleDetails.push('Modo: PARCIAL ⚠️');

  const bannerTitle = config.name ? `${config.name.toUpperCase()} - SUITE DE AUDITORÍA GLOBAL Y VALIDACIÓN` : 'SUITE DE AUDITORÍA GLOBAL Y VALIDACIÓN';
  console.log(renderBanner(
    bannerTitle,
    subtitleDetails.join('  |  ')
  ));

  if (tasksToRun.length === 0) {
    console.log(styleText('yellow', '⚠️ No se encontraron auditores que coincidan con los filtros especificados.'));
    process.exit(0);
  }

  const availableCpus = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
  const defaultConcurrency = Math.max(MIN_CONCURRENCY, Math.floor(availableCpus / CPU_CORE_DIVISOR));
  const concurrencyLimit = values.concurrency
    ? Math.max(MIN_CONCURRENCY, Number.parseInt(values.concurrency as string, DECIMAL_RADIX) || defaultConcurrency)
    : defaultConcurrency;

  const astTasks = tasksToRun.filter(t => t.requiresAst);
  let sharedAstContext: SharedAstContext | undefined;
  if (astTasks.length > 0) {
    console.log(styleText('cyan', `🧠 [AST Engine] Detectados ${astTasks.length} sub-auditor(es) que requieren AST. Inicializando contexto AST compartido...\n`));
    sharedAstContext = new SharedAstContext();
  }

  console.log(styleText('bold', `⏳ Progreso de ejecución de suites (Concurrencia: ${concurrencyLimit} workers):\n`));

  class AuditStreamCoordinator {
    private completedCount = 0;
    private readonly totalTasks: number;
    private printLock: Promise<void> = Promise.resolve();

    constructor(totalTasks: number) {
      this.totalTasks = totalTasks;
    }

    public async onTaskComplete(
      task: AuditTaskDefinition,
      subLines: string[],
      durationMs: number,
      result: StandardAuditResult
    ): Promise<void> {
      const previousLock = this.printLock;
      let releaseLock: () => void = () => {};
      this.printLock = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });

      await previousLock;

      try {
        this.completedCount++;
        const pct = Math.round((this.completedCount / this.totalTasks) * 100);
        const stepStr = String(this.completedCount).padStart(2, '0');
        const totalStr = String(this.totalTasks).padStart(2, '0');
        const pctStr = `${String(pct).padStart(3, ' ')}%`;

        const statusBadge = result.status === 'passed'
          ? ((result.summary?.warnings ?? 0) > 0 ? styleText('yellow', '⚠️') : styleText('green', '✅'))
          : styleText('red', '❌');

        console.log(`  ${styleText('dim', `[ ${stepStr}/${totalStr} │ ${pctStr} ]`)} ⚙️  ${styleText('cyan', task.name)} ${styleText('dim', `(${task.id})`)}... ${statusBadge} ${styleText('dim', `${durationMs}ms`)}`);

        for (const line of subLines) {
          console.log(`     ${styleText('dim', '│')}  ${styleText('dim', line)}`);
        }
      } finally {
        releaseLock();
      }
    }
  }

  const coordinator = new AuditStreamCoordinator(tasksToRun.length);

  async function executeSingleTask(task: AuditTaskDefinition): Promise<StandardAuditResult> {
    const taskArgs = [...task.args];
    if (values['errors-only'] && !taskArgs.includes('--errors-only')) taskArgs.push('--errors-only');
    if (formattedRules && !taskArgs.includes('--rule')) taskArgs.push('--rule', formattedRules);
    if (values.top && !taskArgs.includes('--top')) taskArgs.push('--top', values.top as string);
    if (values['changed-since'] && !taskArgs.includes('--changed-since')) taskArgs.push('--changed-since', values['changed-since'] as string);
    if (values.fix && !taskArgs.includes('fix')) taskArgs.push('fix');

    const subLines: string[] = []; // no-domain: Non-domain utility collection or data structure
    let parsedResult: StandardAuditResult | null = null;
    let taskDuration = 0;

    if (task.requiresAst && sharedAstContext) {
      const taskStart = performance.now();
      try {
        const fullScriptPath = path.resolve(process.cwd(), task.scriptPath);
        const mod = await import(fullScriptPath);
        let AuditorClass: (new () => BaseAuditor) | undefined;
        for (const val of Object.values(mod)) {
          if (typeof val === 'function' && val.prototype instanceof BaseAuditor) {
            AuditorClass = val as new () => BaseAuditor;
            break;
          }
        }
        if (AuditorClass) {
          const auditor = new AuditorClass();
          parsedResult = await auditor.execute(sharedAstContext);
          taskDuration = Math.round(performance.now() - taskStart);
          parsedResult.durationMs = taskDuration;
        }
      } catch (_err) {
        // Fallback to streaming execution if in-process execution fails
      }
    }

    if (!parsedResult) {
      const proc = await executeAuditorStreaming(task, taskArgs, (subLine) => {
        subLines.push(subLine);
      });
      taskDuration = proc.durationMs;
      const taskJsonPath = path.join(scratchAuditsDir, task.family, `${task.id}.json`);

      try {
        const fileContent = await fs.readFile(taskJsonPath, 'utf-8');
        parsedResult = JSON.parse(fileContent) as StandardAuditResult;
        parsedResult.durationMs = taskDuration;
      } catch {
      if (proc.stdout) {
        try {
          const raw = proc.stdout.trim();
          const firstBrace = raw.indexOf('{');
          const lastBrace = raw.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            parsedResult = JSON.parse(raw.substring(firstBrace, lastBrace + 1)) as StandardAuditResult;
          }
        } catch {
          // Handled below
        }
      }
    }

    if (!parsedResult) {
      const isSuccess = !proc.timedOut && proc.status === 0;
      const findings: AuditFinding[] = [];

      let errorMsg: string;
      if (proc.timedOut) {
        errorMsg = `Timeout excedido (${task.timeoutMs ?? 60000}ms) en la ejecución de la suite.`;
      } else {
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
        errorMsg = cleanStderr || cleanStdout || `Código de salida ${proc.status}`;
      }

      if (!isSuccess) {
        findings.push({
          severity: 'error',
          message: errorMsg,
          file: task.scriptPath
        });
      }

      parsedResult = {
        id: task.id,
        name: task.name,
        description: task.description || task.name,
        family: task.family,
        status: isSuccess ? 'passed' : 'failed',
        durationMs: taskDuration,
        metrics: {},
        findings,
        summary: {
          errors: isSuccess ? 0 : 1,
          warnings: 0,
          info: 0
        }
      };
    }
  }

  const currentResult: StandardAuditResult = parsedResult;
    if (!currentResult.summary) {
      const errCount = currentResult.findings?.filter(f => f.severity === 'error').length ?? (currentResult.status === 'failed' ? 1 : 0);
      const warnCount = currentResult.findings?.filter(f => f.severity === 'warning').length ?? 0;
      currentResult.summary = {
        errors: errCount,
        warnings: warnCount,
        info: 0
      };
    }

    await coordinator.onTaskComplete(task, subLines, taskDuration, currentResult);
    return currentResult;
  }

  const results: StandardAuditResult[] = new Array(tasksToRun.length);
  let nextTaskIndex = 0;

  async function worker(): Promise<void> {
    while (nextTaskIndex < tasksToRun.length) {
      const idx = nextTaskIndex++;
      results[idx] = await executeSingleTask(tasksToRun[idx]!);
    }
  }

  const workerCount = Math.min(concurrencyLimit, tasksToRun.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  const totalDuration = Math.round(performance.now() - startTime);
  const totalErrors = results.reduce((acc, r) => acc + (r.summary?.errors ?? 0), 0);
  const totalWarnings = results.reduce((acc, r) => acc + (r.summary?.warnings ?? 0), 0);
  const suitesPassed = results.filter(r => r.status === 'passed' && (r.summary?.errors ?? 0) === 0).length;
  const anyFailed = totalErrors > 0 || suitesPassed < results.length;

  // Group results by family for visual presentation and JSON report
  const byFamily = new Map<AuditFamily, StandardAuditResult[]>();
  for (const f of activeFamilies) {
    byFamily.set(f, []);
  }
  for (const r of results) {
    if (!byFamily.has(r.family)) byFamily.set(r.family, []);
    byFamily.get(r.family)!.push(r);
  }

  // 2. Breakdown by Type of Error / Warning
  const categoryCounts = new Map<string, { errors: number; warnings: number; findings: AuditFinding[] }>();

  for (const suite of results) {
    for (const finding of (suite.findings || [])) {
      const catKey = finding.ruleDescription || suite.description || finding.ruleId || suite.name;
      if (!categoryCounts.has(catKey)) {
        categoryCounts.set(catKey, { errors: 0, warnings: 0, findings: [] });
      }
      const entry = categoryCounts.get(catKey)!;
      if (finding.severity === 'error') {
        entry.errors++;
      } else {
        entry.warnings++;
      }
      entry.findings.push(finding);
    }
  }

  const sortedCategories = Array.from(categoryCounts.entries()).sort((a, b) => {
    const totalB = b[1].errors * 1000 + b[1].warnings;
    const totalA = a[1].errors * 1000 + a[1].warnings;
    return totalB - totalA;
  });

  if (sortedCategories.length === 0) {
    console.log('\n' + styleText(['bold', 'green'], `✨ 100% de las suites aprobadas (${results.length}/${results.length}) sin errores ni advertencias.`));
  } else {
    console.log('\n' + styleText('bold', '📊 DESGLOSE POR TIPO DE ERROR Y ADVERTENCIA:\n'));

    interface BreakdownRow {
      category: string;
      errors: string;
      warnings: string;
    }

    const breakdownCols: readonly TableColumn<BreakdownRow>[] = [
      { header: 'TIPO DE INCIDENCIA / REGLA', width: 52, align: 'left', key: 'category' },
      { header: 'ERRORES', width: 9, align: 'right', key: 'errors' },
      { header: 'WARNINGS', width: 9, align: 'right', key: 'warnings' }
    ];

    const breakdownRows: BreakdownRow[] = sortedCategories.map(([catName, data]) => ({
      category: catName,
      errors: data.errors > 0 ? styleText('red', String(data.errors)) : styleText('dim', '0'),
      warnings: data.warnings > 0 ? styleText('yellow', String(data.warnings)) : styleText('dim', '0')
    }));

    const totalErrors = sortedCategories.reduce((acc, [_, data]) => acc + data.errors, 0);
    const totalWarnings = sortedCategories.reduce((acc, [_, data]) => acc + data.warnings, 0);

    const footerRow: BreakdownRow = {
      category: styleText('bold', 'TOTAL CONSOLIDADO'),
      errors: totalErrors > 0 ? styleText(['bold', 'red'], String(totalErrors)) : styleText('dim', '0'),
      warnings: totalWarnings > 0 ? styleText(['bold', 'yellow'], String(totalWarnings)) : styleText('dim', '0')
    };

    console.log(renderBoxTable(breakdownCols, breakdownRows, { footerRows: [footerRow] }));

    const allErrors: AuditFinding[] = [];
    for (const suite of results) {
      for (const finding of (suite.findings || [])) {
        if (finding.severity === 'error') {
          allErrors.push(finding);
        }
      }
    }

    if (allErrors.length > 0) {
      const sampleErrors = allErrors.slice(-5);
      console.log(`\n❌ Muestra de errores detectados (últimos ${sampleErrors.length} de ${allErrors.length}):\n`);
      sampleErrors.forEach((f, idx) => {
        const fileLoc = f.file ? `${path.relative(process.cwd(), f.file)}${f.line !== undefined ? `:${f.line}` : ''}` : 'General';
        const cleanMsg = f.message.replace(/^Sugerencia de calidad \(Fallow\):\s*/i, '');
        const normalizedRuleDesc = (f.ruleDescription || '').replace(/^Fallow:\s*/i, '').trim().toLowerCase();
        const ruleTag = f.ruleDescription && !cleanMsg.toLowerCase().includes(normalizedRuleDesc)
          ? `[${f.ruleDescription}] `
          : (f.ruleDescription?.startsWith('Fallow:') ? '[Fallow] ' : (f.ruleId ? `[${f.ruleId}] ` : ''));
        console.log(`  ${idx + 1}. ${fileLoc}: ${ruleTag}${cleanMsg}`);
      });
      console.log('');
    }
  }

  // 3. Consolidated Footer
  console.log(renderConsolidatedFooter(
    results.length,
    suitesPassed,
    totalErrors,
    totalWarnings,
    totalDuration
  ));

  // 4. Always save complete machine-readable report to scratch/audits/
  const meta: AuditRunMetadata = {
    version: '2.0.0',
    timestamp: Temporal.Now.instant().toString(),
    isFullAudit,
    runMode,
    preset: targetPreset ?? null,
    targetFamily: (targetFamily as string) ?? null,
    totalDiscoveredSuites: allAvailableTasks.length,
    executedSuiteCount: tasksToRun.length,
    executedSuites: executedSuiteIds,
    omittedSuites: omittedSuiteIds,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      cwd: process.cwd()
    }
  };

  const consolidatedReport: ConsolidatedAuditReport = {
    meta,
    status: anyFailed ? 'failed' : 'passed',
    summary: {
      totalViolations: totalErrors + totalWarnings,
      errors: totalErrors,
      warnings: totalWarnings,
      suitesTotal: results.length,
      suitesPassed,
      suitesFailed: results.length - suitesPassed,
      durationMs: totalDuration
    },
    families: Object.fromEntries(
      activeFamilies.map(f => [
        f,
        {
          title: resolveFamilyMetadata(f, config.customFamilies).title,
          suites: byFamily.get(f) ?? []
        }
      ])
    ) as Record<AuditFamily, { title: string; suites: StandardAuditResult[] }>,
    allFindings: results.flatMap(r => r.findings)
  };

  const latestAuditPath = path.join(scratchAuditsDir, 'latest_audit.json');
  const latestSummaryPath = path.join(scratchAuditsDir, 'latest_summary.json');

  await fs.writeFile(latestAuditPath, JSON.stringify(consolidatedReport, null, 2), 'utf-8');
  await fs.writeFile(latestSummaryPath, JSON.stringify({
    meta,
    status: consolidatedReport.status,
    summary: consolidatedReport.summary,
    suites: results.map(r => ({
      id: r.id,
      name: r.name,
      family: r.family,
      status: r.status,
      durationMs: r.durationMs,
      metrics: r.metrics,
      errors: r.summary.errors,
      warnings: r.summary.warnings
    }))
  }, null, 2), 'utf-8');

  if (!isFullAudit) {
    console.log(styleText('yellow', `⚠️  ADVERTENCIA DE AUDITORÍA PARCIAL:`));
    console.log(styleText('yellow', `   latest_audit.json se actualizó con meta.isFullAudit = false (${tasksToRun.length}/${allAvailableTasks.length} suites).`));
    console.log(styleText('dim', `   Los inspectores de calidad exigirán una corrida completa ('npm run audit').\n`));
  }

  console.log(styleText('dim', `💾 Reporte detallado para IA / herramientas disponible en:`));
  console.log(styleText('cyan', `   📄 ${path.relative(process.cwd(), latestAuditPath)}\n`));

  // 5. Export report if --output is specified
  if (values.output) {
    const outputPath = path.resolve(process.cwd(), values.output as string);
    if (outputPath.endsWith('.json')) {
      await fs.writeFile(outputPath, JSON.stringify(consolidatedReport, null, 2), 'utf-8');
    } else if (outputPath.endsWith('.md')) {
      const md = renderMarkdownReport(results, suitesPassed, totalDuration);
      await fs.writeFile(outputPath, md, 'utf-8');
    } else {
      const lines = results.map(r => `[${r.status.toUpperCase()}] ${r.name} (${r.durationMs}ms) - Errors: ${r.summary.errors}, Warnings: ${r.summary.warnings}`);
      await fs.writeFile(outputPath, lines.join('\n'), 'utf-8');
    }
    console.log(styleText('cyan', `✨ Reporte exportado en: ${values.output}\n`));
  }

  if (anyFailed) {
    process.exit(1);
  }
}

runMasterAudit().catch(err => {
  console.error(styleText('red', `\n💥 Error fatal en audit_full: ${(err as Error).message}`));
  process.exit(1);
});
