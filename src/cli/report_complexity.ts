#!/usr/bin/env -S node --experimental-strip-types
import { execSync } from 'node:child_process';
/**
 * src/cli/report_complexity.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { styleText } from 'node:util';

import { getAuditConfig } from '../core/auditConfig.ts';
import {
  COMMON_CLI_ARGS,
  getProcessCliArgs,
  parseCittyArgs,
  resolveHumanModeFromArgs,
  type CittyArgsDef
} from '../core/cli/cittyHarness.ts';
import { parseJsonObjectOutput } from '../core/reportUtils.ts';
import { toPosixRelative } from '../core/safePath.ts';
import { safeReadFileSync, safeJsonParse } from '../core/safeUtils.ts';
import { renderBanner, renderBoxTable, type TableColumn } from '../core/unifiedTheme.ts';
import {
  DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES,
  resolveCoverageArgs,
  isMainModule,
  bootstrapCliProject
} from './cliUtils.ts';

export const MAX_FUNCTION_NAME_CHARS = 18;
export const MAX_RECOMMENDED_LOC = 60;
export const MAX_RECOMMENDED_COGNITIVE = 20;
export const MAX_RECOMMENDED_CYCLOMATIC = 25;
export const MAX_FILE_PATH_DISPLAY_LENGTH = 27;
export const FILE_PATH_TAIL_CHARS = 24;
export const MAX_RECOMMENDATION_CHARS = 48;

interface ComplexityFinding {
  name: string;
  file: string;
  line: number;
  lines: number;
  cog: number;
  cyc: number;
  total: number;
  exceeded: string;
  layer: string;
}

function extractTopFolder(relativePosixPath: string): string {
  const dir = path.posix.dirname(relativePosixPath);
  if (dir === '.') return 'root';
  const slashIdx = dir.indexOf('/');
  return slashIdx === -1 ? dir : dir.slice(0, slashIdx);
}

function extractLayerFromPath(relPath: string): string {
  const config = getAuditConfig();
  const codeRoots = config.paths?.codeRoots ?? ['src', 'scripts'];
  for (const root of codeRoots) {
    const cleanRoot = toPosixRelative(process.cwd(), root);
    const relToRoot = path.posix.relative(cleanRoot, relPath);
    if (!relToRoot.startsWith('..') && !path.posix.isAbsolute(relToRoot)) {
      return extractTopFolder(relToRoot);
    }
  }
  return extractTopFolder(relPath);
}

const DEFAULT_TOP_LIMIT = 20;
const RADIX_DECIMAL = 10;

const COMPLEXITY_CLI_ARGS = {
  ...COMMON_CLI_ARGS,
  top: { type: 'string', default: '20', description: 'Number of top hotspots to display' },
  layer: { type: 'string', description: 'Filter hotspots by architectural layer' }
} as const satisfies CittyArgsDef;

interface ParsedComplexityCliArgs {
  readonly top: number;
  readonly layerFilter: string | undefined;
  readonly jsonOutput: boolean;
  readonly isHuman: boolean;
}

function parseCommandLineArgs(): ParsedComplexityCliArgs {
  const parsed = parseCittyArgs(COMPLEXITY_CLI_ARGS, getProcessCliArgs());

  return {
    top: parseInt(String(parsed.top || '20'), RADIX_DECIMAL) || DEFAULT_TOP_LIMIT,
    layerFilter: typeof parsed.layer === 'string' ? parsed.layer : undefined,
    jsonOutput: Boolean(parsed.json),
    isHuman: resolveHumanModeFromArgs(parsed)
  };
}

interface FallowHealthRaw {
  findings?: Array<{
    path: string;
    name: string;
    line: number;
    cognitive: number;
    cyclomatic: number;
    line_count: number;
    exceeded: string;
  }>;
  large_functions?: Array<{ path: string; name: string; line: number; line_count: number }>;
  targets?: Array<{ path: string; priority: number; recommendation: string; category: string }>;
  summary?: {
    average_maintainability?: number;
    maintainability_index?: number;
    analyzed_functions?: number;
  };
}

function runFallowHealth(): FallowHealthRaw {
  try {
    const candidates = [
      path.resolve(process.cwd(), 'node_modules/fallow/bin/fallow'),
      path.resolve(import.meta.dirname, '../../node_modules/fallow/bin/fallow'),
      path.resolve(import.meta.dirname, '../../../node_modules/fallow/bin/fallow')
    ];
    const fallowBin = candidates.find((c) => fs.existsSync(c)) || candidates[0]!;
    if (!fs.existsSync(fallowBin)) return {};
    const covArgs = resolveCoverageArgs();
    const covPart = covArgs.length > 0 ? ` ${covArgs.join(' ')}` : '';
    const cmd = `node "${fallowBin}" health --format json${covPart}`;
    const stdout = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
    });
    return parseJsonObjectOutput<FallowHealthRaw>(stdout) ?? {};
  } catch (e: unknown) {
    return parseJsonObjectOutput<FallowHealthRaw>(e) ?? {};
  }
}

function ingestLargeFunctions(
  rawLarge: readonly NonNullable<FallowHealthRaw['large_functions']>[number][] | undefined,
  findingsMap: Map<string, ComplexityFinding>
): void {
  if (!rawLarge) return;
  for (const lf of rawLarge) {
    const filePath = lf.path ?? '';
    const relPath = toPosixRelative(process.cwd(), filePath);
    const layer = extractLayerFromPath(relPath);
    const key = `${relPath}:${lf.line}:${lf.name}`;

    findingsMap.set(key, {
      name: lf.name || '<anónima>',
      file: relPath,
      line: lf.line || 1,
      lines: lf.line_count || 0,
      cog: 0,
      cyc: 0,
      total: 0,
      exceeded: 'lines',
      layer
    });
  }
}

function ingestComplexityFindings(
  rawFindings: readonly NonNullable<FallowHealthRaw['findings']>[number][] | undefined,
  findingsMap: Map<string, ComplexityFinding>
): void {
  if (!rawFindings) return;
  for (const f of rawFindings) {
    const filePath = f.path ?? '';
    const relPath = toPosixRelative(process.cwd(), filePath);
    const layer = extractLayerFromPath(relPath);
    const cog = f.cognitive || 0;
    const cyc = f.cyclomatic || 0;
    const lines = f.line_count || 0;
    const key = `${relPath}:${f.line}:${f.name}`;

    const existing = findingsMap.get(key);
    if (existing) {
      existing.cog = cog;
      existing.cyc = cyc;
      existing.total = cog + cyc;
      if (lines > 0) existing.lines = lines;
      existing.exceeded = 'both';
    } else {
      findingsMap.set(key, {
        name: f.name || '<anónima>',
        file: relPath,
        line: f.line || 1,
        lines,
        cog,
        cyc,
        total: cog + cyc,
        exceeded: f.exceeded || 'complexity',
        layer
      });
    }
  }
}

function parseAuditFindingContext(context?: string): {
  name: string;
  cog: number;
  cyc: number;
  lines: number;
} {
  const match = (context || '').match(
    /^([^\s(]+)\s*\(cog:\s*(\d+),\s*cyc:\s*(\d+),\s*(\d+)\s*lines\)/
  );
  return {
    name: match?.[1] || '<función>',
    cog: match?.[2] ? parseInt(match[2], RADIX_DECIMAL) : 0,
    cyc: match?.[3] ? parseInt(match[3], RADIX_DECIMAL) : 0,
    lines: match?.[4] ? parseInt(match[4], RADIX_DECIMAL) : 0
  };
}

function ingestFallbackAuditFindings(findingsMap: Map<string, ComplexityFinding>): void {
  if (findingsMap.size > 0) return;
  const latestPath = path.resolve(process.cwd(), 'scratch/audits/latest_audit.json');
  if (!fs.existsSync(latestPath)) return;

  const raw = safeReadFileSync(latestPath);
  if (!raw) return;
  const auditData = safeJsonParse<{
    allFindings?: Array<{ ruleId?: string; file?: string; line?: number; context?: string }>;
  }>(raw);
  if (!auditData) return;

  const compFindings = (auditData.allFindings || []).filter(
    (f) => f.ruleId === 'fallow-refactoring-targets'
  );
  for (const cf of compFindings) {
    const filePath = cf.file || '';
    const relPath = toPosixRelative(process.cwd(), filePath);
    const layer = extractLayerFromPath(relPath);
    const line = cf.line || 1;
    const { name, cog, cyc, lines } = parseAuditFindingContext(cf.context);
    const key = `${relPath}:${line}:${name}`;

    findingsMap.set(key, {
      name,
      file: relPath,
      line,
      lines,
      cog,
      cyc,
      total: cog + cyc,
      exceeded: 'complexity',
      layer
    });
  }
}

function sortComplexityFindings(findings: ComplexityFinding[]): ComplexityFinding[] {
  return findings.sort((a, b) => {
    if (a.total > 0 && b.total === 0) return -1;
    if (a.total === 0 && b.total > 0) return 1;
    if (b.lines !== a.lines) return b.lines - a.lines;
    return b.total - a.total;
  });
}

function loadComplexityFindings(): {
  findings: ComplexityFinding[];
  targets: Array<{ path: string; priority: number; recommendation: string; category: string }>;
  maintainability: number;
} {
  const healthData = runFallowHealth();
  const findingsMap = new Map<string, ComplexityFinding>();

  ingestLargeFunctions(healthData.large_functions, findingsMap);
  ingestComplexityFindings(healthData.findings, findingsMap);
  ingestFallbackAuditFindings(findingsMap);

  const findings = sortComplexityFindings(Array.from(findingsMap.values()));

  return {
    findings,
    targets: healthData.targets || [],
    maintainability:
      healthData.summary?.average_maintainability ?? healthData.summary?.maintainability_index ?? 0
  };
}

function renderBoxReport(
  findings: ComplexityFinding[],
  targets: Array<{ path: string; priority: number; recommendation: string; category: string }>,
  maintainability: number,
  topLimit: number,
  layerFilter?: string,
  isHuman = false
): void {
  const filtered = layerFilter
    ? findings.filter((f) => f.layer.toLowerCase() === layerFilter.toLowerCase())
    : findings;

  if (!isHuman) {
    if (findings.length === 0) {
      console.log(styleText('green', '[OK] 0 high complexity functions found.'));
      return;
    }
    console.log(
      `\n[Complexity] Maintainability: ${maintainability.toFixed(1)}/100 | Functions exceeding threshold: ${findings.length}`
    );
    console.log(
      `[Hotspots] Top ${Math.min(topLimit, filtered.length)} of ${filtered.length}${layerFilter ? ` (Filter: ${layerFilter})` : ''}:`
    );
    for (const [idx, f] of filtered.slice(0, topLimit).entries()) {
      console.log(
        `• ${idx + 1}. ${f.name} (${f.file}:${f.line}) [${f.layer}] - ${f.lines} LOC, cog: ${f.cog}, cyc: ${f.cyc}`
      );
    }
    console.log('');
    return;
  }

  const subtitle =
    maintainability > 0
      ? `Functions exceeding threshold: ${findings.length} · Maintainability index: ${maintainability.toFixed(1)}`
      : `Functions exceeding threshold: ${findings.length}`;

  console.log(
    '\n' + renderBanner('CYCLOMATIC, COGNITIVE COMPLEXITY AND FUNCTION SIZE (FALLOW)', subtitle)
  );

  const distribution: Record<string, number> = {};
  for (const f of findings) {
    distribution[f.layer] = (distribution[f.layer] || 0) + 1;
  }

  console.log('\nDISTRIBUTION BY LAYER / DIRECTORY:\n');

  interface LayerDistRow {
    layer: string;
    count: string;
    percentage: string;
  }

  const layerCols: readonly TableColumn<LayerDistRow>[] = [
    { header: 'ARCHITECTURE LAYER', width: 45, align: 'left', key: 'layer' },
    { header: 'FUNCTIONS', width: 11, align: 'right', key: 'count' },
    { header: '%' + ' TOTAL', width: 10, align: 'right', key: 'percentage' }
  ];

  const layerRows: LayerDistRow[] = Object.entries(distribution)
    .sort((a, b) => b[1] - a[1])
    .map(([layer, count]) => {
      const pct = ((count / findings.length) * 100).toFixed(1) + '%';
      return {
        layer,
        count: String(count),
        percentage: pct
      };
    });

  console.log(renderBoxTable(layerCols, layerRows));

  console.log(
    `\nTOP ${Math.min(topLimit, filtered.length)} HOTSPOTS (LINES AND COMPLEXITY) ${layerFilter ? `(Filter: ${layerFilter})` : ''}:\n`
  );

  interface HotspotRow {
    index: string;
    name: string;
    lines: string;
    cog: string;
    cyc: string;
    fileLoc: string;
  }

  const hotspotCols: readonly TableColumn<HotspotRow>[] = [
    { header: '#', width: 3, align: 'center', key: 'index' },
    { header: 'FUNCTION', width: 18, align: 'left', key: 'name' },
    { header: 'LINES', width: 7, align: 'right', key: 'lines' },
    { header: 'COG', width: 5, align: 'right', key: 'cog' },
    { header: 'CYC', width: 5, align: 'right', key: 'cyc' },
    { header: 'FILE:LINE', width: 32, align: 'left', key: 'fileLoc' }
  ];

  const hotspotRows: HotspotRow[] = filtered.slice(0, topLimit).map((f, idx) => ({
    index: String(idx + 1),
    name:
      f.name.length > MAX_FUNCTION_NAME_CHARS
        ? f.name.slice(0, MAX_FUNCTION_NAME_CHARS - 1) + '…'
        : f.name,
    lines: styleText(f.lines > MAX_RECOMMENDED_LOC ? 'red' : 'green', String(f.lines)),
    cog:
      f.cog > 0
        ? styleText(f.cog > MAX_RECOMMENDED_COGNITIVE ? 'red' : 'yellow', String(f.cog))
        : styleText('dim', '-'),
    cyc:
      f.cyc > 0
        ? styleText(f.cyc > MAX_RECOMMENDED_CYCLOMATIC ? 'red' : 'yellow', String(f.cyc))
        : styleText('dim', '-'),
    fileLoc:
      f.file.length > MAX_FILE_PATH_DISPLAY_LENGTH
        ? '…' + f.file.slice(-FILE_PATH_TAIL_CHARS) + `:${f.line}`
        : `${f.file}:${f.line}`
  }));

  console.log(renderBoxTable(hotspotCols, hotspotRows));

  if (targets.length > 0) {
    console.log(`\n[Notice] PRIORITY REFACTORING TARGETS (FALLOW - TOP ${targets.length}):\n`);

    interface TargetRow {
      index: string;
      pri: string;
      category: string;
      recommendation: string;
    }

    const targetCols: readonly TableColumn<TargetRow>[] = [
      { header: '#', width: 3, align: 'center', key: 'index' },
      { header: 'PRI', width: 5, align: 'right', key: 'pri' },
      { header: 'TYPE', width: 14, align: 'left', key: 'category' },
      {
        header: 'REFACTORING RECOMMENDATION',
        width: MAX_RECOMMENDATION_CHARS,
        align: 'left',
        key: 'recommendation'
      }
    ];

    const targetRows: TargetRow[] = targets.map((t, idx) => ({
      index: String(idx + 1),
      pri: t.priority ? t.priority.toFixed(1) : '-',
      category: t.category.replace(/_/g, ' '),
      recommendation:
        t.recommendation.length > MAX_RECOMMENDATION_CHARS
          ? t.recommendation.slice(0, MAX_RECOMMENDATION_CHARS - 1) + '…'
          : t.recommendation
    }));

    console.log(renderBoxTable(targetCols, targetRows));
  }

  console.log('');
}

export function runComplexityReport(): void {
  const { top, layerFilter, jsonOutput, isHuman } = parseCommandLineArgs();
  const { findings, targets, maintainability } = loadComplexityFindings();

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        { total: findings.length, maintainability, findings: findings.slice(0, top), targets },
        null,
        2
      )
    );
    return;
  }

  renderBoxReport(findings, targets, maintainability, top, layerFilter, isHuman);
}

if (isMainModule(import.meta.url)) {
  bootstrapCliProject();
  runComplexityReport();
}
