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

  it('renders table with multiple finding categories and truncated text', async () => {
    const { StylelintAuditor } = await import('../src/suites/architecture/validate_stylelint.ts');
    vi.spyOn(StylelintAuditor.prototype, 'execute').mockResolvedValueOnce({
      id: 'validate_stylelint',
      name: 'Stylelint',
      description: 'Stylelint checks',
      family: 'architecture',
      metrics: {},
      status: 'failed',
      durationMs: 42,
      summary: { errors: 3, warnings: 2, info: 0 },
      findings: [
        {
          ruleId: 'css-duplicate-selectors',
          severity: 'error',
          file: 'src/styles/very_long_path_to_stylesheet_component_style_test.scss',
          line: 10,
          message: 'This is an extremely long stylelint error message explaining that a duplicate selector was found in this block'
        },
        {
          ruleId: 'css-duplicate-properties',
          severity: 'warning',
          file: 'src/styles/app.scss',
          line: 20,
          message: 'Duplicate property color'
        },
        {
          ruleId: 'css-empty-blocks',
          severity: 'warning',
          file: 'src/styles/empty.scss',
          line: 30,
          message: 'Empty rule block'
        },
        {
          ruleId: 'css-order-violation',
          severity: 'error',
          file: 'src/styles/order.scss',
          line: 40,
          message: 'Expected margin before padding'
        },
        {
          ruleId: 'scss-syntax-issue',
          severity: 'error',
          file: 'src/styles/syntax.scss',
          line: 50,
          message: 'Invalid SCSS syntax'
        },
        {
          ruleId: 'wallace-complexity',
          severity: 'warning',
          file: 'src/styles/complex.scss',
          line: 60,
          message: 'High selector complexity'
        }
      ]
    });

    process.argv = ['node', 'report_css.ts'];
    await runCssReport();

    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('SELECTOR DUP');
    expect(output).toContain('PROP DUP');
    expect(output).toContain('BLOQUE VACÍO');
    expect(output).toContain('ORDEN CSS');
    expect(output).toContain('SINTAXIS SCSS');
    expect(output).toContain('COMPLEJIDAD');
  });
});

