/**
 * tests/sync_env_scripts.test.ts
 *
 * Unit tests for sync_env_scripts CLI utility.
 */

import * as childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

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
      /* non-fatal test cleanup */
    }
  });

  it('synchronizes canonical setup scripts and initializes plugins structure', () => {
    const result = syncEnvScripts({ targetDir: tempDir });

    expect(result.success).toBe(true);
    expect(result.filesUpdated).toContain('setup-linux.sh');
    expect(result.filesUpdated).toContain('setup-windows.ps1');
    expect(result.filesUpdated).toContain('update-linux.sh');
    expect(result.filesUpdated).toContain('update-windows.ps1');

    // Verify scripts exist in targetDir
    expect(fs.existsSync(path.join(tempDir, 'setup-linux.sh'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'setup-windows.ps1'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'update-linux.sh'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'update-windows.ps1'))).toBe(true);

    // Verify executable permissions on POSIX
    if (process.platform !== 'win32') {
      const linuxSetupStat = fs.statSync(path.join(tempDir, 'setup-linux.sh'));
      const linuxUpdateStat = fs.statSync(path.join(tempDir, 'update-linux.sh'));
      expect(linuxSetupStat.mode & 0o111).toBeGreaterThan(0);
      expect(linuxUpdateStat.mode & 0o111).toBeGreaterThan(0);
    }

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

  it('runs idempotently when setup scripts are already present and up to date', () => {
    const firstRun = syncEnvScripts({ targetDir: tempDir });
    expect(firstRun.success).toBe(true);

    const secondRun = syncEnvScripts({ targetDir: tempDir });
    expect(secondRun.success).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'setup-linux.sh'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'setup-windows.ps1'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'update-linux.sh'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'update-windows.ps1'))).toBe(true);
  });

  it('guarantees all canonical environment scripts are strictly 7-bit ASCII', () => {
    const canonicalFiles = [
      'setup-linux.sh',
      'setup-windows.ps1',
      'update-linux.sh',
      'update-windows.ps1',
      '.agents/skills/auditor/references/plugins/01-docker-db.ps1',
      '.agents/skills/auditor/references/plugins/01-docker-db.sh',
      '.agents/skills/auditor/references/plugins/02-local-ssl-certs.ps1',
      '.agents/skills/auditor/references/plugins/02-local-ssl-certs.sh'
    ];

    for (const relPath of canonicalFiles) {
      const fullPath = path.resolve(process.cwd(), relPath);
      if (!fs.existsSync(fullPath)) continue;
      const buffer = fs.readFileSync(fullPath);
      for (let i = 0; i < buffer.length; i++) {
        const byte = buffer[i]!;
        if (byte > 0x7f) {
          throw new Error(
            `Non-ASCII byte (0x${byte.toString(16).toUpperCase()}) detected in ${relPath} at offset ${i}`
          );
        }
      }
    }
  });

  it('verifies setup-windows.ps1 parses with zero syntax errors in PowerShell', () => {
    if (process.platform !== 'win32') return;

    const ps1Path = path.resolve(process.cwd(), 'setup-windows.ps1');

    const testScript = [
      '$errs = $null;',
      '$nullRef = $null;',
      `$inputScript = [System.IO.File]::ReadAllText('${ps1Path.replace(/'/g, "''")}');`,
      '[System.Management.Automation.Language.Parser]::ParseInput($inputScript, [ref]$nullRef, [ref]$errs) | Out-Null;',
      'if ($errs -and $errs.Count -gt 0) {',
      '  $errs | ForEach-Object { Write-Output ("SYNTAX_ERROR:" + $_.Message) }',
      '} else {',
      '  Write-Output "PERFECT_PARSE"',
      '}'
    ].join('\n');

    const proc = childProcess.spawnSync('powershell.exe', ['-NoProfile', '-Command', testScript], {
      encoding: 'utf8'
    });

    expect(proc.status).toBe(0);
    expect(proc.stdout).toContain('PERFECT_PARSE');
    expect(proc.stdout).not.toContain('SYNTAX_ERROR');
  });
});
