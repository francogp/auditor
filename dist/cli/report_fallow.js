#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/report_fallow.ts
 */
import path from 'node:path';
import { execSync } from 'node:child_process';
import { parseArgs, styleText } from 'node:util';
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { getAuditConfig, isInCodeRoots } from "../core/auditConfig.js";
import { parseJsonObjectOutput } from "../core/reportUtils.js";
const DEFAULT_TOP_LIMIT = 20;
const RADIX_DECIMAL = 10;
const VALID_CATEGORY_ALIASES = new Set([
    'dupes', 'duplicates', 'security', 'cwe', 'dead-code', 'deadcode', 'unused',
    'complexity', 'circular', 'exports', 'orphans', 'boundaries', 'architecture', 'boundary', 'all'
]);
function parsePositionalOption(pos, currentCategory) {
    if (pos.startsWith('category=')) {
        return { category: pos.split('=')[1]?.toLowerCase() || '' };
    }
    if (pos.startsWith('top=')) {
        const rawTop = pos.split('=')[1] || '20';
        const top = rawTop === 'all' ? Number.MAX_SAFE_INTEGER : (parseInt(rawTop, RADIX_DECIMAL) || DEFAULT_TOP_LIMIT);
        return { top };
    }
    if (pos === 'json') {
        return { json: true };
    }
    if (!currentCategory) {
        const cleanPos = pos.toLowerCase();
        if (VALID_CATEGORY_ALIASES.has(cleanPos)) {
            return { category: cleanPos };
        }
    }
    return {};
}
function parseCommandLineArgs() {
    const { values, positionals } = parseArgs({
        options: {
            category: { type: 'string' },
            top: { type: 'string', default: '20' },
            json: { type: 'boolean', default: false }
        },
        strict: false,
        allowPositionals: true
    });
    let category = (values.category || '').toLowerCase();
    let top = parseInt(values.top, RADIX_DECIMAL) || DEFAULT_TOP_LIMIT;
    let jsonOutput = Boolean(values.json);
    for (const pos of positionals) {
        const parsed = parsePositionalOption(pos, category);
        if (parsed.category !== undefined)
            category = parsed.category;
        if (parsed.top !== undefined)
            top = parsed.top;
        if (parsed.json !== undefined)
            jsonOutput = parsed.json;
    }
    return {
        category: category || 'all',
        top,
        jsonOutput
    };
}
function runFallowCommand(command, extraArgs = []) {
    try {
        const args = ['--format', 'json', ...extraArgs]; // no-domain: Non-domain utility collection or data structure
        const fallowBin = path.resolve(process.cwd(), 'node_modules/fallow/bin/fallow');
        const cmd = `node "${fallowBin}" ${command} ${args.join(' ')}`;
        const stdout = execSync(cmd, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            maxBuffer: 50 * 1024 * 1024,
            timeout: 45000,
            killSignal: 'SIGKILL'
        });
        return parseJsonObjectOutput(stdout);
    }
    catch (e) {
        return parseJsonObjectOutput(e);
    }
}
function reportDupes(top, json) {
    const data = runFallowCommand('dupes');
    const groups = data?.clone_groups || [];
    if (json) {
        console.log(JSON.stringify({ totalGroups: groups.length, groups: groups.slice(0, top) }, null, 2));
        return;
    }
    console.log('\n' + renderBanner('DUPLICACIÓN Y TRIPLICACIÓN DE CÓDIGO (FALLOW)', `Grupos detectados: ${groups.length}`));
    if (groups.length === 0) {
        console.log('\n  ' + styleText(['bold', 'green'], '✨ ¡Excelente! No se encontraron bloques de código duplicado ni triplicado.\n'));
        return;
    }
    console.log(`\n🔥 TOP ${Math.min(top, groups.length)} GRUPOS DUPLICADOS:\n`);
    const dupeCols = [
        { header: '#', width: 3, align: 'center', key: 'index' },
        { header: 'TIPO', width: 14, align: 'center', key: 'type' },
        { header: 'TOKENS', width: 8, align: 'right', key: 'tokens' },
        { header: 'UBICACIONES DE CÓDIGO CLONADO', width: 41, align: 'left', key: 'locations' }
    ];
    const dupeRows = groups.slice(0, top).map((g, idx) => {
        const tokens = g.token_count || g.duplicated_tokens || 0;
        const instances = g.instances || [];
        const isTriplicate = instances.length >= 3;
        const typeLabel = isTriplicate ? styleText('yellow', 'TRIPLICADO ⚠️') : styleText('cyan', 'DUPLICADO');
        const locs = instances.map(i => `${path.basename(i.path || i.file || '')}:${i.start_line || i.line || 0}`).join(', ');
        return {
            index: String(idx + 1),
            type: typeLabel,
            tokens: String(tokens),
            locations: locs
        };
    });
    console.log(renderBoxTable(dupeCols, dupeRows));
    console.log('');
}
function reportSecurity(top, json) {
    const data = runFallowCommand('security');
    const rawFindings = data?.security_findings || [];
    const config = getAuditConfig();
    const findings = rawFindings.filter(f => {
        const norm = (f.path || '').replace(/\\/g, '/');
        return isInCodeRoots(norm, config);
    });
    if (json) {
        console.log(JSON.stringify({ totalSecurity: findings.length, findings: findings.slice(0, top) }, null, 2));
        return;
    }
    console.log('\n' + renderBanner('SEGURIDAD Y VULNERABILIDADES CWE (FALLOW)', `Hallazgos en código fuente: ${findings.length}`));
    if (findings.length === 0) {
        console.log('\n  ' + styleText(['bold', 'green'], '✨ ¡Excelente! 0 vulnerabilidades de seguridad CWE detectadas en código fuente.\n'));
        return;
    }
    console.log(`\n🔥 TOP ${Math.min(top, findings.length)} HALLAZGOS CWE:\n`);
    const secCols = [
        { header: '#', width: 3, align: 'center', key: 'index' },
        { header: 'CWE', width: 9, align: 'center', key: 'cwe' },
        { header: 'UBICACIÓN', width: 25, align: 'left', key: 'location' },
        { header: 'DESCRIPCIÓN', width: 29, align: 'left', key: 'description' }
    ];
    const secRows = findings.slice(0, top).map((f, idx) => ({
        index: String(idx + 1),
        cwe: styleText('red', `CWE-${f.cwe || '?'}`),
        location: `${f.path}:${f.line}`,
        description: f.evidence || f.kind || ''
    }));
    console.log(renderBoxTable(secCols, secRows));
    console.log('');
}
function formatCycleString(c) {
    const filesList = (Array.isArray(c.files) && c.files.length > 0) ? c.files : (Array.isArray(c.cycle) ? c.cycle : []);
    return filesList.length > 0 ? filesList.join(' → ') : (c.path || '');
}
function printCircularCycles(circular) {
    circular.forEach((c, idx) => {
        console.log(`  [${idx + 1}] ${formatCycleString(c)}`);
    });
}
function getArrayField(data, field) {
    if (!data)
        return [];
    const val = data[field];
    return Array.isArray(val) ? val : [];
}
function parseDeadCodeStructural(data) {
    return {
        unusedFiles: getArrayField(data, 'unused_files'),
        unusedExports: getArrayField(data, 'unused_exports'),
        unusedDeps: getArrayField(data, 'unused_dependencies'),
        circular: getArrayField(data, 'circular_dependencies'),
        boundaryViolations: getArrayField(data, 'boundary_violations'),
        unresolvedImports: getArrayField(data, 'unresolved_imports')
    };
}
function parseDeadCodeComponent(data) {
    return {
        unusedStoreMembers: getArrayField(data, 'unused_store_members'),
        unusedClassMembers: getArrayField(data, 'unused_class_members'),
        unusedTypes: getArrayField(data, 'unused_types'),
        unusedEmits: getArrayField(data, 'unused_component_emits'),
        unlistedDeps: getArrayField(data, 'unlisted_dependencies'),
        duplicateExports: getArrayField(data, 'duplicate_exports'),
        unusedProps: getArrayField(data, 'unused_component_props'),
        unrenderedComponents: getArrayField(data, 'unrendered_components'),
        unprovidedInjects: getArrayField(data, 'unprovided_injects')
    };
}
function parseDeadCodeReportData(data) {
    const structural = parseDeadCodeStructural(data);
    const component = parseDeadCodeComponent(data);
    const totalGranular = structural.unusedFiles.length +
        structural.unusedExports.length +
        structural.unusedDeps.length +
        structural.circular.length +
        structural.boundaryViolations.length +
        component.unusedStoreMembers.length +
        component.unusedClassMembers.length +
        component.unusedTypes.length +
        component.unusedEmits.length +
        component.unlistedDeps.length +
        component.duplicateExports.length +
        component.unusedProps.length +
        component.unrenderedComponents.length +
        component.unprovidedInjects.length;
    return {
        ...structural,
        ...component,
        totalGranular
    };
}
function renderDeadCodeJson(report, top) {
    console.log(JSON.stringify({
        totalIssues: report.totalGranular,
        unusedFilesCount: report.unusedFiles.length,
        unusedExportsCount: report.unusedExports.length,
        unusedDepsCount: report.unusedDeps.length,
        circularDepsCount: report.circular.length,
        unusedStoreMembersCount: report.unusedStoreMembers.length,
        unusedClassMembersCount: report.unusedClassMembers.length,
        unusedTypesCount: report.unusedTypes.length,
        unusedEmitsCount: report.unusedEmits.length,
        unlistedDepsCount: report.unlistedDeps.length,
        duplicateExportsCount: report.duplicateExports.length,
        boundaryViolationsCount: report.boundaryViolations.length,
        unusedPropsCount: report.unusedProps.length,
        unrenderedComponentsCount: report.unrenderedComponents.length,
        unprovidedInjectsCount: report.unprovidedInjects.length,
        unusedFiles: report.unusedFiles.slice(0, top),
        unusedExports: report.unusedExports.slice(0, top),
        unusedStoreMembers: report.unusedStoreMembers.slice(0, top),
        unusedClassMembers: report.unusedClassMembers.slice(0, top),
        unusedTypes: report.unusedTypes.slice(0, top),
        unusedEmits: report.unusedEmits.slice(0, top),
        unlistedDeps: report.unlistedDeps.slice(0, top),
        duplicateExports: report.duplicateExports.slice(0, top),
        boundaryViolations: report.boundaryViolations,
        unusedProps: report.unusedProps.slice(0, top),
        unrenderedComponents: report.unrenderedComponents.slice(0, top),
        unprovidedInjects: report.unprovidedInjects.slice(0, top),
        unusedDeps: report.unusedDeps,
        circular: report.circular
    }, null, 2));
}
function renderDeadCodeSummaryTable(report) {
    const deadCodeCols = [
        { header: 'CATEGORÍA / TIPO DE HALLAZGO', width: 49, align: 'left', key: 'category' },
        { header: 'INCIDENCIAS', width: 13, align: 'right', key: 'count' },
        { header: 'ESTADO', width: 8, align: 'center', key: 'status' }
    ];
    const deadCodeRows = [
        { category: 'Dependencias circulares', count: String(report.circular.length), status: report.circular.length === 0 ? '✅' : '❌' },
        { category: 'Límites arquitectónicos', count: String(report.boundaryViolations.length), status: report.boundaryViolations.length === 0 ? '✅' : '❌' },
        { category: 'Archivos huérfanos', count: String(report.unusedFiles.length), status: report.unusedFiles.length === 0 ? '✅' : '❌' },
        { category: 'Imports no resueltos', count: String(report.unresolvedImports.length), status: report.unresolvedImports.length === 0 ? '✅' : '⚠️' },
        { category: 'Dependencias no usadas', count: String(report.unusedDeps.length), status: report.unusedDeps.length === 0 ? '✅' : '⚠️' },
        { category: 'Exports de valor no usados', count: String(report.unusedExports.length), status: report.unusedExports.length === 0 ? '✅' : '⚠️' },
        { category: 'Miembros de Store no usados', count: String(report.unusedStoreMembers.length), status: report.unusedStoreMembers.length === 0 ? '✅' : '⚠️' },
        { category: 'Miembros de Clase no usados', count: String(report.unusedClassMembers.length), status: report.unusedClassMembers.length === 0 ? '✅' : '⚠️' },
        { category: 'Tipos exportados no usados', count: String(report.unusedTypes.length), status: report.unusedTypes.length === 0 ? '✅' : '⚠️' },
        { category: 'Dependencias no listadas', count: String(report.unlistedDeps.length), status: report.unlistedDeps.length === 0 ? '✅' : '⚠️' },
        { category: 'Exports duplicados', count: String(report.duplicateExports.length), status: report.duplicateExports.length === 0 ? '✅' : '⚠️' },
        { category: 'Emits de componentes (Vue)', count: String(report.unusedEmits.length), status: report.unusedEmits.length === 0 ? '✅' : '⚠️' },
        { category: 'Props no usados (Vue SFC)', count: String(report.unusedProps.length), status: report.unusedProps.length === 0 ? '✅' : '⚠️' },
        { category: 'Componentes no renderizados', count: String(report.unrenderedComponents.length), status: report.unrenderedComponents.length === 0 ? '✅' : '⚠️' },
        { category: 'Inyecciones no provistas', count: String(report.unprovidedInjects.length), status: report.unprovidedInjects.length === 0 ? '✅' : '⚠️' }
    ];
    console.log('\n' + renderBoxTable(deadCodeCols, deadCodeRows));
}
function printDeadCodeStructural(report, top) {
    if (report.boundaryViolations.length > 0) {
        console.log('\n🚨 Violaciones de Límites Arquitectónicos:');
        report.boundaryViolations.forEach((b, idx) => {
            console.log(`  [${idx + 1}] '${b.from_zone}' -> '${b.to_zone}' en ${b.from_path}:${b.line}`);
            console.log(`       Import: ${b.import_specifier || b.to_path}`);
        });
    }
    if (report.circular.length > 0) {
        console.log('\n🔄 Dependencias Circulares Críticas:');
        printCircularCycles(report.circular);
    }
    if (report.unusedFiles.length > 0) {
        console.log(`\n🗑️ Archivos Huérfanos (${report.unusedFiles.length}):`);
        report.unusedFiles.slice(0, top).forEach((f, idx) => console.log(`  [${idx + 1}] ${f.path}`));
    }
    if (report.unusedDeps.length > 0) {
        console.log(`\n📦 Dependencias de package.json no usadas (${report.unusedDeps.length}):`);
        report.unusedDeps.forEach(d => console.log(`  • ${d.package_name}`));
    }
    if (report.duplicateExports.length > 0) {
        console.log(`\n📤 Exports Duplicados (${report.duplicateExports.length}):`);
        report.duplicateExports.forEach((d, idx) => {
            const locs = d.locations?.map(l => `${l.path}:${l.line}`).join(', ') || '';
            console.log(`  [${idx + 1}] '${d.export_name}' en: ${locs}`);
        });
    }
    if (report.unlistedDeps.length > 0) {
        console.log(`\n📦 Dependencias No Listadas en package.json (${report.unlistedDeps.length}):`);
        report.unlistedDeps.forEach((d, idx) => {
            const firstLoc = d.imported_from?.[0] ? ` (importada en ${d.imported_from[0].path}:${d.imported_from[0].line})` : '';
            console.log(`  [${idx + 1}] '${d.package_name}'${firstLoc}`);
        });
    }
}
function printDeadCodeSymbols(report, top) {
    if (report.unusedEmits.length > 0) {
        console.log(`\n🔔 Emits de Componente No Usados (${report.unusedEmits.length}):`);
        report.unusedEmits.forEach((e, idx) => {
            console.log(`  [${idx + 1}] ${e.path}:${e.line} -> '${e.component_name}' emit '${e.emit_name}'`);
        });
    }
    if (report.unusedStoreMembers.length > 0) {
        console.log(`\n🏬 Top Miembros de Store No Usados (${Math.min(top, report.unusedStoreMembers.length)} de ${report.unusedStoreMembers.length}):`);
        report.unusedStoreMembers.slice(0, top).forEach((sm, idx) => console.log(`  [${idx + 1}] ${sm.path}:${sm.line} -> ${sm.parent_name}.${sm.member_name}`));
    }
    if (report.unusedClassMembers.length > 0) {
        console.log(`\n🏛️ Top Miembros de Clase No Usados (${Math.min(top, report.unusedClassMembers.length)} de ${report.unusedClassMembers.length}):`);
        report.unusedClassMembers.slice(0, top).forEach((cm, idx) => console.log(`  [${idx + 1}] ${cm.path}:${cm.line} -> ${cm.parent_name}.${cm.member_name}`));
    }
    if (report.unusedTypes.length > 0) {
        console.log(`\n🏷️ Top Tipos Exportados No Usados (${Math.min(top, report.unusedTypes.length)} de ${report.unusedTypes.length}):`);
        report.unusedTypes.slice(0, top).forEach((ut, idx) => console.log(`  [${idx + 1}] ${ut.path}:${ut.line} -> type '${ut.export_name}'`));
    }
    if (report.unusedExports.length > 0) {
        console.log(`\n📤 Top Exports de Valor No Usados (${Math.min(top, report.unusedExports.length)} de ${report.unusedExports.length}):`);
        report.unusedExports.slice(0, top).forEach((x, idx) => console.log(`  [${idx + 1}] ${x.path}:${x.line} -> export '${x.export_name}'`));
    }
}
function reportDeadCode(top, json) {
    const data = runFallowCommand('dead-code');
    const report = parseDeadCodeReportData(data);
    if (json) {
        renderDeadCodeJson(report, top);
        return;
    }
    console.log('\n' + renderBanner('CÓDIGO MUERTO Y DEPENDENCIAS (FALLOW)', `Total de incidencias: ${report.totalGranular}`));
    renderDeadCodeSummaryTable(report);
    printDeadCodeStructural(report, top);
    printDeadCodeSymbols(report, top);
    console.log('');
}
function reportCircular(json) {
    const data = runFallowCommand('dead-code', ['--circular-deps']);
    const circular = data?.circular_dependencies || [];
    if (json) {
        console.log(JSON.stringify({ circularDepsCount: circular.length, circular }, null, 2));
        return;
    }
    console.log('\n' + renderBanner('DEPENDENCIAS CIRCULARES (FALLOW)', `Ciclos detectados: ${circular.length}`));
    if (circular.length === 0) {
        console.log('\n  ' + styleText(['bold', 'green'], '✨ ¡Excelente! No se detectaron dependencias circulares en el proyecto.\n'));
        return;
    }
    console.log('\n🔄 Ciclos Detectados:\n');
    printCircularCycles(circular);
    console.log('');
}
function reportExports(top, json) {
    const data = runFallowCommand('dead-code', ['--unused-exports']);
    const unusedExports = data?.unused_exports || [];
    if (json) {
        console.log(JSON.stringify({ unusedExportsCount: unusedExports.length, unusedExports: unusedExports.slice(0, top) }, null, 2));
        return;
    }
    console.log('\n' + renderBanner('EXPORTS NO USADOS (FALLOW)', `Total sin uso: ${unusedExports.length}`));
    if (unusedExports.length === 0) {
        console.log('\n  ' + styleText(['bold', 'green'], '✨ ¡Excelente! 0 exports sin uso detectados.\n'));
        return;
    }
    const showCount = Math.min(top, unusedExports.length);
    console.log(`\n📤 Top Exports No Usados (${showCount} de ${unusedExports.length}):\n`);
    const expCols = [
        { header: '#', width: 3, align: 'center', key: 'index' },
        { header: 'EXPORTACIÓN SIN USO', width: 28, align: 'left', key: 'exportName' },
        { header: 'UBICACIÓN EN CÓDIGO', width: 39, align: 'left', key: 'location' }
    ];
    const expRows = unusedExports.slice(0, top).map((x, idx) => ({
        index: String(idx + 1),
        exportName: x.export_name,
        location: `${x.path}:${x.line}`
    }));
    console.log(renderBoxTable(expCols, expRows));
    console.log('');
}
function reportBoundaries(json) {
    const data = runFallowCommand('dead-code');
    const boundaries = data?.boundary_violations || [];
    if (json) {
        console.log(JSON.stringify({ totalBoundaries: boundaries.length, violations: boundaries }, null, 2));
        return;
    }
    console.log('\n' + renderBanner('LÍMITES ARQUITECTÓNICOS (FALLOW)', `Violaciones detectadas: ${boundaries.length}`));
    if (boundaries.length === 0) {
        console.log('\n  ' + styleText(['bold', 'green'], '✨ ¡Excelente! 0 violaciones de límites arquitectónicos. La arquitectura está 100% aislada.\n'));
        return;
    }
    console.log('\n🚨 VIOLACIONES DETECTADAS:\n');
    const bndCols = [
        { header: '#', width: 3, align: 'center', key: 'index' },
        { header: 'TRANSICIÓN ENTRE CAPAS', width: 28, align: 'left', key: 'transition' },
        { header: 'UBICACIÓN EN CÓDIGO', width: 39, align: 'left', key: 'location' }
    ];
    const bndRows = boundaries.map((b, idx) => ({
        index: String(idx + 1),
        transition: `${b.from_zone} → ${b.to_zone}`,
        location: `${b.from_path}:${b.line}`
    }));
    console.log(renderBoxTable(bndCols, bndRows));
    console.log('');
}
function countArrayItems(record, key) {
    if (!record)
        return 0;
    const val = record[key];
    return Array.isArray(val) ? val.length : 0;
}
function extractHealthMetrics(healthData) {
    const summaryObj = (healthData && typeof healthData.summary === 'object' && healthData.summary !== null)
        ? healthData.summary
        : null;
    const maintainability = summaryObj?.average_maintainability ?? summaryObj?.maintainability_index ?? 0;
    return {
        maintainability,
        complexityCount: countArrayItems(healthData, 'findings'),
        largeCount: countArrayItems(healthData, 'large_functions'),
        targetsCount: countArrayItems(healthData, 'targets'),
        hotspotsCount: countArrayItems(healthData, 'hotspots')
    };
}
function extractDeadCodeMetrics(deadCodeData) {
    const unusedDeps = countArrayItems(deadCodeData, 'unused_dependencies') + countArrayItems(deadCodeData, 'unused_dev_dependencies');
    return {
        circularCount: countArrayItems(deadCodeData, 'circular_dependencies'),
        boundaryCount: countArrayItems(deadCodeData, 'boundary_violations'),
        unusedFilesCount: countArrayItems(deadCodeData, 'unused_files'),
        unusedExportsCount: countArrayItems(deadCodeData, 'unused_exports'),
        unresolvedImportsCount: countArrayItems(deadCodeData, 'unresolved_imports'),
        unusedDepsCount: unusedDeps
    };
}
function collectSummaryMetrics() {
    const health = extractHealthMetrics(runFallowCommand('health'));
    const deadCode = extractDeadCodeMetrics(runFallowCommand('dead-code'));
    const dupesData = runFallowCommand('dupes');
    const securityData = runFallowCommand('security');
    const dupeGroupsCount = dupesData?.clone_groups?.length ?? 0;
    const securityCount = securityData?.security_findings?.length ?? 0;
    const totalWarnings = health.complexityCount + health.largeCount + health.targetsCount + deadCode.unusedFilesCount + deadCode.unusedExportsCount + deadCode.unresolvedImportsCount + deadCode.unusedDepsCount + dupeGroupsCount + securityCount;
    return {
        ...health,
        ...deadCode,
        dupeGroupsCount,
        securityCount,
        totalWarnings
    };
}
function printJsonSummary(m) {
    console.log(JSON.stringify({
        maintainability: m.maintainability,
        totalQualityIndicators: m.totalWarnings,
        health: {
            complexityHotspots: m.complexityCount,
            largeFunctions: m.largeCount,
            refactoringTargets: m.targetsCount,
            churnHotspots: m.hotspotsCount
        },
        deadCode: {
            circularDependencies: m.circularCount,
            boundaryViolations: m.boundaryCount,
            unusedFiles: m.unusedFilesCount,
            unusedExports: m.unusedExportsCount,
            unresolvedImports: m.unresolvedImportsCount,
            unusedDependencies: m.unusedDepsCount
        },
        dupes: {
            cloneGroups: m.dupeGroupsCount
        },
        security: {
            findings: m.securityCount
        }
    }, null, 2));
}
function printTableSummary(m) {
    const maintStr = m.maintainability > 0 ? `${m.maintainability.toFixed(1)} / 100` : '-';
    console.log('\n' + renderBanner('DASHBOARD DE INTELIGENCIA DE CÓDIGO (FALLOW)', `Índice de Mantenibilidad: ${maintStr}`));
    const sumCols = [
        { header: 'MÉTRICA / INDICADOR DE PROYECTO', width: 56, align: 'left', key: 'metric' },
        { header: 'VALOR', width: 14, align: 'right', key: 'value' }
    ];
    const sumRows = [
        { metric: 'Índice de mantenibilidad del código (Fallow)', value: maintStr },
        { metric: 'Funciones con alta complejidad (cognitiva/ciclomática)', value: String(m.complexityCount) },
        { metric: 'Funciones de gran tamaño (>60 LOC)', value: String(m.largeCount) },
        { metric: 'Archivos con alta rotación / churn hotspots', value: String(m.hotspotsCount) },
        { metric: 'Objetivos de refactorización recomendados', value: String(m.targetsCount) },
        { metric: 'Archivos huérfanos / no alcanzados', value: String(m.unusedFilesCount) },
        { metric: 'Exportaciones de valor no usadas', value: String(m.unusedExportsCount) },
        { metric: 'Imports no resueltos', value: String(m.unresolvedImportsCount) },
        { metric: 'Dependencias de package.json no usadas', value: String(m.unusedDepsCount) },
        { metric: 'Dependencias circulares críticas', value: String(m.circularCount) },
        { metric: 'Violaciones de límites arquitectónicos', value: String(m.boundaryCount) },
        { metric: 'Bloques de código duplicados / clonados', value: String(m.dupeGroupsCount) },
        { metric: 'Candidatos de seguridad (CWE en src/)', value: String(m.securityCount) }
    ];
    console.log('\n' + renderBoxTable(sumCols, sumRows));
    console.log('\n🛠️ COMANDOS DISPONIBLES EN NPM:');
    console.log('─────────────────────────────────────────────────────────────────────────────');
    console.log('  • npm run audit:complexity         → Reporte de complejidad ciclomática/cognitiva');
    console.log('  • npm run audit:fallow:dupes       → Detección de bloques de código clonados');
    console.log('  • npm run audit:fallow:circular    → Detección de dependencias circulares');
    console.log('  • npm run audit:fallow:exports     → Detección de exports no usados');
    console.log('  • npm run audit:fallow:security    → Auditoría de seguridad y CWE');
    console.log('  • npm run audit:fallow:dead-code   → Detección de código muerto y dependencias');
    console.log('  • npm run audit:fallow:boundaries  → Auditoría de límites arquitectónicos');
    console.log('  • npm run audit                    → Suite de auditoría unificada');
    console.log('─────────────────────────────────────────────────────────────────────────────\n');
}
function reportAllSummary(json) {
    const metrics = collectSummaryMetrics();
    if (json) {
        printJsonSummary(metrics);
    }
    else {
        printTableSummary(metrics);
    }
}
function executeComplexityReport(jsonOutput) {
    const currentDir = import.meta.filename ? path.dirname(import.meta.filename) : path.resolve(process.cwd(), 'src/cli');
    const compScript = path.resolve(currentDir, 'report_complexity.ts');
    execSync(`node --permission --experimental-strip-types --allow-fs-read=* --allow-child-process "${compScript}" ${jsonOutput ? 'json' : ''}`, { stdio: 'inherit' });
}
function main() {
    const { category, top, jsonOutput } = parseCommandLineArgs();
    switch (category) {
        case 'dupes':
        case 'duplicates':
            reportDupes(top, jsonOutput);
            break;
        case 'security':
        case 'cwe':
            reportSecurity(top, jsonOutput);
            break;
        case 'circular':
        case 'circular-deps':
            reportCircular(jsonOutput);
            break;
        case 'exports':
        case 'unused-exports':
            reportExports(top, jsonOutput);
            break;
        case 'dead-code':
        case 'deadcode':
        case 'unused':
            reportDeadCode(top, jsonOutput);
            break;
        case 'boundaries':
        case 'architecture':
        case 'boundary':
            reportBoundaries(jsonOutput);
            break;
        case 'complexity':
            executeComplexityReport(jsonOutput);
            break;
        case 'all':
        default:
            reportAllSummary(jsonOutput);
            break;
    }
}
main();
//# sourceMappingURL=report_fallow.js.map