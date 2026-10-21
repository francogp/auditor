#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/sync_env_scripts.ts
 *
 * Environment Scripts Synchronizer (Node.js 26+ Native)
 * Synchronizes the canonical setup-linux.sh and setup-windows.ps1 from @francogp/auditor
 * into the host project root, ensuring zero code divergence.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule, bootstrapCliProject } from './cliUtils.ts';
import {
  COMMON_CLI_ARGS,
  getProcessCliArgs,
  parseCittyArgs,
  type CittyArgsDef
} from '../core/cli/cittyHarness.ts';

export interface SyncEnvOptions {
  targetDir?: string;
  dryRun?: boolean;
}

function syncCanonicalScriptFile(
  file: string,
  packageRootDir: string,
  targetDir: string,
  dryRun?: boolean
): boolean {
  const srcPath = path.join(packageRootDir, file);
  const destPath = path.join(targetDir, file);

  if (!fs.existsSync(srcPath)) return false;

  if (!dryRun) {
    fs.copyFileSync(srcPath, destPath);
    if (file.endsWith('.sh')) {
      try {
        fs.chmodSync(destPath, 0o755);
      } catch {
        // catch-ok: Ignore chmod failures on non-POSIX
      }
    }
  }
  return true;
}

function ensurePluginsDirectory(targetDir: string, dryRun?: boolean): void {
  const pluginsDir = path.join(targetDir, 'scripts/setup/plugins');
  if (fs.existsSync(pluginsDir) || dryRun) return;

  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.writeFileSync(path.join(pluginsDir, '.gitkeep'), '', 'utf8');

  const sampleSh = `#!/usr/bin/env bash
# Project-specific initialization plugin (Linux/macOS)
# Place post-install tasks here (e.g. copy templates, configure DB)
# echo "Running local configuration plugin..."
`;
  const samplePs1 = `# Project-specific initialization plugin (Windows)
# Place post-install tasks here (e.g. copy templates, configure DB)
# Write-Host "Running local configuration plugin..." -ForegroundColor Cyan
`;
  fs.writeFileSync(path.join(pluginsDir, '01_sample.sh.sample'), sampleSh, 'utf8');
  fs.writeFileSync(path.join(pluginsDir, '01_sample.ps1.sample'), samplePs1, 'utf8');
}

export function syncEnvScripts(options: SyncEnvOptions = {}): {
  success: boolean;
  filesUpdated: string[];
  message: string;
} {
  const targetDir = path.resolve(options.targetDir || process.cwd());
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRootDir = path.resolve(currentDir, '../../');

  const filesToSync = [
    'setup-linux.sh',
    'setup-windows.ps1',
    'update-linux.sh',
    'update-windows.ps1'
  ] as const;

  const filesUpdated: string[] = []; // no-domain: Non-domain utility collection or data structure

  for (const file of filesToSync) {
    if (syncCanonicalScriptFile(file, packageRootDir, targetDir, options.dryRun)) {
      filesUpdated.push(file);
    }
  }

  ensurePluginsDirectory(targetDir, options.dryRun);

  return {
    success: true,
    filesUpdated,
    message: `Synchronized canonical environment scripts in ${targetDir}`
  };
}

const SYNC_ENV_ARGS = {
  ...COMMON_CLI_ARGS,
  'dry-run': { type: 'boolean', default: false, description: 'Preview synchronization without writing' }
} as const satisfies CittyArgsDef;

// CLI entrypoint
if (isMainModule(import.meta.url)) {
  bootstrapCliProject();
  const parsed = parseCittyArgs(SYNC_ENV_ARGS, getProcessCliArgs());
  const isDryRun = Boolean(parsed['dry-run']);
  console.log('\n┌────────────────────────────────────────────────────────┐');
  console.log('│  Environment Scripts Synchronizer (@francogp/auditor) │');
  console.log('└────────────────────────────────────────────────────────┘\n');

  const result = syncEnvScripts({ dryRun: isDryRun });

  if (result.success) {
    console.log(`[OK] ${result.message}`);
    for (const f of result.filesUpdated) {
      console.log(`  - ${f}`);
    }
    console.log('\nPlugin structure initialized in scripts/setup/plugins/');
    console.log('Zero divergence from official @francogp/auditor standard.\n');
  } else {
    console.error(`[Error] Failed to synchronize: ${result.message}`);
    process.exit(1);
  }
}
