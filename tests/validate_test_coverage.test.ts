/**
 * @file validate_test_coverage.test.ts
 * @description Unit tests for ValidateTestCoverageAuditor.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { ValidateTestCoverageAuditor } from '../src/suites/architecture/validate_test_coverage.ts';
import { resetAuditConfig, setAuditConfig, defineAuditConfig } from '../src/core/auditConfig.ts';

describe('ValidateTestCoverageAuditor', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-test-cov-suite-'));
    process.chdir(tmpDir);
    resetAuditConfig();
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    process.chdir(originalCwd);
    resetAuditConfig();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Rule Declarations & Metadata', () => {
    it('initializes with correct metadata and rules', () => {
      const auditor = new ValidateTestCoverageAuditor({ projectRoot: tmpDir });
      expect(auditor.id).toBe('validate_test_coverage');
      expect(auditor.packageName).toBe('Cobertura');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds.length).toBeGreaterThan(0);
      expect(auditor.ruleDescriptions).toBeDefined();
    });
  });

  it('passes cleanly when enforceInAudit is false (clean path verification)', async () => {
    setAuditConfig(
      defineAuditConfig({
        name: 'test-app',
        testCoverage: {
          enabled: true,
          enforceInAudit: false
        },
        persistence: { engine: 'none' },
        bundle: { enabled: false },
        packageDistribution: { enabled: false },
        styles: { zLayersEnabled: false },
        templates: { requireInputIds: false },
        agentPlugin: { enabled: false }
      }),
      tmpDir
    );

    const auditor = new ValidateTestCoverageAuditor({ projectRoot: tmpDir });
    await auditor.runAudit();
    const result = await auditor.finishAudit();

    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
    expect(result.status).toBe('skipped');
  });

  it('passes cleanly when coverage meets threshold and no untracked files (clean path verification)', async () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'a.ts'), 'export const a = 1;');

    const covDir = path.join(tmpDir, 'coverage');
    fs.mkdirSync(covDir, { recursive: true });
    const coverageJson = {
      [path.join(srcDir, 'a.ts')]: {
        statements: { total: 10, covered: 10, pct: 100 },
        branches: { total: 2, covered: 2, pct: 100 },
        functions: { total: 2, covered: 2, pct: 100 },
        lines: { total: 10, covered: 10, pct: 100 }
      }
    };
    fs.writeFileSync(path.join(covDir, 'coverage-final.json'), JSON.stringify(coverageJson));

    setAuditConfig(
      defineAuditConfig({
        name: 'test-app',
        paths: { srcRoots: ['src'], codeRoots: ['src'] },
        testCoverage: {
          enabled: true,
          threshold: 80,
          enforceInAudit: true,
          roots: ['src']
        },
        persistence: { engine: 'none' },
        bundle: { enabled: false },
        packageDistribution: { enabled: false },
        styles: { zLayersEnabled: false },
        templates: { requireInputIds: false },
        agentPlugin: { enabled: false }
      }),
      tmpDir
    );

    const auditor = new ValidateTestCoverageAuditor({ projectRoot: tmpDir });
    await auditor.runAudit();
    const result = await auditor.finishAudit();

    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('reports an error when coverage file is missing and enforceInAudit is true', async () => {
    setAuditConfig(
      defineAuditConfig({
        name: 'test-app',
        testCoverage: {
          enabled: true,
          enforceInAudit: true
        },
        persistence: { engine: 'none' },
        bundle: { enabled: false },
        packageDistribution: { enabled: false },
        styles: { zLayersEnabled: false },
        templates: { requireInputIds: false },
        agentPlugin: { enabled: false }
      }),
      tmpDir
    );

    const auditor = new ValidateTestCoverageAuditor({ projectRoot: tmpDir });
    await auditor.runAudit();
    const result = await auditor.finishAudit();

    expect(result.summary.errors).toBe(1);
    expect(result.findings[0]?.ruleId).toBe('test-coverage-missing-report');
    expect(result.status).toBe('failed');
  });

  it('reports an error when coverage is below threshold', async () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'a.ts'), 'export const a = 1;');

    const covDir = path.join(tmpDir, 'coverage');
    fs.mkdirSync(covDir, { recursive: true });
    const coverageJson = {
      [path.join(srcDir, 'a.ts')]: {
        statements: { total: 10, covered: 5, pct: 50 },
        branches: { total: 2, covered: 1, pct: 50 },
        functions: { total: 2, covered: 1, pct: 50 },
        lines: { total: 10, covered: 5, pct: 50 }
      }
    };
    fs.writeFileSync(path.join(covDir, 'coverage-final.json'), JSON.stringify(coverageJson));

    setAuditConfig(
      defineAuditConfig({
        name: 'test-app',
        paths: { srcRoots: ['src'], codeRoots: ['src'] },
        testCoverage: {
          enabled: true,
          threshold: 80,
          enforceInAudit: true,
          roots: ['src']
        },
        persistence: { engine: 'none' },
        bundle: { enabled: false },
        packageDistribution: { enabled: false },
        styles: { zLayersEnabled: false },
        templates: { requireInputIds: false },
        agentPlugin: { enabled: false }
      }),
      tmpDir
    );

    const auditor = new ValidateTestCoverageAuditor({ projectRoot: tmpDir });
    await auditor.runAudit();
    const result = await auditor.finishAudit();

    expect(result.summary.errors).toBe(1);
    expect(result.findings[0]?.ruleId).toBe('test-coverage-below-threshold');
    expect(result.status).toBe('failed');
  });

  it('reports a warning when untracked files are detected in disk', async () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'a.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(srcDir, 'untracked.ts'), 'export const b = 2;');

    const covDir = path.join(tmpDir, 'coverage');
    fs.mkdirSync(covDir, { recursive: true });
    const coverageJson = {
      [path.join(srcDir, 'a.ts')]: {
        statements: { total: 10, covered: 10, pct: 100 },
        branches: { total: 2, covered: 2, pct: 100 },
        functions: { total: 2, covered: 2, pct: 100 },
        lines: { total: 10, covered: 10, pct: 100 }
      }
    };
    fs.writeFileSync(path.join(covDir, 'coverage-final.json'), JSON.stringify(coverageJson));

    setAuditConfig(
      defineAuditConfig({
        name: 'test-app',
        paths: { srcRoots: ['src'], codeRoots: ['src'] },
        testCoverage: {
          enabled: true,
          threshold: 80,
          enforceInAudit: true,
          roots: ['src']
        },
        persistence: { engine: 'none' },
        bundle: { enabled: false },
        packageDistribution: { enabled: false },
        styles: { zLayersEnabled: false },
        templates: { requireInputIds: false },
        agentPlugin: { enabled: false }
      }),
      tmpDir
    );

    const auditor = new ValidateTestCoverageAuditor({ projectRoot: tmpDir });
    await auditor.runAudit();
    const result = await auditor.finishAudit();

    expect(result.summary.warnings).toBe(1);
    const untrackedFinding = result.findings.find(f => f.ruleId === 'test-coverage-untracked-files');
    expect(untrackedFinding).toBeDefined();
    expect(result.status).toBe('passed');
  });

  it('skips cleanly with zero errors when AUDITOR_ENV=production even if coverage file is missing', async () => {
    process.env.AUDITOR_ENV = 'production';

    setAuditConfig(
      defineAuditConfig({
        name: 'test-app',
        paths: { srcRoots: ['src'] },
        testCoverage: {
          enabled: true,
          threshold: 80,
          enforceInAudit: true
        },
        persistence: { engine: 'none' },
        bundle: { enabled: false },
        packageDistribution: { enabled: false },
        styles: { zLayersEnabled: false },
        templates: { requireInputIds: false },
        agentPlugin: { enabled: false }
      }),
      tmpDir
    );

    const auditor = new ValidateTestCoverageAuditor({ projectRoot: tmpDir });
    await auditor.runAudit();
    const result = await auditor.finishAudit();

    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
    expect(result.status).toBe('skipped');

    delete process.env.AUDITOR_ENV;
  });
});
