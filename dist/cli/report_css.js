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
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { getAuditConfig } from "../core/auditConfig.js";
import { CANONICAL_IGNORE_DIRS } from "../core/auditorBase.js";
import { isMainModule } from "./cliUtils.js";
import { runCssAnalysis } from "../analyzers/cssAnalyzer.js";
export async function runCssReport(projectRoot = process.cwd()) {
    const config = getAuditConfig(projectRoot);
    const cfg = config.styles?.duplicates;
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            category: { type: 'string', default: 'all' },
            'sim-threshold': { type: 'string', default: String(cfg?.similarityThreshold ?? 80) },
            'min-decls': { type: 'string', default: String(cfg?.minDeclarations ?? 2) },
            'min-length': { type: 'string', default: String(cfg?.longLineLengthThreshold ?? 20) },
            json: { type: 'boolean', default: false },
            'errors-only': { type: 'boolean', default: false }
        },
        strict: false,
        allowPositionals: true
    });
    const category = String(values.category || 'all').toLowerCase();
    const isJson = Boolean(values.json);
    const errorsOnly = Boolean(values['errors-only']);
    const similarityThreshold = parseInt(String(values['sim-threshold'] || '80'), 10);
    const minDeclarations = parseInt(String(values['min-decls'] || '2'), 10);
    const longLineLengthThreshold = parseInt(String(values['min-length'] || '20'), 10);
    const options = {
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
    const { violations, details, filesScanned } = await runCssAnalysis('.', new Set(CANONICAL_IGNORE_DIRS), options, projectRoot);
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
    console.log(styleText('dim', `🔍 Analizados ${filesScanned} archivos en ${durationMs}ms (Categoría: ${category}, MinDecls: ${minDeclarations}, SimThreshold: ${similarityThreshold}%)\n`));
    const rows = [];
    let rowIdx = 1;
    if (category === 'all' || category === 'duplicates') {
        for (const dup of details.duplicates) {
            const first = dup.occurrences[0];
            const loc = `${first.file.split('/').pop()}:${first.line}`;
            rows.push({
                index: String(rowIdx++),
                category: styleText('red', 'DUPLICADO'),
                item: dup.signature.length > 25 ? dup.signature.slice(0, 24) + '…' : dup.signature,
                count: `${dup.occurrences.length} lugares`,
                location: loc.length > 22 ? loc.slice(0, 21) + '…' : loc
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
                location: loc.length > 22 ? loc.slice(0, 21) + '…' : loc
            });
        }
    }
    if (category === 'all' || category === 'colors') {
        for (const c of details.unvariabledColors) {
            const first = c.occurrences[0];
            const loc = `${first.file.split('/').pop()}:${first.line}`;
            rows.push({
                index: String(rowIdx++),
                category: styleText('cyan', 'COLOR RAW'),
                item: c.color,
                count: `${c.occurrences.length} reglas`,
                location: loc.length > 22 ? loc.slice(0, 21) + '…' : loc
            });
        }
    }
    if (category === 'all' || category === 'long-lines') {
        for (const lv of details.longValues) {
            const first = lv.occurrences[0];
            const loc = `${first.file.split('/').pop()}:${first.line}`;
            rows.push({
                index: String(rowIdx++),
                category: styleText('magenta', 'VALOR LARGO'),
                item: lv.value.length > 25 ? lv.value.slice(0, 24) + '…' : lv.value,
                count: `${lv.occurrences.length} lugares`,
                location: loc.length > 22 ? loc.slice(0, 21) + '…' : loc
            });
        }
    }
    if (category === 'all' || category === 'selectors') {
        for (const ds of details.duplicateSelectors) {
            const loc = `${ds.file.split('/').pop()}:${ds.lines[0]}`;
            rows.push({
                index: String(rowIdx++),
                category: styleText('red', 'SELECTOR DUP'),
                item: ds.selector.length > 25 ? ds.selector.slice(0, 24) + '…' : ds.selector,
                count: `${ds.lines.length} veces`,
                location: loc.length > 22 ? loc.slice(0, 21) + '…' : loc
            });
        }
    }
    if (category === 'all' || category === 'empty') {
        for (const er of details.emptyRules) {
            const loc = `${er.file.split('/').pop()}:${er.line}`;
            rows.push({
                index: String(rowIdx++),
                category: styleText('gray', 'REGLA VACÍA'),
                item: er.selector.length > 25 ? er.selector.slice(0, 24) + '…' : er.selector,
                count: '0 props',
                location: loc.length > 22 ? loc.slice(0, 21) + '…' : loc
            });
        }
    }
    if (rows.length === 0) {
        console.log(styleText('green', '✨ No se detectaron problemas ni duplicados de estilos CSS/SCSS.\n'));
        return;
    }
    const cols = [
        { header: '#', width: 3, align: 'center', key: 'index' },
        { header: 'CATEGORÍA', width: 14, align: 'left', key: 'category' },
        { header: 'PATRÓN / ELEMENTO', width: 26, align: 'left', key: 'item' },
        { header: 'DETALLE', width: 12, align: 'right', key: 'count' },
        { header: 'UBICACIÓN', width: 22, align: 'left', key: 'location' }
    ];
    console.log(renderBoxTable(cols, rows));
    console.log(`\n💡 Total de incidencias detectadas en categoría '${category}': ${rows.length}\n`);
}
if (isMainModule(import.meta.url)) {
    await runCssReport();
}
//# sourceMappingURL=report_css.js.map