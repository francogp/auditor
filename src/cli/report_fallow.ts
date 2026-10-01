#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/report_fallow.ts
 */
import path from 'node:path';
import { execSync } from 'node:child_process';
import { parseArgs, styleText } from 'node:util';
import { renderBanner, renderBoxTable, type TableColumn } from '../core/unifiedTheme.ts';
import { getAuditConfig, isInCodeRoots } from '../core/auditConfig.ts';

const DEFAULT_TOP_LIMIT = 20;
const RADIX_DECIMAL = 10;

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

  let category = (values.category as string || '').toLowerCase();
  let top = parseInt(values.top as string, RADIX_DECIMAL) || DEFAULT_TOP_LIMIT;
  let jsonOutput = Boolean(values.json);

  for (const pos of positionals) {
    if (pos.startsWith('category=')) {
      category = pos.split('=')[1]?.toLowerCase() || ''; // domain-ok: Open dynamic text or non-domain string payload
    } else if (pos.startsWith('top=')) {
      const rawTop = pos.split('=')[1] || '20';
      top = rawTop === 'all' ? Number.MAX_SAFE_INTEGER : (parseInt(rawTop, RADIX_DECIMAL) || DEFAULT_TOP_LIMIT);
    } else if (pos === 'json') {
      jsonOutput = true;
    } else if (!category) {
      const cleanPos = pos.toLowerCase(); // domain-ok: Open dynamic text or non-domain string payload
      if (['dupes', 'duplicates', 'security', 'cwe', 'dead-code', 'deadcode', 'unused', 'complexity', 'circular', 'exports', 'orphans', 'boundaries', 'architecture', 'boundary', 'all'].includes(cleanPos)) {
        category = cleanPos;
      }
    }
  }

  return {
    category: category || 'all',
    top,
    jsonOutput
  };
}

function runFallowCommand(command: string, extraArgs: string[] = []): Record<string, unknown> | null { // open-record: Generic key-value data dictionary container
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
    const jsonStart = stdout.indexOf('{');
    if (jsonStart !== -1) {
      return JSON.parse(stdout.substring(jsonStart)) as Record<string, unknown>; // open-record: Generic key-value data dictionary container
    }
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer | string };
    if (err.stdout) {
      const stdoutStr = typeof err.stdout === 'string' ? err.stdout : err.stdout.toString('utf8');
      const jsonStart = stdoutStr.indexOf('{');
      if (jsonStart !== -1) {
        try {
          return JSON.parse(stdoutStr.substring(jsonStart)) as Record<string, unknown>; // open-record: Generic key-value data dictionary container
        } catch {
          // Ignore parse errors on fallback
        }
      }
    }
  }
  return null;
}

function reportDupes(top: number, json: boolean): void {
  const data = runFallowCommand('dupes');
  const groups = (data?.clone_groups as Array<{ duplicated_tokens?: number; instances?: Array<{ path?: string; file?: string; line?: number; start_line?: number }> }>) || [];

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

  interface DupeRow {
    index: string;
    type: string;
    tokens: string;
    locations: string;
  }

  const dupeCols: readonly TableColumn<DupeRow>[] = [
    { header: '#', width: 3, align: 'center', key: 'index' },
    { header: 'TIPO', width: 14, align: 'center', key: 'type' },
    { header: 'TOKENS', width: 8, align: 'right', key: 'tokens' },
    { header: 'UBICACIONES DE CÓDIGO CLONADO', width: 41, align: 'left', key: 'locations' }
  ];

  const dupeRows: DupeRow[] = groups.slice(0, top).map((g, idx) => {
    const tokens = g.duplicated_tokens || 0;
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

function reportSecurity(top: number, json: boolean): void {
  const data = runFallowCommand('security');
  const rawFindings = (data?.security_findings as Array<{ path?: string; line?: number; cwe?: number; kind?: string; evidence?: string }>) || [];
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

  interface SecurityRow {
    index: string;
    cwe: string;
    location: string;
    description: string;
  }

  const secCols: readonly TableColumn<SecurityRow>[] = [
    { header: '#', width: 3, align: 'center', key: 'index' },
    { header: 'CWE', width: 9, align: 'center', key: 'cwe' },
    { header: 'UBICACIÓN', width: 25, align: 'left', key: 'location' },
    { header: 'DESCRIPCIÓN', width: 29, align: 'left', key: 'description' }
  ];

  const secRows: SecurityRow[] = findings.slice(0, top).map((f, idx) => ({
    index: String(idx + 1),
    cwe: styleText('red', `CWE-${f.cwe || '?'}`),
    location: `${f.path}:${f.line}`,
    description: f.evidence || f.kind || ''
  }));

  console.log(renderBoxTable(secCols, secRows));
  console.log('');
}

function reportDeadCode(top: number, json: boolean): void {
  const data = runFallowCommand('dead-code');
  const unusedFiles = (data?.unused_files as Array<{ path: string }>) || [];
  const unusedExports = (data?.unused_exports as Array<{ path: string; line: number; export_name: string }>) || [];
  const unusedDeps = (data?.unused_dependencies as Array<{ package_name: string }>) || [];
  const circular = (data?.circular_dependencies as Array<{ path?: string; cycle?: string[]; files?: string[] }>) || [];
  const unusedStoreMembers = (data?.unused_store_members as Array<{ path: string; parent_name: string; member_name: string; line: number }>) || [];
  const unusedClassMembers = (data?.unused_class_members as Array<{ path: string; parent_name: string; member_name: string; line: number }>) || [];
  const unusedTypes = (data?.unused_types as Array<{ path: string; export_name: string; line: number }>) || [];
  const unusedEmits = (data?.unused_component_emits as Array<{ path: string; component_name: string; emit_name: string; line: number }>) || [];
  const unlistedDeps = (data?.unlisted_dependencies as Array<{ package_name: string; imported_from?: Array<{ path: string; line: number }> }>) || [];
  const duplicateExports = (data?.duplicate_exports as Array<{ export_name: string; locations?: Array<{ path: string; line: number }> }>) || [];
  const boundaryViolations = (data?.boundary_violations as Array<{ from_path?: string; to_path?: string; from_zone?: string; to_zone?: string; import_specifier?: string; line?: number }>) || [];
  const unusedProps = (data?.unused_component_props as Array<{ path: string; component_name: string; prop_name: string; line: number }>) || [];
  const unrenderedComponents = (data?.unrendered_components as Array<{ path: string; component_name: string; line: number }>) || [];
  const unprovidedInjects = (data?.unprovided_injects as Array<{ path: string; inject_key: string; line: number }>) || [];

  const totalGranular = unusedFiles.length + unusedExports.length + unusedDeps.length + circular.length +
    unusedStoreMembers.length + unusedClassMembers.length + unusedTypes.length +
    unusedEmits.length + unlistedDeps.length + duplicateExports.length +
    boundaryViolations.length + unusedProps.length + unrenderedComponents.length + unprovidedInjects.length;

  if (json) {
    console.log(JSON.stringify({
      totalIssues: totalGranular,
      unusedFilesCount: unusedFiles.length,
      unusedExportsCount: unusedExports.length,
      unusedDepsCount: unusedDeps.length,
      circularDepsCount: circular.length,
      unusedStoreMembersCount: unusedStoreMembers.length,
      unusedClassMembersCount: unusedClassMembers.length,
      unusedTypesCount: unusedTypes.length,
      unusedEmitsCount: unusedEmits.length,
      unlistedDepsCount: unlistedDeps.length,
      duplicateExportsCount: duplicateExports.length,
      boundaryViolationsCount: boundaryViolations.length,
      unusedPropsCount: unusedProps.length,
      unrenderedComponentsCount: unrenderedComponents.length,
      unprovidedInjectsCount: unprovidedInjects.length,
      unusedFiles: unusedFiles.slice(0, top),
      unusedExports: unusedExports.slice(0, top),
      unusedStoreMembers: unusedStoreMembers.slice(0, top),
      unusedClassMembers: unusedClassMembers.slice(0, top),
      unusedTypes: unusedTypes.slice(0, top),
      unusedEmits: unusedEmits.slice(0, top),
      unlistedDeps: unlistedDeps.slice(0, top),
      duplicateExports: duplicateExports.slice(0, top),
      boundaryViolations,
      unusedProps: unusedProps.slice(0, top),
      unrenderedComponents: unrenderedComponents.slice(0, top),
      unprovidedInjects: unprovidedInjects.slice(0, top),
      unusedDeps,
      circular
    }, null, 2));
    return;
  }

  console.log('\n' + renderBanner('CÓDIGO MUERTO Y DEPENDENCIAS (FALLOW)', `Total de incidencias: ${totalGranular}`));

  interface DeadCodeSummaryRow {
    category: string;
    count: string;
    status: string;
  }

  const deadCodeCols: readonly TableColumn<DeadCodeSummaryRow>[] = [
    { header: 'CATEGORÍA / TIPO DE HALLAZGO', width: 49, align: 'left', key: 'category' },
    { header: 'INCIDENCIAS', width: 13, align: 'right', key: 'count' },
    { header: 'ESTADO', width: 8, align: 'center', key: 'status' }
  ];

  const unresolvedImports = (data?.unresolved_imports as Array<{ path: string; specifier: string; line: number }>) || [];

  const deadCodeRows: DeadCodeSummaryRow[] = [
    { category: 'Dependencias circulares', count: String(circular.length), status: circular.length === 0 ? '✅' : '❌' },
    { category: 'Límites arquitectónicos', count: String(boundaryViolations.length), status: boundaryViolations.length === 0 ? '✅' : '❌' },
    { category: 'Archivos huérfanos', count: String(unusedFiles.length), status: unusedFiles.length === 0 ? '✅' : '❌' },
    { category: 'Imports no resueltos', count: String(unresolvedImports.length), status: unresolvedImports.length === 0 ? '✅' : '⚠️' },
    { category: 'Dependencias no usadas', count: String(unusedDeps.length), status: unusedDeps.length === 0 ? '✅' : '⚠️' },
    { category: 'Exports de valor no usados', count: String(unusedExports.length), status: unusedExports.length === 0 ? '✅' : '⚠️' },
    { category: 'Miembros de Store no usados', count: String(unusedStoreMembers.length), status: unusedStoreMembers.length === 0 ? '✅' : '⚠️' },
    { category: 'Miembros de Clase no usados', count: String(unusedClassMembers.length), status: unusedClassMembers.length === 0 ? '✅' : '⚠️' },
    { category: 'Tipos exportados no usados', count: String(unusedTypes.length), status: unusedTypes.length === 0 ? '✅' : '⚠️' },
    { category: 'Dependencias no listadas', count: String(unlistedDeps.length), status: unlistedDeps.length === 0 ? '✅' : '⚠️' },
    { category: 'Exports duplicados', count: String(duplicateExports.length), status: duplicateExports.length === 0 ? '✅' : '⚠️' },
    { category: 'Emits de componentes (Vue)', count: String(unusedEmits.length), status: unusedEmits.length === 0 ? '✅' : '⚠️' },
    { category: 'Props no usados (Vue SFC)', count: String(unusedProps.length), status: unusedProps.length === 0 ? '✅' : '⚠️' },
    { category: 'Componentes no renderizados', count: String(unrenderedComponents.length), status: unrenderedComponents.length === 0 ? '✅' : '⚠️' },
    { category: 'Inyecciones no provistas', count: String(unprovidedInjects.length), status: unprovidedInjects.length === 0 ? '✅' : '⚠️' }
  ];

  console.log('\n' + renderBoxTable(deadCodeCols, deadCodeRows));

  if (boundaryViolations.length > 0) {
    console.log('\n🚨 Violaciones de Límites Arquitectónicos:');
    boundaryViolations.forEach((b, idx) => {
      console.log(`  [${idx + 1}] '${b.from_zone}' -> '${b.to_zone}' en ${b.from_path}:${b.line}`);
      console.log(`       Import: ${b.import_specifier || b.to_path}`);
    });
  }

  if (circular.length > 0) {
    console.log('\n🔄 Dependencias Circulares Críticas:');
    circular.forEach((c, idx) => {
      const filesList = (Array.isArray(c.files) && c.files.length > 0) ? c.files : (Array.isArray(c.cycle) ? c.cycle : []);
      const cycleStr = filesList.length > 0 ? filesList.join(' → ') : (c.path || '');
      console.log(`  [${idx + 1}] ${cycleStr}`);
    });
  }

  if (unusedFiles.length > 0) {
    console.log(`\n🗑️ Archivos Huérfanos (${unusedFiles.length}):`);
    unusedFiles.slice(0, top).forEach((f, idx) => console.log(`  [${idx + 1}] ${f.path}`));
  }

  if (unusedDeps.length > 0) {
    console.log(`\n📦 Dependencias de package.json no usadas (${unusedDeps.length}):`);
    unusedDeps.forEach(d => console.log(`  • ${d.package_name}`));
  }

  if (duplicateExports.length > 0) {
    console.log(`\n📤 Exports Duplicados (${duplicateExports.length}):`);
    duplicateExports.forEach((d, idx) => {
      const locs = d.locations?.map(l => `${l.path}:${l.line}`).join(', ') || '';
      console.log(`  [${idx + 1}] '${d.export_name}' en: ${locs}`);
    });
  }

  if (unlistedDeps.length > 0) {
    console.log(`\n📦 Dependencias No Listadas en package.json (${unlistedDeps.length}):`);
    unlistedDeps.forEach((d, idx) => {
      const firstLoc = d.imported_from?.[0] ? ` (importada en ${d.imported_from[0].path}:${d.imported_from[0].line})` : '';
      console.log(`  [${idx + 1}] '${d.package_name}'${firstLoc}`);
    });
  }

  if (unusedEmits.length > 0) {
    console.log(`\n🔔 Emits de Componente No Usados (${unusedEmits.length}):`);
    unusedEmits.forEach((e, idx) => {
      console.log(`  [${idx + 1}] ${e.path}:${e.line} -> '${e.component_name}' emit '${e.emit_name}'`);
    });
  }

  if (unusedStoreMembers.length > 0) {
    console.log(`\n🏬 Top Miembros de Store No Usados (${Math.min(top, unusedStoreMembers.length)} de ${unusedStoreMembers.length}):`);
    unusedStoreMembers.slice(0, top).forEach((sm, idx) => console.log(`  [${idx + 1}] ${sm.path}:${sm.line} -> ${sm.parent_name}.${sm.member_name}`));
  }

  if (unusedClassMembers.length > 0) {
    console.log(`\n🏛️ Top Miembros de Clase No Usados (${Math.min(top, unusedClassMembers.length)} de ${unusedClassMembers.length}):`);
    unusedClassMembers.slice(0, top).forEach((cm, idx) => console.log(`  [${idx + 1}] ${cm.path}:${cm.line} -> ${cm.parent_name}.${cm.member_name}`));
  }

  if (unusedTypes.length > 0) {
    console.log(`\n🏷️ Top Tipos Exportados No Usados (${Math.min(top, unusedTypes.length)} de ${unusedTypes.length}):`);
    unusedTypes.slice(0, top).forEach((ut, idx) => console.log(`  [${idx + 1}] ${ut.path}:${ut.line} -> type '${ut.export_name}'`));
  }

  if (unusedExports.length > 0) {
    console.log(`\n📤 Top Exports de Valor No Usados (${Math.min(top, unusedExports.length)} de ${unusedExports.length}):`);
    unusedExports.slice(0, top).forEach((x, idx) => console.log(`  [${idx + 1}] ${x.path}:${x.line} -> export '${x.export_name}'`));
  }
  console.log('');
}

function reportCircular(json: boolean): void {
  const data = runFallowCommand('dead-code', ['--circular-deps']);
  const circular = (data?.circular_dependencies as Array<{ path?: string; cycle?: string[]; files?: string[] }>) || [];

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
  circular.forEach((c, idx) => {
    const filesList = (Array.isArray(c.files) && c.files.length > 0) ? c.files : (Array.isArray(c.cycle) ? c.cycle : []);
    const cycleStr = filesList.length > 0 ? filesList.join(' → ') : (c.path || '');
    console.log(`  [${idx + 1}] ${cycleStr}`);
  });
  console.log('');
}

function reportExports(top: number, json: boolean): void {
  const data = runFallowCommand('dead-code', ['--unused-exports']);
  const unusedExports = (data?.unused_exports as Array<{ path: string; line: number; export_name: string }>) || [];

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

  interface ExportRow {
    index: string;
    exportName: string;
    location: string;
  }

  const expCols: readonly TableColumn<ExportRow>[] = [
    { header: '#', width: 3, align: 'center', key: 'index' },
    { header: 'EXPORTACIÓN SIN USO', width: 28, align: 'left', key: 'exportName' },
    { header: 'UBICACIÓN EN CÓDIGO', width: 39, align: 'left', key: 'location' }
  ];

  const expRows: ExportRow[] = unusedExports.slice(0, top).map((x, idx) => ({
    index: String(idx + 1),
    exportName: x.export_name,
    location: `${x.path}:${x.line}`
  }));

  console.log(renderBoxTable(expCols, expRows));
  console.log('');
}

function reportBoundaries(json: boolean): void {
  const data = runFallowCommand('dead-code');
  const boundaries = (data?.boundary_violations as Array<{ from_path?: string; to_path?: string; from_zone?: string; to_zone?: string; import_specifier?: string; line?: number }>) || [];

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

  interface BoundaryRow {
    index: string;
    transition: string;
    location: string;
  }

  const bndCols: readonly TableColumn<BoundaryRow>[] = [
    { header: '#', width: 3, align: 'center', key: 'index' },
    { header: 'TRANSICIÓN ENTRE CAPAS', width: 28, align: 'left', key: 'transition' },
    { header: 'UBICACIÓN EN CÓDIGO', width: 39, align: 'left', key: 'location' }
  ];

  const bndRows: BoundaryRow[] = boundaries.map((b, idx) => ({
    index: String(idx + 1),
    transition: `${b.from_zone} → ${b.to_zone}`,
    location: `${b.from_path}:${b.line}`
  }));

  console.log(renderBoxTable(bndCols, bndRows));
  console.log('');
}

function reportAllSummary(json: boolean): void {
  const healthData = runFallowCommand('health');
  const deadCodeData = runFallowCommand('dead-code');
  const dupesData = runFallowCommand('dupes');
  const securityData = runFallowCommand('security');

  const summaryObj = healthData?.summary as { average_maintainability?: number; maintainability_index?: number } | undefined;
  const maintainability = summaryObj?.average_maintainability ?? summaryObj?.maintainability_index ?? 0;
  const complexityCount = (healthData?.findings as Array<unknown>)?.length ?? 0;
  const largeCount = (healthData?.large_functions as Array<unknown>)?.length ?? 0;
  const targetsCount = (healthData?.targets as Array<unknown>)?.length ?? 0;
  const hotspotsCount = (healthData?.hotspots as Array<unknown>)?.length ?? 0;

  const circularCount = (deadCodeData?.circular_dependencies as Array<unknown>)?.length ?? 0;
  const boundaryCount = (deadCodeData?.boundary_violations as Array<unknown>)?.length ?? 0;
  const unusedFilesCount = (deadCodeData?.unused_files as Array<unknown>)?.length ?? 0;
  const unusedExportsCount = (deadCodeData?.unused_exports as Array<unknown>)?.length ?? 0;
  const unresolvedImportsCount = (deadCodeData?.unresolved_imports as Array<unknown>)?.length ?? 0;
  const unusedDepsCount = ((deadCodeData?.unused_dependencies as Array<unknown>)?.length ?? 0) + ((deadCodeData?.unused_dev_dependencies as Array<unknown>)?.length ?? 0);

  const dupeGroupsCount = (dupesData?.clone_groups as Array<unknown>)?.length ?? 0;
  const securityCount = (securityData?.security_findings as Array<unknown>)?.length ?? 0;

  const totalWarnings = complexityCount + largeCount + targetsCount + unusedFilesCount + unusedExportsCount + unresolvedImportsCount + unusedDepsCount + dupeGroupsCount + securityCount;

  if (json) {
    console.log(JSON.stringify({
      maintainability,
      totalQualityIndicators: totalWarnings,
      health: {
        complexityHotspots: complexityCount,
        largeFunctions: largeCount,
        refactoringTargets: targetsCount,
        churnHotspots: hotspotsCount
      },
      deadCode: {
        circularDependencies: circularCount,
        boundaryViolations: boundaryCount,
        unusedFiles: unusedFilesCount,
        unusedExports: unusedExportsCount,
        unresolvedImports: unresolvedImportsCount,
        unusedDependencies: unusedDepsCount
      },
      dupes: {
        cloneGroups: dupeGroupsCount
      },
      security: {
        findings: securityCount
      }
    }, null, 2));
    return;
  }

  const maintStr = maintainability > 0 ? `${maintainability.toFixed(1)} / 100` : '-';
  console.log('\n' + renderBanner('DASHBOARD DE INTELIGENCIA DE CÓDIGO (FALLOW)', `Índice de Mantenibilidad: ${maintStr}`));

  interface SummaryRow {
    metric: string;
    value: string;
  }

  const sumCols: readonly TableColumn<SummaryRow>[] = [
    { header: 'MÉTRICA / INDICADOR DE PROYECTO', width: 56, align: 'left', key: 'metric' },
    { header: 'VALOR', width: 14, align: 'right', key: 'value' }
  ];

  const sumRows: SummaryRow[] = [
    { metric: 'Índice de mantenibilidad del código (Fallow)', value: maintStr },
    { metric: 'Funciones con alta complejidad (cognitiva/ciclomática)', value: String(complexityCount) },
    { metric: 'Funciones de gran tamaño (>60 LOC)', value: String(largeCount) },
    { metric: 'Archivos con alta rotación / churn hotspots', value: String(hotspotsCount) },
    { metric: 'Objetivos de refactorización recomendados', value: String(targetsCount) },
    { metric: 'Archivos huérfanos / no alcanzados', value: String(unusedFilesCount) },
    { metric: 'Exportaciones de valor no usadas', value: String(unusedExportsCount) },
    { metric: 'Imports no resueltos', value: String(unresolvedImportsCount) },
    { metric: 'Dependencias de package.json no usadas', value: String(unusedDepsCount) },
    { metric: 'Dependencias circulares críticas', value: String(circularCount) },
    { metric: 'Violaciones de límites arquitectónicos', value: String(boundaryCount) },
    { metric: 'Bloques de código duplicados / clonados', value: String(dupeGroupsCount) },
    { metric: 'Candidatos de seguridad (CWE en src/)', value: String(securityCount) }
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

function executeComplexityReport(jsonOutput: boolean): void {
  const currentDir = import.meta.filename ? path.dirname(import.meta.filename) : path.resolve(process.cwd(), 'src/cli');
  const compScript = path.resolve(currentDir, 'report_complexity.ts');
  execSync(`node --permission --experimental-strip-types --allow-fs-read=* --allow-child-process "${compScript}" ${jsonOutput ? 'json' : ''}`, { stdio: 'inherit' });
}

function main(): void {
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
