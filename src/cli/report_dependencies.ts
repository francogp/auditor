#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/report_dependencies.ts
 *
 * STANDALONE AUDITOR DEPENDENCY MINIMUMS CLI REPORTER (Node.js 26+ Native)
 *
 * Inspects, evaluates, and reports the status of mandatory minimum library versions
 * governed by @francogp/auditor against the target host project's package.json
 * and package-lock.json. Operates hermetically without loading auditor suites
 * or executing host extensions.
 */

import path from 'node:path';
import { styleText, parseArgs } from 'node:util';
import { enableCompileCache } from 'node:module';
import {
  evaluateProjectDependencies,
  type ProjectDependenciesReport,
  type DependencyEvaluation
} from '../core/auditorMinimums.ts';
import {
  renderBanner,
  renderBoxTable,
  buildNoticeBox,
  type TableColumn
} from '../core/unifiedTheme.ts';
import { isMainModule, bootstrapCliProject } from './cliUtils.ts';

enableCompileCache();

export interface DependencyReportCliOptions {
  readonly project?: string;
  readonly json: boolean;
  readonly commandsOnly: boolean;
  readonly all: boolean;
  readonly noFail: boolean;
}

export function parseCliArgs(rawArgs: readonly string[] = process.argv.slice(2)): DependencyReportCliOptions {
  const normalized = rawArgs.map(a => (a.includes('=') && !a.startsWith('-') ? `--${a}` : a));

  const { values } = parseArgs({
    args: normalized,
    options: {
      project: { type: 'string', short: 'p' },
      json: { type: 'boolean' },
      commands: { type: 'boolean', short: 'c' },
      'install-cmd': { type: 'boolean' },
      all: { type: 'boolean', short: 'a' },
      'no-fail': { type: 'boolean' }
    },
    allowPositionals: true,
    strict: false
  });

  return {
    project: typeof values.project === 'string' ? values.project : undefined,
    json: Boolean(values.json),
    commandsOnly: Boolean(values.commands || values['install-cmd']),
    all: Boolean(values.all),
    noFail: Boolean(values['no-fail'])
  };
}

function formatStatusCell(item: DependencyEvaluation): string {
  switch (item.status) {
    case 'satisfied':
      return styleText('green', '✅ Cumple');
    case 'outdated_range':
      return styleText('red', '❌ Rango bajo');
    case 'outdated_installed':
      return styleText('yellow', '⚠️  Lockfile bajo');
    case 'undeclared':
      return styleText('dim', '⚪ No declarada');
  }
}

function formatDeclaredCell(item: DependencyEvaluation): string {
  if (!item.declaredRange) return styleText('dim', '---');
  if (item.status === 'outdated_range') return styleText('red', item.declaredRange);
  return styleText('cyan', item.declaredRange);
}

function formatInstalledCell(item: DependencyEvaluation): string {
  if (!item.installedVersion) return styleText('dim', '---');
  if (item.status === 'outdated_installed') return styleText('yellow', item.installedVersion);
  return styleText('white', item.installedVersion);
}

export function runDependenciesReport(
  projectRoot: string = process.cwd(),
  options: DependencyReportCliOptions = { json: false, commandsOnly: false, all: false, noFail: false }
): ProjectDependenciesReport {
  const report = evaluateProjectDependencies(projectRoot);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  if (options.commandsOnly) {
    if (report.prodInstallCommand) console.log(report.prodInstallCommand);
    if (report.devInstallCommand) console.log(report.devInstallCommand);
    if (!report.prodInstallCommand && !report.devInstallCommand) {
      console.log('# Todas las dependencias declaradas cumplen con los pisos mínimos del auditor.');
    }
    return report;
  }

  const itemsToDisplay = options.all
    ? [...report.evaluated].sort((a, b) => {
        const order = { outdated_range: 0, outdated_installed: 1, satisfied: 2, undeclared: 3 };
        return order[a.status] - order[b.status] || a.name.localeCompare(b.name);
      })
    : [...report.evaluated.filter(e => e.status !== 'undeclared')].sort((a, b) => {
        const order = { outdated_range: 0, outdated_installed: 1, satisfied: 2, undeclared: 3 };
        return order[a.status] - order[b.status] || a.name.localeCompare(b.name);
      });

  const bannerSubtitle = `Proyecto: ${path.basename(report.projectRoot)} | Gobernadas: ${report.totalGoverned} | Declaradas: ${report.declaredCount}`;
  console.log('\n' + renderBanner('DEPENDENCIAS MÍNIMAS REQUERIDAS (@francogp/auditor)', bannerSubtitle));

  const columns: TableColumn<DependencyEvaluation>[] = [
    {
      header: 'LIBRERÍA',
      width: 22,
      render: row => (row.status === 'satisfied' ? styleText('green', row.name) : row.status === 'undeclared' ? styleText('dim', row.name) : styleText('bold', row.name))
    },
    {
      header: 'PISO MÍNIMO',
      width: 14,
      align: 'center',
      render: row => styleText('yellow', row.requiredFloor)
    },
    {
      header: 'DECLARADA',
      width: 14,
      align: 'center',
      render: formatDeclaredCell
    },
    {
      header: 'INSTALADA',
      width: 14,
      align: 'center',
      render: formatInstalledCell
    },
    {
      header: 'ESTADO',
      width: 18,
      align: 'center',
      render: formatStatusCell
    }
  ];

  console.log('\n' + renderBoxTable(columns, itemsToDisplay, {
    emptyMessage: 'No se encontraron dependencias declaradas en el proyecto.'
  }) + '\n');

  const summaryLine = [ // no-domain: Dynamic console formatting summary list
    `Total gobernadas: ${styleText('bold', String(report.totalGoverned))}`,
    `Declaradas en host: ${styleText('bold', String(report.declaredCount))}`,
    `Cumplen: ${styleText('green', String(report.satisfiedCount))}`,
    `Requieren actualización: ${report.outdatedCount > 0 ? styleText('red', String(report.outdatedCount)) : styleText('green', '0')}`
  ].join(' | ');

  console.log(`  ${summaryLine}\n`);

  if (report.outdatedCount > 0) {
    const commandLines: string[] = []; // no-domain: Dynamic console command line buffer
    if (report.prodInstallCommand) {
      commandLines.push(`Producción:  ${styleText('cyan', report.prodInstallCommand)}`);
    }
    if (report.devInstallCommand) {
      commandLines.push(`Desarrollo:  ${styleText('cyan', report.devInstallCommand)}`);
    }

    const notice = buildNoticeBox({
      title: 'COMANDOS PARA ACTUALIZAR DEPENDENCIAS AL PISO MÍNIMO',
      lines: commandLines,
      borderColor: 'yellow'
    });
    console.log(notice + '\n');
  } else {
    console.log(`  ${styleText('green', '🎉 Todas las dependencias declaradas en el proyecto cumplen con los mínimos requeridos.')}\n`);
  }

  if (!options.all && report.undeclaredCount > 0) {
    console.log(styleText('dim', `  ℹ️  ${report.undeclaredCount} librerías gobernadas no están declaradas por este host (pasa '--all' para verlas).\n`));
  }

  return report;
}

if (isMainModule(import.meta.url)) {
  const bootstrap = bootstrapCliProject();
  const options = parseCliArgs();
  const report = runDependenciesReport(bootstrap.projectRoot, options);

  if (report.outdatedCount > 0 && !options.noFail && !options.commandsOnly && !options.json) {
    process.exitCode = 1;
  }
}
