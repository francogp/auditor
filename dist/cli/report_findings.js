#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/report_findings.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { styleText } from 'node:util';
import { MAX_AUDIT_STALENESS_MS } from "../core/auditContract.js";
import { renderBanner, renderFindingsBreakdownTable, renderSampleFindings } from "../core/unifiedTheme.js";
const RADIX_DECIMAL = 10;
const DEFAULT_TOP_LIMIT = 20;
const DEFAULT_SAMPLE_ERROR_LIMIT = 5;
const ERROR_WEIGHT_FACTOR = 1000;
const JSON_FLAGS = new Set(['json', '--json', 'json=true']);
const SUMMARY_FLAGS = new Set(['summary', '--summary', 'summary=true']);
const FILES_FLAGS = new Set(['files', '--files', 'files=true']);
const BREAKDOWN_FLAGS = new Set(['breakdown', '--breakdown', 'breakdown=true', 'by-dir', 'dirs']);
const STALE_FLAGS = new Set(['allow-stale', '--allow-stale', 'stale']);
const PARTIAL_FLAGS = new Set(['allow-partial', '--allow-partial', 'partial']);
function parseFlagArg(arg, opts) {
    if (JSON_FLAGS.has(arg)) {
        opts.jsonOutput = true;
        return true;
    }
    if (SUMMARY_FLAGS.has(arg)) {
        opts.summaryOnly = true;
        return true;
    }
    if (FILES_FLAGS.has(arg)) {
        opts.filesOnly = true;
        return true;
    }
    if (BREAKDOWN_FLAGS.has(arg)) {
        opts.breakdown = true;
        return true;
    }
    if (STALE_FLAGS.has(arg)) {
        opts.allowStale = true;
        return true;
    }
    if (PARTIAL_FLAGS.has(arg)) {
        opts.allowPartial = true;
        return true;
    }
    return false;
}
function parseScopeArg(arg, opts) {
    if (arg === 'host' || arg === 'scope=host') {
        opts.scope = 'host';
        return true;
    }
    if (arg === 'packages' || arg === 'scope=packages' || arg === 'pkg') {
        opts.scope = 'packages';
        return true;
    }
    if (arg.startsWith('scope=')) {
        const val = arg.slice(6).toLowerCase();
        if (val === 'host' || val === 'packages' || val === 'all') {
            opts.scope = val;
        }
        return true;
    }
    return false;
}
function parseSeverityArg(arg, opts) {
    if (arg === 'errors' || arg === 'error' || arg === 'severity=error') {
        opts.severity = 'error';
        return true;
    }
    if (arg === 'warnings' || arg === 'warning' || arg === 'severity=warning') {
        opts.severity = 'warning';
        return true;
    }
    if (arg.startsWith('severity=')) {
        const val = arg.slice(9).toLowerCase();
        if (val === 'error' || val === 'warning' || val === 'all') {
            opts.severity = val;
        }
        return true;
    }
    return false;
}
function parseScopeAndSeverity(arg, opts) {
    return parseScopeArg(arg, opts) || parseSeverityArg(arg, opts);
}
function parseFilterAndValue(arg, opts) {
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
    if (arg.startsWith('file=')) {
        opts.filePattern = arg.slice(5).toLowerCase();
        return true;
    }
    if (arg.startsWith('top=')) {
        const topVal = arg.slice(4).toLowerCase();
        opts.top = topVal === 'all' || topVal === '0' ? 'all' : (parseInt(topVal, RADIX_DECIMAL) || DEFAULT_TOP_LIMIT);
        return true;
    }
    return false;
}
function parseReportOptions() {
    const argv = process.argv.slice(2);
    const opts = {
        category: 'all',
        severity: 'all',
        search: '',
        filePattern: '',
        dirPattern: '',
        scope: 'all',
        breakdown: false,
        top: DEFAULT_TOP_LIMIT,
        jsonOutput: false,
        summaryOnly: false,
        filesOnly: false,
        allowStale: false,
        allowPartial: false
    };
    for (const arg of argv) {
        if (parseFlagArg(arg, opts) || parseScopeAndSeverity(arg, opts) || parseFilterAndValue(arg, opts)) {
            continue;
        }
        if (!arg.startsWith('-')) {
            opts.category = arg.toLowerCase();
        }
    }
    return opts;
}
function loadAuditReport() {
    const reportPath = path.resolve(process.cwd(), 'scratch/audits/latest_audit.json');
    if (!fs.existsSync(reportPath)) {
        console.error('❌ No se encontró scratch/audits/latest_audit.json. Ejecuta primero "npm run audit".');
        return null;
    }
    try {
        const raw = fs.readFileSync(reportPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed.meta) {
            console.error('❌ scratch/audits/latest_audit.json no contiene la cabecera de metadatos "meta". Ejecuta "npm run audit" para regenerarlo.');
            return null;
        }
        return parsed;
    }
    catch (e) {
        console.error(`❌ Error al parsear scratch/audits/latest_audit.json: ${e.message}`);
        return null;
    }
}
function getNormalizedRelPath(filePath) {
    if (!filePath)
        return 'General';
    const rel = path.isAbsolute(filePath) ? path.relative(process.cwd(), filePath) : filePath;
    return rel.split(path.sep).join(path.posix.sep);
}
function getDirectoryBucket(filePath) {
    const rel = getNormalizedRelPath(filePath);
    if (rel === 'General')
        return 'General';
    const parts = rel.split('/');
    return parts.length > 1 ? `${parts[0]}/` : rel;
}
function sortFindingsEntries(entries) {
    return entries.sort((a, b) => {
        const totalB = b[1].errors * ERROR_WEIGHT_FACTOR + b[1].warnings;
        const totalA = a[1].errors * ERROR_WEIGHT_FACTOR + a[1].warnings;
        return totalB - totalA;
    });
}
function aggregateAndSortFindings(findings, keyExtractor) {
    const map = {};
    for (const f of findings) {
        const key = keyExtractor(f);
        if (!map[key]) {
            map[key] = { errors: 0, warnings: 0 };
        }
        if (f.severity === 'error') {
            map[key].errors++;
        }
        else {
            map[key].warnings++;
        }
    }
    return sortFindingsEntries(Object.entries(map));
}
function validateReportFreshnessAndScope(report, args) {
    try {
        const auditInstant = Temporal.Instant.from(report.meta.timestamp);
        const now = Temporal.Now.instant();
        const elapsedMs = now.since(auditInstant).total({ unit: 'millisecond' });
        if (!args.allowStale && elapsedMs > MAX_AUDIT_STALENESS_MS) {
            const elapsedMins = Math.max(1, Math.round(now.since(auditInstant).total({ unit: 'minute' })));
            const limitMins = Math.round(MAX_AUDIT_STALENESS_MS / (60 * 1000));
            console.error(styleText('red', `❌ scratch/audits/latest_audit.json está OBSOLETO (${elapsedMins} minutos de antigüedad, límite: ${limitMins} min).\n`) +
                styleText('yellow', `   El código fuente pudo haber cambiado desde la última auditoría.\n`) +
                styleText('cyan', `👉 DEBES ejecutar 'npm run audit' para regenerar y validar el reporte.`));
            process.exit(1);
        }
    }
    catch (err) {
        if (err.message.includes('OBSOLETO'))
            throw err;
        console.error(styleText('red', `❌ scratch/audits/latest_audit.json contiene un timestamp inválido ('${report.meta.timestamp}').\n`) +
            styleText('cyan', `👉 DEBES ejecutar 'npm run audit' para regenerar y validar el reporte.`));
        process.exit(1);
    }
    if (report.meta.isFullAudit)
        return;
    if (!args.allowPartial) {
        if (args.category === 'all') {
            console.error(styleText('red', `❌ scratch/audits/latest_audit.json proviene de una auditoría PARCIAL (${report.meta.runMode}, ${report.meta.executedSuiteCount}/${report.meta.totalDiscoveredSuites} suites ejecutadas).\n`) +
                styleText('yellow', `   No es posible emitir reportes globales de hallazgos sobre una corrida parcial.\n`) +
                styleText('cyan', `👉 DEBES ejecutar 'npm run audit' (completo) o agregar 'partial' para inspeccionar esta corrida.`));
            process.exit(1);
        }
        const matchesExecutedSuite = report.meta.executedSuites.some((s) => s.toLowerCase().includes(args.category.toLowerCase()) ||
            args.category.toLowerCase().includes(s.toLowerCase()));
        const matchesExecutedFinding = Object.values(report.families).some(fam => {
            if (!fam)
                return false;
            return fam.suites.some(suite => suite.findings.some(f => {
                const catKey = f.ruleDescription || suite.description || f.ruleId || suite.name || '';
                return catKey.toLowerCase().includes(args.category.toLowerCase());
            }));
        });
        if (!matchesExecutedSuite && !matchesExecutedFinding) {
            console.error(styleText('red', `❌ La categoría solicitada ('${args.category}') NO fue auditada en la última corrida parcial.\n`) +
                styleText('yellow', `   Suites ejecutadas en esta corrida: ${report.meta.executedSuites.join(', ')}\n`) +
                styleText('yellow', `   Suites omitidas: ${report.meta.omittedSuites.length} suites.\n`) +
                styleText('cyan', `👉 DEBES ejecutar 'npm run audit' (completo) o 'npm run audit task=${args.category}' primero.`));
            process.exit(1);
        }
    }
    else {
        console.log(styleText('yellow', `⚠️  MODO PARCIAL: Inspeccionando resultados de corrida parcial (${report.meta.executedSuiteCount}/${report.meta.totalDiscoveredSuites} suites: ${report.meta.executedSuites.join(', ')}).\n`));
    }
}
function recordFindingInCategory(finding, suiteDesc, categoryCounts) {
    const catKey = finding.ruleDescription || suiteDesc || finding.ruleId || 'Sin Categoría';
    const entry = categoryCounts[catKey] ?? (categoryCounts[catKey] = { errors: 0, warnings: 0, findings: [] });
    if (finding.severity === 'error') {
        entry.errors++;
    }
    else {
        entry.warnings++;
    }
    entry.findings.push(finding);
}
function collectReportCategoryCounts(report) {
    const categoryCounts = {};
    const allFindings = [];
    for (const fam of Object.values(report.families)) {
        if (!fam)
            continue;
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
function matchesPathFilters(f, args) {
    const relPath = getNormalizedRelPath(f.file);
    if (args.scope === 'host' && relPath.startsWith('packages/'))
        return false;
    if (args.scope === 'packages' && !relPath.startsWith('packages/'))
        return false;
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
function matchesSearchFilter(f, catKey, search) {
    const inMsg = f.message.toLowerCase().includes(search);
    const inFile = f.file ? f.file.toLowerCase().includes(search) : false;
    const inRule = (f.ruleId && f.ruleId.toLowerCase().includes(search)) ||
        (f.ruleDescription && f.ruleDescription.toLowerCase().includes(search)) ||
        catKey.toLowerCase().includes(search);
    return inMsg || inFile || Boolean(inRule);
}
function checkFindingMatchesFilter(f, catKey, args) {
    if (args.category !== 'all') {
        const cleanArg = args.category.replace(/[-_]/g, ' ').toLowerCase();
        const cleanCat = catKey.replace(/[-_]/g, ' ').toLowerCase();
        if (!cleanCat.includes(cleanArg))
            return false;
    }
    if (args.severity !== 'all' && f.severity !== args.severity)
        return false;
    if (!matchesPathFilters(f, args))
        return false;
    if (args.search && !matchesSearchFilter(f, catKey, args.search))
        return false;
    return true;
}
function filterMatchingFindings(categoryCounts, args) {
    const filteredCategories = {};
    const matchingFindings = [];
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
function renderFindingsJson(matchingFindings, filteredCategories, report, args) {
    const fileMap = {};
    const dirMap = {};
    for (const f of matchingFindings) {
        const relPath = getNormalizedRelPath(f.file);
        const bucket = getDirectoryBucket(f.file);
        if (!fileMap[relPath])
            fileMap[relPath] = { errors: 0, warnings: 0 };
        if (!dirMap[bucket])
            dirMap[bucket] = { errors: 0, warnings: 0 };
        if (f.severity === 'error') {
            fileMap[relPath].errors++;
            dirMap[bucket].errors++;
        }
        else {
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
function renderCategoryDetailSample(target, categoryArg, sortedCategories, args) {
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
            if (f.context)
                console.log(`     Contexto: ${f.context}`);
        });
        console.log('');
    }
    else {
        console.log(`\n⚠️  No se encontraron hallazgos para la categoría "${categoryArg}". Categorías disponibles:`);
        sortedCategories.forEach(([name]) => console.log(`  • ${name}`));
        console.log('');
    }
}
function renderFilteredDetailSample(matchingFindings, args) {
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
function renderFindingsDetailSample(matchingFindings, sortedCategories, allFindings, args) {
    if (args.category !== 'all') {
        const cleanArg = args.category.replace(/[-_]/g, ' ').toLowerCase();
        const target = sortedCategories.find(([name]) => name.toLowerCase().replace(/[-_]/g, ' ').includes(cleanArg));
        renderCategoryDetailSample(target, args.category, sortedCategories, args);
    }
    else if (args.search || args.filePattern || args.dirPattern || args.scope !== 'all' || args.severity !== 'all') {
        renderFilteredDetailSample(matchingFindings, args);
    }
    else {
        const allErrors = allFindings.filter(f => f.severity === 'error');
        if (allErrors.length > 0) {
            const limit = args.top === 'all' ? allErrors.length : (typeof args.top === 'number' ? args.top : DEFAULT_SAMPLE_ERROR_LIMIT);
            console.log(renderSampleFindings(allErrors, limit));
        }
    }
}
function renderBreakdownView(matchingFindings, args) {
    const sortedDirs = aggregateAndSortFindings(matchingFindings, f => getDirectoryBucket(f.file));
    const bannerTitle = args.category !== 'all'
        ? `DISTRIBUCIÓN POR DIRECTORIO (${args.category})`
        : 'DISTRIBUCIÓN POR DIRECTORIO / ÁMBITO';
    console.log('\n' + renderBanner(bannerTitle, `Total hallazgos: ${matchingFindings.length} | Directorios afectados: ${sortedDirs.length}`));
    console.log('\n' + renderFindingsBreakdownTable(sortedDirs, 'DIRECTORIO / ÁMBITO') + '\n');
}
function renderFilesOnlyView(matchingFindings, report, args) {
    const sortedFiles = aggregateAndSortFindings(matchingFindings, f => getNormalizedRelPath(f.file));
    const filesToDisplay = args.top === 'all' ? sortedFiles : sortedFiles.slice(0, args.top);
    const bannerTitle = args.category !== 'all'
        ? `ARCHIVOS CON HALLAZGOS (${args.category})`
        : 'ARCHIVOS CON HALLAZGOS DE AUDITORÍA';
    console.log('\n' + renderBanner(bannerTitle, `Estado: ${report.status === 'passed' ? 'PASSED' : 'FAILED'} | Archivos afectados: ${sortedFiles.length}`));
    console.log('\n' + renderFindingsBreakdownTable(filesToDisplay, 'ARCHIVO AFECTADO') + '\n');
}
export function runReport() {
    const args = parseReportOptions();
    const report = loadAuditReport();
    if (!report)
        process.exit(1);
    validateReportFreshnessAndScope(report, args);
    const { categoryCounts, allFindings } = collectReportCategoryCounts(report);
    const { filteredCategories, matchingFindings } = filterMatchingFindings(categoryCounts, args);
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
    console.log('\n' + renderBanner('REPORTE CONSOLIDADO DE ADVERTENCIAS Y ERRORES', `Estado: ${report.status === 'passed' ? 'PASSED' : 'FAILED'} | Suites: ${report.summary.suitesPassed}/${report.summary.suitesTotal}`));
    const categoriesToRender = (args.category !== 'all' || args.severity !== 'all' || args.search || args.filePattern || args.dirPattern || args.scope !== 'all')
        ? filteredCategories
        : categoryCounts;
    const sortedCategories = sortFindingsEntries(Object.entries(categoriesToRender));
    console.log('\n' + renderFindingsBreakdownTable(sortedCategories, 'CATEGORÍA / REGLA DE AUDITORÍA') + '\n');
    if (args.summaryOnly)
        return;
    renderFindingsDetailSample(matchingFindings, sortedCategories, allFindings, args);
}
runReport();
//# sourceMappingURL=report_findings.js.map