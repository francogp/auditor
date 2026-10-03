/**
 * @file reportUtils.ts
 * @description Utilidades compartidas para formateo de reportes y salida de scripts de validación
 * del proyecto. Evita la duplicación de lógica de generación de archivos de reporte.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { styleText } from 'node:util';
export function printConsoleHeader(title) {
    console.log(styleText('bold', `\n--- 🛡️  ${title} ---`));
}
export const MAX_REPORT_SAMPLE_ITEMS = 30;
export function printConsoleSummary(summary, verbose = true) {
    console.log(`\n════════════════════════════════════`);
    console.log(`    ${summary.title.toUpperCase()}`);
    console.log(`════════════════════════════════════`);
    for (const [key, value] of Object.entries(summary.scannedMetrics)) {
        console.log(`📦 ${key}: ${value}`);
    }
    console.log(`════════════════════════════════════\n`);
    if (!verbose) {
        console.log(styleText('cyan', `\n[INFO] Modo resumen activo: ${summary.errors.length} errores, ${summary.warnings.length} advertencias.`));
    }
    else {
        if (summary.warnings.length) {
            console.log(styleText('yellow', `⚠️  WARNINGS (${summary.warnings.length}):`));
            const limit = MAX_REPORT_SAMPLE_ITEMS;
            summary.warnings.slice(0, limit).forEach(w => console.log(`   ${w}`));
            if (summary.warnings.length > limit) {
                console.log(styleText('cyan', `   ... y ${summary.warnings.length - limit} advertencias más (usa -o para ver todas)`));
            }
            console.log('');
        }
        if (summary.errors.length) {
            console.log(styleText('red', `❌ ERRORS (${summary.errors.length}):`));
            const limit = MAX_REPORT_SAMPLE_ITEMS;
            summary.errors.slice(0, limit).forEach(e => console.log(`   ${e}`));
            if (summary.errors.length > limit) {
                console.log(styleText('cyan', `   ... y ${summary.errors.length - limit} errores más (usa -o para ver todos)`));
            }
            console.log('\n' + styleText('red', 'Corrige estos errores para asegurar la integridad de los datos.'));
        }
        else {
            console.log(styleText('green', '✅ Todos los componentes pasaron la validación con éxito!'));
        }
    }
}
export async function writeReportFile(outputPathArg, summary) {
    const outputPath = path.resolve(process.cwd(), outputPathArg);
    const metricLines = Object.entries(summary.scannedMetrics).map(([key, val]) => `${key}: ${val}`);
    const lines = [
        `--- ${summary.title.toUpperCase()} ---`,
        ...metricLines,
        `\nErrors (${summary.errors.length}):`,
        ...summary.errors.map(e => `  - ${e}`),
        `\nWarnings (${summary.warnings.length}):`,
        ...summary.warnings.map(w => `  - ${w}`)
    ];
    await fs.writeFile(outputPath, lines.join('\n'), 'utf-8');
    console.log(styleText('cyan', `\n✨ Reporte completo escrito en: ${outputPathArg}`));
}
/**
 * Parses raw JSON output containing an array, stripping Node.js permission and runtime noise.
 */
export function parseJsonArrayOutput(input, options) {
    if (!input)
        return [];
    if (Array.isArray(input))
        return input;
    if (typeof input !== 'string')
        return [];
    const cleanedLines = input
        .split('\n')
        .filter((line) => !line.startsWith('(node:') && !line.startsWith('(Use `node') && !line.includes('SecurityWarning') && !line.startsWith('[PERM') && !line.startsWith('npm notice'));
    const trimmed = cleanedLines.join('\n').trim();
    if (!trimmed)
        return [];
    const startIdx = trimmed.indexOf('[');
    const endIdx = trimmed.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx)
        return [];
    try {
        return JSON.parse(trimmed.substring(startIdx, endIdx + 1));
    }
    catch (err) {
        if (options?.throwOnError) {
            const toolSuffix = options.toolName ? ` de ${options.toolName}` : '';
            throw new Error(`Error al procesar salida JSON${toolSuffix}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
        }
        return [];
    }
}
/**
 * Normalizes any absolute or relative path to a clean POSIX relative path from CWD.
 */
export function normalizePosixPath(filePath, cwd = process.cwd()) {
    if (!filePath)
        return '';
    const resolved = path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath;
    return resolved.split(path.sep).join(path.posix.sep);
}
/**
 * Parses raw JSON output containing an object, handling stdout strings or execSync error objects.
 */
export function parseJsonObjectOutput(input) {
    if (!input)
        return null;
    let str = '';
    if (typeof input === 'string') {
        str = input;
    }
    else if (Buffer.isBuffer(input)) {
        str = input.toString('utf-8');
    }
    else if (typeof input === 'object' && input !== null && 'stdout' in input) {
        const rawStdout = input.stdout;
        if (typeof rawStdout === 'string') {
            str = rawStdout;
        }
        else if (Buffer.isBuffer(rawStdout)) {
            str = rawStdout.toString('utf-8');
        }
    }
    const jsonStart = str.indexOf('{');
    const jsonEnd = str.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart)
        return null;
    try {
        return JSON.parse(str.substring(jsonStart, jsonEnd + 1));
    }
    catch {
        // catch-ok: Ignore parse errors on fallback
        return null;
    }
}
/**
 * Parses raw JSON output or an array of file reports from standard linters (ESLint, HTML-Validate)
 * into canonical AuditFindings, elevating both warnings and errors to severity: 'error' (Zero-Warning Policy).
 */
export function parseLintResultsToFindings(input, options) {
    const findings = [];
    if (!input)
        return findings;
    const rawList = parseJsonArrayOutput(input);
    const cwd = options.cwd || process.cwd();
    for (const fileReport of rawList) {
        const cleanFile = normalizePosixPath(fileReport.filePath || '', cwd);
        if (!fileReport.messages || fileReport.messages.length === 0)
            continue;
        for (const msg of fileReport.messages) {
            const rule = msg.ruleId || options.defaultRuleName || options.ruleId;
            const text = msg.message || options.defaultMessage || 'Lint issue';
            findings.push({
                suiteId: options.suiteId,
                suiteName: options.suiteName,
                ruleId: options.ruleId,
                ruleDescription: options.ruleDescription,
                severity: 'error',
                file: cleanFile,
                line: msg.line || 1,
                context: rule,
                message: `[${rule}] ${text}`
            });
        }
    }
    return findings;
}
//# sourceMappingURL=reportUtils.js.map