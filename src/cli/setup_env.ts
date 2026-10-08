#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/setup_env.ts
 *
 * Cross-platform Environment Setup Orchestrator (Node.js 26+ Native)
 * Automatically delegates to setup-linux.sh or setup-windows.ps1 based on platform.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isMainModule } from './cliUtils.ts';

export function runSetup(args: string[] = process.argv.slice(2), targetDir: string = process.cwd()): number {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    const scriptPath = path.resolve(targetDir, 'setup-windows.ps1');
    if (!fs.existsSync(scriptPath)) {
      console.error(`[auditor-setup-env] Script no encontrado: ${scriptPath}`);
      return 1;
    }
    const psArgs = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args];
    const proc = spawnSync('powershell.exe', psArgs, {
      stdio: 'inherit',
      cwd: targetDir
    });
    return proc.status ?? 0;
  } else {
    const scriptPath = path.resolve(targetDir, 'setup-linux.sh');
    if (!fs.existsSync(scriptPath)) {
      console.error(`[auditor-setup-env] Script no encontrado: ${scriptPath}`);
      return 1;
    }
    const proc = spawnSync('bash', [scriptPath, ...args], {
      stdio: 'inherit',
      cwd: targetDir
    });
    return proc.status ?? 0;
  }
}

// CLI entrypoint
if (isMainModule(import.meta.url)) {
  const code = runSetup();
  process.exit(code);
}
