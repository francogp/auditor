/**
 * packages/auditor/src/suites/architecture/validate_fallow.ts
 *
 * OFFICIAL FALLOW STATIC INTELLIGENCE & REFACTORING TARGETS AUDITOR
 *
 * Dedicated standalone auditor for Fallow intelligence engine:
 *   1. Duplicate and triplicate code detection.
 *   2. Static security vulnerability analysis (CWE sinks).
 *   3. Dead code, unused exports, files, dependencies, and circular dependencies.
 *   4. Structural complexity and refactoring targets enforcement.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig, isCliPath } from '../../core/auditConfig.ts';
import { toPosixRelative } from '../../core/safePath.ts';
import type {
  FindingSeverity,
  AuditorCapabilities,
  TieredCommandProfile,
  RemediationPhaseId
} from '../../core/auditContract.ts';
import type {
  FallowTargetPriority,
  FallowTargetPriorityNamed
} from '../../core/auditConfigTypes.ts';
import { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES } from '../../cli/cliUtils.ts';
import { resolveFallowBinary } from './validate_similar_code.ts';

export const FALLOW_RULES = [
  'fallow-refactoring-targets',
  'fallow-duplicate-code',
  'fallow-triplicate-code',
  'fallow-unused-exports',
  'fallow-unused-files',
  'fallow-unused-dependencies',
  'fallow-circular-dependencies',
  'fallow-boundary-violations',
  'fallow-stale-suppressions',
  'fallow-workspace-diagnostic',
  'fallow-security-cwe'
] as const;

export type FallowRuleId = (typeof FALLOW_RULES)[number];

export const FALLOW_RULE_CAPABILITIES: Record<FallowRuleId, AuditorCapabilities> = {
  'fallow-boundary-violations': {
    speed: ['light', 'full'],
    phase: 'normal',
    fix: 'none',
    md: false,
    ast: false,
    changedOnly: true,
    critical: false
  },
  'fallow-stale-suppressions': {
    speed: ['light', 'full'],
    phase: 'normal',
    fix: 'none',
    md: false,
    ast: false,
    changedOnly: true,
    critical: false
  },
  'fallow-workspace-diagnostic': {
    speed: ['light', 'full'],
    phase: 'normal',
    fix: 'none',
    md: false,
    ast: false,
    changedOnly: true,
    critical: false
  },
  'fallow-refactoring-targets': {
    speed: 'heavy',
    phase: 'normal',
    fix: 'none',
    md: false,
    ast: false,
    changedOnly: true,
    critical: false
  },
  'fallow-duplicate-code': {
    speed: 'heavy',
    phase: 'normal',
    fix: 'none',
    md: false,
    ast: false,
    changedOnly: true,
    critical: false
  },
  'fallow-triplicate-code': {
    speed: 'heavy',
    phase: 'normal',
    fix: 'none',
    md: false,
    ast: false,
    changedOnly: true,
    critical: false
  },
  'fallow-unused-exports': {
    speed: ['light', 'full'],
    phase: 'normal',
    fix: 'none',
    md: false,
    ast: false,
    changedOnly: true,
    critical: false
  },
  'fallow-unused-files': {
    speed: ['light', 'full'],
    phase: 'normal',
    fix: 'none',
    md: false,
    ast: false,
    changedOnly: true,
    critical: false
  },
  'fallow-unused-dependencies': {
    speed: 'heavy',
    phase: 'normal',
    fix: 'none',
    md: false,
    ast: false,
    changedOnly: true,
    critical: false
  },
  'fallow-circular-dependencies': {
    speed: 'heavy',
    phase: 'normal',
    fix: 'none',
    md: false,
    ast: false,
    changedOnly: true,
    critical: false
  },
  'fallow-security-cwe': {
    speed: 'light',
    phase: 'normal',
    fix: 'none',
    md: false,
    ast: false,
    changedOnly: true,
    critical: false
  }
};

export const FALLOW_RULE_DESCRIPTIONS: Record<FallowRuleId, string> = {
  'fallow-refactoring-targets': 'Fallow refactoring targets',
  'fallow-duplicate-code': 'Duplicate code detected',
  'fallow-triplicate-code': 'Critical triplicate code',
  'fallow-unused-exports': 'Unused exports in code',
  'fallow-unused-files': 'Dead or unused files',
  'fallow-unused-dependencies': 'Unused dependencies',
  'fallow-circular-dependencies': 'Circular dependencies',
  'fallow-boundary-violations': 'Boundary violations',
  'fallow-stale-suppressions': 'Stale suppressions',
  'fallow-workspace-diagnostic': 'Workspace diagnostic',
  'fallow-security-cwe': 'CWE security vulnerabilities'
};

export const FALLOW_RULE_REMEDIATIONS: Record<FallowRuleId, string> = {
  'fallow-refactoring-targets':
    '1. Root Cause:\n' +
    'The Fallow architecture analysis engine computes refactoring priority by combining ' +
    'cyclomatic complexity, cognitive complexity, file size (LOC), afferent/efferent coupling, ' +
    'and the count of dependent modules that amplify changes. A score above the configured threshold ' +
    '("fallow.maxTargetPriority", default "high" = 20, or "critical" = 30) indicates a high-risk architectural hotspot.\n\n' +
    '2. Diagnosis:\n' +
    '1. Run "npm run auditor:findings -- rule=fallow-refactoring-targets flat" to view affected files, ' +
    'exact priority score, and specific functions identified by Fallow.\n' +
    '2. Run "npm run auditor:complexity" to break down cyclomatic and cognitive complexity function by function.\n' +
    '3. Run "npm run auditor:fallow" to view overall dependency graph health.\n\n' +
    '3. Canonical Solution:\n' +
    '1. Functional Decomposition: Extract high cognitive complexity functions into pure helper functions, ' +
    'reducing nesting depth, branch conditions, and in-place mutations.\n' +
    '2. Modularize High-Impact Files: If the report indicates "Split high-impact file (N LOC), M dependents amplify every change", ' +
    'split the file into smaller, cohesive, decoupled subsystems.\n' +
    '3. Configuration in .auditor/audit.config.ts: Fallow assesses targets according to "config.fallow.maxTargetPriority" ("critical" >= 30, "high" >= 20). ' +
    'In monolithic systems or authorized coordinators, gating can be tuned via "fallow.enforceTargets: false" ' +
    'or raising the threshold upon explicit consultation with the human developer.\n' +
    '4. Disassembling node_modules or hot-patching third-party libraries to silence this check is STRICTLY PROHIBITED.\n\n' +
    '4. Example / Auto-fix command:\n' +
    '  Diagnostics:        npm run auditor:complexity\n' +
    '  Deduplication:      npm run auditor:dupes\n' +
    '  Target inspection:  npm run auditor:findings -- rule=fallow-refactoring-targets flat',

  'fallow-duplicate-code':
    '1. Root Cause:\n' +
    'Two structurally identical code fragments or syntactic clones exceeding Fallow token and line thresholds ' +
    'were detected, violating the DRY principle.\n\n' +
    '2. Diagnosis:\n' +
    'Run "npm run auditor:dupes" to inspect the consolidated table of duplicate blocks by file, ' +
    'or "npm run auditor:fallow:dupes" for a detailed clone view.\n\n' +
    '3. Canonical Solution:\n' +
    '1. Extract duplicated logic into a shared utility function, composable, or pure helper.\n' +
    '2. Use the official refactoring tool: "npm run auditor:dupes inspect <fingerprint>" ' +
    'to generate a plan and apply it with "npm run auditor:dupes apply <plan.json>".\n\n' +
    '4. Example / Auto-fix command:\n' +
    '  Discovery:   npm run auditor:dupes\n' +
    '  Inspection:  npm run auditor:dupes inspect <fingerprint>',

  'fallow-triplicate-code':
    '1. Root Cause:\n' +
    'A triplicate code block (present across 3 or more locations in the repository) was detected. ' +
    'Triplication represents severe technical debt and multiplies bug divergence risks.\n\n' +
    '2. Diagnosis:\n' +
    'Run "npm run auditor:dupes" to inspect fingerprints and files participating in the triplicate clone.\n\n' +
    '3. Canonical Solution:\n' +
    '1. Unify triplicate code into a Single Source of Truth (SSoT) in a shared common module.\n' +
    '2. Run "npm run auditor:dupes inspect <fingerprint>" and apply refactoring with ' +
    '"npm run auditor:dupes apply <plan.json> --worktree" to verify safely in an isolated tree.\n\n' +
    '4. Example / Auto-fix command:\n' +
    '  Triplicate discovery:  npm run auditor:dupes\n' +
    '  Detailed inspection:   npm run auditor:dupes inspect <fingerprint>',

  'fallow-unused-exports':
    '1. Root Cause:\n' +
    'A function, class, interface, type, or constant declared with "export" has no consumers or ' +
    'references in any other file across the repository or package entrypoints.\n\n' +
    '2. Diagnosis:\n' +
    'Run "npm run auditor:fallow:exports" or "npm run auditor:findings -- rule=fallow-unused-exports flat" ' +
    'to identify the unused export symbol and line number.\n\n' +
    '3. Canonical Solution:\n' +
    '1. If the symbol is consumed only within the file, remove the "export" keyword.\n' +
    '2. If the symbol is dead or obsolete code, delete it completely.\n' +
    '3. If the symbol is part of the public API exported by a library package, ensure the file is ' +
    'declared in package.json "exports" or configured as an entrypoint in .fallowrc.json.\n\n' +
    '4. Example / Auto-fix command:\n' +
    '  npm run auditor:fallow:exports',

  'fallow-unused-files':
    '1. Root Cause:\n' +
    'A source file is not imported or reached directly or transitively by any ' +
    'entrypoint in the dependency graph analyzed by Fallow.\n\n' +
    '2. Diagnosis:\n' +
    'Run "npm run auditor:findings -- rule=fallow-unused-files flat" to list orphan files.\n\n' +
    '3. Canonical Solution:\n' +
    '1. If the file is dead or abandoned code from prior refactors, delete it with "git rm".\n' +
    '2. If the file should be active, import it into the appropriate module.\n' +
    '3. If it is a standalone CLI script, config, or fixture, register it under "entryPoints" in .fallowrc.json.\n\n' +
    '4. Example / Auto-fix command:\n' +
    '  npm run auditor:fallow category=dead-code',

  'fallow-unused-dependencies':
    '1. Root Cause:\n' +
    'A package declared in package.json "dependencies" or "devDependencies" is neither imported nor referenced ' +
    'in any repository source file.\n\n' +
    '2. Diagnosis:\n' +
    'Run "npm run auditor:dependencies" or "npm run auditor:findings -- rule=fallow-unused-dependencies flat".\n\n' +
    '3. Canonical Solution:\n' +
    '1. Uninstall the unneeded package via "npm rm <package-name>".\n' +
    '2. If the package is strictly an indirect runtime requirement (e.g. testing engine or dynamic plugin), ' +
    'declare it in the dependency exemptions section in .fallowrc.json.\n\n' +
    '4. Example / Auto-fix command:\n' +
    '  npm run auditor:dependencies',

  'fallow-circular-dependencies':
    '1. Root Cause:\n' +
    'Two or more modules form a circular dependency loop (A imports B and B imports A), which can ' +
    'trigger undefined imports at startup, initialization errors, and memory leaks.\n\n' +
    '2. Diagnosis:\n' +
    'Run "npm run auditor:fallow:circular" to trace the exact circular dependency cycle.\n\n' +
    '3. Canonical Solution:\n' +
    '1. Break the cycle by extracting shared types, interfaces, or constants into a common neutral file.\n' +
    '2. Invert dependencies via dependency injection, callbacks, or event dispatchers.\n' +
    '3. Use "import type { ... }" if cross-dependencies are solely for TypeScript type definitions.\n\n' +
    '4. Example / Auto-fix command:\n' +
    '  npm run auditor:fallow:circular',

  'fallow-boundary-violations':
    '1. Root Cause:\n' +
    'A module imports code from another architectural tier, violating layer boundaries defined ' +
    'in .fallowrc.json (for example, client UI code importing server DB models directly).\n\n' +
    '2. Diagnosis:\n' +
    'Run "npm run auditor:findings -- rule=fallow-boundary-violations flat" to view offending imports and violated boundaries.\n\n' +
    '3. Canonical Solution:\n' +
    '1. Replace direct imports with public API contracts or domain DTOs provided by the target layer.\n' +
    '2. Encapsulate logic in authorized service intermediaries to maintain architectural decoupling.\n\n' +
    '4. Example / Auto-fix command:\n' +
    '  npm run auditor:findings -- rule=fallow-boundary-violations',

  'fallow-stale-suppressions':
    '1. Root Cause:\n' +
    'A Fallow suppression comment ("// " + "fallow" + "-ignore", etc.) exists on a line where no static ' +
    'violation occurs, cluttering source code with stale directives.\n\n' +
    '2. Diagnosis:\n' +
    'Run "npm run auditor:findings -- rule=fallow-stale-suppressions flat" to find the obsolete comment.\n\n' +
    '3. Canonical Solution:\n' +
    '1. Remove the obsolete suppression comment to maintain code cleanliness.\n\n' +
    '4. Example / Auto-fix command:\n' +
    '  npm run auditor:fallow category=suppressions',

  'fallow-workspace-diagnostic':
    '1. Root Cause:\n' +
    'Fallow detected a structural workspace configuration defect, such as tsconfig.json errors, ' +
    'unresolvable paths, or syntax issues in .fallowrc.json.\n\n' +
    '2. Diagnosis:\n' +
    'Review the diagnostic violation message and run "npm run auditor:tsconfig" and "npm run auditor:fallow-config".\n\n' +
    '3. Canonical Solution:\n' +
    '1. Correct compiler options or include paths in tsconfig.json.\n' +
    '2. Verify that .fallowrc.json is valid JSON conforming to the configuration schema.\n\n' +
    '4. Example / Auto-fix command:\n' +
    '  npm run auditor:tsconfig\n' +
    '  npm run auditor:fallow-config',

  'fallow-security-cwe':
    '1. Root Cause:\n' +
    'Fallow identified a code pattern susceptible to a security vulnerability cataloged in CWE ' +
    '(Common Weakness Enumeration), such as path traversal (CWE-22), injection, or unsafe input handling.\n\n' +
    '2. Diagnosis:\n' +
    'Run "npm run auditor:fallow:security" to inspect the CWE identifier and vulnerability risk vector.\n\n' +
    '3. Canonical Solution:\n' +
    '1. For user input validation, implement strict typed schemas with Valibot or domain types.\n' +
    '2. For path containment (CWE-22), always use "path.resolve()" + "path.relative()" from node:path.\n' +
    '3. Sanitize and escape arguments before interpolating into commands or queries.\n\n' +
    '4. Example / Auto-fix command:\n' +
    '  npm run auditor:fallow:security'
};

export const FALLOW_RULE_REMEDIATION_PHASES: Record<FallowRuleId, RemediationPhaseId> = {
  'fallow-unused-files': 'prune',
  'fallow-unused-exports': 'prune',
  'fallow-unused-dependencies': 'prune',
  'fallow-duplicate-code': 'dedup',
  'fallow-triplicate-code': 'dedup',
  'fallow-boundary-violations': 'contracts',
  'fallow-security-cwe': 'behavior',
  'fallow-refactoring-targets': 'hygiene',
  'fallow-circular-dependencies': 'hygiene',
  'fallow-stale-suppressions': 'hygiene',
  'fallow-workspace-diagnostic': 'setup'
};

export const FALLOW_CRITICAL_PRIORITY_THRESHOLD = 30;
export const FALLOW_HIGH_PRIORITY_THRESHOLD = 20;
export const FALLOW_MEDIUM_PRIORITY_THRESHOLD = 10;
export const FALLOW_MODERATE_PRIORITY_THRESHOLD = 10;
export const FALLOW_LOW_PRIORITY_THRESHOLD = 5;
export const FALLOW_ALL_PRIORITY_THRESHOLD = 1;

export const FALLOW_PRIORITY_MIN_THRESHOLDS: Record<FallowTargetPriorityNamed, number> = {
  critical: FALLOW_CRITICAL_PRIORITY_THRESHOLD,
  high: FALLOW_HIGH_PRIORITY_THRESHOLD,
  medium: FALLOW_MEDIUM_PRIORITY_THRESHOLD,
  moderate: FALLOW_MODERATE_PRIORITY_THRESHOLD,
  low: FALLOW_LOW_PRIORITY_THRESHOLD,
  all: FALLOW_ALL_PRIORITY_THRESHOLD
};

export function resolveFallowTargetMinThreshold(
  priority: FallowTargetPriority | undefined
): number {
  if (typeof priority === 'number') {
    return Number.isFinite(priority) ? Math.max(0, priority) : FALLOW_HIGH_PRIORITY_THRESHOLD;
  }
  if (typeof priority === 'string' && priority in FALLOW_PRIORITY_MIN_THRESHOLDS) {
    return FALLOW_PRIORITY_MIN_THRESHOLDS[priority as FallowTargetPriorityNamed];
  }
  return FALLOW_HIGH_PRIORITY_THRESHOLD;
}

const FALLOW_DUPES_CONFIG = ['--min-occurrences', '2'] as const;
const FALLOW_TRIPLETS_CONFIG = [
  '--min-occurrences',
  '3',
  '--min-lines',
  '10',
  '--min-tokens',
  '60'
] as const;

export interface FallowCloneGroup {
  readonly instances: Array<{ file: string; start_line: number }>;
  readonly duplicated_tokens?: number;
  readonly token_count?: number;
}

export interface FallowComplexityFinding {
  readonly path: string;
  readonly name?: string;
  readonly line: number;
  readonly cyclomatic?: number;
  readonly cognitive?: number;
  readonly line_count?: number;
  readonly exceeded?: string;
  readonly rule_id?: string;
  readonly message?: string;
}

export interface FallowTarget {
  readonly path: string;
  readonly priority?: number;
  readonly efficiency?: number;
  readonly recommendation?: string;
  readonly category?: string;
}

export interface FallowDeadCodeData {
  readonly unused_files?: Array<{ path: string }>;
  readonly unused_exports?: Array<{ path: string; export_name: string; line: number }>;
  readonly unused_dependencies?: Array<{ path?: string; package_name: string; line?: number }>;
  readonly unused_dev_dependencies?: Array<{ path?: string; package_name: string; line?: number }>;
  readonly circular_dependencies?: Array<{
    files?: string[];
    cycle?: string[];
    path?: string;
    line?: number;
    message?: string;
  }>;
  readonly stale_suppressions?: Array<{
    path?: string;
    file?: string;
    line?: number;
    message?: string;
    kind?: string;
    origin?: { issue_kind?: string; kind_known?: boolean };
  }>;
  readonly duplicate_exports?: Array<{
    export_name?: string;
    name?: string;
    locations?: Array<{ path?: string; file?: string; line?: number }>;
    path?: string;
    file?: string;
    line?: number;
  }>;
  readonly workspace_diagnostics?: Array<{ kind?: string; message?: string; path?: string }>;
  readonly unlisted_dependencies?: Array<{ path: string; package_name: string; line: number }>;
  readonly unresolved_imports?: Array<{ path: string; specifier: string; line: number }>;
}

export interface FallowAuditData extends FallowDeadCodeData {
  readonly clone_groups?: FallowCloneGroup[];
  readonly findings?: FallowComplexityFinding[];
  readonly dead_code?: FallowDeadCodeData;
  readonly boundary_violations?: Array<{ path: string; line: number; message: string }>;
  readonly targets?: FallowTarget[];
  readonly complexity?: { findings?: FallowComplexityFinding[] };
}

export interface FallowFindingItem {
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly context: string;
  readonly ruleId: FallowRuleId;
  readonly severity: FindingSeverity;
}

function mapCloneFindings(
  cloneGroups: readonly FallowCloneGroup[] | undefined,
  isTriplets: boolean,
  projectRoot: string
): FallowFindingItem[] {
  const findings: FallowFindingItem[] = [];
  const ruleId: FallowRuleId = isTriplets ? 'fallow-triplicate-code' : 'fallow-duplicate-code';
  const label = isTriplets
    ? 'Critical triplicate code detected by Fallow'
    : 'Duplicate code detected by Fallow';
  const context = isTriplets ? 'fallow-triplets' : 'fallow-dupes';

  for (const group of cloneGroups || []) {
    const tokens = group.token_count ?? group.duplicated_tokens ?? 0;
    for (const inst of group.instances || []) {
      findings.push({
        file: path.resolve(projectRoot, inst.file),
        line: inst.start_line,
        message: `${label} (${tokens} tokens)`,
        context,
        ruleId,
        severity: 'error'
      });
    }
  }
  return findings;
}

function mapSecurityFindings(
  findings: readonly FallowComplexityFinding[] | undefined,
  projectRoot: string
): FallowFindingItem[] {
  const res: FallowFindingItem[] = [];
  for (const f of findings || []) {
    if (isCliPath(f.path)) continue;
    res.push({
      file: path.resolve(projectRoot, f.path),
      line: f.line || 1,
      message: `Fallow security vulnerability: ${f.message || f.rule_id || 'CWE Sink'}`,
      context: f.rule_id || 'cwe',
      ruleId: 'fallow-security-cwe',
      severity: 'error'
    });
  }
  return res;
}

function mapUnusedFileFindings(
  files: readonly { path: string }[] | undefined,
  projectRoot: string
): FallowFindingItem[] {
  return (files || []).map((f) => ({
    file: path.resolve(projectRoot, f.path),
    line: 1,
    message: `Orphan unused file (Fallow Dead Code): '${f.path}'`,
    context: f.path,
    ruleId: 'fallow-unused-files',
    severity: 'error'
  }));
}

function mapUnusedExportFindings(
  exports: readonly { path: string; export_name: string; line: number }[] | undefined,
  projectRoot: string
): FallowFindingItem[] {
  return (exports || []).map((x) => ({
    file: path.resolve(projectRoot, x.path),
    line: x.line || 1,
    message: `Unused export (Fallow): '${x.export_name}'`,
    context: x.export_name,
    ruleId: 'fallow-unused-exports',
    severity: 'error'
  }));
}

function mapUnusedDepFindings(
  deps: readonly { path?: string; package_name: string; line?: number }[] | undefined,
  projectRoot: string
): FallowFindingItem[] {
  return (deps || []).map((d) => ({
    file: path.resolve(projectRoot, d.path || 'package.json'),
    line: d.line || 1,
    message: `Unused dependency in package.json (Fallow): '${d.package_name}'`,
    context: d.package_name,
    ruleId: 'fallow-unused-dependencies',
    severity: 'error'
  }));
}

function mapCircularDepFindings(
  circulars:
    | readonly {
        files?: string[];
        cycle?: string[];
        path?: string;
        line?: number;
        message?: string;
      }[]
    | undefined,
  projectRoot: string
): FallowFindingItem[] {
  return (circulars || []).map((c) => {
    const filesList = c.files || c.cycle || [];
    const filePath = c.path || filesList[0] || 'src';
    return {
      file: path.resolve(projectRoot, filePath),
      line: c.line || 1,
      message: `Critical circular dependency (Fallow): ${filesList.join(' → ') || c.message || filePath}`,
      context: filePath,
      ruleId: 'fallow-circular-dependencies',
      severity: 'error'
    };
  });
}

function mapBoundaryFindings(
  boundaries: readonly { path: string; line: number; message: string }[] | undefined,
  projectRoot: string
): FallowFindingItem[] {
  return (boundaries || []).map((b) => ({
    file: path.resolve(projectRoot, b.path),
    line: b.line || 1,
    message: `Architectural boundary violation (Fallow): ${b.message}`,
    context: b.message,
    ruleId: 'fallow-boundary-violations',
    severity: 'error'
  }));
}

function mapStaleSuppressions(
  suppressions:
    | readonly {
        path?: string;
        file?: string;
        line?: number;
        message?: string;
        kind?: string;
        origin?: { issue_kind?: string; kind_known?: boolean };
      }[]
    | undefined,
  projectRoot: string
): FallowFindingItem[] {
  const findings: FallowFindingItem[] = [];
  for (const s of suppressions || []) {
    if (s.origin?.issue_kind?.startsWith('cwe-') || s.origin?.kind_known === false) continue;
    findings.push({
      file: path.resolve(projectRoot, s.path || s.file || 'src'),
      line: s.line || 1,
      message: `Stale Fallow suppression: ${s.message || s.kind || ''}`,
      context: s.path || s.file || '',
      ruleId: 'fallow-stale-suppressions',
      severity: 'error'
    });
  }
  return findings;
}

function mapWorkspaceDiagFindings(
  diagnostics: readonly { kind?: string; message?: string; path?: string }[] | undefined,
  projectRoot: string
): FallowFindingItem[] {
  const findings: FallowFindingItem[] = [];
  for (const diag of diagnostics || []) {
    if (diag.kind === 'boundaries-not-configured' || diag.kind === 'rule-packs-not-configured')
      continue;
    findings.push({
      file: path.resolve(projectRoot, diag.path || 'package.json'),
      line: 1,
      message: `Workspace diagnostic (Fallow): [${diag.kind || 'diagnostic'}] ${diag.message || ''}`,
      context: diag.kind || 'diagnostic',
      ruleId: 'fallow-workspace-diagnostic',
      severity: 'error'
    });
  }
  return findings;
}

function mapDeadCodeFindings(data: FallowAuditData, projectRoot: string): FallowFindingItem[] {
  const dc = data.dead_code || data;
  const allDeps = [...(dc.unused_dependencies || []), ...(dc.unused_dev_dependencies || [])];

  return [
    ...mapUnusedFileFindings(dc.unused_files, projectRoot),
    ...mapUnusedExportFindings(dc.unused_exports, projectRoot),
    ...mapUnusedDepFindings(allDeps, projectRoot),
    ...mapCircularDepFindings(dc.circular_dependencies, projectRoot),
    ...mapBoundaryFindings(data.boundary_violations, projectRoot),
    ...mapStaleSuppressions(dc.stale_suppressions, projectRoot),
    ...mapWorkspaceDiagFindings(dc.workspace_diagnostics, projectRoot)
  ];
}

function mapHealthFindings(data: FallowAuditData, projectRoot: string): FallowFindingItem[] {
  const findings: FallowFindingItem[] = [];
  const cfg = getAuditConfig(projectRoot);
  if (cfg.fallow?.enforceTargets) {
    const minThreshold = resolveFallowTargetMinThreshold(cfg.fallow.maxTargetPriority);

    for (const t of data.targets || []) {
      const priority = t.priority ?? 0;
      if (priority < minThreshold) continue;

      findings.push({
        file: path.resolve(projectRoot, t.path),
        line: 1,
        message: `Critical refactoring target (Fallow [priority: ${priority}]): ${t.recommendation || t.category || 'Critical maintenance'}`,
        context: t.category || 'refactoring-target',
        ruleId: 'fallow-refactoring-targets',
        severity: 'error'
      });
    }
  }

  return findings;
}

export function mapFallowJson(
  command: string,
  data: FallowAuditData,
  projectRoot: string = process.cwd()
): FallowFindingItem[] {
  if (command === 'dupes') return mapCloneFindings(data.clone_groups, false, projectRoot);
  if (command === 'triplets') return mapCloneFindings(data.clone_groups, true, projectRoot);
  if (command === 'security') return mapSecurityFindings(data.findings, projectRoot);
  if (command === 'dead-code') return mapDeadCodeFindings(data, projectRoot);
  if (command === 'health') return mapHealthFindings(data, projectRoot);
  if (command === 'audit') {
    return [...mapDeadCodeFindings(data, projectRoot), ...mapHealthFindings(data, projectRoot)];
  }
  return [];
}

function tryParseFallowJson(raw: string | Buffer | undefined): FallowAuditData | null {
  if (!raw) return null;
  const str = typeof raw === 'string' ? raw : raw.toString('utf8');
  const start = str.indexOf('{');
  if (start === -1) return null;
  try {
    return JSON.parse(str.substring(start)) as FallowAuditData;
  } catch {
    // catch-ok: fallback error handled by caller
    return null;
  }
}

export interface FallowArchitectureAuditorOptions {
  readonly projectRoot?: string;
}

export class FallowArchitectureAuditor extends BaseAuditor<FallowRuleId> {
  constructor(options: FallowArchitectureAuditorOptions = {}) {
    const projectRoot = options.projectRoot ?? process.cwd();
    super({
      usesThirdPartyTool: true,
      requiredPermissions: ['--allow-child-process'],
      thirdPartyToolPolicy: {
        toolName: 'Fallow',
        fallbackBehavior: 'violation',
        fallbackRuleId: 'fallow-workspace-diagnostic'
      },
      ruleCapabilities: FALLOW_RULE_CAPABILITIES,
      id: 'validate_fallow',
      name: 'Fallow Architecture & Refactoring Targets',
      description: 'Audits dead code, targets, and CWE with Fallow',
      family: 'architecture',
      packageName: 'Fallow',
      configKey: 'fallow',
      defaultConfig: {
        enabled: true,
        typeAware: true,
        showCascade: true,
        duplicates: {
          nearMiss: true,
          mode: 'strict'
        },
        viz: {
          enabled: true,
          outputPath: 'scratch/fallow_map.html'
        }
      },
      criticalConfig: {},
      icon: '🌾',
      ruleIds: FALLOW_RULES,
      ruleDescriptions: FALLOW_RULE_DESCRIPTIONS,
      ruleRemediations: FALLOW_RULE_REMEDIATIONS,
      ruleRemediationPhases: FALLOW_RULE_REMEDIATION_PHASES,
      coverage: {
        include: ['src/**/*.{ts,js,vue}'],
        source: 'declared-only'
      },
      projectRoot
    });
  }

  private handleParsedFallowOutput(
    parsed: unknown,
    primaryRule: FallowRuleId,
    command: string
  ): FallowFindingItem[] | null {
    if (!parsed) return null;
    if (typeof (parsed as { elapsed_ms?: number }).elapsed_ms === 'number') {
      this.reportRuleDuration(primaryRule, (parsed as { elapsed_ms: number }).elapsed_ms);
    }
    return mapFallowJson(command, parsed, this.projectRoot);
  }

  private runFallowSubCommand(
    command: string,
    extraArgs: readonly string[] = [],
    associatedRules: readonly FallowRuleId[] = []
  ): FallowFindingItem[] {
    const fallowBin = resolveFallowBinary(this.projectRoot);
    if (!fallowBin) return [];
    const args = ['--format', 'json', ...extraArgs];
    const cliSubCommand = command === 'triplets' ? 'dupes' : command;
    const cmd = `node "${fallowBin}" ${cliSubCommand} ${args.join(' ')}`;
    const primaryRule = associatedRules[0] ?? 'fallow-workspace-diagnostic';
    return this.runSubAuditorSync(primaryRule, () => {
      try {
        const stdout = execSync(cmd, {
          cwd: this.projectRoot,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
          maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
        });
        const mapped = this.handleParsedFallowOutput(tryParseFallowJson(stdout), primaryRule, command);
        if (mapped) {
          return mapped;
        }
        if (stdout && stdout.trim().length > 0) {
          this.addViolation({
            ruleId: 'fallow-workspace-diagnostic',
            severity: 'error',
            file: 'fallow',
            line: 1,
            message: `Unexpected non-JSON output from fallow ${command}: ${stdout.trim().slice(0, 300)}`,
            context: `fallow ${command}`
          });
        }
      } catch (e: unknown) {
        const err = e as { stdout?: Buffer | string; message?: string };
        const mapped = this.handleParsedFallowOutput(tryParseFallowJson(err.stdout), primaryRule, command);
        if (mapped) {
          return mapped;
        }

        this.addViolation({
          ruleId: 'fallow-workspace-diagnostic',
          severity: 'error',
          file: 'fallow',
          line: 1,
          message: `Error executing fallow ${command}: ${err.message || String(e)}`,
          context: `fallow ${command}`
        });
      }
      return [];
    });
  }

  public override async runAudit(): Promise<void> {
    if (this.isSuiteGatingDisabled('Fallow disabled in configuration')) return;

    // Mark rules evaluated or not applicable according to the active tier
    for (const rule of FALLOW_RULES) {
      if (this.isRuleActiveForCurrentRun(rule)) {
        this.markRuleEvaluated(rule);
      } else {
        this.markRuleNotApplicable(rule, `Skipped in tier '${this.getExecutionTier()}'`);
      }
    }
    this.recordExternalScanCount(1);

    const config = getAuditConfig(this.projectRoot);
    const allFindings: FallowFindingItem[] = [];

    // Dead Code execution profile (Light syntax in light/heavy ceiling, Type-Aware cascade in full ceiling)
    const deadCodeProfile: TieredCommandProfile<string[]> = {
      command: 'fallow dead-code',
      profiles: {
        light: ['--no-type-aware'],
        full: (() => {
          const args: string[] = [];
          if (
            config.fallow?.typeAware !== false &&
            fs.existsSync(path.resolve(this.projectRoot, 'tsconfig.json'))
          ) {
            args.push('--type-aware');
          }
          if (config.fallow?.showCascade !== false) {
            args.push('--show-cascade');
          }
          return args;
        })()
      },
      defaultArgs: ['--no-type-aware']
    };
    const deadCodeArgs = this.resolveCommandArgs(deadCodeProfile);
    const deadCodeRules: readonly FallowRuleId[] = [
      'fallow-unused-exports',
      'fallow-unused-files',
      'fallow-boundary-violations',
      'fallow-stale-suppressions',
      'fallow-workspace-diagnostic'
    ];

    const executeFallowSecurity = (): void => {
      if (!this.isRuleActiveForCurrentRun('fallow-security-cwe')) return;
      const isSecActive = config.fallow?.security?.enabled ?? config.security?.enabled ?? true;
      if (isSecActive !== false) {
        allFindings.push(...this.runFallowSubCommand('security', [], ['fallow-security-cwe']));
      } else {
        this.markRuleNotApplicable(
          'fallow-security-cwe',
          'Disabled in config (fallow.security.enabled: false)'
        );
      }
    };

    if (this.isRuleActiveForCurrentRun('fallow-duplicate-code')) {
      const dupesArgs: string[] = [...FALLOW_DUPES_CONFIG];
      if (config.fallow?.duplicates?.nearMiss !== false) {
        dupesArgs.push('--dupes-near');
      }
      if (config.fallow?.duplicates?.mode) {
        dupesArgs.push('--dupes-mode', config.fallow.duplicates.mode);
      }
      allFindings.push(...this.runFallowSubCommand('dupes', dupesArgs, ['fallow-duplicate-code']));
    }

    if (this.isRuleActiveForCurrentRun('fallow-triplicate-code')) {
      allFindings.push(
        ...this.runFallowSubCommand('triplets', FALLOW_TRIPLETS_CONFIG, ['fallow-triplicate-code'])
      );
    }

    executeFallowSecurity();

    if (deadCodeRules.some((r) => this.isRuleActiveForCurrentRun(r))) {
      const deadCode = this.runFallowSubCommand('dead-code', deadCodeArgs, deadCodeRules);
      allFindings.push(...deadCode.filter((f) => this.isRuleActiveForCurrentRun(f.ruleId)));
    }

    const healthRules: readonly FallowRuleId[] = [
      'fallow-refactoring-targets',
      'fallow-circular-dependencies',
      'fallow-unused-dependencies'
    ];
    if (healthRules.some((r) => this.isRuleActiveForCurrentRun(r))) {
      const healthArgs: string[] = ['--targets', '--report-only'];
      const covPath = path.resolve(this.projectRoot, 'coverage/coverage-final.json');
      if (fs.existsSync(covPath)) {
        healthArgs.push('--coverage', 'coverage/coverage-final.json');
      }
      const healthFindings = this.runFallowSubCommand('health', healthArgs, healthRules);
      allFindings.push(...healthFindings.filter((f) => this.isRuleActiveForCurrentRun(f.ruleId)));
    }

    for (const f of allFindings) {
      const relPath = toPosixRelative(this.projectRoot, f.file);

      this.recordScanned(relPath);
      this.addViolation({
        ruleId: f.ruleId,
        ruleDescription: FALLOW_RULE_DESCRIPTIONS[f.ruleId],
        severity: f.severity,
        file: relPath,
        line: f.line,
        message: f.message,
        context: f.context
      });
    }

    // Ensure atomic sub-auditor step logging at completion
    this.ensureSubAuditorsLogged();
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new FallowArchitectureAuditor());
