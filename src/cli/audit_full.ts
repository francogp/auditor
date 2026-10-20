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

import { parseArgs, styleText } from 'node:util';
import { enableCompileCache } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

import {
  type StandardAuditResult,
  type SubAuditorReport,
  type AuditFinding,
  type AuditFamily,
  type AuditTaskDefinition,
  type AuditRunMetadata,
  type AuditRunMode,
  type ConsolidatedAuditReport,
  type AuditByFileReport,
  type AuditFileSummary,
  type AuditExecutionSpeed,
  type AuditExecutionPhase,
  resolveFamilyMetadata,
  getActiveFamilies,
  groupResultsByFamily,
  sortFindingsByFileAndLine,
  groupFindingsByFileMap,
  normalizeSpeeds,
  FALLBACK_FAMILY_ORDER
} from '../core/auditContract.ts';
import {
  loadAuditConfig,
  assertAuditConfigComplete,
  buildRatchetConfig,
  sanitizePath,
  type AuditEngineConfig,
  type AuditListFilter,
  type ResolvedRatchetConfig
} from '../core/auditConfig.ts';
import { runWarningRatchet, initWarningBaseline } from './auditRatchet.ts';
import { migrateLegacyAuditConfig } from './migrateAuditConfig.ts';
import {
  COVERAGE_LEDGER_DIR,
  COVERAGE_RUN_ID_ENV,
  COVERAGE_RUN_MODE_ENV,
  COVERAGE_EXPECTED_SUITES_ENV
} from '../core/auditCoverage.ts';
import {
  getVisualWidth,
  renderBanner,
  renderConsolidatedFooter,
  renderMarkdownReport,
  renderFindingsBreakdownTable,
  renderTieredFindingsBreakdownTable,
  type TieredFindingsPhaseGroup,
  renderSampleFindings,
  renderSimilarCodeWarningBanner,
  renderAutoFixNoticeBanner,
  renderAutoFixCompletionBanner,
  renderSetupBlockingBanner,
  renderAuditorsRegistryTable,
  renderAuditorDetailCard,
  renderCliHelp,
  formatDurationMs,
  formatNumber
} from '../core/unifiedTheme.ts';
import {
  REMEDIATION_PHASE_IDS,
  getRemediationPhaseMetadata,
  type RemediationPhaseId
} from '../core/remediationPhases.ts';
import {
  renderRuleGuideCard,
  renderSuiteGuideCards,
  renderFamilyGuideIndex,
  renderGlobalGuideIndex,
  findRuleGuide
} from './guideRenderer.ts';
import { discoverAuditors, type AuditPresetName } from './auditScanner.ts';
import {
  executeAuditorStreaming,
  isNodeInternalWarning,
  TaskStreamCoordinator
} from '../core/streamingRunner.ts';
import { SharedAstContext } from '../core/astContext.ts';
import { BaseAuditor } from '../core/auditorBase.ts';
import { evaluateSuiteStatus } from '../core/suiteGating.ts';
import { AUDITOR_VERSION } from '../core/version.ts';
import { isMainModule, bootstrapCliProject } from './cliUtils.ts';
import { ensureProjectBootstrapped } from '../core/auditBootstrap.ts';
import '../core/permissionGuard.ts';

enableCompileCache();

const CPU_CORE_DIVISOR = 2 as const;
const MIN_CONCURRENCY = 1 as const;
const DECIMAL_RADIX = 10 as const;
const DEFAULT_SUBPROCESS_TIMEOUT_MS = 0 as const;

export interface AuditFullCliOptions {
  values: Record<string, unknown>;
  positionals: string[];
  project?: string;
  targetFamily: string | undefined;
  formattedRules: string;
  targetPreset: AuditPresetName | undefined;
  targetSuites: string[] | undefined;
  speed?: AuditExecutionSpeed;
  onlySpeed?: AuditExecutionSpeed;
  phase?: AuditExecutionPhase;
  concurrencyLimit: number;
  skipSimilar: boolean;
  isEnabledFilter: boolean;
  isDisabledFilter: boolean;
}

export function resolveTargetFamily(
  familyOption: unknown,
  positionals: readonly string[],
  activeFamilies: readonly string[]
): string | undefined {
  const positionalFamily = positionals.find((p) => activeFamilies.includes(p));
  return (familyOption as string | undefined) || positionalFamily;
}

export function resolveFormattedRules(
  values: Record<string, unknown>,
  positionals: readonly string[]
): string {
  const rawRuleArgs: string[] = [];
  if (values.rule) {
    const list = Array.isArray(values.rule) ? values.rule : [values.rule];
    for (const item of list) rawRuleArgs.push(String(item));
  }
  if (values.rules) {
    const list = Array.isArray(values.rules) ? values.rules : [values.rules];
    for (const item of list) rawRuleArgs.push(String(item));
  }
  for (const pos of positionals) {
    if (pos.toLowerCase() === 'dox' || pos.includes(',')) {
      rawRuleArgs.push(pos);
    }
  }
  return rawRuleArgs.join(',');
}

function toOptionString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

export function resolveTargetSuites(values: Record<string, unknown>): string[] | undefined {
  if (values['only-suite']) {
    return toOptionString(values['only-suite'])
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (values['only-task']) {
    return toOptionString(values['only-task'])
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (values.suites) {
    return toOptionString(values.suites)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (values.suite) {
    return toOptionString(values.suite)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (values.tasks) {
    return toOptionString(values.tasks)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof values.task === 'string' && values.task.includes(',')) {
    return values.task
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

export function resolveConcurrencyLimit(concurrencyValue: unknown): number {
  const availableCpus = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
  const defaultConcurrency = Math.max(
    MIN_CONCURRENCY,
    Math.floor(availableCpus / CPU_CORE_DIVISOR)
  );
  if (concurrencyValue) {
    return Math.max(
      MIN_CONCURRENCY,
      Number.parseInt(concurrencyValue as string, DECIMAL_RADIX) || defaultConcurrency
    );
  }
  return defaultConcurrency;
}

export function resolveSkipSimilar(): boolean {
  return (
    process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS === 'true' ||
    process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS === '1' ||
    process.env.AUDIT_SKIP_SIMILAR === 'true' ||
    process.env.AUDIT_SKIP_SIMILAR === '1'
  );
}

export function resolveTargetPreset(
  values: Record<string, unknown>,
  positionals: readonly string[]
): AuditPresetName | undefined {
  if (values.preset) return values.preset as AuditPresetName;
  if (values.critical || positionals.includes('critical')) return 'critical';
  if (values['post-build'] || positionals.includes('post-build') || values.phase === 'post-build')
    return 'post-build';
  if (values.full || positionals.includes('full') || values.speed === 'full') return 'full';
  if (values.speed === 'light' || positionals.includes('lint')) return 'lint';
  if (values.md || positionals.includes('md')) return 'md';
  return undefined;
}

function parseSpeedValue(raw: unknown): AuditExecutionSpeed | undefined {
  if (raw === 'light' || raw === 'heavy' || raw === 'full') return raw;
  return undefined;
}

function parsePhaseValue(raw: unknown): AuditExecutionPhase | undefined {
  if (raw === 'setup' || raw === 'normal' || raw === 'post-run' || raw === 'post-build') return raw;
  return undefined;
}

export function parseAuditFullCliArgs(
  activeFamilies: readonly string[],
  rawArgs: readonly string[] = process.argv.slice(2)
): AuditFullCliOptions {
  const args = [...rawArgs];
  const BOOLEAN_FLAGS = [
    'errors-only',
    'fix',
    'all',
    'post-build',
    'with-build',
    'full',
    'init-baseline',
    'help',
    'list',
    'json',
    'enabled',
    'disabled',
    'critical'
  ];
  const normalized = args.map((a) =>
    a.includes('=') && !a.startsWith('-') ? `--${a}` : BOOLEAN_FLAGS.includes(a) ? `--${a}` : a
  );

  const { values, positionals } = parseArgs({
    args: normalized,
    options: {
      help: { type: 'boolean', short: 'h' },
      project: { type: 'string', short: 'p' },
      list: { type: 'boolean', short: 'l' },
      info: { type: 'string' },
      json: { type: 'boolean' },
      enabled: { type: 'boolean' },
      disabled: { type: 'boolean' },
      critical: { type: 'boolean' },
      family: { type: 'string' },
      task: { type: 'string' },
      tasks: { type: 'string' },
      suites: { type: 'string' },
      suite: { type: 'string' },
      'only-suite': { type: 'string' },
      'only-task': { type: 'string' },
      guide: { type: 'string' },
      preset: { type: 'string' },
      speed: { type: 'string' },
      'only-speed': { type: 'string' },
      phase: { type: 'string' },
      concurrency: { type: 'string' },
      output: { type: 'string', short: 'o' },
      'changed-since': { type: 'string' },
      'errors-only': { type: 'boolean' },
      all: { type: 'boolean', short: 'a' },
      top: { type: 'string', short: 't' },
      rule: { type: 'string', short: 'r', multiple: true },
      rules: { type: 'string', multiple: true },
      fix: { type: 'boolean' },
      'post-build': { type: 'boolean' },
      full: { type: 'boolean' },
      'with-build': { type: 'boolean' },
      'init-baseline': { type: 'boolean' }
    },
    allowPositionals: true,
    strict: false
  });

  const targetPreset = resolveTargetPreset(values, positionals);
  const explicitSpeed =
    parseSpeedValue(values.speed) ??
    (targetPreset === 'full' ? 'full' : targetPreset === 'lint' ? 'light' : undefined);
  const onlySpeed = parseSpeedValue(values['only-speed']);
  const explicitPhase =
    parsePhaseValue(values.phase) ?? (targetPreset === 'post-build' ? 'post-build' : undefined);

  return {
    values,
    positionals,
    project: typeof values.project === 'string' ? values.project : undefined,
    targetFamily: resolveTargetFamily(values.family, positionals, activeFamilies),
    formattedRules: resolveFormattedRules(values, positionals),
    targetPreset,
    targetSuites: resolveTargetSuites(values),
    speed: explicitSpeed,
    onlySpeed,
    phase: explicitPhase,
    concurrencyLimit: resolveConcurrencyLimit(values.concurrency),
    skipSimilar: resolveSkipSimilar(),
    isEnabledFilter: Boolean(
      values.enabled || positionals.includes('enabled') || positionals.includes('list:enabled')
    ),
    isDisabledFilter: Boolean(
      values.disabled || positionals.includes('disabled') || positionals.includes('list:disabled')
    )
  };
}

export function determineRunMode(
  targetPreset?: AuditPresetName,
  targetSuites?: string[],
  taskArg?: unknown,
  targetFamily?: string,
  extraOptions?: {
    speed?: unknown;
    onlySpeed?: unknown;
    phase?: unknown;
    changedOnly?: unknown;
  }
): AuditRunMode {
  if (targetPreset === 'full') return 'full';
  if (targetPreset) return 'preset';
  if (targetSuites && targetSuites.length > 1) return 'suites';
  if (taskArg || (targetSuites && targetSuites.length === 1)) return 'single';
  if (targetFamily) return 'family';
  if (
    extraOptions?.speed === 'light' ||
    Boolean(extraOptions?.onlySpeed) ||
    extraOptions?.phase === 'post-build' ||
    Boolean(extraOptions?.changedOnly)
  ) {
    return 'preset';
  }
  return 'full';
}

export function buildTaskArgs(
  task: AuditTaskDefinition,
  values: Record<string, unknown>,
  formattedRules: string
): string[] {
  const taskArgs = [...task.args];
  if (values['errors-only'] && !taskArgs.includes('--errors-only')) taskArgs.push('--errors-only');
  if (formattedRules && !taskArgs.includes('--rule')) taskArgs.push('--rule', formattedRules);
  if (values.top && !taskArgs.includes('--top')) taskArgs.push('--top', values.top as string);
  if (values.speed && !taskArgs.includes('--speed'))
    taskArgs.push('--speed', toOptionString(values.speed));
  if (values['only-speed'] && !taskArgs.includes('--only-speed'))
    taskArgs.push('--only-speed', toOptionString(values['only-speed']));
  if (
    values['changed-since'] &&
    task.capabilities?.changedOnly &&
    !taskArgs.includes('--changed-since')
  ) {
    taskArgs.push('--changed-since', values['changed-since'] as string);
  }
  if (values.fix && !taskArgs.includes('fix')) taskArgs.push('fix');
  return taskArgs;
}

async function executeTaskInProcess(
  task: AuditTaskDefinition,
  sharedAstContext: SharedAstContext,
  onSubLine?: (line: string) => void
): Promise<{ result: StandardAuditResult; durationMs: number } | null> {
  const taskStart = performance.now();
  try {
    const baseDir = process.env.AUDITOR_HOME_DIR ?? process.cwd();
    const fullScriptPath = path.isAbsolute(task.scriptPath)
      ? task.scriptPath
      : path.resolve(baseDir, task.scriptPath);
    const fileUrl = pathToFileURL(fullScriptPath).href;
    const mod = await import(fileUrl);
    let AuditorClass: (new () => BaseAuditor) | undefined;
    for (const val of Object.values(mod)) {
      if (typeof val === 'function' && val.prototype instanceof BaseAuditor) {
        AuditorClass = val as new () => BaseAuditor;
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
  } catch {
    // catch-ok: Fallback to streaming execution if in-process execution fails
  }
  return null;
}

async function tryReadTaskResult(
  taskJsonPath: string,
  stdout: string,
  durationMs: number
): Promise<StandardAuditResult | null> {
  try {
    const fileContent = await fs.readFile(taskJsonPath, 'utf-8');
    const parsed = JSON.parse(fileContent) as StandardAuditResult;
    if (parsed.durationMs === undefined || parsed.durationMs === 0) {
      parsed.durationMs = durationMs;
    }
    return parsed;
  } catch {
    // catch-ok: fallback to parsing JSON from stdout
  }

  if (stdout) {
    try {
      const raw = stdout.trim();
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const parsed = JSON.parse(raw.substring(firstBrace, lastBrace + 1)) as StandardAuditResult;
        if (parsed.durationMs === undefined || parsed.durationMs === 0) {
          parsed.durationMs = durationMs;
        }
        return parsed;
      }
    } catch {
      // catch-ok: stdout does not contain valid JSON payload
    }
  }

  return null;
}

export function extractSubprocessErrorMessage(
  proc: { status: number | null; stdout: string; stderr: string; timedOut: boolean },
  timeoutMs: number = DEFAULT_SUBPROCESS_TIMEOUT_MS,
  task?: AuditTaskDefinition
): string {
  if (proc.timedOut) {
    if (task) {
      return `Timeout excedido (${timeoutMs}ms) al ejecutar el auditor '${task.name}' (${task.id}).`;
    }
    return `Timeout excedido (${timeoutMs}ms) en la ejecución de la suite.`;
  }
  const cleanStderr = proc.stderr
    .split('\n')
    .filter((l) => !isNodeInternalWarning(l.trim()) && l.trim().length > 0)
    .join('\n')
    .trim();
  const cleanStdout = proc.stdout
    .split('\n')
    .filter((l) => !isNodeInternalWarning(l.trim()) && l.trim().length > 0)
    .join('\n')
    .trim();
  return cleanStderr || cleanStdout || `Código de salida ${proc.status}`;
}

async function parseSubprocessOutput(
  task: AuditTaskDefinition,
  proc: {
    status: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    durationMs: number;
  },
  scratchAuditsDir: string
): Promise<StandardAuditResult> {
  const taskJsonPath = path.join(scratchAuditsDir, task.family, `${task.id}.json`);
  const parsed = await tryReadTaskResult(taskJsonPath, proc.stdout, proc.durationMs);
  if (parsed) {
    return parsed;
  }

  const isSuccess = !proc.timedOut && proc.status === 0;
  const findings: AuditFinding[] = [];

  if (!isSuccess) {
    const errorMsg = extractSubprocessErrorMessage(
      proc,
      task.timeoutMs ?? DEFAULT_SUBPROCESS_TIMEOUT_MS,
      task
    );
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

async function runAuditWorkers(
  tasks: AuditTaskDefinition[],
  concurrency: number,
  taskExecutor: (task: AuditTaskDefinition, index: number) => Promise<StandardAuditResult>
): Promise<StandardAuditResult[]> {
  const results: StandardAuditResult[] = Array.from({ length: tasks.length });
  let nextTaskIndex = 0;

  async function worker(): Promise<void> {
    while (nextTaskIndex < tasks.length) {
      const idx = nextTaskIndex++;
      results[idx] = await taskExecutor(tasks[idx]!, idx);
    }
  }

  const workerCount = Math.min(concurrency, tasks.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return results;
}

export interface MasterReportContext {
  results: StandardAuditResult[];
  tasksToRun: AuditTaskDefinition[];
  allAvailableTasks: AuditTaskDefinition[];
  omittedSuiteIds: string[];
  totalDuration: number;
  config: AuditEngineConfig;
  activeFamilies: readonly AuditFamily[];
  cliOptions: AuditFullCliOptions;
  runMode: AuditRunMode;
  scratchAuditsDir: string;
}

const ERROR_WEIGHT_FACTOR = 1000;

function sortCategoryEntries<T extends { errors: number; warnings: number }>(
  entries: [string, T][]
): [string, T][] {
  return entries.sort((a, b) => {
    return (
      b[1].errors * ERROR_WEIGHT_FACTOR +
      b[1].warnings -
      (a[1].errors * ERROR_WEIGHT_FACTOR + a[1].warnings)
    );
  });
}

export function computeAuditCategoryCounts(
  results: readonly StandardAuditResult[]
): Array<[string, { errors: number; warnings: number; findings: AuditFinding[] }]> {
  const categoryCounts = new Map<
    string,
    { errors: number; warnings: number; findings: AuditFinding[] }
  >();
  for (const suite of results) {
    for (const finding of suite.findings || []) {
      const catKey = finding.ruleDescription ?? finding.ruleId ?? suite.name;
      if (!categoryCounts.has(catKey)) {
        categoryCounts.set(catKey, { errors: 0, warnings: 0, findings: [] });
      }
      const entry = categoryCounts.get(catKey)!;
      if (finding.severity === 'error') entry.errors++;
      else entry.warnings++;
      entry.findings.push(finding);
    }
  }

  return sortCategoryEntries(Array.from(categoryCounts.entries()));
}

export function computeTieredAuditCategoryCounts(
  results: readonly StandardAuditResult[]
): TieredFindingsPhaseGroup[] {
  const phaseMaps = new Map<
    RemediationPhaseId,
    Map<string, { errors: number; warnings: number; findings: AuditFinding[] }>
  >();

  for (const phaseId of REMEDIATION_PHASE_IDS) {
    phaseMaps.set(phaseId, new Map());
  }

  for (const suite of results) {
    for (const finding of suite.findings || []) {
      const phase: RemediationPhaseId = finding.remediationPhase ?? 'hygiene';
      const catMap = phaseMaps.get(phase) ?? phaseMaps.get('hygiene')!;
      const catKey = finding.ruleDescription ?? finding.ruleId ?? suite.name;

      if (!catMap.has(catKey)) {
        catMap.set(catKey, { errors: 0, warnings: 0, findings: [] });
      }
      const entry = catMap.get(catKey)!;
      if (finding.severity === 'error') entry.errors++;
      else entry.warnings++;
      entry.findings.push(finding);
    }
  }

  const groups: TieredFindingsPhaseGroup[] = [];

  for (const phaseId of REMEDIATION_PHASE_IDS) {
    const catMap = phaseMaps.get(phaseId)!;
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

interface FindingsSummaryBlockingContext {
  isSetupBlocking: boolean;
  setupErrors: number;
  postponedAppErrors: number;
  hasLockfileMismatch?: boolean;
  hasEngineMismatch?: boolean;
  hasFixableErrors?: boolean;
}

function printFindingsSummary(
  results: readonly StandardAuditResult[],
  sortedCategories: Array<[string, { errors: number; warnings: number; findings: AuditFinding[] }]>,
  blockingContext?: FindingsSummaryBlockingContext,
  tieredGroups?: readonly TieredFindingsPhaseGroup[]
): void {
  if (sortedCategories.length === 0) {
    console.log(
      '\n' +
        styleText(
          ['bold', 'green'],
          `✨ 100% de las suites aprobadas (${results.length}/${results.length}) sin errores ni advertencias.`
        )
    );
    return;
  }

  if (blockingContext?.isSetupBlocking) {
    console.log(
      '\n' +
        renderSetupBlockingBanner(
          blockingContext.setupErrors,
          blockingContext.postponedAppErrors,
          {
            hasLockfileMismatch: blockingContext.hasLockfileMismatch,
            hasEngineMismatch: blockingContext.hasEngineMismatch,
            hasFixableErrors: blockingContext.hasFixableErrors
          }
        ) +
        '\n'
    );
    console.log(
      styleText(
        'bold',
        '📊 DESGLOSE EXCLUSIVO DE CONFIGURACIÓN Y PROYECTO (FASE 1: SETUP):\n'
      )
    );
    if (tieredGroups && tieredGroups.length > 0) {
      console.log(
        renderTieredFindingsBreakdownTable(
          tieredGroups,
          'TIPO DE INCIDENCIA / REGLA DE SETUP'
        )
      );
    } else {
      console.log(
        renderFindingsBreakdownTable(sortedCategories, 'TIPO DE INCIDENCIA / REGLA DE SETUP')
      );
    }
    const setupErrors = sortedCategories.flatMap(([, data]) =>
      data.findings.filter((f) => f.severity === 'error')
    );
    if (setupErrors.length > 0) {
      console.log(renderSampleFindings(setupErrors, 5));
    }
    console.log(
      styleText(
        ['yellow', 'bold'],
        `\n⚠️  ATENCIÓN: Se postergó el reporte de ${formatNumber(blockingContext.postponedAppErrors)} error(es) de aplicación para evitar falsos positivos inducidos.`
      )
    );
    console.log(
      styleText(
        'dim',
        `   Resuelve primero los ${blockingContext.setupErrors} error(es) de configuración (ej. 'npm run auditor:fix') para desbloquear el análisis del resto del proyecto.\n`
      )
    );
  } else {
    console.log(
      '\n' +
        styleText(
          'bold',
          '📊 DESGLOSE POR TIPO DE ERROR Y ADVERTENCIA (ORDEN ESTRATÉGICO DE RESOLUCIÓN):\n'
        )
    );
    if (tieredGroups && tieredGroups.length > 0) {
      console.log(renderTieredFindingsBreakdownTable(tieredGroups, 'TIPO DE INCIDENCIA / REGLA'));
    } else {
      console.log(renderFindingsBreakdownTable(sortedCategories, 'TIPO DE INCIDENCIA / REGLA'));
    }
    const allErrors = results.flatMap((suite) =>
      (suite.findings || []).filter((f) => f.severity === 'error')
    );
    if (allErrors.length > 0) {
      console.log(renderSampleFindings(allErrors, 5));
    }
  }
}

function buildConsolidatedReport(params: {
  ctx: MasterReportContext;
  totalErrors: number;
  totalWarnings: number;
  suitesPassed: number;
  anyFailed: boolean;
  isFullAudit: boolean;
  byFamily: Map<AuditFamily, StandardAuditResult[]>;
  ratchet: AuditRunMetadata['ratchet'];
  fixableErrors?: number;
  fixableWarnings?: number;
  autoFixRecommended?: boolean;
  setupBlocking?: boolean;
  setupErrors?: number;
  postponedAppErrors?: number;
}): {
  meta: AuditRunMetadata;
  consolidatedReport: ConsolidatedAuditReport;
  fileSummaryMap: Record<string, AuditFileSummary>;
} {
  const {
    ctx,
    totalErrors,
    totalWarnings,
    suitesPassed,
    anyFailed,
    isFullAudit,
    byFamily,
    ratchet,
    setupBlocking,
    setupErrors,
    postponedAppErrors
  } = params;
  const meta: AuditRunMetadata = {
    version: AUDITOR_VERSION,
    timestamp: Temporal.Now.instant().toString(),
    isFullAudit,
    runMode: ctx.runMode,
    preset: ctx.cliOptions.targetPreset ?? null,
    targetFamily: (ctx.cliOptions.targetFamily as string) ?? null,
    totalDiscoveredSuites: ctx.allAvailableTasks.length,
    executedSuiteCount: ctx.tasksToRun.length,
    executedSuites: ctx.tasksToRun.map((t) => t.id),
    omittedSuites: ctx.omittedSuiteIds,
    skipSimilar: ctx.cliOptions.skipSimilar || undefined,
    setupBlocking: setupBlocking || undefined,
    setupErrors: setupBlocking ? setupErrors : undefined,
    postponedAppErrors: setupBlocking ? postponedAppErrors : undefined,
    ratchet,
    environment: { nodeVersion: process.version, platform: process.platform, cwd: process.cwd() }
  };

  const rawFindings = ctx.results.flatMap((r) => r.findings);
  const sortedFindings = sortFindingsByFileAndLine(rawFindings);
  const fileSummaryMap = groupFindingsByFileMap(sortedFindings);
  const findingsByFile: Record<string, AuditFinding[]> = {};
  for (const [file, summary] of Object.entries(fileSummaryMap)) {
    findingsByFile[file] = summary.findings;
  }

  const consolidatedReport: ConsolidatedAuditReport = {
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
      ...(params.autoFixRecommended !== undefined && {
        autoFixRecommended: params.autoFixRecommended
      }),
      ...(params.autoFixRecommended && { autoFixCommand: 'npm run auditor:fix' })
    },
    families: Object.fromEntries(
      ctx.activeFamilies.map((f) => [
        f,
        {
          title: resolveFamilyMetadata(f, ctx.config.customFamilies).title,
          suites: byFamily.get(f) ?? []
        }
      ])
    ) as Record<AuditFamily, { title: string; suites: StandardAuditResult[] }>,
    allFindings: sortedFindings,
    findingsByFile,
    remediationPhases: (() => {
      const summary: ConsolidatedAuditReport['remediationPhases'] = {};
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
        const phaseId = f.remediationPhase ?? 'hygiene';
        const entry = summary[phaseId] ?? summary['hygiene']!;
        if (f.severity === 'error') entry.errors++;
        else entry.warnings++;
        entry.violations++;
      }
      return summary;
    })()
  };

  return { meta, consolidatedReport, fileSummaryMap };
}

async function exportCustomOutputReport(
  cliOptions: AuditFullCliOptions,
  consolidatedReport: ConsolidatedAuditReport,
  results: readonly StandardAuditResult[],
  suitesPassed: number,
  totalDuration: number
): Promise<void> {
  if (!cliOptions.values.output) return;
  const outputPath = path.resolve(process.cwd(), cliOptions.values.output as string);
  if (outputPath.endsWith('.json')) {
    await fs.writeFile(outputPath, JSON.stringify(consolidatedReport, null, 2), 'utf-8');
  } else if (outputPath.endsWith('.md')) {
    const md = renderMarkdownReport(results as StandardAuditResult[], suitesPassed, totalDuration);
    await fs.writeFile(outputPath, md, 'utf-8');
  } else {
    const lines = results.map(
      (r) =>
        `[${r.status.toUpperCase()}] ${r.name} (${r.durationMs}ms) - Errors: ${r.summary.errors}, Warnings: ${r.summary.warnings}`
    );
    await fs.writeFile(outputPath, lines.join('\n'), 'utf-8');
  }
  console.log(styleText('cyan', `✨ Reporte exportado en: ${outputPath}\n`));
}

type RatchetVerdict = NonNullable<AuditRunMetadata['ratchet']>;

/** Ratchet applies only to the canonical full run: every default suite, no filters, no build/fix mode. */
export function isRatchetScope(cliOptions: AuditFullCliOptions, isFullAudit: boolean): boolean {
  const v = cliOptions.values;
  return (
    isFullAudit &&
    !cliOptions.formattedRules &&
    !v['errors-only'] &&
    !v.top &&
    !v['changed-since'] &&
    !v['with-build'] &&
    !v.all
  );
}

function printRatchetVerdict(
  verdict: RatchetVerdict,
  newWarnings: readonly AuditFinding[],
  baselineFile: string
): void {
  if (verdict.status === 'initialized') {
    console.log(
      styleText(
        ['bold', 'green'],
        `\n🔒 Línea base de warnings creada (${verdict.resolvedWarnings} warnings) en ${baselineFile}.`
      )
    );
    console.log(
      styleText(
        'dim',
        `   Commiteala y publícala en '${verdict.productionRef}' para activar el ratchet.\n`
      )
    );
    return;
  }
  if (verdict.error) {
    console.log(
      styleText(['bold', 'red'], `\n🔒 RATCHET DE WARNINGS BLOQUEADO: ${verdict.error}\n`)
    );
    return;
  }
  if (verdict.newWarnings > 0) {
    console.log(
      styleText(
        ['bold', 'red'],
        `\n🔒 RATCHET DE WARNINGS: ${verdict.newWarnings} warning(s) NUEVO(S) respecto de '${verdict.productionRef}'. Deben corregirse.`
      )
    );
    console.log(renderSampleFindings(newWarnings, 5));
    return;
  }
  const shrinkNote = verdict.baselineUpdated
    ? ` Línea base reducida (${verdict.resolvedWarnings} resueltos): commitea ${baselineFile}.`
    : '';
  console.log(
    styleText(
      'green',
      `\n🔒 Ratchet de warnings OK: 0 nuevos respecto de '${verdict.productionRef}'.${shrinkNote}\n`
    )
  );
}

interface RatchetBaseFields {
  productionRef: string;
  newWarnings: number;
  resolvedWarnings: number;
  baselineUpdated: boolean;
}

function handleInitBaseline(
  ratchet: ResolvedRatchetConfig,
  ctx: MasterReportContext,
  canWriteBaseline: boolean,
  base: RatchetBaseFields
): { verdict: RatchetVerdict; newWarnings: readonly AuditFinding[] } {
  if (!canWriteBaseline || ctx.cliOptions.skipSimilar) {
    throw new Error('--init-baseline requires 0 errors and similar-code analysis enabled.');
  }
  const count = initWarningBaseline(process.cwd(), ratchet, ctx.results);
  return {
    verdict: { ...base, status: 'initialized', resolvedWarnings: count, baselineUpdated: true },
    newWarnings: []
  };
}

function handleStandardRatchet(
  ratchet: ResolvedRatchetConfig,
  ctx: MasterReportContext,
  canWriteBaseline: boolean,
  base: RatchetBaseFields
): { verdict: RatchetVerdict; newWarnings: readonly AuditFinding[] } {
  const outcome = runWarningRatchet(process.cwd(), ratchet, ctx.results, canWriteBaseline);
  if (outcome.source === 'local-bootstrap') {
    console.log(
      styleText(
        'yellow',
        `\n⚠️  '${ratchet.productionRef}' aún no contiene ${ratchet.baselineFile}: se usa la copia local (bootstrap). Publícala para blindar el ratchet.`
      )
    );
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

function applyWarningRatchet(
  ctx: MasterReportContext,
  isFullAudit: boolean,
  totalErrors: number
): RatchetVerdict | undefined {
  const ratchet = buildRatchetConfig(ctx.config.ratchet);
  const initRequested = Boolean(ctx.cliOptions.values['init-baseline']);
  const inScope = isRatchetScope(ctx.cliOptions, isFullAudit);
  if (initRequested && (!ratchet.enabled || !inScope)) {
    throw new Error(
      '[Ratchet] --init-baseline requires ratchet.enabled and a full default run (no preset, family, task, rule, changed-since, build or fix filters).'
    );
  }
  if (!ratchet.enabled) {
    if (inScope)
      console.log(
        styleText(
          'yellow',
          `\n⚠️  Ratchet de warnings DESACTIVADO (ratchet.enabled: false en .auditor/audit.config.ts).\n`
        )
      );
    return undefined;
  }
  if (!inScope) return undefined;

  const canWriteBaseline = totalErrors === 0;
  const base: RatchetBaseFields = {
    productionRef: ratchet.productionRef,
    newWarnings: 0,
    resolvedWarnings: 0,
    baselineUpdated: false
  };
  let verdict: RatchetVerdict;
  let newWarnings: readonly AuditFinding[] = [];
  try {
    const executed = initRequested
      ? handleInitBaseline(ratchet, ctx, canWriteBaseline, base)
      : handleStandardRatchet(ratchet, ctx, canWriteBaseline, base);
    verdict = executed.verdict;
    newWarnings = executed.newWarnings;
  } catch (err: unknown) {
    // catch-ok: converted into a blocking ratchet failure that is persisted in latest_audit.json and fails the run.
    verdict = {
      ...base,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err)
    };
  }
  printRatchetVerdict(verdict, newWarnings, ratchet.baselineFile);
  return verdict;
}

export interface FixableCountsResult {
  fixableErrors: number;
  fixableWarnings: number;
  autoFixRecommended: boolean;
}

/**
 * Computes strictly fixable errors and warnings according to the Zero False-Fix Mandate.
 * A finding is fixable IF AND ONLY IF finding.fixable === true.
 * In fix mode (isFixMode === true), any remaining error could not be resolved,
 * so fixableErrors and autoFixRecommended are always 0/false.
 */
// wrapper-ok: facade delegator exported for orchestrator consumers
export function computeFixableViolations(
  results: readonly StandardAuditResult[],
  isFixMode: boolean
): FixableCountsResult {
  return BaseAuditor.computeFixableViolations(results, isFixMode);
}

interface PersistAuditReportsParams {
  readonly scratchAuditsDir: string;
  readonly isFixMode: boolean;
  readonly meta: AuditRunMetadata;
  readonly consolidatedReport: ConsolidatedAuditReport;
  readonly fileSummaryMap: Record<string, AuditFileSummary>;
  readonly results: readonly StandardAuditResult[];
}

async function persistAuditReportsToDisk(params: PersistAuditReportsParams): Promise<string> {
  const prefix = params.isFixMode ? 'latest_fix_' : 'latest_';
  const byFilePrefix = params.isFixMode ? 'by_file_fix.json' : 'by_file.json';
  const latestAuditPath = path.join(params.scratchAuditsDir, `${prefix}audit.json`);
  const latestSummaryPath = path.join(params.scratchAuditsDir, `${prefix}summary.json`);
  const latestByFilePath = path.join(params.scratchAuditsDir, byFilePrefix);

  await fs.writeFile(latestAuditPath, JSON.stringify(params.consolidatedReport, null, 2), 'utf-8');
  await fs.writeFile(
    latestSummaryPath,
    JSON.stringify(
      {
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
      },
      null,
      2
    ),
    'utf-8'
  );
  const byFileReport: AuditByFileReport = {
    meta: params.meta,
    status: params.consolidatedReport.status,
    summary: params.consolidatedReport.summary,
    totalAffectedFiles: Object.keys(params.fileSummaryMap).length,
    files: params.fileSummaryMap
  };
  await fs.writeFile(latestByFilePath, JSON.stringify(byFileReport, null, 2), 'utf-8');

  return latestAuditPath;
}

export async function renderAndPersistMasterReport(ctx: MasterReportContext): Promise<boolean> {
  const {
    results,
    tasksToRun,
    allAvailableTasks,
    omittedSuiteIds,
    totalDuration,
    activeFamilies,
    cliOptions,
    scratchAuditsDir
  } = ctx;
  const totalErrors = results.reduce((acc, r) => acc + (r.summary?.errors ?? 0), 0);
  const totalWarnings = results.reduce((acc, r) => acc + (r.summary?.warnings ?? 0), 0);
  const suitesPassed = results.filter(
    (r) => r.status === 'passed' && (r.summary?.errors ?? 0) === 0
  ).length;
  const suitesSkipped = results.filter((r) => r.status === 'skipped').length;
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
      ratchet: undefined,
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

    console.log('\n' + renderAutoFixCompletionBanner(totalDuration) + '\n');

    await exportCustomOutputReport(
      cliOptions,
      consolidatedReport,
      results,
      suitesPassed,
      totalDuration
    );

    return false;
  }
  const isBuildMode =
    cliOptions.phase === 'post-build' ||
    cliOptions.targetPreset === 'post-build' ||
    Boolean(cliOptions.values['post-build']);
  const isFullAudit =
    !isBuildMode &&
    !isFixMode &&
    !cliOptions.onlySpeed &&
    (cliOptions.speed === undefined ||
      cliOptions.speed === 'heavy' ||
      cliOptions.speed === 'full') &&
    tasksToRun.length === allAvailableTasks.length &&
    omittedSuiteIds.length === 0;

  const byFamily = groupResultsByFamily(results, activeFamilies);

  const setupTaskIds = new Set(
    allAvailableTasks.filter((t) => t.capabilities?.phase === 'setup').map((t) => t.id)
  );

  const setupResults = results.filter((r) => setupTaskIds.has(r.id));
  const setupErrors = setupResults.reduce((acc, r) => acc + (r.summary?.errors ?? 0), 0);
  const isSetupBlocking = setupErrors > 0;

  const nonSetupResults = results.filter((r) => !setupTaskIds.has(r.id));
  const postponedAppErrors = nonSetupResults.reduce((acc, r) => acc + (r.summary?.errors ?? 0), 0);

  const displayResults = isSetupBlocking ? setupResults : results;
  const sortedCategories = computeAuditCategoryCounts(displayResults);
  const tieredGroups = computeTieredAuditCategoryCounts(displayResults);

  const setupFindings = setupResults.flatMap((r) => r.findings ?? []);
  const hasLockfileMismatch = setupFindings.some(
    (f) =>
      f.ruleId === 'package-lockfile-integrity' ||
      f.ruleId === 'dependency-below-minimum-installed' ||
      f.ruleId === 'dependency-exceeds-maximum-installed'
  );
  const hasEngineMismatch = setupFindings.some(
    (f) =>
      f.ruleId === 'environment-runtime-mismatch' ||
      f.ruleId === 'environment-engines-below-floor'
  );
  const hasFixableErrors = setupFindings.some((f) => f.fixable && f.severity === 'error');

  printFindingsSummary(
    results,
    sortedCategories,
    {
      isSetupBlocking,
      setupErrors,
      postponedAppErrors,
      hasLockfileMismatch,
      hasEngineMismatch,
      hasFixableErrors
    },
    tieredGroups
  );
  console.log(
    renderConsolidatedFooter(
      results.length,
      suitesPassed,
      totalErrors,
      totalWarnings,
      totalDuration,
      undefined,
      suitesSkipped
    )
  );

  const hasSimilarCodeSetupFailure = results.some((r) =>
    r.findings?.some(
      (f) =>
        f.ruleId === 'fallow-similar-code-failed' &&
        (f.context === 'manual-setup-required' || f.context === 'model-not-ready')
    )
  );

  if (hasSimilarCodeSetupFailure) {
    console.log('\n' + renderSimilarCodeWarningBanner() + '\n');
  }

  const ratchet = applyWarningRatchet(ctx, isFullAudit, totalErrors);
  const anyFailed =
    totalErrors > 0 ||
    suitesPassed + suitesSkipped < results.length ||
    ratchet?.status === 'failed';

  const { fixableErrors, fixableWarnings, autoFixRecommended } = computeFixableViolations(
    results,
    isFixMode
  );

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
    autoFixRecommended,
    setupBlocking: isSetupBlocking,
    setupErrors: isSetupBlocking ? setupErrors : undefined,
    postponedAppErrors: isSetupBlocking ? postponedAppErrors : undefined
  });

  const latestAuditPath = await persistAuditReportsToDisk({
    scratchAuditsDir,
    isFixMode: false,
    meta,
    consolidatedReport,
    fileSummaryMap,
    results
  });

  if (!isFullAudit && !isBuildMode) {
    console.log(styleText('yellow', `⚠️  ADVERTENCIA DE AUDITORÍA PARCIAL:`));
    console.log(
      styleText(
        'yellow',
        `   latest_audit.json se actualizó con meta.isFullAudit = false (${tasksToRun.length}/${allAvailableTasks.length} suites).`
      )
    );
    console.log(
      styleText(
        'dim',
        `   Los inspectores de calidad exigirán una corrida completa ('npm run auditor').\n`
      )
    );
  }

  console.log(styleText('dim', `💾 Reporte detallado para IA / herramientas disponible en:`));
  console.log(styleText('cyan', `   📄 ${path.relative(process.cwd(), latestAuditPath)}\n`));

  if (anyFailed) {
    console.log(
      styleText(
        'yellow',
        '💡 ¿Dudas sobre una regla o comando? No inspecciones node_modules ni el código fuente. Consulta:'
      )
    );
    console.log(
      styleText('dim', '   📖 Guía y solución canónica:  ') +
        styleText('cyan', 'npm run auditor:guide -- <regla>')
    );
    console.log(
      styleText('dim', '   ❓ Catálogo de ayuda global:  ') + styleText('cyan', 'npm run auditor:help')
    );
    console.log(
      styleText('dim', '   🔧 Ayuda de refactorizadores: ') +
        styleText('cyan', 'npm run auditor:types help | auditor:domain help | auditor:motion help\n')
    );
  }

  await exportCustomOutputReport(
    cliOptions,
    consolidatedReport,
    results,
    suitesPassed,
    totalDuration
  );

  return anyFailed;
}

function findTaskByUidOrName(
  allTasks: readonly AuditTaskDefinition[],
  targetUid: string
): AuditTaskDefinition | undefined {
  const matchById = allTasks.find((t) => t.id === targetUid);
  if (matchById) {
    return matchById;
  }
  const targetQuery = targetUid.toLowerCase().trim(); // domain-ok: Open dynamic text or non-domain string payload
  const normalizedQuery = targetQuery.replace(/-/g, '_');

  const matchByName = allTasks.find((t) => t.name.toLowerCase() === targetQuery);
  if (matchByName) return matchByName;

  const matchByNormalizedId = allTasks.find(
    (t) => t.id.toLowerCase().replace(/-/g, '_') === normalizedQuery
  );
  if (matchByNormalizedId) return matchByNormalizedId;

  const matchWithoutPrefix = allTasks.find((t) => {
    const idWithoutValidate = t.id.toLowerCase().replace(/^validate_/, '');
    return idWithoutValidate === normalizedQuery || idWithoutValidate.replace(/_/g, '-') === targetQuery;
  });
  if (matchWithoutPrefix) return matchWithoutPrefix;

  return undefined;
}

function handleHelpCommand(
  cliOptions: ReturnType<typeof parseAuditFullCliArgs>,
  allAvailableTasks: readonly AuditTaskDefinition[],
  activeFamilies: readonly AuditFamily[]
): void {
  const requestedUid =
    typeof cliOptions.values.info === 'string'
      ? cliOptions.values.info
      : cliOptions.positionals.find((p) => p !== 'help' && !activeFamilies.includes(p));

  if (requestedUid) {
    const task = findTaskByUidOrName(allAvailableTasks, requestedUid);
    if (!task) {
      console.error(
        styleText(
          'red',
          `\n❌ Suite no encontrada: '${requestedUid}'. Ejecuta 'auditor --list' para ver todas las disponibles.\n`
        )
      );
      process.exit(1);
    }
    console.log(renderAuditorDetailCard(task));
    process.exit(0);
  }

  console.log(renderCliHelp(activeFamilies));
  process.exit(0);
}

function handleListJsonOutput(
  filtered: readonly { task: AuditTaskDefinition; enabled: boolean; disabledReason?: string }[]
): void {
  const manifests = filtered.map(({ task: t, enabled, disabledReason }) => ({
    id: t.id,
    name: t.name,
    family: t.family,
    icon: t.icon ?? '🏛️',
    description: t.description ?? t.name,
    enabled,
    ...(disabledReason ? { disabledReason } : {}),
    capabilities: {
      speed: t.capabilities?.speed ?? 'light',
      phase: t.capabilities?.phase ?? 'normal',
      fix: t.capabilities?.fix ?? 'none',
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

function handleListCommand(
  cliOptions: ReturnType<typeof parseAuditFullCliArgs>,
  allAvailableTasks: readonly AuditTaskDefinition[],
  activeFamilies: readonly AuditFamily[],
  config: AuditEngineConfig
): void {
  const evaluated = allAvailableTasks.map((t) => {
    const status = evaluateSuiteStatus(t.id, config, t.configKey);
    return { task: t, enabled: status.enabled, disabledReason: status.reason };
  });

  let filtered = evaluated;
  let listFilter: AuditListFilter = 'all';

  if (cliOptions.isEnabledFilter) {
    filtered = evaluated.filter((item) => item.enabled);
    listFilter = 'enabled';
  } else if (cliOptions.isDisabledFilter) {
    filtered = evaluated.filter((item) => !item.enabled);
    listFilter = 'disabled';
  }

  if (cliOptions.values.json) {
    handleListJsonOutput(filtered);
  }

  const disabledMap = new Map<string, string>();
  for (const item of evaluated) {
    if (!item.enabled && item.disabledReason) {
      disabledMap.set(item.task.id, item.disabledReason);
    }
  }

  console.log(
    renderAuditorsRegistryTable(
      filtered.map((item) => item.task),
      activeFamilies,
      { filter: listFilter, disabledReasons: disabledMap }
    )
  );
  process.exit(0);
}

function handleInfoCommand(
  targetUid: string,
  allAvailableTasks: readonly AuditTaskDefinition[]
): void {
  const task = findTaskByUidOrName(allAvailableTasks, targetUid);
  if (!task) {
    console.error(
      styleText(
        'red',
        `\n❌ Suite no encontrada: '${targetUid}'. Ejecuta 'auditor --list' para ver todas las disponibles.\n`
      )
    );
    process.exit(1);
  }
  console.log(renderAuditorDetailCard(task));
  process.exit(0);
}

function handleGuideCommand(
  cliOptions: ReturnType<typeof parseAuditFullCliArgs>,
  allAvailableTasks: readonly AuditTaskDefinition[],
  activeFamilies: readonly AuditFamily[]
): void {
  let target: string | undefined =
    typeof cliOptions.values.guide === 'string' && cliOptions.values.guide.trim() !== ''
      ? cliOptions.values.guide.trim()
      : undefined;

  if (!target) {
    const guideIdx = cliOptions.positionals.indexOf('guide');
    if (guideIdx !== -1 && cliOptions.positionals.length > guideIdx + 1) {
      target = cliOptions.positionals[guideIdx + 1]?.trim();
    }
  }

  const suiteParam =
    typeof cliOptions.values.suite === 'string'
      ? cliOptions.values.suite.trim()
      : typeof cliOptions.values.task === 'string'
        ? cliOptions.values.task.trim()
        : undefined;

  if (suiteParam) {
    const task = findTaskByUidOrName(allAvailableTasks, suiteParam);
    if (!task) {
      console.error(
        styleText(
          'red',
          `\n❌ Suite no encontrada: '${suiteParam}'. Ejecuta 'auditor --list' para ver las suites disponibles.\n`
        )
      );
      process.exit(1);
    }
    console.log(renderSuiteGuideCards(task));
    process.exit(0);
  }

  if (cliOptions.values.family && typeof cliOptions.values.family === 'string') {
    const fam = cliOptions.values.family.trim();
    const tasksInFam = allAvailableTasks.filter((t) => t.family === fam);
    if (tasksInFam.length === 0) {
      console.error(
        styleText(
          'red',
          `\n❌ Familia no encontrada o sin suites: '${fam}'. Familias válidas: ${activeFamilies.join(', ')}\n`
        )
      );
      process.exit(1);
    }
    console.log(renderFamilyGuideIndex(fam, tasksInFam));
    process.exit(0);
  }

  if (!target) {
    console.log(renderGlobalGuideIndex(allAvailableTasks));
    process.exit(0);
  }

  if (activeFamilies.includes(target as AuditFamily)) {
    const tasksInFam = allAvailableTasks.filter((t) => t.family === target);
    console.log(renderFamilyGuideIndex(target, tasksInFam));
    process.exit(0);
  }

  const ruleMatch = findRuleGuide(allAvailableTasks, target);
  if (ruleMatch) {
    console.log(renderRuleGuideCard(ruleMatch));
    process.exit(0);
  }

  const taskMatch = findTaskByUidOrName(allAvailableTasks, target);
  if (taskMatch) {
    console.log(renderSuiteGuideCards(taskMatch));
    process.exit(0);
  }

  const allRuleIds = allAvailableTasks.flatMap((t) =>
    Object.keys(t.ruleDescriptions ?? t.manifest?.rules ?? {})
  );
  const allSuiteIds = allAvailableTasks.map((t) => t.id);
  const candidates = [...allRuleIds, ...allSuiteIds];
  const queryLower = target.toLowerCase();
  const suggestions = candidates
    .filter((c) => c.toLowerCase().includes(queryLower) || queryLower.includes(c.toLowerCase()))
    .slice(0, 5);

  console.error(
    styleText(
      'red',
      `\n❌ No se encontró ninguna regla, suite ni familia con el identificador '${target}'.`
    )
  );
  if (suggestions.length > 0) {
    console.error(
      styleText('yellow', `\n💡 Quizás quisiste decir:\n`) +
        suggestions.map((s) => `   - ${s}`).join('\n') +
        '\n'
    );
  }
  console.error(
    styleText('dim', `   Ejecuta 'auditor guide' para ver el catálogo global de reglas disponibles.\n`)
  );
  process.exit(1);
}

function handleIntrospectionCommands(
  cliOptions: ReturnType<typeof parseAuditFullCliArgs>,
  allAvailableTasks: readonly AuditTaskDefinition[],
  activeFamilies: readonly AuditFamily[],
  config: AuditEngineConfig
): boolean {
  if (cliOptions.values.help || cliOptions.positionals.includes('help')) {
    handleHelpCommand(cliOptions, allAvailableTasks, activeFamilies);
  }

  const isGuideCommand = Boolean(
    cliOptions.values.guide !== undefined || cliOptions.positionals.includes('guide')
  );

  if (isGuideCommand) {
    handleGuideCommand(cliOptions, allAvailableTasks, activeFamilies);
  }

  const isListCommand = Boolean(
    cliOptions.values.list ||
    cliOptions.positionals.includes('list') ||
    cliOptions.positionals.includes('list:enabled') ||
    cliOptions.positionals.includes('list:disabled') ||
    cliOptions.isEnabledFilter ||
    cliOptions.isDisabledFilter
  );

  if (isListCommand) {
    handleListCommand(cliOptions, allAvailableTasks, activeFamilies, config);
  }

  const targetUid =
    typeof cliOptions.values.info === 'string'
      ? cliOptions.values.info
      : cliOptions.positionals.includes('info')
        ? cliOptions.positionals.find((p) => p !== 'info' && !activeFamilies.includes(p))
        : undefined;

  if (targetUid) {
    handleInfoCommand(targetUid, allAvailableTasks);
  }

  return false;
}

// boolean-trap-ok: CLI master banner formatting params
export function createAuditBannerDetails(
  cliOptions: AuditFullCliOptions,
  isFixMode: boolean,
  isBuildMode: boolean,
  tasksCount: number,
  allAvailableCount: number,
  omittedCount: number
): string[] {
  const subtitleDetails: string[] = [
    `v${AUDITOR_VERSION}`,
    isFixMode
      ? `Suites con Auto-Reparación: ${tasksCount} suites`
      : `Auto-descubiertas: ${tasksCount}/${allAvailableCount} suites`
  ];
  if (isFixMode) {
    subtitleDetails.push('Modo: AUTO-FIX 🛠️');
  } else if (isBuildMode) {
    subtitleDetails.push('Modo: POST-BUILD 🏗️');
  } else {
    if (cliOptions.onlySpeed)
      subtitleDetails.push(`Only-Speed: ${cliOptions.onlySpeed.toUpperCase()}`);
    else if (cliOptions.speed) subtitleDetails.push(`Speed: ${cliOptions.speed.toUpperCase()}`);
    else if (cliOptions.targetPreset)
      subtitleDetails.push(`Preset: ${cliOptions.targetPreset.toUpperCase()}`);
    if (cliOptions.values.family)
      subtitleDetails.push(`Familia: ${toOptionString(cliOptions.values.family).toUpperCase()}`);
    if (cliOptions.skipSimilar) subtitleDetails.push('Similar-Code: OMITIDO ⏭️');
    if (tasksCount !== allAvailableCount || omittedCount > 0)
      subtitleDetails.push('Modo: PARCIAL ⚠️');
  }

  if (cliOptions.project) {
    subtitleDetails.push(`🎯 Remoto: ${path.basename(path.resolve(cliOptions.project))}`);
  } else if (process.env.AUDITOR_HOME_DIR && process.env.AUDIT_PROJECT_ROOT) {
    const cleanHome = sanitizePath(process.env.AUDITOR_HOME_DIR);
    const cleanProject = sanitizePath(process.env.AUDIT_PROJECT_ROOT);
    if (path.resolve(cleanHome) !== path.resolve(cleanProject)) {
      subtitleDetails.push(`🎯 Remoto: ${path.basename(cleanProject)}`);
    }
  }

  return subtitleDetails;
}

export const MAX_BANNER_SUBTITLE_WIDTH = 72;

export function formatSubtitleDetails(
  details: readonly string[],
  maxLineWidth: number = MAX_BANNER_SUBTITLE_WIDTH
): string {
  if (details.length === 0) return '';
  const lines: string[] = [];
  let currentLine = '';

  for (const item of details) {
    const candidate = currentLine ? `${currentLine}  |  ${item}` : item;
    if (getVisualWidth(candidate) <= maxLineWidth) {
      currentLine = candidate;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = item;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.join('\n');
}

interface TaskExecutionContext {
  readonly cliOptions: ReturnType<typeof parseAuditFullCliArgs>;
  readonly sharedAstContext?: SharedAstContext;
  readonly scratchAuditsDir: string;
  readonly coordinator: TaskStreamCoordinator;
}

interface ExecutedTaskData {
  result: StandardAuditResult;
  durationMs: number;
}

async function runTaskExecution(
  task: AuditTaskDefinition,
  ctx: TaskExecutionContext,
  subLines: string[]
): Promise<ExecutedTaskData> {
  const taskArgs = buildTaskArgs(task, ctx.cliOptions.values, ctx.cliOptions.formattedRules);
  if (task.requiresAst && ctx.sharedAstContext) {
    const inProcess = await executeTaskInProcess(task, ctx.sharedAstContext, (line) =>
      subLines.push(line)
    );
    if (inProcess) {
      return { result: inProcess.result, durationMs: inProcess.durationMs };
    }
  }

  const taskJsonPath = path.join(ctx.scratchAuditsDir, task.family, `${task.id}.json`);
  try {
    await fs.rm(taskJsonPath, { force: true });
  } catch {
    // catch-ok: ignore if stale task json does not exist
  }

  const proc = await executeAuditorStreaming(task, taskArgs, (subLine) => subLines.push(subLine));
  const parsed = await parseSubprocessOutput(task, proc, ctx.scratchAuditsDir);
  const suiteDuration =
    parsed.durationMs !== undefined && parsed.durationMs > 0 ? parsed.durationMs : proc.durationMs;
  return { result: parsed, durationMs: suiteDuration };
}

function ensureTaskSummary(result: StandardAuditResult): void {
  if (result.summary) return;
  const errCount =
    result.findings?.filter((f) => f.severity === 'error').length ??
    (result.status === 'failed' ? 1 : 0);
  const warnCount = result.findings?.filter((f) => f.severity === 'warning').length ?? 0;
  result.summary = { errors: errCount, warnings: warnCount, info: 0 };
}

function resolveSpeedEmoji(speed?: string): string {
  if (speed === 'light') return ' 🐇';
  if (speed === 'heavy') return ' 🐢';
  if (speed === 'full') return ' 🐘';
  return '';
}

function buildSubAuditorLine(s: SubAuditorReport, index: number, total: number): string {
  const badge = s.count > 0 ? ` [🐛 ${formatNumber(s.count)}]` : '';
  const speedEmoji = resolveSpeedEmoji(s.speed);
  const durationBadge =
    s.durationMs !== undefined && s.durationMs >= 0 ? ` (${formatDurationMs(s.durationMs)})` : '';
  return `🔍 [${index + 1}/${total}] ${s.name}${badge}${speedEmoji}${durationBadge}`;
}

function populateSubAuditorSubLines(result: StandardAuditResult, subLines: string[]): void {
  if (subLines.length > 0 || !result.subAuditors || result.subAuditors.length === 0) return;
  const total = result.subAuditors.length;
  for (let i = 0; i < total; i++) {
    subLines.push(buildSubAuditorLine(result.subAuditors[i]!, i, total));
  }
}

function normalizeTaskSummaryAndSubLines(result: StandardAuditResult, subLines: string[]): boolean {
  ensureTaskSummary(result);

  const isSkipped = result.status === 'skipped' || result.metrics?.['Estado'] === 'OMITIDO ⏭️';
  if (isSkipped) {
    result.status = 'skipped';
    subLines.length = 0;
    const reason = (result.metrics?.['Skip-Reason'] as string) || 'Análisis omitido';
    subLines.push(`⏭️  ${reason}`);
    return true;
  }

  populateSubAuditorSubLines(result, subLines);
  return false;
}

async function executeSingleAuditTask(
  task: AuditTaskDefinition,
  ctx: TaskExecutionContext,
  taskIndex?: number
): Promise<StandardAuditResult> {
  const subLines: string[] = [];
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
    taskIndex,
    subAuditors: result.subAuditors
  });
  return result;
}

async function checkEarlyCliCommands(): Promise<void> {
  if (
    process.argv.includes('-v') ||
    process.argv.includes('--version') ||
    process.argv.includes('version')
  ) {
    console.log(`@francogp/auditor v${AUDITOR_VERSION}`);
    process.exit(0);
  }
  const rawArgs = process.argv.slice(2);
  if (rawArgs.some((a) => a === 'dependencies' || a === 'deps' || a === '--dependencies')) {
    const { runDependenciesReport, parseCliArgs } = await import('./report_dependencies.ts');
    const filtered = rawArgs.filter(
      (a) => a !== 'dependencies' && a !== 'deps' && a !== '--dependencies'
    );
    const options = parseCliArgs(filtered);
    const report = runDependenciesReport(process.cwd(), options);
    const exitCode =
      report.outdatedCount > 0 && !options.noFail && !options.commandsOnly && !options.json ? 1 : 0;
    process.exit(exitCode);
  }
  process.env.AUDIT_SUBPROCESS = 'true';
  if (process.argv.slice(2).some((a) => a === 'fix' || a === '--fix')) {
    for (const moved of migrateLegacyAuditConfig(process.cwd())) {
      console.log(
        styleText(
          'green',
          `🛠️  ${moved} movido a .auditor/${moved} (imports relativos reescritos).`
        )
      );
    }
  }
}

async function setupMasterAuditDirectories(
  activeFamilies: readonly AuditFamily[]
): Promise<string> {
  const scratchAuditsDir = path.resolve(process.cwd(), 'scratch/audits');
  await fs.mkdir(scratchAuditsDir, { recursive: true });
  for (const family of activeFamilies) {
    await fs.mkdir(path.join(scratchAuditsDir, family), { recursive: true });
  }
  return scratchAuditsDir;
}

async function setupCoverageRunEnvironment(
  runMode: string,
  workerTasks: readonly AuditTaskDefinition[]
): Promise<void> {
  const runId = `run_${Temporal.Now.instant().epochMilliseconds}_${Math.random().toString(36).substring(2, 8)}`;
  process.env[COVERAGE_RUN_ID_ENV] = runId;
  process.env[COVERAGE_RUN_MODE_ENV] = runMode;
  process.env[COVERAGE_EXPECTED_SUITES_ENV] = workerTasks.map((t) => t.id).join(',');

  const coverageLedgerDir = path.resolve(process.cwd(), COVERAGE_LEDGER_DIR);
  await fs.rm(coverageLedgerDir, { recursive: true, force: true });
  await fs.mkdir(coverageLedgerDir, { recursive: true });
}

// boolean-trap-ok: CLI master banner formatting params
function displayMasterBanner(
  config: AuditEngineConfig,
  cliOptions: AuditFullCliOptions,
  isFixMode: boolean,
  isBuildMode: boolean,
  tasksToRun: readonly AuditTaskDefinition[],
  allAvailableTasks: readonly AuditTaskDefinition[],
  omittedSuiteIds: readonly string[]
): void {
  const subtitleDetails = createAuditBannerDetails(
    cliOptions,
    isFixMode,
    isBuildMode,
    tasksToRun.length,
    allAvailableTasks.length,
    omittedSuiteIds.length
  );

  let bannerTitle = config.name
    ? `${config.name.toUpperCase()} - SUITE DE AUDITORÍA GLOBAL Y VALIDACIÓN`
    : 'SUITE DE AUDITORÍA GLOBAL Y VALIDACIÓN';
  if (isFixMode) {
    bannerTitle = '[ 🛠️ MODO REPARACIÓN AUTOMÁTICA ]';
  } else if (isBuildMode) {
    bannerTitle = '[ 🏗️ MODO POST-BUILD / ARTEFACTOS COMPILADOS ]';
  } else if (cliOptions.targetPreset === 'critical') {
    bannerTitle = '[ 🚨 MODO CRÍTICO EXCLUSIVO ]';
  } else if (config.name && getVisualWidth(bannerTitle) > MAX_BANNER_SUBTITLE_WIDTH) {
    bannerTitle = `${config.name.toUpperCase()}\nSUITE DE AUDITORÍA GLOBAL Y VALIDACIÓN`;
  }
  const formattedSubtitle = formatSubtitleDetails(subtitleDetails);
  console.log(renderBanner(bannerTitle, formattedSubtitle));
}

const FIX_MODE_EXPLICIT_ORDER: Readonly<Record<string, number>> = {
  // Phase 1: Setup — Configurations, runtime, packages, dependencies, scripts (priority)
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
  // Phase 2: File renames & AST/Code/Markdown mutations
  validate_component_styles: 220,
  audit_project: 230,
  validate_z_index: 240,
  validate_markdown_code_references: 260,
  validate_markdown_syntax: 270,
  validate_mermaid_syntax: 280,
  // Phase 3: Third-party linters with --fix
  validate_oxlint: 310,
  validate_stylelint: 320,
  validate_html_validate: 330,
  validate_markdown_lint: 340,
  // Phase 4: Final formatter
  validate_oxfmt: 400
};

const FIX_ORDER_SETUP_FALLBACK = 190;
const FIX_ORDER_PRIORITY_FALLBACK = 205;
const FIX_ORDER_NORMAL_FALLBACK = 290;

export function resolveFixOrderWeight(task: AuditTaskDefinition): number {
  const explicit = FIX_MODE_EXPLICIT_ORDER[task.id];
  if (explicit !== undefined) return explicit;
  if (task.capabilities?.phase === 'setup') return FIX_ORDER_SETUP_FALLBACK;
  if (task.capabilities?.fix === 'priority') return FIX_ORDER_PRIORITY_FALLBACK;
  return FIX_ORDER_NORMAL_FALLBACK;
}

export function sortTasksByOrder(tasks: AuditTaskDefinition[], isFixMode?: boolean): void {
  tasks.sort((a, b) => {
    if (isFixMode) {
      const weightA = resolveFixOrderWeight(a);
      const weightB = resolveFixOrderWeight(b);
      if (weightA !== weightB) return weightA - weightB;
      return a.id.localeCompare(b.id);
    }

    const aSpeeds = normalizeSpeeds(a.capabilities?.speed ?? 'light');
    const bSpeeds = normalizeSpeeds(b.capabilities?.speed ?? 'light');
    const aHeavy = aSpeeds.includes('heavy') || aSpeeds.includes('full');
    const bHeavy = bSpeeds.includes('heavy') || bSpeeds.includes('full');
    if (aHeavy && !bHeavy) return -1;
    if (!aHeavy && bHeavy) return 1;

    const orderA = a.order ?? FALLBACK_FAMILY_ORDER;
    const orderB = b.order ?? FALLBACK_FAMILY_ORDER;
    if (orderA !== orderB) return orderA - orderB;
    return a.id.localeCompare(b.id);
  });
}

async function executeAllAuditTasks(
  workerTasks: AuditTaskDefinition[],
  postRunTasks: readonly AuditTaskDefinition[],
  taskCtx: TaskExecutionContext,
  concurrencyLimit: number
): Promise<StandardAuditResult[]> {
  const isFixMode = Boolean(taskCtx.cliOptions.values.fix);
  const effectiveConcurrency = isFixMode ? 1 : concurrencyLimit;

  console.log(
    styleText(
      'bold',
      isFixMode
        ? '⏳ Progreso de ejecución de suites (Concurrencia: 1 worker — Modo Reparación Serial):\n'
        : `⏳ Progreso de ejecución de suites (Concurrencia: ${effectiveConcurrency} workers):\n`
    )
  );
  const executeSingleTask = (task: AuditTaskDefinition, index: number) => {
    return executeSingleAuditTask(task, taskCtx, index);
  };

  const workerResults = await runAuditWorkers(
    workerTasks,
    effectiveConcurrency,
    executeSingleTask
  );

  const postRunResults: StandardAuditResult[] = [];
  for (let pIdx = 0; pIdx < postRunTasks.length; pIdx++) {
    const postTask = postRunTasks[pIdx]!;
    postRunResults.push(await executeSingleTask(postTask, workerTasks.length + pIdx));
  }
  return [...workerResults, ...postRunResults];
}

export async function runMasterAudit(): Promise<void> {
  const bootstrapInfo = bootstrapCliProject();
  await checkEarlyCliCommands();
  await ensureProjectBootstrapped({ projectRoot: bootstrapInfo.projectRoot });
  const startTime = performance.now();
  const config = await loadAuditConfig(bootstrapInfo.projectRoot);
  assertAuditConfigComplete(config);
  const activeFamilies = getActiveFamilies(config.customFamilies);
  const cliOptions = parseAuditFullCliArgs(activeFamilies);

  if (cliOptions.targetPreset) {
    process.env.AUDITOR_PRESET = cliOptions.targetPreset;
  }
  if (cliOptions.speed) {
    process.env.AUDITOR_SPEED = cliOptions.speed;
  }
  if (cliOptions.onlySpeed) {
    process.env.AUDITOR_ONLY_SPEED = cliOptions.onlySpeed;
  }
  if (cliOptions.phase) {
    process.env.AUDITOR_PHASE = cliOptions.phase;
  }

  if (cliOptions.skipSimilar) {
    process.env.AUDIT_SKIP_SIMILAR = 'true';
  }

  const scratchAuditsDir = await setupMasterAuditDirectories(activeFamilies);
  const isFixMode = Boolean(cliOptions.values.fix);
  const isBuildMode =
    cliOptions.phase === 'post-build' ||
    cliOptions.targetPreset === 'post-build' ||
    Boolean(cliOptions.values['post-build']);
  const withBuild = Boolean(cliOptions.values['with-build'] || cliOptions.values.all);
  const discoveryBase = {
    fixOnly: isFixMode,
    buildOnly: isBuildMode,
    withBuild,
    speed: cliOptions.speed,
    onlySpeed: cliOptions.onlySpeed,
    phase: cliOptions.phase
  };
  const allAvailableTasks = await discoverAuditors(
    isBuildMode ? { buildOnly: true, phase: 'post-build' } : { withBuild }
  );

  handleIntrospectionCommands(cliOptions, allAvailableTasks, activeFamilies, config);

  const tasksToRun = await discoverAuditors({
    ...discoveryBase,
    family: cliOptions.targetFamily,
    task: cliOptions.targetSuites ? undefined : (cliOptions.values.task as string | undefined),
    suites: cliOptions.targetSuites,
    preset: cliOptions.targetPreset
  });

  const executedSuiteIds = tasksToRun.map((t) => t.id);
  const allSuiteIds = allAvailableTasks.map((t) => t.id);
  const omittedSuiteIds = allSuiteIds.filter((id) => !executedSuiteIds.includes(id));
  const runMode = determineRunMode(
    cliOptions.targetPreset,
    cliOptions.targetSuites,
    cliOptions.values.task,
    cliOptions.targetFamily,
    {
      speed: cliOptions.speed,
      onlySpeed: cliOptions.onlySpeed,
      phase: cliOptions.phase,
      changedOnly: cliOptions.values['changed-since']
    }
  );

  sortTasksByOrder(tasksToRun, isFixMode);
  const workerTasks = tasksToRun.filter((t) => t.capabilities?.phase !== 'post-run');
  const postRunTasks = tasksToRun.filter((t) => t.capabilities?.phase === 'post-run');

  await setupCoverageRunEnvironment(runMode, workerTasks);
  displayMasterBanner(
    config,
    cliOptions,
    isFixMode,
    isBuildMode,
    tasksToRun,
    allAvailableTasks,
    omittedSuiteIds
  );

  if (tasksToRun.length === 0) {
    console.log(
      styleText(
        'yellow',
        '⚠️ No se encontraron auditores que coincidan con los filtros especificados.'
      )
    );
    process.exit(0);
  }

  const astTasks = tasksToRun.filter((t) => t.requiresAst);
  let sharedAstContext: SharedAstContext | undefined;
  if (astTasks.length > 0 && !isFixMode) {
    console.log(
      styleText(
        'cyan',
        `🧠 [AST Engine] Detectados ${astTasks.length} sub-auditor(es) que requieren AST. Inicializando contexto AST compartido...\n`
      )
    );
    sharedAstContext = new SharedAstContext();
  }

  const coordinator = new TaskStreamCoordinator(tasksToRun.length, { indent: '  ' });
  const taskCtx: TaskExecutionContext = {
    cliOptions,
    sharedAstContext,
    scratchAuditsDir,
    coordinator
  };
  const results = await executeAllAuditTasks(
    workerTasks,
    postRunTasks,
    taskCtx,
    cliOptions.concurrencyLimit
  );
  const totalDuration = Math.round(performance.now() - startTime);

  const anyFailed = await renderAndPersistMasterReport({
    results,
    tasksToRun,
    allAvailableTasks,
    omittedSuiteIds,
    totalDuration,
    config,
    activeFamilies,
    cliOptions,
    runMode,
    scratchAuditsDir
  });

  if (anyFailed) {
    process.exit(1);
  }
}

if (isMainModule(import.meta.url)) {
  runMasterAudit().catch((err) => {
    console.error(styleText('red', `\n💥 Error fatal en audit_full: ${(err as Error).message}`));
    process.exit(1);
  });
}
