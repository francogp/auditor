/**
 * tests/report_complexity.test.ts
 *
 * Unit tests for report_complexity CLI tool.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runComplexityReport } from '../src/cli/report_complexity.ts';

describe('report_complexity CLI Tool', () => {
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

  it('runs report in json mode and outputs valid structure', () => {
    process.argv = ['node', 'report_complexity.ts', '--json'];

    expect(() => runComplexityReport()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();

    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('total');
    expect(parsed).toHaveProperty('maintainability');
    expect(parsed).toHaveProperty('findings');
    expect(parsed).toHaveProperty('targets');
  });

  it('runs report with layer filtering', () => {
    process.argv = ['node', 'report_complexity.ts', 'layer=cli'];

    expect(() => runComplexityReport()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('renders default box drawing report with top limit', () => {
    process.argv = ['node', 'report_complexity.ts', 'top=5'];

    expect(() => runComplexityReport()).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});
