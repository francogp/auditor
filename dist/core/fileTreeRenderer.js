/**
 * packages/auditor/src/core/fileTreeRenderer.ts
 *
 * Renders audit findings structured by file and ordered by line number
 * in a hierarchical Box-Drawing tree format.
 */
import { styleText } from 'node:util';
import path from 'node:path';
import { padVisual } from "./terminalVisuals.js";
const DEFAULT_MAX_FINDINGS_PREVIEW = 30;
const DEFAULT_MAX_FILES_TREE = 10;
export function groupFindingsByFile(findings) {
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
export function formatFindingEntry(item) {
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
function formatFileHeaderLine(fs) {
    const errorBadge = fs.errors > 0 ? styleText('red', `${fs.errors} error${fs.errors > 1 ? 'es' : ''}`) : '';
    const warnBadge = fs.warnings > 0 ? styleText('yellow', `${fs.warnings} advertencia${fs.warnings > 1 ? 's' : ''}`) : '';
    const badges = [errorBadge, warnBadge].filter(Boolean).join(', ');
    const badgeText = badges ? ` (${badges})` : ` (${fs.findings.length} incidencia${fs.findings.length > 1 ? 's' : ''})`;
    return `\n  📄 ${styleText('bold', fs.file)}${badgeText}`;
}
function formatFindingBranchLine(item, isLast) {
    const branch = isLast ? '└── ' : '├── ';
    const locLabel = item.line !== undefined ? `L${item.line}` : '[GLOBAL]';
    const locPadded = padVisual(locLabel, 8);
    const sevIcon = item.severity === 'error' ? styleText('red', '❌ ') : styleText('yellow', '⚠️  ');
    const ruleTag = item.ruleDescription
        ? `[${item.ruleDescription}] `
        : (item.ruleId ? `[${item.ruleId}] ` : '');
    const contextStr = item.context ? ` (${styleText('dim', `"${item.context}"`)})` : '';
    return `     ${styleText('dim', branch)}${styleText('cyan', locPadded)} ${sevIcon}${styleText('bold', ruleTag)}${item.message}${contextStr}`;
}
function renderSingleFileFindingsLines(fs, maxFindingsPerFile) {
    const lines = [];
    const findingsLimit = maxFindingsPerFile === 'all'
        ? fs.findings.length
        : (typeof maxFindingsPerFile === 'number' ? maxFindingsPerFile : fs.findings.length);
    const displayedFindings = fs.findings.slice(0, findingsLimit);
    for (let i = 0; i < displayedFindings.length; i++) {
        const item = displayedFindings[i];
        const isLast = (i === displayedFindings.length - 1) && (displayedFindings.length === fs.findings.length);
        lines.push(formatFindingBranchLine(item, isLast));
    }
    if (fs.findings.length > displayedFindings.length) {
        lines.push(`     ${styleText('dim', '└── ')}... y ${fs.findings.length - displayedFindings.length} incidencia(s) más en este archivo.`);
    }
    return lines;
}
/**
 * Renders audit findings structured by file and ordered by line number in a Box-Drawing tree format.
 */
export function renderFindingsByFileTree(fileSummaries, options = {}) {
    if (!fileSummaries || fileSummaries.length === 0)
        return '';
    const lines = [];
    const maxFiles = options.maxFiles === 'all'
        ? fileSummaries.length
        : (typeof options.maxFiles === 'number' ? options.maxFiles : DEFAULT_MAX_FILES_TREE);
    const displayedFiles = fileSummaries.slice(0, maxFiles);
    for (const fs of displayedFiles) {
        lines.push(formatFileHeaderLine(fs));
        lines.push(...renderSingleFileFindingsLines(fs, options.maxFindingsPerFile));
    }
    if (fileSummaries.length > displayedFiles.length) {
        lines.push(styleText('dim', `\n  ... y ${fileSummaries.length - displayedFiles.length} archivo(s) más con incidencias. Usa top=all o filtra con file=<patron>.`));
    }
    return lines.join('\n');
}
export function formatSampleErrorLine(err, index) {
    const fileInfo = err.file ? (err.line ? `${err.file}:${err.line}` : err.file) : 'desconocido';
    const relPath = path.isAbsolute(fileInfo) ? path.relative(process.cwd(), fileInfo) : fileInfo;
    const relPosixFile = relPath.split(path.sep).join(path.posix.sep).replace(/^[\\/]+/, '') || fileInfo;
    const ruleTag = err.ruleId ? `[${err.ruleId}] ` : '';
    const contextStr = err.context ? ` ("${err.context}")` : '';
    return `    ${index + 1}. ${styleText('red', relPosixFile)}: ${ruleTag}${err.message}${contextStr}`;
}
export function renderSampleErrors(errorFindings) {
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
//# sourceMappingURL=fileTreeRenderer.js.map