/**
 * tests/validate_audit_coverage.test.ts
 *
 * Unit tests and hermetic verification for validate_audit_coverage suite.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  AuditCoverageAuditor,
  analyzeAuditCoverage,
  type CoverageAnalysisInput
} from '../src/suites/architecture/validate_audit_coverage.ts';
import { COVERAGE_RUN_ID_ENV, COVERAGE_RUN_MODE_ENV, COVERAGE_EXPECTED_SUITES_ENV, type CoverageLedger } from '../src/core/auditCoverage.ts';
import { defineAuditConfig, type AuditEngineConfig } from '../src/core/auditConfig.ts';

describe('validate_audit_coverage Suite', () => {
  let tempDir: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-cov-test-'));
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const baseConfig: AuditEngineConfig = defineAuditConfig({
    name: 'test-app',
    paths: {
      codeRoots: ['src'],
      testRoots: ['tests'],
      cliRoots: ['src/cli']
    },
    coverage: {
      enabled: true,
      exemptGlobs: [],
      acknowledgedDegradations: []
    }
  });

  describe('analyzeAuditCoverage (pure analysis)', () => {
    it('detects uncovered files that no suite scans', () => {
      const ledgers: CoverageLedger[] = [
        {
          runId: 'run-1',
          suiteId: 'suite-a',
          skipped: false,
          declared: { include: ['src/**/*.ts'], source: 'runtime' },
          source: 'runtime',
          scanned: ['src/covered.ts'],
          ruleIds: ['rule-1'],
          ruleEvaluations: { 'rule-1': 1 },
          notApplicable: {}
        }
      ];

      const input: CoverageAnalysisInput = {
        trackedFiles: ['src/covered.ts', 'src/orphan.ts'],
        ledgers,
        expectedSuites: ['suite-a'],
        config: baseConfig,
        isGloballyIgnored: () => false
      };

      const findings = analyzeAuditCoverage(input);
      const uncovered = findings.filter(f => f.ruleId === 'coverage-uncovered-file');
      expect(uncovered.length).toBe(1);
      expect(uncovered[0]!.message).toContain('orphan.ts');
    });

    it('detects dormant rules with 0 evaluations when not marked notApplicable', () => {
      const ledgers: CoverageLedger[] = [
        {
          runId: 'run-1',
          suiteId: 'suite-magic',
          skipped: false,
          declared: { include: ['src/**/*.ts'], source: 'runtime' },
          source: 'runtime',
          scanned: ['src/file.ts'],
          ruleIds: ['magicNumbers', 'legacyDates'],
          ruleEvaluations: { magicNumbers: 0, legacyDates: 1 },
          notApplicable: {}
        }
      ];

      const input: CoverageAnalysisInput = {
        trackedFiles: ['src/file.ts'],
        ledgers,
        expectedSuites: ['suite-magic'],
        config: baseConfig,
        isGloballyIgnored: () => false
      };

      const findings = analyzeAuditCoverage(input);
      const dormant = findings.filter(f => f.ruleId === 'coverage-dormant-rule');
      expect(dormant.length).toBe(1);
      expect(dormant[0]!.context).toBe('suite-magic/magicNumbers');
    });

    it('accepts rules with 0 evaluations if explicitly marked notApplicable', () => {
      const ledgers: CoverageLedger[] = [
        {
          runId: 'run-1',
          suiteId: 'suite-vue',
          skipped: false,
          declared: { include: ['src/**/*.vue'], source: 'runtime' },
          source: 'runtime',
          scanned: [],
          ruleIds: ['vue-rule'],
          ruleEvaluations: { 'vue-rule': 0 },
          notApplicable: { 'vue-rule': 'No .vue files in project' }
        }
      ];

      const input: CoverageAnalysisInput = {
        trackedFiles: [],
        ledgers,
        expectedSuites: ['suite-vue'],
        config: baseConfig,
        isGloballyIgnored: () => false
      };

      const findings = analyzeAuditCoverage(input);
      const dormant = findings.filter(f => f.ruleId === 'coverage-dormant-rule');
      expect(dormant.length).toBe(0);
    });

    it('detects degraded files where policies silence rules without config acknowledgment (coverage-degraded-file)', () => {
      const configWithCli = defineAuditConfig({
        name: 'test-app',
        paths: {
          codeRoots: ['src'],
          testRoots: ['tests'],
          cliRoots: ['src/cli']
        },
        coverage: {
          enabled: true,
          exemptGlobs: [],
          acknowledgedDegradations: []
        }
      });

      const ledgers: CoverageLedger[] = [
        {
          runId: 'run-1',
          suiteId: 'suite-cli',
          skipped: false,
          declared: { include: ['src/cli/**/*.ts'], source: 'runtime' },
          source: 'runtime',
          scanned: ['src/cli/tool.ts'],
          ruleIds: ['rule-1'],
          ruleEvaluations: { 'rule-1': 1 },
          notApplicable: {}
        }
      ];

      const input: CoverageAnalysisInput = {
        trackedFiles: ['src/cli/tool.ts'],
        ledgers,
        expectedSuites: ['suite-cli'],
        config: configWithCli,
        isGloballyIgnored: () => false
      };

      const findings = analyzeAuditCoverage(input);
      const degraded = findings.filter(f => f.ruleId === 'coverage-degraded-file');
      expect(degraded.length).toBeGreaterThan(0);
    });

    it('detects declared files that were not scanned (coverage-declared-not-scanned)', () => {
      const ledgers: CoverageLedger[] = [
        {
          runId: 'run-1',
          suiteId: 'suite-drift',
          skipped: false,
          declared: { include: ['src/**/*.ts'], source: 'runtime' },
          source: 'runtime',
          scanned: ['src/file1.ts'],
          ruleIds: ['rule-1'],
          ruleEvaluations: { 'rule-1': 1 },
          notApplicable: {}
        }
      ];

      const input: CoverageAnalysisInput = {
        trackedFiles: ['src/file1.ts', 'src/file2.ts'],
        ledgers,
        expectedSuites: ['suite-drift'],
        config: baseConfig,
        isGloballyIgnored: () => false
      };

      const findings = analyzeAuditCoverage(input);
      const notScanned = findings.filter(f => f.ruleId === 'coverage-declared-not-scanned');
      expect(notScanned.length).toBe(1);
    });

    it('detects scanned files outside of declared coverage (coverage-scanned-undeclared)', () => {
      const ledgers: CoverageLedger[] = [
        {
          runId: 'run-1',
          suiteId: 'suite-undeclared',
          skipped: false,
          declared: { include: ['src/core/**/*.ts'], source: 'runtime' },
          source: 'runtime',
          scanned: ['src/other/rogue.ts'],
          ruleIds: ['rule-1'],
          ruleEvaluations: { 'rule-1': 1 },
          notApplicable: {}
        }
      ];

      const input: CoverageAnalysisInput = {
        trackedFiles: ['src/other/rogue.ts'],
        ledgers,
        expectedSuites: ['suite-undeclared'],
        config: baseConfig,
        isGloballyIgnored: () => false
      };

      const findings = analyzeAuditCoverage(input);
      const undeclared = findings.filter(f => f.ruleId === 'coverage-scanned-undeclared');
      expect(undeclared.length).toBe(1);
    });

    it('detects missing ledgers for expected suites that failed to write one (coverage-missing-ledger)', () => {
      const input: CoverageAnalysisInput = {
        trackedFiles: ['src/file.ts'],
        ledgers: [],
        expectedSuites: ['suite-expected'],
        config: baseConfig,
        isGloballyIgnored: () => false
      };

      const findings = analyzeAuditCoverage(input);
      const missing = findings.filter(f => f.ruleId === 'coverage-missing-ledger');
      expect(missing.length).toBe(1);
      expect(missing[0]!.context).toBe('suite-expected');
    });

    it('detects dead exemptions that match no tracked files', () => {
      const config: AuditEngineConfig = {
        ...baseConfig,
        coverage: {
          enabled: true,
          exemptGlobs: [{ glob: 'legacy/**/*.ts', reason: 'Archivos heredados de version previa' }],
          acknowledgedDegradations: []
        }
      };

      const input: CoverageAnalysisInput = {
        trackedFiles: ['src/file.ts'],
        ledgers: [
          {
            runId: 'run-1',
            suiteId: 'suite-1',
            skipped: false,
            declared: { include: ['src/**/*.ts'], source: 'runtime' },
            source: 'runtime',
            scanned: ['src/file.ts'],
            ruleIds: ['rule-1'],
            ruleEvaluations: { 'rule-1': 1 },
            notApplicable: {}
          }
        ],
        expectedSuites: ['suite-1'],
        config,
        isGloballyIgnored: () => false
      };

      const findings = analyzeAuditCoverage(input);
      const invalid = findings.filter(f => f.ruleId === 'coverage-invalid-exemption');
      expect(invalid.length).toBe(1);
      expect(invalid[0]!.context).toBe('legacy/**/*.ts');
    });

    it('Clean Path Verification: passes with 0 findings when all files covered and rules evaluated', () => {
      const ledgers: CoverageLedger[] = [
        {
          runId: 'run-1',
          suiteId: 'suite-main',
          skipped: false,
          declared: { include: ['src/**/*.ts'], source: 'runtime' },
          source: 'runtime',
          scanned: ['src/app.ts', 'src/util.ts'],
          ruleIds: ['rule-a', 'rule-b'],
          ruleEvaluations: { 'rule-a': 2, 'rule-b': 1 },
          notApplicable: {}
        }
      ];

      const input: CoverageAnalysisInput = {
        trackedFiles: ['src/app.ts', 'src/util.ts'],
        ledgers,
        expectedSuites: ['suite-main'],
        config: baseConfig,
        isGloballyIgnored: () => false
      };

      const findings = analyzeAuditCoverage(input);
      expect(findings.length).toBe(0);
    });
  });

  describe('AuditCoverageAuditor Runner in Hermetic Sandbox', () => {
    it('skips gracefully when not in full run mode', async () => {
      process.env[COVERAGE_RUN_ID_ENV] = 'test-run';
      process.env[COVERAGE_RUN_MODE_ENV] = 'preset';

      const auditor = new AuditCoverageAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.status).toBe('skipped');
      expect(result.findings?.length).toBe(0);
    });

    it('skips gracefully when coverage is explicitly disabled in config', async () => {
      process.env[COVERAGE_RUN_ID_ENV] = 'test-run';
      process.env[COVERAGE_RUN_MODE_ENV] = 'full';

      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.auditor', 'audit.config.ts'),
        'export default { coverage: { enabled: false } };',
        'utf-8'
      );

      const auditor = new AuditCoverageAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.status).toBe('skipped');
    });

    it('passes cleanly with zero errors when full run has matching ledgers', async () => {
      const runId = 'test-hermetic-run';
      process.env[COVERAGE_RUN_ID_ENV] = runId;
      process.env[COVERAGE_RUN_MODE_ENV] = 'full';
      process.env[COVERAGE_EXPECTED_SUITES_ENV] = 'suite-demo';

      const coverageDir = path.join(tempDir, 'scratch/audits/coverage');
      await fs.mkdir(coverageDir, { recursive: true });

      const ledger: CoverageLedger = {
        runId,
        suiteId: 'suite-demo',
        skipped: false,
        declared: { include: ['.auditor/audit.config.ts'], source: 'runtime' },
        source: 'runtime',
        scanned: ['.auditor/audit.config.ts'],
        ruleIds: ['demo-rule'],
        ruleEvaluations: { 'demo-rule': 1 },
        notApplicable: {}
      };
      await fs.writeFile(path.join(coverageDir, 'suite-demo.json'), JSON.stringify(ledger), 'utf-8');
      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), 'export default { coverage: { enabled: true } };', 'utf-8');

      // Initialize git repo in sandbox so listTrackedFiles succeeds
      const { execFileSync } = await import('node:child_process');
      execFileSync('git', ['init'], { cwd: tempDir });
      execFileSync('git', ['config', 'user.name', 'Auditor Test'], { cwd: tempDir });
      execFileSync('git', ['config', 'user.email', 'test@auditor.local'], { cwd: tempDir });
      execFileSync('git', ['add', '.auditor/audit.config.ts'], { cwd: tempDir });
      execFileSync('git', ['commit', '-m', 'initial'], { cwd: tempDir });

      const auditor = new AuditCoverageAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.status).toBe('passed');
      expect(result.summary.errors).toBe(0);
    });
  });
});
