/**
 * tests/audit_coverage_core.test.ts
 *
 * Unit tests for the blind-spot detection core:
 * - coverage declaration validation and FileScanAuditor derivation
 * - CoverageRecorder telemetry (scanned files, rule evaluations, non-applicable rules)
 * - ledger persistence gated by AUDIT_COVERAGE_RUN_ID
 * - coverage config anti-abuse validation
 * - exemption policy registry
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { BaseAuditor, FileScanAuditor } from '../src/core/auditorBase.ts';
import {
  COVERAGE_RUN_ID_ENV,
  CoverageRecorder,
  deriveCoverageFromRoots,
  isDeclaredByCoverage,
  readCoverageLedgers,
  validateCoverageDeclaration
} from '../src/core/auditCoverage.ts';
import { defineAuditConfig } from '../src/core/auditConfig.ts';
import { EXEMPTION_POLICIES, getMatchingExemptionPolicies } from '../src/core/exemptionPolicies.ts';

const BASE_OPTIONS = {
  id: 'coverage_probe',
  name: 'Coverage Probe',
  description: 'Sonda de cobertura',
  family: 'architecture',
  packageName: 'Sonda',
  icon: '🧪',
  configKey: 'core',
  defaultConfig: {},
  capabilities: {
    fix: false,
    fixPriority: false,
    lint: false,
    md: false,
    ast: false,
    changedSince: false,
    heavy: false,
    requiresBuild: false,
    postRun: false
  }
} as const;

class ProbeAuditor extends BaseAuditor<'probe-rule'> {
  public override runAudit(): void {
    this.recordScanned('src/a.ts');
    this.markRuleEvaluated('probe-rule', 2);
  }
}

class ProbeFileScanAuditor extends FileScanAuditor<'probe-rule'> {
  protected override scanFile(relPath: string, content: string): void {
    if (content.includes('BAD')) {
      this.addViolation({ ruleId: 'probe-rule', severity: 'error', file: relPath, line: 1, message: 'bad', context: 'BAD' });
    }
  }
}

describe('coverage declaration', () => {
  it('fails loudly when a direct BaseAuditor subclass omits coverage', () => {
    expect(() => new ProbeAuditor({ ...BASE_OPTIONS, ruleIds: ['probe-rule'], ruleDescriptions: { 'probe-rule': 'Regla sonda' } }))
      .toThrow(/must declare 'coverage/);
  });

  it('rejects empty include, absolute and backslash globs, and unknown sources', () => {
    expect(() => validateCoverageDeclaration('x', { include: [] })).toThrow(/non-empty/);
    expect(() => validateCoverageDeclaration('x', { include: ['/abs/**'] })).toThrow(/invalid coverage glob/);
    expect(() => validateCoverageDeclaration('x', { include: ['src\\**'] })).toThrow(/invalid coverage glob/);
    expect(() => validateCoverageDeclaration('x', { include: ['src/**'], source: 'magic' as 'runtime' })).toThrow(/unknown coverage source/);
  });

  it('accepts a valid declaration (clean path)', () => {
    expect(() => validateCoverageDeclaration('x', { include: ['src/**/*.ts'], exclude: ['src/**/*.d.ts'] })).not.toThrow();
  });

  it('derives FileScanAuditor coverage from roots and extensions', () => {
    const decl = deriveCoverageFromRoots(['src', './tests/', '.'], new Set(['.ts']));
    expect(decl.include).toEqual(['src/**/*.ts', 'tests/**/*.ts', '**/*.ts']);
    expect(isDeclaredByCoverage('src/core/a.ts', decl)).toBe(true);
    expect(isDeclaredByCoverage('src/core/a.js', { include: ['src/**/*.ts'] })).toBe(false);
    expect(isDeclaredByCoverage('src/core/a.d.ts', { include: ['src/**/*.ts'], exclude: ['**/*.d.ts'] })).toBe(false);
  });
});

describe('CoverageRecorder', () => {
  it('records POSIX relative files, evaluations and justified non-applicable rules', () => {
    const root = path.resolve(os.tmpdir(), 'cov-root');
    const recorder = new CoverageRecorder(root, { include: ['**/*.ts'] });
    recorder.recordScanned(path.join(root, 'src', 'a.ts'));
    recorder.recordScanned('src/a.ts');
    recorder.markRuleEvaluated('r1');
    recorder.markRuleEvaluated('r1', 2);
    recorder.markRuleNotApplicable('r2', 'Sin archivos .vue en el proyecto');
    const ledger = recorder.toLedger({ runId: 'run', suiteId: 's', skipped: false, ruleIds: ['r1', 'r2', 'r3'] });
    expect(ledger.scanned).toEqual(['src/a.ts']);
    expect(ledger.ruleEvaluations).toEqual({ r1: 3, r2: 0, r3: 0 });
    expect(ledger.notApplicable).toEqual({ r2: 'Sin archivos .vue en el proyecto' });
    expect(() => recorder.markRuleNotApplicable('r3', ' ')).toThrow(/justification/);
  });

  it('only allows external scan counts for declared-only sources', () => {
    expect(() => new CoverageRecorder('.', { include: ['**/*.ts'] }).recordExternalScanCount(3)).toThrow(/declared-only/);
    const declaredOnly = new CoverageRecorder('.', { include: ['**/*.ts'], source: 'declared-only' });
    declaredOnly.recordExternalScanCount(3);
    expect(declaredOnly.scannedCount).toBe(3);
  });
});

describe('ledger persistence', () => {
  let tmpDir: string;
  const previousRunId = process.env[COVERAGE_RUN_ID_ENV];
  const previousSubprocess = process.env.AUDIT_SUBPROCESS;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-coverage-'));
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'ok.ts'), 'export const ok = 1;\n');
    await fs.writeFile(path.join(tmpDir, 'src', 'bad.ts'), 'export const BAD = 2;\n');
  });

  afterEach(async () => {
    if (previousRunId === undefined) delete process.env[COVERAGE_RUN_ID_ENV];
    else process.env[COVERAGE_RUN_ID_ENV] = previousRunId;
    if (previousSubprocess === undefined) delete process.env.AUDIT_SUBPROCESS;
    else process.env.AUDIT_SUBPROCESS = previousSubprocess;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('does not write ledgers outside an orchestrated run (clean path)', async () => {
    delete process.env[COVERAGE_RUN_ID_ENV];
    const auditor = new ProbeAuditor({
      ...BASE_OPTIONS,
      ruleIds: ['probe-rule'],
      ruleDescriptions: { 'probe-rule': 'Regla sonda' },
      coverage: { include: ['src/**/*.ts'] },
      projectRoot: tmpDir
    });
    await auditor.runAudit();
    const result = await auditor.finishAudit();
    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
    expect(await readCoverageLedgers(tmpDir, 'any')).toEqual([]);
  });

  it('writes the FileScanAuditor ledger with derived coverage and single-rule evaluations', async () => {
    process.env[COVERAGE_RUN_ID_ENV] = 'run-1';
    const auditor = new ProbeFileScanAuditor({
      ...BASE_OPTIONS,
      ruleIds: ['probe-rule'],
      ruleDescriptions: { 'probe-rule': 'Regla sonda' },
      roots: ['src'],
      allowedExtensions: new Set(['.ts']),
      projectRoot: tmpDir
    });
    await auditor.runAudit();
    const result = await auditor.finishAudit();
    expect(result.summary.errors).toBe(1);
    const [ledger] = await readCoverageLedgers(tmpDir, 'run-1');
    expect(ledger?.suiteId).toBe('coverage_probe');
    expect(ledger?.declared.include).toEqual(['src/**/*.ts']);
    expect(ledger?.scanned).toEqual(['src/bad.ts', 'src/ok.ts']);
    expect(ledger?.ruleEvaluations['probe-rule']).toBe(2);
    expect(await readCoverageLedgers(tmpDir, 'other-run')).toEqual([]);
  });
});

describe('coverage config anti-abuse', () => {
  const base = { name: 'probe', paths: { srcRoots: ['src'], codeRoots: ['src'], testRoots: ['tests'] } };
  const reason = 'Artefactos compilados verificados por audit:build';

  it('is active by default with no exemptions (clean path)', () => {
    const config = defineAuditConfig(base);
    expect(config.coverage).toEqual({ enabled: true, exemptGlobs: [], acknowledgedDegradations: [] });
  });

  it('accepts narrow, justified exemptions', () => {
    const config = defineAuditConfig({
      ...base,
      coverage: {
        exemptGlobs: [{ glob: 'dist/**', reason }],
        acknowledgedDegradations: [{ policy: 'cli', glob: 'src/cli/**', reason: 'Los entrypoints CLI imprimen en consola' }]
      }
    });
    expect(config.coverage?.exemptGlobs).toHaveLength(1);
    expect(config.coverage?.acknowledgedDegradations).toHaveLength(1);
  });

  it.each(['**', '**/*', '*', '**/*.ts', '*.*', 'src/**', 'src', 'tests/**/*.ts', '/abs/**'])(
    'rejects blanket glob %s',
    glob => {
      expect(() => defineAuditConfig({ ...base, coverage: { exemptGlobs: [{ glob, reason }] } })).toThrow(/Anti-Abuse/);
    }
  );

  it('rejects short reasons and unknown policies', () => {
    expect(() => defineAuditConfig({ ...base, coverage: { exemptGlobs: [{ glob: 'LICENSE', reason: 'corto' }] } })).toThrow(/reason/);
    expect(() => defineAuditConfig({
      ...base,
      coverage: { acknowledgedDegradations: [{ policy: 'test' as 'cli', glob: 'tests/x/**', reason }] }
    })).toThrow(/política desconocida/);
  });
});

describe('exemption policy registry', () => {
  it('classifies configured vs structural policies', () => {
    const kinds = Object.fromEntries(EXEMPTION_POLICIES.map(p => [p.id, p.kind]));
    expect(kinds).toMatchObject({ cli: 'configured', scripts: 'configured', test: 'structural' });
  });

  it('matches policies from configuration', () => {
    const config = defineAuditConfig({ name: 'probe', paths: { cliRoots: ['src/cli'], testRoots: ['tests'] } });
    expect(getMatchingExemptionPolicies('src/cli/run.ts', config).map(p => p.id)).toContain('cli');
    expect(getMatchingExemptionPolicies('src/core/run.ts', config).map(p => p.id)).not.toContain('cli');
  });
});
