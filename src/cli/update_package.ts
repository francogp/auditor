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
import { isSelfProviderProject } from '../core/auditConfig.ts';
import { initAgentSkill } from './init_agent.ts';

export interface UpdateAuditorOptions {
  cwd?: string;
  silent?: boolean;
  stopAt?: string;
}

export interface UpdateAuditorResult {
  success: boolean;
  projectRoot: string;
  previousVersion: string;
  newVersion: string;
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

export function updateAuditorPackage(options: UpdateAuditorOptions = {}): UpdateAuditorResult {
  const projectRoot = findHostProjectRoot(options.cwd ?? process.cwd(), options.stopAt);
  const hostPkgJsonPath = path.join(projectRoot, 'package.json');

  if (!fs.existsSync(hostPkgJsonPath)) {
    return {
      success: false,
      projectRoot,
      previousVersion: '(no disponible)',
      newVersion: '(no disponible)',
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
      error: `Error al leer package.json: ${(err as Error).message}`
    };
  }

  const deps = (hostPkg.dependencies || {}) as Record<string, string>; // open-record: Generic parsed package.json dependencies dictionary
  const devDeps = (hostPkg.devDependencies || {}) as Record<string, string>; // open-record: Generic parsed package.json devDependencies dictionary
  const isDeclared = Boolean(deps['@francogp/auditor'] || devDeps['@francogp/auditor']);

  if (!isDeclared) {
    return {
      success: false,
      projectRoot,
      previousVersion: '(no declarada)',
      newVersion: '(no declarada)',
      error: 'El paquete @francogp/auditor no está declarado en dependencies ni devDependencies.'
    };
  }

  const previousVersion = readInstalledAuditorVersion(projectRoot);

  if (!options.silent) {
    console.log(renderBanner(
      '@FRANCOGP/AUDITOR - ACTUALIZADOR NATIVO DE PAQUETE',
      `Directorio: ${projectRoot}  |  Versión Actual: ${previousVersion}`
    ));
    console.log(styleText('cyan', '📦 Ejecutando actualización nativa vía npm update @francogp/auditor...\n'));
  }

  const proc = childProcess.spawnSync('npm', ['update', '@francogp/auditor'], {
    cwd: projectRoot,
    stdio: options.silent ? 'pipe' : 'inherit',
    encoding: 'utf-8'
  });

  if (proc.status !== 0) {
    const errorMsg = proc.stderr?.toString() || `npm update falló con código de salida ${proc.status}`;
    return {
      success: false,
      projectRoot,
      previousVersion,
      newVersion: previousVersion,
      error: errorMsg
    };
  }

  const newVersion = readInstalledAuditorVersion(projectRoot);
  const agentInitResult = initAgentSkill({ targetDir: projectRoot });
  if (!options.silent && agentInitResult.created) {
    console.log(styleText('green', `🤖 ${agentInitResult.message}\n`));
  }

  runAuditorFixAutoRemediation(projectRoot, options.silent);

  return {
    success: true,
    projectRoot,
    previousVersion,
    newVersion
  };
}

export function runAuditorFixAutoRemediation(projectRoot: string, silent?: boolean): boolean {
  try {
    const isSelf = isSelfProviderProject(projectRoot);
    if (!silent) {
      console.log(styleText('cyan', '🛠️ Ejecutando auditor fix automáticamente para sincronizar scripts y configuraciones...\n'));
    }

    const hostAuditorPkg = path.join(projectRoot, 'node_modules/@francogp/auditor/dist/cli/audit_full.js');

    let cmd = 'npm';
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

    const proc = childProcess.spawnSync(cmd, args, {
      cwd: projectRoot,
      stdio: silent ? 'pipe' : 'inherit',
      encoding: 'utf-8'
    });

    return proc.status === 0;
  } catch {
    return false;
  }
}

export function runCli(): void {
  const result = updateAuditorPackage();

  if (!result.success) {
    console.error(styleText('red', `\n❌ Falló la actualización de @francogp/auditor: ${result.error}`));
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

  const rows: UpdateTableRow[] = [
    { param: 'Paquete', val: '@francogp/auditor' },
    { param: 'Versión Anterior', val: result.previousVersion },
    { param: 'Versión Instalada', val: result.newVersion },
    { param: 'Estado', val: 'ACTUALIZADO EXITOSAMENTE ✅' }
  ];

  console.log('\n' + renderBoxTable(columns, rows));
  console.log(styleText('green', `\n✔ @francogp/auditor se actualizó correctamente a v${result.newVersion}.\n`));
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  bootstrapCliProject();
  runCli();
}
