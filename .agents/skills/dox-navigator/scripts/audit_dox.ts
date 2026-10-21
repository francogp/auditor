/**
 * .agents/skills/dox-navigator/scripts/audit_dox.ts
 *
 * DOX Integrity Runner delegating to canonical @francogp/auditor.
 * Executes the official DOX & AGENTS.md suite under native Node.js 26+ powered by Citty.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { defineCommand, runMain } from 'citty';

function resolveAuditorRunner(projectRoot: string): { scriptPath: string; isPresetMd: boolean } {
  // 1. Direct workspace development inside @francogp/auditor
  const devSuitePath = path.join(
    projectRoot,
    'src',
    'suites',
    'documentation',
    'validate_dox_integrity.ts'
  );
  if (fs.existsSync(devSuitePath)) {
    return { scriptPath: devSuitePath, isPresetMd: false };
  }

  // 2. Installed @francogp/auditor in host project (source or dist)
  const installedSuiteTs = path.join(
    projectRoot,
    'node_modules',
    '@francogp',
    'auditor',
    'src',
    'suites',
    'documentation',
    'validate_dox_integrity.ts'
  );
  if (fs.existsSync(installedSuiteTs)) {
    return { scriptPath: installedSuiteTs, isPresetMd: false };
  }

  const installedSuiteJs = path.join(
    projectRoot,
    'node_modules',
    '@francogp',
    'auditor',
    'dist',
    'suites',
    'documentation',
    'validate_dox_integrity.js'
  );
  if (fs.existsSync(installedSuiteJs)) {
    return { scriptPath: installedSuiteJs, isPresetMd: false };
  }

  // 3. Fallback to audit_full with preset=md if individual suite is not directly exposed
  const devFullAudit = path.join(projectRoot, 'src', 'cli', 'audit_full.ts');
  if (fs.existsSync(devFullAudit)) {
    return { scriptPath: devFullAudit, isPresetMd: true };
  }

  const installedFullAudit = path.join(
    projectRoot,
    'node_modules',
    '@francogp',
    'auditor',
    'dist',
    'cli',
    'audit_full.js'
  );
  if (fs.existsSync(installedFullAudit)) {
    return { scriptPath: installedFullAudit, isPresetMd: true };
  }

  throw new Error(
    `[dox-navigator] Canonical auditor @francogp/auditor not found in '${projectRoot}'. ` +
      `Ensure @francogp/auditor is installed in node_modules or run directly from the auditor repository.`
  );
}

const mainCommand = defineCommand({
  meta: {
    name: 'audit-dox',
    description: 'DOX Integrity & AGENTS.md documentation validator runner'
  },
  args: {
    full: {
      type: 'boolean',
      description: 'Run full markdown suite preset (preset=md)',
      default: false
    },
    fix: {
      type: 'boolean',
      description: 'Run auditor in auto-fix mode',
      default: false
    }
  },
  run({ args }) {
    const projectRoot = process.cwd();
    const { scriptPath, isPresetMd } = resolveAuditorRunner(projectRoot);

    const nodeArgs = [
      '--permission',
      '--experimental-strip-types',
      '--allow-fs-read=*',
      '--allow-fs-write=*',
      '--allow-child-process',
      scriptPath
    ];

    if (isPresetMd || args.full) {
      if (!nodeArgs.includes('preset=md')) {
        nodeArgs.push('preset=md');
      }
    }

    if (args.fix) {
      nodeArgs.push('fix');
    }

    const child = spawn(process.execPath, nodeArgs, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    child.on('close', (code) => {
      process.exit(code ?? 0);
    });
  }
});

runMain(mainCommand);
