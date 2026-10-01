import fs from 'node:fs';
import path from 'node:path';
import { styleText } from 'node:util';
import type { FindingSeverity, ConsolidatedAuditReport } from '../core/auditContract.ts';
import { MAX_AUDIT_STALENESS_MS } from '../core/auditContract.ts';
import { renderBanner, renderBoxTable, type TableColumn } from '../core/unifiedTheme.ts';

const RADIX_DECIMAL = 10;
const DEFAULT_TOP_LIMIT = 20;
const DEFAULT_SAMPLE_ERROR_LIMIT = 5;
const ERROR_WEIGHT_FACTOR = 1000;

interface Finding {
  severity: FindingSeverity;
  message: string;
  file?: string;
  line?: number;
  context?: string;
  ruleId?: string;
  ruleDescription?: string;
}

type AuditReport = ConsolidatedAuditReport;

export type SeverityFilter = 'all' | 'error' | 'warning';

interface ReportOptions {
  category: string;
  severity: SeverityFilter;
  search: string;
  filePattern: string;
  dirPattern: string;
  scope: 'all' | 'host' | 'packages';
  breakdown: boolean;
  top: number | 'all';
  jsonOutput: boolean;
  summaryOnly: boolean;
  filesOnly: boolean;
  allowStale: boolean;
  allowPartial: boolean;
}

function parseReportOptions(): ReportOptions {
  const argv = process.argv.slice(2);
  let category = 'all';
  let severity: SeverityFilter = 'all';
  let search = '';
  let filePattern = '';
  let dirPattern = '';
  let scope: 'all' | 'host' | 'packages' = 'all';
  let breakdown = false;
  let top: number | 'all' = DEFAULT_TOP_LIMIT;
  let jsonOutput = false;
  let summaryOnly = false;
  let filesOnly = false;
  let allowStale = false;
  let allowPartial = false;

  for (const arg of argv) {
    if (arg === 'json' || arg === '--json' || arg === 'json=true') {
      jsonOutput = true;
    } else if (arg === 'summary' || arg === '--summary' || arg === 'summary=true') {
      summaryOnly = true;
    } else if (arg === 'files' || arg === '--files' || arg === 'files=true') {
      filesOnly = true;
    } else if (arg === 'breakdown' || arg === '--breakdown' || arg === 'breakdown=true' || arg === 'by-dir' || arg === 'dirs') {
      breakdown = true;
    } else if (arg === 'allow-stale' || arg === '--allow-stale' || arg === 'stale') {
      allowStale = true;
    } else if (arg === 'allow-partial' || arg === '--allow-partial' || arg === 'partial') {
      allowPartial = true;
    } else if (arg === 'host' || arg === 'scope=host') {
      scope = 'host';
    } else if (arg === 'packages' || arg === 'scope=packages' || arg === 'pkg') {
      scope = 'packages';
    } else if (arg.startsWith('scope=')) {
      const val = arg.slice(6).toLowerCase();
      if (val === 'host' || val === 'packages' || val === 'all') {
        scope = val;
      }
    } else if (arg.startsWith('dir=')) {
      dirPattern = arg.slice(4).toLowerCase();
    } else if (arg.startsWith('folder=')) {
      dirPattern = arg.slice(7).toLowerCase();
    } else if (arg === 'errors' || arg === 'error' || arg === 'severity=error') {
      severity = 'error';
    } else if (arg === 'warnings' || arg === 'warning' || arg === 'severity=warning') {
      severity = 'warning';
    } else if (arg.startsWith('severity=')) {
      const val = arg.slice(9).toLowerCase();
      if (val === 'error' || val === 'warning' || val === 'all') {
        severity = val;
      }
    } else if (arg.startsWith('category=')) {
      category = arg.slice(9).toLowerCase();
    } else if (arg.startsWith('search=')) {
      search = arg.slice(7).toLowerCase();
    } else if (arg.startsWith('file=')) {
      filePattern = arg.slice(5).toLowerCase();
    } else if (arg.startsWith('top=')) {
      const topVal = arg.slice(4).toLowerCase();
      top = topVal === 'all' || topVal === '0' ? 'all' : (parseInt(topVal, RADIX_DECIMAL) || DEFAULT_TOP_LIMIT);
    } else if (!arg.startsWith('-')) {
      category = arg.toLowerCase();
    }
  }

  return { category, severity, search, filePattern, dirPattern, scope, breakdown, top, jsonOutput, summaryOnly, filesOnly, allowStale, allowPartial };
}

function loadAuditReport(): AuditReport | null {
  const reportPath = path.resolve(process.cwd(), 'scratch/audits/latest_audit.json');
  if (!fs.existsSync(reportPath)) {
    console.error('❌ No se encontró scratch/audits/latest_audit.json. Ejecuta primero "npm run audit".');
    return null;
  }
  try {
    const raw = fs.readFileSync(reportPath, 'utf8');
    const parsed = JSON.parse(raw) as AuditReport;
    if (!parsed.meta) {
      console.error('❌ scratch/audits/latest_audit.json no contiene la cabecera de metadatos "meta". Ejecuta "npm run audit" para regenerarlo.');
      return null;
    }
    return parsed;
  } catch (e) {
    console.error(`❌ Error al parsear scratch/audits/latest_audit.json: ${(e as Error).message}`);
    return null;
  }
}

export function runReport(): void {
  const args = parseReportOptions();
  const report = loadAuditReport();
  if (!report) process.exit(1);

  // 1. Anti-staleness verification (Max 5 minutes)
  try {
    const auditInstant = Temporal.Instant.from(report.meta.timestamp);
    const now = Temporal.Now.instant();
    const elapsedMs = now.since(auditInstant).total({ unit: 'millisecond' });
    if (!args.allowStale && elapsedMs > MAX_AUDIT_STALENESS_MS) {
      const elapsedMins = Math.max(1, Math.round(now.since(auditInstant).total({ unit: 'minute' })));
      const limitMins = Math.round(MAX_AUDIT_STALENESS_MS / (60 * 1000));
      console.error(
        styleText('red', `❌ scratch/audits/latest_audit.json está OBSOLETO (${elapsedMins} minutos de antigüedad, límite: ${limitMins} min).\n`) +
        styleText('yellow', `   El código fuente pudo haber cambiado desde la última auditoría.\n`) +
        styleText('cyan', `👉 DEBES ejecutar 'npm run audit' para regenerar y validar el reporte.`)
      );
      process.exit(1);
    }
  } catch (err) {
    if ((err as Error).message.includes('OBSOLETO')) throw err;
    console.error(
      styleText('red', `❌ scratch/audits/latest_audit.json contiene un timestamp inválido ('${report.meta.timestamp}').\n`) +
      styleText('cyan', `👉 DEBES ejecutar 'npm run audit' para regenerar y validar el reporte.`)
    );
    process.exit(1);
  }

  if (!report.meta.isFullAudit) {
    if (!args.allowPartial) {
      if (args.category === 'all') {
        console.error(
          styleText('red', `❌ scratch/audits/latest_audit.json proviene de una auditoría PARCIAL (${report.meta.runMode}, ${report.meta.executedSuiteCount}/${report.meta.totalDiscoveredSuites} suites ejecutadas).\n`) +
          styleText('yellow', `   No es posible emitir reportes globales de hallazgos sobre una corrida parcial.\n`) +
          styleText('cyan', `👉 DEBES ejecutar 'npm run audit' (completo) o agregar 'partial' para inspeccionar esta corrida.`)
        );
        process.exit(1);
      }

      const matchesExecutedSuite = report.meta.executedSuites.some((s: string) =>
        s.toLowerCase().includes(args.category.toLowerCase()) ||
        args.category.toLowerCase().includes(s.toLowerCase())
      );

      const matchesExecutedFinding = Object.values(report.families).some(fam => {
        if (!fam) return false;
        return fam.suites.some(suite =>
          suite.findings.some(f => {
            const catKey = f.ruleDescription || suite.description || f.ruleId || suite.name || '';
            return catKey.toLowerCase().includes(args.category.toLowerCase());
          })
        );
      });

      if (!matchesExecutedSuite && !matchesExecutedFinding) {
        console.error(
          styleText('red', `❌ La categoría solicitada ('${args.category}') NO fue auditada en la última corrida parcial.\n`) +
          styleText('yellow', `   Suites ejecutadas en esta corrida: ${report.meta.executedSuites.join(', ')}\n`) +
          styleText('yellow', `   Suites omitidas: ${report.meta.omittedSuites.length} suites.\n`) +
          styleText('cyan', `👉 DEBES ejecutar 'npm run audit' (completo) o 'npm run audit task=${args.category}' primero.`)
        );
        process.exit(1);
      }
    } else {
      console.log(styleText('yellow', `⚠️  MODO PARCIAL: Inspeccionando resultados de corrida parcial (${report.meta.executedSuiteCount}/${report.meta.totalDiscoveredSuites} suites: ${report.meta.executedSuites.join(', ')}).\n`));
    }
  }

  const categoryCounts: Record<string, { errors: number; warnings: number; findings: Finding[] }> = {};
  const allFindings: Finding[] = [];

  for (const fam of Object.values(report.families)) {
    if (!fam) continue;
    for (const suite of fam.suites) {
      for (const finding of suite.findings) {
        const catKey = finding.ruleDescription || suite.description || finding.ruleId || suite.name || 'Sin Categoría';
        if (!categoryCounts[catKey]) {
          categoryCounts[catKey] = { errors: 0, warnings: 0, findings: [] };
        }
        if (finding.severity === 'error') {
          categoryCounts[catKey].errors++;
        } else {
          categoryCounts[catKey].warnings++;
        }
        categoryCounts[catKey].findings.push(finding);
        allFindings.push(finding);
      }
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

  const matchesCategory = (catKey: string): boolean => {
    if (args.category === 'all') return true;
    const cleanArg = args.category.replace(/[-_]/g, ' ').toLowerCase();
    const cleanCat = catKey.replace(/[-_]/g, ' ').toLowerCase();
    return cleanCat.includes(cleanArg);
  };

  const matchesFilters = (f: Finding, catKey: string): boolean => {
    if (!matchesCategory(catKey)) return false;
    if (args.severity !== 'all' && f.severity !== args.severity) return false;

    const relPath = getNormalizedRelPath(f.file);

    // Scope filter: host vs packages
    if (args.scope === 'host' && relPath.startsWith('packages/')) return false;
    if (args.scope === 'packages' && !relPath.startsWith('packages/')) return false;

    // Directory filter:
    if (args.dirPattern) {
      const cleanDir = args.dirPattern.replace(/^\.?\/+/, '').toLowerCase();
      const lowerRel = relPath.toLowerCase();
      if (!lowerRel.startsWith(cleanDir) && !lowerRel.includes(`/${cleanDir}`)) {
        return false;
      }
    }

    if (args.filePattern && (!f.file || !f.file.toLowerCase().includes(args.filePattern))) return false;
    if (args.search) {
      const inMsg = f.message.toLowerCase().includes(args.search);
      const inFile = f.file ? f.file.toLowerCase().includes(args.search) : false;
      const inRule = (f.ruleId && f.ruleId.toLowerCase().includes(args.search)) ||
                     (f.ruleDescription && f.ruleDescription.toLowerCase().includes(args.search)) ||
                     catKey.toLowerCase().includes(args.search);
      if (!inMsg && !inFile && !inRule) return false;
    }
    return true;
  };

  const filteredCategories: Record<string, { errors: number; warnings: number; findings: Finding[] }> = {};
  const matchingFindings: Finding[] = [];

  for (const [catName, data] of Object.entries(categoryCounts)) {
    const matchingInCat = data.findings.filter(f => matchesFilters(f, catName));
    if (matchingInCat.length > 0) {
      filteredCategories[catName] = {
        errors: matchingInCat.filter(f => f.severity === 'error').length,
        warnings: matchingInCat.filter(f => f.severity === 'warning').length,
        findings: matchingInCat
      };
      matchingFindings.push(...matchingInCat);
    }
  }

  if (args.jsonOutput) {
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
    return;
  }

  if (args.breakdown) {
    const dirMap: Record<string, { errors: number; warnings: number }> = {};
    for (const f of matchingFindings) {
      const bucket = getDirectoryBucket(f.file);
      if (!dirMap[bucket]) {
        dirMap[bucket] = { errors: 0, warnings: 0 };
      }
      if (f.severity === 'error') {
        dirMap[bucket].errors++;
      } else {
        dirMap[bucket].warnings++;
      }
    }

    const sortedDirs = Object.entries(dirMap).sort((a, b) => {
      const totalB = b[1].errors * ERROR_WEIGHT_FACTOR + b[1].warnings;
      const totalA = a[1].errors * ERROR_WEIGHT_FACTOR + a[1].warnings;
      return totalB - totalA;
    });

    const bannerTitle = args.category !== 'all'
      ? `DISTRIBUCIÓN POR DIRECTORIO (${args.category})`
      : 'DISTRIBUCIÓN POR DIRECTORIO / ÁMBITO';

    console.log('\n' + renderBanner(
      bannerTitle,
      `Total hallazgos: ${matchingFindings.length} | Directorios afectados: ${sortedDirs.length}`
    ));

    interface DirRow {
      dir: string;
      errors: string;
      warnings: string;
    }

    const dirCols: readonly TableColumn<DirRow>[] = [
      { header: 'DIRECTORIO / ÁMBITO', width: 52, align: 'left', key: 'dir' },
      { header: 'ERRORES', width: 9, align: 'right', key: 'errors' },
      { header: 'WARNINGS', width: 9, align: 'right', key: 'warnings' }
    ];

    const dirRows: DirRow[] = sortedDirs.map(([d, counts]) => ({
      dir: d,
      errors: counts.errors > 0 ? styleText('red', String(counts.errors)) : styleText('dim', '0'),
      warnings: counts.warnings > 0 ? styleText('yellow', String(counts.warnings)) : styleText('dim', '0')
    }));

    const totalErrors = sortedDirs.reduce((acc, [_, counts]) => acc + counts.errors, 0);
    const totalWarnings = sortedDirs.reduce((acc, [_, counts]) => acc + counts.warnings, 0);

    const footerRow: DirRow = {
      dir: styleText('bold', 'TOTAL CONSOLIDADO'),
      errors: totalErrors > 0 ? styleText(['bold', 'red'], String(totalErrors)) : styleText('dim', '0'),
      warnings: totalWarnings > 0 ? styleText(['bold', 'yellow'], String(totalWarnings)) : styleText('dim', '0')
    };

    console.log('\n' + renderBoxTable(dirCols, dirRows, { footerRows: [footerRow] }));
    console.log('');
    return;
  }

  if (args.filesOnly) {
    const fileMap: Record<string, { errors: number; warnings: number }> = {};
    for (const f of matchingFindings) {
      const relPath = getNormalizedRelPath(f.file);
      if (!fileMap[relPath]) {
        fileMap[relPath] = { errors: 0, warnings: 0 };
      }
      if (f.severity === 'error') {
        fileMap[relPath].errors++;
      } else {
        fileMap[relPath].warnings++;
      }
    }

    const sortedFiles = Object.entries(fileMap).sort((a, b) => {
      const totalB = b[1].errors * ERROR_WEIGHT_FACTOR + b[1].warnings;
      const totalA = a[1].errors * ERROR_WEIGHT_FACTOR + a[1].warnings;
      return totalB - totalA;
    });

    const filesToDisplay = args.top === 'all' ? sortedFiles : sortedFiles.slice(0, args.top);

    const bannerTitle = args.category !== 'all'
      ? `ARCHIVOS CON HALLAZGOS (${args.category})`
      : 'ARCHIVOS CON HALLAZGOS DE AUDITORÍA';

    console.log('\n' + renderBanner(
      bannerTitle,
      `Estado: ${report.status === 'passed' ? 'PASSED' : 'FAILED'} | Archivos afectados: ${sortedFiles.length}`
    ));

    interface FileFindingRow {
      file: string;
      errors: string;
      warnings: string;
    }

    const fileCols: readonly TableColumn<FileFindingRow>[] = [
      { header: 'ARCHIVO AFECTADO', width: 52, align: 'left', key: 'file' },
      { header: 'ERRORES', width: 9, align: 'right', key: 'errors' },
      { header: 'WARNINGS', width: 9, align: 'right', key: 'warnings' }
    ];

    const fileRows: FileFindingRow[] = filesToDisplay.map(([filePath, data]) => ({
      file: filePath,
      errors: data.errors > 0 ? styleText('red', String(data.errors)) : styleText('dim', '0'),
      warnings: data.warnings > 0 ? styleText('yellow', String(data.warnings)) : styleText('dim', '0')
    }));

    const totalFileErrors = sortedFiles.reduce((acc, [_, data]) => acc + data.errors, 0);
    const totalFileWarnings = sortedFiles.reduce((acc, [_, data]) => acc + data.warnings, 0);

    const fileFooterRow: FileFindingRow = {
      file: styleText('bold', 'TOTAL CONSOLIDADO'),
      errors: totalFileErrors > 0 ? styleText(['bold', 'red'], String(totalFileErrors)) : styleText('dim', '0'),
      warnings: totalFileWarnings > 0 ? styleText(['bold', 'yellow'], String(totalFileWarnings)) : styleText('dim', '0')
    };

    console.log('\n' + renderBoxTable(fileCols, fileRows, { footerRows: [fileFooterRow] }));
    console.log('');
    return;
  }

  console.log('\n' + renderBanner(
    'REPORTE CONSOLIDADO DE ADVERTENCIAS Y ERRORES',
    `Estado: ${report.status === 'passed' ? 'PASSED' : 'FAILED'} | Suites: ${report.summary.suitesPassed}/${report.summary.suitesTotal}`
  ));

  const categoriesToRender = (args.category !== 'all' || args.severity !== 'all' || args.search || args.filePattern || args.dirPattern || args.scope !== 'all')
    ? filteredCategories
    : categoryCounts;

  const sortedCategories = Object.entries(categoriesToRender).sort((a, b) => {
    const totalB = b[1].errors * ERROR_WEIGHT_FACTOR + b[1].warnings;
    const totalA = a[1].errors * ERROR_WEIGHT_FACTOR + a[1].warnings;
    return totalB - totalA;
  });

  interface CategoryRow {
    category: string;
    errors: string;
    warnings: string;
  }

  const catCols: readonly TableColumn<CategoryRow>[] = [
    { header: 'CATEGORÍA / REGLA DE AUDITORÍA', width: 52, align: 'left', key: 'category' },
    { header: 'ERRORES', width: 9, align: 'right', key: 'errors' },
    { header: 'WARNINGS', width: 9, align: 'right', key: 'warnings' }
  ];

  const catRows: CategoryRow[] = sortedCategories.map(([catName, data]) => ({
    category: catName,
    errors: data.errors > 0 ? styleText('red', String(data.errors)) : styleText('dim', '0'),
    warnings: data.warnings > 0 ? styleText('yellow', String(data.warnings)) : styleText('dim', '0')
  }));

  const totalErrors = sortedCategories.reduce((acc, [_, data]) => acc + data.errors, 0);
  const totalWarnings = sortedCategories.reduce((acc, [_, data]) => acc + data.warnings, 0);

  const footerRow: CategoryRow = {
    category: styleText('bold', 'TOTAL CONSOLIDADO'),
    errors: totalErrors > 0 ? styleText(['bold', 'red'], String(totalErrors)) : styleText('dim', '0'),
    warnings: totalWarnings > 0 ? styleText(['bold', 'yellow'], String(totalWarnings)) : styleText('dim', '0')
  };

  console.log('\n' + renderBoxTable(catCols, catRows, { footerRows: [footerRow] }));
  console.log('');

  if (args.summaryOnly) return;

  if (args.category !== 'all') {
    const cleanArg = args.category.replace(/[-_]/g, ' ').toLowerCase();
    const target = sortedCategories.find(([name]) => name.toLowerCase().replace(/[-_]/g, ' ').includes(cleanArg));
    if (target) {
      const [catName, data] = target;
      const filtered = data.findings.filter(f => matchesFilters(f, catName));
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
      console.log(`\n⚠️  No se encontraron hallazgos para la categoría "${args.category}". Categorías disponibles:`);
      sortedCategories.forEach(([name]) => console.log(`  • ${name}`));
      console.log('');
    }
  } else if (args.search || args.filePattern || args.dirPattern || args.scope !== 'all' || args.severity !== 'all') {
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
  } else {
    const allErrors: Finding[] = [];
    for (const fam of Object.values(report.families)) {
      if (!fam) continue;
      for (const suite of fam.suites) {
        for (const finding of suite.findings) {
          if (finding.severity === 'error') {
            allErrors.push(finding);
          }
        }
      }
    }

    if (allErrors.length > 0) {
      const limit = args.top === 'all' ? allErrors.length : (typeof args.top === 'number' ? args.top : DEFAULT_SAMPLE_ERROR_LIMIT);
      const sampleErrors = limit >= allErrors.length ? allErrors : allErrors.slice(-limit);
      console.log(`❌ Muestra de errores detectados (${limit >= allErrors.length ? `todos los ${sampleErrors.length}` : `últimos ${sampleErrors.length}`} de ${allErrors.length}):\n`);
      sampleErrors.forEach((f, idx) => {
        const fileLoc = f.file ? `${path.relative(process.cwd(), f.file)}${f.line ? `:${f.line}` : ''}` : 'General';
        const cleanMsg = f.message.replace(/^Sugerencia de calidad \(Fallow\):\s*/i, '');
        const normalizedRuleDesc = (f.ruleDescription || '').replace(/^Fallow:\s*/i, '').trim().toLowerCase();
        const ruleTag = f.ruleDescription && !cleanMsg.toLowerCase().includes(normalizedRuleDesc)
          ? `[${f.ruleDescription}] `
          : (f.ruleDescription?.startsWith('Fallow:') ? '[Fallow] ' : (f.ruleId ? `[${f.ruleId}] ` : ''));
        console.log(`  ${idx + 1}. ${fileLoc}: ${ruleTag}${cleanMsg}`);
      });
      console.log('');
    }
  }
}

runReport();
