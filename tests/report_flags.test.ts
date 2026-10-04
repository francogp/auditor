/**
 * tests/report_flags.test.ts
 *
 * Unit tests for report_flags CLI tool (feature flags and retirement governance).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runFlagsReport } from '../src/cli/report_flags.ts';
import * as cliUtils from '../src/cli/cliUtils.ts';
import * as similarCodeModule from '../src/suites/architecture/validate_similar_code.ts';

vi.mock('../src/cli/cliUtils.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof cliUtils>();
  return {
    ...actual,
    executeFallowJsonCommand: vi.fn()
  };
});

vi.mock('../src/suites/architecture/validate_similar_code.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof similarCodeModule>();
  return {
    ...actual,
    resolveFallowBinary: vi.fn()
  };
});

describe('Report Flags CLI Tool', () => {
  const fakeFallowBin = '/fake/node_modules/fallow/bin/fallow.js';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(similarCodeModule.resolveFallowBinary).mockReturnValue(fakeFallowBin);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns code 1 when fallow binary is missing', () => {
    vi.mocked(similarCodeModule.resolveFallowBinary).mockReturnValue(null);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const code = runFlagsReport('/empty/dir');
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('No se encontró el binario de Fallow'));

    errSpy.mockRestore();
  });

  it('outputs error JSON when parsed payload is null in JSON mode', () => {
    vi.mocked(cliUtils.executeFallowJsonCommand).mockReturnValue({
      parsed: null,
      status: 2,
      rawOutput: 'command failure'
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const code = runFlagsReport(process.cwd(), { json: true });
    expect(code).toBe(2);
    expect(logSpy).toHaveBeenCalled();
    const parsed = JSON.parse(logSpy.mock.calls[0]![0]);
    expect(parsed.error).toContain('Fallow flags execution failed');

    logSpy.mockRestore();
  });

  it('renders clean message when no flags are configured in standard view', () => {
    vi.mocked(cliUtils.executeFallowJsonCommand).mockReturnValue({
      parsed: { total_flags: 0, feature_flags: [] },
      status: 0,
      rawOutput: '{}'
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const code = runFlagsReport(process.cwd(), { retirement: false, json: false });
    expect(code).toBe(0);
    const allLogs = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(allLogs).toContain('No se encontraron feature flags configuradas');

    logSpy.mockRestore();
  });

  it('renders flags table and tip when feature flags are present in standard view', () => {
    vi.mocked(cliUtils.executeFallowJsonCommand).mockReturnValue({
      parsed: {
        total_flags: 2,
        feature_flags: [
          { name: 'enable_new_pricing', read_sites: 3 },
          { name: 'dark_mode_v2', read_sites: 8 }
        ]
      },
      status: 0,
      rawOutput: '{}'
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const code = runFlagsReport(process.cwd(), { retirement: false, json: false, top: 10 });
    expect(code).toBe(0);
    const allLogs = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(allLogs).toContain('FEATURE FLAG');
    expect(allLogs).toContain('enable_new_pricing');
    expect(allLogs).toContain('dark_mode_v2');
    expect(allLogs).toContain('Tip: Ejecuta auditor-flags --retirement');

    logSpy.mockRestore();
  });

  it('renders clean message when 0 retirement candidates are detected in retirement view', () => {
    vi.mocked(cliUtils.executeFallowJsonCommand).mockReturnValue({
      parsed: {
        total_flags: 1,
        retirement: { flags: [] }
      },
      status: 0,
      rawOutput: '{}'
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const code = runFlagsReport(process.cwd(), { retirement: true, json: false });
    expect(code).toBe(0);
    const allLogs = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(allLogs).toContain('No se detectaron feature flags candidatas a retiro');

    logSpy.mockRestore();
  });

  it('renders retirement candidates table covering all reason types in retirement view', () => {
    vi.mocked(cliUtils.executeFallowJsonCommand).mockReturnValue({
      parsed: {
        total_flags: 8,
        retirement: {
          flags: [
            { name: 'flag_single_read', age_days: 120, read_sites: 1, reasons: ['single-read-site'] },
            { name: 'flag_empty_branch', age_days: 45, read_sites: 2, reasons: ['empty-branch'] },
            { name: 'flag_literal_const', age_days: 90, read_sites: 5, reasons: ['literal-constant'] },
            { name: 'flag_never_read', age_days: 180, read_sites: 0, reasons: ['defined-never-read'] },
            { name: 'flag_identical_branches', age_days: 30, read_sites: 3, reasons: ['identical-branches'] },
            { name: 'flag_dead_code', age_days: 60, read_sites: 1, reasons: ['guards-dead-code'] },
            { name: 'flag_rolled_out', age_days: 200, read_sites: 10, reasons: ['fully-rolled-out'] },
            { name: 'flag_custom_reason', reasons: ['unknown-custom-reason'] }
          ]
        }
      },
      status: 0,
      rawOutput: '{}'
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const code = runFlagsReport(process.cwd(), { retirement: true, json: false, top: 10 });
    expect(code).toBe(0);
    const allLogs = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(allLogs).toContain('Leída en un solo sitio');
    expect(allLogs).toContain('Rama vacía');
    expect(allLogs).toContain('Constante literal');
    expect(allLogs).toContain('Definida pero nunca leída');
    expect(allLogs).toContain('Ramas idénticas');
    expect(allLogs).toContain('Protege código muerto');
    expect(allLogs).toContain('Completamente desplegada');
    expect(allLogs).toContain('unknown-custom-reason');

    logSpy.mockRestore();
  });

  it('analyzes retirement candidates with json output', () => {
    vi.mocked(cliUtils.executeFallowJsonCommand).mockReturnValue({
      parsed: {
        retirement: { summary: { distinct_flags: 2, candidates: 1 } }
      },
      status: 0,
      rawOutput: '{}'
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const code = runFlagsReport(process.cwd(), { retirement: true, json: true });
    expect(code).toBe(0);
    const parsed = JSON.parse(logSpy.mock.calls[0]![0]);
    expect(parsed).toHaveProperty('retirement');

    logSpy.mockRestore();
  });
});
