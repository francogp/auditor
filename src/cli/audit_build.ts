#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/audit_build.ts
 *
 * POST-BUILD ARTIFACT AUDITOR CLI (Node.js 26+ Native)
 * Executes exclusively sub-auditors declaring capabilities.requiresBuild === true
 * against compiled production artifacts in dist/.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isMainModule } from './cliUtils.ts';
import '../core/permissionGuard.ts';
import { DEFAULT_PERMISSIONS } from './auditTaskFactory.ts';

export async function runAuditBuild(extraArgs: readonly string[] = []): Promise<number> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const fullAuditorPath = path.resolve(currentDir, 'audit_full.ts');
  const fullAuditorJsPath = path.resolve(currentDir, 'audit_full.js');
  const targetScript = fs.existsSync(fullAuditorPath) ? fullAuditorPath : fullAuditorJsPath;

  const nodeArgs = [
    ...DEFAULT_PERMISSIONS,
    targetScript,
    'preset=build',
    ...extraArgs
  ];

  return new Promise<number>((resolve) => {
    const child = spawn(process.execPath, nodeArgs, {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env
    });

    child.on('close', (code) => {
      resolve(code ?? 0);
    });
  });
}

if (isMainModule(import.meta.url)) {
  const exitCode = await runAuditBuild(process.argv.slice(2));
  process.exit(exitCode);
}
