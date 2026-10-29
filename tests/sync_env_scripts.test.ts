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

function findWorkingBashBinary(): string | null {
  for (const candidate of ['bash', 'sh']) {
    try {
      const probe = childProcess.spawnSync(candidate, ['-c', 'echo BASH_OK'], {
        encoding: 'utf8'
      });
      if (probe.status === 0 && probe.stdout.includes('BASH_OK')) {
        return candidate;
      }
    } catch {
      // Continue searching
    }
  }
  return null;
}

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

  it('verifies setup-linux.sh parses with zero syntax errors in bash when available', () => {
    const bashBinary = findWorkingBashBinary();
    if (!bashBinary) {
      return;
    }

    const scriptPath = path.resolve('setup-linux.sh');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');

    const proc = childProcess.spawnSync(bashBinary, ['-n', '-s'], {
      input: scriptContent,
      encoding: 'utf8'
    });

    expect(proc.status).toBe(0);
    expect(proc.stderr || '').toBe('');
  });

  it('verifies packageManager and npm engines synchronization regex logic', () => {
    const originalPkg = JSON.stringify(
      {
        name: 'test-project',
        version: '1.0.0',
        packageManager: 'npm@10.2.0',
        engines: {
          node: '>=26.0.0',
          npm: '>=10.2.0'
        }
      },
      null,
      2
    );

    const testFile = path.join(tempDir, 'package.json');
    fs.writeFileSync(testFile, originalPkg, 'utf8');

    const newVer = '11.5.0';

    // Verify regex substitution logic matching setup-windows.ps1 & setup-linux.sh
    let raw = fs.readFileSync(testFile, 'utf8');
    raw = raw.replace(/("npm":\s*">=)[^"]*(")/g, `$1${newVer}$2`);
    raw = raw.replace(/("packageManager":\s*"npm@)[^"]*(")/g, `$1${newVer}$2`);
    fs.writeFileSync(testFile, raw, 'utf8');

    const updated = JSON.parse(fs.readFileSync(testFile, 'utf8'));
    expect(updated.packageManager).toBe(`npm@${newVer}`);
    expect(updated.engines.npm).toBe(`>=${newVer}`);

    // If on Windows, test the exact PowerShell command block
    if (process.platform === 'win32') {
      const psTestScript = [
        `$pkgPath = '${testFile.replace(/'/g, "''")}';`,
        `$newNpmVer = '12.0.1';`,
        '$rawPkg = [System.IO.File]::ReadAllText($pkgPath);',
        '$rawPkg = $rawPkg -replace \'("npm":\\s*">=)[^"]*(")\', "`${1}$newNpmVer`${2}";',
        '$rawPkg = $rawPkg -replace \'("packageManager":\\s*"npm@)[^"]*(")\', "`${1}$newNpmVer`${2}";',
        '[System.IO.File]::WriteAllText($pkgPath, $rawPkg);',
        'Write-Output "SYNCED_OK";'
      ].join('\n');

      const psProc = childProcess.spawnSync(
        'powershell.exe',
        ['-NoProfile', '-Command', psTestScript],
        {
          encoding: 'utf8'
        }
      );

      expect(psProc.status).toBe(0);
      expect(psProc.stdout).toContain('SYNCED_OK');

      const psUpdated = JSON.parse(fs.readFileSync(testFile, 'utf8'));
      expect(psUpdated.packageManager).toBe('npm@12.0.1');
      expect(psUpdated.engines.npm).toBe('>=12.0.1');
    }
  });

  it('verifies packageManager injection when missing from package.json', () => {
    const pkgWithoutPackageManager = JSON.stringify(
      {
        name: 'legacy-project',
        version: '1.0.0',
        engines: {
          node: '>=26.0.0',
          npm: '>=10.2.0'
        }
      },
      null,
      2
    );

    const testFile = path.join(tempDir, 'package.json');
    fs.writeFileSync(testFile, pkgWithoutPackageManager, 'utf8');

    const newVer = '11.8.0';

    // Verify injection logic matching setup-windows.ps1 & setup-linux.sh
    let raw = fs.readFileSync(testFile, 'utf8');
    if (!/("packageManager":\s*")[^"]*(")/.test(raw)) {
      if (/("name":\s*"[^"]*"\s*,)/.test(raw)) {
        raw = raw.replace(/("name":\s*"[^"]*"\s*,)/, `$1\n  "packageManager": "npm@${newVer}",`);
      } else if (/("name":\s*"[^"]*")/.test(raw)) {
        raw = raw.replace(/("name":\s*"[^"]*")/, `$1,\n  "packageManager": "npm@${newVer}"`);
      }
      fs.writeFileSync(testFile, raw, 'utf8');
    }

    const updated = JSON.parse(fs.readFileSync(testFile, 'utf8'));
    expect(updated.packageManager).toBe(`npm@${newVer}`);

    // If on Windows, test the exact PowerShell injection block
    if (process.platform === 'win32') {
      fs.writeFileSync(testFile, pkgWithoutPackageManager, 'utf8');

      const psTestScript = [
        `$pkgPath = '${testFile.replace(/'/g, "''")}';`,
        `$newNpmVer = '12.4.0';`,
        '$rawPkg = [System.IO.File]::ReadAllText($pkgPath);',
        'if ($rawPkg -match \'("packageManager":\\s*")[^"]*(")\') {',
        '    $rawPkg = $rawPkg -replace \'("packageManager":\\s*")[^"]*(")\', "`${1}npm@$newNpmVer`${2}";',
        '} elseif ($rawPkg -match \'("name":\\s*"[^"]*"\\s*,)\') {',
        '    $rawPkg = $rawPkg -replace \'("name":\\s*"[^"]*"\\s*,)\', "`$1`n  `"packageManager`": `"npm@$newNpmVer`",";',
        '} elseif ($rawPkg -match \'("name":\\s*"[^"]*")\') {',
        '    $rawPkg = $rawPkg -replace \'("name":\\s*"[^"]*")\', "`$1,`n  `"packageManager`": `"npm@$newNpmVer`"";',
        '}',
        '[System.IO.File]::WriteAllText($pkgPath, $rawPkg);',
        'Write-Output "INJECTED_OK";'
      ].join('\n');

      const psProc = childProcess.spawnSync(
        'powershell.exe',
        ['-NoProfile', '-Command', psTestScript],
        {
          encoding: 'utf8'
        }
      );

      expect(psProc.status).toBe(0);
      expect(psProc.stdout).toContain('INJECTED_OK');

      const psUpdated = JSON.parse(fs.readFileSync(testFile, 'utf8'));
      expect(psUpdated.packageManager).toBe('npm@12.4.0');
    }
  });

  it('replaces alternative package managers (pnpm, yarn) without creating duplicate keys', () => {
    const pkgWithPnpm = JSON.stringify(
      {
        name: 'pnpm-project',
        version: '1.0.0',
        packageManager: 'pnpm@9.12.0',
        engines: {
          node: '>=26.0.0'
        }
      },
      null,
      2
    );

    const testFile = path.join(tempDir, 'package.json');
    fs.writeFileSync(testFile, pkgWithPnpm, 'utf8');

    const newVer = '11.9.0';
    let raw = fs.readFileSync(testFile, 'utf8');
    raw = raw.replace(/("packageManager":\s*")[^"]*(")/, `$1npm@${newVer}$2`);
    fs.writeFileSync(testFile, raw, 'utf8');

    const updated = JSON.parse(fs.readFileSync(testFile, 'utf8'));
    expect(updated.packageManager).toBe(`npm@${newVer}`);
    // Count occurrences of packageManager
    const matches = raw.match(/"packageManager"/g);
    expect(matches?.length).toBe(1);
  });

  it('safely handles package.json when name has no trailing comma', () => {
    const pkgWithoutComma = '{\n  "name": "no-comma-project"\n}';
    const testFile = path.join(tempDir, 'package.json');
    fs.writeFileSync(testFile, pkgWithoutComma, 'utf8');

    const newVer = '11.9.0';
    let raw = fs.readFileSync(testFile, 'utf8');
    if (!/("packageManager":\s*")[^"]*(")/.test(raw)) {
      if (/("name":\s*"[^"]*"\s*,)/.test(raw)) {
        raw = raw.replace(/("name":\s*"[^"]*"\s*,)/, `$1\n  "packageManager": "npm@${newVer}",`);
      } else if (/("name":\s*"[^"]*")/.test(raw)) {
        raw = raw.replace(/("name":\s*"[^"]*")/, `$1,\n  "packageManager": "npm@${newVer}"`);
      }
      fs.writeFileSync(testFile, raw, 'utf8');
    }

    // Must parse as valid JSON without throwing syntax error
    const parsed = JSON.parse(fs.readFileSync(testFile, 'utf8'));
    expect(parsed.name).toBe('no-comma-project');
    expect(parsed.packageManager).toBe(`npm@${newVer}`);
  });

  it('executes setup-linux.sh sed commands in bash when available', () => {
    const bashBinary = findWorkingBashBinary();
    if (!bashBinary) {
      return;
    }

    const testFile = path.join(tempDir, 'package.json');
    const posixWinPath = testFile.replaceAll(path.win32.sep, path.posix.sep);
    const newNpmVer = '12.3.4';

    // 1. Test replacement of existing pnpm packageManager and npm engines
    const pkgWithPnpm = JSON.stringify(
      {
        name: 'test-linux-pnpm',
        version: '1.0.0',
        packageManager: 'pnpm@9.5.0',
        engines: {
          node: '>=26.0.0',
          npm: '>=10.0.0'
        }
      },
      null,
      2
    );
    fs.writeFileSync(testFile, pkgWithPnpm, 'utf8');

    const runnerScript = [
      'PKG_PATH="$1"',
      'NEW_NPM_VER="$2"',
      'if command -v wslpath >/dev/null 2>&1; then',
      '    PKG_PATH=$(wslpath -u "$PKG_PATH")',
      'elif command -v cygpath >/dev/null 2>&1; then',
      '    PKG_PATH=$(cygpath -u "$PKG_PATH")',
      'fi',
      'if grep -q \'"npm":\' "$PKG_PATH"; then',
      '    sed -i -E "s/(\\"npm\\": *\\">=)[^\\"]*(\\")/' + '\\1$NEW_NPM_VER\\2/' + '" "$PKG_PATH"',
      'fi',
      'if grep -q \'"packageManager":\' "$PKG_PATH"; then',
      '    sed -i -E "s/(\\"packageManager\\": *\\")[^\\"]*(\\")/' +
        '\\1npm@$NEW_NPM_VER\\2/' +
        '" "$PKG_PATH"',
      'elif grep -E -q \'"name": *"[^"]*", *(\r)?$\' "$PKG_PATH"; then',
      '    sed -i -E "s/(\\"name\\": *\\"[^\\"]*\\",)(\\r)?$/' +
        '\\1\\n  \\"packageManager\\": \\"npm@$NEW_NPM_VER\\",\\2/' +
        '" "$PKG_PATH"',
      'elif grep -q \'"name":\' "$PKG_PATH"; then',
      '    sed -i -E "s/(\\"name\\": *\\"[^\\"]*\\")(\\r)?$/' +
        '\\1,\\n  \\"packageManager\\": \\"npm@$NEW_NPM_VER\\"\\2/' +
        '" "$PKG_PATH"',
      'fi',
      'echo "BASH_RUNNER_DONE"'
    ].join('\n');

    const proc1 = childProcess.spawnSync(bashBinary, ['-s', '--', posixWinPath, newNpmVer], {
      input: runnerScript,
      encoding: 'utf8'
    });
    expect(proc1.status).toBe(0);
    expect(proc1.stdout).toContain('BASH_RUNNER_DONE');

    const parsed1 = JSON.parse(fs.readFileSync(testFile, 'utf8'));
    expect(parsed1.packageManager).toBe(`npm@${newNpmVer}`);
    expect(parsed1.engines.npm).toBe(`>=${newNpmVer}`);

    // 2. Test injection when name has trailing comma and packageManager is missing
    const pkgWithComma = '{\n  "name": "linux-comma",\n  "version": "1.0.0"\n}';
    fs.writeFileSync(testFile, pkgWithComma, 'utf8');

    const proc2 = childProcess.spawnSync(bashBinary, ['-s', '--', posixWinPath, newNpmVer], {
      input: runnerScript,
      encoding: 'utf8'
    });
    expect(proc2.status).toBe(0);
    expect(proc2.stdout).toContain('BASH_RUNNER_DONE');

    const parsed2 = JSON.parse(fs.readFileSync(testFile, 'utf8'));
    expect(parsed2.packageManager).toBe(`npm@${newNpmVer}`);

    // 3. Test injection when name has NO trailing comma
    const pkgWithoutComma = '{\n  "name": "linux-no-comma"\n}';
    fs.writeFileSync(testFile, pkgWithoutComma, 'utf8');

    const proc3 = childProcess.spawnSync(bashBinary, ['-s', '--', posixWinPath, newNpmVer], {
      input: runnerScript,
      encoding: 'utf8'
    });
    expect(proc3.status).toBe(0);

    const parsed3 = JSON.parse(fs.readFileSync(testFile, 'utf8'));
    expect(parsed3.name).toBe('linux-no-comma');
    expect(parsed3.packageManager).toBe(`npm@${newNpmVer}`);

    // 4. Test injection with CRLF line endings
    const pkgWithCrlf = '{\r\n  "name": "linux-crlf",\r\n  "version": "1.0.0"\r\n}';
    fs.writeFileSync(testFile, pkgWithCrlf, 'utf8');

    const proc4 = childProcess.spawnSync(bashBinary, ['-s', '--', posixWinPath, newNpmVer], {
      input: runnerScript,
      encoding: 'utf8'
    });
    expect(proc4.status).toBe(0);

    const parsed4 = JSON.parse(fs.readFileSync(testFile, 'utf8'));
    expect(parsed4.name).toBe('linux-crlf');
    expect(parsed4.packageManager).toBe(`npm@${newNpmVer}`);

    // 5. Does not inject duplicate packageManager inside nested author.name objects in setup-linux.sh
    const pkgWithAuthorName = [
      '{',
      '  "name": "nested-author-pkg",',
      '  "author": {',
      '    "name": "Franco",',
      '    "email": "test@example.com"',
      '  },',
      '  "version": "1.0.0"',
      '}'
    ].join('\n');
    fs.writeFileSync(testFile, pkgWithAuthorName, 'utf8');

    const setupLinuxRaw = fs.readFileSync(path.resolve('setup-linux.sh'), 'utf8');
    const sedBlockMatch = setupLinuxRaw.match(
      /if grep -q '"packageManager":' "\$PKG_PATH"; then[\s\S]*?fi/
    );
    expect(sedBlockMatch).not.toBeNull();

    const realSedRunner = [
      'PKG_PATH="$1"',
      'NEW_NPM_VER="$2"',
      'if command -v wslpath >/dev/null 2>&1; then',
      '    PKG_PATH=$(wslpath -u "$PKG_PATH")',
      'elif command -v cygpath >/dev/null 2>&1; then',
      '    PKG_PATH=$(cygpath -u "$PKG_PATH")',
      'fi',
      sedBlockMatch![0],
      'echo "REAL_SED_DONE"'
    ].join('\n');

    const proc5 = childProcess.spawnSync(bashBinary, ['-s', '--', posixWinPath, newNpmVer], {
      input: realSedRunner,
      encoding: 'utf8'
    });
    expect(proc5.status).toBe(0);
    const rawAfterSed = fs.readFileSync(testFile, 'utf8');
    expect(rawAfterSed.match(/"packageManager"/g)?.length).toBe(1);
    const parsed5 = JSON.parse(rawAfterSed);
    expect(parsed5.packageManager).toBe(`npm@${newNpmVer}`);
    expect((parsed5.author as Record<string, unknown>).packageManager).toBeUndefined();
  });
});
