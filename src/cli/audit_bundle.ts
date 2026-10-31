#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/audit_bundle.ts
 *
 * PRODUCTION BUNDLE & CHUNK BOTTLENECK AUDITOR (Node.js 26+ Native)
 *
 * Audits production bundle artifacts and module compositions:
 *   1. Inspects compiled chunks in `dist/` or `dist/assets/` against architectural budgets
 *      configured in `audit.config.ts` (bundle.budgets).
 *   2. Computes exact file size and native gzip compression metrics via `node:zlib`.
 *   3. Enforces client chunk budgets and detects oversized bundle bottlenecks.
 *   4. Outputs standardized 80-column Box-Drawing tables via `unifiedTheme`.
 */

import fs from 'node:fs';
import { enableCompileCache } from 'node:module';
import path from 'node:path';
import zlib from 'node:zlib';

import {
  loadAuditConfig,
  getAuditConfig,
  assertAuditConfigComplete,
  type ChunkBudgetConfig
} from '../core/auditConfig.ts';
import { type SubAuditorStatus } from '../core/auditContract.ts';
import {
  COMMON_CLI_ARGS,
  getProcessCliArgs,
  parseCittyArgs,
  resolveHumanModeFromArgs
} from '../core/cli/cittyHarness.ts';
import { normalizePosixPath } from '../core/safePath.ts';
import { tryOrUndefined, tryCatchSync, safeJsonParse, tryOrDefault } from '../core/safeUtils.ts';
import {
  renderBanner,
  renderBoxTable,
  formatStatusBadge,
  type TableColumn
} from '../core/unifiedTheme.ts';
import { isMainModule, isHumanConsoleMode } from './cliUtils.ts';

enableCompileCache();

export interface ModuleMeta {
  readonly id: string;
}

export interface NodePart {
  readonly metaUid: string;
  readonly renderedLength: number;
  readonly gzipLength: number;
  readonly brotliLength?: number;
}

export interface VisualizerData {
  readonly nodeMetas: Record<string, ModuleMeta>;
  readonly nodeParts: Record<string, NodePart>;
}

export interface AggregatedModule {
  readonly id: string;
  readonly rendered: number;
  readonly gzip: number;
  readonly heavyChunkCount: number;
  readonly count: number;
}

export type ChunkAuditStatus = SubAuditorStatus; // Type contract declaration
export interface ChunkAuditResult {
  readonly filename: string;
  readonly sizeBytes: number;
  readonly sizeKB: string;
  readonly gzipBytes?: number;
  readonly gzipKB?: string;
  readonly compressionRatio?: string;
  readonly status: ChunkAuditStatus;
  readonly budgetName?: string;
  readonly budgetLimitBytes?: number;
  readonly note: string;
}

export interface BundleAuditSummary {
  readonly success: boolean;
  readonly totalErrors: number;
  readonly totalWarnings: number;
  readonly topModules: readonly AggregatedModule[];
  readonly chunkResults: readonly ChunkAuditResult[];
  readonly duplicateViolations: readonly string[];
}

export const BYTES_PER_KB = 1024;
export const DEFAULT_HEAVY_CHUNK_THRESHOLD = 10 * BYTES_PER_KB;
export const DEFAULT_UNBUDGETED_CHUNK_LIMIT = 500 * BYTES_PER_KB;
export const DEFAULT_TOP_MODULES_LIMIT = 15;
export const DEFAULT_DUPLICATE_MODULE_THRESHOLD_BYTES = 500 * BYTES_PER_KB;

export function parseVisualizerData(content: string): VisualizerData | null {
  const match =
    content.match(/window\.data\s*=\s*(\{.*?\});<\/script>/s) ||
    content.match(/const\s+data\s*=\s*(\{.*?\});/s);
  if (!match || !match[1]) return null;
  return safeJsonParse<VisualizerData>(match[1]) ?? null;
}

export function aggregateModuleSizes(
  data: VisualizerData,
  heavyChunkThreshold: number = DEFAULT_HEAVY_CHUNK_THRESHOLD
): readonly AggregatedModule[] {
  const metaMap = new Map<string, ModuleMeta>(Object.entries(data.nodeMetas || {}));
  const moduleMap = new Map<
    string,
    { rendered: number; gzip: number; heavyChunkCount: number; count: number }
  >();

  for (const part of Object.values(data.nodeParts || {})) {
    const meta = metaMap.get(part.metaUid);
    if (!meta || part.renderedLength <= 0) continue;
    const existing = moduleMap.get(meta.id) || {
      rendered: 0,
      gzip: 0,
      heavyChunkCount: 0,
      count: 0
    };
    existing.rendered += part.renderedLength;
    existing.gzip += part.gzipLength;
    existing.count += 1;
    if (part.renderedLength > heavyChunkThreshold) {
      existing.heavyChunkCount += 1;
    }
    moduleMap.set(meta.id, existing);
  }

  return Array.from(moduleMap.entries())
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => b.rendered - a.rendered);
}

export function auditSingleChunk(
  filename: string,
  fullPath: string,
  budgets: readonly ChunkBudgetConfig[],
  unbudgetedLimit: number = DEFAULT_UNBUDGETED_CHUNK_LIMIT
): ChunkAuditResult {
  const stat = fs.statSync(fullPath);
  const sizeBytes = stat.size;
  const sizeKB = (sizeBytes / BYTES_PER_KB).toFixed(1);

  const gzipInfo = tryOrUndefined(() => {
    const content = fs.readFileSync(fullPath);
    const bytes = zlib.gzipSync(content).length;
    return {
      bytes,
      kb: (bytes / BYTES_PER_KB).toFixed(1),
      ratio: sizeBytes > 0 ? `${((1 - bytes / sizeBytes) * 100).toFixed(1)}%` : '0.0%'
    };
  });
  const gzipBytes = gzipInfo?.bytes;
  const gzipKB = gzipInfo?.kb;
  const compressionRatio = gzipInfo?.ratio;

  for (const budget of budgets) {
    const isMatch = budget.prefix
      ? filename.startsWith(budget.prefix)
      : budget.matcher
        ? filename.includes(budget.matcher) || filename.startsWith(budget.matcher)
        : filename.startsWith(budget.name);

    if (isMatch) {
      if (sizeBytes > budget.limitBytes) {
        return {
          filename,
          sizeBytes,
          sizeKB,
          gzipBytes,
          gzipKB,
          compressionRatio,
          status: 'failed',
          budgetName: budget.name,
          budgetLimitBytes: budget.limitBytes,
          note: `Exceeds budget of ${(budget.limitBytes / 1024).toFixed(0)} KB`
        };
      }
      return {
        filename,
        sizeBytes,
        sizeKB,
        gzipBytes,
        gzipKB,
        compressionRatio,
        status: 'passed',
        budgetName: budget.name,
        budgetLimitBytes: budget.limitBytes,
        note: `Budget: ${(budget.limitBytes / 1024).toFixed(0)} KB`
      };
    }
  }

  if (sizeBytes > unbudgetedLimit) {
    return {
      filename,
      sizeBytes,
      sizeKB,
      gzipBytes,
      gzipKB,
      compressionRatio,
      status: 'failed',
      note: `Unbudgeted chunk exceeds limit of ${(unbudgetedLimit / 1024).toFixed(0)} KB`
    };
  }

  return {
    filename,
    sizeBytes,
    sizeKB,
    gzipBytes,
    gzipKB,
    compressionRatio,
    status: 'passed',
    note: 'Within general limit'
  };
}

interface VisualizerAuditResult {
  topModules: readonly AggregatedModule[];
  duplicateViolations: string[];
  dupeErrors: number;
}

function auditVisualizerStats(
  statsFilePath: string,
  dupeLimitBytes: number,
  topLimit: number
): VisualizerAuditResult {
  if (!fs.existsSync(statsFilePath)) {
    return { topModules: [], duplicateViolations: [], dupeErrors: 0 };
  }

  const rawContent = fs.readFileSync(statsFilePath, 'utf8');
  const visualizerData = parseVisualizerData(rawContent);
  if (!visualizerData) {
    return { topModules: [], duplicateViolations: [], dupeErrors: 0 };
  }

  const topModules = aggregateModuleSizes(visualizerData);
  const duplicateViolations: string[] = [];
  let dupeErrors = 0;

  for (const m of topModules.slice(0, topLimit)) {
    if (m.heavyChunkCount > 1 && m.rendered > dupeLimitBytes) {
      dupeErrors++;
      duplicateViolations.push(
        `Duplicate module in ${m.heavyChunkCount} chunks (${(m.rendered / 1024).toFixed(1)} KB): ${m.id}`
      );
    }
  }

  return { topModules, duplicateViolations, dupeErrors };
}

export interface DiscoveredChunk {
  readonly filename: string;
  readonly fullPath: string;
}

export function discoverCompiledChunks(targetDir: string): readonly DiscoveredChunk[] {
  if (!fs.existsSync(targetDir)) return [];
  return tryOrDefault(() => {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true, recursive: true });
    const chunks: DiscoveredChunk[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const name = entry.name;
      if (
        (name.endsWith('.js') || name.endsWith('.mjs') || name.endsWith('.cjs')) &&
        !name.endsWith('.d.ts') &&
        !name.endsWith('.map') &&
        !name.endsWith('.gz') &&
        !name.endsWith('.br')
      ) {
        const parentPath = (entry as { parentPath?: string }).parentPath ?? targetDir;
        const fullPath = path.join(parentPath, name);
        const relName = normalizePosixPath(path.relative(targetDir, fullPath));
        chunks.push({ filename: relName, fullPath });
      }
    }
    return chunks;
  }, []);
}

interface CompiledChunksAuditResult {
  chunkResults: ChunkAuditResult[];
  chunkErrors: number;
  chunkWarnings: number;
}

function auditCompiledChunks(
  distDir: string,
  exemptPrefixes: readonly string[],
  budgets: readonly ChunkBudgetConfig[]
): CompiledChunksAuditResult {
  const discovered = discoverCompiledChunks(distDir);
  const chunkResults: ChunkAuditResult[] = [];
  let chunkErrors = 0;
  let chunkWarnings = 0;

  for (const chunk of discovered) {
    if (exemptPrefixes.some((prefix) => chunk.filename.startsWith(prefix))) {
      continue;
    }
    const res = auditSingleChunk(chunk.filename, chunk.fullPath, budgets);
    chunkResults.push(res);
    if (res.status === 'failed') {
      chunkErrors++;
    } else if (res.status === 'warning') {
      chunkWarnings++;
    }
  }

  return { chunkResults, chunkErrors, chunkWarnings };
}

export function resolveDistDir(projectRoot: string, configuredDistDir = 'dist/assets'): string {
  const resolved = path.resolve(projectRoot, configuredDistDir);
  if (fs.existsSync(resolved)) {
    return resolved;
  }
  const fallbackDist = path.resolve(projectRoot, 'dist');
  if (fs.existsSync(fallbackDist)) {
    return fallbackDist;
  }
  return resolved;
}

export async function runBundleAudit(
  projectRoot: string = process.cwd()
): Promise<BundleAuditSummary> {
  await loadAuditConfig(projectRoot);
  const config = getAuditConfig();
  const bundleConfig = config.bundle;

  if (bundleConfig?.enabled === false) {
    return {
      success: true,
      totalErrors: 0,
      totalWarnings: 0,
      topModules: [],
      chunkResults: [],
      duplicateViolations: []
    };
  }

  const statsFilePath = path.resolve(
    projectRoot,
    bundleConfig?.statsFile ?? 'scratch/bundle_stats.html'
  );
  const distDir = resolveDistDir(projectRoot, bundleConfig?.distDir);

  const dupeLimitBytes =
    bundleConfig?.duplicateModuleThresholdBytes ?? DEFAULT_DUPLICATE_MODULE_THRESHOLD_BYTES;
  const topLimit = bundleConfig?.topModulesLimit ?? DEFAULT_TOP_MODULES_LIMIT;

  const { topModules, duplicateViolations, dupeErrors } = auditVisualizerStats(
    statsFilePath,
    dupeLimitBytes,
    topLimit
  );
  const { chunkResults, chunkErrors, chunkWarnings } = auditCompiledChunks(
    distDir,
    bundleConfig?.exemptChunkPrefixes ?? [],
    bundleConfig?.budgets ?? []
  );

  let totalErrors = dupeErrors + chunkErrors;
  const totalWarnings = chunkWarnings;

  const hasArtifacts =
    fs.existsSync(statsFilePath) || chunkResults.length > 0 || fs.existsSync(distDir);
  if (!hasArtifacts) {
    totalErrors++;
  }

  return {
    success: totalErrors === 0,
    totalErrors,
    totalWarnings,
    topModules,
    chunkResults,
    duplicateViolations
  };
}

export async function executeCli(rawArgs: readonly string[] = getProcessCliArgs()): Promise<void> {
  const projectRoot = process.cwd();
  const parsed = parseCittyArgs(COMMON_CLI_ARGS, rawArgs);
  const isHuman = resolveHumanModeFromArgs(parsed) || isHumanConsoleMode(undefined, rawArgs);

  if (isHuman) {
    console.log(renderBanner('PRODUCTION BUNDLE & CHUNK AUDITOR', 'FrancoGP Auditor Framework'));
  }

  await loadAuditConfig(projectRoot);
  const config = getAuditConfig();
  assertAuditConfigComplete(config);
  const bundleConfig = config.bundle;

  if (bundleConfig?.enabled === false) {
    console.log(
      '\n[Notice] Bundle audit skipped: explicitly disabled in audit.config.ts (bundle.enabled: false).\n'
    );
    return;
  }

  const statsFilePath = path.resolve(
    projectRoot,
    bundleConfig?.statsFile ?? 'scratch/bundle_stats.html'
  );
  const distDir = resolveDistDir(projectRoot, bundleConfig?.distDir);

  if (!fs.existsSync(statsFilePath) && !fs.existsSync(distDir)) {
    console.error('\n[FAIL] Error: No production build artifacts or dist directory found.');
    console.error(`   - Expected dist directory: ${path.relative(projectRoot, distDir)}`);
    console.error('\nRun first: npm run build or vp pack\n');
    process.exit(1);
  }

  const result = await runBundleAudit(projectRoot);

  if (!isHuman) {
    console.log(
      `[Bundle] Chunks: ${result.chunkResults.length} | Top Modules: ${result.topModules.length} | Duplicate Violations: ${result.duplicateViolations.length} | Errors: ${result.totalErrors}`
    );
    for (const c of result.chunkResults) {
      console.log(
        `  [Chunk] ${c.filename}: ${c.sizeKB} KB (gzip: ${c.gzipKB ?? 'N/A'} KB) status=${c.status} note=${c.note}`
      );
    }
    if (result.duplicateViolations.length > 0) {
      for (const v of result.duplicateViolations) {
        console.error(`  [Duplicate] ${v}`);
      }
    }
    if (!result.success) {
      console.error(`[Bundle] Status: FAIL (${result.totalErrors} error(s) detected)`);
      process.exit(1);
    }
    console.log('[Bundle] Status: OK');
    process.exit(0);
  }

  // Render Top Modules Table if stats data exists
  if (result.topModules.length > 0) {
    const topLimit = bundleConfig?.topModulesLimit ?? DEFAULT_TOP_MODULES_LIMIT;
    const sample = result.topModules.slice(0, topLimit);

    interface ModuleRow extends Record<string, unknown> {
      idx: string;
      size: string;
      gzip: string;
      id: string;
    }

    const moduleColumns: TableColumn<ModuleRow>[] = [
      { header: '#', width: 4, align: 'right', key: 'idx' },
      { header: 'SIZE', width: 12, align: 'right', key: 'size' },
      { header: 'GZIP', width: 12, align: 'right', key: 'gzip' },
      { header: 'SOURCE MODULE', width: 44, align: 'left', key: 'id' }
    ];

    const moduleRows: ModuleRow[] = sample.map((m, idx) => {
      const dupeTag = m.heavyChunkCount > 1 ? ` [x${m.heavyChunkCount}]` : '';
      return {
        idx: (idx + 1).toString(),
        size: `${(m.rendered / 1024).toFixed(1)} KB`,
        gzip: `${(m.gzip / 1024).toFixed(1)} KB`,
        id: `${m.id}${dupeTag}`
      };
    });

    console.log('\n[Notice] Top heaviest modules in bundle:');
    console.log(renderBoxTable(moduleColumns, moduleRows));
  }

  // Render Chunks Table if chunks exist
  if (result.chunkResults.length > 0) {
    interface ChunkRow extends Record<string, unknown> {
      status: string;
      size: string;
      gzip: string;
      comp: string;
      filename: string;
      note: string;
    }

    const chunkColumns: TableColumn<ChunkRow>[] = [
      { header: 'STATUS', width: 8, align: 'center', key: 'status' },
      { header: 'SIZE', width: 10, align: 'right', key: 'size' },
      { header: 'GZIP', width: 10, align: 'right', key: 'gzip' },
      { header: 'COMPR.', width: 8, align: 'right', key: 'comp' },
      { header: 'CHUNK / ARTIFACT', width: 24, align: 'left', key: 'filename' },
      { header: 'BUDGET', width: 14, align: 'left', key: 'note' }
    ];

    const chunkRows: ChunkRow[] = result.chunkResults.map((c) => ({
      status: formatStatusBadge(c.status),
      size: `${c.sizeKB} KB`,
      gzip: c.gzipKB ? `${c.gzipKB} KB` : 'N/A',
      comp: c.compressionRatio ?? 'N/A',
      filename: c.filename,
      note: c.note
    }));

    console.log('\n[Notice] Production JS Chunks Status (Native Gzip Compression):');
    console.log(renderBoxTable(chunkColumns, chunkRows));
  }

  if (result.duplicateViolations.length > 0) {
    console.log('\n[FAIL] Critical Duplicate Module Violations:');
    for (const v of result.duplicateViolations) {
      console.error(`  [FAIL] ${v}`);
    }
  }

  // Save report to scratch/audits/architecture/latest_audit_bundle.json
  const scratchDir = path.resolve(projectRoot, 'scratch/audits/architecture');
  tryCatchSync(() => {
    fs.mkdirSync(scratchDir, { recursive: true });
    fs.writeFileSync(
      path.join(scratchDir, 'latest_audit_bundle.json'),
      JSON.stringify(result, null, 2),
      'utf8'
    );
  });

  if (!result.success) {
    console.error(`\n[FAIL] Bundle audit failed: ${result.totalErrors} error(s) detected.\n`);
    process.exit(1);
  }

  console.log('\n[OK] Bundle audit passed: Chunks and architectural budgets satisfied.\n');
  process.exit(0);
}

// Canonical CLI Entrypoint
if (isMainModule(import.meta.url)) {
  await executeCli();
}
