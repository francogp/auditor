#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/report_complexity.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { parseArgs, styleText } from 'node:util';
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { getAuditConfig } from "../core/auditConfig.js";
import { parseJsonObjectOutput } from "../core/reportUtils.js";
import { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES } from "./cliUtils.js";
export const MAX_FUNCTION_NAME_CHARS = 18;
export const MAX_RECOMMENDED_LOC = 60;
export const MAX_RECOMMENDED_COGNITIVE = 20;
export const MAX_RECOMMENDED_CYCLOMATIC = 25;
export const MAX_FILE_PATH_DISPLAY_LENGTH = 27;
export const FILE_PATH_TAIL_CHARS = 24;
export const MAX_RECOMMENDATION_CHARS = 48;
function extractLayerFromPath(relPath) {
    const config = getAuditConfig();
    const codeRoots = config.paths?.codeRoots ?? ['src', 'scripts'];
    for (const root of codeRoots) {
        const cleanRoot = root.replace(/^\/+|\/+$/g, '') + '/';
        if (relPath.startsWith(cleanRoot)) {
            const rest = relPath.slice(cleanRoot.length);
            const subSegments = rest.split('/');
            return subSegments[0] || 'root';
        }
    }
    const segments = relPath.split('/');
    return (segments.length > 1 && segments[0]) ? segments[0] : 'root';
}
const DEFAULT_TOP_LIMIT = 20;
const RADIX_DECIMAL = 10;
function parseCommandLineArgs() {
    const rawCliArgs = process.argv.slice(2);
    const normalizedCliArgs = rawCliArgs.map(cliParam => {
        if (cliParam.includes('=') && !cliParam.startsWith('-'))
            return `--${cliParam}`;
        return cliParam;
    });
    const { values } = parseArgs({
        args: normalizedCliArgs,
        options: {
            top: { type: 'string', default: '20' },
            layer: { type: 'string' },
            json: { type: 'boolean', default: false }
        },
        strict: false,
        allowPositionals: true
    });
    return {
        top: parseInt(values.top, RADIX_DECIMAL) || DEFAULT_TOP_LIMIT,
        layerFilter: values.layer,
        jsonOutput: Boolean(values.json)
    };
}
function runFallowHealth() {
    try {
        const candidates = [
            path.resolve(process.cwd(), 'node_modules/fallow/bin/fallow'),
            path.resolve(import.meta.dirname, '../../node_modules/fallow/bin/fallow'),
            path.resolve(import.meta.dirname, '../../../node_modules/fallow/bin/fallow')
        ];
        const fallowBin = candidates.find(c => fs.existsSync(c)) || candidates[0];
        if (!fs.existsSync(fallowBin))
            return {};
        const cmd = `node "${fallowBin}" health --format json`;
        const stdout = execSync(cmd, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
        });
        return parseJsonObjectOutput(stdout) ?? {};
    }
    catch (e) {
        return parseJsonObjectOutput(e) ?? {};
    }
}
function ingestLargeFunctions(rawLarge, findingsMap) {
    if (!rawLarge)
        return;
    for (const lf of rawLarge) {
        const filePath = lf.path ?? '';
        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const layer = extractLayerFromPath(relPath);
        const key = `${relPath}:${lf.line}:${lf.name}`;
        findingsMap.set(key, {
            name: lf.name || '<anónima>',
            file: relPath,
            line: lf.line || 1,
            lines: lf.line_count || 0,
            cog: 0,
            cyc: 0,
            total: 0,
            exceeded: 'lines',
            layer
        });
    }
}
function ingestComplexityFindings(rawFindings, findingsMap) {
    if (!rawFindings)
        return;
    for (const f of rawFindings) {
        const filePath = f.path ?? '';
        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const layer = extractLayerFromPath(relPath);
        const cog = f.cognitive || 0;
        const cyc = f.cyclomatic || 0;
        const lines = f.line_count || 0;
        const key = `${relPath}:${f.line}:${f.name}`;
        const existing = findingsMap.get(key);
        if (existing) {
            existing.cog = cog;
            existing.cyc = cyc;
            existing.total = cog + cyc;
            if (lines > 0)
                existing.lines = lines;
            existing.exceeded = 'both';
        }
        else {
            findingsMap.set(key, {
                name: f.name || '<anónima>',
                file: relPath,
                line: f.line || 1,
                lines,
                cog,
                cyc,
                total: cog + cyc,
                exceeded: f.exceeded || 'complexity',
                layer
            });
        }
    }
}
function parseAuditFindingContext(context) {
    const match = (context || '').match(/^([^\s(]+)\s*\(cog:\s*(\d+),\s*cyc:\s*(\d+),\s*(\d+)\s*lines\)/);
    return {
        name: match?.[1] || '<función>',
        cog: match?.[2] ? parseInt(match[2], RADIX_DECIMAL) : 0,
        cyc: match?.[3] ? parseInt(match[3], RADIX_DECIMAL) : 0,
        lines: match?.[4] ? parseInt(match[4], RADIX_DECIMAL) : 0
    };
}
function ingestFallbackAuditFindings(findingsMap) {
    if (findingsMap.size > 0)
        return;
    const latestPath = path.resolve(process.cwd(), 'scratch/audits/latest_audit.json');
    if (!fs.existsSync(latestPath))
        return;
    try {
        const auditData = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
        const compFindings = (auditData.allFindings || []).filter((f) => f.ruleId === 'fallow-complexity');
        for (const cf of compFindings) {
            const filePath = cf.file || '';
            const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
            const layer = extractLayerFromPath(relPath);
            const line = cf.line || 1;
            const { name, cog, cyc, lines } = parseAuditFindingContext(cf.context);
            const key = `${relPath}:${line}:${name}`;
            findingsMap.set(key, {
                name,
                file: relPath,
                line,
                lines,
                cog,
                cyc,
                total: cog + cyc,
                exceeded: 'complexity',
                layer
            });
        }
    }
    catch {
        // catch-ok: Ignore parse errors on audit fallback
    }
}
function sortComplexityFindings(findings) {
    return findings.sort((a, b) => {
        if (a.total > 0 && b.total === 0)
            return -1;
        if (a.total === 0 && b.total > 0)
            return 1;
        if (b.lines !== a.lines)
            return b.lines - a.lines;
        return b.total - a.total;
    });
}
function loadComplexityFindings() {
    const healthData = runFallowHealth();
    const findingsMap = new Map();
    ingestLargeFunctions(healthData.large_functions, findingsMap);
    ingestComplexityFindings(healthData.findings, findingsMap);
    ingestFallbackAuditFindings(findingsMap);
    const findings = sortComplexityFindings(Array.from(findingsMap.values()));
    return {
        findings,
        targets: healthData.targets || [],
        maintainability: healthData.summary?.average_maintainability ?? healthData.summary?.maintainability_index ?? 0
    };
}
function renderBoxReport(findings, targets, maintainability, topLimit, layerFilter) {
    const filtered = layerFilter
        ? findings.filter(f => f.layer.toLowerCase() === layerFilter.toLowerCase())
        : findings;
    const subtitle = maintainability > 0
        ? `Funciones fuera de umbral: ${findings.length} · Índice de mantenibilidad: ${maintainability.toFixed(1)}`
        : `Funciones fuera de umbral: ${findings.length}`;
    console.log('\n' + renderBanner('COMPLEJIDAD CICLOMÁTICA, COGNITIVA Y TAMAÑO DE FUNCIONES (FALLOW)', subtitle));
    const distribution = {};
    for (const f of findings) {
        distribution[f.layer] = (distribution[f.layer] || 0) + 1;
    }
    console.log('\n📁 DISTRIBUCIÓN POR CAPA / DIRECTORIO:\n');
    const layerCols = [
        { header: 'CAPA DE ARQUITECTURA', width: 45, align: 'left', key: 'layer' },
        { header: 'FUNCIONES', width: 11, align: 'right', key: 'count' },
        { header: '%' + ' TOTAL', width: 10, align: 'right', key: 'percentage' }
    ];
    const layerRows = Object.entries(distribution)
        .sort((a, b) => b[1] - a[1])
        .map(([layer, count]) => {
        const pct = ((count / findings.length) * 100).toFixed(1) + '%';
        return {
            layer,
            count: String(count),
            percentage: pct
        };
    });
    console.log(renderBoxTable(layerCols, layerRows));
    console.log(`\n🔥 TOP ${Math.min(topLimit, filtered.length)} HOTSPOTS (LÍNEAS Y COMPLEJIDAD) ${layerFilter ? `(Filtro: ${layerFilter})` : ''}:\n`);
    const hotspotCols = [
        { header: '#', width: 3, align: 'center', key: 'index' },
        { header: 'FUNCIÓN', width: 18, align: 'left', key: 'name' },
        { header: 'LÍNEAS', width: 7, align: 'right', key: 'lines' },
        { header: 'COG', width: 5, align: 'right', key: 'cog' },
        { header: 'CYC', width: 5, align: 'right', key: 'cyc' },
        { header: 'ARCHIVO:LÍNEA', width: 32, align: 'left', key: 'fileLoc' }
    ];
    const hotspotRows = filtered.slice(0, topLimit).map((f, idx) => ({
        index: String(idx + 1),
        name: f.name.length > MAX_FUNCTION_NAME_CHARS ? f.name.slice(0, MAX_FUNCTION_NAME_CHARS - 1) + '…' : f.name,
        lines: styleText(f.lines > MAX_RECOMMENDED_LOC ? 'red' : 'green', String(f.lines)),
        cog: f.cog > 0 ? styleText(f.cog > MAX_RECOMMENDED_COGNITIVE ? 'red' : 'yellow', String(f.cog)) : styleText('dim', '-'),
        cyc: f.cyc > 0 ? styleText(f.cyc > MAX_RECOMMENDED_CYCLOMATIC ? 'red' : 'yellow', String(f.cyc)) : styleText('dim', '-'),
        fileLoc: f.file.length > MAX_FILE_PATH_DISPLAY_LENGTH ? '…' + f.file.slice(-FILE_PATH_TAIL_CHARS) + `:${f.line}` : `${f.file}:${f.line}`
    }));
    console.log(renderBoxTable(hotspotCols, hotspotRows));
    if (targets.length > 0) {
        console.log(`\n🎯 OBJETIVOS DE REFACTORIZACIÓN PRIORITARIOS (FALLOW - TOP ${targets.length}):\n`);
        const targetCols = [
            { header: '#', width: 3, align: 'center', key: 'index' },
            { header: 'PRI', width: 5, align: 'right', key: 'pri' },
            { header: 'TIPO', width: 14, align: 'left', key: 'category' },
            { header: 'RECOMENDACIÓN DE REFACTORIZACIÓN', width: MAX_RECOMMENDATION_CHARS, align: 'left', key: 'recommendation' }
        ];
        const targetRows = targets.map((t, idx) => ({
            index: String(idx + 1),
            pri: t.priority ? t.priority.toFixed(1) : '-',
            category: t.category.replace(/_/g, ' '),
            recommendation: t.recommendation.length > MAX_RECOMMENDATION_CHARS ? t.recommendation.slice(0, MAX_RECOMMENDATION_CHARS - 1) + '…' : t.recommendation
        }));
        console.log(renderBoxTable(targetCols, targetRows));
    }
    console.log('');
}
function main() {
    const { top, layerFilter, jsonOutput } = parseCommandLineArgs();
    const { findings, targets, maintainability } = loadComplexityFindings();
    if (jsonOutput) {
        console.log(JSON.stringify({ total: findings.length, maintainability, findings: findings.slice(0, top), targets }, null, 2));
        return;
    }
    renderBoxReport(findings, targets, maintainability, top, layerFilter);
}
main();
//# sourceMappingURL=report_complexity.js.map