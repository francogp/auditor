#!/usr/bin/env -S node --experimental-strip-types
/**
 * packages/auditor/src/cli/report_similar_code.ts
 *
 * CLI TOOL: REPORTE DE SIMILITUD SEMÁNTICA (Fallow Similar-Code)
 *
 * Generates an 80-column Box-Drawing report of semantically similar functions
 * detected via local vector embeddings.
 */
import { parseArgs, styleText } from 'node:util';
import { execSync } from 'node:child_process';
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { getAuditConfig } from "../core/auditConfig.js";
import { isMainModule } from "./cliUtils.js";
import { resolveFallowBinary, checkOrInitializeModel } from "../suites/architecture/validate_similar_code.js";
export function runSimilarCodeReport(projectRoot = process.cwd()) {
    const config = getAuditConfig(projectRoot);
    const fallowCfg = config.fallow?.similarCode;
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            threshold: { type: 'string', default: String(fallowCfg?.threshold ?? 0.95) },
            'min-lines': { type: 'string', default: String(fallowCfg?.minLines ?? 3) },
            'include-same-file': { type: 'boolean', default: false },
            json: { type: 'boolean', default: false }
        },
        strict: false,
        allowPositionals: true
    });
    const threshold = parseFloat(String(values.threshold || '0.95'));
    const minLines = parseInt(String(values['min-lines'] || '3'), 10);
    const ignoreSameFile = !values['include-same-file'];
    const isJson = Boolean(values.json);
    const fallowBin = resolveFallowBinary(projectRoot);
    if (!fallowBin) {
        console.error(styleText('red', '❌ No se encontró el binario de Fallow en node_modules.'));
        process.exit(1);
    }
    const modelReady = checkOrInitializeModel(fallowBin, projectRoot);
    if (!modelReady) {
        console.error(styleText('red', '❌ El modelo de embeddings para similar-code no está disponible.'));
        process.exit(1);
    }
    if (!isJson) {
        renderBanner('REPORTE DE SIMILITUD SEMÁNTICA (FALLOW SIMILAR-CODE)', 'Embeddings vectoriales de funciones');
        console.log(styleText('dim', `🔍 Analizando similitud (Umbral: ${(threshold * 100).toFixed(0)}%, Min-Lines: ${minLines}, Excluir mismo archivo: ${ignoreSameFile ? 'Sí' : 'No'})...\n`));
    }
    let candidates = [];
    try {
        const cmd = `node "${fallowBin}" similar-code --format json --threshold ${threshold} --min-lines ${minLines}`;
        const stdout = execSync(cmd, {
            cwd: projectRoot,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            maxBuffer: 50 * 1024 * 1024,
            timeout: 180000
        });
        const jsonStart = stdout.indexOf('{');
        if (jsonStart !== -1) {
            const parsed = JSON.parse(stdout.substring(jsonStart));
            candidates = parsed.candidates ?? [];
        }
    }
    catch (err) {
        console.error(styleText('red', `❌ Error al ejecutar fallow similar-code: ${err.message}`));
        process.exit(1);
    }
    if (ignoreSameFile) {
        candidates = candidates.filter(c => {
            const leftPath = (c.left?.path || '').replace(/\\/g, '/');
            const rightPath = (c.right?.path || '').replace(/\\/g, '/');
            return leftPath !== rightPath;
        });
    }
    if (isJson) {
        console.log(JSON.stringify(candidates, null, 2));
        return;
    }
    if (candidates.length === 0) {
        console.log(styleText('green', `✨ No se detectaron duplicados semánticos de código con umbral >= ${(threshold * 100).toFixed(0)}%.\n`));
        return;
    }
    console.log(`🔥 CANDIDATOS DETECTADOS (${candidates.length} pares):\n`);
    const cols = [
        { header: '#', width: 2, align: 'center', key: 'index' },
        { header: 'SIMIL.', width: 7, align: 'right', key: 'similarity' },
        { header: 'FUNCIÓN A', width: 16, align: 'left', key: 'funcA' },
        { header: 'FUNCIÓN B', width: 16, align: 'left', key: 'funcB' },
        { header: 'UBICACIÓN ARCHIVOS', width: 20, align: 'left', key: 'location' }
    ];
    const rows = candidates.map((c, idx) => {
        const pct = `${(c.similarity * 100).toFixed(1)}%`;
        const simFormatted = c.similarity >= 0.95 ? styleText('red', pct) : styleText('yellow', pct);
        const leftFile = c.left.path.split('/').pop() || c.left.path;
        const rightFile = c.right.path.split('/').pop() || c.right.path;
        const loc = `${leftFile}:${c.left.start_line} ~ ${rightFile}:${c.right.start_line}`;
        return {
            index: String(idx + 1),
            similarity: simFormatted,
            funcA: c.left.name.length > 16 ? c.left.name.slice(0, 15) + '…' : c.left.name,
            funcB: c.right.name.length > 16 ? c.right.name.slice(0, 15) + '…' : c.right.name,
            location: loc.length > 20 ? loc.slice(0, 19) + '…' : loc
        };
    });
    console.log(renderBoxTable(cols, rows));
    console.log(`\n💡 Total de pares semánticos detectados: ${candidates.length}\n`);
}
if (isMainModule(import.meta.url)) {
    runSimilarCodeReport();
}
//# sourceMappingURL=report_similar_code.js.map