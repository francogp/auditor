#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/report_fallow.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { styleText } from 'node:util';
import {
  COMMON_CLI_ARGS,
  getProcessCliArgs,
  parseCittyArgs,
  resolveHumanModeFromArgs,
  type CittyArgsDef
} from '../core/cli/cittyHarness.ts';
import { renderBanner, renderBoxTable, type TableColumn } from '../core/unifiedTheme.ts';
import { getAuditConfig, isInCodeRoots } from '../core/auditConfig.ts';
import { toPosixRelative } from '../core/safePath.ts';
import { parseJsonObjectOutput } from '../core/reportUtils.ts';
import {
  DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES,
  resolveCoverageArgs,
  isMainModule,
  bootstrapCliProject
} from './cliUtils.ts';
import { runGuardReport } from './report_guard.ts';
import { runFlagsReport } from './report_flags.ts';
import { resolveFallowBinary } from '../suites/architecture/validate_similar_code.ts';

const DEFAULT_TOP_LIMIT = 20;
const RADIX_DECIMAL = 10;

const VALID_CATEGORY_ALIASES = new Set([
  'dupes',
  'duplicates',
  'security',
  'cwe',
  'dead-code',
  'deadcode',
  'unused',
  'complexity',
  'circular',
  'exports',
  'orphans',
  'boundaries',
  'architecture',
  'boundary',
  'coverage-gaps',
  'coverage_gaps',
  'gaps',
  'guard',
  'flags',
  'suppressions',
  'stale-suppressions',
  'viz',
  'all'
]);

const FALLOW_REPORT_ARGS = {
  ...COMMON_CLI_ARGS,
  category: { type: 'string', description: 'Fallow analysis category' },
  categoryPos: { type: 'positional', required: false, description: 'Fallow analysis category' },
  top: { type: 'string', default: '20', description: 'Maximum items to display' },
  retirement: { type: 'boolean', default: false, description: 'Show retirement candidates for flags' }
} as const satisfies CittyArgsDef;

function parseCommandLineArgs() {
  const parsed = parseCittyArgs(FALLOW_REPORT_ARGS, getProcessCliArgs());
  const positionals = parsed._.map(String);

  const rawPosCategory =
    typeof parsed.categoryPos === 'string' &&
    VALID_CATEGORY_ALIASES.has(parsed.categoryPos.toLowerCase())
      ? parsed.categoryPos.toLowerCase()
      : '';
  let category = typeof parsed.category === 'string' ? parsed.category.toLowerCase() : rawPosCategory;
  const rawTopStr = String(parsed.top || '20');
  let top =
    rawTopStr === 'all'
      ? Number.MAX_SAFE_INTEGER
      : parseInt(rawTopStr, RADIX_DECIMAL) || DEFAULT_TOP_LIMIT;
  let jsonOutput = Boolean(parsed.json);
  let human = resolveHumanModeFromArgs(parsed);

  for (const pos of positionals) {
    const cleanPos = pos.toLowerCase();
    if (!category && VALID_CATEGORY_ALIASES.has(cleanPos)) {
      category = cleanPos;
    }
  }

  return {
    category: category.length > 0 ? category : 'all',
    top,
    jsonOutput,
    human,
    retirement: Boolean(parsed.retirement),
    positionals
  };
}

export type FallowCommandRunner = <T = Record<string, unknown>>(
  command: string,
  extraArgs?: string[]
) => T | null;

let customFallowRunner: FallowCommandRunner | null = null;

export function setFallowCommandRunner(runner: FallowCommandRunner | null): void {
  customFallowRunner = runner;
}

function runFallowCommand<T = Record<string, unknown>>(
  command: string,
  extraArgs: string[] = []
): T | null {
  if (customFallowRunner) {
    return customFallowRunner<T>(command, extraArgs);
  }
  // open-record: Generic key-value data dictionary container
  try {
    const effectiveExtra = [...extraArgs];
    if (command.startsWith('health')) {
      if (!effectiveExtra.includes('--report-only')) {
        effectiveExtra.push('--report-only');
      }
      if (!effectiveExtra.includes('--coverage')) {
        const covArgs = resolveCoverageArgs();
        if (covArgs.length > 0) {
          effectiveExtra.push(...covArgs);
        }
      }
    }
    const args = ['--format', 'json', ...effectiveExtra]; // no-domain: Non-domain utility collection or data structure
    const fallowBin =
      resolveFallowBinary(process.cwd()) ??
      path.resolve(process.cwd(), 'node_modules/fallow/bin/fallow');
    const cmd = `node "${fallowBin}" ${command} ${args.join(' ')}`;
    const stdout = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
    });
    return parseJsonObjectOutput<T>(stdout);
  } catch (e: unknown) {
    return parseJsonObjectOutput<T>(e);
  }
}

function reportDupes(top: number, json: boolean, human = false): void {
  const data = runFallowCommand('dupes');
  const groups =
    (data?.clone_groups as Array<{
      duplicated_tokens?: number;
      token_count?: number;
      instances?: Array<{ path?: string; file?: string; line?: number; start_line?: number }>;
    }>) || [];

  if (json) {
    console.log(
      JSON.stringify({ totalGroups: groups.length, groups: groups.slice(0, top) }, null, 2)
    );
    return;
  }

  if (!human) {
    console.log(`[Fallow] Clone groups: ${groups.length}`);
    for (const g of groups.slice(0, top)) {
      const locs = (g.instances || [])
        .map((i) => `${path.basename(i.path || i.file || '')}:${i.start_line || i.line || 0}`)
        .join(', ');
      console.log(`  [Clone] tokens=${g.token_count || g.duplicated_tokens || 0} locations=${locs}`);
    }
    return;
  }

  console.log(
    '\n' +
      renderBanner(
        'CODE DUPLICATION & CLONES (FALLOW)',
        `Detected groups: ${groups.length}`
      )
  );

  if (groups.length === 0) {
    console.log(
      '\n  ' +
        styleText(
          ['bold', 'green'],
          '[OK] Zero duplicate code blocks found.\n'
        )
    );
    return;
  }

  console.log(`\n[Notice] Top ${Math.min(top, groups.length)} duplicate groups:\n`);

  interface DupeRow {
    index: string;
    type: string;
    tokens: string;
    locations: string;
  }

  const dupeCols: readonly TableColumn<DupeRow>[] = [
    { header: '#', width: 3, align: 'center', key: 'index' },
    { header: 'TYPE', width: 14, align: 'center', key: 'type' },
    { header: 'TOKENS', width: 8, align: 'right', key: 'tokens' },
    { header: 'CLONED CODE LOCATIONS', width: 41, align: 'left', key: 'locations' }
  ];

  const dupeRows: DupeRow[] = groups.slice(0, top).map((g, idx) => {
    const tokens = g.token_count || g.duplicated_tokens || 0;
    const instances = g.instances || [];
    const isTriplicate = instances.length >= 3;
    const typeLabel = isTriplicate
      ? styleText('yellow', 'TRIPLICATE')
      : styleText('cyan', 'DUPLICATE');
    const locs = instances
      .map((i) => `${path.basename(i.path || i.file || '')}:${i.start_line || i.line || 0}`)
      .join(', ');
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

function reportSecurity(top: number, json: boolean, human = false): void {
  const data = runFallowCommand('security');
  const rawFindings =
    (data?.security_findings as Array<{
      path?: string;
      line?: number;
      cwe?: number;
      kind?: string;
      evidence?: string;
    }>) || [];
  const config = getAuditConfig();

  const findings = rawFindings.filter((f) => {
    const norm = toPosixRelative(process.cwd(), f.path || '');
    return isInCodeRoots(norm, config);
  });

  if (json) {
    console.log(
      JSON.stringify({ totalSecurity: findings.length, findings: findings.slice(0, top) }, null, 2)
    );
    return;
  }

  if (!human) {
    console.log(`[Fallow] Security findings: ${findings.length}`);
    for (const f of findings.slice(0, top)) {
      console.log(`  [Security] ${f.path}:${f.line} [CWE-${f.cwe || '?'}] ${f.evidence || f.kind || ''}`);
    }
    return;
  }

  console.log(
    '\n' +
      renderBanner(
        'SECURITY & CWE VULNERABILITIES (FALLOW)',
        `Source code findings: ${findings.length}`
      )
  );

  if (findings.length === 0) {
    console.log(
      '\n  ' +
        styleText(
          ['bold', 'green'],
          '[OK] 0 security vulnerabilities detected in source code.\n'
        )
    );
    return;
  }

  console.log(`\n[Notice] Top ${Math.min(top, findings.length)} CWE findings:\n`);

  interface SecurityRow {
    index: string;
    cwe: string;
    location: string;
    description: string;
  }

  const secCols: readonly TableColumn<SecurityRow>[] = [
    { header: '#', width: 3, align: 'center', key: 'index' },
    { header: 'CWE', width: 9, align: 'center', key: 'cwe' },
    { header: 'LOCATION', width: 25, align: 'left', key: 'location' },
    { header: 'DESCRIPTION', width: 29, align: 'left', key: 'description' }
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
  const filesList =
    Array.isArray(c.files) && c.files.length > 0 ? c.files : Array.isArray(c.cycle) ? c.cycle : [];
  return filesList.length > 0 ? filesList.join(' → ') : c.path || '';
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
  unusedStoreMembers: Array<{
    path: string;
    parent_name: string;
    member_name: string;
    line: number;
  }>;
  unusedClassMembers: Array<{
    path: string;
    parent_name: string;
    member_name: string;
    line: number;
  }>;
  unusedTypes: Array<{ path: string; export_name: string; line: number }>;
  unusedEmits: Array<{ path: string; component_name: string; emit_name: string; line: number }>;
  unlistedDeps: Array<{
    package_name: string;
    imported_from?: Array<{ path: string; line: number }>;
  }>;
  duplicateExports: Array<{
    export_name: string;
    locations?: Array<{ path: string; line: number }>;
  }>;
  boundaryViolations: Array<{
    from_path?: string;
    to_path?: string;
    from_zone?: string;
    to_zone?: string;
    import_specifier?: string;
    line?: number;
  }>;
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
    unusedExports: getArrayField<{ path: string; line: number; export_name: string }>(
      data,
      'unused_exports'
    ),
    unusedDeps: getArrayField<{ package_name: string }>(data, 'unused_dependencies'),
    circular: getArrayField<FallowCycleItem>(data, 'circular_dependencies'),
    boundaryViolations: getArrayField<{
      from_path?: string;
      to_path?: string;
      from_zone?: string;
      to_zone?: string;
      import_specifier?: string;
      line?: number;
    }>(data, 'boundary_violations'),
    unresolvedImports: getArrayField<{ path: string; specifier: string; line: number }>(
      data,
      'unresolved_imports'
    )
  };
}

function parseDeadCodeComponent(data: Record<string, unknown> | null) {
  return {
    unusedStoreMembers: getArrayField<{
      path: string;
      parent_name: string;
      member_name: string;
      line: number;
    }>(data, 'unused_store_members'),
    unusedClassMembers: getArrayField<{
      path: string;
      parent_name: string;
      member_name: string;
      line: number;
    }>(data, 'unused_class_members'),
    unusedTypes: getArrayField<{ path: string; export_name: string; line: number }>(
      data,
      'unused_types'
    ),
    unusedEmits: getArrayField<{
      path: string;
      component_name: string;
      emit_name: string;
      line: number;
    }>(data, 'unused_component_emits'),
    unlistedDeps: getArrayField<{
      package_name: string;
      imported_from?: Array<{ path: string; line: number }>;
    }>(data, 'unlisted_dependencies'),
    duplicateExports: getArrayField<{
      export_name: string;
      locations?: Array<{ path: string; line: number }>;
    }>(data, 'duplicate_exports'),
    unusedProps: getArrayField<{
      path: string;
      component_name: string;
      prop_name: string;
      line: number;
    }>(data, 'unused_component_props'),
    unrenderedComponents: getArrayField<{ path: string; component_name: string; line: number }>(
      data,
      'unrendered_components'
    ),
    unprovidedInjects: getArrayField<{ path: string; inject_key: string; line: number }>(
      data,
      'unprovided_injects'
    )
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
  console.log(
    JSON.stringify(
      {
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
      },
      null,
      2
    )
  );
}

interface DeadCodeSummaryRow {
  category: string;
  count: string;
  status: string;
}

function renderDeadCodeSummaryTable(report: DeadCodeReportData): void {
  const deadCodeCols: readonly TableColumn<DeadCodeSummaryRow>[] = [
    { header: 'CATEGORY / FINDING TYPE', width: 49, align: 'left', key: 'category' },
    { header: 'FINDINGS', width: 13, align: 'right', key: 'count' },
    { header: 'STATUS', width: 8, align: 'center', key: 'status' }
  ];

  const deadCodeRows: DeadCodeSummaryRow[] = [
    {
      category: 'Circular dependencies',
      count: String(report.circular.length),
      status: report.circular.length === 0 ? styleText('green', 'OK') : styleText('red', 'FAIL')
    },
    {
      category: 'Architectural boundaries',
      count: String(report.boundaryViolations.length),
      status:
        report.boundaryViolations.length === 0 ? styleText('green', 'OK') : styleText('red', 'FAIL')
    },
    {
      category: 'Orphan files',
      count: String(report.unusedFiles.length),
      status: report.unusedFiles.length === 0 ? styleText('green', 'OK') : styleText('red', 'FAIL')
    },
    {
      category: 'Unresolved imports',
      count: String(report.unresolvedImports.length),
      status:
        report.unresolvedImports.length === 0 ? styleText('green', 'OK') : styleText('yellow', 'WARN')
    },
    {
      category: 'Unused dependencies',
      count: String(report.unusedDeps.length),
      status: report.unusedDeps.length === 0 ? styleText('green', 'OK') : styleText('yellow', 'WARN')
    },
    {
      category: 'Unused value exports',
      count: String(report.unusedExports.length),
      status: report.unusedExports.length === 0 ? styleText('green', 'OK') : styleText('yellow', 'WARN')
    },
    {
      category: 'Unused store members',
      count: String(report.unusedStoreMembers.length),
      status:
        report.unusedStoreMembers.length === 0 ? styleText('green', 'OK') : styleText('yellow', 'WARN')
    },
    {
      category: 'Unused class members',
      count: String(report.unusedClassMembers.length),
      status:
        report.unusedClassMembers.length === 0 ? styleText('green', 'OK') : styleText('yellow', 'WARN')
    },
    {
      category: 'Unused exported types',
      count: String(report.unusedTypes.length),
      status: report.unusedTypes.length === 0 ? styleText('green', 'OK') : styleText('yellow', 'WARN')
    },
    {
      category: 'Unlisted dependencies',
      count: String(report.unlistedDeps.length),
      status: report.unlistedDeps.length === 0 ? styleText('green', 'OK') : styleText('yellow', 'WARN')
    },
    {
      category: 'Duplicate exports',
      count: String(report.duplicateExports.length),
      status:
        report.duplicateExports.length === 0 ? styleText('green', 'OK') : styleText('yellow', 'WARN')
    },
    {
      category: 'Component emits (Vue)',
      count: String(report.unusedEmits.length),
      status: report.unusedEmits.length === 0 ? styleText('green', 'OK') : styleText('yellow', 'WARN')
    },
    {
      category: 'Unused props (Vue SFC)',
      count: String(report.unusedProps.length),
      status: report.unusedProps.length === 0 ? styleText('green', 'OK') : styleText('yellow', 'WARN')
    },
    {
      category: 'Unrendered components',
      count: String(report.unrenderedComponents.length),
      status:
        report.unrenderedComponents.length === 0 ? styleText('green', 'OK') : styleText('yellow', 'WARN')
    },
    {
      category: 'Unprovided injections',
      count: String(report.unprovidedInjects.length),
      status:
        report.unprovidedInjects.length === 0 ? styleText('green', 'OK') : styleText('yellow', 'WARN')
    }
  ];

  console.log('\n' + renderBoxTable(deadCodeCols, deadCodeRows));
}

function printDeadCodeStructural(report: DeadCodeReportData, top: number): void {
  if (report.boundaryViolations.length > 0) {
    console.log('\n[FAIL] Architectural Boundary Violations:');
    report.boundaryViolations.forEach((b, idx) => {
      console.log(`  [${idx + 1}] '${b.from_zone}' -> '${b.to_zone}' in ${b.from_path}:${b.line}`);
      console.log(`       Import: ${b.import_specifier || b.to_path}`);
    });
  }

  if (report.circular.length > 0) {
    console.log('\n[FAIL] Critical Circular Dependencies:');
    printCircularCycles(report.circular);
  }

  if (report.unusedFiles.length > 0) {
    console.log(`\n[WARN] Orphan Files (${report.unusedFiles.length}):`);
    report.unusedFiles.slice(0, top).forEach((f, idx) => console.log(`  [${idx + 1}] ${f.path}`));
  }

  if (report.unusedDeps.length > 0) {
    console.log(`\n[WARN] Unused package.json Dependencies (${report.unusedDeps.length}):`);
    report.unusedDeps.forEach((d) => console.log(`  • ${d.package_name}`));
  }

  if (report.duplicateExports.length > 0) {
    console.log(`\n[WARN] Duplicate Exports (${report.duplicateExports.length}):`);
    report.duplicateExports.forEach((d, idx) => {
      const locs = d.locations?.map((l) => `${l.path}:${l.line}`).join(', ') || '';
      console.log(`  [${idx + 1}] '${d.export_name}' in: ${locs}`);
    });
  }

  if (report.unlistedDeps.length > 0) {
    console.log(`\n[FAIL] Unlisted Dependencies in package.json (${report.unlistedDeps.length}):`);
    report.unlistedDeps.forEach((d, idx) => {
      const firstLoc = d.imported_from?.[0]
        ? ` (imported in ${d.imported_from[0].path}:${d.imported_from[0].line})`
        : '';
      console.log(`  [${idx + 1}] '${d.package_name}'${firstLoc}`);
    });
  }
}

function printDeadCodeSymbols(report: DeadCodeReportData, top: number): void {
  if (report.unusedEmits.length > 0) {
    console.log(`\n[INFO] Unused Component Emits (${report.unusedEmits.length}):`);
    report.unusedEmits.forEach((e, idx) => {
      console.log(
        `  [${idx + 1}] ${e.path}:${e.line} -> '${e.component_name}' emit '${e.emit_name}'`
      );
    });
  }

  if (report.unusedStoreMembers.length > 0) {
    console.log(
      `\n[INFO] Top Unused Store Members (${Math.min(top, report.unusedStoreMembers.length)} of ${report.unusedStoreMembers.length}):`
    );
    report.unusedStoreMembers
      .slice(0, top)
      .forEach((sm, idx) =>
        console.log(`  [${idx + 1}] ${sm.path}:${sm.line} -> ${sm.parent_name}.${sm.member_name}`)
      );
  }

  if (report.unusedClassMembers.length > 0) {
    console.log(
      `\n[INFO] Top Unused Class Members (${Math.min(top, report.unusedClassMembers.length)} of ${report.unusedClassMembers.length}):`
    );
    report.unusedClassMembers
      .slice(0, top)
      .forEach((cm, idx) =>
        console.log(`  [${idx + 1}] ${cm.path}:${cm.line} -> ${cm.parent_name}.${cm.member_name}`)
      );
  }

  if (report.unusedTypes.length > 0) {
    console.log(
      `\n[INFO] Top Unused Exported Types (${Math.min(top, report.unusedTypes.length)} of ${report.unusedTypes.length}):`
    );
    report.unusedTypes
      .slice(0, top)
      .forEach((ut, idx) =>
        console.log(`  [${idx + 1}] ${ut.path}:${ut.line} -> type '${ut.export_name}'`)
      );
  }

  if (report.unusedExports.length > 0) {
    console.log(
      `\n[INFO] Top Unused Value Exports (${Math.min(top, report.unusedExports.length)} of ${report.unusedExports.length}):`
    );
    report.unusedExports
      .slice(0, top)
      .forEach((x, idx) =>
        console.log(`  [${idx + 1}] ${x.path}:${x.line} -> export '${x.export_name}'`)
      );
  }
}

function reportDeadCode(top: number, json: boolean, human = false): void {
  const data = runFallowCommand('dead-code');
  const report = parseDeadCodeReportData(data);

  if (json) {
    renderDeadCodeJson(report, top);
    return;
  }

  if (!human) {
    console.log(
      `[Fallow] Dead code findings: ${report.totalGranular} (circular: ${report.circular.length}, boundaries: ${report.boundaryViolations.length}, orphan files: ${report.unusedFiles.length}, unused exports: ${report.unusedExports.length})`
    );
    if (report.boundaryViolations.length > 0) {
      console.log(`  [Boundaries] ${report.boundaryViolations.length} boundary violation(s):`);
      for (const b of report.boundaryViolations.slice(0, top)) {
        console.log(`    • ${b.from_zone} -> ${b.to_zone} in ${b.from_path}:${b.line}`);
      }
    }
    if (report.circular.length > 0) {
      console.log(`  [Circular] ${report.circular.length} cycle(s):`);
      for (const c of report.circular.slice(0, top)) {
        console.log(`    • ${(c.files || c.cycle || []).join(' -> ')}`);
      }
    }
    if (report.unusedFiles.length > 0) {
      console.log(`  [Orphans] ${report.unusedFiles.length} orphan file(s):`);
      for (const f of report.unusedFiles.slice(0, top)) {
        console.log(`    • ${f.path}`);
      }
    }
    return;
  }

  console.log(
    '\n' +
      renderBanner(
        'DEAD CODE & DEPENDENCIES (FALLOW)',
        `Total findings: ${report.totalGranular}`
      )
  );
  renderDeadCodeSummaryTable(report);
  printDeadCodeStructural(report, top);
  printDeadCodeSymbols(report, top);
  console.log('');
}

function reportCircular(json: boolean, human = false): void {
  const data = runFallowCommand('dead-code', ['--circular-deps']);
  const circular =
    (data?.circular_dependencies as Array<{ path?: string; cycle?: string[]; files?: string[] }>) ||
    [];

  if (json) {
    console.log(JSON.stringify({ circularDepsCount: circular.length, circular }, null, 2));
    return;
  }

  if (!human) {
    console.log(`[Fallow] Circular dependencies: ${circular.length}`);
    for (const c of circular) {
      console.log(`  [Circular] ${(c.files || c.cycle || []).join(' -> ')}`);
    }
    return;
  }

  console.log(
    '\n' + renderBanner('CIRCULAR DEPENDENCIES (FALLOW)', `Detected cycles: ${circular.length}`)
  );

  if (circular.length === 0) {
    console.log(
      '\n  ' +
        styleText(
          ['bold', 'green'],
          '[OK] Zero circular dependencies detected in the project.\n'
        )
    );
    return;
  }

  console.log('\n[Notice] Detected cycles:\n');
  printCircularCycles(circular);
  console.log('');
}

function reportExports(top: number, json: boolean, human = false): void {
  const data = runFallowCommand('dead-code', ['--unused-exports']);
  const unusedExports =
    (data?.unused_exports as Array<{ path: string; line: number; export_name: string }>) || [];

  if (json) {
    console.log(
      JSON.stringify(
        { unusedExportsCount: unusedExports.length, unusedExports: unusedExports.slice(0, top) },
        null,
        2
      )
    );
    return;
  }

  if (!human) {
    console.log(`[Fallow] Unused exports: ${unusedExports.length}`);
    for (const x of unusedExports.slice(0, top)) {
      console.log(`  [Export] ${x.path}:${x.line} -> ${x.export_name}`);
    }
    return;
  }

  console.log(
    '\n' + renderBanner('UNUSED EXPORTS (FALLOW)', `Total unused: ${unusedExports.length}`)
  );

  if (unusedExports.length === 0) {
    console.log(
      '\n  ' + styleText(['bold', 'green'], '[OK] 0 unused exports detected.\n')
    );
    return;
  }

  const showCount = Math.min(top, unusedExports.length);
  console.log(`\n[Notice] Top Unused Exports (${showCount} of ${unusedExports.length}):\n`);

  interface ExportRow {
    index: string;
    exportName: string;
    location: string;
  }

  const expCols: readonly TableColumn<ExportRow>[] = [
    { header: '#', width: 3, align: 'center', key: 'index' },
    { header: 'UNUSED EXPORT', width: 28, align: 'left', key: 'exportName' },
    { header: 'CODE LOCATION', width: 39, align: 'left', key: 'location' }
  ];

  const expRows: ExportRow[] = unusedExports.slice(0, top).map((x, idx) => ({
    index: String(idx + 1),
    exportName: x.export_name,
    location: `${x.path}:${x.line}`
  }));

  console.log(renderBoxTable(expCols, expRows));
  console.log('');
}

function reportBoundaries(json: boolean, human = false): void {
  const data = runFallowCommand('dead-code');
  const boundaries =
    (data?.boundary_violations as Array<{
      from_path?: string;
      to_path?: string;
      from_zone?: string;
      to_zone?: string;
      import_specifier?: string;
      line?: number;
    }>) || [];

  if (json) {
    console.log(
      JSON.stringify({ totalBoundaries: boundaries.length, violations: boundaries }, null, 2)
    );
    return;
  }

  if (!human) {
    console.log(`[Fallow] Architectural boundary violations: ${boundaries.length}`);
    for (const b of boundaries) {
      console.log(`  [Boundary] ${b.from_zone} -> ${b.to_zone} in ${b.from_path}:${b.line} (${b.import_specifier || b.to_path})`);
    }
    return;
  }

  console.log(
    '\n' +
      renderBanner(
        'ARCHITECTURAL BOUNDARIES (FALLOW)',
        `Violations detected: ${boundaries.length}`
      )
  );

  if (boundaries.length === 0) {
    console.log(
      '\n  ' +
        styleText(
          ['bold', 'green'],
          '[OK] 0 architectural boundary violations. Layer architecture is 100% isolated.\n'
        )
    );
    return;
  }

  console.log('\n[Notice] Detected violations:\n');

  interface BoundaryRow {
    index: string;
    transition: string;
    location: string;
  }

  const bndCols: readonly TableColumn<BoundaryRow>[] = [
    { header: '#', width: 3, align: 'center', key: 'index' },
    { header: 'LAYER TRANSITION', width: 28, align: 'left', key: 'transition' },
    { header: 'CODE LOCATION', width: 39, align: 'left', key: 'location' }
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
  const summaryObj =
    healthData && typeof healthData.summary === 'object' && healthData.summary !== null
      ? (healthData.summary as Record<string, number>) // open-record: Generic parsed health summary dictionary
      : null;
  const maintainability =
    summaryObj?.average_maintainability ?? summaryObj?.maintainability_index ?? 0;
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
  const unusedDeps =
    countArrayItems(deadCodeData, 'unused_dependencies') +
    countArrayItems(deadCodeData, 'unused_dev_dependencies');
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

  const totalWarnings =
    health.complexityCount +
    health.largeCount +
    health.targetsCount +
    deadCode.unusedFilesCount +
    deadCode.unusedExportsCount +
    deadCode.unresolvedImportsCount +
    deadCode.unusedDepsCount +
    dupeGroupsCount +
    securityCount;

  return {
    ...health,
    ...deadCode,
    dupeGroupsCount,
    securityCount,
    totalWarnings
  };
}

function printJsonSummary(m: FallowSummaryMetrics): void {
  console.log(
    JSON.stringify(
      {
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
      },
      null,
      2
    )
  );
}

function printTableSummary(m: FallowSummaryMetrics, human = false): void {
  const maintStr = m.maintainability > 0 ? `${m.maintainability.toFixed(1)} / 100` : '-';

  if (!human) {
    console.log(
      `[Fallow] Maintainability: ${maintStr} | Quality Indicators: ${m.totalWarnings}`
    );
    console.log(
      `  • Complexity: ${m.complexityCount} hotspots | Large functions: ${m.largeCount} | Refactor targets: ${m.targetsCount} | Churn: ${m.hotspotsCount}`
    );
    console.log(
      `  • Dead code: ${m.unusedFilesCount} orphan files | ${m.unusedExportsCount} unused exports | ${m.unusedDepsCount} unused deps`
    );
    console.log(
      `  • Architecture: ${m.boundaryCount} boundary violations | ${m.circularCount} circular deps | ${m.dupeGroupsCount} clone groups | ${m.securityCount} security findings`
    );
    return;
  }

  console.log(
    '\n' +
      renderBanner(
        'CODEBASE INTELLIGENCE DASHBOARD (FALLOW)',
        `Maintainability Index: ${maintStr}`
      )
  );

  interface SummaryRow {
    metric: string;
    value: string;
  }

  const sumCols: readonly TableColumn<SummaryRow>[] = [
    { header: 'PROJECT METRIC / INDICATOR', width: 56, align: 'left', key: 'metric' },
    { header: 'VALUE', width: 14, align: 'right', key: 'value' }
  ];

  const sumRows: SummaryRow[] = [
    { metric: 'Code maintainability index (Fallow)', value: maintStr },
    {
      metric: 'High complexity functions (cognitive/cyclomatic)',
      value: String(m.complexityCount)
    },
    { metric: 'Large functions (>60 LOC)', value: String(m.largeCount) },
    { metric: 'Files with high churn / change hotspots', value: String(m.hotspotsCount) },
    { metric: 'Recommended refactoring targets', value: String(m.targetsCount) },
    { metric: 'Orphan / unreachable files', value: String(m.unusedFilesCount) },
    { metric: 'Unused value exports', value: String(m.unusedExportsCount) },
    { metric: 'Unresolved imports', value: String(m.unresolvedImportsCount) },
    { metric: 'Unused package.json dependencies', value: String(m.unusedDepsCount) },
    { metric: 'Critical circular dependencies', value: String(m.circularCount) },
    { metric: 'Architectural boundary violations', value: String(m.boundaryCount) },
    { metric: 'Duplicated / cloned code blocks', value: String(m.dupeGroupsCount) },
    { metric: 'Security candidates (CWE in src/)', value: String(m.securityCount) }
  ];

  console.log('\n' + renderBoxTable(sumCols, sumRows));

  console.log('\nAVAILABLE COMMANDS IN NPM:');
  console.log('─────────────────────────────────────────────────────────────────────────────');
  console.log(
    '  • npm run auditor:complexity         → Cyclomatic and cognitive complexity report'
  );
  console.log('  • npm run auditor:fallow:dupes       → Cloned code detection');
  console.log('  • npm run auditor:fallow:circular    → Circular dependency detection');
  console.log('  • npm run auditor:fallow:exports     → Unused exports detection');
  console.log('  • npm run auditor:fallow:security    → Security and CWE audit');
  console.log('  • npm run auditor:fallow:dead-code   → Dead code and dependencies detection');
  console.log('  • npm run auditor:fallow:boundaries  → Architectural boundaries audit');
  console.log('  • npm run auditor                    → Unified audit suite');
  console.log('─────────────────────────────────────────────────────────────────────────────\n');
}

function reportAllSummary(json: boolean, human = false): void {
  const metrics = collectSummaryMetrics();
  if (json) {
    printJsonSummary(metrics);
  } else {
    printTableSummary(metrics, human);
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

function reportCoverageGaps(top: number, json: boolean, human = false): void {
  const data = runFallowCommand('health', ['--coverage-gaps']);
  const rawGaps = data?.coverage_gaps;
  const isArray = Array.isArray(rawGaps);
  const gaps: CoverageGapItem[] = isArray
    ? (rawGaps as CoverageGapItem[])
    : ((rawGaps as CoverageGapsPayload | undefined)?.exports ?? []);
  const summary = !isArray ? (rawGaps as CoverageGapsPayload | undefined)?.summary : undefined;

  if (json) {
    console.log(
      JSON.stringify({ summary, totalGaps: gaps.length, gaps: gaps.slice(0, top) }, null, 2)
    );
    return;
  }

  if (!human) {
    console.log(`[Fallow] Coverage gaps: ${gaps.length}`);
    for (const g of gaps.slice(0, top)) {
      console.log(
        `  [Gap] ${g.path || 'General'}:${g.line || 1} -> ${g.export_name || 'export'} (${g.actions?.[0]?.note || 'Runtime export without test references'})`
      );
    }
    return;
  }

  const subtitle =
    summary?.file_coverage_pct !== undefined
      ? `Coverage: ${summary.file_coverage_pct}% (${summary.covered_files}/${summary.runtime_files} files) • Gaps: ${gaps.length}`
      : `Reachable exports without tests: ${gaps.length}`;

  console.log(
    '\n' + renderBanner('TEST COVERAGE GAPS (FALLOW COVERAGE GAPS)', subtitle)
  );

  if (gaps.length === 0) {
    console.log(
      '\n  ' +
        styleText(
          ['bold', 'green'],
          '[OK] No coverage gaps detected in reachable exports.\n'
        )
    );
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
    const note = item.actions?.[0]?.note || 'Runtime export without test references';
    return {
      index: String(idx + 1),
      location: loc,
      name,
      note
    };
  });

  const columns: readonly TableColumn<GapTableRow>[] = [
    { header: '#', width: 3, align: 'center', key: 'index' },
    { header: 'LOCATION', width: 38, align: 'left', key: 'location' },
    { header: 'SYMBOL / EXPORT', width: 24, align: 'left', key: 'name' },
    { header: 'COVERAGE STATUS', width: 44, align: 'left', key: 'note' }
  ];

  console.log('\n' + renderBoxTable(columns, rows));
  console.log();
}

function executeComplexityReport(jsonOutput: boolean): void {
  const currentDir = import.meta.filename
    ? path.dirname(import.meta.filename)
    : path.resolve(process.cwd(), 'src/cli');
  const compScript = path.resolve(currentDir, 'report_complexity.ts');
  execSync(
    `node --permission --experimental-strip-types --allow-fs-read=* --allow-child-process "${compScript}" ${jsonOutput ? 'json' : ''}`,
    { stdio: 'inherit' }
  );
}

interface FallowSuppressionItem {
  readonly line: number;
  readonly kind: string;
  readonly level?: string;
  readonly origin?: string;
  readonly reason?: string | null;
  readonly reason_present?: boolean;
}

interface FallowSuppressionFile {
  readonly path: string;
  readonly suppressions: readonly FallowSuppressionItem[];
}

interface FallowSuppressionsPayload {
  readonly kind?: string;
  readonly summary?: {
    readonly total?: number;
    readonly files?: number;
    readonly without_reason?: number;
    readonly stale?: number;
    readonly by_kind?: readonly { kind: string; count: number }[];
  };
  readonly files?: readonly FallowSuppressionFile[];
}

function reportSuppressions(top: number, json: boolean, human = false): void {
  const data = runFallowCommand<FallowSuppressionsPayload>('suppressions');
  const files = data?.files ?? [];
  const summary = data?.summary;

  const flattened: Array<{ path: string; suppression: FallowSuppressionItem }> = [];
  for (const f of files) {
    for (const s of f.suppressions || []) {
      flattened.push({ path: f.path, suppression: s });
    }
  }

  if (json) {
    console.log(
      JSON.stringify(
        { summary, total: flattened.length, suppressions: flattened.slice(0, top) },
        null,
        2
      )
    );
    return;
  }

  if (!human) {
    console.log(
      `[Fallow] Active suppressions: ${flattened.length} (unjustified: ${summary?.without_reason ?? 0}, stale: ${summary?.stale ?? 0})`
    );
    for (const item of flattened.slice(0, top)) {
      console.log(
        `  [Suppression] ${item.path}:${item.suppression.line} [${item.suppression.kind}] reason: ${item.suppression.reason || 'unjustified'}`
      );
    }
    return;
  }

  const sub = summary
    ? `Total: ${summary.total ?? flattened.length} • Without justification: ${summary.without_reason ?? 0} • Stale: ${summary.stale ?? 0}`
    : `Total: ${flattened.length}`;

  console.log('\n' + renderBanner('ACTIVE SUPPRESSIONS INVENTORY (FALLOW SUPPRESSIONS)', sub));

  if (flattened.length === 0) {
    console.log(
      '\n  ' +
        styleText(
          ['bold', 'green'],
          '[OK] No active suppression comments or rules found.\n'
        )
    );
    return;
  }

  interface SuppressionTableRow {
    index: string;
    location: string;
    kind: string;
    level: string;
    reason: string;
  }

  const cols: readonly TableColumn<SuppressionTableRow>[] = [
    { header: '#', width: 3, align: 'center', key: 'index' },
    { header: 'LOCATION', width: 32, align: 'left', key: 'location' },
    { header: 'TYPE / RULE', width: 18, align: 'left', key: 'kind' },
    { header: 'LEVEL', width: 8, align: 'center', key: 'level' },
    { header: 'JUSTIFICATION', width: 38, align: 'left', key: 'reason' }
  ];

  const rows: SuppressionTableRow[] = flattened.slice(0, top).map((item, idx) => {
    const loc = `${item.path}:${item.suppression.line}`;
    const kind = styleText('cyan', item.suppression.kind || 'unknown');
    const level = item.suppression.level || 'line';
    const reasonText = item.suppression.reason
      ? item.suppression.reason
      : styleText('yellow', 'Unjustified');
    return {
      index: String(idx + 1),
      location: loc,
      kind,
      level,
      reason: reasonText
    };
  });

  console.log('\n' + renderBoxTable(cols, rows));
  console.log();
}

function reportViz(json: boolean, human = false): void {
  const fallowBin =
    resolveFallowBinary(process.cwd()) ??
    path.resolve(process.cwd(), 'node_modules/fallow/bin/fallow');
  const scratchDir = path.resolve(process.cwd(), 'scratch');
  const targetHtml = path.resolve(scratchDir, 'fallow_map.html');
  const defaultHtml = path.resolve(process.cwd(), 'fallow-viz.html');

  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  try {
    if (customFallowRunner) {
      fs.writeFileSync(targetHtml, '<html><body>Mock Viz</body></html>', 'utf-8');
      if (json) {
        console.log(
          JSON.stringify(
            { success: true, outputPath: 'scratch/fallow_map.html', message: 'Mock viz generated' },
            null,
            2
          )
        );
      } else {
        console.log('[Fallow] Visual map generated at: scratch/fallow_map.html');
      }
      return;
    }

    const cmd = `node "${fallowBin}" viz --no-open --out "${targetHtml}"`;
    const stdout = execSync(cmd, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
    });

    if (fs.existsSync(defaultHtml)) {
      if (!fs.existsSync(targetHtml)) {
        fs.copyFileSync(defaultHtml, targetHtml);
      }
      fs.unlinkSync(defaultHtml);
    }

    if (json) {
      console.log(
        JSON.stringify(
          { success: true, outputPath: 'scratch/fallow_map.html', message: stdout.trim() },
          null,
          2
        )
      );
      return;
    }

    if (!human) {
      console.log('[Fallow] Interactive codebase map generated at: scratch/fallow_map.html');
      return;
    }

    console.log(
      '\n' +
        renderBanner('INTERACTIVE CODEBASE MAP (FALLOW VIZ)', 'Interactive HTML visualization')
    );
    console.log('\n  ' + styleText(['bold', 'green'], '[OK] Interactive map generated successfully!\n'));
    console.log(`  Generated file: ${styleText('cyan', 'scratch/fallow_map.html')}`);
    console.log(`  Open it in your browser to inspect.\n`);
  } catch (err: unknown) {
    if (json) {
      console.log(
        JSON.stringify(
          { success: false, error: err instanceof Error ? err.message : String(err) },
          null,
          2
        )
      );
      return;
    }
    console.error(
      styleText(
        'red',
        `Error generating fallow viz: ${err instanceof Error ? err.message : String(err)}`
      )
    );
  }
}

type FallowReportHandler = (
  top: number,
  jsonOutput: boolean,
  human: boolean,
  extra: { retirement: boolean; positionals: readonly string[] }
) => number | void;

const REPORT_DISPATCH_MAP: Record<string, FallowReportHandler> = {
  dupes: (top, json, human) => reportDupes(top, json, human),
  duplicates: (top, json, human) => reportDupes(top, json, human),
  security: (top, json, human) => reportSecurity(top, json, human),
  cwe: (top, json, human) => reportSecurity(top, json, human),
  circular: (_top, json, human) => reportCircular(json, human),
  'circular-deps': (_top, json, human) => reportCircular(json, human),
  exports: (top, json, human) => reportExports(top, json, human),
  'unused-exports': (top, json, human) => reportExports(top, json, human),
  'dead-code': (top, json, human) => reportDeadCode(top, json, human),
  deadcode: (top, json, human) => reportDeadCode(top, json, human),
  unused: (top, json, human) => reportDeadCode(top, json, human),
  boundaries: (_top, json, human) => reportBoundaries(json, human),
  architecture: (_top, json, human) => reportBoundaries(json, human),
  boundary: (_top, json, human) => reportBoundaries(json, human),
  'coverage-gaps': (top, json, human) => reportCoverageGaps(top, json, human),
  coverage_gaps: (top, json, human) => reportCoverageGaps(top, json, human),
  gaps: (top, json, human) => reportCoverageGaps(top, json, human),
  guard: (_top, json, _human, extra) => {
    const posArgs = extra.positionals.filter((a) => a !== 'guard');
    return runGuardReport(process.cwd(), posArgs, { json });
  },
  flags: (top, json, _human, extra) => {
    return runFlagsReport(process.cwd(), {
      retirement: extra.retirement,
      top,
      json
    });
  },
  suppressions: (top, json, human) => reportSuppressions(top, json, human),
  'stale-suppressions': (top, json, human) => reportSuppressions(top, json, human),
  viz: (_top, json, human) => reportViz(json, human),
  complexity: (_top, json) => executeComplexityReport(json)
};

export function runFallowReportCli(): void {
  const { category, top, jsonOutput, human, retirement, positionals } = parseCommandLineArgs();
  const handler = REPORT_DISPATCH_MAP[category];
  const exitCode = handler
    ? (handler(top, jsonOutput, human, { retirement, positionals }) ?? 0)
    : (reportAllSummary(jsonOutput, human), 0);

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

if (isMainModule(import.meta.url)) {
  bootstrapCliProject();
  runFallowReportCli();
}
