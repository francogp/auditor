/**
 * tests/auditor_environment.test.ts
 *
 * Exhaustive unit tests for auditorEnvironment module and build_deploy CLI.
 */

import * as childProcess from 'node:child_process';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vite-plus/test';

import { runBuildDeploy } from '../src/cli/build_deploy.ts';
import { isProductionEnvironment } from '../src/core/auditorEnvironment.ts';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof childProcess>();
  const mockSpawn = vi.fn();
  return {
    ...actual,
    spawnSync: mockSpawn,
    default: {
      ...actual,
      spawnSync: mockSpawn
    }
  };
});

describe('auditorEnvironment', () => {
  const originalEnv = process.env.AUDITOR_ENV;

  beforeEach(() => {
    delete process.env.AUDITOR_ENV;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.AUDITOR_ENV = originalEnv;
    } else {
      delete process.env.AUDITOR_ENV;
    }
  });

  describe('isProductionEnvironment', () => {
    it('returns false when AUDITOR_ENV is undefined or empty', () => {
      expect(isProductionEnvironment()).toBe(false);
      process.env.AUDITOR_ENV = '';
      expect(isProductionEnvironment()).toBe(false);
    });

    it('returns false when AUDITOR_ENV is development, staging, or test', () => {
      process.env.AUDITOR_ENV = 'development';
      expect(isProductionEnvironment()).toBe(false);
      process.env.AUDITOR_ENV = 'staging';
      expect(isProductionEnvironment()).toBe(false);
      process.env.AUDITOR_ENV = 'test';
      expect(isProductionEnvironment()).toBe(false);
    });

    it('returns false when AUDITOR_ENV has different casing or surrounding whitespace', () => {
      process.env.AUDITOR_ENV = 'Production';
      expect(isProductionEnvironment()).toBe(false);
      process.env.AUDITOR_ENV = 'PRODUCTION';
      expect(isProductionEnvironment()).toBe(false);
      process.env.AUDITOR_ENV = ' production ';
      expect(isProductionEnvironment()).toBe(false);
    });

    it('returns true strictly and exclusively when AUDITOR_ENV is production', () => {
      process.env.AUDITOR_ENV = 'production';
      expect(isProductionEnvironment()).toBe(true);
    });
  });

  describe('runBuildDeploy CLI', () => {
    it('sets AUDITOR_ENV to production and spawns npm run build with status 0', () => {
      vi.mocked(childProcess.spawnSync).mockReturnValue({
        status: 0,
        pid: 1234,
        output: [],
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null
      });

      const exitCode = runBuildDeploy();

      expect(exitCode).toBe(0);
      expect(process.env.AUDITOR_ENV).toBe('production');
      expect(isProductionEnvironment()).toBe(true);
      expect(childProcess.spawnSync).toHaveBeenCalledTimes(1);

      const [cmd, args, opts] = vi.mocked(childProcess.spawnSync).mock.calls[0]!;
      const expectedNpm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      expect(cmd).toBe(expectedNpm);
      expect(args).toEqual(['run', 'build']);
      expect(opts).toMatchObject({
        stdio: 'inherit',
        cwd: process.cwd()
      });
    });

    it('forwards extra command-line arguments to npm run build', () => {
      vi.mocked(childProcess.spawnSync).mockReturnValue({
        status: 0,
        pid: 1234,
        output: [],
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null
      });

      const exitCode = runBuildDeploy(['--', '--mode', 'production']);

      expect(exitCode).toBe(0);
      const [, args] = vi.mocked(childProcess.spawnSync).mock.calls[0]!;
      expect(args).toEqual(['run', 'build', '--', '--mode', 'production']);
    });

    it('propagates non-zero exit code from failed child build process', () => {
      vi.mocked(childProcess.spawnSync).mockReturnValue({
        status: 1,
        pid: 1234,
        output: [],
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null
      });

      const exitCode = runBuildDeploy();
      expect(exitCode).toBe(1);
    });

    it('defaults null exit status to 0 on clean exit', () => {
      vi.mocked(childProcess.spawnSync).mockReturnValue({
        status: null,
        pid: 1234,
        output: [],
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null
      });

      const exitCode = runBuildDeploy();
      expect(exitCode).toBe(0);
    });
  });
});
