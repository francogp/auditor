#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/report_flags.ts
 *
 * CLI TOOL: FEATURE FLAGS GOVERNANCE (Fallow Flags)
 *
 * Analyzes feature flag usage patterns, branches, single-read sites,
 * and identifies retirement candidates.
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

const RADIX_DECIMAL = 10;
const DEFAULT_TOP_LIMIT = 20;

export interface FeatureFlagRetirementCandidate {
  readonly name: string;
  readonly age_days?: number;
  readonly read_sites?: number;
  readonly reasons?: readonly string[];
}

export interface FeatureFlagsReportPayload {
  readonly kind?: string;
  readonly total_flags?: number;
  readonly feature_flags?: ReadonlyArray<{
    readonly name?: string;
    readonly read_sites?: number;
    readonly locations?: readonly unknown[];
  }>;
  readonly retirement?: {
    readonly summary?: {
      readonly distinct_flags?: number;
      readonly candidates?: number;
      readonly by_reason?: Record<string, number>;
    };
    readonly flags?: readonly FeatureFlagRetirementCandidate[];
  };
}

export interface FlagsOptions {
  readonly retirement?: boolean;
  readonly top?: number;
  readonly json?: boolean;
  readonly human?: boolean;
}

interface RetirementTableRow {
  readonly name: string;
  readonly age: string;
  readonly sites: string;
  readonly reasons: string;
}

function formatRetirementReason(reason: string): string {
  switch (reason) {
    case 'single-read-site':
      return 'Single read site';
    case 'empty-branch':
      return 'Empty branch';
    case 'literal-constant':
      return 'Literal constant';
    case 'defined-never-read':
      return 'Defined but never read';
    case 'identical-branches':
      return 'Identical branches';
    case 'guards-dead-code':
      return 'Guards dead code';
    case 'fully-rolled-out':
      return 'Fully rolled out';
    default:
      return reason;
  }
}

function renderRetirementFlagsView(
  parsed: FeatureFlagsReportPayload | null,
  topLimit: number = DEFAULT_TOP_LIMIT,
  options: FlagsOptions = {}
): void {
  const candidates = parsed?.retirement?.flags ?? [];
  const displayed = candidates.slice(0, topLimit);

  if (displayed.length === 0) {
    console.log(
      '\n  ' +
        styleText(['bold', 'green'], '[OK] No feature flags candidate for retirement detected.\n')
    );
    return;
  }

  if (!isHumanConsoleMode(options)) {
    console.log(`[Flags] Found ${candidates.length} candidate(s) for retirement:`);
    for (const item of displayed) {
      const reasonsList = (item.reasons ?? []).map(formatRetirementReason);
      const reasonsStr = reasonsList.length > 0 ? reasonsList.join(', ') : 'none';
      console.log(
        `• ${item.name} (${item.age_days !== undefined ? `${item.age_days}d` : 'n/a'}, ${item.read_sites ?? 0} sites): ${reasonsStr}`
      );
    }
    console.log('');
    return;
  }

  console.log(`  Candidates for retirement: ${styleText('yellow', String(candidates.length))}\n`);

  const tableRows: RetirementTableRow[] = displayed.map((item) => {
    const ageStr = item.age_days !== undefined ? `${item.age_days}d` : styleText('dim', 'n/a');
    const sitesStr =
      item.read_sites !== undefined ? String(item.read_sites) : styleText('dim', '0');
    const reasonsList = (item.reasons ?? []).map(formatRetirementReason);
    const reasonsStr = reasonsList.length > 0 ? reasonsList.join(', ') : styleText('dim', 'none');

    return {
      name: styleText('cyan', item.name),
      age: ageStr,
      sites: sitesStr,
      reasons: reasonsStr
    };
  });

  const columns: TableColumn<RetirementTableRow>[] = [
    { header: 'FEATURE FLAG', width: 30, align: 'left', key: 'name' },
    { header: 'AGE', width: 8, align: 'right', key: 'age' },
    { header: 'READ SITES', width: 10, align: 'right', key: 'sites' },
    { header: 'RECOMMENDED RETIREMENT REASON', width: 44, align: 'left', key: 'reasons' }
  ];

  console.log(renderBoxTable(columns, tableRows));
  console.log();
}

function renderActiveFlagsView(
  parsed: FeatureFlagsReportPayload | null,
  topLimit: number = DEFAULT_TOP_LIMIT,
  options: FlagsOptions = {}
): void {
  const flags = parsed?.feature_flags ?? [];
  if (flags.length === 0) {
    console.log(
      '\n  ' + styleText('dim', '[Notice] No feature flags configured in this project.\n')
    );
    return;
  }

  if (!isHumanConsoleMode(options)) {
    console.log(`[Flags] ${flags.length} active feature flag(s):`);
    for (const f of flags.slice(0, topLimit)) {
      console.log(`• ${f.name ?? 'unknown'}: ${f.read_sites ?? 0} read sites`);
    }
    console.log('');
    return;
  }

  const tableRows = flags.slice(0, topLimit).map((f) => ({
    name: styleText('cyan', f.name ?? 'unknown'),
    sites: String(f.read_sites ?? 0)
  }));

  const columns: TableColumn<{ name: string; sites: string }>[] = [
    { header: 'FEATURE FLAG', width: 40, align: 'left', key: 'name' },
    { header: 'READ SITES', width: 20, align: 'right', key: 'sites' }
  ];

  console.log('\n' + renderBoxTable(columns, tableRows));
  console.log(
    styleText(
      'dim',
      '  [Notice] Run auditor-flags --retirement to see retirement recommendations.\n'
    )
  );
}

export function runFlagsReport(
  projectRoot: string = process.cwd(),
  options: FlagsOptions = {}
): number {
  const fallowBin = resolveFallowBinary(projectRoot);
  if (!fallowBin) {
    console.error(styleText('red', '[Error] Fallow binary not found in node_modules.'));
    return 1;
  }

  const runArgs = ['flags', '--format', 'json'];
  if (options.retirement) {
    runArgs.push('--retirement');
  }

  const { parsed, status, rawOutput } = executeFallowJsonCommand<FeatureFlagsReportPayload>(
    fallowBin,
    runArgs,
    projectRoot
  );

  if (options.json) {
    console.log(
      parsed
        ? JSON.stringify(parsed, null, 2)
        : JSON.stringify({ error: 'Fallow flags execution failed', raw: rawOutput })
    );
    return status;
  }

  const isRetirement = Boolean(options.retirement);
  const isHuman = isHumanConsoleMode(options);

  if (isHuman) {
    const subtitle = isRetirement
      ? 'Retirement analysis for stale or redundant flags'
      : 'Feature flag detection and usage';
    console.log('\n' + renderBanner('FEATURE FLAGS GOVERNANCE (FALLOW FLAGS)', subtitle));
    const totalFlags = parsed?.total_flags ?? parsed?.feature_flags?.length ?? 0;
    console.log(`  Total feature flags detected: ${styleText('bold', String(totalFlags))}\n`);
  }

  if (isRetirement) {
    renderRetirementFlagsView(parsed, options.top, options);
  } else {
    renderActiveFlagsView(parsed, options.top, options);
  }

  return status;
}

const FLAGS_CLI_ARGS = {
  ...COMMON_CLI_ARGS,
  retirement: { type: 'boolean', default: false, description: 'Show retirement candidates' },
  top: { type: 'string', default: '20', description: 'Maximum flags to display' }
} as const satisfies CittyArgsDef;

if (isMainModule(import.meta.url)) {
  const parsed = parseCittyArgs(FLAGS_CLI_ARGS, getProcessCliArgs());
  const rawTop = String(parsed.top || '20');
  const top =
    rawTop === 'all'
      ? Number.MAX_SAFE_INTEGER
      : parseInt(rawTop, RADIX_DECIMAL) || DEFAULT_TOP_LIMIT;

  const exitCode = runFlagsReport(process.cwd(), {
    retirement: Boolean(parsed.retirement),
    top,
    json: Boolean(parsed.json),
    human: resolveHumanModeFromArgs(parsed)
  });
  process.exit(exitCode);
}
