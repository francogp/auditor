/**
 * tests/report_css.test.ts
 *
 * Unit tests for report_css CLI tool (JSON output, categories filtering, error-only mode, and banner views).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runCssReport } from '../src/cli/report_css.ts';

describe('report_css CLI Tool', () => {
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

  it('runs report in JSON mode and outputs summary with findings', async () => {
    process.argv = ['node', 'report_css.ts', '--json'];

    await runCssReport();

    expect(consoleLogSpy).toHaveBeenCalled();
    const jsonCall = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).find((s: string) => s.trim().startsWith('{'));
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(jsonCall!);
    expect(parsed).toHaveProperty('summary');
    expect(parsed).toHaveProperty('findings');
    expect(parsed.summary).toHaveProperty('filesScanned');
  });

  it('supports category filtering for selectors in JSON mode', async () => {
    process.argv = ['node', 'report_css.ts', '--category=selectors', '--json'];

    await runCssReport();

    expect(consoleLogSpy).toHaveBeenCalled();
    const jsonCall = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).find((s: string) => s.trim().startsWith('{'));
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(jsonCall!);
    expect(Array.isArray(parsed.findings)).toBe(true);
  });

  it('supports category filtering for properties, empty, order, and syntax', async () => {
    for (const cat of ['properties', 'empty', 'order', 'syntax']) {
      process.argv = ['node', 'report_css.ts', `--category=${cat}`, '--json'];
      await runCssReport();
      expect(consoleLogSpy).toHaveBeenCalled();
    }
  });

  it('renders default box table output cleanly', async () => {
    process.argv = ['node', 'report_css.ts'];

    await runCssReport();

    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('supports --errors-only and fix flags', async () => {
    process.argv = ['node', 'report_css.ts', '--errors-only', '--fix'];

    await runCssReport();

    expect(consoleLogSpy).toHaveBeenCalled();
  });
});
