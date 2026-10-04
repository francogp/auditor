/**
 * tests/report_findings.test.ts
 *
 * Unit tests for report_findings CLI tool (filtering, sorting, and reporting views).
 * Uses hermetic mocks to avoid race conditions with parallel audit test workers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { runReport } from '../src/cli/report_findings.ts';
import type { ConsolidatedAuditReport } from '../src/core/auditContract.ts';

describe('report_findings CLI Tool', () => {
  let originalArgv: string[];
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let fsReadSpy: ReturnType<typeof vi.spyOn>;
  let fsExistsSpy: ReturnType<typeof vi.spyOn>;

  const originalExistsSync = fs.existsSync.bind(fs);
  const originalReadFileSync = fs.readFileSync.bind(fs);

  const mockReport: ConsolidatedAuditReport = {
    meta: {
      version: '3.3.3',
      timestamp: '2026-10-04T00:00:00.000Z',
      isFullAudit: true,
      runMode: 'full',
      preset: null,
      targetFamily: null,
      totalDiscoveredSuites: 40,
      executedSuiteCount: 40,
      executedSuites: ['validate_eslint'],
      omittedSuites: [],
      environment: { nodeVersion: 'v26.0.0', platform: 'win32', cwd: '/test' }
    },
    status: 'passed',
    summary: { totalViolations: 1, errors: 1, warnings: 0, suitesTotal: 1, suitesPassed: 1, suitesFailed: 0, durationMs: 15 },
    families: {
      architecture: {
        title: 'ESTÁNDARES ESTÁTICOS',
        suites: [
          {
            id: 'validate_eslint',
            name: 'ESLint',
            description: 'Reglas de ESLint',
            family: 'architecture',
            status: 'failed',
            durationMs: 15,
            metrics: {},
            findings: [
              {
                severity: 'error',
                message: 'Forbidden any typecast',
                file: 'src/utils/math.ts',
                line: 12,
                ruleId: 'no-explicit-any',
                ruleDescription: 'Sin tipos any',
                suiteId: 'validate_eslint',
                suiteName: 'ESLint'
              }
            ],
            summary: { errors: 1, warnings: 0, info: 0 }
          }
        ]
      }
    },
    allFindings: [
      {
        severity: 'error',
        message: 'Forbidden any typecast',
        file: 'src/utils/math.ts',
        line: 12,
        ruleId: 'no-explicit-any',
        ruleDescription: 'Sin tipos any',
        suiteId: 'validate_eslint',
        suiteName: 'ESLint'
      }
    ]
  };

  beforeEach(() => {
    originalArgv = [...process.argv];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    fsExistsSpy = vi.spyOn(fs, 'existsSync').mockImplementation((targetPath) => {
      if (String(targetPath).includes('latest_audit.json')) return true;
      return originalExistsSync(targetPath);
    });

    fsReadSpy = vi.spyOn(fs, 'readFileSync').mockImplementation((targetPath, options) => {
      if (String(targetPath).includes('latest_audit.json')) {
        return JSON.stringify({
          ...mockReport,
          meta: {
            ...mockReport.meta,
            timestamp: Temporal.Now.instant().toString()
          }
        });
      }
      return originalReadFileSync(targetPath, options);
    });
  });

  afterEach(() => {
    process.argv = originalArgv;
    fsExistsSpy.mockRestore();
    fsReadSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('runs cleanly in JSON mode when latest_audit.json exists', () => {
    process.argv = ['node', 'report_findings.ts', '--json', 'allow-stale'];

    expect(() => runReport()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();

    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('summary');
    expect(parsed).toHaveProperty('findings');
  });

  it('renders by-file view when requested', () => {
    process.argv = ['node', 'report_findings.ts', 'by-file', 'allow-stale'];

    expect(() => runReport()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('renders breakdown view by directory when requested', () => {
    process.argv = ['node', 'report_findings.ts', 'breakdown', 'allow-stale'];

    expect(() => runReport()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('renders files-only view when requested', () => {
    process.argv = ['node', 'report_findings.ts', 'files', 'allow-stale'];

    expect(() => runReport()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('supports filtering by category and severity', () => {
    process.argv = ['node', 'report_findings.ts', 'category=validate_eslint', 'severity=error', '--json', 'allow-stale'];

    expect(() => runReport()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});
