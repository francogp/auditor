/**
 * tests/report_review.test.ts
 *
 * Unit tests for fallow review report CLI tool (runReviewReport).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'node:child_process';
import { runReviewReport } from '../src/cli/report_review.ts';
import * as similarCodeModule from '../src/suites/architecture/validate_similar_code.ts';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof childProcess>();
  return {
    ...actual,
    spawnSync: vi.fn()
  };
});

vi.mock('../src/suites/architecture/validate_similar_code.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof similarCodeModule>();
  return {
    ...actual,
    resolveFallowBinary: vi.fn()
  };
});

describe('report_review CLI', () => {
  const originalArgv = [...process.argv];
  const fakeFallowBin = '/mock/node_modules/fallow/bin/fallow.js';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(similarCodeModule.resolveFallowBinary).mockReturnValue(fakeFallowBin);
  });

  afterEach(() => {
    process.argv = [...originalArgv];
  });

  it('exits with error when fallow binary is not found', () => {
    vi.mocked(similarCodeModule.resolveFallowBinary).mockReturnValue(null);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit:${code}`);
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => runReviewReport('/some/dir')).toThrow('process.exit:1');
    expect(errSpy).toHaveBeenCalled();

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('runs review with --base option', () => {
    process.argv = ['node', 'report_review.ts', '--base', 'origin/main'];

    vi.mocked(childProcess.spawnSync).mockReturnValue({
      status: 0
    } as unknown as ReturnType<typeof childProcess.spawnSync>);

    runReviewReport('/dummy/root');

    expect(childProcess.spawnSync).toHaveBeenCalledTimes(1);
    const call = vi.mocked(childProcess.spawnSync).mock.calls[0];
    expect(call).toBeDefined();
    const [cmd, args, opts] = call!;
    expect(cmd).toBe('node');
    expect(args).toContain('review');
    expect(args).toContain('--base');
    expect(args).toContain('origin/main');
    expect(opts?.cwd).toBe('/dummy/root');
  });

  it('runs review with --changed-since option', () => {
    process.argv = ['node', 'report_review.ts', '--changed-since', 'HEAD~3'];

    vi.mocked(childProcess.spawnSync).mockReturnValue({
      status: 0
    } as unknown as ReturnType<typeof childProcess.spawnSync>);

    runReviewReport('/dummy/root');

    expect(childProcess.spawnSync).toHaveBeenCalledTimes(1);
    const call = vi.mocked(childProcess.spawnSync).mock.calls[0];
    expect(call).toBeDefined();
    const [, args] = call!;
    expect(args).toContain('--changed-since');
    expect(args).toContain('HEAD~3');
  });

  it('runs review with positional commit ref as changed-since', () => {
    process.argv = ['node', 'report_review.ts', 'main...HEAD'];

    vi.mocked(childProcess.spawnSync).mockReturnValue({
      status: 0
    } as unknown as ReturnType<typeof childProcess.spawnSync>);

    runReviewReport('/dummy/root');

    expect(childProcess.spawnSync).toHaveBeenCalledTimes(1);
    const call = vi.mocked(childProcess.spawnSync).mock.calls[0];
    expect(call).toBeDefined();
    const [, args] = call!;
    expect(args).toContain('--changed-since');
    expect(args).toContain('main...HEAD');
  });

  it('runs review with --json passing --format json', () => {
    process.argv = ['node', 'report_review.ts', '--json'];

    vi.mocked(childProcess.spawnSync).mockReturnValue({
      status: 0
    } as unknown as ReturnType<typeof childProcess.spawnSync>);

    runReviewReport('/dummy/root');

    expect(childProcess.spawnSync).toHaveBeenCalledTimes(1);
    const call = vi.mocked(childProcess.spawnSync).mock.calls[0];
    expect(call).toBeDefined();
    const [, args] = call!;
    expect(args).toContain('--format');
    expect(args).toContain('json');
  });

  it('propagates non-zero child process status to process.exit', () => {
    process.argv = ['node', 'report_review.ts'];

    vi.mocked(childProcess.spawnSync).mockReturnValue({
      status: 3
    } as unknown as ReturnType<typeof childProcess.spawnSync>);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit:${code}`);
    });

    expect(() => runReviewReport('/dummy/root')).toThrow('process.exit:3');

    exitSpy.mockRestore();
  });
});
