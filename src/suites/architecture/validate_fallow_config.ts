/**
 * scripts/auditors/architecture/validate_fallow_config.ts
 *
 * FALLOW CONFIGURATION & EXPORTS HYGIENE AUDITOR (Node.js 26+)
 *
 * Enforces the integrity of .fallowrc.json:
 *   1. Prohibits banned blanket entry globs (e.g. src/components/**) that suppress dead code.
 *   2. Guarantees that 100% of files listed in ignoreExports actually exist on disk.
 *   3. Guarantees that 100% of symbols in ignoreExports are legitimately exported in their files.
 *   4. Flags duplicate entries and empty export lists.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { enableCompileCache } from 'node:module';
import path from 'node:path';

import { ensureMandatoryDirectoriesExist } from '../../core/auditBootstrap.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { DEFAULT_SIMILAR_CODE_THRESHOLD } from '../../core/auditConfigDefaults.ts';
import {
  type CanonicalRuleSeverityLevel,
  type FallowTypeAwareRequirePolicy,
  CANONICAL_RULE_SEVERITY_LEVELS
} from '../../core/auditConfigTypes.ts';
import {
  type AuditorConfigFileRequirement,
  SATELLITE_CONFIG_EXPLANATIONS
} from '../../core/auditContract.ts';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  createRuleCapabilities
} from '../../core/auditorBase.ts';
import { getEffectiveIgnoreGlobs } from '../../core/canonicalIgnoreRegistry.ts';
import { isPathContained, toPosixRelative, normalizePosixPath } from '../../core/safePath.ts';
import { tryCatchSync, safeJsonParse } from '../../core/safeUtils.ts';
import {
  deepCompareSatelliteConfig,
  mergeSatelliteConfigProjection
} from '../../core/satelliteConfigParity.ts';
import {
  validateSatelliteUndeclaredEntries,
  getAllowedSatellitePathExcludes
} from '../../core/satelliteGlobMatcher.ts';
import {
  DEFAULT_FALLOW_HEALTH_MAX_COGNITIVE,
  DEFAULT_FALLOW_HEALTH_MAX_CYCLOMATIC
} from './validate_fallow.ts';

enableCompileCache();

export type FallowConfigRuleId =
  | 'fallow-config-missing'
  | 'fallow-config-syntax'
  | 'fallow-banned-entry-glob'
  | 'fallow-stale-file'
  | 'fallow-stale-export'
  | 'fallow-empty-export-list'
  | 'fallow-duplicate-entry'
  | 'fallow-config-workspace-diagnostic'
  | 'fallow-undeclared-config-entry'
  | 'fallow-config-doctor';

export const FALLOW_CONFIG_RULES: readonly FallowConfigRuleId[] = [
  'fallow-config-missing',
  'fallow-config-syntax',
  'fallow-banned-entry-glob',
  'fallow-stale-file',
  'fallow-stale-export',
  'fallow-empty-export-list',
  'fallow-duplicate-entry',
  'fallow-config-workspace-diagnostic',
  'fallow-undeclared-config-entry',
  'fallow-config-doctor'
] as const;

const FALLOW_CONFIG_EXECUTION_TIMEOUT_MS = 30000 as const;

export function getBannedEntryGlobs(projectRoot?: string): readonly string[] {
  const config = getAuditConfig(projectRoot);
  const globs: string[] = [];
  const compRoots = config.paths.componentsRoots ?? [];
  const viewRoots = config.paths.viewsRoots ?? [];
  for (const c of compRoots) {
    globs.push(`${c}/**/*.vue`, `${c}/**`);
  }
  for (const v of viewRoots) {
    globs.push(`${v}/**/*.vue`, `${v}/**`);
  }
  return globs;
}

export const BANNED_ENTRY_GLOBS: readonly string[] = getBannedEntryGlobs();

export const escapeRegExp = (s: string): string => RegExp.escape(s);

/**
 * Checks whether a symbol is exported from file content.
 */
export function isSymbolExportedInContent(content: string, symbol: string, isVue = false): boolean {
  if (symbol === 'default') {
    return /export\s+default\b/.test(content) || isVue;
  }

  const escaped = escapeRegExp(symbol);
  const wordRegex = new RegExp(`\\b${escaped}\\b`);
  if (!wordRegex.test(content)) return false;

  const exportRegex = new RegExp(
    `export\\s+(?:const|let|var|function|async\\s+function|type|interface|enum|class|abstract\\s+class)\\s+${escaped}\\b|` +
      `export\\s+(?:const|let|var)\\s+\\{[^}]*\\b${escaped}\\b|` +
      `export\\s+(?:const|let|var)\\s+\\[[^\\]]*\\b${escaped}\\b|` +
      `export\\s+(?:type\\s+)?\\{[^}]*\\b${escaped}\\b|` +
      `export\\s+\\*\\s+as\\s+${escaped}\\b`
  );
  return exportRegex.test(content);
}

export interface FallowIgnoreExportEntry {
  file: string;
  exports: string[];
}

export const FALLOW_CYCLOMATIC_POLICIES = ['standard', 'literal-membership'] as const;
export type FallowCyclomaticPolicy = (typeof FALLOW_CYCLOMATIC_POLICIES)[number];
const VALID_CYCLOMATIC_POLICIES: ReadonlySet<string> = new Set<string>(FALLOW_CYCLOMATIC_POLICIES);

export interface FallowTypeAwareConfig {
  enabled?: boolean;
  projects?: string[];
  require?: FallowTypeAwareRequirePolicy;
}

export interface FallowConfigSchema {
  $schema?: string;
  minimumVersion?: string;
  entry?: string[];
  ignorePatterns?: string[];
  ignoreDependencies?: string[];
  ignoreExports?: FallowIgnoreExportEntry[];
  markupExtensions?: string[];
  rules?: Record<string, string>;
  typeAware?: boolean | FallowTypeAwareConfig;
  duplicates?: {
    mode?: string;
    nearMiss?: boolean;
    minTokens?: number;
    minLines?: number;
    minOccurrences?: number;
  };
  viz?: {
    enabled?: boolean;
    outputPath?: string;
  };
  health?: {
    maxCrap?: number;
    cyclomaticPolicy?: FallowCyclomaticPolicy;
  };
  architecture?: {
    sharedState?: boolean;
  };
  audit?: {
    worsened?: CanonicalRuleSeverityLevel;
  };
  mutation?: {
    runnerConfig?: string;
    runner?: string;
    operators?: string[];
    minScore?: number;
    concurrency?: number;
    mutantsPerLine?: number;
    functionScope?: boolean;
    timeBudget?: string;
    typecheck?: boolean;
  };
}

export function createDefaultFallowConfigContent(): string {
  return (
    JSON.stringify(
      {
        $schema: 'https://fallow.tools/schema/config.json',
        entry: ['src/index.ts'],
        ignorePatterns: ['dist/**', 'scratch/**', 'tests/**'],
        duplicates: {
          nearMiss: true,
          mode: 'strict'
        },
        health: {
          maxCrap: 0
        }
      },
      null,
      2
    ) + '\n'
  );
}

const VALID_SEVERITIES: ReadonlySet<string> = new Set<string>(CANONICAL_RULE_SEVERITY_LEVELS);

function validateFallowSchemaFields(
  parsed: FallowConfigSchema,
  auditor: ValidateFallowConfigAuditor
): void {
  if (parsed.audit?.worsened && !VALID_SEVERITIES.has(parsed.audit.worsened)) {
    auditor.addViolation({
      ruleId: 'fallow-config-syntax',
      severity: 'error',
      file: '.fallowrc.json',
      line: 1,
      message: `Invalid value for audit.worsened in .fallowrc.json: '${parsed.audit.worsened}'. Must be one of: 'error', 'warn', 'off'.`,
      context: '.fallowrc.json'
    });
  }

  if (parsed.health?.cyclomaticPolicy !== undefined) {
    if (
      typeof parsed.health.cyclomaticPolicy !== 'string' ||
      !VALID_CYCLOMATIC_POLICIES.has(parsed.health.cyclomaticPolicy)
    ) {
      auditor.addViolation({
        ruleId: 'fallow-config-syntax',
        severity: 'error',
        file: '.fallowrc.json',
        line: 1,
        message: `Invalid value for health.cyclomaticPolicy in .fallowrc.json: '${String(parsed.health.cyclomaticPolicy)}'. Must be one of: 'standard', 'literal-membership'.`,
        context: '.fallowrc.json'
      });
    }
  }

  if (parsed.markupExtensions !== undefined) {
    const isStringArray =
      Array.isArray(parsed.markupExtensions) &&
      parsed.markupExtensions.every((item) => typeof item === 'string' && item.trim().length > 0);
    if (!isStringArray) {
      auditor.addViolation({
        ruleId: 'fallow-config-syntax',
        severity: 'error',
        file: '.fallowrc.json',
        line: 1,
        message: `Invalid value for markupExtensions in .fallowrc.json: must be an array of non-empty extension strings.`,
        context: '.fallowrc.json'
      });
    }
  }

  if (parsed.mutation?.runnerConfig !== undefined) {
    const runnerConfig = parsed.mutation.runnerConfig;
    const isValidString =
      typeof runnerConfig === 'string' &&
      runnerConfig.trim().length > 0 &&
      !path.isAbsolute(runnerConfig) &&
      isPathContained(auditor.projectRoot, runnerConfig, auditor.projectRoot);
    if (!isValidString) {
      auditor.addViolation({
        ruleId: 'fallow-config-syntax',
        severity: 'error',
        file: '.fallowrc.json',
        line: 1,
        message: `Invalid value for mutation.runnerConfig in .fallowrc.json: must be a non-empty relative file path string within the project root.`,
        context: '.fallowrc.json'
      });
    }
  }
}

function loadFallowConfig(
  configPath: string,
  auditor: ValidateFallowConfigAuditor
): FallowConfigSchema | null {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as FallowConfigSchema;
    validateFallowSchemaFields(parsed, auditor);
    return parsed;
  } catch (err) {
    auditor.addViolation({
      ruleId: 'fallow-config-syntax',
      severity: 'error',
      file: '.fallowrc.json',
      line: 1,
      message: `Error parsing .fallowrc.json: ${(err as Error).message}`,
      context: '.fallowrc.json'
    });
    return null;
  }
}

function validateFallowEntries(
  config: FallowConfigSchema,
  bannedGlobs: readonly string[],
  auditor: ValidateFallowConfigAuditor
): boolean {
  if (!Array.isArray(config.entry)) return false;
  let modified = false;
  const keptEntries: string[] = [];
  for (let i = 0; i < config.entry.length; i++) {
    const pattern = config.entry[i]!;
    let isBanned = false;
    for (const banned of bannedGlobs) {
      if (pattern === banned || pattern.startsWith(banned.replace(/\*.*$/, ''))) {
        isBanned = true;
        if (auditor.isFixActive()) {
          modified = true;
        } else {
          auditor.addViolation({
            ruleId: 'fallow-banned-entry-glob',
            severity: 'error',
            file: '.fallowrc.json',
            line: i + 1,
            message: `Banned entry pattern '${pattern}' detected. Masks dead components or views.`,
            context: pattern,
            fixable: true
          });
        }
      }
    }
    if (!isBanned) {
      keptEntries.push(pattern);
    }
  }
  if (modified) {
    config.entry = keptEntries.length > 0 ? keptEntries : ['src/index.ts'];
  }
  return modified;
}

function validateExportSymbols(params: {
  entry: FallowIgnoreExportEntry;
  content: string;
  relFile: string;
  isVue: boolean;
  lineNum: number;
  auditor: ValidateFallowConfigAuditor;
}): { exportCount: number; modified: boolean } {
  const seenExportsInFile = new Set<string>();
  const keptExports: string[] = []; // no-domain: Dynamic AST exported identifier list
  let exportCount = 0;
  let modified = false;

  for (const exp of params.entry.exports) {
    exportCount++;
    const isDup = seenExportsInFile.has(exp);
    if (isDup) {
      if (params.auditor.isFixActive()) {
        modified = true;
      } else {
        params.auditor.addViolation({
          ruleId: 'fallow-duplicate-entry',
          severity: 'error',
          file: '.fallowrc.json',
          line: params.lineNum,
          message: `Duplicate export '${exp}' in '${params.relFile}'.`,
          context: `${params.relFile} -> ${exp}`,
          fixable: true
        });
      }
    }
    seenExportsInFile.add(exp);

    const isStale = !isSymbolExportedInContent(params.content, exp, params.isVue);
    if (isStale) {
      if (params.auditor.isFixActive()) {
        modified = true;
      } else {
        params.auditor.addViolation({
          ruleId: 'fallow-stale-export',
          severity: 'error',
          file: '.fallowrc.json',
          line: params.lineNum,
          message: `Symbol '${exp}' is not exported in real file '${params.relFile}'.`,
          context: `${params.relFile} -> ${exp}`,
          fixable: true
        });
      }
    }

    if (!isDup && !isStale) {
      keptExports.push(exp);
    }
  }

  if (modified) {
    params.entry.exports = keptExports;
  }

  return { exportCount: modified ? keptExports.length : exportCount, modified };
}

function validateSingleIgnoreEntry(params: {
  entry: FallowIgnoreExportEntry;
  lineNum: number;
  projectRoot: string;
  seenFiles: Set<string>;
  auditor: ValidateFallowConfigAuditor;
}): { symbolCount: number; keepEntry: boolean; modified: boolean } {
  const { entry, lineNum, projectRoot, seenFiles, auditor } = params;
  const relFile = entry.file;
  let isDuplicateFile = false;
  let modified = false;

  auditor.runSubAuditorSync('fallow-duplicate-entry', () => {
    if (seenFiles.has(relFile)) {
      isDuplicateFile = true;
      if (auditor.isFixActive()) {
        modified = true;
      } else {
        auditor.addViolation({
          ruleId: 'fallow-duplicate-entry',
          severity: 'error',
          file: '.fallowrc.json',
          line: lineNum,
          message: `Duplicate file in ignoreExports: '${relFile}'.`,
          context: relFile,
          fixable: true
        });
      }
    }
  });
  seenFiles.add(relFile);
  if (isDuplicateFile && auditor.isFixActive()) {
    return { symbolCount: 0, keepEntry: false, modified: true };
  }

  let hasEmptyList = false;
  auditor.runSubAuditorSync('fallow-empty-export-list', () => {
    if (!Array.isArray(entry.exports) || entry.exports.length === 0) {
      hasEmptyList = true;
      if (auditor.isFixActive()) {
        modified = true;
      } else {
        auditor.addViolation({
          ruleId: 'fallow-empty-export-list',
          severity: 'error',
          file: '.fallowrc.json',
          line: lineNum,
          message: `Entry for '${relFile}' does not declare any exports in its exports array.`,
          context: relFile,
          fixable: true
        });
      }
    }
  });
  if (hasEmptyList) {
    return { symbolCount: 0, keepEntry: !auditor.isFixActive(), modified };
  }

  const fullFilePath = path.resolve(projectRoot, relFile);
  let isStale = false;
  auditor.runSubAuditorSync('fallow-stale-file', () => {
    if (!fs.existsSync(fullFilePath)) {
      isStale = true;
      if (auditor.isFixActive()) {
        modified = true;
      } else {
        auditor.addViolation({
          ruleId: 'fallow-stale-file',
          severity: 'error',
          file: '.fallowrc.json',
          line: lineNum,
          message: `File '${relFile}' declared in ignoreExports does not exist on disk.`,
          context: relFile,
          fixable: true
        });
      }
    }
  });
  if (isStale) {
    return { symbolCount: 0, keepEntry: !auditor.isFixActive(), modified };
  }

  let symbolCount = 0;
  let keepEntry = true;
  auditor.runSubAuditorSync('fallow-stale-export', () => {
    let content: string;
    try {
      content = fs.readFileSync(fullFilePath, 'utf-8');
    } catch (err) {
      if (auditor.isFixActive()) {
        modified = true;
        keepEntry = false;
      } else {
        auditor.addViolation({
          ruleId: 'fallow-stale-file',
          severity: 'error',
          file: '.fallowrc.json',
          line: lineNum,
          message: `Could not read file '${relFile}': ${(err as Error).message}`,
          context: relFile,
          fixable: true
        });
      }
      return;
    }

    const res = validateExportSymbols({
      entry,
      content,
      relFile,
      isVue: relFile.endsWith('.vue'),
      lineNum,
      auditor
    });
    symbolCount = res.exportCount;
    if (res.modified) {
      modified = true;
      if (entry.exports.length === 0) {
        keepEntry = false;
      }
    }
  });

  return { symbolCount, keepEntry, modified };
}

function validateFallowIgnoreExports(
  config: FallowConfigSchema,
  projectRoot: string,
  auditor: ValidateFallowConfigAuditor
): { fileCount: number; exportCount: number; modified: boolean } {
  if (!Array.isArray(config.ignoreExports)) {
    return { fileCount: 0, exportCount: 0, modified: false };
  }

  const seenFiles = new Set<string>();
  const keptEntries: FallowIgnoreExportEntry[] = [];
  let totalExports = 0;
  let modified = false;

  for (let entryIdx = 0; entryIdx < config.ignoreExports.length; entryIdx++) {
    const entry = config.ignoreExports[entryIdx]!;
    const res = validateSingleIgnoreEntry({
      entry,
      lineNum: entryIdx + 1,
      projectRoot,
      seenFiles,
      auditor
    });
    totalExports += res.symbolCount;
    if (res.modified) modified = true;
    if (res.keepEntry) {
      keptEntries.push(entry);
    }
  }

  if (modified) {
    if (keptEntries.length > 0) {
      config.ignoreExports = keptEntries;
    } else {
      delete config.ignoreExports;
    }
  }

  return {
    fileCount: modified ? keptEntries.length : seenFiles.size,
    exportCount: totalExports,
    modified
  };
}

export interface FallowWorkspaceDiagnosticItem {
  readonly path?: string;
  readonly kind?: string;
  readonly pattern?: string;
  readonly message?: string;
}

function pruneRedundantFallowConfigDiagnostic(
  diag: FallowWorkspaceDiagnosticItem,
  config: FallowConfigSchema | undefined
): boolean {
  if (!config || !diag.pattern) return false;
  if (diag.kind === 'entry-pattern-redundant' && Array.isArray(config.entry)) {
    const before = config.entry.length;
    config.entry = config.entry.filter((p) => p !== diag.pattern);
    if (config.entry.length === 0) delete config.entry;
    return (config.entry?.length ?? 0) !== before;
  }
  if (
    diag.kind === 'ignore-dependencies-entry-redundant' &&
    Array.isArray(config.ignoreDependencies)
  ) {
    const before = config.ignoreDependencies.length;
    config.ignoreDependencies = config.ignoreDependencies.filter((p) => p !== diag.pattern);
    if (config.ignoreDependencies.length === 0) delete config.ignoreDependencies;
    return (config.ignoreDependencies?.length ?? 0) !== before;
  }
  if (diag.kind === 'ignore-patterns-entry-redundant' && Array.isArray(config.ignorePatterns)) {
    const before = config.ignorePatterns.length;
    config.ignorePatterns = config.ignorePatterns.filter((p) => p !== diag.pattern);
    if (config.ignorePatterns.length === 0) delete config.ignorePatterns;
    return (config.ignorePatterns?.length ?? 0) !== before;
  }
  return false;
}

export const FALLOW_REDUNDANT_CONFIG_DIAGNOSTIC_KINDS = [
  'entry-pattern-redundant',
  'ignore-dependencies-entry-redundant',
  'ignore-patterns-entry-redundant'
] as const;
export type FallowRedundantConfigDiagnosticKind =
  (typeof FALLOW_REDUNDANT_CONFIG_DIAGNOSTIC_KINDS)[number];
const REDUNDANT_CONFIG_DIAGNOSTIC_SET: ReadonlySet<string> = new Set<string>(
  FALLOW_REDUNDANT_CONFIG_DIAGNOSTIC_KINDS
);

interface FallowExecutionResult<T> {
  readonly data: T | null;
  readonly skipped?: 'env' | 'binary_not_found';
}

function executeFallowJsonCommand<T>(
  projectRoot: string,
  subcmdArgs: readonly string[],
  timeoutMs = FALLOW_CONFIG_EXECUTION_TIMEOUT_MS
): FallowExecutionResult<T> {
  if (
    process.env.FALLOW_SKIP_BINARY_VERIFY === '1' ||
    process.env.FALLOW_SKIP_BINARY_VERIFY === 'true'
  ) {
    return { data: null, skipped: 'env' };
  }
  const candidates = [
    path.resolve(projectRoot, 'node_modules/fallow/bin/fallow'),
    path.resolve(process.cwd(), 'node_modules/fallow/bin/fallow')
  ];
  const fallowBin = candidates.find((c) => fs.existsSync(c));
  if (!fallowBin) {
    return { data: null, skipped: 'binary_not_found' };
  }
  let stdout: string | undefined;
  try {
    const res = spawnSync(
      process.execPath,
      [fallowBin, ...subcmdArgs, '--format', 'json', '--root', projectRoot],
      {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: timeoutMs
      }
    );
    stdout = res.stdout;
  } catch (err: unknown) {
    stdout = (err as { stdout?: string | Buffer })?.stdout?.toString();
  }
  return { data: safeJsonParse<T>(stdout ?? '') ?? null };
}

export interface FallowDoctorCheck {
  readonly id?: string;
  readonly name?: string;
  readonly status?: string;
  readonly message?: string;
  readonly remediation?: { command?: string; cwd?: string; mutating?: boolean } | string;
}

export interface FallowDoctorOutput {
  readonly status?: string;
  readonly checks?: readonly FallowDoctorCheck[];
}

export function formatDoctorRemediation(
  remediation?: { command?: string; cwd?: string; mutating?: boolean } | string
): string {
  if (typeof remediation === 'string' && remediation) {
    return ` | Remediation: ${remediation}`;
  }
  if (remediation && typeof remediation === 'object' && remediation.command) {
    return ` | Remediation: ${remediation.command}`;
  }
  return '';
}

export function validateFallowDoctorResults(
  parsed: FallowDoctorOutput,
  auditor: ValidateFallowConfigAuditor
): void {
  if (parsed.status !== 'fail' && parsed.status !== 'warn') {
    return;
  }
  const checks = Array.isArray(parsed.checks) ? parsed.checks : [];
  const defectiveChecks = checks.filter((c) => c.status === 'fail' || c.status === 'warn');
  if (defectiveChecks.length === 0) {
    const severity: 'error' | 'warning' = parsed.status === 'fail' ? 'error' : 'warning';
    auditor.addViolation({
      ruleId: 'fallow-config-doctor',
      severity,
      file: '.fallowrc.json',
      line: 1,
      message: `Fallow doctor reported ${parsed.status} status. Run 'npm run auditor:fallow:doctor' to inspect.`,
      context: 'doctor'
    });
    return;
  }
  for (const check of defectiveChecks) {
    const severity: 'error' | 'warning' = check.status === 'fail' ? 'error' : 'warning';
    const remediation = formatDoctorRemediation(check.remediation);
    const checkId = check.id ?? check.name ?? 'check';
    auditor.addViolation({
      ruleId: 'fallow-config-doctor',
      severity,
      file: '.fallowrc.json',
      line: 1,
      message: `[doctor:${checkId}] ${check.message ?? 'Fallow health check failed'}${remediation}`,
      context: checkId
    });
  }
}

function repairSkippedSourceDotdir(
  d: FallowWorkspaceDiagnosticItem,
  config: FallowConfigSchema
): boolean {
  const cleanPath = d.path ? normalizePosixPath(d.path) : '.auditor';
  const baseDir = cleanPath.startsWith('!') ? cleanPath.slice(1) : cleanPath;
  const dotdir = `${baseDir}/**`;
  const patterns = Array.isArray(config.ignorePatterns) ? [...config.ignorePatterns] : [];
  let modified = false;
  const invertedDotdir = `!${dotdir}`;
  const invertedIdx = patterns.indexOf(invertedDotdir);
  if (invertedIdx !== -1) {
    patterns.splice(invertedIdx, 1);
    modified = true;
  }
  if (!patterns.includes(dotdir)) {
    patterns.push(dotdir);
    config.ignorePatterns = patterns;
    modified = true;
  }
  return modified;
}

export function validateFallowWorkspaceDiagnostics(
  diagnostics: readonly FallowWorkspaceDiagnosticItem[] | undefined,
  auditor: ValidateFallowConfigAuditor,
  config?: FallowConfigSchema
): boolean {
  if (!Array.isArray(diagnostics)) return false;
  let modified = false;
  for (const d of diagnostics) {
    if (d.kind === 'boundaries-not-configured' || d.kind === 'rule-packs-not-configured') {
      continue;
    }
    const isRedundantConfigEntry = Boolean(d.kind && REDUNDANT_CONFIG_DIAGNOSTIC_SET.has(d.kind));

    if (
      isRedundantConfigEntry &&
      auditor.isFixActive() &&
      pruneRedundantFallowConfigDiagnostic(d, config)
    ) {
      modified = true;
      continue;
    }

    if (d.kind === 'skipped-source-dotdir' && auditor.isFixActive() && config) {
      if (repairSkippedSourceDotdir(d, config)) {
        modified = true;
        continue;
      }
    }

    auditor.addViolation({
      ruleId: 'fallow-config-workspace-diagnostic',
      severity: 'error',
      file: d.path && d.path !== '.' ? d.path : '.fallowrc.json',
      line: 1,
      message: `Workspace diagnostic (Fallow): [${d.kind || 'diagnostic'}] ${d.message || ''}`,
      context: d.kind || 'workspace_diagnostic',
      fixable: isRedundantConfigEntry && Boolean(d.pattern)
    });
  }
  return modified;
}

function projectDuplicatesConfig(
  fallow?: NonNullable<ReturnType<typeof getAuditConfig>['fallow']>
): Record<string, unknown> {
  const duplicatesCfg: Record<string, unknown> = {
    nearMiss: fallow?.duplicates?.nearMiss ?? true,
    mode: fallow?.duplicates?.mode ?? 'strict'
  };
  if (fallow?.duplicates?.minLines !== undefined) {
    duplicatesCfg['minLines'] = fallow.duplicates.minLines;
  }
  if (fallow?.duplicates?.minTokens !== undefined) {
    duplicatesCfg['minTokens'] = fallow.duplicates.minTokens;
  }
  if (fallow?.duplicates?.minOccurrences !== undefined) {
    duplicatesCfg['minOccurrences'] = fallow.duplicates.minOccurrences;
  }
  return duplicatesCfg;
}

function projectHealthConfig(
  fallow?: NonNullable<ReturnType<typeof getAuditConfig>['fallow']>
): Record<string, unknown> {
  const healthCfg: Record<string, unknown> = {
    maxCrap: fallow?.health?.maxCrap ?? 0
  };
  if (fallow?.health?.maxCyclomatic !== undefined) {
    healthCfg['maxCyclomatic'] = fallow.health.maxCyclomatic;
  }
  if (fallow?.health?.maxCognitive !== undefined) {
    healthCfg['maxCognitive'] = fallow.health.maxCognitive;
  }
  if (fallow?.health?.cyclomaticPolicy !== undefined) {
    healthCfg['cyclomaticPolicy'] = fallow.health.cyclomaticPolicy;
  }
  return healthCfg;
}

function projectMutationConfig(
  mutation?: NonNullable<ReturnType<typeof getAuditConfig>['fallow']>['mutation']
): Record<string, unknown> | undefined {
  if (!mutation?.enabled) return undefined;

  const mutationCfg: Record<string, unknown> = {};
  if (mutation.runner) mutationCfg['runner'] = mutation.runner;
  if (mutation.mutantsPerLine !== undefined)
    mutationCfg['mutantsPerLine'] = mutation.mutantsPerLine;
  if (mutation.functionScope !== undefined) mutationCfg['functionScope'] = mutation.functionScope;
  if (mutation.typecheck !== undefined) mutationCfg['typecheck'] = mutation.typecheck;
  if (mutation.runnerConfig) mutationCfg['runnerConfig'] = mutation.runnerConfig;
  if (mutation.minScore !== undefined) mutationCfg['minScore'] = mutation.minScore;
  if (mutation.concurrency !== undefined) mutationCfg['concurrency'] = mutation.concurrency;
  if (mutation.timeBudget) mutationCfg['timeBudget'] = mutation.timeBudget;
  if (mutation.operators) mutationCfg['operators'] = [...mutation.operators];

  return mutationCfg;
}

export function projectFallowConfigFromAuditConfig(
  auditConfig: ReturnType<typeof getAuditConfig>
): Partial<FallowConfigSchema> {
  const fallow = auditConfig.fallow;
  const projected: Partial<FallowConfigSchema> = {
    duplicates: projectDuplicatesConfig(fallow),
    health: projectHealthConfig(fallow)
  };

  if (fallow?.minimumVersion) {
    projected.minimumVersion = fallow.minimumVersion;
  }

  if (fallow?.entry && fallow.entry.length > 0) {
    projected.entry = [...fallow.entry];
  }

  if (fallow?.ignoreExports && fallow.ignoreExports.length > 0) {
    projected.ignoreExports = fallow.ignoreExports.map((item) => ({
      file: item.file,
      exports: [...item.exports]
    }));
  }

  if (fallow?.architecture?.sharedState !== undefined) {
    projected.architecture = {
      sharedState: fallow.architecture.sharedState
    };
  }

  const mutationCfg = projectMutationConfig(fallow?.mutation);
  if (mutationCfg) {
    projected.mutation = mutationCfg;
  }

  return projected;
}

function collectDeclaredFallowIgnoreDependencies(
  auditConfig: ReturnType<typeof getAuditConfig>
): string[] {
  const raw = [
    ...(auditConfig.fallow?.ignoreDependencies ?? []),
    ...(auditConfig.fallow?.exemptDependencies ?? [])
  ];
  return Array.from(new Set(raw));
}

function collectDeclaredFallowIgnorePatterns(
  auditConfig: ReturnType<typeof getAuditConfig>
): string[] {
  const raw = [
    ...(auditConfig.fallow?.ignoreGlobs ?? []),
    ...(auditConfig.fallow?.ignorePatterns ?? []),
    ...(auditConfig.fallow?.exemptPaths ?? [])
  ].map((p) => normalizePosixPath(p));
  return Array.from(new Set(raw));
}

function appendMissingStringEntries(
  existing: readonly string[] | undefined,
  declared: readonly string[]
): { next: string[]; changed: boolean } {
  const current = Array.isArray(existing) ? [...existing] : [];
  const existingSet = new Set(current);
  let changed = false;
  for (const item of declared) {
    if (!existingSet.has(item)) {
      current.push(item);
      existingSet.add(item);
      changed = true;
    }
  }
  return { next: current, changed };
}

function applyFallowConfigFixes(
  config: FallowConfigSchema,
  projected: Partial<FallowConfigSchema>,
  auditConfig: ReturnType<typeof getAuditConfig>
): boolean {
  const patch: Record<string, unknown> = {};
  if (projected.duplicates) patch['duplicates'] = projected.duplicates;
  if (projected.health) patch['health'] = projected.health;
  if (projected.minimumVersion) patch['minimumVersion'] = projected.minimumVersion;
  if (projected.entry) patch['entry'] = projected.entry;
  if (projected.architecture) patch['architecture'] = projected.architecture;
  if (projected.mutation) patch['mutation'] = projected.mutation;
  let pruned = false;
  if (
    projected.ignoreExports &&
    JSON.stringify(config.ignoreExports ?? []) !== JSON.stringify(projected.ignoreExports)
  ) {
    config.ignoreExports = structuredClone(projected.ignoreExports);
    pruned = true;
  }

  const declaredDeps = collectDeclaredFallowIgnoreDependencies(auditConfig);
  if (declaredDeps.length > 0) {
    const { next, changed } = appendMissingStringEntries(config.ignoreDependencies, declaredDeps);
    if (changed) {
      config.ignoreDependencies = next;
      pruned = true;
    }
  }

  const declaredPatterns = collectDeclaredFallowIgnorePatterns(auditConfig);
  if (declaredPatterns.length > 0) {
    const { next, changed } = appendMissingStringEntries(config.ignorePatterns, declaredPatterns);
    if (changed) {
      config.ignorePatterns = next;
      pruned = true;
    }
  }
  if ('typeAware' in config) {
    delete (config as Record<string, unknown>)['typeAware'];
    pruned = true;
  }
  if (!projected.mutation && 'mutation' in config) {
    delete (config as Record<string, unknown>)['mutation'];
    pruned = true;
  }
  if (!projected.architecture && 'architecture' in config) {
    delete (config as Record<string, unknown>)['architecture'];
    pruned = true;
  }

  const merged = mergeSatelliteConfigProjection(config as Record<string, unknown>, patch);
  return merged || pruned;
}

function validateUndeclaredTypeAware(
  config: FallowConfigSchema,
  auditor: ValidateFallowConfigAuditor
): void {
  if (config.typeAware !== undefined) {
    auditor.addViolation({
      ruleId: 'fallow-undeclared-config-entry',
      severity: 'error',
      file: '.fallowrc.json',
      line: 1,
      message:
        'Prohibited typeAware configuration in .fallowrc.json. TypeScript type-checking is unified exclusively in Vite+/Oxlint. Remove typeAware from .fallowrc.json.',
      context: 'typeAware',
      fixable: true
    });
  }
}

function validateUndeclaredDuplicates(
  config: FallowConfigSchema,
  projected: Partial<FallowConfigSchema>,
  auditor: ValidateFallowConfigAuditor
): void {
  if (!config.duplicates) return;

  const dupDiffs = deepCompareSatelliteConfig({
    ssotProjection: projected.duplicates,
    actualConfig: config.duplicates,
    pathPrefix: 'duplicates'
  });
  for (const diff of dupDiffs) {
    auditor.addViolation({
      ruleId: 'fallow-undeclared-config-entry',
      severity: 'error',
      file: '.fallowrc.json',
      line: 1,
      message: diff.message,
      context: diff.path,
      fixable: true
    });
  }
}

function validateUndeclaredHealth(
  config: FallowConfigSchema,
  projected: Partial<FallowConfigSchema>,
  auditConfig: ReturnType<typeof getAuditConfig>,
  auditor: ValidateFallowConfigAuditor
): void {
  if (!config.health) return;

  const allowedHealthKeys = new Set<string>();
  if (
    config.health.cyclomaticPolicy &&
    VALID_CYCLOMATIC_POLICIES.has(config.health.cyclomaticPolicy) &&
    auditConfig.fallow?.health?.cyclomaticPolicy === undefined
  ) {
    allowedHealthKeys.add('cyclomaticPolicy');
  }

  const healthDiffs = deepCompareSatelliteConfig({
    ssotProjection: projected.health,
    actualConfig: config.health,
    allowedExtraKeys: allowedHealthKeys,
    pathPrefix: 'health'
  });
  for (const diff of healthDiffs) {
    auditor.addViolation({
      ruleId: 'fallow-undeclared-config-entry',
      severity: 'error',
      file: '.fallowrc.json',
      line: 1,
      message: diff.message,
      context: diff.path,
      fixable: true
    });
  }
}

function validateUndeclaredIgnorePatterns(
  config: FallowConfigSchema,
  auditConfig: ReturnType<typeof getAuditConfig>,
  auditor: ValidateFallowConfigAuditor
): void {
  if (!Array.isArray(config.ignorePatterns)) return;

  const testGlobs = (auditConfig.paths?.testRoots ?? []).map((t) => `${normalizePosixPath(t)}/**`);
  const effectiveGlobs = getEffectiveIgnoreGlobs(auditor.projectRoot, {
    extraGlobs: testGlobs
  });
  const allowedGlobs = new Set<string>([
    ...getAllowedSatellitePathExcludes(auditConfig, auditor.projectRoot),
    ...(auditConfig.fallow?.ignoreGlobs ?? []).map((p) => normalizePosixPath(p)),
    ...(auditConfig.fallow?.ignorePatterns ?? []).map((p) => normalizePosixPath(p)),
    ...(auditConfig.fallow?.exemptPaths ?? []).map((p) => normalizePosixPath(p))
  ]);

  validateSatelliteUndeclaredEntries(
    config.ignorePatterns,
    allowedGlobs,
    effectiveGlobs,
    (pattern, index) => {
      auditor.addViolation({
        ruleId: 'fallow-undeclared-config-entry',
        severity: 'error',
        file: '.fallowrc.json',
        line: index + 1,
        message: `Undeclared ignore pattern '${pattern}' in .fallowrc.json. To legitimize this exemption, declare it in .auditor/audit.config.ts under 'fallow.ignoreGlobs' or 'paths.ignoreGlobs', or remove it from .fallowrc.json.`,
        context: pattern
      });
    }
  );
}

function validateUndeclaredIgnoreDependencies(
  config: FallowConfigSchema,
  auditConfig: ReturnType<typeof getAuditConfig>,
  auditor: ValidateFallowConfigAuditor
): void {
  if (!Array.isArray(config.ignoreDependencies)) return;

  const allowedDeps = new Set<string>([
    ...(auditConfig.fallow?.ignoreDependencies ?? []),
    ...(auditConfig.fallow?.exemptDependencies ?? [])
  ]);

  for (let i = 0; i < config.ignoreDependencies.length; i++) {
    const dep = config.ignoreDependencies[i]!;
    if (!allowedDeps.has(dep)) {
      auditor.addViolation({
        ruleId: 'fallow-undeclared-config-entry',
        severity: 'error',
        file: '.fallowrc.json',
        line: i + 1,
        message: `Undeclared dependency exemption '${dep}' in .fallowrc.json. To legitimize this exemption, declare it in .auditor/audit.config.ts under 'fallow.ignoreDependencies', or remove it from .fallowrc.json.`,
        context: dep
      });
    }
  }
}

function validateUndeclaredArchitecture(
  config: FallowConfigSchema,
  projected: Partial<FallowConfigSchema>,
  auditor: ValidateFallowConfigAuditor
): void {
  if (!config.architecture) return;

  const archDiffs = deepCompareSatelliteConfig({
    ssotProjection: projected.architecture ?? {},
    actualConfig: config.architecture,
    pathPrefix: 'architecture'
  });
  for (const diff of archDiffs) {
    auditor.addViolation({
      ruleId: 'fallow-undeclared-config-entry',
      severity: 'error',
      file: '.fallowrc.json',
      line: 1,
      message: diff.message,
      context: diff.path,
      fixable: true
    });
  }
}

function validateUndeclaredMutation(
  config: FallowConfigSchema,
  projected: Partial<FallowConfigSchema>,
  auditor: ValidateFallowConfigAuditor
): void {
  if (!config.mutation) return;

  const mutDiffs = deepCompareSatelliteConfig({
    ssotProjection: projected.mutation ?? {},
    actualConfig: config.mutation,
    pathPrefix: 'mutation'
  });
  for (const diff of mutDiffs) {
    auditor.addViolation({
      ruleId: 'fallow-undeclared-config-entry',
      severity: 'error',
      file: '.fallowrc.json',
      line: 1,
      message: diff.message,
      context: diff.path,
      fixable: true
    });
  }
}

function validateUndeclaredMinimumVersion(
  config: FallowConfigSchema,
  projected: Partial<FallowConfigSchema>,
  auditor: ValidateFallowConfigAuditor
): void {
  if (config.minimumVersion === undefined) return;
  if (
    projected.minimumVersion !== undefined &&
    config.minimumVersion === projected.minimumVersion
  ) {
    return;
  }
  auditor.addViolation({
    ruleId: 'fallow-undeclared-config-entry',
    severity: 'error',
    file: '.fallowrc.json',
    line: 1,
    message: `Divergent or undeclared minimumVersion in .fallowrc.json. Expected: '${projected.minimumVersion ?? 'undefined'}', actual: '${config.minimumVersion}'.`,
    context: 'minimumVersion',
    fixable: true
  });
}

function validateUndeclaredEntry(
  config: FallowConfigSchema,
  projected: Partial<FallowConfigSchema>,
  auditor: ValidateFallowConfigAuditor
): void {
  if (!projected.entry) return;
  if (JSON.stringify(config.entry ?? []) === JSON.stringify(projected.entry)) return;
  auditor.addViolation({
    ruleId: 'fallow-undeclared-config-entry',
    severity: 'error',
    file: '.fallowrc.json',
    line: 1,
    message: `Divergent entry points in .fallowrc.json vs .auditor/audit.config.ts (fallow.entry). Run 'npm run auditor:fix' to synchronize.`,
    context: 'entry',
    fixable: true
  });
}

function validateUndeclaredIgnoreExports(
  config: FallowConfigSchema,
  projected: Partial<FallowConfigSchema>,
  auditor: ValidateFallowConfigAuditor
): void {
  if (!projected.ignoreExports) return;
  if (JSON.stringify(config.ignoreExports ?? []) === JSON.stringify(projected.ignoreExports))
    return;
  auditor.addViolation({
    ruleId: 'fallow-undeclared-config-entry',
    severity: 'error',
    file: '.fallowrc.json',
    line: 1,
    message: `Divergent ignoreExports in .fallowrc.json vs .auditor/audit.config.ts (fallow.ignoreExports). Run 'npm run auditor:fix' to synchronize.`,
    context: 'ignoreExports',
    fixable: true
  });
}

function validateMissingDeclaredEntries(params: {
  actual: readonly string[] | undefined;
  declared: readonly string[];
  ssotField: string;
  auditor: ValidateFallowConfigAuditor;
}): void {
  if (params.declared.length === 0) return;
  const actualSet = new Set(params.actual ?? []);
  const missing = params.declared.filter((item) => !actualSet.has(item));
  if (missing.length === 0) return;
  params.auditor.addViolation({
    ruleId: 'fallow-undeclared-config-entry',
    severity: 'error',
    file: '.fallowrc.json',
    line: 1,
    message: `Missing declared ${params.ssotField} [${missing.join(', ')}] in .fallowrc.json. Run 'npm run auditor:fix' to synchronize from .auditor/audit.config.ts.`,
    context: params.ssotField,
    fixable: true
  });
}

export function validateUndeclaredFallowEntries(
  config: FallowConfigSchema,
  auditor: ValidateFallowConfigAuditor
): boolean {
  const auditConfig = getAuditConfig(auditor.projectRoot);
  const projected = projectFallowConfigFromAuditConfig(auditConfig);
  let modified = false;

  if (auditor.isFixActive()) {
    modified = applyFallowConfigFixes(config, projected, auditConfig);
  } else {
    validateUndeclaredTypeAware(config, auditor);
    validateUndeclaredDuplicates(config, projected, auditor);
    validateUndeclaredHealth(config, projected, auditConfig, auditor);
    validateUndeclaredArchitecture(config, projected, auditor);
    validateUndeclaredMutation(config, projected, auditor);
    validateUndeclaredMinimumVersion(config, projected, auditor);
    validateUndeclaredEntry(config, projected, auditor);
    validateUndeclaredIgnoreExports(config, projected, auditor);
    validateMissingDeclaredEntries({
      actual: config.ignoreDependencies,
      declared: collectDeclaredFallowIgnoreDependencies(auditConfig),
      ssotField: 'fallow.ignoreDependencies',
      auditor
    });
    validateMissingDeclaredEntries({
      actual: config.ignorePatterns,
      declared: collectDeclaredFallowIgnorePatterns(auditConfig),
      ssotField: 'fallow.ignorePatterns',
      auditor
    });
  }

  validateUndeclaredIgnorePatterns(config, auditConfig, auditor);
  validateUndeclaredIgnoreDependencies(config, auditConfig, auditor);

  return modified;
}

export interface ValidateFallowConfigOptions {
  readonly projectRoot?: string;
  readonly configFile?: string;
}

export const FALLOW_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<FallowConfigRuleId> = {
  id: 'fallow-config',
  file: '.fallowrc.json',
  description: 'Fallow configuration and exports control',
  ruleId: 'fallow-config-missing',
  generateDefaultContent: () => createDefaultFallowConfigContent()
};

export class ValidateFallowConfigAuditor extends BaseAuditor<FallowConfigRuleId> {
  public static readonly cachePaths = ['.fallow'] as const;

  public constructor(options: ValidateFallowConfigOptions = {}) {
    const projectRoot = options.projectRoot ?? process.cwd();
    const configPath = options.configFile
      ? path.resolve(projectRoot, options.configFile)
      : path.resolve(projectRoot, '.fallowrc.json');

    const relConfig = toPosixRelative(projectRoot, configPath) || '.fallowrc.json';
    const configRequirement: AuditorConfigFileRequirement<FallowConfigRuleId> = {
      ...FALLOW_CONFIG_REQUIREMENT,
      file: relConfig,
      candidateFiles: [relConfig]
    };

    super({
      ruleFixers: {},
      usesThirdPartyTool: true,
      requiredPermissions: ['--allow-child-process'],
      thirdPartyToolPolicy: {
        toolName: 'Fallow',
        fallbackBehavior: 'violation',
        fallbackRuleId: 'fallow-config-workspace-diagnostic',
        explainSatelliteConfig: SATELLITE_CONFIG_EXPLANATIONS.fallow
      },
      ruleCapabilities: {
        ...createRuleCapabilities(
          FALLOW_CONFIG_RULES.filter((r) => r !== 'fallow-config-doctor'),
          {
            speed: 'light',
            phase: 'setup',
            md: false,
            ast: false,
            changedOnly: false,
            critical: false
          }
        ),
        'fallow-config-doctor': {
          speed: 'full',
          phase: 'setup',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        }
      },
      configFiles: [configRequirement],
      cachePaths: ValidateFallowConfigAuditor.cachePaths,
      id: 'validate_fallow_config',
      name: 'Fallow Configuration & Exports Hygiene Validator',
      description: 'Validates .fallowrc.json integrity and ignoreExports',
      family: 'architecture',
      ruleIds: FALLOW_CONFIG_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(FALLOW_CONFIG_RULES, 'setup'),
      packageName: 'Fallow',
      configKey: 'fallow.enabled',
      defaultConfig: {
        enabled: true,
        health: {
          maxCognitive: DEFAULT_FALLOW_HEALTH_MAX_COGNITIVE,
          maxCyclomatic: DEFAULT_FALLOW_HEALTH_MAX_CYCLOMATIC,
          cyclomaticPolicy: 'standard'
        },
        enforceTargets: true,
        maxTargetPriority: 'high',
        typeAware: false,
        showCascade: true,
        duplicates: {
          enabled: true,
          nearMiss: true,
          mode: 'strict'
        },
        similarCode: {
          enabled: true,
          threshold: DEFAULT_SIMILAR_CODE_THRESHOLD,
          ignoreSameFile: true,
          minLines: 3
        },
        flags: {
          enabled: true,
          trackRetirement: true
        },
        coverage: {
          enabled: true
        },
        security: {
          enabled: true
        },
        viz: {
          enabled: true,
          outputPath: 'scratch/fallow_map.html'
        }
      },
      criticalConfig: {},
      icon: '🌾',
      ruleDescriptions: {
        'fallow-config-missing': 'Missing .fallowrc.json file',
        'fallow-config-syntax': 'Invalid JSON in .fallowrc.json',
        'fallow-banned-entry-glob': 'Banned glob in entry',
        'fallow-stale-file': 'Non-existent file in config',
        'fallow-stale-export': 'Non-existent export in config',
        'fallow-empty-export-list': 'Empty entry in ignoreExports',
        'fallow-duplicate-entry': 'Duplicate entry or export',
        'fallow-config-workspace-diagnostic': 'Workspace diagnostic',
        'fallow-undeclared-config-entry': 'Undeclared entry in config',
        'fallow-config-doctor': 'Health and cache integrity'
      },
      ruleRemediations: {
        'fallow-config-missing':
          '📖 REMEDIATION GUIDE: fallow-config-missing\n' +
          '1. Root Cause: The .fallowrc.json configuration file does not exist in the project root. Fallow requires this file to map canonical entry points and exceptions.\n' +
          '2. Diagnosis: Check if the .fallowrc.json file exists in the repository root directory.\n' +
          '3. Canonical Solution: Run npm run auditor:fix or auditor fix to generate the default configuration automatically.\n' +
          '4. Example / Auto-fix command:\n' +
          '   npm run auditor:fix',
        'fallow-config-syntax':
          '📖 REMEDIATION GUIDE: fallow-config-syntax\n' +
          '1. Root Cause: The .fallowrc.json file contains a JSON syntax error (trailing commas, unclosed quotes, or invalid tokens).\n' +
          '2. Diagnosis: Inspect the JSON parser error message to locate the defective line.\n' +
          '3. Canonical Solution: Open .fallowrc.json and correct the syntax error using a JSON linter or code formatter.\n' +
          '4. Example / Auto-fix command:\n' +
          '   Format .fallowrc.json with a valid JSON schema.',
        'fallow-banned-entry-glob':
          '📖 REMEDIATION GUIDE: fallow-banned-entry-glob\n' +
          '1. Root Cause: A banned entry pattern was declared in .fallowrc.json (such as wildcard components or views). This masks dead components.\n' +
          '2. Diagnosis: Inspect the entry array in .fallowrc.json for broad component globs.\n' +
          '3. Canonical Solution: Run npm run auditor:fix to purge banned globs and retain only genuine root entry points (e.g. src/main.ts, src/index.ts).\n' +
          '4. Example / Auto-fix command:\n' +
          '   npm run auditor:fix',
        'fallow-stale-file':
          '📖 REMEDIATION GUIDE: fallow-stale-file\n' +
          '1. Root Cause: An entry in ignoreExports references a file that has been deleted, moved, or renamed on disk.\n' +
          '2. Diagnosis: The warning message specifies the file path that is missing from the filesystem.\n' +
          '3. Canonical Solution: Run npm run auditor:fix or auditor fix to automatically remove obsolete entries from .fallowrc.json.\n' +
          '4. Example / Auto-fix command:\n' +
          '   npm run auditor:fix',
        'fallow-stale-export':
          '📖 REMEDIATION GUIDE: fallow-stale-export\n' +
          '1. Root Cause: A symbol declared in the exports array of an ignoreExports entry is no longer exported in the source file.\n' +
          '2. Diagnosis: Check the source file to verify that the symbol was renamed or deleted.\n' +
          '3. Canonical Solution: Run npm run auditor:fix to synchronize and purge obsolete symbol names.\n' +
          '4. Example / Auto-fix command:\n' +
          '   npm run auditor:fix',
        'fallow-empty-export-list':
          '📖 REMEDIATION GUIDE: fallow-empty-export-list\n' +
          '1. Root Cause: A file entry in ignoreExports has an empty exports array (exports: []).\n' +
          '2. Diagnosis: Review entries in .fallowrc.json where no symbols are declared.\n' +
          '3. Canonical Solution: Run npm run auditor:fix to remove the redundant entry.\n' +
          '4. Example / Auto-fix command:\n' +
          '   npm run auditor:fix',
        'fallow-duplicate-entry':
          '📖 REMEDIATION GUIDE: fallow-duplicate-entry\n' +
          '1. Root Cause: The same file or symbol is repeated more than once within .fallowrc.json.\n' +
          '2. Diagnosis: The message indicates the duplicate entry.\n' +
          '3. Canonical Solution: Run npm run auditor:fix to deduplicate entries and symbols automatically.\n' +
          '4. Example / Auto-fix command:\n' +
          '   npm run auditor:fix',
        'fallow-config-workspace-diagnostic':
          '📖 REMEDIATION GUIDE: fallow-config-workspace-diagnostic\n' +
          '1. Root Cause: The Fallow engine emitted a workspace-level diagnostic, redundant config entry warning, or boundary configuration warning.\n' +
          '2. Diagnosis: Inspect the diagnostic message emitted by the Fallow engine in the report.\n' +
          '3. Canonical Solution: Run npm run auditor:fix to automatically prune redundant config entries (entry-pattern-redundant, ignore-dependencies-entry-redundant, ignore-patterns-entry-redundant), or adjust package/boundary settings in .fallowrc.json.\n' +
          '4. Example / Auto-fix command:\n' +
          '   npm run auditor:fix',
        'fallow-undeclared-config-entry':
          '📖 REMEDIATION GUIDE: fallow-undeclared-config-entry\n' +
          '1. Root Cause: .fallowrc.json declares ignorePatterns or ignoreDependencies that are not authorized in .auditor/audit.config.ts (SSoT violation).\n' +
          '2. Diagnosis: Inspect the diagnostic message to identify the undeclared pattern or dependency.\n' +
          '3. Canonical Solution: If the exemption is genuine, declare it in .auditor/audit.config.ts (under fallow.ignoreGlobs, paths.ignoreGlobs, or fallow.ignoreDependencies). Otherwise, remove it from .fallowrc.json.\n' +
          '4. Example / Auto-fix command:\n' +
          "   Declare in .auditor/audit.config.ts: fallow: { ignoreGlobs: ['path/**'] }",
        'fallow-config-doctor':
          '📖 REMEDIATION GUIDE: fallow-config-doctor\n' +
          '1. Root Cause: Fallow doctor preflight check detected health, cache, or configuration issues.\n' +
          '2. Diagnosis: Run npm run auditor:fallow:doctor to view detailed diagnostic output.\n' +
          '3. Canonical Solution: Follow the recommended remediation commands emitted by fallow doctor (e.g. "fallow dead-code --quiet" to refresh cache).\n' +
          '4. Example / Auto-fix command:\n' +
          '   npm run auditor:fallow:doctor'
      },
      coverage: {
        include: ['.fallowrc.json']
      },
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    ensureMandatoryDirectoriesExist(this.projectRoot);
    const requirement = this.configFiles[0] ?? FALLOW_CONFIG_REQUIREMENT;
    const ensured = await this.runSubAuditor('fallow-config-missing', async () => {
      return await this.ensureConfigFile(requirement);
    });
    if (!ensured) return;

    const resolvedPath = ensured.resolvedPath;
    const config = this.runSubAuditorSync('fallow-config-syntax', () => {
      return loadFallowConfig(resolvedPath, this);
    });
    if (!config) return;

    const validConfig: FallowConfigSchema = config;
    this.recordScanned('.fallowrc.json');
    let modified = false;

    this.runSubAuditorSync('fallow-banned-entry-glob', () => {
      const bannedGlobs = getBannedEntryGlobs(this.projectRoot);
      if (validateFallowEntries(validConfig, bannedGlobs, this)) {
        modified = true;
      }
    });

    this.runSubAuditorSync('fallow-undeclared-config-entry', () => {
      if (validateUndeclaredFallowEntries(validConfig, this)) {
        modified = true;
      }
    });

    if (!Array.isArray(validConfig.ignoreExports) || validConfig.ignoreExports.length === 0) {
      this.markRuleNotApplicable('fallow-duplicate-entry', 'No ignoreExports in .fallowrc.json');
      this.markRuleNotApplicable('fallow-empty-export-list', 'No ignoreExports in .fallowrc.json');
      this.markRuleNotApplicable('fallow-stale-file', 'No ignoreExports in .fallowrc.json');
      this.markRuleNotApplicable('fallow-stale-export', 'No ignoreExports in .fallowrc.json');
    } else {
      const {
        fileCount,
        exportCount,
        modified: ignoreModified
      } = validateFallowIgnoreExports(validConfig, this.projectRoot, this);
      if (ignoreModified) modified = true;

      this.context.setMetric('Files in ignoreExports', fileCount);
      this.context.setMetric('Validated Exports', exportCount);
    }

    if (modified && this.isFixActive()) {
      fs.writeFileSync(resolvedPath, JSON.stringify(validConfig, null, 2) + '\n', 'utf-8');
    }

    this.runSubAuditorSync('fallow-config-workspace-diagnostic', () => {
      tryCatchSync(() => {
        const hasPackageJson = fs.existsSync(path.join(this.projectRoot, 'package.json'));
        const subcmdArgs = hasPackageJson
          ? (['dead-code', '--no-type-aware'] as const)
          : (['list', '--workspaces', '--no-type-aware'] as const);
        const result = executeFallowJsonCommand<{
          workspace_diagnostics?: FallowWorkspaceDiagnosticItem[];
        }>(this.projectRoot, subcmdArgs);
        if (result.data?.workspace_diagnostics) {
          const diagModified = validateFallowWorkspaceDiagnostics(
            result.data.workspace_diagnostics,
            this,
            validConfig
          );
          if (diagModified && this.isFixActive()) {
            fs.writeFileSync(resolvedPath, JSON.stringify(validConfig, null, 2) + '\n', 'utf-8');
          }
        }
      });
    });

    this.runSubAuditorSync('fallow-config-doctor', () => {
      if (!this.isRuleActiveForCurrentRun('fallow-config-doctor')) {
        this.markRuleNotApplicable('fallow-config-doctor', 'Requires full speed mode');
        return;
      }
      tryCatchSync(() => {
        const result = executeFallowJsonCommand<FallowDoctorOutput>(this.projectRoot, ['doctor']);

        if (result.skipped === 'env') {
          this.markRuleNotApplicable('fallow-config-doctor', 'Fallow binary verification skipped');
          return;
        }
        if (result.skipped === 'binary_not_found') {
          this.markRuleNotApplicable('fallow-config-doctor', 'Fallow binary not found');
          return;
        }

        if (result.data?.status) {
          validateFallowDoctorResults(result.data, this);
        }
      });
    });
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateFallowConfigAuditor());
