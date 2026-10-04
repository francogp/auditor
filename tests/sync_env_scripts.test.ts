/**
 * tests/sync_env_scripts.test.ts
 *
 * Unit tests for sync_env_scripts CLI utility.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { syncEnvScripts } from '../src/cli/sync_env_scripts.ts';

describe('sync_env_scripts CLI Utility', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-sync-env-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok
    }
  });

  it('synchronizes canonical setup scripts and initializes plugins structure', () => {
    const result = syncEnvScripts({ targetDir: tempDir });

    expect(result.success).toBe(true);
    expect(result.filesUpdated).toContain('setup-linux.sh');
    expect(result.filesUpdated).toContain('setup-windows.ps1');

    // Verify scripts exist in targetDir
    expect(fs.existsSync(path.join(tempDir, 'setup-linux.sh'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'setup-windows.ps1'))).toBe(true);

    // Verify plugins directory initialized
    const pluginsDir = path.join(tempDir, 'scripts/setup/plugins');
    expect(fs.existsSync(pluginsDir)).toBe(true);
    expect(fs.existsSync(path.join(pluginsDir, '.gitkeep'))).toBe(true);
    expect(fs.existsSync(path.join(pluginsDir, '01_sample.sh.sample'))).toBe(true);
    expect(fs.existsSync(path.join(pluginsDir, '01_sample.ps1.sample'))).toBe(true);
  });

  it('honors dryRun option without creating files on disk', () => {
    const result = syncEnvScripts({ targetDir: tempDir, dryRun: true });

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'setup-linux.sh'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'scripts/setup/plugins'))).toBe(false);
  });
});
