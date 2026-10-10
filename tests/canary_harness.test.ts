/**
 * tests/canary_harness.test.ts
 *
 * CANARY HARNESS & BLIND-SPOT REGRESSION VERIFICATION (Hermetic Sandbox)
 * Verifies that:
 * 1. Intentional code canaries trigger their respective rules when scanned.
 * 2. Coverage engine records evaluation telemetry for active rules.
 * 3. Regression: A dormant rule with 0 evaluations is caught by validate_audit_coverage.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NativePathsAuditor } from '../src/suites/architecture/validate_native_paths.ts';
import { ErrorSuppressionAuditor } from '../src/suites/architecture/validate_error_suppression.ts';
import { AuditCoverageAuditor } from '../src/suites/architecture/validate_audit_coverage.ts';
import { legacyDates } from '../src/suites/architecture/audit_rules.ts';
import {
  COVERAGE_RUN_ID_ENV,
  COVERAGE_RUN_MODE_ENV,
  COVERAGE_EXPECTED_SUITES_ENV,
  type CoverageLedger
} from '../src/core/auditCoverage.ts';

describe('Canary Harness & Blind-Spot Regression (Hermetic Sandbox)', () => {
  let sandboxDir: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as unknown as typeof process.exit);
    process.env.AUDIT_SUBPROCESS = 'true';

    sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-canary-'));
    await fs.mkdir(path.join(sandboxDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(sandboxDir, 'scripts'), { recursive: true });
    await fs.mkdir(path.join(sandboxDir, 'tests'), { recursive: true });

    await fs.mkdir(path.join(sandboxDir, '.auditor'), { recursive: true });
    await fs.writeFile(
      path.join(sandboxDir, '.auditor', 'audit.config.ts'),
      `export default {
        paths: {
          codeRoots: ['src', 'scripts'],
          testRoots: ['tests'],
          cliRoots: ['scripts']
        },
        coverage: { enabled: true }
      };`,
      'utf-8'
    );
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    await fs.rm(sandboxDir, { recursive: true, force: true });
  });

  it('Canary 1: unsafe-path-concat canary triggers violation and records evaluation', async () => {
    const canarySource = await fs.readFile(
      path.resolve(__dirname, 'canaries/validate_native_paths/unsafe-path-concat.ts.canary'),
      'utf-8'
    );
    const targetFile = path.join(sandboxDir, 'src/canary_path.ts');
    await fs.writeFile(targetFile, canarySource, 'utf-8');

    const runId = 'canary-run-native-paths';
    process.env[COVERAGE_RUN_ID_ENV] = runId;
    process.env[COVERAGE_RUN_MODE_ENV] = 'full';

    const auditor = new NativePathsAuditor(['src'], sandboxDir);
    const result = await auditor.execute();

    const pathFinding = (result.findings || []).find(f => f.ruleId === 'unsafe-path-concat');
    expect(pathFinding).toBeDefined();
    expect(pathFinding?.file).toContain('canary_path.ts');
    expect(result.summary.errors).toBeGreaterThan(0);
  });

  it('Canary 2: unjustified-error-suppression canary triggers violation and records evaluation', async () => {
    const canarySource = await fs.readFile(
      path.resolve(__dirname, 'canaries/validate_error_suppression/unjustified-error-suppression.ts.canary'),
      'utf-8'
    );
    const targetFile = path.join(sandboxDir, 'src/canary_catch.ts');
    await fs.writeFile(targetFile, canarySource, 'utf-8');

    const runId = 'canary-run-error-suppression';
    process.env[COVERAGE_RUN_ID_ENV] = runId;
    process.env[COVERAGE_RUN_MODE_ENV] = 'full';

    const auditor = new ErrorSuppressionAuditor(['src'], sandboxDir);
    const result = await auditor.execute();

    const catchFinding = (result.findings || []).find(f => f.ruleId === 'no-empty-catch');
    expect(catchFinding).toBeDefined();
    expect(catchFinding?.file).toContain('canary_catch.ts');
    expect(result.summary.errors).toBeGreaterThan(0);
  });

  it('Canary 3: audit_rules legacyDates canary triggers rule violations', async () => {
    const dateCanary = await fs.readFile(
      path.resolve(__dirname, 'canaries/audit_rules/legacyDates.ts.canary'),
      'utf-8'
    );

    legacyDates.regex.lastIndex = 0;
    expect(legacyDates.regex.test(dateCanary)).toBe(true);
  });

  it('Historical Regression Proof: Dormant rule with 0 evaluations fails validate_audit_coverage with severity error', async () => {
    const runId = 'dormant-regression-run';
    process.env[COVERAGE_RUN_ID_ENV] = runId;
    process.env[COVERAGE_RUN_MODE_ENV] = 'full';
    process.env[COVERAGE_EXPECTED_SUITES_ENV] = 'audit_project';

    const coverageDir = path.join(sandboxDir, 'scratch/audits/coverage');
    await fs.mkdir(coverageDir, { recursive: true });

    // Simulate broken activation condition: audit_project ran and scanned files,
    // but a broken gate caused hardcodedTimezone to evaluate 0 files (dormant rule).
    const brokenLedger: CoverageLedger = {
      runId,
      suiteId: 'audit_project',
      skipped: false,
      declared: { include: ['src/**/*.ts', '.auditor/audit.config.ts'], source: 'runtime' },
      source: 'runtime',
      scanned: ['src/app.ts', '.auditor/audit.config.ts'],
      ruleIds: ['hardcodedTimezone', 'legacyDates'],
      ruleEvaluations: {
        hardcodedTimezone: 0, // Broken gate! False clean!
        legacyDates: 5
      },
      notApplicable: {} // Not marked notApplicable!
    };

    await fs.writeFile(path.join(coverageDir, 'audit_project.json'), JSON.stringify(brokenLedger), 'utf-8');

    // Initialize git repository in sandbox
    const { execFileSync } = await import('node:child_process');
    execFileSync('git', ['init'], { cwd: sandboxDir });
    execFileSync('git', ['config', 'user.name', 'Auditor Test'], { cwd: sandboxDir });
    execFileSync('git', ['config', 'user.email', 'test@auditor.local'], { cwd: sandboxDir });
    await fs.writeFile(path.join(sandboxDir, 'src/app.ts'), 'export const clean = true;\n', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: sandboxDir });
    execFileSync('git', ['commit', '-m', 'sandbox files'], { cwd: sandboxDir });

    const coverageAuditor = new AuditCoverageAuditor({ projectRoot: sandboxDir });
    const coverageResult = await coverageAuditor.execute();

    // Must FAIL loudly with status: 'failed' and severity: 'error'
    expect(coverageResult.status).toBe('failed');
    expect(coverageResult.summary.errors).toBeGreaterThan(0);

    const dormantFinding = coverageResult.findings?.find(f => f.ruleId === 'coverage-dormant-rule');
    expect(dormantFinding).toBeDefined();
    expect(dormantFinding?.context).toBe('audit_project/hardcodedTimezone');
    expect(dormantFinding?.severity).toBe('error');
  });
});
