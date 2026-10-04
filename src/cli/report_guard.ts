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
    if (parsed) {
      console.log(JSON.stringify(parsed, null, 2));
    } else {
      console.log(JSON.stringify({ error: 'Fallow guard execution failed', raw: rawOutput }));
    }
    return status;
  }

  console.log('\n' + renderBanner('PRE-VUELO ARQUITECTÓNICO (FALLOW GUARD)', `Archivos evaluados: ${files.length}`));

  const fileResults = parsed?.files ?? [];
  if (fileResults.length === 0) {
    console.log('  ' + styleText('yellow', 'No se recibieron datos de reglas arquitectónicas para los archivos indicados.\n'));
    return status;
  }

  const tableRows: GuardTableRow[] = fileResults.map((item) => {
    const zoneStr = item.zone ? styleText('cyan', item.zone) : styleText('dim', 'sin capa');
    const allowedZones = item.boundary?.allowed_zones ?? [];
    const allowedStr = item.boundary?.unrestricted
      ? styleText('green', 'todas (sin restricción)')
      : (allowedZones.length > 0 ? allowedZones.join(', ') : styleText('dim', 'ninguna'));

    const forbidden = item.boundary?.forbidden_calls ?? [];
    const policies = item.policy_rules ?? [];
    const rulesParts: string[] = [];
    if (forbidden.length > 0) {
      rulesParts.push(`prohibidas: ${forbidden.join(', ')}`);
    }
    if (policies.length > 0) {
      rulesParts.push(`políticas: ${policies.join(', ')}`);
    }
    const rulesStr = rulesParts.length > 0 ? rulesParts.join(' | ') : styleText('dim', 'ninguna');

    return {
      file: item.path,
      zone: zoneStr,
      allowed: allowedStr,
      rules: rulesStr
    };
  });

  const columns: TableColumn<GuardTableRow>[] = [
    { header: 'ARCHIVO EVALUADO', width: 34, align: 'left', key: 'file' },
    { header: 'CAPA / ZONA', width: 14, align: 'left', key: 'zone' },
    { header: 'PUEDE IMPORTAR', width: 24, align: 'left', key: 'allowed' },
    { header: 'POLÍTICAS Y RESTRICCIONES', width: 28, align: 'left', key: 'rules' }
  ];

  console.log(renderBoxTable(columns, tableRows));

  // Print specific notes if any
  for (const item of fileResults) {
    if (item.notes && item.notes.length > 0) {
      for (const note of item.notes) {
        console.log(styleText('dim', `  ℹ️  ${item.path}: ${note}`));
      }
    }
  }
  console.log();

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
