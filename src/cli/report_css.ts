#!/usr/bin/env -S node --experimental-strip-types
/**
 * packages/auditor/src/cli/report_css.ts
 *
 * CLI TOOL: REPORTE DE CALIDAD, DUPLICACIÓN Y PATRONES CSS (POSTCSS AST)
 *
 * Generates an 80-column Box-Drawing report or structured JSON output of CSS issues:
 * duplicate rules, similar classes, unvariabled colors, long lines, and duplicate selectors.
 *
 * Usage:
 *   auditor-css
 *   auditor-css --category=duplicates
 *   auditor-css --category=similar
 *   auditor-css --category=colors
 *   auditor-css --category=long-lines
 *   auditor-css --category=selectors
 *   auditor-css --category=empty
 *   auditor-css --json
 */

import { parseArgs, styleText } from 'node:util';
import path from 'node:path';
import { renderBanner, renderBoxTable, type TableColumn } from '../core/unifiedTheme.ts';
import { getAuditConfig } from '../core/auditConfig.ts';
import { CANONICAL_IGNORE_DIRS } from '../core/auditorBase.ts';
import { isMainModule } from './cliUtils.ts';
import {
  runCssAnalysis,
  type CssAnalysisOptions
} from '../analyzers/cssAnalyzer.ts';

const DEFAULT_CSS_SIMILARITY_THRESHOLD = 80;
const DEFAULT_CSS_MIN_DECLARATIONS = 2;
const DEFAULT_CSS_LONG_LINE_LENGTH_THRESHOLD = 20;

const MAX_ITEM_DISPLAY_CHARS = 25;
const MAX_ITEM_TRUNCATE_CHARS = 24;
const MAX_LOCATION_DISPLAY_CHARS = 22;
const MAX_LOCATION_TRUNCATE_CHARS = 21;

const COL_WIDTH_INDEX = 3;
const COL_WIDTH_CATEGORY = 14;
const COL_WIDTH_ITEM = 26;
const COL_WIDTH_DETAIL = 12;
const COL_WIDTH_LOCATION = 22;

function truncateItem(item: string): string {
  return item.length > MAX_ITEM_DISPLAY_CHARS
    ? `${item.slice(0, MAX_ITEM_TRUNCATE_CHARS)}…`
    : item;
}

function truncateLocation(loc: string): string {
  return loc.length > MAX_LOCATION_DISPLAY_CHARS
    ? `${loc.slice(0, MAX_LOCATION_TRUNCATE_CHARS)}…`
    : loc;
}

interface TableRow {
  index: string;
  category: string;
  item: string;
  count: string;
  location: string;
}

export async function runCssReport(projectRoot: string = process.cwd()): Promise<void> {
  const config = getAuditConfig(projectRoot);
  const cfg = config.styles?.duplicates;

  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      category: { type: 'string', default: 'all' },
      'sim-threshold': { type: 'string', default: String(cfg?.similarityThreshold ?? DEFAULT_CSS_SIMILARITY_THRESHOLD) },
      'min-decls': { type: 'string', default: String(cfg?.minDeclarations ?? DEFAULT_CSS_MIN_DECLARATIONS) },
      'min-length': { type: 'string', default: String(cfg?.longLineLengthThreshold ?? DEFAULT_CSS_LONG_LINE_LENGTH_THRESHOLD) },
      json: { type: 'boolean', default: false },
      'errors-only': { type: 'boolean', default: false }
    },
    strict: false,
    allowPositionals: true
  });

  const category = String(values.category || 'all').toLowerCase();
  const isJson = Boolean(values.json);
  const errorsOnly = Boolean(values['errors-only']);
  const similarityThreshold = parseInt(String(values['sim-threshold'] || DEFAULT_CSS_SIMILARITY_THRESHOLD), 10);
  const minDeclarations = parseInt(String(values['min-decls'] || DEFAULT_CSS_MIN_DECLARATIONS), 10);
  const longLineLengthThreshold = parseInt(String(values['min-length'] || DEFAULT_CSS_LONG_LINE_LENGTH_THRESHOLD), 10);

  const options: CssAnalysisOptions = {
    minDeclarations,
    similarityThreshold,
    longLineLengthThreshold,
    checkSimilar: category === 'all' || category === 'similar',
    checkLongLines: category === 'all' || category === 'long-lines',
    checkColors: category === 'all' || category === 'colors',
    checkDuplicateSelectors: category === 'all' || category === 'selectors',
    checkEmptyRules: category === 'all' || category === 'empty',
    checkUnused: category === 'all' || category === 'unused'
  };

  const startTime = performance.now();
  const { violations, details, filesScanned } = await runCssAnalysis(
    '.',
    new Set(CANONICAL_IGNORE_DIRS),
    options,
    projectRoot
  );
  const durationMs = Math.round(performance.now() - startTime);

  const filteredViolations = errorsOnly
    ? violations.filter(v => v.severity === 'error')
    : violations;

  if (isJson) {
    const jsonOutput = {
      summary: {
        filesScanned,
        totalErrors: violations.filter(v => v.severity === 'error').length,
        totalWarnings: violations.filter(v => v.severity === 'warning').length,
        durationMs,
        countsByRule: {
          'css-duplicate-rules': details.duplicates.length,
          'css-similar-classes': details.similar.length,
          'css-duplicate-long-lines': details.longValues.length,
          'css-unvariabled-colors': details.unvariabledColors.length,
          'css-duplicate-selectors': details.duplicateSelectors.length,
          'css-empty-rules': details.emptyRules.length,
          'css-unused-classes': details.unusedClasses.length
        }
      },
      findings: filteredViolations.map(v => ({
        ruleId: v.context.includes('duplicación') ? 'css-duplicate-rules' :
          v.context.includes('similitud') ? 'css-similar-classes' :
          v.context.includes('valor largo') ? 'css-duplicate-long-lines' :
          v.context.includes('color') ? 'css-unvariabled-colors' :
          v.context.includes('selector repetido') ? 'css-duplicate-selectors' :
          v.context.includes('regla css vacía') ? 'css-empty-rules' : 'css-unused-classes',
        severity: v.severity,
        file: path.relative(projectRoot, v.file).replace(/\\/g, '/'),
        line: v.line,
        message: v.message,
        context: v.context
      })),
      details
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
    return;
  }

  renderBanner('REPORTE DE CALIDAD Y DUPLICACIÓN CSS (POSTCSS AST)', 'Análisis estático de estilos y patrones');
  console.log(
    styleText('dim', `🔍 Analizados ${filesScanned} archivos en ${durationMs}ms (Categoría: ${category}, MinDecls: ${minDeclarations}, SimThreshold: ${similarityThreshold}%)\n`)
  );

  const rows: TableRow[] = [];
  let rowIdx = 1;

  if (category === 'all' || category === 'duplicates') {
    for (const dup of details.duplicates) {
      const first = dup.occurrences[0]!;
      const loc = `${first.file.split('/').pop()}:${first.line}`;
      rows.push({
        index: String(rowIdx++),
        category: styleText('red', 'DUPLICADO'),
        item: truncateItem(dup.signature),
        count: `${dup.occurrences.length} lugares`,
        location: truncateLocation(loc)
      });
    }
  }

  if (category === 'all' || category === 'similar') {
    for (const sim of details.similar) {
      const loc = `${sim.left.file.split('/').pop()}:${sim.left.line}`;
      rows.push({
        index: String(rowIdx++),
        category: styleText('yellow', 'SIMILAR'),
        item: `${sim.left.selector} ~ ${sim.right.selector}`,
        count: `${sim.similarity}% simil`,
        location: truncateLocation(loc)
      });
    }
  }

  if (category === 'all' || category === 'colors') {
    for (const c of details.unvariabledColors) {
      const first = c.occurrences[0]!;
      const loc = `${first.file.split('/').pop()}:${first.line}`;
      rows.push({
        index: String(rowIdx++),
        category: styleText('cyan', 'COLOR RAW'),
        item: c.color,
        count: `${c.occurrences.length} reglas`,
        location: truncateLocation(loc)
      });
    }
  }

  if (category === 'all' || category === 'long-lines') {
    for (const lv of details.longValues) {
      const first = lv.occurrences[0]!;
      const loc = `${first.file.split('/').pop()}:${first.line}`;
      rows.push({
        index: String(rowIdx++),
        category: styleText('magenta', 'VALOR LARGO'),
        item: truncateItem(lv.value),
        count: `${lv.occurrences.length} lugares`,
        location: truncateLocation(loc)
      });
    }
  }

  if (category === 'all' || category === 'selectors') {
    for (const ds of details.duplicateSelectors) {
      const loc = `${ds.file.split('/').pop()}:${ds.lines[0]}`;
      rows.push({
        index: String(rowIdx++),
        category: styleText('red', 'SELECTOR DUP'),
        item: truncateItem(ds.selector),
        count: `${ds.lines.length} veces`,
        location: truncateLocation(loc)
      });
    }
  }

  if (category === 'all' || category === 'empty') {
    for (const er of details.emptyRules) {
      const loc = `${er.file.split('/').pop()}:${er.line}`;
      rows.push({
        index: String(rowIdx++),
        category: styleText('gray', 'REGLA VACÍA'),
        item: truncateItem(er.selector),
        count: '0 props',
        location: truncateLocation(loc)
      });
    }
  }

  if (rows.length === 0) {
    console.log(styleText('green', '✨ No se detectaron problemas ni duplicados de estilos CSS/SCSS.\n'));
    return;
  }

  const cols: readonly TableColumn<TableRow>[] = [
    { header: '#', width: COL_WIDTH_INDEX, align: 'center', key: 'index' },
    { header: 'CATEGORÍA', width: COL_WIDTH_CATEGORY, align: 'left', key: 'category' },
    { header: 'PATRÓN / ELEMENTO', width: COL_WIDTH_ITEM, align: 'left', key: 'item' },
    { header: 'DETALLE', width: COL_WIDTH_DETAIL, align: 'right', key: 'count' },
    { header: 'UBICACIÓN', width: COL_WIDTH_LOCATION, align: 'left', key: 'location' }
  ];

  console.log(renderBoxTable(cols, rows));
  console.log(`\n💡 Total de incidencias detectadas en categoría '${category}': ${rows.length}\n`);
}

if (isMainModule(import.meta.url)) {
  await runCssReport();
}
