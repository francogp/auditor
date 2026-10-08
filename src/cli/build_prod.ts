#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/build_prod.ts
 *
 * PRODUCTION BUILD RUNNER CLI (Node.js 26+ Native)
 * Executes npm run build under AUDITOR_ENV=production, cleanly omitting
 * development-only suites (similar-code Candle ML embeddings and test coverage)
 * while maintaining strict 100% enforcement across all architectural, linting,
 * styles, and post-build bundle budget verification gates.
 */

import { spawnSync } from 'node:child_process';
import { isMainModule } from './cliUtils.ts';
import '../core/permissionGuard.ts';

export function runBuildProd(extraArgs: readonly string[] = []): number {
  process.env.AUDITOR_ENV = 'production';

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = ['run', 'build', ...extraArgs];

  const result = spawnSync(npmCmd, args, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env
  });

  return result.status ?? 0;
}

if (isMainModule(import.meta.url)) {
  const exitCode = runBuildProd(process.argv.slice(2));
  process.exit(exitCode);
}
