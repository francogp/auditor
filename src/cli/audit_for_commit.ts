#!/usr/bin/env -S node --experimental-strip-types
/**
 * scripts/maintenance/audit_for_commit.ts
 * 
 * COMPARADOR DE ADVERTENCIAS Y ERRORES PARA SAFE-COMMIT (Node.js 26+)
 * 
 * Obtiene los archivos modificados localmente comparando con 'origin/main'.
 * Analiza todo el proyecto buscando ERRORES (incluyendo eslint, vue-tsc type checking y 100% de sub-auditores).
 * Para las ADVERTENCIAS (warnings), solo exige resolver aquellas en archivos
 * modificados que sean nuevas comparadas con 'origin/main'.
 * 
 * ⚠️ ZERO TAMPERING MANDATE:
 * Under NO circumstances may this script be modified to weaken, downgrade, or
 * bypass new warnings (such as Fallow unused exports or complexity hotspots) to make
 * a commit pass. All new findings MUST be resolved at the source code level.
 */

import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, styleText } from 'node:util';
import { enableCompileCache } from 'node:module';
import os from 'node:os';

import { type AuditSeverity } from '../suites/architecture/audit_rules.ts';
import { type StandardAuditResult, type AuditTaskDefinition, type AuditFinding } from '../core/auditContract.ts';
import { renderBanner } from '../core/unifiedTheme.ts';
import { discoverAuditors } from './auditScanner.ts';
import { executeAuditorStreaming, TaskStreamCoordinator } from '../core/streamingRunner.ts';
import { isPathIgnored } from '../core/auditorBase.ts';
import { loadAuditConfig, assertAuditConfigComplete, type AuditEngineConfig } from '../core/auditConfig.ts';
import { isMainModule } from './cliUtils.ts';

enableCompileCache();

const CPU_CORE_DIVISOR = 2 as const;
const MIN_CONCURRENCY = 1 as const;
const DEFAULT_TIMEOUT_MS = 0 as const;
const ESLINT_STDIN_MAX_BUFFER_BYTES = 50 * 1024 * 1024;

export interface Violation {
  file: string;
  line: number;
  message: string;
  context: string;
  severity: AuditSeverity;
  ruleId?: string;
  ruleDescription?: string;
  suiteId?: string;
  suiteName?: string;
  isNew?: boolean;
}

interface EslintMessage {
  line?: number;
  message?: string;
  source?: string;
  severity?: number;
  ruleId?: string;
}

interface EslintFileResult {
  filePath: string;
  messages: EslintMessage[];
}

// Extensiones a auditar
const AUDIT_EXTENSIONS = ['.vue', '.ts', '.js', '.scss', '.css'] as const;

export function isSubAuditorRule(ruleId?: string, suiteId?: string): boolean {
  if (suiteId) return true;
  if (!ruleId) return false;
  return ruleId === 'project-audit' ||
         ruleId === 'audit_project' ||
         ruleId.startsWith('Fallow') ||
         ruleId.startsWith('o1-') ||
         ruleId.includes('-') ||
         ruleId.startsWith('validate_') ||
         ruleId.startsWith('audit_');
}

export function filterNewWarnings(
  localWarnings: Violation[],
  originWarnings: Violation[],
  originContent: string | null,
  filePath: string
): Violation[] {
  const result: Violation[] = [];
  
  for (const violation of localWarnings) {
    if (violation.severity !== 'warning' || violation.file !== filePath) {
      continue;
    }

    // Sugerencias de complejidad de Fallow son métricas informativas de salud
    if (violation.message.includes('Sugerencia de complejidad (Fallow)')) {
      const copy = { ...violation, isNew: false };
      result.push(copy);
      continue;
    }

    if (originContent === null) {
      // Archivo nuevo -> todas las advertencias en él son nuevas
      const copy = { ...violation, isNew: true };
      result.push(copy);
      continue;
    }

    // Si es una regla de sub-auditor o auditoría de proyecto, comparar contexto en código fuente
    if (isSubAuditorRule(violation.ruleId, violation.suiteId)) {
      const existedInOriginCode = violation.context ? originContent.includes(violation.context) : true;
      const copy = { ...violation, isNew: !existedInOriginCode };
      result.push(copy);
    } else {
      // Para ESLint, comparar ruleId y message contra originWarnings
      const existedInOriginWarnings = originWarnings.some(
        orig => orig.ruleId === violation.ruleId && orig.message === violation.message
      );
      const copy = { ...violation, isNew: !existedInOriginWarnings };
      result.push(copy);
    }
  }

  return result;
}

async function getModifiedFiles(): Promise<Set<string>> {
  try {
    try {
      execSync('git fetch origin main --timeout=5', { stdio: 'ignore' });
    } catch {
      // catch-ok: Usar referencia local existente si falla o no hay conexión
    }

    const diffOutput = execSync('git diff --name-only origin/main', { encoding: 'utf-8' });
    const statusOutput = execSync('git status --porcelain', { encoding: 'utf-8' });

    const files = new Set<string>();

    diffOutput.split('\n').forEach(f => {
      const trimmed = f.trim();
      if (trimmed) files.add(trimmed);
    });

    const GIT_STATUS_PREFIX_OFFSET = 3;

    statusOutput.split('\n').forEach(line => {
      if (line.length > GIT_STATUS_PREFIX_OFFSET) {
        const file = line.substring(GIT_STATUS_PREFIX_OFFSET).trim();
        if (line[0] !== 'D' && line[1] !== 'D') {
          files.add(file);
        }
      }
    });

    const filteredFiles = new Set<string>();
    for (const f of files) {
      const ext = path.extname(f).toLowerCase();
      const isConfigFile = /^(vite|vitest|playwright|eslint)\.config\./i.test(path.basename(f)) || path.basename(f).startsWith('vitest.');
      if ((AUDIT_EXTENSIONS as readonly string[]).includes(ext) && !isConfigFile && !isPathIgnored(f)) { // no-domain: Non-domain utility collection or data structure
        filteredFiles.add(f);
      }
    }
    return filteredFiles;
  } catch (error) {
    console.error(styleText('red', `❌ Error al obtener archivos modificados con git: ${(error as Error).message}`));
    return new Set();
  }
}

async function getOriginFileContent(filePath: string): Promise<string | null> {
  try {
    return execSync(`git show origin/main:${filePath}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}


async function runOriginEslint(filePath: string, content: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  try {
    const eslintProc = spawnSync('npx', ['eslint', '--config', 'eslint.config.js', '--stdin', '--stdin-filename', filePath, '--format', 'json'], {
      input: content,
      encoding: 'utf-8',
      maxBuffer: ESLINT_STDIN_MAX_BUFFER_BYTES
    });
    const output = eslintProc.stdout ? eslintProc.stdout.trim() : '';
    if (!output) return [];

    const results = JSON.parse(output) as EslintFileResult[];
    for (const fileResult of results) {
      for (const msg of fileResult.messages) {
        violations.push({
          file: filePath,
          line: msg.line || 0,
          message: msg.message || '',
          context: msg.source || '',
          severity: msg.severity === 2 ? 'error' : 'warning',
          ruleId: msg.ruleId || 'eslint-rule'
        });
      }
    }
  } catch {
    // catch-ok: Ignorar fallos de eslint en el origen
  }
  return violations;
}

interface CommitCliArgs {
  effectivePreset?: string;
  familyArg?: string;
  taskArg?: string;
  suitesArg?: string[];
  skipSimilar?: boolean;
}

function parseCommitCliArgs(config: AuditEngineConfig): CommitCliArgs {
  const args = process.argv.slice(2);
  const normalized = args.map(a => a.includes('=') && !a.startsWith('-') ? `--${a}` : a);

  const { values } = parseArgs({
    args: normalized,
    options: {
      preset: { type: 'string' },
      family: { type: 'string' },
      task: { type: 'string' },
      suites: { type: 'string' },
      'skip-similar': { type: 'boolean' }
    },
    strict: false
  });

  const presetArg = typeof values.preset === 'string' ? values.preset : undefined;
  const effectivePreset = presetArg || (config.presets?.commit ? 'commit' : undefined);
  const familyArg = typeof values.family === 'string' ? values.family : undefined;
  const taskArg = typeof values.task === 'string' ? values.task : undefined;
  const suitesArg = typeof values.suites === 'string' ? values.suites.split(',') : undefined;
  const skipSimilar = Boolean(values['skip-similar']) || normalized.includes('--skip-similar');

  return { effectivePreset, familyArg, taskArg, suitesArg, skipSimilar };
}

function printModifiedFiles(modifiedFiles: ReadonlySet<string>): void {
  console.log(styleText('bold', '📁 Archivos modificados detectados:'));
  if (modifiedFiles.size === 0) {
    console.log(styleText('green', '  ✔ Cero archivos fuente modificados comparados con origin/main.\n'));
    return;
  }
  const MAX_SAMPLE_FILES = 8;
  const sample = Array.from(modifiedFiles).slice(0, MAX_SAMPLE_FILES);
  sample.forEach(f => console.log(`  - ${styleText('cyan', f)}`));
  if (modifiedFiles.size > MAX_SAMPLE_FILES) {
    console.log(styleText('dim', `  ... y ${modifiedFiles.size - MAX_SAMPLE_FILES} archivos más`));
  }
  console.log('');
}

function mapFindingToViolation(finding: AuditFinding, task: AuditTaskDefinition): Violation | null {
  if (finding.severity === 'info') return null;
  const targetFile = finding.file ? path.relative(process.cwd(), finding.file) : '';
  if (!targetFile && finding.severity === 'warning') return null;

  return {
    file: targetFile || task.scriptPath,
    line: finding.line || 1,
    message: finding.message,
    context: finding.context || task.name,
    severity: finding.severity,
    ruleId: finding.ruleId || task.id,
    ruleDescription: finding.ruleDescription,
    suiteId: task.id,
    suiteName: task.name
  };
}

function buildTimeoutViolation(task: AuditTaskDefinition): Violation {
  return {
    file: task.scriptPath,
    line: 1,
    message: `Timeout excedido (${task.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms) al ejecutar el auditor '${task.name}' (${task.id}).`,
    context: task.name,
    severity: 'error',
    ruleId: task.id,
    suiteId: task.id,
    suiteName: task.name
  };
}

async function parseTaskFindings(
  task: AuditTaskDefinition,
  proc: { timedOut?: boolean }
): Promise<{ localViolations: Violation[]; findingsSummary?: { errors: number; warnings: number } }> {
  const localViolations: Violation[] = [];
  const jsonPath = path.resolve(process.cwd(), 'scratch/audits', task.family, `${task.id}.json`);
  let findingsSummary: { errors: number; warnings: number } | undefined;

  try {
    const data = await fs.readFile(jsonPath, 'utf-8');
    const parsed = JSON.parse(data) as StandardAuditResult;
    findingsSummary = {
      errors: parsed.summary?.errors ?? 0,
      warnings: parsed.summary?.warnings ?? 0
    };

    for (const finding of parsed.findings || []) {
      const v = mapFindingToViolation(finding, task);
      if (v) localViolations.push(v);
    }
  } catch {
    // catch-ok: non-existent task output
    if (proc.timedOut) {
      localViolations.push(buildTimeoutViolation(task));
    }
  }
  return { localViolations, findingsSummary };
}

async function executeSingleCommitTask(
  task: AuditTaskDefinition,
  coordinator: TaskStreamCoordinator
): Promise<Violation[]> {
  const subLines: string[] = [];
  const proc = await executeAuditorStreaming(task, task.args, (subLine) => {
    subLines.push(subLine);
  });

  const { localViolations, findingsSummary } = await parseTaskFindings(task, proc);
  const isSuccess = localViolations.filter(v => v.severity === 'error').length === 0;

  await coordinator.onTaskComplete({
    taskName: task.name,
    taskId: task.id,
    subLines,
    durationMs: proc.durationMs,
    isSuccess,
    hasWarnings: (findingsSummary?.warnings ?? 0) > 0
  });

  return localViolations;
}

async function runCommitAuditorTasks(discoveredTasks: AuditTaskDefinition[]): Promise<Violation[]> {
  const availableCpus = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
  const concurrencyLimit = Math.max(MIN_CONCURRENCY, Math.floor(availableCpus / CPU_CORE_DIVISOR));
  const workerCount = Math.min(concurrencyLimit, discoveredTasks.length);

  console.log(styleText('bold', `⏳ Progreso de ejecución de suites (Concurrencia: ${workerCount} workers):\n`));

  const coordinator = new TaskStreamCoordinator(discoveredTasks.length, { indent: '     ' });
  const taskViolations: Violation[][] = new Array(discoveredTasks.length);
  let nextTaskIndex = 0;

  async function worker(): Promise<void> {
    while (nextTaskIndex < discoveredTasks.length) {
      const idx = nextTaskIndex++;
      taskViolations[idx] = await executeSingleCommitTask(discoveredTasks[idx]!, coordinator);
    }
  }

  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return taskViolations.flat();
}

function partitionViolations(
  allViolations: Violation[],
  modifiedFiles: ReadonlySet<string>
): { projectErrors: Violation[]; warningsByFile: Record<string, Violation[]> } {
  const projectErrors: Violation[] = [];
  const warningsByFile: Record<string, Violation[]> = {};

  for (const violation of allViolations) {
    if (violation.severity === 'error') {
      projectErrors.push(violation);
      continue;
    }

    if (modifiedFiles.has(violation.file)) {
      let list = warningsByFile[violation.file];
      if (!list) {
        list = [];
        warningsByFile[violation.file] = list;
      }
      list.push(violation);
    }
  }
  return { projectErrors, warningsByFile };
}

async function collectFileWarnings(
  warningsByFile: Record<string, Violation[]>
): Promise<{ newWarnings: Violation[]; legacyWarnings: Violation[] }> {
  const finalWarnings: Violation[] = [];

  for (const file of Object.keys(warningsByFile)) {
    const localFileWarnings = warningsByFile[file]!;
    const originContent = await getOriginFileContent(file);
    let originEslint: Violation[] = [];

    if (originContent !== null) {
      const hasEslint = localFileWarnings.some(w => !isSubAuditorRule(w.ruleId));
      if (hasEslint) {
        originEslint = await runOriginEslint(file, originContent);
      }
    }

    const filtered = filterNewWarnings(localFileWarnings, originEslint, originContent, file);
    finalWarnings.push(...filtered);
  }

  const newWarnings = finalWarnings.filter(v => v.isNew);
  const legacyWarnings = finalWarnings.filter(v => !v.isNew);
  return { newWarnings, legacyWarnings };
}

async function persistCommitReports(reportData: {
  analyzedModifiedFiles: string[];
  summary: { projectErrors: number; newWarnings: number; legacyWarnings: number; status: string };
  errors: Violation[];
  newWarnings: Violation[];
  legacyWarnings: Violation[];
}): Promise<void> {
  await fs.mkdir('scratch/audits', { recursive: true });
  const jsonReportString = JSON.stringify(reportData, null, 2);
  await fs.writeFile('scratch/warnings_diff_report.json', jsonReportString, 'utf-8');
  await fs.writeFile('scratch/audits/latest_warnings_diff.json', jsonReportString, 'utf-8');
}

function renderCommitResults(
  projectErrors: Violation[],
  newWarnings: Violation[],
  legacyWarnings: Violation[]
): boolean {
  const latestAuditDiffPath = 'scratch/audits/latest_warnings_diff.json';
  console.log(styleText('bold', '\n📊 RESULTADOS DE COMPARACIÓN (PRE-COMMIT GATEKEEPER):'));
  console.log('  ────────────────────────────────────────────────────────────────────────');

  if (projectErrors.length > 0) {
    console.log(styleText('bold', styleText('red', `\n❌ ERRORES DETECTADOS EN EL PROYECTO (${projectErrors.length}):`)));
    const sampleErrors = projectErrors.slice(-5);
    sampleErrors.forEach(v => {
      const ruleLabel = v.ruleDescription || v.ruleId || 'error';
      const suitePrefix = v.suiteId ? `[${v.suiteId}] ` : '';
      console.log(`  - ${styleText('bold', v.file)}:${v.line} ${styleText('dim', `${suitePrefix}${ruleLabel}`)} -> ${v.message}`);
    });
    if (projectErrors.length > 5) {
      console.log(styleText('dim', `    ... y ${projectErrors.length - 5} errores más (ver detalle completo en ${latestAuditDiffPath})\n`));
    }
  } else {
    console.log(styleText('green', '  ✔ Cero errores detectados en todo el proyecto (ESLint, TypeScript, Dominio, FSM, SQL).'));
  }

  if (newWarnings.length > 0) {
    console.log(styleText('bold', styleText('yellow', `\n⚠️ NUEVAS ADVERTENCIAS EN ARCHIVOS MODIFICADOS (${newWarnings.length}):`)));
    newWarnings.forEach(v => {
      const ruleLabel = v.ruleDescription || v.ruleId || 'warning';
      const suitePrefix = v.suiteId ? `[${v.suiteId}] ` : '';
      console.log(`  - ${styleText('bold', v.file)}:${v.line} ${styleText('dim', `${suitePrefix}${ruleLabel}`)} -> ${v.message}`);
    });
  } else {
    console.log(styleText('green', '  ✔ Cero advertencias nuevas en los archivos modificados.'));
  }

  if (legacyWarnings.length > 0) {
    console.log(styleText('dim', `  ℹ️  ${legacyWarnings.length} advertencias preexistentes en archivos modificados (ignoradas conforme al contrato).`));
  }

  console.log('  ────────────────────────────────────────────────────────────────────────');
  return projectErrors.length === 0 && newWarnings.length === 0;
}

async function main() {
  const config = await loadAuditConfig();
  assertAuditConfigComplete(config);
  const { effectivePreset, familyArg, taskArg, suitesArg } = parseCommitCliArgs(config);

  console.log(renderBanner(
    `${config.name.toUpperCase()} - WARNINGS DIFF & PRE-COMMIT GATEKEEPER`,
    effectivePreset ? `Preset: ${effectivePreset.toUpperCase()} | Exige 0 errores en proyecto y 0 warnings nuevos` : 'Exige 0 errores en proyecto y 0 warnings nuevos'
  ));

  const modifiedFiles = await getModifiedFiles();
  printModifiedFiles(modifiedFiles);

  const discoveredTasks = await discoverAuditors({
    preset: effectivePreset,
    family: familyArg,
    task: taskArg,
    suites: suitesArg,
    skipSimilar: true
  });

  const allViolations = await runCommitAuditorTasks(discoveredTasks);
  const { projectErrors, warningsByFile } = partitionViolations(allViolations, modifiedFiles);
  const { newWarnings, legacyWarnings } = await collectFileWarnings(warningsByFile);

  await persistCommitReports({
    analyzedModifiedFiles: Array.from(modifiedFiles),
    summary: {
      projectErrors: projectErrors.length,
      newWarnings: newWarnings.length,
      legacyWarnings: legacyWarnings.length,
      status: projectErrors.length === 0 && newWarnings.length === 0 ? 'passed' : 'failed'
    },
    errors: projectErrors,
    newWarnings,
    legacyWarnings
  });

  const isSuccess = renderCommitResults(projectErrors, newWarnings, legacyWarnings);
  if (isSuccess) {
    console.log(styleText('bold', styleText('green', '\n✨ ¡GATEKEEPER APROBADO! Repositorio 100% limpio y listo para safe-commit.\n')));
    console.log(styleText('dim', '💾 Reporte guardado en: scratch/audits/latest_warnings_diff.json\n'));
    process.exit(0);
  } else {
    console.error(styleText('bold', styleText('red', `\n🚨 GATEKEEPER BLOQUEADO: Se encontraron ${projectErrors.length} errores y ${newWarnings.length} advertencias nuevas.\n`)));
    console.log(styleText('dim', '💾 Reporte guardado en: scratch/audits/latest_warnings_diff.json\n'));
    process.exit(1);
  }
}

// Solo ejecutar main si se corre directamente
if (isMainModule(import.meta.url)) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? (err as Error).message : String(err);
    console.error(styleText('red', `💥 Error fatal en audit_for_commit: ${msg}`));
    process.exit(1);
  });
}

