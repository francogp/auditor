/**
 * tests/cli_permission_execution.test.ts
 *
 * Validates that CLI commands and sub-auditors run cleanly under
 * Node.js 26 permissions model without failing with ERR_DLOPEN_DISABLED
 * or missing permission flags.
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
    expect(result.stdout).toContain('Available commands');
    expect(result.stderr).not.toContain('ERR_DLOPEN_DISABLED');
  });

  it('executes npm run auditor:magic help without ERR_DLOPEN_DISABLED', () => {
    const result = childProcess.spawnSync('npm', ['run', 'auditor:magic', 'help'], {
      encoding: 'utf8',
      shell: true
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('npm run auditor:magic');
    expect(result.stderr).not.toContain('ERR_DLOPEN_DISABLED');
  });

  it('executes npm run auditor:motion help without ERR_DLOPEN_DISABLED', () => {
    const result = childProcess.spawnSync('npm', ['run', 'auditor:motion', 'help'], {
      encoding: 'utf8',
      shell: true
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage via project npm scripts');
    expect(result.stderr).not.toContain('ERR_DLOPEN_DISABLED');
  });

  it('executes npm run auditor:types help without ERR_DLOPEN_DISABLED', () => {
    const result = childProcess.spawnSync('npm', ['run', 'auditor:types', 'help'], {
      encoding: 'utf8',
      shell: true
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage via project npm scripts');
    expect(result.stderr).not.toContain('ERR_DLOPEN_DISABLED');
  });

  it('executes npm run auditor:o1 help without ERR_DLOPEN_DISABLED', () => {
    const result = childProcess.spawnSync('npm', ['run', 'auditor:o1', 'help'], {
      encoding: 'utf8',
      shell: true
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage via project npm scripts');
    expect(result.stderr).not.toContain('ERR_DLOPEN_DISABLED');
  });
});
