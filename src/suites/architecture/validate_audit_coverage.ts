/**
 * src/suites/architecture/validate_audit_coverage.ts
 *
 * AUDIT COVERAGE & BLIND-SPOT AUDITOR (Node.js 26+ Native)
 * Post-run suite that consumes every coverage ledger written during a full orchestrated run and
 * reports blind spots that would otherwise produce false-clean results:
 *   - tracked files that no suite analyzed (uncovered),
 *   - files whose rules are silenced by configured exemption policies (degraded),
 *   - drift between a suite's static declaration and what it actually scanned,
 *   - rules evaluated zero times without an explicit non-applicability justification (dormant),
 *   - exemptions that match nothing (dead), and executed suites that left no ledger.
 */

import { execFileSync } from 'node:child_process';
import nodeFs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, isPathIgnored } from '../../core/auditorBase.ts';
import { getAuditConfig, type AuditEngineConfig } from '../../core/auditConfig.ts';
import type { CoverageLedger } from '../../core/auditContract.ts';
import {
  COVERAGE_EXPECTED_SUITES_ENV,
  COVERAGE_RUN_MODE_ENV,
  isAuditableCodebaseFile,
  isDeclaredByCoverage,
  readCoverageLedgers,
  resolveActiveCoverageRunId
} from '../../core/auditCoverage.ts';
import { getMatchingExemptionPolicies } from '../../core/exemptionPolicies.ts';
import { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES } from '../../cli/cliUtils.ts';

enableCompileCache();

export const AUDIT_COVERAGE_SUITE_ID = 'validate_audit_coverage';

export const AUDIT_COVERAGE_RULES = [
  'coverage-uncovered-file',
  'coverage-degraded-file',
  'coverage-declared-not-scanned',
  'coverage-scanned-undeclared',
  'coverage-dormant-rule',
  'coverage-invalid-exemption',
  'coverage-missing-ledger'
] as const;
export type AuditCoverageRuleId = (typeof AUDIT_COVERAGE_RULES)[number];

export interface CoverageFinding {
  readonly ruleId: AuditCoverageRuleId;
  readonly file: string;
  readonly message: string;
  readonly context: string;
}

export interface CoverageAnalysisInput {
  readonly trackedFiles: readonly string[];
  readonly ledgers: readonly CoverageLedger[];
  readonly expectedSuites: readonly string[];
  readonly config: AuditEngineConfig;
  /** Global ignore predicate (config ignoredDirs/ignoreGlobs + canonical dirs). */
  readonly isGloballyIgnored: (relPath: string) => boolean;
}

/** Groups files by parent directory so one finding lists every affected file of a directory. */
function groupByDirectory(files: readonly string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const file of [...files].sort()) {
    const dir = path.posix.dirname(file);
    groups.getOrInsert(dir, []).push(path.posix.basename(file));
  }
  return groups;
}

function directoryFindings(
  ruleId: AuditCoverageRuleId,
  files: readonly string[],
  describe: (count: number, dir: string) => string,
  context: string
): CoverageFinding[] {
  return Array.from(groupByDirectory(files), ([dir, names]) => ({
    ruleId,
    file: dir === '.' ? '' : dir,
    message: `${describe(names.length, dir)}: ${names.join(', ')}`,
    context
  }));
}

export function isCoveredBy(file: string, ledger: CoverageLedger, scannedSets: ReadonlyMap<string, ReadonlySet<string>>): boolean {
  if (ledger.skipped) return false;
  if (ledger.source === 'declared-only') return isDeclaredByCoverage(file, ledger.declared);
  return scannedSets.get(ledger.suiteId)?.has(file) ?? false;
}

function analyzeUncoveredAndDegraded(
  input: CoverageAnalysisInput,
  ledgers: readonly CoverageLedger[],
  scannedSets: ReadonlyMap<string, ReadonlySet<string>>
): CoverageFinding[] {
  const customExemptGlobs = (input.config.coverage?.exemptGlobs ?? []).map(e => e.glob);
  const acknowledged = input.config.coverage?.acknowledgedDegradations ?? [];
  const uncovered: string[] = [];
  const degradedByPolicy = new Map<string, string[]>();

  for (const file of input.trackedFiles) {
    if (input.isGloballyIgnored(file)) continue;
    if (!isAuditableCodebaseFile(file, customExemptGlobs)) continue;
    if (!ledgers.some(l => isCoveredBy(file, l, scannedSets))) {
      uncovered.push(file);
      continue;
    }
    for (const policy of getMatchingExemptionPolicies(file, input.config)) {
      if (policy.kind !== 'configured') continue;
      const isAcknowledged = acknowledged.some(a => a.policy === policy.id && path.posix.matchesGlob(file, a.glob));
      if (!isAcknowledged) degradedByPolicy.getOrInsert(policy.id, []).push(file);
    }
  }

  const findings = directoryFindings(
    'coverage-uncovered-file',
    uncovered,
    count => `${count} archivo(s) versionado(s) que ninguna suite analiza (falso limpio)`,
    'Agrega una suite que los cubra o declara coverage.exemptGlobs con reason'
  );
  for (const [policyId, files] of degradedByPolicy) {
    const policy = getMatchingExemptionPolicies(files[0]!, input.config).find(p => p.id === policyId)!;
    findings.push(...directoryFindings(
      'coverage-degraded-file',
      files,
      count => `${count} archivo(s) con reglas silenciadas por '${policy.configKey}' (${policy.silences})`,
      `Corrige '${policy.configKey}' o declara coverage.acknowledgedDegradations (policy: '${policyId}')`
    ));
  }
  return findings;
}

function analyzeDrift(
  input: CoverageAnalysisInput,
  ledgers: readonly CoverageLedger[],
  scannedSets: ReadonlyMap<string, ReadonlySet<string>>
): CoverageFinding[] {
  const findings: CoverageFinding[] = [];
  const tracked = new Set(input.trackedFiles);
  for (const ledger of ledgers) {
    if (ledger.skipped || ledger.source !== 'runtime') continue;
    const scanned = scannedSets.get(ledger.suiteId)!;
    const notScanned = input.trackedFiles.filter(f =>
      !scanned.has(f) && !input.isGloballyIgnored(f) && isDeclaredByCoverage(f, ledger.declared)
    );
    const undeclared = [...scanned].filter(f => tracked.has(f) && !isDeclaredByCoverage(f, ledger.declared));
    findings.push(...directoryFindings(
      'coverage-declared-not-scanned',
      notScanned,
      count => `[${ledger.suiteId}] declara ${count} archivo(s) que no escaneó`,
      `${ledger.suiteId}: alinea coverage.include/exclude con lo que realmente analiza`
    ));
    findings.push(...directoryFindings(
      'coverage-scanned-undeclared',
      undeclared,
      count => `[${ledger.suiteId}] escaneó ${count} archivo(s) fuera de su declaración`,
      `${ledger.suiteId}: amplía coverage.include o deja de escanearlos`
    ));
  }
  return findings;
}

function analyzeDormantRules(ledgers: readonly CoverageLedger[]): CoverageFinding[] {
  const findings: CoverageFinding[] = [];
  for (const ledger of ledgers) {
    if (ledger.skipped) continue;
    for (const ruleId of ledger.ruleIds) {
      if ((ledger.ruleEvaluations[ruleId] ?? 0) > 0 || ledger.notApplicable[ruleId]) continue;
      findings.push({
        ruleId: 'coverage-dormant-rule',
        file: '',
        message: `[${ledger.suiteId}] la regla '${ruleId}' se evaluó 0 veces: su resultado limpio no es confiable (condición de activación rota o sin instrumentar)`,
        context: `${ledger.suiteId}/${ruleId}`
      });
    }
  }
  return findings;
}

function analyzeExemptionsAndLedgers(input: CoverageAnalysisInput, ledgers: readonly CoverageLedger[]): CoverageFinding[] {
  const findings: CoverageFinding[] = [];
  const configFile = 'audit.config.ts';
  for (const exemption of input.config.coverage?.exemptGlobs ?? []) {
    if (!input.trackedFiles.some(f => path.posix.matchesGlob(f, exemption.glob))) {
      findings.push({
        ruleId: 'coverage-invalid-exemption',
        file: configFile,
        message: `coverage.exemptGlobs '${exemption.glob}' no coincide con ningún archivo versionado (exención muerta)`,
        context: exemption.glob
      });
    }
  }
  for (const ack of input.config.coverage?.acknowledgedDegradations ?? []) {
    const used = input.trackedFiles.some(f =>
      path.posix.matchesGlob(f, ack.glob) && getMatchingExemptionPolicies(f, input.config).some(p => p.id === ack.policy)
    );
    if (!used) {
      findings.push({
        ruleId: 'coverage-invalid-exemption',
        file: configFile,
        message: `coverage.acknowledgedDegradations '${ack.glob}' (policy '${ack.policy}') no reconoce ningún archivo degradado (exención muerta)`,
        context: `${ack.policy}:${ack.glob}`
      });
    }
  }
  const ledgerIds = new Set(ledgers.map(l => l.suiteId));
  for (const suiteId of input.expectedSuites) {
    if (!ledgerIds.has(suiteId)) {
      findings.push({
        ruleId: 'coverage-missing-ledger',
        file: '',
        message: `La suite '${suiteId}' se ejecutó pero no dejó ledger de cobertura (falló, o no hereda de BaseAuditor): su resultado no es verificable`,
        context: suiteId
      });
    }
  }
  return findings;
}

/**
 * Pure blind-spot analysis over the ledgers of one run.
 */
export function analyzeAuditCoverage(input: CoverageAnalysisInput): CoverageFinding[] {
  const ledgers = input.ledgers.filter(l => l.suiteId !== AUDIT_COVERAGE_SUITE_ID);
  const scannedSets = new Map(ledgers.map(l => [l.suiteId, new Set(l.scanned)] as const));
  return [
    ...analyzeUncoveredAndDegraded(input, ledgers, scannedSets),
    ...analyzeDrift(input, ledgers, scannedSets),
    ...analyzeDormantRules(ledgers),
    ...analyzeExemptionsAndLedgers(input, ledgers)
  ];
}

/** Tracked files (git index) that still exist on disk, as POSIX relative paths. */
export function listTrackedFiles(projectRoot: string): string[] {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
  });
  return output
    .split('\0')
    .filter(f => f.length > 0 && nodeFs.existsSync(path.join(projectRoot, f)));
}

export class AuditCoverageAuditor extends BaseAuditor<AuditCoverageRuleId> {
  constructor(options: { projectRoot?: string } = {}) {
    super({
      capabilities: { postRun: true },
      id: AUDIT_COVERAGE_SUITE_ID,
      name: 'Audit Coverage & Blind Spots',
      description: 'Detecta puntos ciegos: archivos, reglas y exenciones',
      family: 'architecture',
      packageName: 'Cobertura',
      icon: '🗺️',
      ruleIds: AUDIT_COVERAGE_RULES,
      ruleDescriptions: {
        'coverage-uncovered-file': 'Archivo versionado sin ninguna suite',
        'coverage-degraded-file': 'Reglas silenciadas por configuración',
        'coverage-declared-not-scanned': 'Declarado pero no escaneado',
        'coverage-scanned-undeclared': 'Escaneado fuera de lo declarado',
        'coverage-dormant-rule': 'Regla dormida: 0 evaluaciones',
        'coverage-invalid-exemption': 'Exención sin archivos que la usen',
        'coverage-missing-ledger': 'Suite sin ledger de cobertura'
      },
      coverage: { include: ['audit.config.ts'] },
      projectRoot: options.projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const config = getAuditConfig(this.projectRoot);
    const runId = resolveActiveCoverageRunId();
    if (config.coverage?.enabled === false) {
      this.markSkipped("Cobertura desactivada explícitamente (coverage.enabled: false)");
      return;
    }
    if (!runId || process.env[COVERAGE_RUN_MODE_ENV] !== 'full') {
      this.markSkipped('Requiere una corrida completa (npm run audit) para verificar cobertura');
      return;
    }

    const configPath = path.join(this.projectRoot, 'audit.config.ts');
    if (nodeFs.existsSync(configPath)) this.recordScanned(configPath);

    const expectedSuites = (process.env[COVERAGE_EXPECTED_SUITES_ENV] ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0 && s !== AUDIT_COVERAGE_SUITE_ID);

    const findings = analyzeAuditCoverage({
      trackedFiles: listTrackedFiles(this.projectRoot),
      ledgers: await readCoverageLedgers(this.projectRoot, runId),
      expectedSuites,
      config,
      isGloballyIgnored: rel => isPathIgnored(rel)
    });

    for (const ruleId of AUDIT_COVERAGE_RULES) this.markRuleEvaluated(ruleId);
    for (const finding of findings) {
      this.addViolation({ ...finding, severity: 'error', line: 1 });
    }
    this.context.setMetric('Ledgers', expectedSuites.length);
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new AuditCoverageAuditor());
