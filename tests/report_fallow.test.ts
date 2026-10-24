/**
 * tests/report_fallow.test.ts
 *
 * Unit tests for report_fallow CLI tool (categories, formats, and fallow report integration).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';

import { runFallowReportCli, setFallowCommandRunner } from '../src/cli/report_fallow.ts';

describe('report_fallow CLI Tool', () => {
  let originalArgv: string[];
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalArgv = [...process.argv];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    setFallowCommandRunner(<T>(command: string, extraArgs: string[] = []): T | null => {
      let result: Record<string, unknown> = {};
      if (command === 'dupes') {
        result = {
          clone_groups: [
            {
              token_count: 50,
              duplicated_tokens: 50,
              instances: [
                { path: 'src/core/a.ts', line: 10, start_line: 10 },
                { path: 'src/core/b.ts', line: 20, start_line: 20 }
              ]
            }
          ]
        };
      } else if (command === 'dead-code') {
        result = {
          unused_files: [{ path: 'src/unused.ts' }],
          unused_exports: [{ path: 'src/foo.ts', line: 10, export_name: 'testExport' }],
          unused_dependencies: [{ package_name: 'unused-dep' }],
          circular_dependencies: [{ files: ['src/a.ts', 'src/b.ts'] }],
          boundary_violations: [
            {
              from_path: 'src/domain/a.ts',
              to_path: 'src/infra/b.ts',
              from_zone: 'domain',
              to_zone: 'infra',
              line: 5
            }
          ]
        };
      } else if (command === 'health') {
        if (extraArgs.includes('--coverage-gaps')) {
          result = {
            coverage_gaps: [
              {
                path: 'src/untested.ts',
                line: 10,
                export_name: 'untestedFn',
                actions: [{ note: 'Missing test' }]
              }
            ]
          };
        } else {
          result = {
            summary: { average_maintainability: 85, maintainability_index: 85 },
            findings: [{ rule: 'complexity', path: 'src/a.ts', line: 10 }],
            large_functions: [{ path: 'src/a.ts', line: 10, loc: 70 }],
            targets: [{ path: 'src/a.ts' }],
            hotspots: [{ path: 'src/a.ts' }]
          };
        }
      } else if (command === 'security') {
        result = {
          security_findings: [
            {
              path: 'src/core/eval.ts',
              line: 12,
              cwe: 95,
              kind: 'EvalUsage',
              evidence: 'eval(userInput)'
            }
          ]
        };
      } else if (command === 'suppressions') {
        result = {
          total: 1,
          suppressions: [
            {
              line: 10,
              kind: 'unused-export'
            }
          ]
        };
      }
      return result as T;
    });
  });

  afterEach(() => {
    setFallowCommandRunner(null);
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it('runs report for category=dupes in json mode', () => {
    process.argv = ['node', 'report_fallow.ts', 'category=dupes', '--json'];

    expect(() => runFallowReportCli()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();

    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('totalGroups');
    expect(parsed).toHaveProperty('groups');
  });

  it('runs report for category=dead-code in json mode', () => {
    process.argv = ['node', 'report_fallow.ts', 'category=dead-code', '--json'];

    expect(() => runFallowReportCli()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();

    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('unusedFiles');
    expect(parsed).toHaveProperty('circular');
  });

  it('runs report for category=coverage-gaps in json mode', () => {
    process.argv = ['node', 'report_fallow.ts', 'category=coverage-gaps', '--json'];

    expect(() => runFallowReportCli()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();

    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('totalGaps');
  });

  it('runs summary report for category=all in json mode', () => {
    process.argv = ['node', 'report_fallow.ts', 'category=all', '--json'];

    expect(() => runFallowReportCli()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();

    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('maintainability');
    expect(parsed).toHaveProperty('health');
    expect(parsed).toHaveProperty('deadCode');
  });

  it('renders human terminal table for category=dupes', () => {
    process.argv = ['node', 'report_fallow.ts', 'category=dupes', 'top=5'];
    expect(() => runFallowReportCli()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('renders human terminal table for category=dead-code', () => {
    process.argv = ['node', 'report_fallow.ts', 'category=dead-code', 'top=5'];
    expect(() => runFallowReportCli()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('renders human terminal table for category=health', () => {
    process.argv = ['node', 'report_fallow.ts', 'category=health', 'top=5'];
    expect(() => runFallowReportCli()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('renders human terminal table for category=coverage-gaps', () => {
    process.argv = ['node', 'report_fallow.ts', 'category=coverage-gaps', 'top=5'];
    expect(() => runFallowReportCli()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('renders human terminal table for category=all', () => {
    process.argv = ['node', 'report_fallow.ts', 'category=all'];
    expect(() => runFallowReportCli()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('runs report for category=circular in json and table mode', () => {
    process.argv = ['node', 'report_fallow.ts', 'category=circular', '--json'];
    expect(() => runFallowReportCli()).not.toThrow();

    process.argv = ['node', 'report_fallow.ts', 'category=circular', 'top=5'];
    expect(() => runFallowReportCli()).not.toThrow();
  });

  it('runs report for category=exports in json and table mode', () => {
    process.argv = ['node', 'report_fallow.ts', 'category=exports', '--json'];
    expect(() => runFallowReportCli()).not.toThrow();

    process.argv = ['node', 'report_fallow.ts', 'category=exports', 'top=5'];
    expect(() => runFallowReportCli()).not.toThrow();
  });

  it('runs report for category=security in json and table mode', () => {
    process.argv = ['node', 'report_fallow.ts', 'category=security', '--json'];
    expect(() => runFallowReportCli()).not.toThrow();

    process.argv = ['node', 'report_fallow.ts', 'category=security', 'top=5'];
    expect(() => runFallowReportCli()).not.toThrow();
  });

  it('runs report for category=boundaries in json and table mode', () => {
    process.argv = ['node', 'report_fallow.ts', 'category=boundaries', '--json'];
    expect(() => runFallowReportCli()).not.toThrow();

    process.argv = ['node', 'report_fallow.ts', 'category=boundaries', 'top=5'];
    expect(() => runFallowReportCli()).not.toThrow();
  });

  it('runs report for category=suppressions in json and table mode', () => {
    process.argv = ['node', 'report_fallow.ts', 'category=suppressions', '--json'];
    expect(() => runFallowReportCli()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();

    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('total');
    expect(parsed).toHaveProperty('suppressions');

    process.argv = ['node', 'report_fallow.ts', 'category=suppressions', 'top=5'];
    expect(() => runFallowReportCli()).not.toThrow();
  });

  it('runs report for category=flags in json and table mode', () => {
    process.argv = ['node', 'report_fallow.ts', 'category=flags', '--json'];
    expect(() => runFallowReportCli()).not.toThrow();

    process.argv = ['node', 'report_fallow.ts', 'category=flags', 'top=5'];
    expect(() => runFallowReportCli()).not.toThrow();
  });

  it('runs report for category=viz in json and terminal mode', () => {
    process.argv = ['node', 'report_fallow.ts', 'category=viz', '--json'];
    expect(() => runFallowReportCli()).not.toThrow();

    process.argv = ['node', 'report_fallow.ts', 'category=viz'];
    expect(() => runFallowReportCli()).not.toThrow();
  });

  it('handles unknown category gracefully', () => {
    process.argv = ['node', 'report_fallow.ts', 'category=unknown'];
    expect(() => runFallowReportCli()).not.toThrow();
  });
});
