/**
 * scripts/lib/unifiedTheme.ts
 * 
 * UNIFIED CLI & REPORT THEME ENGINE (Node.js 26+)
 * Provides the single source of truth for visual presentation, Unicode Box-Drawing,
 * fixed-width column alignment, status badges, and Markdown generation.
 */

import { styleText, stripVTControlCharacters } from 'node:util';
import path from 'node:path';
import {
  type StandardAuditResult,
  type AuditFinding,
  type AuditFileSummary,
  type FamilyMetadata,
  type AuditTaskDefinition,
  FAMILY_METADATA,
  groupResultsByFamily
} from './auditContract.ts';

const TERMINAL_WIDTH = 80;
const REGISTRY_DESC_COL_WIDTH = 24;
const REGISTRY_DESC_TRUNCATE_LIMIT = 23;

/**
 * Calculates the visual monospace terminal display width of a string,
 * correctly handling ANSI escapes, wide emojis (❌, ✅, ⚠️, ℹ️), and single-width glyphs (…).
 */
export function getVisualWidth(str: string): number {
  const clean = stripVTControlCharacters(str);
  let width = 0;
  for (const char of clean) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp === 0xfe0f || cp === 0xfe0e) continue;
    if (
      (cp >= 0x2600 && cp <= 0x27bf) ||
      cp === 0x2139 ||
      (cp >= 0x1f300 && cp <= 0x1f9ff)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

export function padVisual(str: string, targetWidth: number, align: 'left' | 'right' | 'center' = 'left'): string {
  const currentWidth = getVisualWidth(str);
  const diff = targetWidth - currentWidth;
  if (diff <= 0) return str;
  if (align === 'right') {
    return ' '.repeat(diff) + str;
  }
  if (align === 'center') {
    const leftPad = Math.floor(diff / 2);
    const rightPad = diff - leftPad;
    return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
  }
  return str + ' '.repeat(diff);
}

export function truncateVisual(str: string, maxWidth: number): string {
  if (getVisualWidth(str) <= maxWidth) return str;
  let result = '';
  const ellipsis = '…';
  const target = maxWidth - 1;
  for (const char of str) {
    if (getVisualWidth(result + char) > target) break;
    result += char;
  }
  return result + ellipsis;
}

export interface TableColumn<T = Record<string, unknown>> {
  header: string;
  width: number;
  align?: 'left' | 'right' | 'center';
  key?: string;
  render?: (row: T) => string;
}

function formatBoxTableRow<T>(row: T, columns: readonly TableColumn<T>[]): string {
  const cells = columns.map(c => {
    const rawVal = c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key ?? ''] ?? '');
    const truncated = truncateVisual(rawVal, c.width);
    return padVisual(truncated, c.width, c.align || 'left');
  });
  return '│ ' + cells.join(' │ ') + ' │';
}

export function renderBoxTable<T = Record<string, unknown>>(
  columns: readonly TableColumn<T>[],
  rows: readonly T[],
  options?: { emptyMessage?: string; footerRows?: readonly T[] }
): string {
  const lines: string[] = [];

  // Top border: ┌───┬───┐
  lines.push('┌' + columns.map(c => '─'.repeat(c.width + 2)).join('┬') + '┐');

  // Header row: │ COL 1 │ COL 2 │
  const headerRow = '│ ' + columns.map(c => padVisual(styleText('bold', c.header), c.width, c.align || 'left')).join(' │ ') + ' │';
  lines.push(headerRow);

  // Header divider: ├───┼───┤
  lines.push('├' + columns.map(c => '─'.repeat(c.width + 2)).join('┼') + '┤');

  if (rows.length === 0) {
    const totalInnerWidth = columns.reduce((acc, c) => acc + c.width + 2, 0) + (columns.length - 1);
    const emptyMsg = options?.emptyMessage || 'No se encontraron registros.';
    lines.push('│ ' + padVisual(styleText('dim', emptyMsg), totalInnerWidth - 2, 'center') + ' │');
  } else {
    for (const row of rows) {
      lines.push(formatBoxTableRow(row, columns));
    }
  }

  // Footer rows (e.g. TOTAL CONSOLIDADO)
  if (options?.footerRows && options.footerRows.length > 0) {
    lines.push('├' + columns.map(c => '─'.repeat(c.width + 2)).join('┼') + '┤');
    for (const fRow of options.footerRows) {
      lines.push(formatBoxTableRow(fRow, columns));
    }
  }

  // Bottom border: └───┴───┘
  lines.push('└' + columns.map(c => '─'.repeat(c.width + 2)).join('┴') + '┘');

  return lines.join('\n');
}

export interface FindingCountData {
  errors: number;
  warnings: number;
}

export function renderFindingsBreakdownTable(
  items: readonly [string, FindingCountData][],
  labelHeader: string = 'TIPO DE INCIDENCIA / REGLA'
): string {
  interface BreakdownRow {
    label: string;
    errors: string;
    warnings: string;
  }

  const cols: readonly TableColumn<BreakdownRow>[] = [
    { header: labelHeader, width: 52, align: 'left', key: 'label' },
    { header: 'ERRORES', width: 9, align: 'right', key: 'errors' },
    { header: 'WARNINGS', width: 9, align: 'right', key: 'warnings' }
  ];

  const rows: BreakdownRow[] = items.map(([name, data]) => ({
    label: name,
    errors: data.errors > 0 ? styleText('red', String(data.errors)) : styleText('dim', '0'),
    warnings: data.warnings > 0 ? styleText('yellow', String(data.warnings)) : styleText('dim', '0')
  }));

  const totalErrors = items.reduce((acc, [_, data]) => acc + data.errors, 0);
  const totalWarnings = items.reduce((acc, [_, data]) => acc + data.warnings, 0);

  const footerRow: BreakdownRow = {
    label: styleText('bold', 'TOTAL CONSOLIDADO'),
    errors: totalErrors > 0 ? styleText(['bold', 'red'], String(totalErrors)) : styleText('dim', '0'),
    warnings: totalWarnings > 0 ? styleText(['bold', 'yellow'], String(totalWarnings)) : styleText('dim', '0')
  };

  return renderBoxTable(cols, rows, { footerRows: [footerRow] });
}

export function renderSampleFindings(
  findings: readonly AuditFinding[],
  limitOrAll: number | 'all' = 5
): string {
  if (findings.length === 0) return '';
  const limit = limitOrAll === 'all' ? findings.length : limitOrAll;
  const sample = limit >= findings.length ? findings : findings.slice(-limit);
  const countLabel = limit >= findings.length ? `todos los ${sample.length}` : `últimos ${sample.length}`;
  const header = `\n❌ Muestra de errores detectados (${countLabel} de ${findings.length}):\n`;
  const lines = sample.map((f, idx) => {
    const fileLoc = f.file ? `${path.relative(process.cwd(), f.file)}${f.line ? `:${f.line}` : ''}` : 'General';
    const cleanMsg = f.message.replace(/^Sugerencia de calidad \(Fallow\):\s*/i, '');
    const normalizedRuleDesc = (f.ruleDescription || '').replace(/^Fallow:\s*/i, '').trim().toLowerCase();
    const ruleTag = f.ruleDescription && !cleanMsg.toLowerCase().includes(normalizedRuleDesc)
      ? `[${f.ruleDescription}] `
      : (f.ruleDescription?.startsWith('Fallow:') ? '[Fallow] ' : (f.ruleId ? `[${f.ruleId}] ` : ''));
    return `  ${idx + 1}. ${fileLoc}: ${ruleTag}${cleanMsg}`;
  });

  return `${header}${lines.join('\n')}\n`;
}

export function renderBanner(title: string, subtitle?: string): string {
  const line = '═'.repeat(TERMINAL_WIDTH - 4);
  const lines: string[] = [];
  lines.push(styleText('cyan', `╔═${line}═╗`));
  lines.push(styleText('cyan', `║  ${styleText(['bold', 'white'], title.padEnd(TERMINAL_WIDTH - 6))}  ║`));
  if (subtitle) {
    lines.push(styleText('cyan', `║  ${styleText('dim', subtitle.padEnd(TERMINAL_WIDTH - 6))}  ║`));
  }
  lines.push(styleText('cyan', `╚═${line}═╝`));
  return lines.join('\n');
}

interface NoticeBoxOptions {
  borderColor?: 'yellow' | 'cyan' | 'red';
  title: string;
  lines: string[];
}

function buildNoticeBox(options: NoticeBoxOptions): string {
  const line = '═'.repeat(TERMINAL_WIDTH - 4);
  const innerWidth = TERMINAL_WIDTH - 6;
  const color = options.borderColor || 'yellow';
  const colorFn = (s: string) => styleText(color, s);

  const outLines: string[] = [];
  outLines.push(colorFn(`╔═${line}═╗`));
  outLines.push(colorFn('║  ') + padVisual(styleText(['bold', color], options.title), innerWidth) + colorFn('  ║'));
  outLines.push(colorFn(`╠═${line}═╣`));

  for (const item of options.lines) {
    if (item === '') {
      outLines.push(colorFn('║  ') + padVisual('', innerWidth) + colorFn('  ║'));
    } else {
      outLines.push(colorFn('║  ') + padVisual(item, innerWidth) + colorFn('  ║'));
    }
  }

  outLines.push(colorFn(`╚═${line}═╝`));
  return outLines.join('\n');
}

/**
 * Renders a prominent 80-column Box-Drawing warning banner when the automatic
 * installation of Fallow's vector embedding model fails, notifying both human
 * developers and AI agents with the exact command to install it manually.
 */
export function renderSimilarCodeWarningBanner(): string {
  return buildNoticeBox({
    borderColor: 'yellow',
    title: '⚠️  ATENCIÓN: ANÁLISIS DE CÓDIGO SIMILAR VECTORIAL NO DISPONIBLE',
    lines: [
      styleText('white', 'La inicialización automática del modelo de embeddings de Fallow falló.'),
      styleText('white', 'El sub-auditor especializado de similar-code no se pudo ejecutar.'),
      styleText('dim', 'Esta funcionalidad requiere instalación manual en este entorno.'),
      '',
      styleText(['bold', 'white'], 'Para instalarlo manualmente, ejecuta el siguiente comando en tu terminal:'),
      styleText(['bold', 'cyan'], '  👉  fallow similar-code setup --local --yes'),
      '',
      styleText('dim', 'Nota para CI: puedes omitir esta suite en entornos remotos o GitHub Pages'),
      styleText('dim', 'exportando la variable AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1.')
    ]
  });
}

/**
 * Renders a prominent 80-column Box-Drawing warning banner when fixable errors or warnings
 * are detected at the end of an audit run, directing developers and AI agents to execute
 * `auditor fix` before taking any action or attempting manual suppression.
 */
export function renderAutoFixNoticeBanner(fixableErrors: number, fixableWarnings: number): string {
  const errorText = fixableErrors > 0 ? `${fixableErrors} error(es)` : '';
  const warnText = fixableWarnings > 0 ? `${fixableWarnings} advertencia(s)` : '';
  const sep = fixableErrors > 0 && fixableWarnings > 0 ? ' y ' : '';
  const countStr = `${errorText}${sep}${warnText}`;

  return buildNoticeBox({
    borderColor: 'yellow',
    title: '🛠️  ATENCIÓN: INCIDENCIAS REPARABLES AUTOMÁTICAMENTE DETECTADAS',
    lines: [
      styleText('white', `Se detectaron ${countStr} corregibles con auto-reparación.`),
      styleText('dim', 'El auditor dispone de mecanismos automáticos para resolver la gran mayoría.'),
      styleText(['bold', 'yellow'], 'ESTÁ CATEGÓRICAMENTE PROHIBIDO SILENCIAR O APAGAR REGLAS EN PÁNICO.'),
      '',
      styleText(['bold', 'white'], 'Ejecuta primero la auto-reparación antes de continuar:'),
      styleText(['bold', 'cyan'], '  👉  npm run audit:fix   (o auditor fix)')
    ]
  });
}

/**
 * Renders the full dynamic registry of auditors in an 80-column Box-Drawing table,
 * grouped by family, with capability flags and concise descriptions.
 */
export function renderAuditorsRegistryTable(
  tasks: readonly AuditTaskDefinition[],
  activeFamilies: readonly string[]
): string {
  const line = '═'.repeat(TERMINAL_WIDTH - 4);
  const output: string[] = [];

  output.push(styleText('cyan', `╔═${line}═╗`));
  output.push(styleText('cyan', `║  ${styleText(['bold', 'white'], 'CATÁLOGO DINÁMICO DE AUDITORES Y CAPACIDADES'.padEnd(TERMINAL_WIDTH - 6))}  ║`));
  output.push(styleText('cyan', `║  ${styleText('dim', 'Suites descubiertas en tiempo de ejecución (cero hardcoding)'.padEnd(TERMINAL_WIDTH - 6))}  ║`));
  output.push(styleText('cyan', `╚═${line}═╝\n`));

  interface SuiteRow {
    id: string;
    flags: string;
    desc: string;
  }

  const columns: readonly TableColumn<SuiteRow>[] = [
    { header: 'AUDITOR / SUITE ID', width: 27, align: 'left', key: 'id' },
    { header: 'FLAGS / CAPACIDADES', width: 19, align: 'left', key: 'flags' },
    { header: 'DESCRIPCIÓN', width: REGISTRY_DESC_COL_WIDTH, align: 'left', key: 'desc' }
  ];

  for (const familyKey of activeFamilies) {
    const familyTasks = tasks.filter(t => t.family === familyKey);
    if (familyTasks.length === 0) continue;

    const meta = FAMILY_METADATA[familyKey];
    const headerTitle = meta ? `${meta.icon} Familia ${meta.order}: ${meta.title}` : familyKey.toUpperCase();
    output.push(styleText('bold', `\n📌 ${headerTitle} (${familyTasks.length} suites):`));

    const rows: SuiteRow[] = familyTasks.map(t => {
      const caps = t.capabilities;
      const flags: string[] = [];
      if (caps?.fix) flags.push(styleText('green', 'FIX'));
      if (caps?.lint) flags.push(styleText('cyan', 'LINT'));
      if (caps?.md) flags.push(styleText('magenta', 'MD'));
      if (caps?.heavy) flags.push(styleText('yellow', 'HVY'));
      if (caps?.requiresBuild) flags.push(styleText('red', 'BLD'));
      const flagStr = flags.length > 0 ? flags.join(' ') : styleText('dim', '-');

      const desc = t.description ?? t.manifest?.description ?? t.name;
      const safeDesc = desc.length > REGISTRY_DESC_COL_WIDTH ? desc.slice(0, REGISTRY_DESC_TRUNCATE_LIMIT) + '…' : desc;

      return {
        id: `${t.icon ?? '🏛️'} ${t.id}`,
        flags: flagStr,
        desc: safeDesc
      };
    });

    output.push(renderBoxTable(columns, rows));
  }

  output.push(styleText('dim', `\n💡 Para ver el manual y configuración de una suite: auditor --info=<suiteId>`));
  output.push(styleText('dim', `💡 Para obtener la especificación completa en JSON: auditor --list --json\n`));

  return output.join('\n');
}

/**
 * Renders a detailed inspection card for a single auditor suite (≤ 80 cols).
 */
export function renderAuditorDetailCard(task: AuditTaskDefinition): string {
  const line = '═'.repeat(TERMINAL_WIDTH - 4);
  const divider = '─'.repeat(TERMINAL_WIDTH - 6);
  const innerWidth = TERMINAL_WIDTH - 6;
  const lines: string[] = [];

  const cyan = (s: string) => styleText('cyan', s);
  const boldWhite = (s: string) => styleText(['bold', 'white'], s);
  const boldYellow = (s: string) => styleText(['bold', 'yellow'], s);
  const green = (s: string) => styleText('green', s);
  const dim = (s: string) => styleText('dim', s);
  const white = (s: string) => styleText('white', s);

  lines.push(cyan(`╔═${line}═╗`));
  const title = `${task.icon ?? '🏛️'} ${task.name} [${task.id}]`;
  lines.push(cyan('║  ') + padVisual(boldWhite(title), innerWidth) + cyan('  ║'));
  lines.push(cyan('║  ') + padVisual(dim(`Familia: ${task.family} | Script: ${task.scriptPath}`), innerWidth) + cyan('  ║'));
  lines.push(cyan(`╠═${line}═╣`));

  // Descripción obligatoria
  lines.push(cyan('║  ') + padVisual(boldYellow('📋 PROPÓSITO:'), innerWidth) + cyan('  ║'));
  const desc = task.description ?? task.manifest?.description ?? 'Sin descripción declarada.';
  lines.push(cyan('║  ') + padVisual(white(`  ${desc}`), innerWidth) + cyan('  ║'));
  lines.push(cyan('║  ') + padVisual(dim(`  ${divider}`), innerWidth) + cyan('  ║'));

  // Capacidades / Flags
  lines.push(cyan('║  ') + padVisual(boldYellow('⚙️ CAPACIDADES / FLAGS SOPORTADOS:'), innerWidth) + cyan('  ║'));
  const caps = task.capabilities;
  const capList: string[] = [];
  if (caps?.fix) capList.push(green('✔ Auto-reparación (--fix)'));
  if (caps?.lint) capList.push(cyan('✔ Preset Lint (preset=lint)'));
  if (caps?.md) capList.push(styleText('magenta', '✔ Preset Markdown (preset=md)'));
  if (caps?.heavy) capList.push(styleText('yellow', '⚡ Computacionalmente Pesado (heavy)'));
  if (caps?.requiresBuild) capList.push(styleText('red', '📦 Requiere Build Previo (requiresBuild)'));
  if (caps?.changedSince) capList.push(white('✔ Diferencial Git (--changed-since)'));
  if (caps?.ast) capList.push(white('✔ AST TypeScript in-memory (ast)'));

  if (capList.length === 0) {
    lines.push(cyan('║  ') + padVisual(dim('  (Ejecución estándar general)'), innerWidth) + cyan('  ║'));
  } else {
    for (const c of capList) {
      lines.push(cyan('║  ') + padVisual(`  ${c}`, innerWidth) + cyan('  ║'));
    }
  }
  lines.push(cyan('║  ') + padVisual(dim(`  ${divider}`), innerWidth) + cyan('  ║'));

  // Reglas
  const rules = task.ruleDescriptions ?? task.manifest?.rules;
  if (rules && Object.keys(rules).length > 0) {
    lines.push(cyan('║  ') + padVisual(boldYellow(`🔍 REGLAS EVALUADAS (${Object.keys(rules).length}):`), innerWidth) + cyan('  ║'));
    for (const [rId, rDesc] of Object.entries(rules).slice(0, 8)) {
      lines.push(cyan('║  ') + padVisual(`  • ${boldWhite(rId)}: ${dim(rDesc)}`, innerWidth) + cyan('  ║'));
    }
    if (Object.keys(rules).length > 8) {
      lines.push(cyan('║  ') + padVisual(dim(`  ... y ${Object.keys(rules).length - 8} reglas más.`), innerWidth) + cyan('  ║'));
    }
    lines.push(cyan('║  ') + padVisual(dim(`  ${divider}`), innerWidth) + cyan('  ║'));
  }

  // Configuración en .auditor/audit.config.ts
  lines.push(cyan('║  ') + padVisual(boldYellow('🛠️ CONFIGURACIÓN (.auditor/audit.config.ts):'), innerWidth) + cyan('  ║'));
  const configKey = task.configKey ?? task.manifest?.configKey;
  if (configKey) {
    lines.push(cyan('║  ') + padVisual(`  Clave configurable: ${boldWhite(configKey)}`, innerWidth) + cyan('  ║'));
  } else {
    lines.push(cyan('║  ') + padVisual(dim('  Sin configuración requerida (opera con estándares canónicos).'), innerWidth) + cyan('  ║'));
  }

  lines.push(cyan(`╚═${line}═╝\n`));
  return lines.join('\n');
}

/**
 * Renders the CLI general interactive help (≤ 80 cols).
 */
export function renderCliHelp(activeFamilies: readonly string[]): string {
  const lines: string[] = [];

  lines.push(renderBanner(
    '@francogp/auditor — Framework de Auditoría Estática y Gobernanza',
    'Node.js 26+ Native | UnifiedTheme Box-Drawing | Cero Hardcoding'
  ) + '\n');

  const boldYellow = (s: string) => styleText(['bold', 'yellow'], s);

  lines.push(boldYellow('USO:'));
  lines.push('  auditor [opciones] [comandos]  (o npm run audit [opciones])\n');

  lines.push(boldYellow('COMANDOS DE DESCUBRIMIENTO E INTROSPECCIÓN:'));
  lines.push('  --list, list                 Lista todas las suites descubiertas y sus flags.');
  lines.push('  --list --json                Emite el catálogo completo en formato JSON estructurado.');
  lines.push('  --info=<suiteId>             Muestra la ficha técnica, reglas y configuración de una suite.');
  lines.push('  -h, --help                   Muestra este mensaje de ayuda.\n');

  lines.push(boldYellow('MODOS Y PRESETS DE EJECUCIÓN:'));
  lines.push('  fix, --fix                   Modo reparación: ejecuta suites con capacidad de auto-fix.');
  lines.push('  preset=lint                  Preset rápido de linting (ESLint, Stylelint, etc.).');
  lines.push('  preset=md                    Preset rápido de documentación y Markdown.');
  lines.push('  preset=build                 Suites que requieren artefactos compilados en dist/.');
  lines.push('  --with-build                 Incluye suites de compilación en la corrida general.\n');

  lines.push(boldYellow('FILTROS Y SELECCIÓN:'));
  lines.push(`  family=<nombre>              Filtra por familia (${activeFamilies.join(', ')}).`);
  lines.push('  task=<id>, suites=<id1,id2>  Ejecuta exclusivamente una o varias suites.');
  lines.push('  rule=<id1,id2>               Filtra reglas específicas.');
  lines.push('  --errors-only                Muestra únicamente errores suprimiendo advertencias.');
  lines.push('  changed-since=<ref>          Filtra archivos modificados respecto de git ref.\n');

  lines.push(boldYellow('HERRAMIENTAS ASOCIADAS (NPM SCRIPTS):'));
  lines.push('  npm run audit:by-file        Árbol jerárquico de incidencias por archivo y línea.');
  lines.push('  npm run audit:findings       Consulta interactiva con filtros y desgloses.');
  lines.push('  npm run audit:fix            Aplica auto-reparaciones mecánicas en el código.');
  lines.push('  npm run auditor:update       Actualiza el paquete upstream de @francogp/auditor.\n');

  return lines.join('\n');
}

export function renderFamilyHeader(meta: FamilyMetadata): string {
  const line = '─'.repeat(TERMINAL_WIDTH - 8);
  return styleText('bold', `\n${meta.icon} [FAMILIA ${meta.order}] ${meta.title}\n${styleText('dim', `  ${line}`)}`);
}

export function formatStatusBadge(status: 'passed' | 'failed' | 'warning' | 'info' | 'skipped'): string {
  switch (status) {
    case 'passed':
      return `[ ${styleText('green', '✅ PASS')} ]`;
    case 'failed':
      return `[ ${styleText('red', '❌ FAIL')} ]`;
    case 'warning':
      return `[ ${styleText('yellow', '⚠️ WARN')} ]`;
    case 'info':
      return `[ ${styleText('cyan', 'ℹ️ INFO')} ]`;
    case 'skipped':
      return `[ ${styleText('cyan', '⏭️ SKIP')} ]`;
  }
}

export function formatDuration(ms: number): string {
  const str = `${ms}ms`;
  return str.padStart(7);
}

const METRIC_COL_WIDTH = 16;

function formatTaskMetricCol(metrics?: Record<string, string | number>): string {
  const entries = Object.entries(metrics || {});
  if (entries.length === 0) return ' '.repeat(METRIC_COL_WIDTH);

  const [k, v] = entries[0]!;
  const primaryMetric = `${v} ${k.split(' ')[0] ?? ''}`.trim();
  const cleanMetric = primaryMetric.length > METRIC_COL_WIDTH
    ? primaryMetric.slice(0, METRIC_COL_WIDTH - 1) + '…'
    : primaryMetric;
  return cleanMetric.padEnd(METRIC_COL_WIDTH);
}

function computeTaskBadge(status: string, errors: number, warnings: number): string {
  if (status === 'skipped') return formatStatusBadge('skipped');
  if (status !== 'passed' || errors > 0) return formatStatusBadge('failed');
  if (warnings > 0) return formatStatusBadge('warning');
  return formatStatusBadge('passed');
}

function formatTaskCount(count: number, icon: string, color: 'red' | 'yellow'): string {
  const text = `${count} ${icon}`.padStart(6);
  return count > 0 ? styleText(color, text) : styleText('dim', text);
}

export const TASK_NAME_COL_WIDTH = 38;

export function renderAuditTaskRow(res: StandardAuditResult): string {
  const errors = res.summary?.errors ?? (res.status === 'failed' ? 1 : 0);
  const warnings = res.summary?.warnings ?? 0;
  const badge = computeTaskBadge(res.status, errors, warnings);
  const nameStr = res.name.length > TASK_NAME_COL_WIDTH ? res.name.slice(0, TASK_NAME_COL_WIDTH - 1) + '…' : res.name.padEnd(TASK_NAME_COL_WIDTH);
  const durationStr = formatDuration(res.durationMs);
  const metricStr = formatTaskMetricCol(res.metrics);
  const errStr = formatTaskCount(errors, '❌', 'red');
  const warnStr = formatTaskCount(warnings, '⚠️', 'yellow');

  return `  ${badge} │ ${styleText('bold', nameStr)} │ ${styleText('dim', durationStr)} │ ${metricStr} │ ${errStr} │ ${warnStr}`;
}

const DEFAULT_MAX_FINDINGS_PREVIEW = 30;
const DEFAULT_MAX_FILES_TREE = 10;

function groupFindingsByFile(findings: readonly AuditFinding[]): Map<string, AuditFinding[]> {
  const byFile = new Map<string, AuditFinding[]>();
  for (const rawF of findings) {
    if (!rawF) continue;
    const f: AuditFinding = typeof rawF === 'string' ? { severity: 'error', message: rawF } : rawF;
    const fileKey = f.file ? path.relative(process.cwd(), f.file) : 'Global';
    if (!byFile.has(fileKey)) byFile.set(fileKey, []);
    byFile.get(fileKey)!.push(f);
  }
  return byFile;
}

function formatFindingEntry(item: AuditFinding): string {
  const icon = item.severity === 'error' ? styleText('red', '❌ ERR ') : styleText('yellow', '⚠️ WARN');
  const lineNum = item.line !== undefined ? `L${item.line}`.padEnd(6) : '      ';
  const ruleTag = item.ruleId ? `[${item.ruleId}] ` : '';
  const contextSnippet = item.context ? ` (${styleText('dim', `"${item.context}"`)})` : '';
  return `    ${lineNum} ${icon} ${ruleTag}${item.message}${contextSnippet}`;
}

export function renderFindingsDetail(findings: AuditFinding[], maxLimit: number = DEFAULT_MAX_FINDINGS_PREVIEW): string {
  if (!Array.isArray(findings) || findings.length === 0) return '';

  const lines: string[] = [];
  const byFile = groupFindingsByFile(findings);

  let shown = 0;
  for (const [file, items] of byFile) {
    if (shown >= maxLimit) break;
    lines.push(`\n  📄 ${styleText('bold', file)} (🐛 ${items.length}):`);

    for (const item of items) {
      if (shown >= maxLimit) break;
      shown++;
      lines.push(formatFindingEntry(item));
    }
  }

  if (findings.length > maxLimit) {
    lines.push(styleText('cyan', `\n  ... y 🐛 ${findings.length - maxLimit} más. Usa --output=<archivo> para volcado completo.`));
  }

  return lines.join('\n');
}

export interface RenderByFileTreeOptions {
  maxFiles?: number | 'all';
  maxFindingsPerFile?: number | 'all';
  showRule?: boolean;
}

/**
 * Renders audit findings structured by file and ordered by line number in a Box-Drawing tree format.
 */
export function renderFindingsByFileTree(
  fileSummaries: readonly AuditFileSummary[],
  options: RenderByFileTreeOptions = {}
): string {
  if (!fileSummaries || fileSummaries.length === 0) return '';
  const lines: string[] = [];
  const maxFiles = options.maxFiles === 'all'
    ? fileSummaries.length
    : (typeof options.maxFiles === 'number' ? options.maxFiles : DEFAULT_MAX_FILES_TREE);
  const displayedFiles = fileSummaries.slice(0, maxFiles);

  for (const fs of displayedFiles) {
    const errorBadge = fs.errors > 0 ? styleText('red', `${fs.errors} error${fs.errors > 1 ? 'es' : ''}`) : '';
    const warnBadge = fs.warnings > 0 ? styleText('yellow', `${fs.warnings} advertencia${fs.warnings > 1 ? 's' : ''}`) : '';
    const badges = [errorBadge, warnBadge].filter(Boolean).join(', ');
    const badgeText = badges ? ` (${badges})` : ` (${fs.findings.length} incidencia${fs.findings.length > 1 ? 's' : ''})`;

    lines.push(`\n  📄 ${styleText('bold', fs.file)}${badgeText}`);

    const findingsLimit = options.maxFindingsPerFile === 'all'
      ? fs.findings.length
      : (typeof options.maxFindingsPerFile === 'number' ? options.maxFindingsPerFile : fs.findings.length);
    const displayedFindings = fs.findings.slice(0, findingsLimit);

    for (let i = 0; i < displayedFindings.length; i++) {
      const item = displayedFindings[i]!;
      const isLast = (i === displayedFindings.length - 1) && (displayedFindings.length === fs.findings.length);
      const branch = isLast ? '└── ' : '├── ';
      const locLabel = item.line !== undefined ? `L${item.line}` : '[GLOBAL]';
      const locPadded = padVisual(locLabel, 8);
      const sevIcon = item.severity === 'error' ? styleText('red', '❌ ') : styleText('yellow', '⚠️  ');
      const ruleTag = item.ruleDescription
        ? `[${item.ruleDescription}] `
        : (item.ruleId ? `[${item.ruleId}] ` : '');
      const contextStr = item.context ? ` (${styleText('dim', `"${item.context}"`)})` : '';

      lines.push(`     ${styleText('dim', branch)}${styleText('cyan', locPadded)} ${sevIcon}${styleText('bold', ruleTag)}${item.message}${contextStr}`);
    }

    if (fs.findings.length > displayedFindings.length) {
      lines.push(`     ${styleText('dim', '└── ')}... y ${fs.findings.length - displayedFindings.length} incidencia(s) más en este archivo.`);
    }
  }

  if (fileSummaries.length > displayedFiles.length) {
    lines.push(styleText('dim', `\n  ... y ${fileSummaries.length - displayedFiles.length} archivo(s) más con incidencias. Usa top=all o filtra con file=<patron>.`));
  }

  return lines.join('\n');
}

function formatSampleErrorLine(err: AuditFinding, index: number): string {
  const fileInfo = err.file ? (err.line ? `${err.file}:${err.line}` : err.file) : 'desconocido';
  const relPath = path.isAbsolute(fileInfo) ? path.relative(process.cwd(), fileInfo) : fileInfo;
  const relPosixFile = relPath.split(path.sep).join(path.posix.sep).replace(/^[\\/]+/, '') || fileInfo;
  const ruleTag = err.ruleId ? `[${err.ruleId}] ` : '';
  const contextStr = err.context ? ` ("${err.context}")` : '';
  return `    ${index + 1}. ${styleText('red', relPosixFile)}: ${ruleTag}${err.message}${contextStr}`;
}

function renderSampleErrors(errorFindings: readonly AuditFinding[]): string[] {
  const lines: string[] = [];
  const sampleErrors = errorFindings.slice(0, 5);
  lines.push(styleText('bold', `\n  ❌ Muestra de errores detectados (primeros ${sampleErrors.length}):`));
  for (let i = 0; i < sampleErrors.length; i++) {
    lines.push(formatSampleErrorLine(sampleErrors[i]!, i));
  }
  if (errorFindings.length > 5) {
    lines.push(styleText('dim', `    ... y ${errorFindings.length - 5} error(es) más (ver reporte JSON completo).`));
  }
  return lines;
}

export function renderConsolidatedFooter(
  suitesTotal: number,
  suitesPassed: number,
  totalErrors: number,
  totalWarnings: number,
  totalDurationMs: number,
  errorFindings?: AuditFinding[],
  suitesSkipped: number = 0
): string {
  const line = '═'.repeat(TERMINAL_WIDTH - 4);
  const lines: string[] = [];
  lines.push(styleText('bold', `\n╠═${line}═╣`));

  const statusText = totalErrors === 0 
    ? styleText(['bold', 'green'], '🎉 ¡SUITE DE AUDITORÍA GLOBAL APROBADA!') 
    : styleText(['bold', 'red'], '🚨 AUDITORÍA GLOBAL CON ERRORES CRÍTICOS');

  lines.push(`  ${statusText}`);
  const skippedNote = suitesSkipped > 0 ? ` (${suitesSkipped} Omitidas ⏭️)` : '';
  lines.push(styleText('dim', `  Duración Total: ${totalDurationMs}ms | Suites: ${suitesPassed}/${suitesTotal} Aprobadas${skippedNote}`));
  lines.push(`  Errores: ${totalErrors === 0 ? styleText('green', '0') : styleText('red', String(totalErrors))}  |  Advertencias: ${totalWarnings === 0 ? styleText('green', '0') : styleText('yellow', String(totalWarnings))}`);

  if (errorFindings && errorFindings.length > 0) {
    lines.push(...renderSampleErrors(errorFindings));
  }

  lines.push(styleText('bold', `╚═${line}═╝\n`));
  return lines.join('\n');
}

function renderMarkdownFamilyTables(byFamily: Map<string, StandardAuditResult[]>): string {
  let md = '';
  for (const [familyKey, tasks] of byFamily) {
    const meta = FAMILY_METADATA[familyKey];
    const familyTitle = meta ? `${meta.icon} Familia ${meta.order}: ${meta.title}` : familyKey;
    md += `## ${familyTitle}\n\n`;
    md += `| Estado | Auditoría | Duración | Métrica Principal | Errores | Advertencias |\n`;
    md += `| :---: | :--- | :---: | :--- | :---: | :---: |\n`;

    for (const t of tasks) {
      const icon = t.status === 'skipped' ? '⏭️ Skip' : (t.status === 'passed' && t.summary.errors === 0 ? '✅ Pass' : '❌ Fail');
      const metricEntries = Object.entries(t.metrics);
      const metricStr = metricEntries.length > 0 ? `${metricEntries[0]![1]} ${metricEntries[0]![0]}` : '-';
      md += `| ${icon} | **${t.name}** | \`${t.durationMs}ms\` | ${metricStr} | ${t.summary.errors} | ${t.summary.warnings} |\n`;
    }
    md += '\n';
  }
  return md;
}

function renderMarkdownFindingsTable(allFindings: readonly AuditFinding[]): string {
  if (allFindings.length === 0) return '';
  let md = `## 📋 Detalle de Incidencias\n\n`;
  md += `| Severidad | Archivo | Línea | Regla | Mensaje |\n`;
  md += `| :---: | :--- | :---: | :--- | :--- |\n`;
  for (const f of allFindings.slice(0, 100)) {
    const sevIcon = f.severity === 'error' ? '❌ Error' : '⚠️ Warn';
    const filePath = f.file ? `\`${path.relative(process.cwd(), f.file)}\`` : 'Global';
    const lineStr = f.line !== undefined ? String(f.line) : '-';
    const ruleStr = f.ruleId ? `\`${f.ruleId}\`` : '-';
    md += `| ${sevIcon} | ${filePath} | ${lineStr} | ${ruleStr} | ${f.message.replace(/\|/g, '\\|')} |\n`;
  }
  if (allFindings.length > 100) {
    md += `\n*... y 🐛 ${allFindings.length - 100} más truncadas por longitud.*\n`;
  }
  return md;
}

export function renderMarkdownReport(
  results: StandardAuditResult[],
  suitesPassed: number,
  totalDurationMs: number
): string {
  const totalErrors = results.reduce((acc, r) => acc + r.summary.errors, 0);
  const totalWarnings = results.reduce((acc, r) => acc + r.summary.warnings, 0);
  const isPassed = totalErrors === 0;

  let md = `# 🛡️ Reporte Consolidado de Auditoría Global\n\n`;
  md += `**Estado**: ${isPassed ? '✅ Aprobado' : '❌ Fallido'}\n`;
  md += `**Duración Total**: \`${totalDurationMs}ms\`\n`;
  md += `**Suites**: \`${suitesPassed} / ${results.length} Aprobadas\`\n`;
  md += `**Errores**: \`${totalErrors}\` | **Advertencias**: \`${totalWarnings}\`\n\n`;

  const byFamily = groupResultsByFamily(results);
  md += renderMarkdownFamilyTables(byFamily);
  md += renderMarkdownFindingsTable(results.flatMap(r => r.findings));

  return md;
}
