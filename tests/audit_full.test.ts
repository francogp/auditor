/**
 * tests/audit_full.test.ts
 *
 * Unit tests for audit_full CLI master runner entrypoint and version query.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runMasterAudit } from '../src/cli/audit_full.ts';

describe('audit_full Master Orchestrator', () => {
  let originalArgv: string[];
  let originalExit: typeof process.exit;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalArgv = [...process.argv];
    originalExit = process.exit;
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    vi.restoreAllMocks();
  });

  it('prints version and exits with code 0 when invoked with -v flag', async () => {
    process.argv = ['node', 'audit_full.ts', '-v'];
    const mockExit = vi.fn() as unknown as typeof process.exit;
    process.exit = mockExit;

    await runMasterAudit();

    expect(mockExit).toHaveBeenCalledWith(0);
    expect(consoleLogSpy).toHaveBeenCalled();
    const logOutput = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(logOutput).toContain('@francogp/auditor');
  });

  it('prints version and exits with code 0 when invoked with --version flag', async () => {
    process.argv = ['node', 'audit_full.ts', '--version'];
    const mockExit = vi.fn() as unknown as typeof process.exit;
    process.exit = mockExit;

    await runMasterAudit();

    expect(mockExit).toHaveBeenCalledWith(0);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('formats version output with semantic versioning syntax', async () => {
    process.argv = ['node', 'audit_full.ts', '-v'];
    const mockExit = vi.fn() as unknown as typeof process.exit;
    process.exit = mockExit;

    await runMasterAudit();

    expect(mockExit).toHaveBeenCalledWith(0);
    const logOutput = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(logOutput).toMatch(/v?\d+\.\d+\.\d+/);
  });
});
