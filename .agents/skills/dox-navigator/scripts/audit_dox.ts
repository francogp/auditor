/**
 * .agents/skills/dox-navigator/scripts/audit_dox.ts
 *
 * DOX Integrity Runner delegating to canonical @francogp/auditor.
 * Executes the official DOX & AGENTS.md suite under native Node.js 26+.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function resolveAuditorRunner(projectRoot: string): { scriptPath: string; isPresetMd: boolean } {
  // 1. Direct workspace development inside @francogp/auditor
  const devSuitePath = path.join(projectRoot, 'src', 'suites', 'documentation', 'validate_dox_integrity.ts');
  if (fs.existsSync(devSuitePath)) {
    return { scriptPath: devSuitePath, isPresetMd: false };
  }

  // 2. Installed @francogp/auditor in host project (source or dist)
  const installedSuiteTs = path.join(projectRoot, 'node_modules', '@francogp', 'auditor', 'src', 'suites', 'documentation', 'validate_dox_integrity.ts');
  if (fs.existsSync(installedSuiteTs)) {
    return { scriptPath: installedSuiteTs, isPresetMd: false };
  }

  const installedSuiteJs = path.join(projectRoot, 'node_modules', '@francogp', 'auditor', 'dist', 'suites', 'documentation', 'validate_dox_integrity.js');
  if (fs.existsSync(installedSuiteJs)) {
    return { scriptPath: installedSuiteJs, isPresetMd: false };
  }

  // 3. Fallback to audit_full with preset=md if individual suite is not directly exposed
  const devFullAudit = path.join(projectRoot, 'src', 'cli', 'audit_full.ts');
  if (fs.existsSync(devFullAudit)) {
    return { scriptPath: devFullAudit, isPresetMd: true };
  }

  const installedFullAudit = path.join(projectRoot, 'node_modules', '@francogp', 'auditor', 'dist', 'cli', 'audit_full.js');
  if (fs.existsSync(installedFullAudit)) {
    return { scriptPath: installedFullAudit, isPresetMd: true };
  }

  throw new Error(
    `[dox-navigator] No se encontró el auditor canónico @francogp/auditor en '${projectRoot}'. ` +
    `Asegúrate de tener @francogp/auditor instalado en node_modules o estar en el repositorio del auditor.`
  );
}

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const rawArgs = process.argv.slice(2);
  const wantsFull = rawArgs.includes('--full') || rawArgs.includes('preset=md');

  const { scriptPath, isPresetMd } = resolveAuditorRunner(projectRoot);

  const nodeArgs = [
    '--permission',
    '--experimental-strip-types',
    '--allow-fs-read=*',
    '--allow-fs-write=*',
    '--allow-child-process',
    '--allow-addons',
    scriptPath,
  ];

  if (isPresetMd || wantsFull) {
    if (!nodeArgs.includes('preset=md')) {
      nodeArgs.push('preset=md');
    }
  }

  for (const arg of rawArgs) {
    if (arg !== '--full' && !nodeArgs.includes(arg)) {
      nodeArgs.push(arg);
    }
  }

  const child = spawn(process.execPath, nodeArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err: unknown) => {
  console.error('[DOX_NAVIGATOR_ERROR]', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
