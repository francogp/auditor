#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/build_deploy.ts
 *
 * CI/CD DEPLOYMENT BUILD RUNNER CLI (Node.js 26+ Native)
 * Executes npm run build under AUDITOR_ENV=production, cleanly omitting
 * development-only suites (similar-code Candle ML embeddings, test coverage, and git config)
 * while maintaining strict 100% enforcement across all architectural, linting,
 * styles, and post-build bundle budget verification gates.
 */

import { spawnSync } from 'node:child_process';
import { isMainModule } from './cliUtils.ts';
import '../core/permissionGuard.ts';

export function runBuildDeploy(extraArgs: readonly string[] = []): number {
  process.env.AUDITOR_ENV = 'production';

  const isWindows = process.platform === 'win32';
  const npmCmd = isWindows ? 'npm.cmd' : 'npm';
  const args = ['run', 'build', ...extraArgs];

  const result = spawnSync(npmCmd, args, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
    shell: isWindows
  });

  return result.status ?? 0;
}

if (isMainModule(import.meta.url)) {
  const exitCode = runBuildDeploy(process.argv.slice(2));
  process.exit(exitCode);
}
