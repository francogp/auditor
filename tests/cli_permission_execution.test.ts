// test-fragmentation-ok: Isolated CLI permission execution test suite below 60 line threshold
/**
 * tests/cli_permission_execution.test.ts
 *
 * Validates that CLI commands like `npm run auditor:dupes help` run cleanly under
 * Node.js 26 permissions model without failing with ERR_DLOPEN_DISABLED.
 */

import childProcess from 'node:child_process';

import { describe, it, expect } from 'vite-plus/test';

describe('CLI Commands Execution under Node.js 26 Permissions', () => {
  it('executes npm run auditor:dupes help without ERR_DLOPEN_DISABLED', () => {
    const result = childProcess.spawnSync('npm', ['run', 'auditor:dupes', 'help'], {
      encoding: 'utf8',
      shell: true
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Comandos disponibles');
    expect(result.stderr).not.toContain('ERR_DLOPEN_DISABLED');
  });
});
