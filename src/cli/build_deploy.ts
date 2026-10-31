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

import { getProcessCliArgs, parseCittyArgs, COMMON_CLI_ARGS } from '../core/cli/cittyHarness.ts';
import { runNpmCommandSync } from '../core/npmCommandUtils.ts';
import { isMainModule } from './cliUtils.ts';
import '../core/permissionGuard.ts';

export function runBuildDeploy(extraArgs: readonly string[] = []): number {
  parseCittyArgs(COMMON_CLI_ARGS, extraArgs);
  process.env.AUDITOR_ENV = 'production';

  const args = ['run', 'build', ...extraArgs];

  const result = runNpmCommandSync(args, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env
  });

  return result.status ?? 0;
}

if (isMainModule(import.meta.url)) {
  const exitCode = runBuildDeploy(getProcessCliArgs());
  process.exit(exitCode);
}
