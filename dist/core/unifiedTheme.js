/**
 * scripts/lib/unifiedTheme.ts
 *
 * UNIFIED CLI & REPORT THEME ENGINE (Node.js 26+)
 * Provides the single source of truth for visual presentation, Unicode Box-Drawing,
 * fixed-width column alignment, status badges, and Markdown generation.
 */
import { styleText, stripVTControlCharacters } from 'node:util';
import path from 'node:path';
import { FAMILY_METADATA, groupResultsByFamily } from "./auditContract.js";
const TERMINAL_WIDTH = 80;
/**
 * Calculates the visual monospace terminal display width of a string,
 * correctly handling ANSI escapes, wide emojis (❌, ✅, ⚠️, ℹ️), and single-width glyphs (…).
 */
export function getVisualWidth(str) {
    const clean = stripVTControlCharacters(str);
    let width = 0;
    for (const char of clean) {
        const cp = char.codePointAt(0) ?? 0;
        if (cp === 0xfe0f || cp === 0xfe0e)
            continue;
        if ((cp >= 0x2600 && cp <= 0x27bf) ||
            cp === 0x2139 ||
            (cp >= 0x1f300 && cp <= 0x1f9ff)) {
            width += 2;
        }
        else {
            width += 1;
        }
    }
    return width;
}
export function padVisual(str, targetWidth, align = 'left') {
    const currentWidth = getVisualWidth(str);
    const diff = targetWidth - currentWidth;
    if (diff <= 0)
        return str;
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
export function truncateVisual(str, maxWidth) {
    if (getVisualWidth(str) <= maxWidth)
        return str;
    let result = '';
    const ellipsis = '…';
    const target = maxWidth - 1;
    for (const char of str) {
        if (getVisualWidth(result + char) > target)
            break;
        result += char;
    }
    return result + ellipsis;
}
function formatBoxTableRow(row, columns) {
    const cells = columns.map(c => {
        const rawVal = c.render ? c.render(row) : String(row[c.key ?? ''] ?? '');
        const truncated = truncateVisual(rawVal, c.width);
        return padVisual(truncated, c.width, c.align || 'left');
    });
    return '│ ' + cells.join(' │ ') + ' │';
}
export function renderBoxTable(columns, rows, options) {
    const lines = [];
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
    }
    else {
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
export function renderBanner(title, subtitle) {
    const line = '═'.repeat(TERMINAL_WIDTH - 4);
    const lines = [];
    lines.push(styleText('cyan', `╔═${line}═╗`));
    lines.push(styleText('cyan', `║  ${styleText(['bold', 'white'], title.padEnd(TERMINAL_WIDTH - 6))}  ║`));
    if (subtitle) {
        lines.push(styleText('cyan', `║  ${styleText('dim', subtitle.padEnd(TERMINAL_WIDTH - 6))}  ║`));
    }
    lines.push(styleText('cyan', `╚═${line}═╝`));
    return lines.join('\n');
}
/**
 * Renders a prominent 80-column Box-Drawing warning banner when the automatic
 * installation of Fallow's vector embedding model fails, notifying both human
 * developers and AI agents with the exact command to install it manually.
 */
export function renderSimilarCodeWarningBanner() {
    const line = '═'.repeat(TERMINAL_WIDTH - 4);
    const innerWidth = TERMINAL_WIDTH - 6;
    const lines = [];
    const yellow = (s) => styleText('yellow', s);
    const boldYellow = (s) => styleText(['bold', 'yellow'], s);
    const white = (s) => styleText('white', s);
    const boldWhite = (s) => styleText(['bold', 'white'], s);
    const cyan = (s) => styleText(['bold', 'cyan'], s);
    const dim = (s) => styleText('dim', s);
    lines.push(yellow(`╔═${line}═╗`));
    lines.push(yellow('║  ') + padVisual(boldYellow('⚠️  ATENCIÓN: ANÁLISIS DE CÓDIGO SIMILAR VECTORIAL NO DISPONIBLE'), innerWidth) + yellow('  ║'));
    lines.push(yellow(`╠═${line}═╣`));
    lines.push(yellow('║  ') + padVisual(white('La inicialización automática del modelo de embeddings de Fallow falló.'), innerWidth) + yellow('  ║'));
    lines.push(yellow('║  ') + padVisual(white('El sub-auditor especializado de similar-code no se pudo ejecutar.'), innerWidth) + yellow('  ║'));
    lines.push(yellow('║  ') + padVisual(dim('Esta funcionalidad requiere instalación manual en este entorno.'), innerWidth) + yellow('  ║'));
    lines.push(yellow('║  ') + padVisual('', innerWidth) + yellow('  ║'));
    lines.push(yellow('║  ') + padVisual(boldWhite('Para instalarlo manualmente, ejecuta el siguiente comando en tu terminal:'), innerWidth) + yellow('  ║'));
    lines.push(yellow('║  ') + padVisual(cyan('  👉  npx fallow similar-code setup --local --yes'), innerWidth) + yellow('  ║'));
    lines.push(yellow('║  ') + padVisual('', innerWidth) + yellow('  ║'));
    lines.push(yellow('║  ') + padVisual(dim('Nota para CI: puedes omitir esta suite en entornos remotos o GitHub Pages'), innerWidth) + yellow('  ║'));
    lines.push(yellow('║  ') + padVisual(dim('exportando la variable AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1.'), innerWidth) + yellow('  ║'));
    lines.push(yellow(`╚═${line}═╝`));
    return lines.join('\n');
}
export function renderFamilyHeader(meta) {
    const line = '─'.repeat(TERMINAL_WIDTH - 8);
    return styleText('bold', `\n${meta.icon} [FAMILIA ${meta.order}] ${meta.title}\n${styleText('dim', `  ${line}`)}`);
}
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
const DEFAULT_MAX_FINDINGS_PREVIEW = 30;
function groupFindingsByFile(findings) {
    const byFile = new Map();
    for (const rawF of findings) {
        if (!rawF)
            continue;
        const f = typeof rawF === 'string' ? { severity: 'error', message: rawF } : rawF;
        const fileKey = f.file ? path.relative(process.cwd(), f.file) : 'Global';
        if (!byFile.has(fileKey))
            byFile.set(fileKey, []);
        byFile.get(fileKey).push(f);
    }
    return byFile;
}
function formatFindingEntry(item) {
    const icon = item.severity === 'error' ? styleText('red', '❌ ERR ') : styleText('yellow', '⚠️ WARN');
    const lineNum = item.line !== undefined ? `L${item.line}`.padEnd(6) : '      ';
    const ruleTag = item.ruleId ? `[${item.ruleId}] ` : '';
    const contextSnippet = item.context ? ` (${styleText('dim', `"${item.context}"`)})` : '';
    return `    ${lineNum} ${icon} ${ruleTag}${item.message}${contextSnippet}`;
}
export function renderFindingsDetail(findings, maxLimit = DEFAULT_MAX_FINDINGS_PREVIEW) {
    if (!Array.isArray(findings) || findings.length === 0)
        return '';
    const lines = [];
    const byFile = groupFindingsByFile(findings);
    let shown = 0;
    for (const [file, items] of byFile) {
        if (shown >= maxLimit)
            break;
        lines.push(`\n  📄 ${styleText('bold', file)} (🐛 ${items.length}):`);
        for (const item of items) {
            if (shown >= maxLimit)
                break;
            shown++;
            lines.push(formatFindingEntry(item));
        }
    }
    if (findings.length > maxLimit) {
        lines.push(styleText('cyan', `\n  ... y 🐛 ${findings.length - maxLimit} más. Usa --output=<archivo> para volcado completo.`));
    }
    return lines.join('\n');
}
function formatSampleErrorLine(err, index) {
    const fileInfo = err.file ? (err.line ? `${err.file}:${err.line}` : err.file) : 'desconocido';
    const relPath = path.isAbsolute(fileInfo) ? path.relative(process.cwd(), fileInfo) : fileInfo;
    const relPosixFile = relPath.split(path.sep).join(path.posix.sep).replace(/^[\\/]+/, '') || fileInfo;
    const ruleTag = err.ruleId ? `[${err.ruleId}] ` : '';
    const contextStr = err.context ? ` ("${err.context}")` : '';
    return `    ${index + 1}. ${styleText('red', relPosixFile)}: ${ruleTag}${err.message}${contextStr}`;
}
function renderSampleErrors(errorFindings) {
    const lines = [];
    const sampleErrors = errorFindings.slice(0, 5);
    lines.push(styleText('bold', `\n  ❌ Muestra de errores detectados (primeros ${sampleErrors.length}):`));
    for (let i = 0; i < sampleErrors.length; i++) {
        lines.push(formatSampleErrorLine(sampleErrors[i], i));
    }
    if (errorFindings.length > 5) {
        lines.push(styleText('dim', `    ... y ${errorFindings.length - 5} error(es) más (ver reporte JSON completo).`));
    }
    return lines;
}
export function renderConsolidatedFooter(suitesTotal, suitesPassed, totalErrors, totalWarnings, totalDurationMs, errorFindings, suitesSkipped = 0) {
    const line = '═'.repeat(TERMINAL_WIDTH - 4);
    const lines = [];
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
function renderMarkdownFamilyTables(byFamily) {
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
            const metricStr = metricEntries.length > 0 ? `${metricEntries[0][1]} ${metricEntries[0][0]}` : '-';
            md += `| ${icon} | **${t.name}** | \`${t.durationMs}ms\` | ${metricStr} | ${t.summary.errors} | ${t.summary.warnings} |\n`;
        }
        md += '\n';
    }
    return md;
}
function renderMarkdownFindingsTable(allFindings) {
    if (allFindings.length === 0)
        return '';
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
export function renderMarkdownReport(results, suitesPassed, totalDurationMs) {
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
//# sourceMappingURL=unifiedTheme.js.map