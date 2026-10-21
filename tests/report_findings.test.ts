/**
 * tests/report_findings.test.ts
 *
 * Unit tests for report_findings CLI tool (filtering, sorting, and reporting views).
 * Uses hermetic mocks to avoid race conditions with parallel audit test workers.
 */

import fs from 'node:fs';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';

import {
  runReport,
  resolveActiveRemediationPhase,
  renderActivePhaseFocusBanner
} from '../src/cli/report_findings.ts';
import type { ConsolidatedAuditReport, AuditFinding } from '../src/core/auditContract.ts';

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
      executedSuites: ['validate_oxlint'],
      omittedSuites: [],
      environment: { nodeVersion: 'v26.0.0', platform: 'win32', cwd: '/test' }
    },
    status: 'passed',
    summary: {
      totalViolations: 1,
      errors: 1,
      warnings: 0,
      suitesTotal: 1,
      suitesPassed: 1,
      suitesFailed: 0,
      durationMs: 15
    },
    families: {
      architecture: {
        title: 'ESTÁNDARES ESTÁTICOS',
        suites: [
          {
            id: 'validate_oxlint',
            name: 'Oxlint & Vite+',
            description: 'Reglas de Oxlint',
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
                suiteId: 'validate_oxlint',
                suiteName: 'Oxlint & Vite+'
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
        suiteId: 'validate_oxlint',
        suiteName: 'Oxlint & Vite+'
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
    process.argv = [
      'node',
      'report_findings.ts',
      'category=validate_oxlint',
      'severity=error',
      '--json',
      'allow-stale'
    ];

    expect(() => runReport()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('renders default details view in human mode', () => {
    process.argv = ['node', 'report_findings.ts', 'allow-stale'];

    expect(() => runReport()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('supports search query filtering', () => {
    process.argv = ['node', 'report_findings.ts', 'search=math', 'allow-stale'];

    expect(() => runReport()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('renders clean success banner when there are zero findings', () => {
    fsReadSpy.mockImplementationOnce(() =>
      JSON.stringify({
        ...mockReport,
        summary: {
          totalViolations: 0,
          errors: 0,
          warnings: 0,
          suitesTotal: 1,
          suitesPassed: 1,
          suitesFailed: 0,
          durationMs: 5
        },
        allFindings: [],
        families: { architecture: { title: 'TEST', suites: [] } }
      })
    );

    process.argv = ['node', 'report_findings.ts', 'allow-stale'];
    expect(() => runReport()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('loads and renders latest_fix_audit.json when fix flag is passed', () => {
    fsExistsSpy.mockImplementation((targetPath: fs.PathLike) => {
      if (String(targetPath).includes('latest_fix_audit.json')) return true;
      return originalExistsSync(targetPath);
    });

    fsReadSpy.mockImplementation((targetPath: fs.PathOrFileDescriptor, options?: unknown) => {
      if (String(targetPath).includes('latest_fix_audit.json')) {
        return JSON.stringify({
          ...mockReport,
          meta: {
            ...mockReport.meta,
            isFullAudit: false,
            runMode: 'fix',
            timestamp: Temporal.Now.instant().toString()
          }
        });
      }
      return (originalReadFileSync as (...args: unknown[]) => string)(targetPath, options);
    });

    process.argv = ['node', 'report_findings.ts', 'fix', '--json', 'allow-stale'];
    expect(() => runReport()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('supports rule filtering (rule=no-explicit-any)', () => {
    process.argv = ['node', 'report_findings.ts', 'rule=no-explicit-any', 'allow-stale'];
    expect(() => runReport()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('renders rules breakdown view (by-rule / rules)', () => {
    process.argv = ['node', 'report_findings.ts', 'rules', 'allow-stale'];
    expect(() => runReport()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('supports flat inspection mode without error sample limits', () => {
    process.argv = ['node', 'report_findings.ts', 'flat', 'allow-stale'];
    expect(() => runReport()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('supports comma-separated file filters (file=math.ts,other.ts)', () => {
    process.argv = ['node', 'report_findings.ts', 'file=math.ts,other.ts', 'allow-stale'];
    expect(() => runReport()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('supports top=all and top=0 without capping findings to default limit', () => {
    for (const topOption of ['top=all', 'top=0']) {
      consoleLogSpy.mockClear();
      process.argv = ['node', 'report_findings.ts', topOption, '--json', 'allow-stale'];
      expect(() => runReport()).not.toThrow();
      const jsonCall = consoleLogSpy.mock.calls.find((c: unknown[]) =>
        String(c[0]).includes('"filteredTotal"')
      );
      expect(jsonCall).toBeDefined();
      const parsed = JSON.parse(String(jsonCall![0]));
      expect(parsed.findings.length).toBe(1);
    }
  });

  it('handles partial audits gracefully without throwing or exiting', () => {
    fsReadSpy.mockImplementationOnce(() =>
      JSON.stringify({
        ...mockReport,
        meta: {
          ...mockReport.meta,
          isFullAudit: false,
          runMode: 'single',
          executedSuiteCount: 1,
          totalDiscoveredSuites: 79,
          executedSuites: ['validate_oxlint'],
          timestamp: Temporal.Now.instant().toString()
        }
      })
    );

    process.argv = ['node', 'report_findings.ts', 'allow-stale'];
    expect(() => runReport()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('omits 76-suite dump and unrequested box tables in compact flat rule filter', () => {
    fsReadSpy.mockImplementationOnce(() =>
      JSON.stringify({
        ...mockReport,
        meta: {
          ...mockReport.meta,
          isFullAudit: false,
          totalDiscoveredSuites: 80,
          executedSuiteCount: 76,
          executedSuites: Array.from({ length: 76 }, (_, i) => `suite_${i + 1}`),
          omittedSuites: ['suite_77', 'suite_78', 'suite_79', 'suite_80'],
          timestamp: Temporal.Now.instant().toString()
        }
      })
    );

    process.argv = ['node', 'report_findings.ts', 'rule=rule_1', 'flat', 'allow-stale'];
    runReport();

    const allLogs = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLogs).toContain('[Notice] Inspecting partial run (76/80 suites executed).');
    expect(allLogs).not.toContain('suite_1, suite_2');
    expect(allLogs).not.toContain('┌─');
  });

  it('supports suite= and task= filtering without falling into unknown category', () => {
    process.argv = ['node', 'report_findings.ts', 'suite=validate_oxlint', 'allow-stale'];
    runReport();

    const allLogs = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLogs).not.toContain('No se encontraron hallazgos para la categoría');
    expect(allLogs).toContain('Forbidden any typecast');
    expect(allLogs).not.toContain('┌─');
  });

  it('includes full suite list and consolidated box-drawing banner in human mode', () => {
    fsReadSpy.mockImplementationOnce(() =>
      JSON.stringify({
        ...mockReport,
        meta: {
          ...mockReport.meta,
          isFullAudit: false,
          totalDiscoveredSuites: 80,
          executedSuiteCount: 76,
          executedSuites: Array.from({ length: 76 }, (_, i) => `suite_${i + 1}`),
          omittedSuites: ['suite_77', 'suite_78', 'suite_79', 'suite_80'],
          timestamp: Temporal.Now.instant().toString()
        }
      })
    );

    process.argv = ['node', 'report_findings.ts', 'human', 'allow-stale'];
    runReport();

    const allLogs = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLogs).toContain('suite_1, suite_2');
    expect(allLogs).toContain('CONSOLIDATED AUDIT WARNINGS & ERRORS REPORT');
  });

  describe('resolveActiveRemediationPhase', () => {
    it('resolves setup phase when setup errors exist, even if downstream errors exist', () => {
      const findings: AuditFinding[] = [
        {
          severity: 'error',
          message: 'Config error',
          file: 'audit.config.ts',
          remediationPhase: 'setup'
        },
        { severity: 'error', message: 'Dead file', file: 'dead.ts', remediationPhase: 'prune' },
        { severity: 'error', message: 'Linter error', file: 'lint.ts', remediationPhase: 'hygiene' }
      ];

      const res = resolveActiveRemediationPhase(findings);
      expect(res).not.toBeNull();
      expect(res!.phase).toBe('setup');
      expect(res!.errors).toBe(1);
      expect(res!.postponedCount).toBe(2);
      expect(res!.totalErrorsInReport).toBe(3);
    });

    it('resolves prune phase when setup is clean and prune has errors', () => {
      const findings: AuditFinding[] = [
        {
          severity: 'warning',
          message: 'Setup warning',
          file: 'audit.config.ts',
          remediationPhase: 'setup'
        },
        { severity: 'error', message: 'Dead file 1', file: 'dead1.ts', remediationPhase: 'prune' },
        { severity: 'error', message: 'Dead file 2', file: 'dead2.ts', remediationPhase: 'prune' },
        {
          severity: 'error',
          message: 'Type error',
          file: 'types.ts',
          remediationPhase: 'contracts'
        },
        { severity: 'error', message: 'Linter error', file: 'lint.ts', remediationPhase: 'hygiene' }
      ];

      const res = resolveActiveRemediationPhase(findings);
      expect(res).not.toBeNull();
      expect(res!.phase).toBe('prune');
      expect(res!.errors).toBe(2);
      expect(res!.postponedCount).toBe(2); // contracts + hygiene
    });

    it('resolves earliest phase with warnings when totalErrors is zero', () => {
      const findings: AuditFinding[] = [
        {
          severity: 'warning',
          message: 'GSAP warning',
          file: 'anim.ts',
          remediationPhase: 'behavior'
        },
        {
          severity: 'warning',
          message: 'Magic number',
          file: 'magic.ts',
          remediationPhase: 'hygiene'
        }
      ];

      const res = resolveActiveRemediationPhase(findings);
      expect(res).not.toBeNull();
      expect(res!.phase).toBe('behavior');
      expect(res!.errors).toBe(0);
      expect(res!.warnings).toBe(1);
      expect(res!.postponedCount).toBe(1);
    });

    it('returns null when findings array is empty', () => {
      const res = resolveActiveRemediationPhase([]);
      expect(res).toBeNull();
    });

    it('renders clean active phase focus banner in compact and human modes', () => {
      const resolution = {
        phase: 'prune' as const,
        errors: 3,
        warnings: 1,
        postponedCount: 15,
        totalErrorsInReport: 5,
        totalWarningsInReport: 2
      };

      const compactBanner = renderActivePhaseFocusBanner(resolution, false);
      expect(compactBanner).toContain(
        '[FOCUS] ACTIVE REMEDIATION PHASE 2/7: PHASE 2 · DEAD CODE PRUNING'
      );
      expect(compactBanner).toContain('Target: 3 error(s) and 1 warning(s).');
      expect(compactBanner).toContain('Postponed: 15 downstream finding(s).');
      expect(compactBanner).not.toContain('🔒');
      expect(compactBanner).not.toContain('🧹');

      const humanBanner = renderActivePhaseFocusBanner(resolution, true);
      expect(humanBanner).toContain('ACTIVE REMEDIATION PHASE 2/7: 🧹 PHASE 2 · DEAD CODE PRUNING');
      expect(humanBanner).toContain('Focus: 3 error(s) and 1 warning(s) in this phase.');
      expect(humanBanner).toContain('Postponing 15 downstream finding(s)');
    });
  });

  describe('runReport next subcommand & phase=next', () => {
    it('automatically isolates active phase and filters out downstream findings', () => {
      fsReadSpy.mockImplementationOnce(() =>
        JSON.stringify({
          ...mockReport,
          allFindings: [
            {
              severity: 'error',
              message: 'Unused export test',
              file: 'src/dead.ts',
              remediationPhase: 'prune',
              suiteId: 'validate_fallow',
              suiteName: 'Fallow Dead Code'
            },
            {
              severity: 'error',
              message: 'Forbidden any typecast',
              file: 'src/utils/math.ts',
              remediationPhase: 'contracts',
              suiteId: 'validate_oxlint',
              suiteName: 'Oxlint & Vite+'
            }
          ],
          families: {
            architecture: {
              title: 'ESTÁNDARES ESTÁTICOS',
              suites: [
                {
                  id: 'validate_fallow',
                  name: 'Fallow Dead Code',
                  description: 'Dead code',
                  family: 'architecture',
                  status: 'failed',
                  durationMs: 15,
                  metrics: {},
                  findings: [
                    {
                      severity: 'error',
                      message: 'Unused export test',
                      file: 'src/dead.ts',
                      remediationPhase: 'prune',
                      suiteId: 'validate_fallow',
                      suiteName: 'Fallow Dead Code'
                    }
                  ],
                  summary: { errors: 1, warnings: 0, info: 0 }
                },
                {
                  id: 'validate_oxlint',
                  name: 'Oxlint & Vite+',
                  description: 'Reglas de Oxlint',
                  family: 'architecture',
                  status: 'failed',
                  durationMs: 15,
                  metrics: {},
                  findings: [
                    {
                      severity: 'error',
                      message: 'Forbidden any typecast',
                      file: 'src/utils/math.ts',
                      remediationPhase: 'contracts',
                      suiteId: 'validate_oxlint',
                      suiteName: 'Oxlint & Vite+'
                    }
                  ],
                  summary: { errors: 1, warnings: 0, info: 0 }
                }
              ]
            }
          }
        })
      );

      process.argv = ['node', 'report_findings.ts', 'next', 'flat', 'allow-stale'];
      runReport();

      const allLogs = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(allLogs).toContain(
        '[FOCUS] ACTIVE REMEDIATION PHASE 2/7: PHASE 2 · DEAD CODE PRUNING'
      );
      expect(allLogs).toContain('Target: 1 error(s).');
      expect(allLogs).toContain('Postponed: 1 downstream finding(s).');
      expect(allLogs).toContain('Unused export test');
      // Downstream contracts finding should be postponed and not rendered
      expect(allLogs).not.toContain('Forbidden any typecast');
    });

    it('emits box-drawing banner in human mode when active phase has findings', () => {
      fsReadSpy.mockImplementationOnce(() =>
        JSON.stringify({
          ...mockReport,
          allFindings: [
            {
              severity: 'error',
              message: 'Unused export test',
              file: 'src/dead.ts',
              remediationPhase: 'prune',
              suiteId: 'validate_fallow',
              suiteName: 'Fallow Dead Code'
            }
          ],
          families: {
            architecture: {
              name: 'Architecture',
              suites: [
                {
                  id: 'validate_fallow',
                  name: 'Fallow Dead Code',
                  findings: [
                    {
                      severity: 'error',
                      message: 'Unused export test',
                      file: 'src/dead.ts',
                      remediationPhase: 'prune'
                    }
                  ],
                  summary: { errors: 1, warnings: 0, info: 0 }
                }
              ]
            }
          }
        })
      );

      process.argv = ['node', 'report_findings.ts', 'next', 'human', 'allow-stale'];
      runReport();

      const allLogs = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(allLogs).toContain('ACTIVE REMEDIATION PHASE 2/7: 🧹 PHASE 2 · DEAD CODE PRUNING');
      expect(allLogs).toContain('Focus: 1 error(s) in this phase.');
    });

    it('emits clean verdict when all phases have 0 findings', () => {
      fsReadSpy.mockImplementationOnce(() =>
        JSON.stringify({
          ...mockReport,
          allFindings: [],
          families: {}
        })
      );

      process.argv = ['node', 'report_findings.ts', 'phase=next', 'allow-stale'];
      runReport();

      const allLogs = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(allLogs).toContain('[OK] All 7 remediation phases are clean');
    });
  });
});
