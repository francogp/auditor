#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/update_package.ts
 *
 * Dedicated CLI updater for @francogp/auditor across host repositories.
 * Performs a standard, hermetic npm update without ad-hoc scripts or git cloning.
 */

import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import { styleText } from 'node:util';
import { isMainModule, bootstrapCliProject } from './cliUtils.ts';
import { renderBanner, renderBoxTable, type TableColumn } from '../core/unifiedTheme.ts';
import { ensureNpmrcAllowGit } from '../core/npmrcAllowGit.ts';
import { isSelfProviderProject } from '../core/auditConfig.ts';
import { runNpmCommandSync } from '../core/npmCommandUtils.ts';
import { initAgentSkill } from './init_agent.ts';
import { syncEnvScripts } from './sync_env_scripts.ts';

export interface UpdateAuditorOptions {
  cwd?: string;
  silent?: boolean;
  stopAt?: string;
  targetVersion?: string;
}

export interface UpdateAuditorResult {
  success: boolean;
  projectRoot: string;
  previousVersion: string;
  newVersion: string;
  updated: boolean;
  error?: string;
}

export function findHostProjectRoot(startDir: string = process.cwd(), stopAt?: string): string {
  let current = path.resolve(startDir);
  const boundary = stopAt ? path.resolve(stopAt) : undefined;
  while (true) {
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath)) {
      return current;
    }
    if (boundary && current === boundary) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(startDir);
}

export function readInstalledAuditorVersion(projectRoot: string): string {
  try {
    const pkgJsonPath = path.join(projectRoot, 'node_modules/@francogp/auditor/package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const content = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      return content.version || '(desconocida)';
    }
  } catch {
    // catch-ok: Fallback when package.json is missing or unreadable
  }
  return '(no instalada)';
}

export function resolveLatestAuditorTag(
  repoUrl = 'https://github.com/francogp/auditor.git'
): string {
  try {
    const stdout = childProcess.execSync(`git ls-remote --tags --sort=-v:refname ${repoUrl}`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10000
    });
    const lines = stdout.split('\n');
    for (const line of lines) {
      const match = line.match(/refs\/tags\/(v\d+\.\d+\.\d+)$/);
      if (match && match[1]) {
        return match[1];
      }
    }
  } catch {
    // catch-ok: Fallback to local default when offline or network unavailable
  }
  return 'v8.4.1';
}

export function updateAuditorPackage(options: UpdateAuditorOptions = {}): UpdateAuditorResult {
  const projectRoot = findHostProjectRoot(options.cwd ?? process.cwd(), options.stopAt);
  const hostPkgJsonPath = path.join(projectRoot, 'package.json');

  if (!fs.existsSync(hostPkgJsonPath)) {
    return {
      success: false,
      projectRoot,
      previousVersion: '(no disponible)',
      newVersion: '(no disponible)',
      updated: false,
      error: `No se encontró package.json en ${projectRoot}`
    };
  }

  let hostPkg: Record<string, unknown>;
  try {
    hostPkg = JSON.parse(fs.readFileSync(hostPkgJsonPath, 'utf-8'));
  } catch (err) {
    // catch-ok: Propagate error when parsing invalid package.json
    return {
      success: false,
      projectRoot,
      previousVersion: '(no disponible)',
      newVersion: '(no disponible)',
      updated: false,
      error: `Error al leer package.json: ${(err as Error).message}`
    };
  }

  const deps = (hostPkg.dependencies || {}) as Record<string, string>; // open-record: Generic parsed package.json dependencies dictionary
  const devDeps = (hostPkg.devDependencies || {}) as Record<string, string>; // open-record: Generic parsed package.json devDependencies dictionary
  const isDeclared = Boolean(devDeps['@francogp/auditor'] || deps['@francogp/auditor']);

  if (!isDeclared) {
    return {
      success: false,
      projectRoot,
      previousVersion: '(no declarada)',
      newVersion: '(no declarada)',
      updated: false,
      error: 'El paquete @francogp/auditor no está declarado en dependencies ni devDependencies.'
    };
  }

  const targetTag = options.targetVersion
    ? options.targetVersion.startsWith('v')
      ? options.targetVersion
      : `v${options.targetVersion}`
    : resolveLatestAuditorTag();

  const npmArgs = ['install', '-D', `github:francogp/auditor#${targetTag}`];
  ensureNpmrcAllowGit(projectRoot);

  const previousVersion = readInstalledAuditorVersion(projectRoot);

  if (!options.silent) {
    console.log(
      renderBanner(
        '@FRANCOGP/AUDITOR - ACTUALIZADOR NATIVO DE PAQUETE',
        `Directorio: ${projectRoot}  |  Versión Actual: ${previousVersion}  |  Objetivo: ${targetTag}`
      )
    );
    console.log(
      styleText('cyan', `📦 Ejecutando actualización nativa vía npm ${npmArgs.join(' ')}...\n`)
    );
  }

  const proc = runNpmCommandSync(npmArgs, {
    cwd: projectRoot,
    stdio: options.silent ? 'pipe' : 'inherit',
    encoding: 'utf-8'
  });

  if (proc.error || proc.status !== 0) {
    const errorMsg =
      proc.error?.message ||
      proc.stderr?.toString() ||
      `npm ${npmArgs[0]} falló con código de salida ${proc.status}`;
    return {
      success: false,
      projectRoot,
      previousVersion,
      newVersion: previousVersion,
      updated: false,
      error: errorMsg
    };
  }

  const newVersion = readInstalledAuditorVersion(projectRoot);
  const updated = previousVersion !== newVersion;
  const agentInitResult = initAgentSkill({ targetDir: projectRoot });
  if (!options.silent && agentInitResult.created) {
    console.log(styleText('green', `🤖 ${agentInitResult.message}\n`));
  }

  const envSyncResult = syncEnvScripts({ targetDir: projectRoot });
  if (!options.silent && envSyncResult.filesUpdated.length > 0) {
    console.log(styleText('green', `📜 ${envSyncResult.message}\n`));
  }

  runAuditorFixAutoRemediation(projectRoot, options.silent);

  return {
    success: true,
    projectRoot,
    previousVersion,
    newVersion,
    updated
  };
}

export function runAuditorFixAutoRemediation(projectRoot: string, silent?: boolean): boolean {
  try {
    const isSelf = isSelfProviderProject(projectRoot);
    if (!silent) {
      console.log(
        styleText(
          'cyan',
          '🛠️ Ejecutando auditor fix automáticamente para sincronizar scripts y configuraciones...\n'
        )
      );
    }

    const hostAuditorPkg = path.join(
      projectRoot,
      'node_modules/@francogp/auditor/dist/cli/audit_full.js'
    );

    let cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    let args = ['run', 'auditor:fix'];

    if (!isSelf && fs.existsSync(hostAuditorPkg)) {
      cmd = 'node';
      args = [
        '--permission',
        '--allow-fs-read=*',
        '--allow-fs-write=*',
        '--allow-child-process',
        '--allow-addons',
        hostAuditorPkg,
        'fix'
      ];
    }

    const pkgPath = path.join(projectRoot, 'package.json');
    const pkgBefore = fs.existsSync(pkgPath) ? fs.readFileSync(pkgPath, 'utf-8') : '';

    const isWindows = process.platform === 'win32';
    const proc = childProcess.spawnSync(cmd, args, {
      cwd: projectRoot,
      stdio: silent ? 'pipe' : 'inherit',
      encoding: 'utf-8',
      shell: cmd === 'npm.cmd' && isWindows
    });

    const pkgAfter = fs.existsSync(pkgPath) ? fs.readFileSync(pkgPath, 'utf-8') : '';
    if (pkgBefore && pkgAfter && pkgBefore !== pkgAfter) {
      const npmCmd = isWindows ? 'npm.cmd' : 'npm';
      childProcess.spawnSync(npmCmd, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
        cwd: projectRoot,
        stdio: silent ? 'pipe' : 'inherit',
        encoding: 'utf-8',
        shell: isWindows
      });
    }

    return proc.status === 0;
  } catch {
    return false;
  }
}

export function runCli(): void {
  const args = process.argv.slice(2);
  const targetVersion = args.find((a) => !a.startsWith('-'));
  const silent = args.includes('--silent') || args.includes('-s');
  const result = updateAuditorPackage({ targetVersion, silent });

  if (!result.success) {
    console.error(
      styleText('red', `\n❌ Falló la actualización de @francogp/auditor: ${result.error}`)
    );
    process.exit(1);
  }

  interface UpdateTableRow {
    readonly param: string;
    readonly val: string;
  }

  const columns: TableColumn<UpdateTableRow>[] = [
    { header: 'PARÁMETRO', width: 26, render: (r: UpdateTableRow) => r.param },
    { header: 'VALOR / ESTADO', width: 48, render: (r: UpdateTableRow) => r.val }
  ];

  const statusVal = result.updated
    ? 'ACTUALIZADO EXITOSAMENTE ✅'
    : 'YA EN LA ÚLTIMA VERSIÓN (SIN CAMBIOS) ℹ️';

  const rows: UpdateTableRow[] = [
    { param: 'Paquete', val: '@francogp/auditor' },
    { param: 'Versión Anterior', val: result.previousVersion },
    { param: 'Versión Instalada', val: result.newVersion },
    { param: 'Estado', val: statusVal }
  ];

  console.log('\n' + renderBoxTable(columns, rows));
  if (result.updated) {
    console.log(
      styleText(
        'green',
        `\n✔ @francogp/auditor se actualizó correctamente de v${result.previousVersion} a v${result.newVersion}.\n`
      )
    );
  } else {
    console.log(
      styleText(
        'cyan',
        `\nℹ @francogp/auditor ya se encuentra en la última versión disponible (v${result.newVersion}).\n`
      )
    );
  }
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  bootstrapCliProject();
  runCli();
}
