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
import { fileURLToPath } from 'node:url';

export function runSetup(args: string[] = process.argv.slice(2)): number {
  const isWindows = process.platform === 'win32';
  const targetDir = process.cwd();

  if (isWindows) {
    const scriptPath = path.resolve(targetDir, 'setup-windows.ps1');
    const psArgs = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args];
    const proc = spawnSync('powershell.exe', psArgs, {
      stdio: 'inherit',
      cwd: targetDir
    });
    return proc.status ?? 0;
  } else {
    const scriptPath = path.resolve(targetDir, 'setup-linux.sh');
    const proc = spawnSync('bash', [scriptPath, ...args], {
      stdio: 'inherit',
      cwd: targetDir
    });
    return proc.status ?? 0;
  }
}

// CLI entrypoint
const isDirectCli = process.argv[1] && (() => {
  try {
    return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
})();
if (isDirectCli) {
  const code = runSetup();
  process.exit(code);
}
