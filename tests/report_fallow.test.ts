/**
 * tests/report_fallow.test.ts
 *
 * Unit tests for report_fallow CLI tool (categories, formats, and fallow report integration).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runFallowReportCli } from '../src/cli/report_fallow.ts';

describe('report_fallow CLI Tool', () => {
  let originalArgv: string[];
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalArgv = [...process.argv];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
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

  it('handles unknown category gracefully', () => {
    process.argv = ['node', 'report_fallow.ts', 'category=unknown'];
    expect(() => runFallowReportCli()).not.toThrow();
  });
});

