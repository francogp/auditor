/**
 * tests/setup_env.test.ts
 *
 * Unit tests for cross-platform environment setup runner (runSetup).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'node:child_process';
import path from 'node:path';
import { runSetup } from '../src/cli/setup_env.ts';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof childProcess>();
  return {
    ...actual,
    spawnSync: vi.fn()
  };
});

describe('setup_env CLI', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true
    });
  });

  it('delegates to powershell.exe on win32 platform', () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true
    });

    vi.mocked(childProcess.spawnSync).mockReturnValue({
      status: 0
    } as unknown as ReturnType<typeof childProcess.spawnSync>);

    const code = runSetup(['--dry-run']);

    expect(code).toBe(0);
    expect(childProcess.spawnSync).toHaveBeenCalledTimes(1);
    const callWin = vi.mocked(childProcess.spawnSync).mock.calls[0];
    expect(callWin).toBeDefined();
    const [command, args, options] = callWin!;
    expect(command).toBe('powershell.exe');
    expect(args).toContain('-ExecutionPolicy');
    expect(args).toContain('Bypass');
    expect(args).toContain('-File');
    const scriptPath = path.resolve(process.cwd(), 'setup-windows.ps1');
    expect(args).toContain(scriptPath);
    expect(args).toContain('--dry-run');
    expect(options?.cwd).toBe(process.cwd());
  });

  it('delegates to bash on linux platform', () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true
    });

    vi.mocked(childProcess.spawnSync).mockReturnValue({
      status: 0
    } as unknown as ReturnType<typeof childProcess.spawnSync>);

    const code = runSetup(['--force']);

    expect(code).toBe(0);
    expect(childProcess.spawnSync).toHaveBeenCalledTimes(1);
    const callLinux = vi.mocked(childProcess.spawnSync).mock.calls[0];
    expect(callLinux).toBeDefined();
    const [command, args, options] = callLinux!;
    expect(command).toBe('bash');
    const scriptPath = path.resolve(process.cwd(), 'setup-linux.sh');
    expect(args).toEqual([scriptPath, '--force']);
    expect(options?.cwd).toBe(process.cwd());
  });

  it('propagates non-zero exit status', () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true
    });

    vi.mocked(childProcess.spawnSync).mockReturnValue({
      status: 42
    } as unknown as ReturnType<typeof childProcess.spawnSync>);

    const code = runSetup();
    expect(code).toBe(42);
  });

  it('defaults to 0 when proc.status is null', () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true
    });

    vi.mocked(childProcess.spawnSync).mockReturnValue({
      status: null
    } as unknown as ReturnType<typeof childProcess.spawnSync>);

    const code = runSetup();
    expect(code).toBe(0);
  });
});
