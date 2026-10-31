#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/report_guard.ts
 *
 * CLI TOOL: PRE-VUELO ARQUITECTÓNICO (Fallow Guard)
 *
 * Inspects architecture boundaries, allowed import zones, forbidden calls,
 * and policy rules for target files before editing or creating them.
 */

import { styleText } from 'node:util';

import {
  COMMON_CLI_ARGS,
  getProcessCliArgs,
  parseCittyArgs,
  resolveHumanModeFromArgs,
  type CittyArgsDef
} from '../core/cli/cittyHarness.ts';
import { renderBanner, renderBoxTable, type TableColumn } from '../core/unifiedTheme.ts';
import { resolveFallowBinary } from '../suites/architecture/validate_similar_code.ts';
import { isMainModule, executeFallowJsonCommand, isHumanConsoleMode } from './cliUtils.ts';

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
  readonly human?: boolean;
}

interface GuardTableRow {
  readonly file: string;
  readonly zone: string;
  readonly allowed: string;
  readonly rules: string;
}

function formatGuardRules(forbidden: readonly string[], policies: readonly string[]): string {
  const parts: string[] = [];
  if (forbidden.length > 0) parts.push(`forbidden: ${forbidden.join(', ')}`);
  if (policies.length > 0) parts.push(`policies: ${policies.join(', ')}`);
  return parts.length > 0 ? parts.join(' | ') : styleText('dim', 'none');
}

function formatAllowedZones(boundary?: GuardFileResult['boundary']): string {
  if (boundary?.unrestricted) return styleText('green', 'all (unrestricted)');
  const allowed = boundary?.allowed_zones ?? [];
  return allowed.length > 0 ? allowed.join(', ') : styleText('dim', 'none');
}

function formatGuardTableRow(item: GuardFileResult): GuardTableRow {
  const zoneStr = item.zone ? styleText('cyan', item.zone) : styleText('dim', 'no zone');
  const allowedStr = formatAllowedZones(item.boundary);
  const rulesStr = formatGuardRules(item.boundary?.forbidden_calls ?? [], item.policy_rules ?? []);

  return {
    file: item.path,
    zone: zoneStr,
    allowed: allowedStr,
    rules: rulesStr
  };
}

function renderGuardResultsTable(
  fileResults: readonly GuardFileResult[],
  options: GuardOptions = {}
): void {
  if (!isHumanConsoleMode(options)) {
    console.log(`[Guard] Architecture pre-flight for ${fileResults.length} file(s):`);
    for (const item of fileResults) {
      const allowed = formatAllowedZones(item.boundary);
      console.log(`• ${item.path} (zone: ${item.zone ?? 'none'}): can import [${allowed}]`);
      for (const note of item.notes ?? []) {
        console.log(`  [Notice] ${note}`);
      }
    }
    console.log('');
    return;
  }

  const tableRows = fileResults.map(formatGuardTableRow);
  const columns: TableColumn<GuardTableRow>[] = [
    { header: 'EVALUATED FILE', width: 34, align: 'left', key: 'file' },
    { header: 'LAYER / ZONE', width: 14, align: 'left', key: 'zone' },
    { header: 'CAN IMPORT', width: 24, align: 'left', key: 'allowed' },
    { header: 'POLICIES & RESTRICTIONS', width: 28, align: 'left', key: 'rules' }
  ];

  console.log(renderBoxTable(columns, tableRows));

  for (const item of fileResults) {
    for (const note of item.notes ?? []) {
      console.log(styleText('dim', `  [Notice] ${item.path}: ${note}`));
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
    console.error(styleText('red', '[Error] Fallow binary not found in node_modules.'));
    return 1;
  }

  if (files.length === 0) {
    if (options.json) {
      console.log(
        JSON.stringify({ error: 'No files specified for architecture guard check', files: [] })
      );
      return 1;
    }
    console.log(
      '\n' +
        renderBanner(
          'ARCHITECTURE PRE-FLIGHT (FALLOW GUARD)',
          'Boundaries, allowed zones and policies'
        )
    );
    console.log(
      styleText(
        'yellow',
        '  [Notice] Usage: auditor-guard <path/file1.ts> [path/file2.vue...] [--json]'
      )
    );
    console.log(
      styleText(
        'dim',
        '  Inspect which architectural rules and import limits apply before editing.\n'
      )
    );
    return 0;
  }

  const { parsed, status, rawOutput } = executeFallowJsonCommand<GuardReportPayload>(
    fallowBin,
    ['guard', ...files, '--format', 'json'],
    projectRoot
  );

  if (options.json) {
    console.log(
      parsed
        ? JSON.stringify(parsed, null, 2)
        : JSON.stringify({ error: 'Fallow guard execution failed', raw: rawOutput })
    );
    return status;
  }

  if (isHumanConsoleMode(options)) {
    console.log(
      '\n' +
        renderBanner('ARCHITECTURE PRE-FLIGHT (FALLOW GUARD)', `Evaluated files: ${files.length}`)
    );
  }

  const fileResults = parsed?.files ?? [];
  if (fileResults.length === 0) {
    console.log(
      '  ' +
        styleText(
          'yellow',
          '[Notice] No architectural rules data received for the indicated files.\n'
        )
    );
    return status;
  }

  renderGuardResultsTable(fileResults, options);

  return status;
}

const GUARD_CLI_ARGS = {
  ...COMMON_CLI_ARGS,
  files: {
    type: 'positional',
    required: false,
    description: 'Files to inspect with architectural guard'
  }
} as const satisfies CittyArgsDef;

if (isMainModule(import.meta.url)) {
  const parsed = parseCittyArgs(GUARD_CLI_ARGS, getProcessCliArgs());
  const files = parsed._.map(String).filter(Boolean);
  const exitCode = runGuardReport(process.cwd(), files, {
    json: Boolean(parsed.json),
    human: resolveHumanModeFromArgs(parsed)
  });
  process.exit(exitCode);
}
