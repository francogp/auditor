#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/report_guard.ts
 *
 * CLI TOOL: PRE-VUELO ARQUITECTÓNICO (Fallow Guard)
 *
 * Inspects architecture boundaries, allowed import zones, forbidden calls,
 * and policy rules for target files before editing or creating them.
 */

import { parseArgs, styleText } from 'node:util';
import { renderBanner, renderBoxTable, type TableColumn } from '../core/unifiedTheme.ts';
import { isMainModule, executeFallowJsonCommand } from './cliUtils.ts';
import { resolveFallowBinary } from '../suites/architecture/validate_similar_code.ts';

export interface GuardFileResult {
  readonly path: string;
  readonly exists?: boolean;
  readonly zone?: string | null;
  readonly boundary?: {
    readonly configured?: boolean;
    readonly unrestricted?: boolean;
    readonly allowed_zones?: readonly string[];
    readonly allowed_type_only_zones?: readonly string[];
    readonly forbidden_calls?: readonly string[];
    readonly coverage_required?: boolean;
  };
  readonly policy_rules?: readonly string[];
  readonly severities?: {
    readonly boundary_violation?: string;
    readonly policy_violation?: string;
  };
  readonly notes?: readonly string[];
}

export interface GuardReportPayload {
  readonly files?: readonly GuardFileResult[];
  readonly kind?: string;
}

export interface GuardOptions {
  readonly json?: boolean;
}

interface GuardTableRow {
  readonly file: string;
  readonly zone: string;
  readonly allowed: string;
  readonly rules: string;
}

function formatGuardRules(forbidden: readonly string[], policies: readonly string[]): string {
  const parts: string[] = [];
  if (forbidden.length > 0) parts.push(`prohibidas: ${forbidden.join(', ')}`);
  if (policies.length > 0) parts.push(`políticas: ${policies.join(', ')}`);
  return parts.length > 0 ? parts.join(' | ') : styleText('dim', 'ninguna');
}

function formatAllowedZones(boundary?: GuardFileResult['boundary']): string {
  if (boundary?.unrestricted) return styleText('green', 'todas (sin restricción)');
  const allowed = boundary?.allowed_zones ?? [];
  return allowed.length > 0 ? allowed.join(', ') : styleText('dim', 'ninguna');
}

function formatGuardTableRow(item: GuardFileResult): GuardTableRow {
  const zoneStr = item.zone ? styleText('cyan', item.zone) : styleText('dim', 'sin capa');
  const allowedStr = formatAllowedZones(item.boundary);
  const rulesStr = formatGuardRules(item.boundary?.forbidden_calls ?? [], item.policy_rules ?? []);

  return {
    file: item.path,
    zone: zoneStr,
    allowed: allowedStr,
    rules: rulesStr
  };
}

function renderGuardResultsTable(fileResults: readonly GuardFileResult[]): void {
  const tableRows = fileResults.map(formatGuardTableRow);
  const columns: TableColumn<GuardTableRow>[] = [
    { header: 'ARCHIVO EVALUADO', width: 34, align: 'left', key: 'file' },
    { header: 'CAPA / ZONA', width: 14, align: 'left', key: 'zone' },
    { header: 'PUEDE IMPORTAR', width: 24, align: 'left', key: 'allowed' },
    { header: 'POLÍTICAS Y RESTRICCIONES', width: 28, align: 'left', key: 'rules' }
  ];

  console.log(renderBoxTable(columns, tableRows));

  for (const item of fileResults) {
    for (const note of item.notes ?? []) {
      console.log(styleText('dim', `  ℹ️  ${item.path}: ${note}`));
    }
  }
  console.log();
}

export function runGuardReport(
  projectRoot: string = process.cwd(),
  files: readonly string[] = [],
  options: GuardOptions = {}
): number {
  const fallowBin = resolveFallowBinary(projectRoot);
  if (!fallowBin) {
    console.error(styleText('red', '❌ No se encontró el binario de Fallow en node_modules.'));
    return 1;
  }

  if (files.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'No files specified for architecture guard check', files: [] }));
      return 1;
    }
    console.log('\n' + renderBanner('PRE-VUELO ARQUITECTÓNICO (FALLOW GUARD)', 'Límites, zonas permitidas y políticas'));
    console.log(styleText('yellow', '  ⚠️  Uso: auditor-guard <ruta/archivo1.ts> [ruta/archivo2.vue...] [--json]'));
    console.log(styleText('dim', '  Inspecciona qué reglas arquitectónicas y límites de importación aplican antes de editar.\n'));
    return 0;
  }

  const { parsed, status, rawOutput } = executeFallowJsonCommand<GuardReportPayload>(
    fallowBin,
    ['guard', ...files, '--format', 'json'],
    projectRoot
  );

  if (options.json) {
    console.log(parsed ? JSON.stringify(parsed, null, 2) : JSON.stringify({ error: 'Fallow guard execution failed', raw: rawOutput }));
    return status;
  }

  console.log('\n' + renderBanner('PRE-VUELO ARQUITECTÓNICO (FALLOW GUARD)', `Archivos evaluados: ${files.length}`));

  const fileResults = parsed?.files ?? [];
  if (fileResults.length === 0) {
    console.log('  ' + styleText('yellow', 'No se recibieron datos de reglas arquitectónicas para los archivos indicados.\n'));
    return status;
  }

  renderGuardResultsTable(fileResults);

  return status;
}

if (isMainModule(import.meta.url)) {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      json: { type: 'boolean', default: false }
    },
    strict: false,
    allowPositionals: true
  });

  const files = positionals.filter((arg) => !arg.startsWith('-') && !arg.includes('='));
  const exitCode = runGuardReport(process.cwd(), files, { json: Boolean(values.json) });
  process.exit(exitCode);
}
