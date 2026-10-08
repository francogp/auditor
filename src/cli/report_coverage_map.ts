#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/report_coverage_map.ts
 *
 * AUDITOR COVERAGE MAP CLI (Node.js 26+)
 * Renders the full coverage map across versioned files and executed audit suites.
 * Identifies uncovered files (blind spots) and degraded files (rules silenced by configuration).
 */

import path from 'node:path';
import { styleText } from 'node:util';
import { loadAuditConfig, type AuditEngineConfig } from '../core/auditConfig.ts';
import {
  readLatestCoverageLedgers,
  readCoverageLedgers,
  type CoverageLedger
} from '../core/auditCoverage.ts';
import {
  getMatchingExemptionPolicies,
  type ExemptionPolicy
} from '../core/exemptionPolicies.ts';
import {
  listTrackedFiles,
  isCoveredBy
} from '../suites/architecture/validate_audit_coverage.ts';
import {
  renderBanner,
  renderBoxTable,
  type TableColumn
} from '../core/unifiedTheme.ts';
import { AUDITOR_VERSION } from '../core/version.ts';
import { isPathIgnored } from '../core/auditorBase.ts';
import { isMainModule } from './cliUtils.ts';
import '../core/permissionGuard.ts';

const PERCENT_SCALE_FACTOR = 1000 as const;
const PERCENT_DECIMAL_DIVISOR = 10 as const;
const PERCENT_FULL_COVERAGE = 100 as const;
const WARNING_COVERAGE_THRESHOLD = 80 as const;

export type FileCoverageStatus = 'covered' | 'degraded' | 'uncovered' | 'exempt';

export interface FileCoverageEntry {
  file: string;
  status: FileCoverageStatus;
  coveringSuites: string[];
  degradedPolicies: ExemptionPolicy[];
  exemptionReason?: string;
}

export interface DirectoryCoverageSummary {
  directory: string;
  total: number;
  covered: number;
  degraded: number;
  uncovered: number;
  exempt: number;
  coveragePercent: number;
}

export interface CoverageMapResult {
  runId: string | null;
  totalTracked: number;
  totalCovered: number;
  totalDegraded: number;
  totalUncovered: number;
  totalExempt: number;
  overallCoveragePercent: number;
  directories: DirectoryCoverageSummary[];
  files: FileCoverageEntry[];
}

export interface CoverageMapCliOptions {
  projectRoot?: string;
  runId?: string;
  filesOnly?: boolean;
  uncoveredOnly?: boolean;
  degradedOnly?: boolean;
  jsonOutput?: boolean;
}

export function parseCoverageMapCliArgs(argv: string[] = process.argv.slice(2)): CoverageMapCliOptions {
  const options: CoverageMapCliOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--json' || arg === 'json') options.jsonOutput = true;
    else if (arg === '--files' || arg === 'files') options.filesOnly = true;
    else if (arg === '--uncovered' || arg === 'uncovered') options.uncoveredOnly = true;
    else if (arg === '--degraded' || arg === 'degraded') options.degradedOnly = true;
    else if (arg === '--run-id' && i + 1 < argv.length) options.runId = argv[++i];
    else if (arg.startsWith('--run-id=')) options.runId = arg.substring('--run-id='.length);
  }
  return options;
}

function classifyTrackedFiles(
  trackedFiles: readonly string[],
  ledgers: readonly CoverageLedger[],
  config: AuditEngineConfig
): FileCoverageEntry[] {
  const scannedSets: ReadonlyMap<string, ReadonlySet<string>> = new Map(ledgers.map(l => [l.suiteId, new Set<string>(l.scanned)]));
  const exemptGlobs = config.coverage?.exemptGlobs ?? [];
  const acknowledged = config.coverage?.acknowledgedDegradations ?? [];

  return trackedFiles.map(file => {
    if (isPathIgnored(file)) {
      return {
        file,
        status: 'exempt',
        coveringSuites: [],
        degradedPolicies: [],
        exemptionReason: 'Directorio/archivo canónico ignorado (dist/scratch/etc)'
      };
    }

    const matchedExemption = exemptGlobs.find(e => path.posix.matchesGlob(file, e.glob));
    if (matchedExemption) {
      return {
        file,
        status: 'exempt',
        coveringSuites: [],
        degradedPolicies: [],
        exemptionReason: matchedExemption.reason
      };
    }

    const coveringSuites = ledgers
      .filter(l => isCoveredBy(file, l, scannedSets))
      .map(l => l.suiteId);

    if (coveringSuites.length === 0) {
      return {
        file,
        status: 'uncovered',
        coveringSuites: [],
        degradedPolicies: []
      };
    }

    const policies = getMatchingExemptionPolicies(file, config);
    const unacknowledgedPolicies = policies.filter(p => {
      if (p.kind !== 'configured') return false;
      return !acknowledged.some(a => a.policy === p.id && path.posix.matchesGlob(file, a.glob));
    });

    if (unacknowledgedPolicies.length > 0) {
      return {
        file,
        status: 'degraded',
        coveringSuites,
        degradedPolicies: unacknowledgedPolicies
      };
    }

    return {
      file,
      status: 'covered',
      coveringSuites,
      degradedPolicies: []
    };
  });
}

function computeDirectorySummaries(files: readonly FileCoverageEntry[]): DirectoryCoverageSummary[] {
  const dirMap = new Map<string, { total: number; covered: number; degraded: number; uncovered: number; exempt: number }>();

  for (const entry of files) {
    const segments = entry.file.split('/');
    const dirKey = segments.length > 1
      ? (segments[0] === 'src' && segments.length > 2 ? `src/${segments[1]}` : segments[0]!)
      : '.';

    if (!dirMap.has(dirKey)) {
      dirMap.set(dirKey, { total: 0, covered: 0, degraded: 0, uncovered: 0, exempt: 0 });
    }
    const stats = dirMap.get(dirKey)!;
    stats.total++;
    if (entry.status === 'covered') stats.covered++;
    else if (entry.status === 'degraded') stats.degraded++;
    else if (entry.status === 'uncovered') stats.uncovered++;
    else if (entry.status === 'exempt') stats.exempt++;
  }

  return Array.from(dirMap.entries())
    .map(([directory, s]) => {
      const activeTotal = s.total - s.exempt;
      const coveragePercent = activeTotal > 0
        ? Math.round(((s.covered + s.degraded) / activeTotal) * PERCENT_SCALE_FACTOR) / PERCENT_DECIMAL_DIVISOR
        : PERCENT_FULL_COVERAGE;
      return {
        directory,
        total: s.total,
        covered: s.covered,
        degraded: s.degraded,
        uncovered: s.uncovered,
        exempt: s.exempt,
        coveragePercent
      };
    })
    .sort((a, b) => a.directory.localeCompare(b.directory));
}

export async function generateCoverageMap(options: CoverageMapCliOptions = {}): Promise<CoverageMapResult> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const config = await loadAuditConfig(projectRoot);
  const trackedFiles = listTrackedFiles(projectRoot);

  let runId: string | null;
  let ledgers: CoverageLedger[];

  if (options.runId) {
    runId = options.runId;
    ledgers = await readCoverageLedgers(projectRoot, runId);
  } else {
    const latest = await readLatestCoverageLedgers(projectRoot);
    runId = latest.runId;
    ledgers = latest.ledgers;
  }

  const files = classifyTrackedFiles(trackedFiles, ledgers, config);
  const directories = computeDirectorySummaries(files);

  const totalTracked = files.length;
  const totalCovered = files.filter(f => f.status === 'covered').length;
  const totalDegraded = files.filter(f => f.status === 'degraded').length;
  const totalUncovered = files.filter(f => f.status === 'uncovered').length;
  const totalExempt = files.filter(f => f.status === 'exempt').length;

  const activeTotal = totalTracked - totalExempt;
  const overallCoveragePercent = activeTotal > 0
    ? Math.round(((totalCovered + totalDegraded) / activeTotal) * PERCENT_SCALE_FACTOR) / PERCENT_DECIMAL_DIVISOR
    : PERCENT_FULL_COVERAGE;

  return {
    runId,
    totalTracked,
    totalCovered,
    totalDegraded,
    totalUncovered,
    totalExempt,
    overallCoveragePercent,
    directories,
    files
  };
}

interface DirTableRow {
  directory: string;
  total: string;
  covered: string;
  degraded: string;
  uncovered: string;
  percent: string;
}

interface FileTableRow {
  file: string;
  status: string;
  suites: string;
}

export function renderDirectorySummaryTable(result: CoverageMapResult): string {
  const columns: TableColumn<DirTableRow>[] = [
    { header: 'DIRECTORIO / MÓDULO', width: 34, align: 'left', key: 'directory' },
    { header: 'ARCHIVOS', width: 9, align: 'right', key: 'total' },
    { header: 'CUBIERTOS', width: 10, align: 'right', key: 'covered' },
    { header: 'DEGRADADOS', width: 11, align: 'right', key: 'degraded' },
    { header: 'DESCUBIERTOS', width: 13, align: 'right', key: 'uncovered' },
    { header: 'COBERTURA', width: 10, align: 'right', key: 'percent' }
  ];

  const rows: DirTableRow[] = result.directories.map(d => ({
    directory: d.directory === '.' ? '(archivos raíz)' : d.directory,
    total: String(d.total),
    covered: d.covered > 0 ? styleText('green', String(d.covered)) : styleText('dim', '0'),
    degraded: d.degraded > 0 ? styleText('yellow', String(d.degraded)) : styleText('dim', '0'),
    uncovered: d.uncovered > 0 ? styleText('red', String(d.uncovered)) : styleText('dim', '0'),
    percent: d.coveragePercent === PERCENT_FULL_COVERAGE
      ? styleText('green', '100%')
      : d.coveragePercent >= WARNING_COVERAGE_THRESHOLD
        ? styleText('yellow', `${d.coveragePercent}%`)
        : styleText('red', `${d.coveragePercent}%`)
  }));

  const footerRow: DirTableRow = {
    directory: styleText('bold', 'TOTAL CONSOLIDADO'),
    total: styleText('bold', String(result.totalTracked)),
    covered: styleText('bold', String(result.totalCovered)),
    degraded: result.totalDegraded > 0 ? styleText(['bold', 'yellow'], String(result.totalDegraded)) : styleText('dim', '0'),
    uncovered: result.totalUncovered > 0 ? styleText(['bold', 'red'], String(result.totalUncovered)) : styleText('dim', '0'),
    percent: styleText('bold', `${result.overallCoveragePercent}%`)
  };

  return renderBoxTable(columns, rows, { footerRows: [footerRow] });
}

export function renderFilesTable(files: readonly FileCoverageEntry[]): string {
  const columns: TableColumn<FileTableRow>[] = [
    { header: 'ARCHIVO VERSIONADO', width: 44, align: 'left', key: 'file' },
    { header: 'ESTADO', width: 15, align: 'left', key: 'status' },
    { header: 'SUITES QUE LO ANALIZAN', width: 35, align: 'left', key: 'suites' }
  ];

  const rows: FileTableRow[] = files.map(f => {
    let statusText: string;
    let suitesText: string;

    if (f.status === 'covered') {
      statusText = styleText('green', '✅ CUBIERTO');
      suitesText = f.coveringSuites.slice(0, 3).join(', ') + (f.coveringSuites.length > 3 ? ` (+${f.coveringSuites.length - 3})` : '');
    } else if (f.status === 'degraded') {
      statusText = styleText('yellow', '⚠️  DEGRADADO');
      const policies = f.degradedPolicies.map(p => p.configKey).join(', ');
      suitesText = styleText('yellow', `Silenciado: ${policies}`);
    } else if (f.status === 'exempt') {
      statusText = styleText('cyan', '⏭️  EXENTO');
      suitesText = styleText('dim', f.exemptionReason ?? 'Exención configurada');
    } else {
      statusText = styleText('red', '❌ DESCUBIERTO');
      suitesText = styleText('red', 'Ninguna suite lo analiza');
    }

    return {
      file: f.file,
      status: statusText,
      suites: suitesText
    };
  });

  const coveredCount = files.filter(f => f.status === 'covered').length;
  const uncoveredCount = files.filter(f => f.status === 'uncovered').length;
  const degradedCount = files.filter(f => f.status === 'degraded').length;

  const footerRow: FileTableRow = {
    file: styleText('bold', 'TOTAL CONSOLIDADO'),
    status: styleText('bold', `${files.length} archivos`),
    suites: `${styleText('green', `${coveredCount} cubiertos`)} | ${styleText('yellow', `${degradedCount} degradados`)} | ${styleText('red', `${uncoveredCount} descubiertos`)}`
  };

  return renderBoxTable(columns, rows, { footerRows: [footerRow] });
}

export async function runCoverageMapReport(options: CoverageMapCliOptions = parseCoverageMapCliArgs()): Promise<void> {
  const result = await generateCoverageMap(options);

  if (options.jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const runSubtitle = result.runId ? `Run ID: ${result.runId}` : 'Sin ledgers activos (ejecuta npm run auditor)';
  console.log(renderBanner('MAPA DE COBERTURA DE AUDITORÍA Y PUNTOS CIEGOS', `v${AUDITOR_VERSION}  |  ${runSubtitle}`));

  if (!result.runId) {
    console.log(styleText('yellow', '\n⚠️  No se encontraron ledgers de cobertura en scratch/audits/coverage.'));
    console.log(styleText('dim', '   Ejecuta una corrida completa con `npm run auditor` para registrar qué suites escanean cada archivo.\n'));
  }

  if (options.uncoveredOnly) {
    const uncovered = result.files.filter(f => f.status === 'uncovered');
    console.log(styleText('bold', `\n🔍 ARCHIVOS DESCUBIERTOS / PUNTOS CIEGOS (${uncovered.length}):\n`));
    if (uncovered.length === 0) {
      console.log(styleText('green', '✨ ¡Cero archivos descubiertos! 100% de los archivos versionados están cubiertos por suites.\n'));
    } else {
      console.log(renderFilesTable(uncovered));
      console.log();
    }
    return;
  }

  if (options.degradedOnly) {
    const degraded = result.files.filter(f => f.status === 'degraded');
    console.log(styleText('bold', `\n⚠️  ARCHIVOS CON REGLAS SILENCIADAS / DEGRADADAS (${degraded.length}):\n`));
    if (degraded.length === 0) {
      console.log(styleText('green', '✨ ¡Cero archivos degradados! No hay reglas silenciadas por configuración en archivos activos.\n'));
    } else {
      console.log(renderFilesTable(degraded));
      console.log();
    }
    return;
  }

  if (options.filesOnly) {
    console.log(styleText('bold', `\n📋 DETALLE COMPLETO DE ARCHIVOS (${result.files.length}):\n`));
    console.log(renderFilesTable(result.files));
    console.log();
    return;
  }

  console.log(styleText('bold', '\n🗺️  RESUMEN DE COBERTURA POR MÓDULO / DIRECTORIO:\n'));
  console.log(renderDirectorySummaryTable(result));
  console.log();

  if (result.totalUncovered > 0) {
    console.log(styleText('red', `❌ Se detectaron ${result.totalUncovered} archivo(s) sin cobertura de auditoría.`));
    console.log(styleText('dim', '   Usa `npm run auditor:coverage-map -- --uncovered` para ver el detalle de archivos.\n'));
  } else {
    console.log(styleText('green', `✨ Cobertura completa: ${result.overallCoveragePercent}% de los archivos activos tienen verificación arquitectónica.\n`));
  }
}

if (isMainModule(import.meta.url)) {
  runCoverageMapReport().catch(err => {
    console.error(styleText('red', `\n💥 Error en auditor:coverage-map: ${(err as Error).message}`));
    process.exit(1);
  });
}
