#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/report_fallow.ts
 */
import path from 'node:path';
import { execSync } from 'node:child_process';
import { parseArgs, styleText } from 'node:util';
import { renderBanner, renderBoxTable, type TableColumn } from '../core/unifiedTheme.ts';
import { getAuditConfig, isInCodeRoots } from '../core/auditConfig.ts';
import { parseJsonObjectOutput } from '../core/reportUtils.ts';
import { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES, resolveCoverageArgs, isMainModule } from './cliUtils.ts';
import { runGuardReport } from './report_guard.ts';
import { runFlagsReport } from './report_flags.ts';

const DEFAULT_TOP_LIMIT = 20;
const RADIX_DECIMAL = 10;

const VALID_CATEGORY_ALIASES = new Set([
  'dupes', 'duplicates', 'security', 'cwe', 'dead-code', 'deadcode', 'unused',
  'complexity', 'circular', 'exports', 'orphans', 'boundaries', 'architecture', 'boundary',
  'coverage-gaps', 'coverage_gaps', 'gaps', 'guard', 'flags', 'all'
]);

function parsePositionalOption(pos: string, currentCategory: string): { category?: string; top?: number; json?: boolean } {
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

  let category = (values.category as string || '').toLowerCase();
  let top = parseInt(values.top as string, RADIX_DECIMAL) || DEFAULT_TOP_LIMIT;
  let jsonOutput = Boolean(values.json);

  for (const pos of positionals) {
    const parsed = parsePositionalOption(pos, category);
    if (parsed.category !== undefined) category = parsed.category;
    if (parsed.top !== undefined) top = parsed.top;
    if (parsed.json !== undefined) jsonOutput = parsed.json;
  }

  return {
    category: category || 'all',
    top,
    jsonOutput
  };
}


function runFallowCommand(command: string, extraArgs: string[] = []): Record<string, unknown> | null { // open-record: Generic key-value data dictionary container
  try {
    const effectiveExtra = [...extraArgs];
    if (command.startsWith('health') && !effectiveExtra.includes('--coverage')) {
      const covArgs = resolveCoverageArgs();
      if (covArgs.length > 0) {
        effectiveExtra.push(...covArgs);
      }
    }
    const args = ['--format', 'json', ...effectiveExtra]; // no-domain: Non-domain utility collection or data structure
    const fallowBin = path.resolve(process.cwd(), 'node_modules/fallow/bin/fallow');
    const cmd = `node "${fallowBin}" ${command} ${args.join(' ')}`;
    const stdout = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
    });
    return parseJsonObjectOutput<Record<string, unknown>>(stdout);
  } catch (e: unknown) {
    return parseJsonObjectOutput<Record<string, unknown>>(e);
  }
}

function reportDupes(top: number, json: boolean): void {
  const data = runFallowCommand('dupes');
  const groups = (data?.clone_groups as Array<{ duplicated_tokens?: number; token_count?: number; instances?: Array<{ path?: string; file?: string; line?: number; start_line?: number }> }>) || [];

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

interface FallowCycleItem {
  path?: string;
  cycle?: string[];
  files?: string[];
}

function formatCycleString(c: FallowCycleItem): string {
  const filesList = (Array.isArray(c.files) && c.files.length > 0) ? c.files : (Array.isArray(c.cycle) ? c.cycle : []);
  return filesList.length > 0 ? filesList.join(' → ') : (c.path || '');
}

function printCircularCycles(circular: readonly FallowCycleItem[]): void {
  circular.forEach((c, idx) => {
    console.log(`  [${idx + 1}] ${formatCycleString(c)}`);
  });
}

interface DeadCodeReportData {
  unusedFiles: Array<{ path: string }>;
  unusedExports: Array<{ path: string; line: number; export_name: string }>;
  unusedDeps: Array<{ package_name: string }>;
  circular: Array<FallowCycleItem>;
  unusedStoreMembers: Array<{ path: string; parent_name: string; member_name: string; line: number }>;
  unusedClassMembers: Array<{ path: string; parent_name: string; member_name: string; line: number }>;
  unusedTypes: Array<{ path: string; export_name: string; line: number }>;
  unusedEmits: Array<{ path: string; component_name: string; emit_name: string; line: number }>;
  unlistedDeps: Array<{ package_name: string; imported_from?: Array<{ path: string; line: number }> }>;
  duplicateExports: Array<{ export_name: string; locations?: Array<{ path: string; line: number }> }>;
  boundaryViolations: Array<{ from_path?: string; to_path?: string; from_zone?: string; to_zone?: string; import_specifier?: string; line?: number }>;
  unusedProps: Array<{ path: string; component_name: string; prop_name: string; line: number }>;
  unrenderedComponents: Array<{ path: string; component_name: string; line: number }>;
  unprovidedInjects: Array<{ path: string; inject_key: string; line: number }>;
  unresolvedImports: Array<{ path: string; specifier: string; line: number }>;
  totalGranular: number;
}

function getArrayField<T>(data: Record<string, unknown> | null, field: string): T[] {
  if (!data) return [];
  const val = data[field];
  return Array.isArray(val) ? (val as T[]) : [];
}

function parseDeadCodeStructural(data: Record<string, unknown> | null) {
  return {
    unusedFiles: getArrayField<{ path: string }>(data, 'unused_files'),
    unusedExports: getArrayField<{ path: string; line: number; export_name: string }>(data, 'unused_exports'),
    unusedDeps: getArrayField<{ package_name: string }>(data, 'unused_dependencies'),
    circular: getArrayField<FallowCycleItem>(data, 'circular_dependencies'),
    boundaryViolations: getArrayField<{ from_path?: string; to_path?: string; from_zone?: string; to_zone?: string; import_specifier?: string; line?: number }>(data, 'boundary_violations'),
    unresolvedImports: getArrayField<{ path: string; specifier: string; line: number }>(data, 'unresolved_imports')
  };
}

function parseDeadCodeComponent(data: Record<string, unknown> | null) {
  return {
    unusedStoreMembers: getArrayField<{ path: string; parent_name: string; member_name: string; line: number }>(data, 'unused_store_members'),
    unusedClassMembers: getArrayField<{ path: string; parent_name: string; member_name: string; line: number }>(data, 'unused_class_members'),
    unusedTypes: getArrayField<{ path: string; export_name: string; line: number }>(data, 'unused_types'),
    unusedEmits: getArrayField<{ path: string; component_name: string; emit_name: string; line: number }>(data, 'unused_component_emits'),
    unlistedDeps: getArrayField<{ package_name: string; imported_from?: Array<{ path: string; line: number }> }>(data, 'unlisted_dependencies'),
    duplicateExports: getArrayField<{ export_name: string; locations?: Array<{ path: string; line: number }> }>(data, 'duplicate_exports'),
    unusedProps: getArrayField<{ path: string; component_name: string; prop_name: string; line: number }>(data, 'unused_component_props'),
    unrenderedComponents: getArrayField<{ path: string; component_name: string; line: number }>(data, 'unrendered_components'),
    unprovidedInjects: getArrayField<{ path: string; inject_key: string; line: number }>(data, 'unprovided_injects')
  };
}

function parseDeadCodeReportData(data: Record<string, unknown> | null): DeadCodeReportData {
  const structural = parseDeadCodeStructural(data);
  const component = parseDeadCodeComponent(data);

  const totalGranular =
    structural.unusedFiles.length +
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

function renderDeadCodeJson(report: DeadCodeReportData, top: number): void {
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

interface DeadCodeSummaryRow {
  category: string;
  count: string;
  status: string;
}

function renderDeadCodeSummaryTable(report: DeadCodeReportData): void {
  const deadCodeCols: readonly TableColumn<DeadCodeSummaryRow>[] = [
    { header: 'CATEGORÍA / TIPO DE HALLAZGO', width: 49, align: 'left', key: 'category' },
    { header: 'INCIDENCIAS', width: 13, align: 'right', key: 'count' },
    { header: 'ESTADO', width: 8, align: 'center', key: 'status' }
  ];

  const deadCodeRows: DeadCodeSummaryRow[] = [
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

function printDeadCodeStructural(report: DeadCodeReportData, top: number): void {
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

function printDeadCodeSymbols(report: DeadCodeReportData, top: number): void {
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

function reportDeadCode(top: number, json: boolean): void {
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
  printCircularCycles(circular);
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

interface FallowSummaryMetrics {
  maintainability: number;
  totalWarnings: number;
  complexityCount: number;
  largeCount: number;
  targetsCount: number;
  hotspotsCount: number;
  circularCount: number;
  boundaryCount: number;
  unusedFilesCount: number;
  unusedExportsCount: number;
  unresolvedImportsCount: number;
  unusedDepsCount: number;
  dupeGroupsCount: number;
  securityCount: number;
}

function countArrayItems(record: Record<string, unknown> | null, key: string): number {
  if (!record) return 0;
  const val = record[key];
  return Array.isArray(val) ? val.length : 0;
}

function extractHealthMetrics(healthData: Record<string, unknown> | null): {
  maintainability: number;
  complexityCount: number;
  largeCount: number;
  targetsCount: number;
  hotspotsCount: number;
} {
  const summaryObj = (healthData && typeof healthData.summary === 'object' && healthData.summary !== null)
    ? healthData.summary as Record<string, number>
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

function extractDeadCodeMetrics(deadCodeData: Record<string, unknown> | null): {
  circularCount: number;
  boundaryCount: number;
  unusedFilesCount: number;
  unusedExportsCount: number;
  unresolvedImportsCount: number;
  unusedDepsCount: number;
} {
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

function collectSummaryMetrics(): FallowSummaryMetrics {
  const health = extractHealthMetrics(runFallowCommand('health'));
  const deadCode = extractDeadCodeMetrics(runFallowCommand('dead-code'));
  const dupesData = runFallowCommand('dupes');
  const securityData = runFallowCommand('security');

  const dupeGroupsCount = (dupesData?.clone_groups as Array<unknown>)?.length ?? 0;
  const securityCount = (securityData?.security_findings as Array<unknown>)?.length ?? 0;

  const totalWarnings = health.complexityCount + health.largeCount + health.targetsCount + deadCode.unusedFilesCount + deadCode.unusedExportsCount + deadCode.unresolvedImportsCount + deadCode.unusedDepsCount + dupeGroupsCount + securityCount;

  return {
    ...health,
    ...deadCode,
    dupeGroupsCount,
    securityCount,
    totalWarnings
  };
}

function printJsonSummary(m: FallowSummaryMetrics): void {
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

function printTableSummary(m: FallowSummaryMetrics): void {
  const maintStr = m.maintainability > 0 ? `${m.maintainability.toFixed(1)} / 100` : '-';
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

function reportAllSummary(json: boolean): void {
  const metrics = collectSummaryMetrics();
  if (json) {
    printJsonSummary(metrics);
  } else {
    printTableSummary(metrics);
  }
}


interface CoverageGapAction {
  type?: string;
  auto_fixable?: boolean;
  description?: string;
  note?: string;
}

interface CoverageGapItem {
  path?: string;
  export_name?: string;
  line?: number;
  col?: number;
  actions?: CoverageGapAction[];
}

interface CoverageGapsPayload {
  summary?: {
    runtime_files?: number;
    covered_files?: number;
    file_coverage_pct?: number;
    untested_files?: number;
    untested_exports?: number;
  };
  files?: unknown[];
  exports?: CoverageGapItem[];
}

function reportCoverageGaps(top: number, json: boolean): void {
  const data = runFallowCommand('health', ['--coverage-gaps']);
  const rawGaps = data?.coverage_gaps;
  const isArray = Array.isArray(rawGaps);
  const gaps: CoverageGapItem[] = isArray
    ? (rawGaps as CoverageGapItem[])
    : ((rawGaps as CoverageGapsPayload | undefined)?.exports ?? []);
  const summary = !isArray ? (rawGaps as CoverageGapsPayload | undefined)?.summary : undefined;

  if (json) {
    console.log(JSON.stringify({ summary, totalGaps: gaps.length, gaps: gaps.slice(0, top) }, null, 2));
    return;
  }

  const subtitle = summary?.file_coverage_pct !== undefined
    ? `Cobertura: ${summary.file_coverage_pct}% (${summary.covered_files}/${summary.runtime_files} archivos) • Brechas: ${gaps.length}`
    : `Exports alcanzables sin test: ${gaps.length}`;

  console.log('\n' + renderBanner('BRECHAS DE COBERTURA DE TESTS (FALLOW COVERAGE GAPS)', subtitle));

  if (gaps.length === 0) {
    console.log('\n  ' + styleText(['bold', 'green'], '✨ ¡Excelente! No se detectaron brechas de cobertura en exports alcanzables.\n'));
    return;
  }

  interface GapTableRow {
    index: string;
    location: string;
    name: string;
    note: string;
  }

  const rows: GapTableRow[] = gaps.slice(0, top).map((item, idx) => {
    const loc = `${item.path || 'General'}:${item.line || 1}`;
    const name = styleText('cyan', item.export_name || 'export');
    const note = item.actions?.[0]?.note || 'Export en runtime sin referencias desde tests';
    return {
      index: String(idx + 1),
      location: loc,
      name,
      note
    };
  });

  const columns: readonly TableColumn<GapTableRow>[] = [
    { header: '#', width: 3, align: 'center', key: 'index' },
    { header: 'UBICACIÓN', width: 38, align: 'left', key: 'location' },
    { header: 'SÍMBOLO / EXPORT', width: 24, align: 'left', key: 'name' },
    { header: 'ESTADO DE COBERTURA', width: 44, align: 'left', key: 'note' }
  ];

  console.log('\n' + renderBoxTable(columns, rows));
  console.log();
}

function executeComplexityReport(jsonOutput: boolean): void {
  const currentDir = import.meta.filename ? path.dirname(import.meta.filename) : path.resolve(process.cwd(), 'src/cli');
  const compScript = path.resolve(currentDir, 'report_complexity.ts');
  execSync(`node --permission --experimental-strip-types --allow-fs-read=* --allow-child-process "${compScript}" ${jsonOutput ? 'json' : ''}`, { stdio: 'inherit' });
}

export function runFallowReportCli(): void {
  const { category, top, jsonOutput } = parseCommandLineArgs();

  let exitCode = 0;
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
    case 'coverage-gaps':
    case 'coverage_gaps':
    case 'gaps':
      reportCoverageGaps(top, jsonOutput);
      break;
    case 'guard': {
      const posArgs = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.startsWith('category=') && a !== 'guard');
      exitCode = runGuardReport(process.cwd(), posArgs, { json: jsonOutput });
      break;
    }
    case 'flags': {
      exitCode = runFlagsReport(process.cwd(), {
        retirement: process.argv.includes('--retirement') || process.argv.includes('retirement'),
        top,
        json: jsonOutput
      });
      break;
    }
    case 'complexity':
      executeComplexityReport(jsonOutput);
      break;
    case 'all':
    default:
      reportAllSummary(jsonOutput);
      break;
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

if (isMainModule(import.meta.url)) {
  runFallowReportCli();
}
