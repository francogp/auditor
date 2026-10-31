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
import { enableCompileCache } from 'node:module';
import path from 'node:path';

import { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES } from '../../cli/cliUtils.ts';
import {
  getAuditConfig,
  type AuditEngineConfig,
  AUDIT_CONFIG_FILE
} from '../../core/auditConfig.ts';
import type { CoverageLedger } from '../../core/auditContract.ts';
import {
  COVERAGE_EXPECTED_SUITES_ENV,
  COVERAGE_RUN_MODE_ENV,
  isAuditableCodebaseFile,
  isDeclaredByCoverage,
  readCoverageLedgers,
  resolveActiveCoverageRunId
} from '../../core/auditCoverage.ts';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  isPathIgnored,
  createRuleCapabilities
} from '../../core/auditorBase.ts';
import { getMatchingExemptionPolicies } from '../../core/exemptionPolicies.ts';

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
  readonly auditableFiles?: readonly string[];
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

export function isCoveredBy(
  file: string,
  ledger: CoverageLedger,
  scannedSets: ReadonlyMap<string, ReadonlySet<string>>
): boolean {
  if (ledger.skipped) return false;
  if (ledger.source === 'declared-only') return isDeclaredByCoverage(file, ledger.declared);
  return scannedSets.get(ledger.suiteId)?.has(file) ?? false;
}

function recordDegradedPolicyViolations(
  file: string,
  config: CoverageAnalysisInput['config'],
  acknowledged: readonly NonNullable<
    NonNullable<CoverageAnalysisInput['config']['coverage']>['acknowledgedDegradations']
  >[number][],
  degradedByPolicy: Map<string, string[]>
): void {
  for (const policy of getMatchingExemptionPolicies(file, config)) {
    if (policy.kind !== 'configured') continue;
    const isAcknowledged = acknowledged.some(
      (a) => a.policy === policy.id && path.posix.matchesGlob(file, a.glob)
    );
    if (!isAcknowledged) {
      const existing = degradedByPolicy.get(policy.id);
      if (existing) {
        existing.push(file);
      } else {
        degradedByPolicy.set(policy.id, [file]);
      }
    }
  }
}

function buildDegradedPolicyFindings(
  degradedByPolicy: Map<string, string[]>,
  config: CoverageAnalysisInput['config']
): CoverageFinding[] {
  const findings: CoverageFinding[] = [];
  for (const [policyId, files] of degradedByPolicy) {
    const policy = getMatchingExemptionPolicies(files[0]!, config).find((p) => p.id === policyId)!;
    findings.push(
      ...directoryFindings(
        'coverage-degraded-file',
        files,
        (count) =>
          `${count} archivo(s) con reglas silenciadas por '${policy.configKey}' (${policy.silences})`,
        `Corrige '${policy.configKey}' o declara coverage.acknowledgedDegradations (policy: '${policyId}')`
      )
    );
  }
  return findings;
}

function getAuditableCandidates(input: CoverageAnalysisInput): readonly string[] {
  if (input.auditableFiles) return input.auditableFiles;
  const customExemptGlobs = (input.config.coverage?.exemptGlobs ?? []).map((e) => e.glob);
  return input.trackedFiles.filter(
    (f) => !input.isGloballyIgnored(f) && isAuditableCodebaseFile(f, customExemptGlobs)
  );
}

function analyzeUncoveredFiles(
  input: CoverageAnalysisInput,
  ledgers: readonly CoverageLedger[],
  scannedSets: ReadonlyMap<string, ReadonlySet<string>>
): CoverageFinding[] {
  const candidates = getAuditableCandidates(input);
  const uncovered: string[] = []; // Non-domain relative file path strings collection

  for (const file of candidates) {
    if (!ledgers.some((l) => isCoveredBy(file, l, scannedSets))) {
      uncovered.push(file);
    }
  }

  return directoryFindings(
    'coverage-uncovered-file',
    uncovered,
    (count) => `${count} versioned file(s) that no suite analyzes (false clean)`,
    'Add a suite that covers them or declare coverage.exemptGlobs with a reason'
  );
}

function analyzeDegradedFiles(
  input: CoverageAnalysisInput,
  ledgers: readonly CoverageLedger[],
  scannedSets: ReadonlyMap<string, ReadonlySet<string>>
): CoverageFinding[] {
  const candidates = getAuditableCandidates(input);
  const acknowledged = input.config.coverage?.acknowledgedDegradations ?? [];
  const degradedByPolicy = new Map<string, string[]>();

  for (const file of candidates) {
    if (ledgers.some((l) => isCoveredBy(file, l, scannedSets))) {
      recordDegradedPolicyViolations(file, input.config, acknowledged, degradedByPolicy);
    }
  }

  return buildDegradedPolicyFindings(degradedByPolicy, input.config);
}

function analyzeDeclaredNotScanned(
  input: CoverageAnalysisInput,
  ledgers: readonly CoverageLedger[],
  scannedSets: ReadonlyMap<string, ReadonlySet<string>>
): CoverageFinding[] {
  const findings: CoverageFinding[] = [];
  const candidates = getAuditableCandidates(input);

  for (const ledger of ledgers) {
    if (ledger.skipped || ledger.source !== 'runtime') continue;
    const scanned = scannedSets.get(ledger.suiteId)!;
    const notScanned = candidates.filter(
      (f) => !scanned.has(f) && isDeclaredByCoverage(f, ledger.declared)
    );
    findings.push(
      ...directoryFindings(
        'coverage-declared-not-scanned',
        notScanned,
        (count) => `[${ledger.suiteId}] declares ${count} file(s) that were never scanned`,
        `${ledger.suiteId}: align coverage.include/exclude with files actually analyzed`
      )
    );
  }
  return findings;
}

function analyzeScannedNotDeclared(
  input: CoverageAnalysisInput,
  ledgers: readonly CoverageLedger[],
  scannedSets: ReadonlyMap<string, ReadonlySet<string>>
): CoverageFinding[] {
  const findings: CoverageFinding[] = [];
  const tracked = new Set(input.trackedFiles);
  for (const ledger of ledgers) {
    if (ledger.skipped || ledger.source !== 'runtime') continue;
    const scanned = scannedSets.get(ledger.suiteId)!;
    const undeclared = [...scanned].filter(
      (f) => tracked.has(f) && !isDeclaredByCoverage(f, ledger.declared)
    );
    findings.push(
      ...directoryFindings(
        'coverage-scanned-undeclared',
        undeclared,
        (count) => `[${ledger.suiteId}] scanned ${count} file(s) outside its declaration`,
        `${ledger.suiteId}: expand coverage.include or stop scanning them`
      )
    );
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
        message: `[${ledger.suiteId}] rule '${ruleId}' was evaluated 0 times: its clean result is not reliable (broken activation condition or uninstrumented)`,
        context: `${ledger.suiteId}/${ruleId}`
      });
    }
  }
  return findings;
}

function analyzeInvalidExemptions(input: CoverageAnalysisInput): CoverageFinding[] {
  const findings: CoverageFinding[] = [];
  const configFile = AUDIT_CONFIG_FILE;
  for (const exemption of input.config.coverage?.exemptGlobs ?? []) {
    if (!input.trackedFiles.some((f) => path.posix.matchesGlob(f, exemption.glob))) {
      findings.push({
        ruleId: 'coverage-invalid-exemption',
        file: configFile,
        message: `coverage.exemptGlobs '${exemption.glob}' does not match any tracked file (dead exemption)`,
        context: exemption.glob
      });
    }
  }
  for (const ack of input.config.coverage?.acknowledgedDegradations ?? []) {
    const used = input.trackedFiles.some(
      (f) =>
        path.posix.matchesGlob(f, ack.glob) &&
        getMatchingExemptionPolicies(f, input.config).some((p) => p.id === ack.policy)
    );
    if (!used) {
      findings.push({
        ruleId: 'coverage-invalid-exemption',
        file: configFile,
        message: `coverage.acknowledgedDegradations '${ack.glob}' (policy '${ack.policy}') does not acknowledge any degraded file (dead exemption)`,
        context: `${ack.policy}:${ack.glob}`
      });
    }
  }
  return findings;
}

function analyzeMissingLedgers(
  input: CoverageAnalysisInput,
  ledgers: readonly CoverageLedger[]
): CoverageFinding[] {
  const findings: CoverageFinding[] = [];
  const ledgerIds = new Set(ledgers.map((l) => l.suiteId));
  for (const suiteId of input.expectedSuites) {
    if (!ledgerIds.has(suiteId)) {
      findings.push({
        ruleId: 'coverage-missing-ledger',
        file: '',
        message:
          `Suite '${suiteId}' was planned but its subprocess terminated without emitting its ledger at scratch/audits/coverage/${suiteId}.json ` +
          `(aborted with error, uncaught exception, or ESM cycle failure). Run 'npm run auditor suite=${suiteId}' to inspect direct trace.`,
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
  const ledgers = input.ledgers.filter((l) => l.suiteId !== AUDIT_COVERAGE_SUITE_ID);
  const scannedSets = new Map(ledgers.map((l) => [l.suiteId, new Set(l.scanned)] as const));
  return [
    ...analyzeUncoveredFiles(input, ledgers, scannedSets),
    ...analyzeDegradedFiles(input, ledgers, scannedSets),
    ...analyzeDeclaredNotScanned(input, ledgers, scannedSets),
    ...analyzeScannedNotDeclared(input, ledgers, scannedSets),
    ...analyzeDormantRules(ledgers),
    ...analyzeInvalidExemptions(input),
    ...analyzeMissingLedgers(input, ledgers)
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
    .filter((f) => f.length > 0 && nodeFs.existsSync(path.join(projectRoot, f)));
}

export class AuditCoverageAuditor extends BaseAuditor<AuditCoverageRuleId> {
  public constructor(options: { projectRoot?: string } = {}) {
    super({
      ruleFixers: {},
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(AUDIT_COVERAGE_RULES, {
        speed: 'light',
        phase: 'post-run',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: AUDIT_COVERAGE_SUITE_ID,
      name: 'Audit Coverage & Blind Spots',
      description: 'Detects coverage blind spots: files, rules, and exemptions',
      family: 'architecture',
      packageName: 'Coverage',
      configKey: 'coverage.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '🗺️',
      ruleIds: AUDIT_COVERAGE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(AUDIT_COVERAGE_RULES, 'polish'),
      ruleDescriptions: {
        'coverage-uncovered-file': 'Tracked file without any suite coverage',
        'coverage-degraded-file': 'Rules silenced by configuration',
        'coverage-declared-not-scanned': 'Declared but not scanned',
        'coverage-scanned-undeclared': 'Scanned outside declared paths',
        'coverage-dormant-rule': 'Dormant rule: 0 evaluations',
        'coverage-invalid-exemption': 'Exemption without matching files',
        'coverage-missing-ledger': 'Suite missing coverage ledger'
      },
      ruleRemediations: {
        'coverage-uncovered-file':
          '📖 REMEDIATION GUIDE: coverage-uncovered-file\n' +
          '1. Root Cause: A versioned file is not covered by any active auditor suite (false clean).\n' +
          '2. Diagnosis: Identify the uncovered file reported in the audit findings.\n' +
          '3. Canonical Solution:\n' +
          '   a) Associate the file with the `include` glob of the corresponding suite or widen scanning roots.\n' +
          '   b) If a generated artifact or test fixture, add to `.gitignore` or configure `coverage.exemptGlobs` with reason in `.auditor/audit.config.ts`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'coverage-degraded-file':
          '📖 REMEDIATION GUIDE: coverage-degraded-file\n' +
          '1. Root Cause: A file has audit or linter rules silenced via unacknowledged exemptions or overrides.\n' +
          '2. Diagnosis: Locate the silenced rule and corresponding override file.\n' +
          '3. Canonical Solution:\n' +
          '   a) Remove the exemption and fix underlying source code to satisfy hygiene standards.\n' +
          '   b) If legitimately authorized, document in `coverage.acknowledgedDegradations` in `.auditor/audit.config.ts`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'coverage-declared-not-scanned':
          '📖 REMEDIATION GUIDE: coverage-declared-not-scanned\n' +
          '1. Root Cause: A suite declared in its `coverage.include` that it would analyze this file, but during the run never scanned it.\n' +
          '2. Diagnosis: Compare the suite declared coverage patterns against files actually scanned.\n' +
          '3. Canonical Solution:\n' +
          '   a) Adjust the suite `coverage.include` / `exclude` declaration to match files actually processed.\n' +
          '   b) If skipped due to premature return, fix scanning logic so all declared files are processed.\n' +
          '4. Example / Auto-fix command:\n' +
          '   Align suite coverage declaration with actual scans.',
        'coverage-scanned-undeclared':
          '📖 REMEDIATION GUIDE: coverage-scanned-undeclared\n' +
          '1. Root Cause: A suite scanned a file that was not part of its declared `coverage.include`.\n' +
          '2. Diagnosis: Inspect the file scanned by the suite outside its declaration.\n' +
          '3. Canonical Solution:\n' +
          '   a) Add the file glob to the suite `coverage.include` declaration.\n' +
          '   b) Or exclude the file from internal scans if it belongs to another architectural family.\n' +
          '4. Example / Auto-fix command:\n' +
          '   Update suite `coverage.include` to declare the file.',
        'coverage-dormant-rule':
          '📖 REMEDIATION GUIDE: coverage-dormant-rule\n' +
          '1. Root Cause: A rule was declared by a suite but evaluated 0 times during the entire audit run (dormant verification hazard).\n' +
          '2. Diagnosis: Identify which rule was never evaluated by the suite.\n' +
          '3. Canonical Solution:\n' +
          '   a) Instrument the rule using `this.runSubAuditorSync(ruleId, () => ...)` or `this.markRuleEvaluated(ruleId)`.\n' +
          '   b) If not applicable to this project, mark explicitly with `this.markRuleNotApplicable(ruleId, "Reason")`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   Mark rule evaluated or explicitly not applicable.',
        'coverage-invalid-exemption':
          '📖 REMEDIATION GUIDE: coverage-invalid-exemption\n' +
          '1. Root Cause: An exemption in `coverage.exemptGlobs` or `coverage.acknowledgedDegradations` in `.auditor/audit.config.ts` no longer matches any files in the repository.\n' +
          '2. Diagnosis: Check configured exempt globs against files on disk.\n' +
          '3. Canonical Solution: Remove stale exemptions from `.auditor/audit.config.ts`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   Remove dead exemption from `.auditor/audit.config.ts`.',
        'coverage-missing-ledger':
          '📖 REMEDIATION GUIDE: coverage-missing-ledger\n' +
          '1. Root Cause: A suite was scheduled and executed by the runner, but finished without writing its ledger to `scratch/audits/coverage/<suiteId>.json`.\n' +
          '2. Diagnosis: Run the suite in isolation to observe console error output.\n' +
          '3. Canonical Solution:\n' +
          '   a) Run `npm run auditor suite=<suiteName>` in isolation.\n' +
          '   b) Inspect stack trace for unhandled rejections or top-level await deadlocks.\n' +
          '   c) Ensure the suite subclasses `BaseAuditor` or `FileScanAuditor` and terminates with `await BaseAuditor.runCliIfMain(...)`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor suite=<suiteId>`'
      },
      coverage: { include: [AUDIT_CONFIG_FILE] },
      projectRoot: options.projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const config = getAuditConfig(this.projectRoot);
    const runId = resolveActiveCoverageRunId();
    if (config.coverage?.enabled === false) {
      this.markSkipped('Coverage explicitly disabled (coverage.enabled: false)');
      return;
    }
    if (!runId || process.env[COVERAGE_RUN_MODE_ENV] !== 'full') {
      this.markSkipped("Requires full audit run ('npm run auditor') to verify coverage");
      return;
    }

    const configPath = path.join(this.projectRoot, AUDIT_CONFIG_FILE);
    if (nodeFs.existsSync(configPath)) this.recordScanned(configPath);

    const expectedSuites = (process.env[COVERAGE_EXPECTED_SUITES_ENV] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s !== AUDIT_COVERAGE_SUITE_ID);

    const trackedFiles = listTrackedFiles(this.projectRoot);
    const rawLedgers = await readCoverageLedgers(this.projectRoot, runId);
    const ledgers = rawLedgers.filter((l) => l.suiteId !== AUDIT_COVERAGE_SUITE_ID);
    const scannedSets = new Map(ledgers.map((l) => [l.suiteId, new Set(l.scanned)] as const));
    const customExemptGlobs = (config.coverage?.exemptGlobs ?? []).map((e) => e.glob);
    const auditableFiles = trackedFiles.filter(
      (f) => !isPathIgnored(f) && isAuditableCodebaseFile(f, customExemptGlobs)
    );
    const input: CoverageAnalysisInput = {
      trackedFiles,
      auditableFiles,
      ledgers: rawLedgers,
      expectedSuites,
      config,
      isGloballyIgnored: (rel) => isPathIgnored(rel)
    };

    const findings: CoverageFinding[] = [];

    this.runSubAuditorSync('coverage-uncovered-file', () => {
      findings.push(...analyzeUncoveredFiles(input, ledgers, scannedSets));
    });

    this.runSubAuditorSync('coverage-degraded-file', () => {
      findings.push(...analyzeDegradedFiles(input, ledgers, scannedSets));
    });

    this.runSubAuditorSync('coverage-declared-not-scanned', () => {
      findings.push(...analyzeDeclaredNotScanned(input, ledgers, scannedSets));
    });

    this.runSubAuditorSync('coverage-scanned-undeclared', () => {
      findings.push(...analyzeScannedNotDeclared(input, ledgers, scannedSets));
    });

    this.runSubAuditorSync('coverage-dormant-rule', () => {
      findings.push(...analyzeDormantRules(ledgers));
    });

    this.runSubAuditorSync('coverage-invalid-exemption', () => {
      findings.push(...analyzeInvalidExemptions(input));
    });

    this.runSubAuditorSync('coverage-missing-ledger', () => {
      findings.push(...analyzeMissingLedgers(input, ledgers));
    });

    for (const finding of findings) {
      this.addViolation({ ...finding, severity: 'error', line: 1 });
    }
    this.context.setMetric('Ledgers', expectedSuites.length);
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new AuditCoverageAuditor());
