#!/usr/bin/env -S node --experimental-strip-types
/**
 * @file report_test_coverage.ts
 * @description AUDITOR TEST COVERAGE CLI (Node.js 26+)
 * Canonical test execution coverage reporting, analysis, and verification tool.
 * Evaluates Istanbul/V8 coverage JSON, aggregates directory metrics, detects untracked files,
 * displays uncovered line ranges, and gates pull requests / commits.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { styleText } from 'node:util';
import {
  COMMON_CLI_ARGS,
  getProcessCliArgs,
  parseCittyArgs,
  resolveHumanModeFromArgs,
  type CittyArgsDef
} from '../core/cli/cittyHarness.ts';
import { getAuditConfig, buildTestCoverageConfig } from '../core/auditConfig.ts';
import { toPosixRelative, isPathContained } from '../core/safePath.ts';
import { tryCatchSync } from '../core/safeUtils.ts';
import {
  analyzeTestCoverage,
  resolveCoverageFile,
  DEFAULT_TEST_COVERAGE_THRESHOLD,
  ACCEPTABLE_COVERAGE_THRESHOLD,
  type TestCoverageReport,
  type FileCoverageResult,
  type DirectoryCoverageSummary,
  type CoverageHotspot
} from '../core/testCoverageCore.ts';
import { renderBanner, renderBoxTable, type TableColumn } from '../core/unifiedTheme.ts';
import { AUDITOR_VERSION } from '../core/version.ts';
import {
  isMainModule,
  isHumanConsoleMode,
  resolvePackageBin,
  DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
} from './cliUtils.ts';
import { parseJsonObjectOutput } from '../core/reportUtils.ts';
import '../core/permissionGuard.ts';

const RADIX_DECIMAL = 10;
const DEFAULT_TOP_LIMIT = 20;

const DIR_COL_WIDTH = 24 as const;
const ARCH_COL_WIDTH = 5 as const;
const STATS_COL_WIDTH = 8 as const;
const FILE_COL_WIDTH = 36 as const;
const STATS_SHORT_WIDTH = 7 as const;
const UNCOVERED_COL_WIDTH = 17 as const;
const UNCOVERED_MAX_CHARS = 14 as const;
const FILE_DISPLAY_CHARS = 33 as const;
const HOTSPOT_FILE_WIDTH = 32 as const;
const HOTSPOT_FILE_CHARS = 29 as const;
const COMPLEXITY_COL_WIDTH = 11 as const;
const UNTRACKED_FILE_WIDTH = 56 as const;
const UNTRACKED_FILE_CHARS = 53 as const;
const BADGE_COL_WIDTH = 10 as const;

interface CliArgs {
  run: boolean;
  check: boolean;
  threshold?: number;
  dirFilter?: string;
  fileFilter?: string;
  belowOnly: boolean;
  zeroOnly: boolean;
  untrackedOnly: boolean;
  hotspotsOnly: boolean;
  topLimit: number;
  jsonOutput: boolean;
  human: boolean;
  help: boolean;
}

const TEST_COVERAGE_ARGS = {
  ...COMMON_CLI_ARGS,
  run: { type: 'boolean', default: false, description: 'Run test suite with coverage first' },
  check: { type: 'boolean', default: false, description: 'Enforce coverage threshold gate' },
  threshold: { type: 'string', description: 'Target coverage percentage (0-100)' },
  min: { type: 'string', description: 'Alias for threshold' },
  dir: { type: 'string', description: 'Filter by directory prefix' },
  file: { type: 'string', description: 'Drill down into a specific file' },
  below: { type: 'boolean', default: false, description: 'Show only files below threshold' },
  zero: { type: 'boolean', default: false, description: 'Show only files with 0% coverage' },
  untracked: { type: 'boolean', default: false, description: 'Show untracked source files' },
  hotspots: { type: 'boolean', default: false, description: 'Show high-complexity low-coverage hotspots' },
  top: { type: 'string', default: '20', description: 'Maximum rows to display' }
} as const satisfies CittyArgsDef;

const TEST_COVERAGE_BARE_BOOLEANS: ReadonlySet<string> = new Set([
  'run',
  'check',
  'below',
  'zero',
  'untracked',
  'hotspots'
]); // runtime-set: O(1) bare boolean token lookup

function parseCommandLineArgs(): CliArgs {
  const parsed = parseCittyArgs(
    TEST_COVERAGE_ARGS,
    getProcessCliArgs(),
    TEST_COVERAGE_BARE_BOOLEANS
  );

  const thresholdRaw = parsed.threshold ?? parsed.min;
  const threshold =
    typeof thresholdRaw === 'string' && thresholdRaw.length > 0
      ? parseInt(thresholdRaw, RADIX_DECIMAL)
      : undefined;
  const topLimit = parseInt(String(parsed.top || '20'), RADIX_DECIMAL) || DEFAULT_TOP_LIMIT;

  return {
    run: Boolean(parsed.run),
    check: Boolean(parsed.check),
    threshold: threshold !== undefined && !Number.isNaN(threshold) ? threshold : undefined,
    dirFilter: typeof parsed.dir === 'string' ? parsed.dir : undefined,
    fileFilter: typeof parsed.file === 'string' ? parsed.file : undefined,
    belowOnly: Boolean(parsed.below),
    zeroOnly: Boolean(parsed.zero),
    untrackedOnly: Boolean(parsed.untracked),
    hotspotsOnly: Boolean(parsed.hotspots),
    topLimit,
    jsonOutput: Boolean(parsed.json),
    human: resolveHumanModeFromArgs(parsed),
    help: Boolean(parsed.help)
  };
}

function printUsage(): void {
  console.log(`
${styleText('bold', 'AUDITOR TEST COVERAGE CLI')} - v${AUDITOR_VERSION}
Canonical test coverage reporting and verification tool.

${styleText('bold', 'USAGE:')}
  auditor-test-coverage [OPTIONS]
  npm run auditor:test-coverage [-- OPTIONS]

${styleText('bold', 'OPTIONS:')}
  --run              Runs test runner with coverage prior to analysis ('npm test -- --coverage').
  --check            Verifies that coverage meets target threshold; exits with code 1 on failure.
  --threshold=<N>    Target coverage percentage (0-100, e.g. 80). Alias: --min=<N>.
  --dir=<path>       Filter files and metrics by directory prefix (e.g. src/core).
  --file=<path>      Displays detailed metrics and uncovered lines for a specific file.
  --below            Shows only files whose coverage is below the threshold.
  --zero             Shows only files with 0% coverage.
  --untracked        Shows files on disk not executed by any test.
  --hotspots         Shows correlation between cyclomatic/cognitive complexity and low coverage.
  --top=<N>          Maximum rows to display in lists (default: 20).
  --human            Renders formatted Box-Drawing tables and visual dashboards.
  --json             Emits full coverage report in JSON format.
  -h, --help         Shows this help message.
`);
}

function loadFallowComplexityMap(projectRoot: string): Map<string, number> {
  const complexityMap = new Map<string, number>();

  tryCatchSync(() => {
    const fallowBin = resolvePackageBin('fallow', { projectRoot });
    if (!fallowBin) return;

    const cmd = `node "${fallowBin}" health --format json`;
    const stdout = execSync(cmd, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
    });

    interface FallowHealthOutput {
      findings?: Array<{ path: string; cognitive?: number; cyclomatic?: number }>;
      large_functions?: Array<{ path: string }>;
    }

    const data = parseJsonObjectOutput<FallowHealthOutput>(stdout);
    if (data?.findings && Array.isArray(data.findings)) {
      for (const finding of data.findings) {
        if (!finding.path) continue;
        const relPath = toPosixRelative(projectRoot, finding.path);
        const cog = finding.cognitive ?? 0;
        const cyc = finding.cyclomatic ?? 0;
        const current = complexityMap.get(relPath) ?? 0;
        complexityMap.set(relPath, current + Math.max(cog, cyc));
      }
    }
  });

  return complexityMap;
}

function formatPct(pct: number): string {
  if (pct >= DEFAULT_TEST_COVERAGE_THRESHOLD) return styleText('green', `${pct}%`);
  if (pct >= ACCEPTABLE_COVERAGE_THRESHOLD) return styleText('yellow', `${pct}%`);
  if (pct > 0) return styleText('red', `${pct}%`);
  return styleText('dim', '0%');
}

function renderDirectoriesTable(
  directories: readonly DirectoryCoverageSummary[],
  overall: TestCoverageReport['overall']
): string {
  interface DirRow {
    dir: string;
    files: string;
    stmts: string;
    branches: string;
    funcs: string;
    lines: string;
  }

  const columns: readonly TableColumn<DirRow>[] = [
    { header: 'DIRECTORY / SUBSYSTEM', width: DIR_COL_WIDTH, align: 'left', key: 'dir' },
    { header: 'FILES', width: ARCH_COL_WIDTH, align: 'right', key: 'files' },
    { header: 'STMTS %', width: STATS_COL_WIDTH, align: 'right', key: 'stmts' },
    { header: 'BRANCHES %', width: STATS_COL_WIDTH, align: 'right', key: 'branches' },
    { header: 'FUNCS %', width: STATS_COL_WIDTH, align: 'right', key: 'funcs' },
    { header: 'LINES %', width: STATS_COL_WIDTH, align: 'right', key: 'lines' }
  ];

  const rows: DirRow[] = directories.map((d) => ({
    dir:
      d.directory.length > DIR_COL_WIDTH
        ? d.directory.slice(0, DIR_COL_WIDTH - 1) + '…'
        : d.directory,
    files: String(d.fileCount),
    stmts: formatPct(d.statements.pct),
    branches: formatPct(d.branches.pct),
    funcs: formatPct(d.functions.pct),
    lines: formatPct(d.lines.pct)
  }));

  const totalFiles = directories.reduce((acc, d) => acc + d.fileCount, 0);

  const footerRow: DirRow = {
    dir: styleText('bold', 'CONSOLIDATED TOTAL'),
    files: styleText('bold', String(totalFiles)),
    stmts: formatPct(overall.statements.pct),
    branches: formatPct(overall.branches.pct),
    funcs: formatPct(overall.functions.pct),
    lines: formatPct(overall.lines.pct)
  };

  return renderBoxTable(columns, rows, {
    footerRows: [footerRow],
    emptyMessage: 'No directories found with coverage data.'
  });
}

function renderFilesTable(files: readonly FileCoverageResult[], topLimit: number): string {
  interface FileRow {
    file: string;
    stmts: string;
    lines: string;
    uncovered: string;
  }

  const columns: readonly TableColumn<FileRow>[] = [
    { header: 'FILE', width: FILE_COL_WIDTH, align: 'left', key: 'file' },
    { header: 'STMTS', width: STATS_SHORT_WIDTH, align: 'right', key: 'stmts' },
    { header: 'LINES', width: STATS_SHORT_WIDTH, align: 'right', key: 'lines' },
    { header: 'UNCOVERED', width: UNCOVERED_COL_WIDTH, align: 'left', key: 'uncovered' }
  ];

  const slice = files.slice(0, topLimit);
  const rows: FileRow[] = slice.map((f) => {
    const uncovStr = f.uncoveredLines.join(', ');
    const displayUncov =
      uncovStr.length > UNCOVERED_COL_WIDTH
        ? `${uncovStr.slice(0, UNCOVERED_MAX_CHARS)}...`
        : uncovStr;
    const displayFile =
      f.relPath.length > FILE_COL_WIDTH ? `...${f.relPath.slice(-FILE_DISPLAY_CHARS)}` : f.relPath;
    return {
      file: displayFile,
      stmts: formatPct(f.statements.pct),
      lines: formatPct(f.lines.pct),
      uncovered: displayUncov || styleText('green', 'none')
    };
  });

  return renderBoxTable(columns, rows, {
    emptyMessage: 'No files match the specified filter.'
  });
}

function renderHotspotsTable(hotspots: readonly CoverageHotspot[], topLimit: number): string {
  interface HotspotRow {
    file: string;
    complexity: string;
    stmts: string;
    risk: string;
  }

  const columns: readonly TableColumn<HotspotRow>[] = [
    { header: 'FILE', width: HOTSPOT_FILE_WIDTH, align: 'left', key: 'file' },
    { header: 'COMPLEXITY', width: COMPLEXITY_COL_WIDTH, align: 'right', key: 'complexity' },
    { header: 'STMTS %', width: STATS_COL_WIDTH, align: 'right', key: 'stmts' },
    { header: 'RISK', width: STATS_COL_WIDTH, align: 'right', key: 'risk' }
  ];

  const slice = hotspots.slice(0, topLimit);
  const rows: HotspotRow[] = slice.map((h) => {
    const displayFile =
      h.relPath.length > HOTSPOT_FILE_WIDTH
        ? `...${h.relPath.slice(-HOTSPOT_FILE_CHARS)}`
        : h.relPath;
    return {
      file: displayFile,
      complexity: styleText('yellow', String(h.complexity)),
      stmts: styleText('red', `${h.statementsPct}%`),
      risk: styleText(['bold', 'red'], String(h.riskScore))
    };
  });

  return renderBoxTable(columns, rows, {
    emptyMessage: 'No untested complexity hotspots detected.'
  });
}

function renderUntrackedTable(untracked: readonly string[], topLimit: number): string {
  interface UntrackedRow {
    file: string;
    status: string;
  }

  const columns: readonly TableColumn<UntrackedRow>[] = [
    {
      header: 'UNTRACKED FILE IN TESTS',
      width: UNTRACKED_FILE_WIDTH,
      align: 'left',
      key: 'file'
    },
    { header: 'STATUS', width: BADGE_COL_WIDTH, align: 'center', key: 'status' }
  ];

  const slice = untracked.slice(0, topLimit);
  const rows: UntrackedRow[] = slice.map((file) => {
    const displayFile =
      file.length > UNTRACKED_FILE_WIDTH ? `...${file.slice(-UNTRACKED_FILE_CHARS)}` : file;
    return {
      file: displayFile,
      status: styleText(['bold', 'red'], 'UNTESTED')
    };
  });

  return renderBoxTable(columns, rows, {
    emptyMessage: 'All source files are executed by tests.'
  });
}

function renderFileDrillDown(report: TestCoverageReport, fileFilter: string): boolean {
  const targetFile = fileFilter.replace(/^\.\//, '');
  const found = report.files.find(
    (f) => f.relPath === targetFile || f.relPath.endsWith(targetFile)
  );
  if (!found) {
    console.log(
      styleText('yellow', `\n[Warning] No coverage found for file '${fileFilter}'.`)
    );
    return false;
  }
  console.log(styleText('bold', `\n[Coverage] File details: ${found.relPath}\n`));
  console.log(
    `  • Statements: ${found.statements.pct}% (${found.statements.covered}/${found.statements.total})`
  );
  console.log(
    `  • Branches:   ${found.branches.pct}% (${found.branches.covered}/${found.branches.total})`
  );
  console.log(
    `  • Functions:  ${found.functions.pct}% (${found.functions.covered}/${found.functions.total})`
  );
  console.log(`  • Lines:      ${found.lines.pct}% (${found.lines.covered}/${found.lines.total})`);
  if (found.uncoveredLines.length > 0) {
    console.log(styleText('red', `\n  [FAIL] Uncovered lines: ${found.uncoveredLines.join(', ')}`));
  } else {
    console.log(styleText('green', `\n  [OK] 100% of lines covered by tests.`));
  }
  console.log();
  return true;
}

function renderUntrackedView(untrackedFiles: readonly string[], topLimit: number): void {
  console.log(
    styleText(
      'bold',
      `\n[Coverage] UNTRACKED FILES ON DISK (${untrackedFiles.length}):\n`
    )
  );
  console.log(renderUntrackedTable(untrackedFiles, topLimit));
  if (untrackedFiles.length > topLimit) {
    console.log(
      styleText(
        'dim',
        `   ... and ${untrackedFiles.length - topLimit} more files (use --top=${untrackedFiles.length} to view all).`
      )
    );
  }
  console.log();
}

function renderHotspotsView(hotspots: readonly CoverageHotspot[], topLimit: number): void {
  console.log(
    styleText(
      'bold',
      `\n[Coverage] RISK HOTSPOTS (Fallow Complexity + Low Coverage) (${hotspots.length}):\n`
    )
  );
  console.log(renderHotspotsTable(hotspots, topLimit));
  if (hotspots.length > topLimit) {
    console.log(styleText('dim', `   ... and ${hotspots.length - topLimit} more hotspots.`));
  }
  console.log();
}

function renderFilteredFilesView(
  files: readonly FileCoverageResult[],
  args: CliArgs,
  effectiveThreshold: number,
  projectRoot: string = process.env.AUDIT_PROJECT_ROOT || process.cwd()
): void {
  let filtered = files;
  if (args.zeroOnly) {
    filtered = filtered.filter((f) => f.statements.pct === 0);
    console.log(styleText('bold', `\n[Coverage] FILES WITH 0% COVERAGE (${filtered.length}):\n`));
  } else {
    filtered = filtered.filter((f) => f.statements.pct < effectiveThreshold);
    console.log(
      styleText(
        'bold',
        `\n[Warning] FILES BELOW THRESHOLD (${effectiveThreshold}%) (${filtered.length}):\n`
      )
    );
  }
  if (args.dirFilter) {
    const filterAbs = path.resolve(projectRoot, args.dirFilter);
    filtered = filtered.filter((f) => {
      const fileAbs = path.resolve(projectRoot, f.relPath);
      return isPathContained(filterAbs, fileAbs) || f.relPath === args.dirFilter;
    });
  }
  console.log(renderFilesTable(filtered, args.topLimit));
  if (filtered.length > args.topLimit) {
    console.log(
      styleText(
        'dim',
        `   ... and ${filtered.length - args.topLimit} more files (use --top=${filtered.length} to view all).`
      )
    );
  }
  console.log();
}

function renderGlobalCoverageSummary(
  report: TestCoverageReport,
  args: CliArgs,
  effectiveThreshold: number,
  projectRoot: string = process.env.AUDIT_PROJECT_ROOT || process.cwd()
): void {
  const o = report.overall;
  const b = report.buckets;
  console.log(`
${styleText('bold', 'GLOBAL COVERAGE METRICS:')}
  Statements: ${o.statements.pct >= effectiveThreshold ? styleText('green', `${o.statements.pct}%`) : styleText('red', `${o.statements.pct}%`)} (${o.statements.covered}/${o.statements.total})
  Branches:   ${o.branches.pct >= effectiveThreshold ? styleText('green', `${o.branches.pct}%`) : styleText('yellow', `${o.branches.pct}%`)} (${o.branches.covered}/${o.branches.total})
  Functions:  ${o.functions.pct >= effectiveThreshold ? styleText('green', `${o.functions.pct}%`) : styleText('yellow', `${o.functions.pct}%`)} (${o.functions.covered}/${o.functions.total})
  Lines:      ${o.lines.pct >= effectiveThreshold ? styleText('green', `${o.lines.pct}%`) : styleText('red', `${o.lines.pct}%`)} (${o.lines.covered}/${o.lines.total})

${styleText('bold', 'FILE DISTRIBUTION:')}
  [PASS] Excellent (>= ${effectiveThreshold}%): ${styleText('green', String(b.excellent))}
  [WARN] Acceptable (50-${effectiveThreshold - 1}%): ${styleText('yellow', String(b.acceptable))}
  [FAIL] Low (< 50%):         ${styleText('red', String(b.low))}
  [INFO] Untested (0%):       ${styleText('dim', String(b.untested))}
  [WARN] Untracked:           ${b.untracked > 0 ? styleText(['bold', 'yellow'], String(b.untracked)) : styleText('green', '0')}
`);

  let dirs = report.directories;
  if (args.dirFilter) {
    const filterAbs = path.resolve(projectRoot, args.dirFilter);
    dirs = dirs.filter((d) => {
      const dirAbs = path.resolve(projectRoot, d.directory);
      return isPathContained(filterAbs, dirAbs) || d.directory === args.dirFilter;
    });
  }
  console.log(styleText('bold', 'BREAKDOWN BY DIRECTORY / SUBSYSTEM:\n'));
  console.log(renderDirectoriesTable(dirs, report.overall));
  console.log();

  if (report.hotspots && report.hotspots.length > 0) {
    const topHotspot = report.hotspots[0]!;
    console.log(
      styleText(
        'yellow',
        `[Notice] There are ${report.hotspots.length} file(s) with high complexity and low coverage.`
      )
    );
    console.log(
      styleText(
        'dim',
        `   Run 'npm run auditor:test-coverage -- --hotspots' to inspect risk hotspots (Top: ${topHotspot.relPath}).\n`
      )
    );
  }
}

function runTestRunnerIfRequested(
  shouldRun: boolean | undefined,
  runCommand: string,
  projectRoot: string
): void {
  if (!shouldRun) return;
  console.log(styleText('cyan', `\n[Notice] Running test coverage: '${runCommand}'...\n`));
  const res = spawnSync(runCommand, { cwd: projectRoot, stdio: 'inherit', shell: true });
  if (res.status !== 0) {
    console.error(
      styleText('red', `\n[FAIL] Test runner exited with code ${res.status}.`)
    );
    process.exit(res.status ?? 1);
  }
}

function loadCoveragePayloadOrExit(
  projectRoot: string,
  configPath: string
): Record<string, unknown> {
  const coverageFile = resolveCoverageFile(projectRoot, configPath);
  if (!coverageFile) {
    console.error(
      styleText('red', `\n[FAIL] Coverage file not found at '${configPath}'.`)
    );
    console.log(styleText('yellow', '   Run tests with coverage first:'));
    console.log(styleText('bold', `   npm run auditor:test-coverage -- --run\n`));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(coverageFile, 'utf8')) as Record<string, unknown>; // open-record: Istanbul coverage json payload
}

function renderSpecificCoverageView(
  report: ReturnType<typeof analyzeTestCoverage>,
  args: ReturnType<typeof parseCommandLineArgs>,
  effectiveThreshold: number,
  projectRoot: string = process.env.AUDIT_PROJECT_ROOT || process.cwd()
): boolean {
  if (args.fileFilter) {
    renderFileDrillDown(report, args.fileFilter);
    return true;
  }
  if (args.untrackedOnly) {
    renderUntrackedView(report.untrackedFiles, args.topLimit);
    return true;
  }
  if (args.hotspotsOnly) {
    renderHotspotsView(report.hotspots ?? [], args.topLimit);
    return true;
  }
  if (args.belowOnly || args.zeroOnly) {
    renderFilteredFilesView(report.files, args, effectiveThreshold, projectRoot);
    return true;
  }
  return false;
}

function evaluateCoverageQualityGate(
  report: ReturnType<typeof analyzeTestCoverage>,
  effectiveThreshold: number
): void {
  const failed = report.overall.statements.pct < effectiveThreshold;
  if (failed) {
    console.error(
      styleText(
        ['bold', 'red'],
        `[FAIL] QUALITY GATE FAILED: Global statement coverage (${report.overall.statements.pct}%) is below configured threshold (${effectiveThreshold}%).`
      )
    );
    process.exit(1);
  }
  console.log(
    styleText(
      ['bold', 'green'],
      `[PASS] QUALITY GATE PASSED: Coverage (${report.overall.statements.pct}%) >= ${effectiveThreshold}%.`
    )
  );
}

function renderTestCoverageCompact(
  report: ReturnType<typeof analyzeTestCoverage>,
  args: ReturnType<typeof parseCommandLineArgs>,
  effectiveThreshold: number
): void {
  if (args.fileFilter) {
    renderFileDrillDown(report, args.fileFilter);
    return;
  }
  if (args.untrackedOnly) {
    console.log(`[Coverage] Untracked files (${report.untrackedFiles.length}):`);
    for (const f of report.untrackedFiles.slice(0, args.topLimit)) {
      console.log(`  [Untracked] ${f}`);
    }
    return;
  }
  if (args.hotspotsOnly) {
    console.log(`[Coverage] Hotspots (${(report.hotspots ?? []).length}):`);
    for (const h of (report.hotspots ?? []).slice(0, args.topLimit)) {
      console.log(
        `  [Hotspot] ${h.relPath} complexity=${h.complexity} stmts=${h.statementsPct}% risk=${h.riskScore}`
      );
    }
    return;
  }
  if (args.zeroOnly) {
    const zeros = report.files.filter((f) => f.statements.pct === 0);
    console.log(`[Coverage] Zero coverage files (${zeros.length}):`);
    for (const f of zeros.slice(0, args.topLimit)) {
      console.log(`  [Zero] ${f.relPath}`);
    }
    return;
  }
  if (args.belowOnly) {
    const below = report.files.filter((f) => f.statements.pct < effectiveThreshold);
    console.log(`[Coverage] Files below threshold ${effectiveThreshold}% (${below.length}):`);
    for (const f of below.slice(0, args.topLimit)) {
      console.log(`  [Below] ${f.relPath} stmts=${f.statements.pct}% lines=${f.lines.pct}%`);
    }
    return;
  }

  console.log(
    `[Coverage] Statements: ${report.overall.statements.pct}% (${report.overall.statements.covered}/${report.overall.statements.total}) | Branches: ${report.overall.branches.pct}% | Functions: ${report.overall.functions.pct}% | Lines: ${report.overall.lines.pct}% (Threshold: ${effectiveThreshold}%)`
  );
  console.log(
    `[Coverage] Files: ${report.files.length} | Untracked: ${report.untrackedFiles.length} | Excellent: ${report.buckets.excellent} | Acceptable: ${report.buckets.acceptable} | Low: ${report.buckets.low} | Untested: ${report.buckets.untested}`
  );
  for (const d of report.directories) {
    console.log(
      `  [Dir] ${d.directory}: ${d.statements.pct}% stmts, ${d.lines.pct}% lines (${d.fileCount} files)`
    );
  }
}

export async function runTestCoverageReport(
  projectRoot: string = process.env.AUDIT_PROJECT_ROOT || process.cwd()
): Promise<void> {
  const args = parseCommandLineArgs();
  if (args.help) {
    printUsage();
    return;
  }

  const config = getAuditConfig(projectRoot);
  const resolvedConfig = buildTestCoverageConfig(config.testCoverage);
  const effectiveThreshold = args.threshold ?? resolvedConfig.threshold;

  runTestRunnerIfRequested(args.run, resolvedConfig.runCommand, projectRoot);

  const rawJson = loadCoveragePayloadOrExit(projectRoot, resolvedConfig.path);
  const complexityMap =
    args.hotspotsOnly || !args.jsonOutput ? loadFallowComplexityMap(projectRoot) : undefined;
  const report = analyzeTestCoverage(
    rawJson,
    projectRoot,
    { ...resolvedConfig, threshold: effectiveThreshold },
    complexityMap
  );

  if (args.jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    if (args.check && report.overall.statements.pct < effectiveThreshold) {
      process.exit(1);
    }
    return;
  }

  if (!isHumanConsoleMode(args)) {
    renderTestCoverageCompact(report, args, effectiveThreshold);
    if (args.check) {
      evaluateCoverageQualityGate(report, effectiveThreshold);
    }
    return;
  }

  console.log(
    renderBanner(
      'TEST COVERAGE REPORT',
      `v${AUDITOR_VERSION}  |  Vitest & Istanbul Analytics`
    )
  );

  if (!renderSpecificCoverageView(report, args, effectiveThreshold, projectRoot)) {
    renderGlobalCoverageSummary(report, args, effectiveThreshold, projectRoot);
  }

  if (args.check) {
    evaluateCoverageQualityGate(report, effectiveThreshold);
  }
}

if (isMainModule(import.meta.url)) {
  runTestCoverageReport().catch((err) => {
    console.error(
      styleText('red', `\n[Error] auditor-test-coverage failed: ${(err as Error).message}`)
    );
    process.exit(1);
  });
}
