/**
 * scripts/lib/unifiedTheme.ts
 *
 * UNIFIED CLI & REPORT THEME ENGINE (Node.js 26+)
 * Provides the single source of truth for visual presentation, Unicode Box-Drawing,
 * fixed-width column alignment, status badges, and Markdown generation.
 */

import { styleText } from 'node:util';
import path from 'node:path';
import boxen from 'boxen';
import Table from 'cli-table3';

if (!process.env.NO_COLOR && process.env.FORCE_COLOR === undefined) {
  process.env.FORCE_COLOR = '1';
}

import {
  type StandardAuditResult,
  type AuditFinding,
  type FamilyMetadata,
  type AuditFamily,
  type AuditTaskDefinition,
  FAMILY_METADATA,
  normalizeSpeeds,
  type RemediationPhaseId,
  getRemediationPhaseMetadata
} from './auditContract.ts';

const TERMINAL_WIDTH = 80;
const REGISTRY_DESC_COL_WIDTH = 24;
const REGISTRY_DESC_TRUNCATE_LIMIT = 23;
const BREAKDOWN_LABEL_COL_WIDTH = 52;
const BREAKDOWN_COUNT_COL_WIDTH = 9;

import type { TextAlignment } from './terminalVisuals.ts';

export {
  getVisualWidth,
  padVisual,
  truncateVisual,
  TEXT_ALIGNMENTS,
  type TextAlignment
} from './terminalVisuals.ts';

export interface TableColumn<T = Record<string, unknown>> {
  header: string;
  width: number;
  align?: TextAlignment;
  key?: string;
  render?: (row: T) => string;
}

function extractRowCellValues<T>(columns: readonly TableColumn<T>[], row: T): string[] {
  return columns.map((c) => {
    if (c.render) return c.render(row);
    const val = (row as Record<string, unknown>)[c.key ?? ''];
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'bigint')
      return String(val);
    return JSON.stringify(val);
  });
}

export function renderBoxTable<T = Record<string, unknown>>(
  columns: readonly TableColumn<T>[],
  rows: readonly T[],
  options?: { emptyMessage?: string; footerRows?: readonly T[] }
): string {
  const head = columns.map((c) => styleText('bold', c.header));
  const colAligns = columns.map((c) =>
    c.align === 'center' ? 'center' : c.align === 'right' ? 'right' : 'left'
  );
  const colWidths = columns.map((c) => c.width + 2);

  const table = new Table({
    head,
    colWidths,
    colAligns,
    wordWrap: true,
    chars: {
      top: '─',
      'top-mid': '┬',
      'top-left': '┌',
      'top-right': '┐',
      bottom: '─',
      'bottom-mid': '┴',
      'bottom-left': '└',
      'bottom-right': '┘',
      left: '│',
      'left-mid': '├',
      mid: '─',
      'mid-mid': '┼',
      right: '│',
      'right-mid': '┤',
      middle: '│'
    },
    style: { 'padding-left': 1, 'padding-right': 1, head: [], border: ['dim'], compact: true }
  });

  if (rows.length === 0) {
    const emptyMsg = options?.emptyMessage || 'No se encontraron registros.';
    table.push([
      { colSpan: columns.length, content: styleText('dim', emptyMsg), hAlign: 'center' }
    ]);
  } else {
    for (const row of rows) {
      table.push(extractRowCellValues(columns, row));
    }
  }

  if (options?.footerRows && options.footerRows.length > 0) {
    const footerTable = new Table({
      colWidths,
      colAligns,
      wordWrap: true,
      chars: {
        top: '─',
        'top-mid': '┼',
        'top-left': '├',
        'top-right': '┤',
        bottom: '─',
        'bottom-mid': '┴',
        'bottom-left': '└',
        'bottom-right': '┘',
        left: '│',
        'left-mid': '',
        mid: '',
        'mid-mid': '',
        right: '│',
        'right-mid': '',
        middle: '│'
      },
      style: { 'padding-left': 1, 'padding-right': 1, head: [], border: ['dim'], compact: true }
    });

    for (const fRow of options.footerRows) {
      footerTable.push(extractRowCellValues(columns, fRow));
    }

    const bodyLines = table.toString().split('\n');
    bodyLines.pop();
    const footerLines = footerTable.toString().split('\n');
    return [...bodyLines, ...footerLines].join('\n');
  }

  return table.toString();
}

export interface FindingCountData {
  errors: number;
  warnings: number;
}

interface BreakdownRow {
  label: string;
  errors: string;
  warnings: string;
}

function createBreakdownColumns(labelHeader: string): readonly TableColumn<BreakdownRow>[] {
  return [
    { header: labelHeader, width: BREAKDOWN_LABEL_COL_WIDTH, align: 'left', key: 'label' },
    { header: 'ERRORES', width: BREAKDOWN_COUNT_COL_WIDTH, align: 'right', key: 'errors' },
    { header: 'WARNINGS', width: BREAKDOWN_COUNT_COL_WIDTH, align: 'right', key: 'warnings' }
  ];
}

function formatCountCell(count: number, color: 'red' | 'yellow', bold: boolean = false): string {
  if (count <= 0) return styleText('dim', '0');
  const formatted = formatNumber(count);
  return bold ? styleText(['bold', color], formatted) : styleText(color, formatted);
}

function createConsolidatedFooterRow(totalErrors: number, totalWarnings: number): BreakdownRow {
  return {
    label: styleText('bold', 'TOTAL CONSOLIDADO'),
    errors: formatCountCell(totalErrors, 'red', true),
    warnings: formatCountCell(totalWarnings, 'yellow', true)
  };
}

export function renderFindingsBreakdownTable(
  items: readonly [string, FindingCountData][],
  labelHeader: string = 'TIPO DE INCIDENCIA / REGLA'
): string {
  const cols = createBreakdownColumns(labelHeader);
  const rows: BreakdownRow[] = items.map(([name, data]) => ({
    label: name,
    errors: formatCountCell(data.errors, 'red'),
    warnings: formatCountCell(data.warnings, 'yellow')
  }));

  const totalErrors = items.reduce((acc, [, data]) => acc + data.errors, 0);
  const totalWarnings = items.reduce((acc, [, data]) => acc + data.warnings, 0);

  return renderBoxTable(cols, rows, {
    footerRows: [createConsolidatedFooterRow(totalErrors, totalWarnings)]
  });
}

export interface TieredFindingsPhaseGroup {
  readonly phaseId: RemediationPhaseId;
  readonly items: readonly [string, FindingCountData][];
  readonly errors: number;
  readonly warnings: number;
}

export function renderTieredFindingsBreakdownTable(
  groups: readonly TieredFindingsPhaseGroup[],
  labelHeader: string = 'TIPO DE INCIDENCIA / REGLA'
): string {
  const cols = createBreakdownColumns(labelHeader);
  const rows: BreakdownRow[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const group of groups) {
    if (group.items.length === 0 && group.errors === 0 && group.warnings === 0) continue;
    const meta = getRemediationPhaseMetadata(group.phaseId);
    totalErrors += group.errors;
    totalWarnings += group.warnings;

    // Phase Header (compact, avoids cell wrapping)
    rows.push({
      label: styleText(['bold', 'cyan'], `${meta.icon} ${meta.title}`),
      errors: '',
      warnings: ''
    });

    // Rule rows belonging to this strategic phase
    for (const [name, data] of group.items) {
      rows.push({
        label: `  ${name}`,
        errors: formatCountCell(data.errors, 'red'),
        warnings: formatCountCell(data.warnings, 'yellow')
      });
    }

    // Phase Subtotal (compact label strictly fits within 52 cols)
    rows.push({
      label: styleText('bold', `  ↳ Subtotal Fase ${meta.order}`),
      errors: formatCountCell(group.errors, 'red', true),
      warnings: formatCountCell(group.warnings, 'yellow', true)
    });
  }

  return renderBoxTable(cols, rows, {
    footerRows: [createConsolidatedFooterRow(totalErrors, totalWarnings)]
  });
}

export function renderSampleFindings(
  findings: readonly AuditFinding[],
  limitOrAll: number | 'all' = 5,
  options?: { readonly title?: string }
): string {
  if (findings.length === 0) return '';
  const limit = limitOrAll === 'all' ? findings.length : limitOrAll;
  const sample = limit >= findings.length ? findings : findings.slice(-limit);
  const countLabel =
    limit >= findings.length ? `todos los ${sample.length}` : `últimos ${sample.length}`;
  const isOnlyWarnings = findings.length > 0 && findings.every((f) => f.severity === 'warning');
  const defaultHeader = isOnlyWarnings
    ? `\n⚠️  Muestra de advertencias detectadas (${countLabel} de ${findings.length}):\n`
    : `\n❌ Muestra de errores detectados (${countLabel} de ${findings.length}):\n`;
  const header = options?.title
    ? `\n${options.title} (${countLabel} de ${findings.length}):\n`
    : defaultHeader;
  const lines = sample.map((f, idx) => {
    const fileLoc = f.file
      ? `${path.relative(process.cwd(), f.file)}${f.line ? `:${f.line}` : ''}`
      : 'General';
    const cleanMsg = f.message.replace(/^Sugerencia de calidad \(Fallow\):\s*/i, '');
    const normalizedRuleDesc = (f.ruleDescription || '')
      .replace(/^Fallow:\s*/i, '')
      .trim()
      .toLowerCase();
    const ruleTag =
      f.ruleDescription && !cleanMsg.toLowerCase().includes(normalizedRuleDesc)
        ? `[${f.ruleDescription}] `
        : f.ruleDescription?.startsWith('Fallow:')
          ? '[Fallow] '
          : f.ruleId
            ? `[${f.ruleId}] `
            : '';
    return `  ${idx + 1}. ${fileLoc}: ${ruleTag}${cleanMsg}`;
  });

  return `${header}${lines.join('\n')}\n`;
}

export const NOTICE_BOX_COLORS = ['yellow', 'cyan', 'red', 'green', 'magenta', 'blue'] as const;
export type NoticeBoxColor = (typeof NOTICE_BOX_COLORS)[number];

export function renderBanner(
  title: string,
  subtitle?: string,
  borderColor?: NoticeBoxColor
): string {
  let resolvedColor: NoticeBoxColor = borderColor ?? 'cyan';
  if (!borderColor) {
    if (title.includes('REPARACIÓN')) {
      resolvedColor = 'magenta';
    } else if (title.includes('CRÍTIC') || title.includes('ERROR') || title.includes('FALLO')) {
      resolvedColor = 'red';
    } else if (title.includes('WARN') || title.includes('ADVERTENCIA')) {
      resolvedColor = 'yellow';
    } else if (title.includes('APROBAD') || title.includes('ÉXITO')) {
      resolvedColor = 'green';
    }
  }

  const content = subtitle
    ? `${styleText(['bold', 'white'], title)}\n${styleText('dim', subtitle)}`
    : styleText(['bold', 'white'], title);

  return boxen(content, {
    borderColor: resolvedColor,
    borderStyle: 'double',
    padding: { top: 0, bottom: 0, left: 1, right: 1 }
  });
}

export interface NoticeBoxOptions {
  borderColor?: NoticeBoxColor;
  title: string;
  lines: string[];
}

export function buildNoticeBox(options: NoticeBoxOptions): string {
  const color = options.borderColor || 'yellow';
  const header = styleText(['bold', color], options.title);
  const content = [header, ...options.lines].join('\n');

  return boxen(content, {
    borderColor: color,
    borderStyle: 'double',
    padding: { top: 0, bottom: 0, left: 1, right: 1 }
  });
}

/**
 * Renders a prominent 80-column Box-Drawing warning banner when the automatic
 * installation of Fallow's vector embedding model fails, notifying both human
 * developers and AI agents with the exact command to install it manually.
 */
export function renderSimilarCodeWarningBanner(): string {
  const isWindows = process.platform === 'win32';
  const lines = [
    styleText('white', 'La inicialización automática del modelo de embeddings de Fallow falló.'),
    styleText('white', 'El sub-auditor especializado de similar-code no se pudo ejecutar.'),
    styleText(
      'dim',
      'Esta funcionalidad requiere instalación manual o desbloqueo en este entorno.'
    ),
    ''
  ];

  if (isWindows) {
    lines.push(
      styleText(
        ['bold', 'yellow'],
        'Si Windows Smart App Control o Antivirus bloqueó el binario (error 4551):'
      ),
      styleText(
        'white',
        '  1. En la notificación de Windows: Clic en "Más información" -> "Permitir".'
      ),
      styleText('white', '  2. O intenta la auto-reparación con: npm run auditor:fix'),
      ''
    );
  }

  lines.push(
    styleText(['bold', 'white'], 'Comando de instalación manual:'),
    styleText(['bold', 'cyan'], '  👉  fallow similar-code setup --local --yes'),
    '',
    styleText('dim', 'Nota para CI/headless: puedes omitir esta suite con:'),
    styleText('dim', '  AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1 (o AUDITOR_ENV=production)')
  );

  return buildNoticeBox({
    borderColor: 'yellow',
    title: '⚠️  ATENCIÓN: ANÁLISIS DE CÓDIGO SIMILAR VECTORIAL NO DISPONIBLE',
    lines
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
      styleText(
        'dim',
        'El auditor dispone de mecanismos automáticos para resolver la gran mayoría.'
      ),
      styleText(
        ['bold', 'yellow'],
        'ESTÁ CATEGÓRICAMENTE PROHIBIDO SILENCIAR O APAGAR REGLAS EN PÁNICO.'
      ),
      '',
      styleText(['bold', 'white'], 'Ejecuta primero la auto-reparación antes de continuar:'),
      styleText(['bold', 'cyan'], '  👉  npm run auditor:fix   (o auditor fix)')
    ]
  });
}

/**
 * Renders a prominent Box-Drawing critical blocking banner when setup-phase errors exist,
 * mandating that project infrastructure, configurations, dependencies, and scripts
 * must be resolved first before application code or stylesheets.
 */
export function renderSetupBlockingBanner(
  setupErrors: number,
  postponedAppErrors: number
): string {
  const setupErrorStr = formatNumber(setupErrors);
  const postponedStr = formatNumber(postponedAppErrors);

  return buildNoticeBox({
    borderColor: 'red',
    title: '🚨  BLOQUEO CRÍTICO: CONFIGURACIÓN Y PROYECTO (FASE SETUP)',
    lines: [
      styleText(
        ['bold', 'white'],
        `Se detectaron ${styleText('red', setupErrorStr)} error(es) en suites de Configuración, Dependencias y Scripts.`
      ),
      styleText(
        ['bold', 'yellow'],
        'ESTOS ERRORES DEBEN REPARARSE PRIMERO ANTES DE TOCAR CÓDIGO O ESTILOS.'
      ),
      styleText(
        'dim',
        `Para evitar falsos positivos inducidos, se postergó el reporte de ${postponedStr} error(es) de aplicación.`
      ),
      '',
      styleText(['bold', 'white'], 'Paso 1 imperativo — Ejecuta la auto-reparación de setup:'),
      styleText(['bold', 'cyan'], '  👉  npm run auditor:fix   (o auditor fix)')
    ]
  });
}

/**
 * Renders the full dynamic registry of auditors in an 80-column Box-Drawing table,
 * grouped by family, with capability flags and concise descriptions.
 */
import type { AuditListFilter } from './auditConfigTypes.ts';

export interface AuditorsRegistryTableOptions {
  readonly filter?: AuditListFilter;
  readonly disabledReasons?: ReadonlyMap<string, string>;
}

export function renderAuditorsRegistryTable(
  tasks: readonly AuditTaskDefinition[],
  activeFamilies: readonly string[],
  options?: AuditorsRegistryTableOptions
): string {
  const output: string[] = [];
  const filter = options?.filter ?? 'all';

  let bannerTitle = 'CATÁLOGO DINÁMICO DE AUDITORES Y CAPACIDADES';
  let bannerSubtitle = 'Suites descubiertas en tiempo de ejecución (cero hardcoding)';

  if (filter === 'disabled') {
    bannerTitle = 'CATÁLOGO DE AUDITORES DESACTIVADOS / APAGADOS';
    bannerSubtitle = 'Suites omitidas por configuración (.auditor/audit.config.ts)';
  } else if (filter === 'enabled') {
    bannerTitle = 'CATÁLOGO DE AUDITORES ACTIVOS / ENCENDIDOS';
    bannerSubtitle = 'Suites habilitadas y listas para ejecución';
  }

  output.push(renderBanner(bannerTitle, bannerSubtitle) + '\n');

  if (tasks.length === 0) {
    if (filter === 'disabled') {
      output.push(
        styleText(
          'green',
          '✨ ¡No hay auditores desactivados! Todas las suites descubiertas están encendidas y activas.\n'
        )
      );
    } else {
      output.push(
        styleText(
          'yellow',
          '⚠️ No se encontraron auditores que coincidan con los filtros especificados.\n'
        )
      );
    }
    return output.join('\n');
  }

  function renderFamilySectionHeader(familyKey: string, count: number, label: string): string {
    const meta = FAMILY_METADATA[familyKey as AuditFamily];
    const headerTitle = meta
      ? `${meta.icon} Familia ${meta.order}: ${meta.title}`
      : familyKey.toUpperCase();
    return styleText('bold', `\n📌 ${headerTitle} (${count} ${label}):`);
  }

  interface DisabledSuiteRow {
    id: string;
    state: string;
    reason: string;
  }

  const DISABLED_COLS: readonly TableColumn<DisabledSuiteRow>[] = [
    { header: 'AUDITOR / SUITE ID', width: 28, align: 'left', key: 'id' },
    { header: 'ESTADO', width: 12, align: 'left', key: 'state' },
    { header: 'MOTIVO / CLAVE DE CONFIGURACIÓN', width: 30, align: 'left', key: 'reason' }
  ];

  function renderFamilyTables<TRow extends object>(
    activeFamilies: readonly string[],
    tasks: readonly AuditTaskDefinition[],
    label: string,
    columns: readonly TableColumn<TRow>[],
    buildRow: (task: AuditTaskDefinition) => TRow
  ): string[] {
    const output: string[] = [];
    for (const familyKey of activeFamilies) {
      const familyTasks = tasks.filter((t) => t.family === familyKey);
      if (familyTasks.length === 0) continue;

      output.push(renderFamilySectionHeader(familyKey, familyTasks.length, label));
      const rows = familyTasks.map(buildRow);
      output.push(renderBoxTable(columns, rows));
    }
    return output;
  }

  function renderDisabledFamilyTables(
    activeFamilies: readonly string[],
    tasks: readonly AuditTaskDefinition[],
    disabledReasons?: ReadonlyMap<string, string>
  ): string[] {
    return renderFamilyTables(activeFamilies, tasks, 'suites desactivadas', DISABLED_COLS, (t) => ({
      id: `${t.icon ?? '🏛️'} ${t.id}`,
      state: styleText('yellow', '⏭️  APAGADO'),
      reason: disabledReasons?.get(t.id) ?? 'Desactivado por config'
    }));
  }

  interface ActiveSuiteRow {
    id: string;
    flags: string;
    desc: string;
  }

  const ACTIVE_COLS: readonly TableColumn<ActiveSuiteRow>[] = [
    { header: 'AUDITOR / SUITE ID', width: 27, align: 'left', key: 'id' },
    { header: 'FLAGS / CAPACIDADES', width: 19, align: 'left', key: 'flags' },
    { header: 'DESCRIPCIÓN', width: REGISTRY_DESC_COL_WIDTH, align: 'left', key: 'desc' }
  ];

  function formatTaskFlags(caps?: AuditTaskDefinition['capabilities']): string {
    const flags: string[] = [];
    if (caps?.fix && caps.fix !== 'none') {
      flags.push(styleText('green', caps.fix === 'priority' ? 'FIX!' : 'FIX'));
    }
    const speeds = normalizeSpeeds(caps?.speed ?? 'light');
    if (speeds.includes('light')) flags.push(styleText('cyan', '🐇'));
    if (speeds.includes('heavy')) flags.push(styleText('yellow', '🐢'));
    if (speeds.includes('full')) flags.push(styleText('magenta', '🐘'));
    if (caps?.md) flags.push(styleText('magenta', 'MD'));
    if (caps?.phase === 'post-build') flags.push(styleText('red', 'BLD'));
    if (caps?.phase === 'post-run') flags.push(styleText('blue', 'PST'));
    return flags.length > 0 ? flags.join(' ') : styleText('dim', '-');
  }

  function renderActiveFamilyTables(
    activeFamilies: readonly string[],
    tasks: readonly AuditTaskDefinition[]
  ): string[] {
    return renderFamilyTables(activeFamilies, tasks, 'suites', ACTIVE_COLS, (t) => {
      const desc = t.description ?? t.manifest?.description ?? t.name;
      const safeDesc =
        desc.length > REGISTRY_DESC_COL_WIDTH
          ? desc.slice(0, REGISTRY_DESC_TRUNCATE_LIMIT) + '…'
          : desc;

      return {
        id: `${t.icon ?? '🏛️'} ${t.id}`,
        flags: formatTaskFlags(t.capabilities),
        desc: safeDesc
      };
    });
  }

  if (filter === 'disabled') {
    output.push(...renderDisabledFamilyTables(activeFamilies, tasks, options?.disabledReasons));
  } else {
    output.push(...renderActiveFamilyTables(activeFamilies, tasks));
  }

  output.push(
    styleText(
      'dim',
      `\n💡 Para ver el manual y configuración de una suite: auditor --info=<suiteId>`
    )
  );
  output.push(
    styleText('dim', `💡 Para obtener la especificación completa en JSON: auditor --list --json\n`)
  );

  return output.join('\n');
}

/**
 * Renders a detailed inspection card for a single auditor suite (≤ 80 cols).
 */
function formatCapabilityList(caps?: AuditTaskDefinition['capabilities']): string[] {
  const capList: string[] = [];
  if (caps?.fix === 'priority') {
    capList.push(styleText('green', '✔ Auto-reparación Prioritaria (fix=priority)'));
  } else if (caps?.fix === 'normal') {
    capList.push(styleText('green', '✔ Auto-reparación (--fix)'));
  }
  const speeds = normalizeSpeeds(caps?.speed ?? 'light');
  if (speeds.includes('light'))
    capList.push(styleText('cyan', '🐇 Velocidad Rápida (speed=light)'));
  if (speeds.includes('heavy'))
    capList.push(styleText('yellow', '🐢 Velocidad Pesada (speed=heavy)'));
  if (speeds.includes('full'))
    capList.push(styleText('magenta', '🐘 Velocidad Exhaustiva (speed=full)'));
  if (caps?.md) capList.push(styleText('magenta', '✔ Preset Markdown (preset=md)'));
  if (caps?.phase === 'post-build')
    capList.push(styleText('red', '📦 Fase Post-Build (phase=post-build)'));
  if (caps?.phase === 'post-run')
    capList.push(styleText('blue', '🏁 Fase Post-Run (phase=post-run)'));
  if (caps?.changedOnly) capList.push(styleText('white', '✔ Diferencial Git (changed-only)'));
  if (caps?.ast) capList.push(styleText('white', '✔ AST TypeScript in-memory (ast)'));
  return capList;
}

export const themeStyles = {
  boldWhite: (s: string) => styleText(['bold', 'white'], s),
  boldYellow: (s: string) => styleText(['bold', 'yellow'], s),
  boldCyan: (s: string) => styleText(['bold', 'cyan'], s),
  dim: (s: string) => styleText('dim', s),
  white: (s: string) => styleText('white', s)
};

/**
 * Renders a detailed inspection card for a single auditor suite (≤ 80 cols).
 */
export function renderAuditorDetailCard(task: AuditTaskDefinition): string {
  const { boldWhite, boldYellow, dim, white } = themeStyles;
  const sections: string[][] = [];

  const icon = task.icon ?? '🏛️';
  const title = `${icon} ${task.name} [${task.id}]`;
  const subtitle = `Familia: ${task.family} | Script: ${task.scriptPath}`;
  sections.push([boldWhite(title), dim(subtitle)]);

  const desc = task.description ?? task.manifest?.description ?? 'Sin descripción declarada.';
  sections.push([boldYellow('📋 PROPÓSITO:'), white(`  ${desc}`)]);

  const capList = formatCapabilityList(task.capabilities);
  const capLines = [boldYellow('⚙️ CAPACIDADES / FLAGS SOPORTADOS:')];
  if (capList.length === 0) {
    capLines.push(dim('  (Ejecución estándar general)'));
  } else {
    for (const c of capList) {
      capLines.push(`  ${c}`);
    }
  }
  sections.push(capLines);

  const rules = task.ruleDescriptions ?? task.manifest?.rules;
  if (rules && Object.keys(rules).length > 0) {
    const MAX_CARD_DISPLAY_RULES = 8;
    const count = Object.keys(rules).length;
    const ruleLines = [boldYellow(`🔍 REGLAS EVALUADAS (${count}):`)];
    for (const [rId, rDesc] of Object.entries(rules).slice(0, MAX_CARD_DISPLAY_RULES)) {
      ruleLines.push(`  • ${boldWhite(rId)}: ${dim(rDesc)}`);
    }
    if (count > MAX_CARD_DISPLAY_RULES) {
      ruleLines.push(dim(`  ... y ${count - MAX_CARD_DISPLAY_RULES} reglas más.`));
    }
    sections.push(ruleLines);
  }

  const configKey = task.configKey ?? task.manifest?.configKey;
  const configText = configKey
    ? `  Clave configurable: ${boldWhite(configKey)}`
    : dim('  Sin configuración requerida (opera con estándares canónicos).');
  sections.push([boldYellow('🛠️ CONFIGURACIÓN (.auditor/audit.config.ts):'), configText]);

  const content = sections.map((sec) => sec.join('\n')).join('\n\n');

  const box = boxen(content, {
    borderColor: 'cyan',
    borderStyle: 'double',
    padding: { top: 0, bottom: 0, left: 1, right: 1 }
  });

  return `${box}\n`;
}

/**
 * Renders the CLI general interactive help (≤ 80 cols).
 */
export function renderCliHelp(activeFamilies: readonly string[]): string {
  const lines: string[] = [];

  lines.push(
    renderBanner(
      '@francogp/auditor — Framework de Auditoría Estática y Gobernanza',
      'Node.js 26+ Native | UnifiedTheme Box-Drawing | Cero Hardcoding'
    ) + '\n'
  );

  const boldYellow = (s: string) => styleText(['bold', 'yellow'], s);

  lines.push(boldYellow('USO:'));
  lines.push('  auditor [opciones] [comandos]  (o npm run auditor [opciones])\n');

  lines.push(boldYellow('COMANDOS DE DESCUBRIMIENTO E INTROSPECCIÓN:'));
  lines.push('  --list, list                 Lista todas las suites descubiertas y sus flags.');
  lines.push(
    '  --list --enabled             Lista exclusivamente las suites activas/encendidas en config.'
  );
  lines.push(
    '  --list --disabled            Lista exclusivamente las suites apagadas/desactivadas en config.'
  );
  lines.push(
    '  --list --json                Emite el catálogo completo en formato JSON estructurado.'
  );
  lines.push(
    '  --info=<id>, info <id>       Muestra la ficha técnica, reglas y configuración de una suite.'
  );
  lines.push(
    '  --guide=<id>, guide <id>     Muestra la guía de remediación y soluciones para una regla o suite.'
  );
  lines.push('  -h, --help, help             Muestra este mensaje de ayuda interactivo.\n');

  lines.push(boldYellow('HERRAMIENTAS DE REFACTORIZACIÓN DETERMINISTA (CERO TOKENS LLM):'));
  lines.push('  npm run auditor:types        Remediación de as any, casts dobles y contratos de retorno.');
  lines.push('  npm run auditor:domain       Remediación de strings crudos, catálogos e IDs sin Brand.');
  lines.push('  npm run auditor:dupes        Deduplicación de clones sintácticos y triplicados.');
  lines.push('  npm run auditor:magic        Extracción de números mágicos a design tokens.');
  lines.push('  npm run auditor:motion       Gobernanza de animaciones UI y timers prohibidos.');
  lines.push('  npm run auditor:o1           Optimización de búsquedas lineales O(N) a O(1).');
  lines.push('  ↳ Subcomandos comunes: discover, inspect <archivo>, apply <plan.json>, help\n');

  lines.push(boldYellow('MODOS, VELOCIDADES Y FASES DE EJECUCIÓN:'));
  lines.push(
    '  fix, --fix                   Modo reparación: ejecuta suites con capacidad de auto-fix.'
  );
  lines.push('  speed=light|heavy|full       Techo de velocidad (por defecto: heavy 🐢).');
  lines.push(
    '  only-speed=light|heavy|full  Ejecuta únicamente suites que declaren esa velocidad exacta.'
  );
  lines.push('  phase=post-build             Suites que validan artefactos compilados en dist/.');
  lines.push('  preset=md                    Preset rápido de documentación y Markdown.');
  lines.push('  --with-build                 Incluye suites post-build en la corrida general.\n');

  lines.push(boldYellow('FILTROS Y SELECCIÓN:'));
  lines.push(`  family=<nombre>              Filtra por familia (${activeFamilies.join(', ')}).`);
  lines.push('  task=<id>, suites=<id1,id2>  Ejecuta exclusivamente una o varias suites.');
  lines.push('  rule=<id1,id2>               Filtra reglas específicas.');
  lines.push('  --errors-only                Muestra únicamente errores suprimiendo advertencias.');
  lines.push('  changed-since=<ref>          Filtra archivos modificados respecto de git ref.\n');

  lines.push(boldYellow('HERRAMIENTAS ASOCIADAS (NPM SCRIPTS):'));
  lines.push('  npm run auditor:help         Muestra este catálogo interactivo de comandos.');
  lines.push('  npm run auditor:guide -- <r> Consulta el manual de remediación de una regla.');
  lines.push('  npm run auditor:lint         Auditoría rápida (speed=light 🐇).');
  lines.push('  npm run auditor:full         Auditoría exhaustiva pre-build (speed=full 🐘).');
  lines.push(
    '  npm run auditor:post-build   Auditoría de artefactos compilados (phase=post-build).'
  );
  lines.push('  npm run auditor:by-file      Árbol jerárquico de incidencias por archivo y línea.');
  lines.push('  npm run auditor:findings     Consulta interactiva con filtros y desgloses.');
  lines.push('  npm run auditor:rules        Desglose consolidado agrupado y ordenado por regla.');
  lines.push('  npm run auditor:fix          Aplica auto-reparaciones mecánicas en el código.');
  lines.push(
    '  npm run auditor:update       Actualiza el paquete upstream de @francogp/auditor.\n'
  );

  return lines.join('\n');
}

export function renderFamilyHeader(meta: FamilyMetadata): string {
  const line = '─'.repeat(TERMINAL_WIDTH - 8);
  return styleText(
    'bold',
    `\n${meta.icon} [FAMILIA ${meta.order}] ${meta.title}\n${styleText('dim', `  ${line}`)}`
  );
}

export const AUDIT_BADGE_STATUSES = ['passed', 'failed', 'warning', 'info', 'skipped'] as const;
export type AuditBadgeStatus = (typeof AUDIT_BADGE_STATUSES)[number];

export function formatStatusBadge(status: AuditBadgeStatus): string {
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

import {
  DURATION_PAD_LENGTH,
  formatDurationMs,
  formatDuration,
  formatNumber
} from './durationFormatter.ts';

export { DURATION_PAD_LENGTH, formatDurationMs, formatDuration, formatNumber };

const METRIC_COL_WIDTH = 16;

function formatTaskMetricCol(metrics?: Record<string, string | number>): string {
  const entries = Object.entries(metrics || {});
  if (entries.length === 0) return ' '.repeat(METRIC_COL_WIDTH);

  const [k, v] = entries[0]!;
  const formattedVal = typeof v === 'number' ? formatNumber(v) : v;
  const primaryMetric = `${formattedVal} ${k.split(' ')[0] ?? ''}`.trim();
  const cleanMetric =
    primaryMetric.length > METRIC_COL_WIDTH
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

export const COUNT_BADGE_COLORS = ['red', 'yellow'] as const;
export type CountBadgeColor = (typeof COUNT_BADGE_COLORS)[number];

function formatTaskCount(count: number, icon: string, color: CountBadgeColor): string {
  const text = `${formatNumber(count)} ${icon}`.padStart(6);
  return count > 0 ? styleText(color, text) : styleText('dim', text);
}

export const TASK_NAME_COL_WIDTH = 38;

export function renderAuditTaskRow(res: StandardAuditResult): string {
  const errors = res.summary?.errors ?? (res.status === 'failed' ? 1 : 0);
  const warnings = res.summary?.warnings ?? 0;
  const badge = computeTaskBadge(res.status, errors, warnings);
  const nameStr =
    res.name.length > TASK_NAME_COL_WIDTH
      ? res.name.slice(0, TASK_NAME_COL_WIDTH - 1) + '…'
      : res.name.padEnd(TASK_NAME_COL_WIDTH);
  const durationStr = formatDuration(res.durationMs);
  const metricStr = formatTaskMetricCol(res.metrics);
  const errStr = formatTaskCount(errors, '❌', 'red');
  const warnStr = formatTaskCount(warnings, '⚠️', 'yellow');

  return `  ${badge} │ ${styleText('bold', nameStr)} │ ${styleText('dim', durationStr)} │ ${metricStr} │ ${errStr} │ ${warnStr}`;
}

export {
  groupFindingsByFile,
  formatFindingEntry,
  renderFindingsDetail
} from './fileTreeRenderer.ts';

export {
  type RenderByFileTreeOptions,
  renderFindingsByFileTree,
  formatSampleErrorLine,
  renderSampleErrors
} from './fileTreeRenderer.ts';
import { renderSampleErrors } from './fileTreeRenderer.ts';

export function renderConsolidatedFooter(
  suitesTotal: number,
  suitesPassed: number,
  totalErrors: number,
  totalWarnings: number,
  totalDurationMs: number,
  errorFindings?: AuditFinding[],
  suitesSkipped: number = 0
): string {
  const statusText =
    totalErrors === 0
      ? styleText(['bold', 'green'], '🎉 ¡SUITE DE AUDITORÍA GLOBAL APROBADA!')
      : styleText(['bold', 'red'], '🚨 AUDITORÍA GLOBAL CON ERRORES CRÍTICOS');

  const skippedNote = suitesSkipped > 0 ? ` (${formatNumber(suitesSkipped)} Omitidas)` : '';
  const durationText = styleText(
    'dim',
    `Duración Total: ${formatDurationMs(totalDurationMs)} | Suites: ${formatNumber(suitesPassed)}/${formatNumber(suitesTotal)} Aprobadas${skippedNote}`
  );
  const countsText = `Errores: ${totalErrors === 0 ? styleText('green', '0') : styleText('red', formatNumber(totalErrors))}  |  Advertencias: ${totalWarnings === 0 ? styleText('green', '0') : styleText('yellow', formatNumber(totalWarnings))}`;

  const rawLines = [statusText, durationText, countsText];
  if (errorFindings && errorFindings.length > 0) {
    rawLines.push(...renderSampleErrors(errorFindings));
  }

  const borderColor: NoticeBoxColor =
    totalErrors > 0 ? 'red' : totalWarnings > 0 ? 'yellow' : 'green';

  const box = boxen(rawLines.join('\n'), {
    borderColor,
    borderStyle: 'double',
    padding: { top: 0, bottom: 0, left: 1, right: 1 }
  });

  return `\n${box}\n`;
}

export { renderMarkdownReport } from './markdownReport.ts';
