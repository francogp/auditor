#!/usr/bin/env -S node --experimental-strip-types
/**
 * packages/auditor/src/cli/report_css.ts
 *
 * CLI TOOL: REPORTE DE CALIDAD, DUPLICACIÓN Y PATRONES CSS (STYLELINT ENGINE)
 *
 * Generates an 80-column Box-Drawing report or structured JSON output of CSS issues:
 * duplicate selectors, duplicate properties, empty blocks, order, and SCSS syntax.
 *
 * Usage:
 *   auditor-css
 *   auditor-css --category=selectors
 *   auditor-css --category=properties
 *   auditor-css --category=empty
 *   auditor-css --json
 *   auditor-css --errors-only
 */

import { parseArgs, styleText } from 'node:util';
import path from 'node:path';
import { renderBanner, renderBoxTable, type TableColumn } from '../core/unifiedTheme.ts';
import { isMainModule } from './cliUtils.ts';
import { StylelintAuditor } from '../suites/architecture/validate_stylelint.ts';

const MAX_ITEM_DISPLAY_CHARS = 30;
const MAX_ITEM_TRUNCATE_CHARS = 29;
const MAX_LOCATION_DISPLAY_CHARS = 24;
const MAX_LOCATION_TRUNCATE_CHARS = 23;

const COL_WIDTH_INDEX = 3;
const COL_WIDTH_CATEGORY = 14;
const COL_WIDTH_ITEM = 31;
const COL_WIDTH_LOCATION = 24;

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
  location: string;
}

export async function runCssReport(projectRoot: string = process.cwd()): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      category: { type: 'string', default: 'all' },
      json: { type: 'boolean', default: false },
      'errors-only': { type: 'boolean', default: false },
      fix: { type: 'boolean', default: false }
    },
    strict: false,
    allowPositionals: true
  });

  const isFix = Boolean(values.fix) || positionals.includes('fix');
  const category = String(values.category || 'all').toLowerCase();
  const isJson = Boolean(values.json);
  const errorsOnly = Boolean(values['errors-only']);

  const auditor = new StylelintAuditor({ projectRoot });
  const result = await auditor.execute();

  const filteredFindings = result.findings.filter(f => {
    if (errorsOnly && f.severity !== 'error') return false;
    if (category === 'all') return true;
    if (category === 'selectors' && f.ruleId === 'css-duplicate-selectors') return true;
    if (category === 'properties' && f.ruleId === 'css-duplicate-properties') return true;
    if (category === 'empty' && f.ruleId === 'css-empty-blocks') return true;
    if (category === 'order' && f.ruleId === 'css-order-violation') return true;
    if (category === 'syntax' && f.ruleId === 'scss-syntax-issue') return true;
    return false;
  });

  if (isJson) {
    console.log(JSON.stringify({
      summary: {
        filesScanned: auditor.getFilesScanned(),
        totalErrors: result.summary.errors,
        totalWarnings: result.summary.warnings,
        durationMs: result.durationMs
      },
      findings: filteredFindings
    }, null, 2));
    return;
  }

  renderBanner('REPORTE DE CALIDAD Y DUPLICACIÓN CSS (STYLELINT ENGINE)', 'Análisis estático oficial de estilos y patrones SCSS/Vue');
  console.log(
    styleText('dim', `🔍 Analizados ${auditor.getFilesScanned()} archivos en ${result.durationMs}ms (Categoría: ${category})\n`)
  );

  if (isFix) {
    console.log(styleText('cyan', '✨ Modo auto-fix: Stylelint aplicó correcciones automáticas sobre los archivos.\n'));
  }

  if (filteredFindings.length === 0) {
    console.log(styleText('green', '✨ No se detectaron problemas ni violaciones de estilos CSS/SCSS.\n'));
    return;
  }

  const rows: TableRow[] = [];
  let rowIdx = 1;

  for (const f of filteredFindings) {
    const loc = `${path.basename(f.file || '')}:${f.line || 1}`;
    let catLabel = 'ESTILO';
    if (f.ruleId === 'css-duplicate-selectors') catLabel = 'SELECTOR DUP';
    else if (f.ruleId === 'css-duplicate-properties') catLabel = 'PROP DUP';
    else if (f.ruleId === 'css-empty-blocks') catLabel = 'BLOQUE VACÍO';
    else if (f.ruleId === 'css-order-violation') catLabel = 'ORDEN CSS';
    else if (f.ruleId === 'scss-syntax-issue') catLabel = 'SINTAXIS SCSS';
    else if (f.ruleId === 'wallace-complexity') catLabel = 'COMPLEJIDAD';

    const color = f.severity === 'error' ? 'red' : 'yellow';

    rows.push({
      index: String(rowIdx++),
      category: styleText(color, catLabel),
      item: truncateItem(f.message),
      location: truncateLocation(loc)
    });
  }

  const cols: readonly TableColumn<TableRow>[] = [
    { header: '#', width: COL_WIDTH_INDEX, align: 'center', key: 'index' },
    { header: 'CATEGORÍA', width: COL_WIDTH_CATEGORY, align: 'left', key: 'category' },
    { header: 'MENSAJE / REGLA', width: COL_WIDTH_ITEM, align: 'left', key: 'item' },
    { header: 'UBICACIÓN', width: COL_WIDTH_LOCATION, align: 'left', key: 'location' }
  ];

  console.log(renderBoxTable(cols, rows));
  console.log(`\n💡 Total de incidencias detectadas en categoría '${category}': ${rows.length}\n`);
}

if (isMainModule(import.meta.url)) {
  await runCssReport();
}
