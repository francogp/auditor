#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/report_findings.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { styleText } from 'node:util';
import type {
  ConsolidatedAuditReport,
  AuditFinding,
  AuditFileSummary,
  AuditByFileReport
} from '../core/auditContract.ts';
import {
  ONE_MINUTE_MS,
  sortFindingsByFileAndLine,
  groupFindingsByFileMap
} from '../core/auditContract.ts';
import { getAuditConfig, DEFAULT_MAX_AUDIT_STALENESS_MINUTES } from '../core/auditConfig.ts';
import {
  renderBanner,
  renderFindingsBreakdownTable,
  renderSampleFindings,
  renderFindingsByFileTree
} from '../core/unifiedTheme.ts';
import { isMainModule, bootstrapCliProject } from './cliUtils.ts';

const RADIX_DECIMAL = 10;
const DEFAULT_TOP_LIMIT = 20;
const DEFAULT_SAMPLE_ERROR_LIMIT = 5;
const ERROR_WEIGHT_FACTOR = 1000;

type Finding = AuditFinding; // type-ok: Type contract declaration

type AuditReport = ConsolidatedAuditReport; // type-ok: Type contract declaration

export const SEVERITY_FILTERS = ['all', 'error', 'warning'] as const;
export type SeverityFilter = (typeof SEVERITY_FILTERS)[number];

export const REPORT_SCOPES = ['all', 'host', 'packages'] as const;
export type ReportScope = (typeof REPORT_SCOPES)[number];

interface ReportOptions {
  category: string;
  severity: SeverityFilter;
  search: string;
  filePattern: string;
  dirPattern: string;
  scope: ReportScope;
  breakdown: boolean;
  byFile: boolean;
  top: number | 'all';
  jsonOutput: boolean;
  summaryOnly: boolean;
  filesOnly: boolean;
  allowStale: boolean;
  allowPartial: boolean;
  inspectFix: boolean;
}

const JSON_FLAGS = new Set(['json', '--json', 'json=true']);
const SUMMARY_FLAGS = new Set(['summary', '--summary', 'summary=true']);
const FILES_FLAGS = new Set(['files', '--files', 'files=true']);
const BREAKDOWN_FLAGS = new Set(['breakdown', '--breakdown', 'breakdown=true', 'by-dir', 'dirs']);
const BY_FILE_FLAGS = new Set(['by-file', '--by-file', 'by_file', 'group=file', 'group-by=file', 'byfile']);
const STALE_FLAGS = new Set(['allow-stale', '--allow-stale', 'stale']);
const PARTIAL_FLAGS = new Set(['allow-partial', '--allow-partial', 'partial']);
const FIX_FLAGS = new Set(['fix', '--fix', 'fix-report', '--fix-report']);

function isInvokedAsByFile(): boolean {
  const scriptArg = process.argv[1] ?? '';
  const scriptName = path.basename(scriptArg).toLowerCase();
  return scriptName.includes('auditor-by-file');
}

function parseFlagArg(arg: string, opts: ReportOptions): boolean {
  if (JSON_FLAGS.has(arg)) { opts.jsonOutput = true; return true; }
  if (SUMMARY_FLAGS.has(arg)) { opts.summaryOnly = true; return true; }
  if (FILES_FLAGS.has(arg)) { opts.filesOnly = true; return true; }
  if (BREAKDOWN_FLAGS.has(arg)) { opts.breakdown = true; return true; }
  if (BY_FILE_FLAGS.has(arg)) { opts.byFile = true; return true; }
  if (STALE_FLAGS.has(arg)) { opts.allowStale = true; return true; }
  if (PARTIAL_FLAGS.has(arg)) { opts.allowPartial = true; return true; }
  if (FIX_FLAGS.has(arg)) { opts.inspectFix = true; opts.allowPartial = true; return true; }
  return false;
}

function parseScopeArg(arg: string, opts: ReportOptions): boolean {
  if (arg === 'host' || arg === 'scope=host') { opts.scope = 'host'; return true; }
  if (arg === 'packages' || arg === 'scope=packages' || arg === 'pkg') { opts.scope = 'packages'; return true; }
  if (arg.startsWith('scope=')) {
    const val = arg.slice(6).toLowerCase();
    if (val === 'host' || val === 'packages' || val === 'all') { opts.scope = val; }
    return true;
  }
  return false;
}

function parseSeverityArg(arg: string, opts: ReportOptions): boolean {
  if (arg === 'errors' || arg === 'error' || arg === 'severity=error') { opts.severity = 'error'; return true; }
  if (arg === 'warnings' || arg === 'warning' || arg === 'severity=warning') { opts.severity = 'warning'; return true; }
  if (arg.startsWith('severity=')) {
    const val = arg.slice(9).toLowerCase();
    if (val === 'error' || val === 'warning' || val === 'all') { opts.severity = val; }
    return true;
  }
  return false;
}

function parseScopeAndSeverity(arg: string, opts: ReportOptions): boolean {
  return parseScopeArg(arg, opts) || parseSeverityArg(arg, opts);
}

function parseFilterAndValue(arg: string, opts: ReportOptions): boolean {
  if (arg.startsWith('dir=')) {
    opts.dirPattern = arg.slice(4).toLowerCase();
    return true;
  }
  if (arg.startsWith('folder=')) {
    opts.dirPattern = arg.slice(7).toLowerCase();
    return true;
  }
  if (arg.startsWith('category=')) {
    opts.category = arg.slice(9).toLowerCase();
    return true;
  }
  if (arg.startsWith('search=')) {
    opts.search = arg.slice(7).toLowerCase();
    return true;
  }
  if (arg.startsWith('file=') || arg.startsWith('f=')) {
    const prefixLen = arg.startsWith('file=') ? 5 : 2;
    opts.filePattern = arg.slice(prefixLen).toLowerCase();
    return true;
  }
  if (arg.startsWith('top=')) {
    const topVal = arg.slice(4).toLowerCase();
    opts.top = topVal === 'all' || topVal === '0' ? 'all' : (parseInt(topVal, RADIX_DECIMAL) || DEFAULT_TOP_LIMIT);
    return true;
  }
  return false;
}

function parseReportOptions(): ReportOptions {
  const argv = process.argv.slice(2);
  const opts: ReportOptions = {
    category: 'all',
    severity: 'all',
    search: '',
    filePattern: '',
    dirPattern: '',
    scope: 'all',
    breakdown: false,
    byFile: isInvokedAsByFile(),
    top: DEFAULT_TOP_LIMIT,
    jsonOutput: false,
    summaryOnly: false,
    filesOnly: false,
    allowStale: false,
    allowPartial: false,
    inspectFix: false
  };

  for (const arg of argv) {
    if (parseFlagArg(arg, opts) || parseScopeAndSeverity(arg, opts) || parseFilterAndValue(arg, opts)) {
      continue;
    }
    if (!arg.startsWith('-')) {
      if (arg.toLowerCase() === 'by-file' || arg.toLowerCase() === 'byfile') {
        opts.byFile = true;
      } else {
        opts.category = arg.toLowerCase();
      }
    }
  }

  return opts;
}

function loadAuditReport(inspectFix: boolean = false): AuditReport | null {
  const targetFileName = inspectFix ? 'latest_fix_audit.json' : 'latest_audit.json';
  const reportPath = path.resolve(process.cwd(), `scratch/audits/${targetFileName}`);
  if (!fs.existsSync(reportPath)) {
    if (inspectFix) {
      console.error('❌ No se encontró scratch/audits/latest_fix_audit.json. Ejecuta primero "npm run auditor:fix".');
    } else {
      console.error('❌ No se encontró scratch/audits/latest_audit.json. Ejecuta primero "npm run auditor".');
    }
    return null;
  }
  try {
    const raw = fs.readFileSync(reportPath, 'utf8');
    const parsed = JSON.parse(raw) as AuditReport;
    if (!parsed.meta) {
      console.error(`❌ scratch/audits/${targetFileName} no contiene la cabecera de metadatos "meta". Ejecuta "npm run auditor" para regenerarlo.`);
      return null;
    }
    return parsed;
  } catch (e) {
    console.error(`❌ Error al parsear scratch/audits/${targetFileName}: ${(e as Error).message}`);
    return null;
  }
}

function getNormalizedRelPath(filePath?: string): string {
  if (!filePath) return 'General';
  const rel = path.isAbsolute(filePath) ? path.relative(process.cwd(), filePath) : filePath;
  return rel.split(path.sep).join(path.posix.sep);
}

function getDirectoryBucket(filePath?: string): string {
  const rel = getNormalizedRelPath(filePath);
  if (rel === 'General') return 'General';
  const parts = rel.split('/');
  return parts.length > 1 ? `${parts[0]}/` : rel;
}

function sortFindingsEntries<T extends { errors: number; warnings: number }>(
  entries: [string, T][]
): [string, T][] {
  return entries.sort((a, b) => {
    const totalB = b[1].errors * ERROR_WEIGHT_FACTOR + b[1].warnings;
    const totalA = a[1].errors * ERROR_WEIGHT_FACTOR + a[1].warnings;
    return totalB - totalA;
  });
}

function aggregateAndSortFindings(
  findings: readonly Finding[],
  keyExtractor: (f: Finding) => string
): [string, { errors: number; warnings: number }][] {
  const map: Record<string, { errors: number; warnings: number }> = {};
  for (const f of findings) {
    const key = keyExtractor(f);
    if (!map[key]) {
      map[key] = { errors: 0, warnings: 0 };
    }
    if (f.severity === 'error') {
      map[key].errors++;
    } else {
      map[key].warnings++;
    }
  }

  return sortFindingsEntries(Object.entries(map));
}

function validateReportFreshnessAndScope(report: AuditReport, args: ReportOptions): void {
  const targetFileName = args.inspectFix ? 'latest_fix_audit.json' : 'latest_audit.json';
  try {
    const auditInstant = Temporal.Instant.from(report.meta.timestamp);
    const now = Temporal.Now.instant();
    const elapsedMs = now.since(auditInstant).total({ unit: 'millisecond' });
    const config = getAuditConfig();
    const configuredMinutes = config.runner?.maxStalenessMinutes ?? DEFAULT_MAX_AUDIT_STALENESS_MINUTES;
    const effectiveMaxAgeMs = configuredMinutes * ONE_MINUTE_MS;
    if (!args.allowStale && elapsedMs > effectiveMaxAgeMs) {
      const elapsedMins = Math.max(1, Math.round(now.since(auditInstant).total({ unit: 'minute' })));
      const limitMins = configuredMinutes;
      console.error(
        styleText('red', `❌ scratch/audits/${targetFileName} está OBSOLETO (${elapsedMins} minutos de antigüedad, límite: ${limitMins} min).\n`) +
        styleText('yellow', `   El código fuente pudo haber cambiado desde la última auditoría.\n`) +
        styleText('cyan', `👉 DEBES ejecutar 'npm run auditor' para regenerar y validar el reporte.`)
      );
      process.exit(1);
    }
  } catch (err) {
    if ((err as Error).message.includes('OBSOLETO')) throw err;
    console.error(
      styleText('red', `❌ scratch/audits/${targetFileName} contiene un timestamp inválido ('${report.meta.timestamp}').\n`) +
      styleText('cyan', `👉 DEBES ejecutar 'npm run auditor' para regenerar y validar el reporte.`)
    );
    process.exit(1);
  }

  if (report.meta.isFullAudit) return;

  if (!args.allowPartial) {
    if (args.category === 'all') {
      console.error(
        styleText('red', `❌ scratch/audits/${targetFileName} proviene de una auditoría PARCIAL (${report.meta.runMode}, ${report.meta.executedSuiteCount}/${report.meta.totalDiscoveredSuites} suites ejecutadas).\n`) +
        styleText('yellow', `   No es posible emitir reportes globales de hallazgos sobre una corrida parcial.\n`) +
        styleText('cyan', `👉 DEBES ejecutar 'npm run auditor' (completo) o agregar 'partial' para inspeccionar esta corrida.`)
      );
      process.exit(1);
    }

    const matchesExecutedSuite = report.meta.executedSuites.some((s: string) =>
      s.toLowerCase().includes(args.category.toLowerCase()) ||
      args.category.toLowerCase().includes(s.toLowerCase())
    );

    const matchesExecutedFinding = Object.values(report.families).some(fam => {
      if (!fam) return false;
      const lowerCat = args.category.toLowerCase();
      return fam.suites.some(suite =>
        suite.findings.some(f => {
          const ruleDescMatches = typeof f.ruleDescription === 'string' && f.ruleDescription.toLowerCase().includes(lowerCat);
          const ruleIdMatches = typeof f.ruleId === 'string' && f.ruleId.toLowerCase().includes(lowerCat);
          const suiteDescMatches = typeof suite.description === 'string' && suite.description.toLowerCase().includes(lowerCat);
          const suiteNameMatches = typeof suite.name === 'string' && suite.name.toLowerCase().includes(lowerCat);
          return ruleDescMatches || ruleIdMatches || suiteDescMatches || suiteNameMatches;
        })
      );
    });

    if (!matchesExecutedSuite && !matchesExecutedFinding) {
      console.error(
        styleText('red', `❌ La categoría solicitada ('${args.category}') NO fue auditada en la última corrida parcial.\n`) +
        styleText('yellow', `   Suites ejecutadas en esta corrida: ${report.meta.executedSuites.join(', ')}\n`) +
        styleText('yellow', `   Suites omitidas: ${report.meta.omittedSuites.length} suites.\n`) +
        styleText('cyan', `👉 DEBES ejecutar 'npm run auditor' (completo) o 'npm run auditor task=${args.category}' primero.`)
      );
      process.exit(1);
    }
  } else {
    console.log(styleText('yellow', `⚠️  MODO PARCIAL: Inspeccionando resultados de corrida parcial (${report.meta.executedSuiteCount}/${report.meta.totalDiscoveredSuites} suites: ${report.meta.executedSuites.join(', ')}).\n`));
  }
}

function recordFindingInCategory(
  finding: Finding,
  suiteDesc: string,
  categoryCounts: Record<string, { errors: number; warnings: number; findings: Finding[] }>
): void {
  const catKey = finding.ruleDescription || suiteDesc || finding.ruleId || 'Sin Categoría';
  const entry = categoryCounts[catKey] ?? (categoryCounts[catKey] = { errors: 0, warnings: 0, findings: [] });
  if (finding.severity === 'error') {
    entry.errors++;
  } else {
    entry.warnings++;
  }
  entry.findings.push(finding);
}

function collectReportCategoryCounts(report: AuditReport): { categoryCounts: Record<string, { errors: number; warnings: number; findings: Finding[] }>; allFindings: Finding[] } {
  const categoryCounts: Record<string, { errors: number; warnings: number; findings: Finding[] }> = {};
  const allFindings: Finding[] = [];

  for (const fam of Object.values(report.families)) {
    if (!fam) continue;
    for (const suite of fam.suites) {
      const suiteDesc = suite.description || suite.name || '';
      for (const finding of suite.findings) {
        recordFindingInCategory(finding, suiteDesc, categoryCounts);
        allFindings.push(finding);
      }
    }
  }
  return { categoryCounts, allFindings };
}

function matchesPathFilters(f: Finding, args: ReportOptions): boolean {
  const relPath = getNormalizedRelPath(f.file);
  if (args.scope === 'host' && relPath.startsWith('packages/')) return false;
  if (args.scope === 'packages' && !relPath.startsWith('packages/')) return false;

  if (args.dirPattern) {
    const cleanDir = args.dirPattern.replace(/^\.?\/+/, '').toLowerCase();
    const lowerRel = relPath.toLowerCase();
    if (!lowerRel.startsWith(cleanDir) && !lowerRel.includes(`/${cleanDir}`)) {
      return false;
    }
  }

  if (args.filePattern && (!f.file || !f.file.toLowerCase().includes(args.filePattern))) {
    return false;
  }
  return true;
}

function matchesSearchFilter(f: Finding, catKey: string, search: string): boolean {
  const inMsg = f.message.toLowerCase().includes(search);
  const inFile = f.file ? f.file.toLowerCase().includes(search) : false;
  const inRule = (f.ruleId && f.ruleId.toLowerCase().includes(search)) ||
                 (f.ruleDescription && f.ruleDescription.toLowerCase().includes(search)) ||
                 catKey.toLowerCase().includes(search);
  return inMsg || inFile || Boolean(inRule);
}

function checkFindingMatchesFilter(f: Finding, catKey: string, args: ReportOptions): boolean {
  if (args.category !== 'all') {
    const cleanArg = args.category.replace(/[-_]/g, ' ').toLowerCase();
    const cleanCat = catKey.replace(/[-_]/g, ' ').toLowerCase();
    if (!cleanCat.includes(cleanArg)) return false;
  }
  if (args.severity !== 'all' && f.severity !== args.severity) return false;
  if (!matchesPathFilters(f, args)) return false;
  if (args.search && !matchesSearchFilter(f, catKey, args.search)) return false;
  return true;
}

function filterMatchingFindings(
  categoryCounts: Record<string, { errors: number; warnings: number; findings: Finding[] }>,
  args: ReportOptions
): { filteredCategories: Record<string, { errors: number; warnings: number; findings: Finding[] }>; matchingFindings: Finding[] } {
  const filteredCategories: Record<string, { errors: number; warnings: number; findings: Finding[] }> = {};
  const matchingFindings: Finding[] = [];

  for (const [catName, data] of Object.entries(categoryCounts)) {
    const matchingInCat = data.findings.filter(f => checkFindingMatchesFilter(f, catName, args));
    if (matchingInCat.length > 0) {
      filteredCategories[catName] = {
        errors: matchingInCat.filter(f => f.severity === 'error').length,
        warnings: matchingInCat.filter(f => f.severity === 'warning').length,
        findings: matchingInCat
      };
      matchingFindings.push(...matchingInCat);
    }
  }
  return { filteredCategories, matchingFindings };
}

function renderFindingsJson(
  matchingFindings: Finding[],
  filteredCategories: Record<string, { errors: number; warnings: number; findings: Finding[] }>,
  report: AuditReport,
  args: ReportOptions
): void {
  const fileMap: Record<string, { errors: number; warnings: number }> = {};
  const dirMap: Record<string, { errors: number; warnings: number }> = {};
  for (const f of matchingFindings) {
    const relPath = getNormalizedRelPath(f.file);
    const bucket = getDirectoryBucket(f.file);
    if (!fileMap[relPath]) fileMap[relPath] = { errors: 0, warnings: 0 };
    if (!dirMap[bucket]) dirMap[bucket] = { errors: 0, warnings: 0 };
    if (f.severity === 'error') {
      fileMap[relPath].errors++;
      dirMap[bucket].errors++;
    } else {
      fileMap[relPath].warnings++;
      dirMap[bucket].warnings++;
    }
  }
  console.log(JSON.stringify({
    summary: report.summary,
    filteredTotal: matchingFindings.length,
    findings: args.top === 'all' ? matchingFindings : matchingFindings.slice(0, args.top),
    categories: filteredCategories,
    breakdownByDir: dirMap,
    ...(args.filesOnly ? { files: fileMap } : {})
  }, null, 2));
}

function renderCategoryDetailSample(
  target: [string, { errors: number; warnings: number; findings: Finding[] }] | undefined,
  categoryArg: string,
  sortedCategories: [string, { errors: number; warnings: number; findings: Finding[] }][],
  args: ReportOptions
): void {
  if (target) {
    const [catName, data] = target;
    const filtered = data.findings.filter(f => checkFindingMatchesFilter(f, catName, args));
    const limit = args.top === 'all' ? filtered.length : args.top;
    console.log(`\n🔍 Muestra de hallazgos para categoría "${catName}" (Mostrando ${Math.min(limit, filtered.length)} de ${filtered.length}):\n`);
    const sample = filtered.slice(0, limit);
    sample.forEach((f, idx) => {
      const fileLoc = f.file ? `${path.relative(process.cwd(), f.file)}${f.line ? `:${f.line}` : ''}` : 'General';
      console.log(`  ${idx + 1}. [${f.severity.toUpperCase()}] ${fileLoc}`);
      console.log(`     ${f.message}`);
      if (f.context) console.log(`     Contexto: ${f.context}`);
    });
    console.log('');
  } else {
    console.log(`\n⚠️  No se encontraron hallazgos para la categoría "${categoryArg}". Categorías disponibles:`);
    sortedCategories.forEach(([name]) => console.log(`  • ${name}`));
    console.log('');
  }
}

function renderFilteredDetailSample(matchingFindings: Finding[], args: ReportOptions): void {
  const limit = args.top === 'all' ? matchingFindings.length : args.top;
  const filterInfo = [
    args.severity !== 'all' ? `severity=${args.severity}` : null,
    args.dirPattern ? `dir="${args.dirPattern}"` : null,
    args.scope !== 'all' ? `scope=${args.scope}` : null,
    args.search ? `search="${args.search}"` : null,
    args.filePattern ? `file="${args.filePattern}"` : null
  ].filter(Boolean).join(', ');
  console.log(`\n🔍 Hallazgos filtrados (Filtros activos: ${filterInfo}): ${Math.min(limit, matchingFindings.length)} de ${matchingFindings.length}\n`);
  const sample = matchingFindings.slice(0, limit);
  sample.forEach((f, idx) => {
    const fileLoc = f.file ? `${path.relative(process.cwd(), f.file)}${f.line ? `:${f.line}` : ''}` : 'General';
    const ruleTag = f.ruleDescription ? `[${f.ruleDescription}] ` : (f.ruleId ? `[${f.ruleId}] ` : '');
    console.log(`  ${idx + 1}. [${f.severity.toUpperCase()}] ${fileLoc}: ${ruleTag}${f.message}`);
  });
  console.log('');
}

function renderFindingsDetailSample(
  matchingFindings: Finding[],
  sortedCategories: [string, { errors: number; warnings: number; findings: Finding[] }][],
  allFindings: Finding[],
  args: ReportOptions
): void {
  if (args.category !== 'all') {
    const cleanArg = args.category.replace(/[-_]/g, ' ').toLowerCase();
    const target = sortedCategories.find(([name]) => name.toLowerCase().replace(/[-_]/g, ' ').includes(cleanArg));
    renderCategoryDetailSample(target, args.category, sortedCategories, args);
  } else if (args.search || args.filePattern || args.dirPattern || args.scope !== 'all' || args.severity !== 'all') {
    renderFilteredDetailSample(matchingFindings, args);
  } else {
    const allErrors = allFindings.filter(f => f.severity === 'error');
    if (allErrors.length > 0) {
      const limit = args.top === 'all' ? allErrors.length : (typeof args.top === 'number' ? args.top : DEFAULT_SAMPLE_ERROR_LIMIT);
      console.log(renderSampleFindings(allErrors, limit));
    }
  }
}

function renderBreakdownView(matchingFindings: Finding[], args: ReportOptions): void {
  const sortedDirs = aggregateAndSortFindings(matchingFindings, f => getDirectoryBucket(f.file));
  const bannerTitle = args.category !== 'all'
    ? `DISTRIBUCIÓN POR DIRECTORIO (${args.category})`
    : 'DISTRIBUCIÓN POR DIRECTORIO / ÁMBITO';
  console.log('\n' + renderBanner(bannerTitle, `Total hallazgos: ${matchingFindings.length} | Directorios afectados: ${sortedDirs.length}`));
  console.log('\n' + renderFindingsBreakdownTable(sortedDirs, 'DIRECTORIO / ÁMBITO') + '\n');
}

function renderFilesOnlyView(matchingFindings: Finding[], report: AuditReport, args: ReportOptions): void {
  const sortedFiles = aggregateAndSortFindings(matchingFindings, f => getNormalizedRelPath(f.file));
  const filesToDisplay = args.top === 'all' ? sortedFiles : sortedFiles.slice(0, args.top);
  const bannerTitle = args.category !== 'all'
    ? `ARCHIVOS CON HALLAZGOS (${args.category})`
    : 'ARCHIVOS CON HALLAZGOS DE AUDITORÍA';
  console.log('\n' + renderBanner(bannerTitle, `Estado: ${report.status === 'passed' ? 'PASSED' : 'FAILED'} | Archivos afectados: ${sortedFiles.length}`));
  console.log('\n' + renderFindingsBreakdownTable(filesToDisplay, 'ARCHIVO AFECTADO') + '\n');
}

function renderByFileView(
  matchingFindings: Finding[],
  report: AuditReport,
  args: ReportOptions
): void {
  const sortedFindings = sortFindingsByFileAndLine(matchingFindings);
  const fileSummaryMap = groupFindingsByFileMap(sortedFindings);
  const fileSummaries: AuditFileSummary[] = Object.values(fileSummaryMap);

  fileSummaries.sort((a, b) => {
    const scoreB = b.errors * ERROR_WEIGHT_FACTOR + b.warnings;
    const scoreA = a.errors * ERROR_WEIGHT_FACTOR + a.warnings;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.file.localeCompare(b.file);
  });

  const totalErrors = matchingFindings.filter(f => f.severity === 'error').length;
  const totalWarnings = matchingFindings.filter(f => f.severity === 'warning').length;

  if (args.jsonOutput) {
    const byFileReport: AuditByFileReport = {
      meta: report.meta,
      status: report.status,
      summary: {
        ...report.summary,
        totalViolations: matchingFindings.length,
        errors: totalErrors,
        warnings: totalWarnings
      },
      totalAffectedFiles: fileSummaries.length,
      files: Object.fromEntries(fileSummaries.map(fs => [fs.file, fs]))
    };
    console.log(JSON.stringify(byFileReport, null, 2));
    return;
  }

  const filterLabels: string[] = [];
  if (args.filePattern) filterLabels.push(`archivo: "${args.filePattern}"`);
  if (args.category !== 'all') filterLabels.push(`categoría: "${args.category}"`);
  if (args.severity !== 'all') filterLabels.push(`severidad: ${args.severity}`);
  if (args.dirPattern) filterLabels.push(`directorio: "${args.dirPattern}"`);
  if (args.search) filterLabels.push(`búsqueda: "${args.search}"`);

  const subtitle = filterLabels.length > 0
    ? `Filtros: ${filterLabels.join(', ')} | Archivos: ${fileSummaries.length} | Incidencias: ${matchingFindings.length}`
    : `Estado: ${report.status === 'passed' ? 'PASSED' : 'FAILED'} | Archivos afectados: ${fileSummaries.length} | Incidencias: ${matchingFindings.length}`;

  console.log('\n' + renderBanner('HALLAZGOS DE AUDITORÍA AGRUPADOS POR ARCHIVO Y LÍNEA', subtitle));

  if (fileSummaries.length === 0) {
    console.log(styleText('green', '\n✨ No se encontraron incidencias que coincidan con los filtros activos.\n'));
    return;
  }

  if (fileSummaries.length > 1 && !args.filePattern) {
    const tableEntries = fileSummaries.map(fs => [
      fs.file,
      { errors: fs.errors, warnings: fs.warnings }
    ] as [string, { errors: number; warnings: number }]);
    const tableLimit = typeof args.top === 'number' ? Math.min(args.top, fileSummaries.length) : fileSummaries.length;
    console.log('\n' + renderFindingsBreakdownTable(tableEntries.slice(0, tableLimit), 'ARCHIVO AFECTADO') + '\n');
  }

  const treeOutput = renderFindingsByFileTree(fileSummaries, {
    maxFiles: args.top,
    maxFindingsPerFile: 'all'
  });
  console.log(treeOutput + '\n');
}

export function runReport(): void {
  const args = parseReportOptions();
  const report = loadAuditReport(args.inspectFix);
  if (!report) process.exit(1);

  validateReportFreshnessAndScope(report, args);
  const { categoryCounts, allFindings } = collectReportCategoryCounts(report);
  const { filteredCategories, matchingFindings } = filterMatchingFindings(categoryCounts, args);

  if (args.byFile) {
    renderByFileView(matchingFindings, report, args);
    return;
  }

  if (args.jsonOutput) {
    renderFindingsJson(matchingFindings, filteredCategories, report, args);
    return;
  }

  if (args.breakdown) {
    renderBreakdownView(matchingFindings, args);
    return;
  }

  if (args.filesOnly) {
    renderFilesOnlyView(matchingFindings, report, args);
    return;
  }

  console.log('\n' + renderBanner(
    'REPORTE CONSOLIDADO DE ADVERTENCIAS Y ERRORES',
    `Estado: ${report.status === 'passed' ? 'PASSED' : 'FAILED'} | Suites: ${report.summary.suitesPassed}/${report.summary.suitesTotal}`
  ));

  const categoriesToRender = (args.category !== 'all' || args.severity !== 'all' || args.search || args.filePattern || args.dirPattern || args.scope !== 'all')
    ? filteredCategories
    : categoryCounts;

  const sortedCategories = sortFindingsEntries(Object.entries(categoriesToRender));
  console.log('\n' + renderFindingsBreakdownTable(sortedCategories, 'CATEGORÍA / REGLA DE AUDITORÍA') + '\n');

  if (args.summaryOnly) return;
  renderFindingsDetailSample(matchingFindings, sortedCategories, allFindings, args);
}

if (isMainModule(import.meta.url)) {
  bootstrapCliProject();
  runReport();
}
