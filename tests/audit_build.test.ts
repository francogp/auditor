/**
 * tests/audit_build.test.ts
 *
 * Unit tests for post-build audit CLI execution (runAuditBuild).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { runAuditBuild } from '../src/cli/audit_build.ts';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof childProcess>();
  return {
    ...actual,
    spawn: vi.fn()
  };
});

describe('audit_build CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('spawns child process targeting audit_full with preset=build and returns exit code 0 on success', async () => {
    const fakeChild = new EventEmitter() as unknown as childProcess.ChildProcess;
    vi.mocked(childProcess.spawn).mockImplementation((_cmd, _args, _opts) => {
      setTimeout(() => {
        fakeChild.emit('close', 0);
      }, 5);
      return fakeChild;
    });

    const code = await runAuditBuild(['--verbose']);

    expect(code).toBe(0);
    expect(childProcess.spawn).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(childProcess.spawn).mock.calls[0];
    expect(callArgs).toBeDefined();
    expect(callArgs![0]).toBe(process.execPath);
    const nodeArgs = callArgs![1] as string[];
    expect(nodeArgs).toContain('preset=build');
    expect(nodeArgs).toContain('--verbose');
  });

  it('propagates non-zero exit code on audit failure', async () => {
    const fakeChild = new EventEmitter() as unknown as childProcess.ChildProcess;
    vi.mocked(childProcess.spawn).mockImplementation((_cmd, _args, _opts) => {
      setTimeout(() => {
        fakeChild.emit('close', 2);
      }, 5);
      return fakeChild;
    });

    const code = await runAuditBuild();
    expect(code).toBe(2);
  });

  it('handles null exit code by defaulting to 0', async () => {
    const fakeChild = new EventEmitter() as unknown as childProcess.ChildProcess;
    vi.mocked(childProcess.spawn).mockImplementation((_cmd, _args, _opts) => {
      setTimeout(() => {
        fakeChild.emit('close', null);
      }, 5);
      return fakeChild;
    });

    const code = await runAuditBuild();
    expect(code).toBe(0);
  });
});
