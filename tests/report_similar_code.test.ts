/**
 * tests/report_similar_code.test.ts
 *
 * Unit tests for fallow similar code report CLI tool (runSimilarCodeReport).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'node:child_process';
import { runSimilarCodeReport } from '../src/cli/report_similar_code.ts';
import * as similarCodeModule from '../src/suites/architecture/validate_similar_code.ts';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof childProcess>();
  return {
    ...actual,
    execSync: vi.fn()
  };
});

vi.mock('../src/suites/architecture/validate_similar_code.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof similarCodeModule>();
  return {
    ...actual,
    resolveFallowBinary: vi.fn(),
    checkOrInitializeModel: vi.fn()
  };
});

describe('report_similar_code CLI', () => {
  const originalArgv = [...process.argv];
  const fakeFallowBin = '/mock/node_modules/fallow/bin/fallow.js';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(similarCodeModule.resolveFallowBinary).mockReturnValue(fakeFallowBin);
    vi.mocked(similarCodeModule.checkOrInitializeModel).mockReturnValue(true);
  });

  afterEach(() => {
    process.argv = [...originalArgv];
  });

  it('exits with code 1 when fallow binary is not found', () => {
    vi.mocked(similarCodeModule.resolveFallowBinary).mockReturnValue(null);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit:${code}`);
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => runSimilarCodeReport()).toThrow('process.exit:1');
    expect(errSpy).toHaveBeenCalled();

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('exits with code 1 and logs warning banner when model is not ready', () => {
    vi.mocked(similarCodeModule.checkOrInitializeModel).mockReturnValue(false);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit:${code}`);
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => runSimilarCodeReport()).toThrow('process.exit:1');
    expect(errSpy).toHaveBeenCalled();

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('handles child_process execSync failure gracefully by exiting with code 1', () => {
    vi.mocked(childProcess.execSync).mockImplementation(() => {
      throw new Error('Fallow execution crashed');
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit:${code}`);
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => runSimilarCodeReport()).toThrow('process.exit:1');
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Fallow execution crashed'));

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('outputs JSON when --json is provided', () => {
    process.argv = ['node', 'report_similar_code.ts', '--json'];

    const mockOutput = {
      candidates: [
        {
          similarity: 0.98,
          left: { path: 'src/a.ts', name: 'calculateTotal', start_line: 10 },
          right: { path: 'src/b.ts', name: 'computeTotal', start_line: 25 }
        }
      ]
    };

    vi.mocked(childProcess.execSync).mockReturnValue(JSON.stringify(mockOutput));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    runSimilarCodeReport();

    expect(logSpy).toHaveBeenCalled();
    const loggedJson = logSpy.mock.calls.find((call) => {
      try {
        const parsed = JSON.parse(call[0] as string);
        return Array.isArray(parsed) && parsed.length === 1;
      } catch {
        return false;
      }
    });
    expect(loggedJson).toBeDefined();

    logSpy.mockRestore();
  });

  it('filters same file candidates unless --include-same-file is passed', () => {
    process.argv = ['node', 'report_similar_code.ts', '--json'];

    const mockOutput = {
      candidates: [
        {
          similarity: 0.99,
          left: { path: 'src/a.ts', name: 'func1', start_line: 10 },
          right: { path: 'src/a.ts', name: 'func2', start_line: 40 }
        },
        {
          similarity: 0.96,
          left: { path: 'src/a.ts', name: 'funcA', start_line: 10 },
          right: { path: 'src/b.ts', name: 'funcB', start_line: 25 }
        }
      ]
    };

    vi.mocked(childProcess.execSync).mockReturnValue(JSON.stringify(mockOutput));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    runSimilarCodeReport();

    const loggedCall = logSpy.mock.calls.find((call) => {
      try {
        const parsed = JSON.parse(call[0] as string);
        return Array.isArray(parsed);
      } catch {
        return false;
      }
    });
    const parsed = JSON.parse(loggedCall![0] as string);
    // Should filter out the same-file candidate (src/a.ts === src/a.ts)
    expect(parsed.length).toBe(1);
    expect(parsed[0].right.path).toBe('src/b.ts');

    logSpy.mockRestore();
  });

  it('renders clean message when no duplicates are found', () => {
    process.argv = ['node', 'report_similar_code.ts'];

    vi.mocked(childProcess.execSync).mockReturnValue(JSON.stringify({ candidates: [] }));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    runSimilarCodeReport();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No se detectaron duplicados semánticos'));

    logSpy.mockRestore();
  });

  it('renders box table when duplicates are detected in terminal mode', () => {
    process.argv = ['node', 'report_similar_code.ts', '--threshold', '0.90', '--min-lines', '5'];

    const mockOutput = {
      candidates: [
        {
          similarity: 0.96,
          left: { path: 'src/utils/very_long_file_name_left.ts', name: 'veryLongFunctionNameLeftA', start_line: 10 },
          right: { path: 'src/utils/very_long_file_name_right.ts', name: 'veryLongFunctionNameRightB', start_line: 25 }
        }
      ]
    };

    vi.mocked(childProcess.execSync).mockReturnValue(JSON.stringify(mockOutput));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    runSimilarCodeReport();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('CANDIDATOS DETECTADOS'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Total de pares semánticos detectados: 1'));

    logSpy.mockRestore();
  });
});
