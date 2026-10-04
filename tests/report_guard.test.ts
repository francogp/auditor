/**
 * tests/report_guard.test.ts
 *
 * Unit tests for report_guard CLI tool (architecture pre-flight boundaries and policy checker).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runGuardReport } from '../src/cli/report_guard.ts';
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

describe('Report Guard CLI Tool', () => {
  const fakeFallowBin = '/mock/node_modules/fallow/bin/fallow.js';

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

    const exitCode = runGuardReport('/missing/root', ['src/a.ts']);
    expect(exitCode).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('No se encontró el binario de Fallow'));

    errSpy.mockRestore();
  });

  it('exits with code 0 and displays guidance when no files are provided in terminal mode', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = runGuardReport(process.cwd(), []);
    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('PRE-VUELO ARQUITECTÓNICO');

    logSpy.mockRestore();
  });

  it('returns code 1 with error JSON when no files are provided in JSON mode', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = runGuardReport(process.cwd(), [], { json: true });
    expect(exitCode).toBe(1);
    expect(logSpy).toHaveBeenCalled();
    const parsed = JSON.parse(logSpy.mock.calls[0]![0]);
    expect(parsed.error).toContain('No files specified');

    logSpy.mockRestore();
  });

  it('outputs error JSON when parsed payload is null in JSON mode', () => {
    vi.mocked(cliUtils.executeFallowJsonCommand).mockReturnValue({
      parsed: null,
      status: 2,
      rawOutput: 'Fallow crash'
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = runGuardReport(process.cwd(), ['src/index.ts'], { json: true });
    expect(exitCode).toBe(2);
    const parsed = JSON.parse(logSpy.mock.calls[0]![0]);
    expect(parsed.error).toContain('Fallow guard execution failed');

    logSpy.mockRestore();
  });

  it('outputs JSON when inspection succeeds', () => {
    vi.mocked(cliUtils.executeFallowJsonCommand).mockReturnValue({
      parsed: {
        files: [{ path: 'src/core/auditConfig.ts', zone: 'core' }]
      },
      status: 0,
      rawOutput: '{}'
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = runGuardReport(process.cwd(), ['src/core/auditConfig.ts'], { json: true });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(logSpy.mock.calls[0]![0]);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]!.path).toBe('src/core/auditConfig.ts');

    logSpy.mockRestore();
  });

  it('renders clean message when no file results are returned in terminal mode', () => {
    vi.mocked(cliUtils.executeFallowJsonCommand).mockReturnValue({
      parsed: { files: [] },
      status: 0,
      rawOutput: '{}'
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = runGuardReport(process.cwd(), ['src/unknown.ts'], { json: false });
    expect(exitCode).toBe(0);
    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('No se recibieron datos de reglas arquitectónicas');

    logSpy.mockRestore();
  });

  it('renders box table output with unrestricted zones, rules, forbidden calls, and notes', () => {
    vi.mocked(cliUtils.executeFallowJsonCommand).mockReturnValue({
      parsed: {
        files: [
          {
            path: 'src/unrestricted.ts',
            zone: 'core',
            boundary: { unrestricted: true, forbidden_calls: ['eval'] },
            policy_rules: ['no-direct-fs'],
            notes: ['Layer exemption granted']
          },
          {
            path: 'src/isolated.ts',
            boundary: { unrestricted: false, allowed_zones: ['models', 'utils'] },
            notes: []
          }
        ]
      },
      status: 0,
      rawOutput: '{}'
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = runGuardReport(process.cwd(), ['src/unrestricted.ts', 'src/isolated.ts'], { json: false });
    expect(exitCode).toBe(0);
    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('PRE-VUELO ARQUITECTÓNICO');
    expect(output).toContain('todas (sin restricción)');
    expect(output).toContain('prohibidas: eval');
    expect(output).toContain('política');
    expect(output).toContain('sin capa');
    expect(output).toContain('Layer exemption granted');

    logSpy.mockRestore();
  });
});
