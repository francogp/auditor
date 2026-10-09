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
import { FAMILY_METADATA } from "./auditContract.js";
const TERMINAL_WIDTH = 80;
const REGISTRY_DESC_COL_WIDTH = 24;
const REGISTRY_DESC_TRUNCATE_LIMIT = 23;
export { getVisualWidth, padVisual, truncateVisual, TEXT_ALIGNMENTS } from "./terminalVisuals.js";
import { padVisual } from "./terminalVisuals.js";
export function renderBoxTable(columns, rows, options) {
    const head = columns.map(c => styleText('bold', c.header));
    const colAligns = columns.map(c => (c.align === 'center' ? 'center' : c.align === 'right' ? 'right' : 'left'));
    const colWidths = columns.map(c => c.width + 2);
    const table = new Table({
        head,
        colWidths,
        colAligns,
        wordWrap: true,
        chars: {
            'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
            'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
            'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
            'right': '│', 'right-mid': '┤', 'middle': '│'
        },
        style: { 'padding-left': 1, 'padding-right': 1, head: [], border: ['dim'], compact: true }
    });
    if (rows.length === 0) {
        const emptyMsg = options?.emptyMessage || 'No se encontraron registros.';
        table.push([{ colSpan: columns.length, content: styleText('dim', emptyMsg), hAlign: 'center' }]);
    }
    else {
        for (const row of rows) {
            const cellValues = columns.map(c => {
                return c.render ? c.render(row) : String(row[c.key ?? ''] ?? ''); // open-record: Generic table row container
            });
            table.push(cellValues);
        }
    }
    if (options?.footerRows && options.footerRows.length > 0) {
        const footerTable = new Table({
            colWidths,
            colAligns,
            wordWrap: true,
            chars: {
                'top': '─', 'top-mid': '┼', 'top-left': '├', 'top-right': '┤',
                'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
                'left': '│', 'left-mid': '', 'mid': '', 'mid-mid': '',
                'right': '│', 'right-mid': '', 'middle': '│'
            },
            style: { 'padding-left': 1, 'padding-right': 1, head: [], border: ['dim'], compact: true }
        });
        for (const fRow of options.footerRows) {
            const cellValues = columns.map(c => {
                return c.render ? c.render(fRow) : String(fRow[c.key ?? ''] ?? ''); // open-record: Generic table row container
            });
            footerTable.push(cellValues);
        }
        const bodyLines = table.toString().split('\n');
        bodyLines.pop();
        const footerLines = footerTable.toString().split('\n');
        return [...bodyLines, ...footerLines].join('\n');
    }
    return table.toString();
}
export function renderFindingsBreakdownTable(items, labelHeader = 'TIPO DE INCIDENCIA / REGLA') {
    const cols = [
        { header: labelHeader, width: 52, align: 'left', key: 'label' },
        { header: 'ERRORES', width: 9, align: 'right', key: 'errors' },
        { header: 'WARNINGS', width: 9, align: 'right', key: 'warnings' }
    ];
    const rows = items.map(([name, data]) => ({
        label: name,
        errors: data.errors > 0 ? styleText('red', String(data.errors)) : styleText('dim', '0'),
        warnings: data.warnings > 0 ? styleText('yellow', String(data.warnings)) : styleText('dim', '0')
    }));
    const totalErrors = items.reduce((acc, [_, data]) => acc + data.errors, 0);
    const totalWarnings = items.reduce((acc, [_, data]) => acc + data.warnings, 0);
    const footerRow = {
        label: styleText('bold', 'TOTAL CONSOLIDADO'),
        errors: totalErrors > 0 ? styleText(['bold', 'red'], String(totalErrors)) : styleText('dim', '0'),
        warnings: totalWarnings > 0 ? styleText(['bold', 'yellow'], String(totalWarnings)) : styleText('dim', '0')
    };
    return renderBoxTable(cols, rows, { footerRows: [footerRow] });
}
export function renderSampleFindings(findings, limitOrAll = 5) {
    if (findings.length === 0)
        return '';
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
export const NOTICE_BOX_COLORS = ['yellow', 'cyan', 'red', 'green', 'magenta', 'blue'];
export function renderBanner(title, subtitle, borderColor) {
    let resolvedColor = borderColor ?? 'cyan';
    if (!borderColor) {
        if (title.includes('REPARACIÓN')) {
            resolvedColor = 'magenta';
        }
        else if (title.includes('CRÍTIC') || title.includes('ERROR') || title.includes('FALLO')) {
            resolvedColor = 'red';
        }
        else if (title.includes('WARN') || title.includes('ADVERTENCIA')) {
            resolvedColor = 'yellow';
        }
        else if (title.includes('APROBAD') || title.includes('ÉXITO')) {
            resolvedColor = 'green';
        }
    }
    const content = subtitle ? `${styleText(['bold', 'white'], title)}\n${styleText('dim', subtitle)}` : styleText(['bold', 'white'], title);
    return boxen(content, {
        borderColor: resolvedColor,
        borderStyle: 'double',
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        width: TERMINAL_WIDTH
    });
}
function buildNoticeBox(options) {
    const color = options.borderColor || 'yellow';
    const header = styleText(['bold', color], options.title);
    const divider = styleText('dim', '─'.repeat(TERMINAL_WIDTH - 6));
    const content = [header, divider, ...options.lines].join('\n');
    return boxen(content, {
        borderColor: color,
        borderStyle: 'double',
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        width: TERMINAL_WIDTH
    });
}
/**
 * Renders a prominent 80-column Box-Drawing warning banner when the automatic
 * installation of Fallow's vector embedding model fails, notifying both human
 * developers and AI agents with the exact command to install it manually.
 */
export function renderSimilarCodeWarningBanner() {
    const isWindows = process.platform === 'win32';
    const lines = [
        styleText('white', 'La inicialización automática del modelo de embeddings de Fallow falló.'),
        styleText('white', 'El sub-auditor especializado de similar-code no se pudo ejecutar.'),
        styleText('dim', 'Esta funcionalidad requiere instalación manual o desbloqueo en este entorno.'),
        ''
    ];
    if (isWindows) {
        lines.push(styleText(['bold', 'yellow'], 'Si Windows Smart App Control o Antivirus bloqueó el binario (error 4551):'), styleText('white', '  1. En la notificación de Windows: Clic en "Más información" -> "Permitir".'), styleText('white', '  2. O intenta la auto-reparación con: npm run auditor:fix'), '');
    }
    lines.push(styleText(['bold', 'white'], 'Comando de instalación manual:'), styleText(['bold', 'cyan'], '  👉  fallow similar-code setup --local --yes'), '', styleText('dim', 'Nota para CI/headless: puedes omitir esta suite con:'), styleText('dim', '  AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1 (o AUDITOR_ENV=production)'));
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
export function renderAutoFixNoticeBanner(fixableErrors, fixableWarnings) {
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
            styleText(['bold', 'cyan'], '  👉  npm run auditor:fix   (o auditor fix)')
        ]
    });
}
export function renderAuditorsRegistryTable(tasks, activeFamilies, options) {
    const output = [];
    const filter = options?.filter ?? 'all';
    let bannerTitle = 'CATÁLOGO DINÁMICO DE AUDITORES Y CAPACIDADES';
    let bannerSubtitle = 'Suites descubiertas en tiempo de ejecución (cero hardcoding)';
    if (filter === 'disabled') {
        bannerTitle = 'CATÁLOGO DE AUDITORES DESACTIVADOS / APAGADOS';
        bannerSubtitle = 'Suites omitidas por configuración (.auditor/audit.config.ts)';
    }
    else if (filter === 'enabled') {
        bannerTitle = 'CATÁLOGO DE AUDITORES ACTIVOS / ENCENDIDOS';
        bannerSubtitle = 'Suites habilitadas y listas para ejecución';
    }
    output.push(renderBanner(bannerTitle, bannerSubtitle) + '\n');
    if (tasks.length === 0) {
        if (filter === 'disabled') {
            output.push(styleText('green', '✨ ¡No hay auditores desactivados! Todas las suites descubiertas están encendidas y activas.\n'));
        }
        else {
            output.push(styleText('yellow', '⚠️ No se encontraron auditores que coincidan con los filtros especificados.\n'));
        }
        return output.join('\n');
    }
    function renderFamilySectionHeader(familyKey, count, label) {
        const meta = FAMILY_METADATA[familyKey];
        const headerTitle = meta ? `${meta.icon} Familia ${meta.order}: ${meta.title}` : familyKey.toUpperCase();
        return styleText('bold', `\n📌 ${headerTitle} (${count} ${label}):`);
    }
    const DISABLED_COLS = [
        { header: 'AUDITOR / SUITE ID', width: 28, align: 'left', key: 'id' },
        { header: 'ESTADO', width: 12, align: 'left', key: 'state' },
        { header: 'MOTIVO / CLAVE DE CONFIGURACIÓN', width: 30, align: 'left', key: 'reason' }
    ];
    function renderFamilyTables(activeFamilies, tasks, label, columns, buildRow) {
        const output = [];
        for (const familyKey of activeFamilies) {
            const familyTasks = tasks.filter(t => t.family === familyKey);
            if (familyTasks.length === 0)
                continue;
            output.push(renderFamilySectionHeader(familyKey, familyTasks.length, label));
            const rows = familyTasks.map(buildRow);
            output.push(renderBoxTable(columns, rows));
        }
        return output;
    }
    function renderDisabledFamilyTables(activeFamilies, tasks, disabledReasons) {
        return renderFamilyTables(activeFamilies, tasks, 'suites desactivadas', DISABLED_COLS, t => ({
            id: `${t.icon ?? '🏛️'} ${t.id}`,
            state: styleText('yellow', '⏭️  APAGADO'),
            reason: disabledReasons?.get(t.id) ?? 'Desactivado por config'
        }));
    }
    const ACTIVE_COLS = [
        { header: 'AUDITOR / SUITE ID', width: 27, align: 'left', key: 'id' },
        { header: 'FLAGS / CAPACIDADES', width: 19, align: 'left', key: 'flags' },
        { header: 'DESCRIPCIÓN', width: REGISTRY_DESC_COL_WIDTH, align: 'left', key: 'desc' }
    ];
    function formatTaskFlags(caps) {
        const flags = [];
        if (caps?.fix)
            flags.push(styleText('green', 'FIX'));
        if (caps?.lint)
            flags.push(styleText('cyan', 'LINT'));
        if (caps?.md)
            flags.push(styleText('magenta', 'MD'));
        if (caps?.heavy)
            flags.push(styleText('yellow', 'HVY'));
        if (caps?.requiresBuild)
            flags.push(styleText('red', 'BLD'));
        return flags.length > 0 ? flags.join(' ') : styleText('dim', '-');
    }
    function renderActiveFamilyTables(activeFamilies, tasks) {
        return renderFamilyTables(activeFamilies, tasks, 'suites', ACTIVE_COLS, t => {
            const desc = t.description ?? t.manifest?.description ?? t.name;
            const safeDesc = desc.length > REGISTRY_DESC_COL_WIDTH ? desc.slice(0, REGISTRY_DESC_TRUNCATE_LIMIT) + '…' : desc;
            return {
                id: `${t.icon ?? '🏛️'} ${t.id}`,
                flags: formatTaskFlags(t.capabilities),
                desc: safeDesc
            };
        });
    }
    if (filter === 'disabled') {
        output.push(...renderDisabledFamilyTables(activeFamilies, tasks, options?.disabledReasons));
    }
    else {
        output.push(...renderActiveFamilyTables(activeFamilies, tasks));
    }
    output.push(styleText('dim', `\n💡 Para ver el manual y configuración de una suite: auditor --info=<suiteId>`));
    output.push(styleText('dim', `💡 Para obtener la especificación completa en JSON: auditor --list --json\n`));
    return output.join('\n');
}
/**
 * Renders a detailed inspection card for a single auditor suite (≤ 80 cols).
 */
function formatCapabilityList(caps) {
    const capList = [];
    if (caps?.fix)
        capList.push(styleText('green', '✔ Auto-reparación (--fix)'));
    if (caps?.lint)
        capList.push(styleText('cyan', '✔ Preset Lint (preset=lint)'));
    if (caps?.md)
        capList.push(styleText('magenta', '✔ Preset Markdown (preset=md)'));
    if (caps?.heavy)
        capList.push(styleText('yellow', '⚡ Computacionalmente Pesado (heavy)'));
    if (caps?.requiresBuild)
        capList.push(styleText('red', '📦 Requiere Build Previo (requiresBuild)'));
    if (caps?.changedSince)
        capList.push(styleText('white', '✔ Diferencial Git (--changed-since)'));
    if (caps?.ast)
        capList.push(styleText('white', '✔ AST TypeScript in-memory (ast)'));
    return capList;
}
function appendCardCapabilities(lines, caps, innerWidth, cyan, dim, divider) {
    lines.push(cyan('║  ') + padVisual(styleText(['bold', 'yellow'], '⚙️ CAPACIDADES / FLAGS SOPORTADOS:'), innerWidth) + cyan('  ║'));
    const capList = formatCapabilityList(caps);
    if (capList.length === 0) {
        lines.push(cyan('║  ') + padVisual(dim('  (Ejecución estándar general)'), innerWidth) + cyan('  ║'));
    }
    else {
        for (const c of capList) {
            lines.push(cyan('║  ') + padVisual(`  ${c}`, innerWidth) + cyan('  ║'));
        }
    }
    lines.push(cyan('║  ') + padVisual(dim(`  ${divider}`), innerWidth) + cyan('  ║'));
}
function appendCardRules(lines, task, innerWidth, cyan, dim, divider) {
    const rules = task.ruleDescriptions ?? task.manifest?.rules;
    if (!rules || Object.keys(rules).length === 0)
        return;
    const count = Object.keys(rules).length;
    lines.push(cyan('║  ') + padVisual(styleText(['bold', 'yellow'], `🔍 REGLAS EVALUADAS (${count}):`), innerWidth) + cyan('  ║'));
    for (const [rId, rDesc] of Object.entries(rules).slice(0, 8)) {
        lines.push(cyan('║  ') + padVisual(`  • ${styleText(['bold', 'white'], rId)}: ${dim(rDesc)}`, innerWidth) + cyan('  ║'));
    }
    if (count > 8) {
        lines.push(cyan('║  ') + padVisual(dim(`  ... y ${count - 8} reglas más.`), innerWidth) + cyan('  ║'));
    }
    lines.push(cyan('║  ') + padVisual(dim(`  ${divider}`), innerWidth) + cyan('  ║'));
}
/**
 * Renders a detailed inspection card for a single auditor suite (≤ 80 cols).
 */
export function renderAuditorDetailCard(task) {
    const line = '═'.repeat(TERMINAL_WIDTH - 4);
    const divider = '─'.repeat(TERMINAL_WIDTH - 6);
    const innerWidth = TERMINAL_WIDTH - 6;
    const lines = [];
    const cyan = (s) => styleText('cyan', s);
    const boldWhite = (s) => styleText(['bold', 'white'], s);
    const boldYellow = (s) => styleText(['bold', 'yellow'], s);
    const dim = (s) => styleText('dim', s);
    const white = (s) => styleText('white', s);
    lines.push(cyan(`╔═${line}═╗`));
    const title = `${task.icon ?? '🏛️'} ${task.name} [${task.id}]`;
    lines.push(cyan('║  ') + padVisual(boldWhite(title), innerWidth) + cyan('  ║'));
    lines.push(cyan('║  ') + padVisual(dim(`Familia: ${task.family} | Script: ${task.scriptPath}`), innerWidth) + cyan('  ║'));
    lines.push(cyan(`╠═${line}═╣`));
    lines.push(cyan('║  ') + padVisual(boldYellow('📋 PROPÓSITO:'), innerWidth) + cyan('  ║'));
    const desc = task.description ?? task.manifest?.description ?? 'Sin descripción declarada.';
    lines.push(cyan('║  ') + padVisual(white(`  ${desc}`), innerWidth) + cyan('  ║'));
    lines.push(cyan('║  ') + padVisual(dim(`  ${divider}`), innerWidth) + cyan('  ║'));
    appendCardCapabilities(lines, task.capabilities, innerWidth, cyan, dim, divider);
    appendCardRules(lines, task, innerWidth, cyan, dim, divider);
    lines.push(cyan('║  ') + padVisual(boldYellow('🛠️ CONFIGURACIÓN (.auditor/audit.config.ts):'), innerWidth) + cyan('  ║'));
    const configKey = task.configKey ?? task.manifest?.configKey;
    const configText = configKey
        ? `  Clave configurable: ${boldWhite(configKey)}`
        : dim('  Sin configuración requerida (opera con estándares canónicos).');
    lines.push(cyan('║  ') + padVisual(configText, innerWidth) + cyan('  ║'));
    lines.push(cyan(`╚═${line}═╝\n`));
    return lines.join('\n');
}
/**
 * Renders the CLI general interactive help (≤ 80 cols).
 */
export function renderCliHelp(activeFamilies) {
    const lines = [];
    lines.push(renderBanner('@francogp/auditor — Framework de Auditoría Estática y Gobernanza', 'Node.js 26+ Native | UnifiedTheme Box-Drawing | Cero Hardcoding') + '\n');
    const boldYellow = (s) => styleText(['bold', 'yellow'], s);
    lines.push(boldYellow('USO:'));
    lines.push('  auditor [opciones] [comandos]  (o npm run auditor [opciones])\n');
    lines.push(boldYellow('COMANDOS DE DESCUBRIMIENTO E INTROSPECCIÓN:'));
    lines.push('  --list, list                 Lista todas las suites descubiertas y sus flags.');
    lines.push('  --list --enabled             Lista exclusivamente las suites activas/encendidas en config.');
    lines.push('  --list --disabled            Lista exclusivamente las suites apagadas/desactivadas en config.');
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
    lines.push('  npm run auditor:by-file      Árbol jerárquico de incidencias por archivo y línea.');
    lines.push('  npm run auditor:findings     Consulta interactiva con filtros y desgloses.');
    lines.push('  npm run auditor:fix          Aplica auto-reparaciones mecánicas en el código.');
    lines.push('  npm run auditor:update       Actualiza el paquete upstream de @francogp/auditor.\n');
    return lines.join('\n');
}
export function renderFamilyHeader(meta) {
    const line = '─'.repeat(TERMINAL_WIDTH - 8);
    return styleText('bold', `\n${meta.icon} [FAMILIA ${meta.order}] ${meta.title}\n${styleText('dim', `  ${line}`)}`);
}
export const AUDIT_BADGE_STATUSES = ['passed', 'failed', 'warning', 'info', 'skipped'];
export function formatStatusBadge(status) {
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
export function formatDuration(ms) {
    const str = `${ms}ms`;
    return str.padStart(7);
}
const METRIC_COL_WIDTH = 16;
function formatTaskMetricCol(metrics) {
    const entries = Object.entries(metrics || {});
    if (entries.length === 0)
        return ' '.repeat(METRIC_COL_WIDTH);
    const [k, v] = entries[0];
    const primaryMetric = `${v} ${k.split(' ')[0] ?? ''}`.trim();
    const cleanMetric = primaryMetric.length > METRIC_COL_WIDTH
        ? primaryMetric.slice(0, METRIC_COL_WIDTH - 1) + '…'
        : primaryMetric;
    return cleanMetric.padEnd(METRIC_COL_WIDTH);
}
function computeTaskBadge(status, errors, warnings) {
    if (status === 'skipped')
        return formatStatusBadge('skipped');
    if (status !== 'passed' || errors > 0)
        return formatStatusBadge('failed');
    if (warnings > 0)
        return formatStatusBadge('warning');
    return formatStatusBadge('passed');
}
export const COUNT_BADGE_COLORS = ['red', 'yellow'];
function formatTaskCount(count, icon, color) {
    const text = `${count} ${icon}`.padStart(6);
    return count > 0 ? styleText(color, text) : styleText('dim', text);
}
export const TASK_NAME_COL_WIDTH = 38;
export function renderAuditTaskRow(res) {
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
export { groupFindingsByFile, formatFindingEntry, renderFindingsDetail } from "./fileTreeRenderer.js";
export { renderFindingsByFileTree, formatSampleErrorLine, renderSampleErrors } from "./fileTreeRenderer.js";
import { renderSampleErrors } from "./fileTreeRenderer.js";
export function renderConsolidatedFooter(suitesTotal, suitesPassed, totalErrors, totalWarnings, totalDurationMs, errorFindings, suitesSkipped = 0) {
    const statusText = totalErrors === 0
        ? styleText(['bold', 'green'], '🎉 ¡SUITE DE AUDITORÍA GLOBAL APROBADA!')
        : styleText(['bold', 'red'], '🚨 AUDITORÍA GLOBAL CON ERRORES CRÍTICOS');
    const skippedNote = suitesSkipped > 0 ? ` (${suitesSkipped} Omitidas)` : '';
    const durationText = styleText('dim', `Duración Total: ${totalDurationMs}ms | Suites: ${suitesPassed}/${suitesTotal} Aprobadas${skippedNote}`);
    const countsText = `Errores: ${totalErrors === 0 ? styleText('green', '0') : styleText('red', String(totalErrors))}  |  Advertencias: ${totalWarnings === 0 ? styleText('green', '0') : styleText('yellow', String(totalWarnings))}`;
    const bodyLines = [statusText, durationText, countsText];
    if (errorFindings && errorFindings.length > 0) {
        bodyLines.push(...renderSampleErrors(errorFindings));
    }
    const borderColor = totalErrors > 0 ? 'red' : (totalWarnings > 0 ? 'yellow' : 'green');
    const box = boxen(bodyLines.join('\n'), {
        borderColor,
        borderStyle: 'double',
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        width: TERMINAL_WIDTH
    });
    return `\n${box}\n`;
}
export { renderMarkdownReport } from "./markdownReport.js";
//# sourceMappingURL=unifiedTheme.js.map