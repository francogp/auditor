#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/report_flags.ts
 *
 * CLI TOOL: GOBERNANZA DE FEATURE FLAGS (Fallow Flags)
 *
 * Analyzes feature flag usage patterns, branches, single-read sites,
 * and identifies retirement candidates.
 */
import { parseArgs, styleText } from 'node:util';
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { isMainModule, executeFallowJsonCommand } from "./cliUtils.js";
import { resolveFallowBinary } from "../suites/architecture/validate_similar_code.js";
const RADIX_DECIMAL = 10;
const DEFAULT_TOP_LIMIT = 20;
function formatRetirementReason(reason) {
    switch (reason) {
        case 'single-read-site':
            return 'Leída en un solo sitio';
        case 'empty-branch':
            return 'Rama vacía';
        case 'literal-constant':
            return 'Constante literal';
        case 'defined-never-read':
            return 'Definida pero nunca leída';
        case 'identical-branches':
            return 'Ramas idénticas';
        case 'guards-dead-code':
            return 'Protege código muerto';
        case 'fully-rolled-out':
            return 'Completamente desplegada';
        default:
            return reason;
    }
}
function renderRetirementFlagsView(parsed, topLimit = DEFAULT_TOP_LIMIT) {
    const candidates = parsed?.retirement?.flags ?? [];
    const displayed = candidates.slice(0, topLimit);
    if (displayed.length === 0) {
        console.log('\n  ' + styleText(['bold', 'green'], '✨ ¡Excelente! No se detectaron feature flags candidatas a retiro.\n'));
        return;
    }
    console.log(`  Candidatas a retiro: ${styleText('yellow', String(candidates.length))}\n`);
    const tableRows = displayed.map((item) => {
        const ageStr = item.age_days !== undefined ? `${item.age_days}d` : styleText('dim', 'n/d');
        const sitesStr = item.read_sites !== undefined ? String(item.read_sites) : styleText('dim', '0');
        const reasonsList = (item.reasons ?? []).map(formatRetirementReason);
        const reasonsStr = reasonsList.length > 0 ? reasonsList.join(', ') : styleText('dim', 'ninguno');
        return {
            name: styleText('cyan', item.name),
            age: ageStr,
            sites: sitesStr,
            reasons: reasonsStr
        };
    });
    const columns = [
        { header: 'FEATURE FLAG', width: 30, align: 'left', key: 'name' },
        { header: 'EDAD', width: 8, align: 'right', key: 'age' },
        { header: 'LECTURAS', width: 10, align: 'right', key: 'sites' },
        { header: 'MOTIVO DE RETIRO RECOMENDADO', width: 44, align: 'left', key: 'reasons' }
    ];
    console.log(renderBoxTable(columns, tableRows));
    console.log();
}
function renderActiveFlagsView(parsed, topLimit = DEFAULT_TOP_LIMIT) {
    const flags = parsed?.feature_flags ?? [];
    if (flags.length === 0) {
        console.log('\n  ' + styleText('dim', 'No se encontraron feature flags configuradas en este proyecto.\n'));
        return;
    }
    const tableRows = flags.slice(0, topLimit).map((f) => ({
        name: styleText('cyan', f.name ?? 'desconocida'),
        sites: String(f.read_sites ?? 0)
    }));
    const columns = [
        { header: 'FEATURE FLAG', width: 40, align: 'left', key: 'name' },
        { header: 'SITIOS DE LECTURA', width: 20, align: 'right', key: 'sites' }
    ];
    console.log('\n' + renderBoxTable(columns, tableRows));
    console.log(styleText('dim', '  💡 Tip: Ejecuta auditor-flags --retirement para ver recomendaciones de retiro.\n'));
}
export function runFlagsReport(projectRoot = process.cwd(), options = {}) {
    const fallowBin = resolveFallowBinary(projectRoot);
    if (!fallowBin) {
        console.error(styleText('red', '❌ No se encontró el binario de Fallow en node_modules.'));
        return 1;
    }
    const runArgs = ['flags', '--format', 'json'];
    if (options.retirement) {
        runArgs.push('--retirement');
    }
    const { parsed, status, rawOutput } = executeFallowJsonCommand(fallowBin, runArgs, projectRoot);
    if (options.json) {
        console.log(parsed ? JSON.stringify(parsed, null, 2) : JSON.stringify({ error: 'Fallow flags execution failed', raw: rawOutput }));
        return status;
    }
    const isRetirement = Boolean(options.retirement);
    const subtitle = isRetirement
        ? 'Análisis de retiro de flags obsoletas o redundantes'
        : 'Detección y uso de feature flags';
    console.log('\n' + renderBanner('GOBERNANZA DE FEATURE FLAGS (FALLOW FLAGS)', subtitle));
    const totalFlags = parsed?.total_flags ?? parsed?.feature_flags?.length ?? 0;
    console.log(`  Total de feature flags detectadas: ${styleText('bold', String(totalFlags))}`);
    if (isRetirement) {
        renderRetirementFlagsView(parsed, options.top);
    }
    else {
        renderActiveFlagsView(parsed, options.top);
    }
    return status;
}
if (isMainModule(import.meta.url)) {
    const { values, positionals } = parseArgs({
        args: process.argv.slice(2),
        options: {
            retirement: { type: 'boolean', default: false },
            top: { type: 'string', default: '20' },
            json: { type: 'boolean', default: false }
        },
        strict: false,
        allowPositionals: true
    });
    let retirement = Boolean(values.retirement);
    let top = parseInt(values.top, RADIX_DECIMAL) || DEFAULT_TOP_LIMIT;
    let jsonOutput = Boolean(values.json);
    for (const pos of positionals) {
        if (pos === 'retirement')
            retirement = true;
        if (pos.startsWith('top=')) {
            const raw = pos.split('=')[1];
            top = raw === 'all' ? Number.MAX_SAFE_INTEGER : (parseInt(raw || '20', RADIX_DECIMAL) || DEFAULT_TOP_LIMIT);
        }
        if (pos === 'json')
            jsonOutput = true;
    }
    const exitCode = runFlagsReport(process.cwd(), {
        retirement,
        top,
        json: jsonOutput
    });
    process.exit(exitCode);
}
//# sourceMappingURL=report_flags.js.map