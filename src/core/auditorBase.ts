/**
 * scripts/lib/auditorBase.ts
 *
 * BASE AUDITOR FRAMEWORK (Node.js 26+ Native)
 * Mandatory base orchestrator for all sub-auditors in scripts/auditors/.
 * Enforces the StandardAuditResult contract:
 *   1. Always outputs the clean Box-Drawing summary table to console.
 *   2. Always writes 100% complete structured JSON to scratch/audits/<family>/<id>.json.
 */

import fs from 'node:fs/promises';
import nodeFs from 'node:fs';
import path from 'node:path';
import { styleText } from 'node:util';
import { enableCompileCache } from 'node:module';
import { safeStatSync } from './safeUtils.ts';
import {
  COMMON_CLI_ARGS,
  getProcessCliArgs,
  parseCittyArgs,
  type CittyArgsDef
} from './cli/cittyHarness.ts';
import './permissionGuard.ts';
import {
  type AuditFamily,
  type AuditFinding,
  type FindingSeverity,
  type StandardAuditResult,
  type ICompositeAuditor,
  type SubAuditorStep,
  type SubAuditorReport,
  type SubAuditorStatus,
  type AuditExecutionSpeed,
  type AuditExecutionPhase,
  type AuditFixCapability,
  type AuditorRuleCapabilities,
  type AuditorCapabilities,
  type AuditorCoverageDeclaration,
  type GitIgnoreRequirement,
  type AuditorConfigFileRequirement,
  type AuditorPackageScriptRequirement,
  type AuditorConfigFixContext,
  type AuditorManifestDTO,
  type AuditorCriticalConfig,
  type FixableFindingCounts,
  type FixableViolationsSummary,
  type AuditorExecutionTier,
  type DualCommandProfile,
  type TieredCommandProfile,
  type ThirdPartyToolFailurePolicy,
  AUDIT_EXECUTION_SPEEDS,
  AUDIT_EXECUTION_PHASES,
  AUDIT_FIX_CAPABILITIES,
  SPEED_RANK,
  normalizeSpeeds,
  resolveEffectiveSpeed,
  deriveCanonicalAuditorScript,
  countFixableFindings,
  computeResultsFixableViolations
} from './auditContract.ts';
import {
  type RemediationPhaseId,
  REMEDIATION_PHASE_IDS,
  isRemediationPhaseId
} from './remediationPhases.ts';
import { GitIgnoreRegistry } from './gitIgnoreRegistry.ts';
import { ConfigFileRegistry } from './configFileRegistry.ts';
import { PackageScriptRegistry } from './packageScriptRegistry.ts';

export {
  deriveCanonicalAuditorScript,
  normalizeSpeeds,
  resolveEffectiveSpeed,
  type RemediationPhaseId,
  REMEDIATION_PHASE_IDS
};
import {
  CoverageRecorder,
  deriveCoverageFromRoots,
  deriveCoverageFromRequiredFiles,
  isDeclaredByCoverage,
  resolveActiveCoverageRunId,
  toPosixRelative,
  validateCoverageDeclaration,
  writeCoverageLedger
} from './auditCoverage.ts';
import { normalizePosixPath } from './reportUtils.ts';
import {
  renderBanner,
  renderAuditTaskRow,
  renderFindingsDetail,
  renderSimilarCodeWarningBanner
} from './unifiedTheme.ts';
import { isMainModule } from '../cli/cliUtils.ts';
import { type AuditEngineConfig, type BaseAuditSubsystemConfig, getAuditConfig, loadAuditConfig } from './auditConfig.ts';
import { DEFAULT_AUDIT_CONFIG } from './auditConfigDefaults.ts';
import { evaluateSuiteStatus } from './suiteGating.ts';
import type { SharedAstContext } from './astContext.ts';
import ts from 'typescript';
import { formatDurationMs } from './durationFormatter.ts';
import {
  AuditedDocument,
  type DocumentReplacement,
  type LineColumnPosition
} from './auditedDocument.ts';
import { isPathExempt } from './reportUtils.ts';
import { isTestFileForCodeAudit } from './auditTestPredicates.ts';

export { AuditedDocument, type DocumentReplacement, type LineColumnPosition, isPathExempt };

enableCompileCache();

import {
  ALWAYS_IGNORE_DIRS,
  CANONICAL_IGNORE_DIRS,
  getEffectiveIgnoreDirs,
  getEffectiveUnignoreDirs,
  getEffectiveIgnoreGlobs,
  getLockedSkillsIgnoreGlobs,
  registerDynamicCachePath,
  getDynamicCachePaths,
  SuiteIgnoreRegistry,
  type SuiteIgnoreRequirement,
  type EffectiveIgnoreGlobsOptions
} from './canonicalIgnoreRegistry.ts';

export {
  ALWAYS_IGNORE_DIRS,
  CANONICAL_IGNORE_DIRS,
  getEffectiveIgnoreDirs,
  getEffectiveUnignoreDirs,
  getEffectiveIgnoreGlobs,
  getLockedSkillsIgnoreGlobs,
  registerDynamicCachePath,
  getDynamicCachePaths,
  SuiteIgnoreRegistry,
  type SuiteIgnoreRequirement,
  type EffectiveIgnoreGlobsOptions
};

export const SCANNABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.ts',
  '.js',
  '.vue',
  '.cjs',
  '.mjs'
]); // runtime-set: Fast O(1) membership lookup set

export const CANONICAL_SCANNABLE_ROOTS = ['scripts', 'src', 'tests'] as const;
export type CanonicalScannableRoot = (typeof CANONICAL_SCANNABLE_ROOTS)[number];

function resolvePersistenceExtraRoots(config: ReturnType<typeof getAuditConfig>): string[] {
  if (config.persistence?.engine === 'none') return [];
  const extra: string[] = []; // no-domain: Dynamic filesystem root paths
  if (config.persistence?.supabaseDir) extra.push(config.persistence.supabaseDir);
  if (config.paths?.migrationsDir) extra.push(config.paths.migrationsDir);
  return extra;
}

function resolveDeclaredPathRoots(paths?: AuditEngineConfig['paths']): string[] {
  if (!paths) {
    return [
      ...DEFAULT_AUDIT_CONFIG.paths.codeRoots,
      ...DEFAULT_AUDIT_CONFIG.paths.testRoots
    ];
  }
  return [
    ...(paths.codeRoots ?? DEFAULT_AUDIT_CONFIG.paths.codeRoots),
    ...(paths.testRoots ?? DEFAULT_AUDIT_CONFIG.paths.testRoots),
    ...(paths.integrationRoots ?? []),
    ...(paths.e2eRoots ?? []),
    ...(paths.demoRoots ?? []),
    ...(paths.dataRoots ?? []),
    ...(paths.cliRoots ?? [])
  ];
}

export function getEffectiveScannableRoots(config = getAuditConfig()): readonly string[] {
  return Array.from(
    new Set([...resolveDeclaredPathRoots(config.paths), ...resolvePersistenceExtraRoots(config)])
  );
}

/**
 * Validates that a path component is safe against path traversal.
 */
export function assertSafePathComponent(component: string): void {
  const resolved = path.resolve(process.cwd(), component);
  const rel = path.relative(process.cwd(), resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path traversal attempt detected in path component: ${component}`);
  }
}

/**
 * Resolves the subsystem configuration section from AuditEngineConfig
 * given a declared configKey (supporting direct keys like 'paths', 'constants',
 * or dotted keys like 'htmlValidate.enabled', 'styles.zLayersEnabled', 'fallow.similarCode.enabled').
 */
export function resolveSubsystemConfig(
  config: AuditEngineConfig,
  configKey?: string
): BaseAuditSubsystemConfig | undefined {
  if (!configKey || configKey === 'core' || configKey === 'none') {
    return undefined;
  }
  if (configKey === 'paths') {
    return config.paths;
  }
  const direct = Reflect.get(config, configKey);
  if (direct && typeof direct === 'object') {
    return direct as BaseAuditSubsystemConfig;
  }
  const parts = configKey.split('.');
  const topSection = Reflect.get(config, parts[0]!);
  if (topSection && typeof topSection === 'object') {
    if (parts.length > 2) {
      let current: unknown = topSection;
      for (let i = 1; i < parts.length - 1; i++) {
        if (current && typeof current === 'object' && parts[i]! in current) {
          current = Reflect.get(current as object, parts[i]!);
        } else {
          break;
        }
      }
      if (
        current &&
        typeof current === 'object' &&
        ('ignoreGlobs' in current || 'exemptPaths' in current || 'enabled' in current)
      ) {
        return current as BaseAuditSubsystemConfig;
      }
    }
    return topSection as BaseAuditSubsystemConfig;
  }
  return undefined;
}

import {
  clearLockedSkillsCache,
  SKILLS_LOCK_CANDIDATE_PATHS,
  loadLockedSkills,
  isLockedSkillPath
} from './lockedSkills.ts';

export {
  clearLockedSkillsCache,
  SKILLS_LOCK_CANDIDATE_PATHS,
  loadLockedSkills,
  isLockedSkillPath
};

function matchesDirectorySegments(
  normalized: string,
  segments: readonly string[],
  unignoreSet: ReadonlySet<string>,
  configIgnoredDirs: readonly string[]
): boolean {
  let hasUnignoredAncestor = false;
  const hasConfigIgnored = configIgnoredDirs.length > 0;

  for (const seg of segments) {
    if (unignoreSet.has(seg)) {
      hasUnignoredAncestor = true;
      continue;
    }

    if (ALWAYS_IGNORE_DIRS.has(seg) || getDynamicCachePaths().has(seg)) {
      return true;
    }

    if (!hasUnignoredAncestor) {
      const isIgnored =
        hasConfigIgnored &&
        configIgnoredDirs.some(
          (d) =>
            d === seg ||
            normalized === d ||
            normalized.startsWith(d + '/') ||
            normalized.includes('/' + d + '/')
        );
      if (isIgnored) {
        return true;
      }
    }
  }

  return false;
}

export function matchesSinglePattern(normalized: string, pattern: string): boolean {
  const normPattern = normalizePosixPath(pattern).toLowerCase();
  if (path.posix.matchesGlob(normalized, normPattern)) {
    return true;
  }
  let cleanPattern = normPattern; // no-domain: Non-domain utility collection or data structure
  const matchesAnywhere = cleanPattern.startsWith('**/');
  if (matchesAnywhere) {
    cleanPattern = cleanPattern.slice(3);
    if (path.posix.matchesGlob(normalized, `**/${cleanPattern}`)) {
      return true;
    }
  }
  cleanPattern = cleanPattern.replace(/\/\*\*$/, '').replace(/\/\*$/, '');

  if (!cleanPattern) return false;

  if (matchesAnywhere) {
    return (
      normalized === cleanPattern ||
      normalized.startsWith(cleanPattern + '/') ||
      normalized.endsWith('/' + cleanPattern) ||
      normalized.includes('/' + cleanPattern + '/')
    );
  }

  return normalized === cleanPattern || normalized.startsWith(cleanPattern + '/');
}

/**
 * Determines whether a relative POSIX path belongs to an ignored directory or matches directory ignore patterns.
 */
export function isPathIgnored(
  relPath: string,
  extraIgnorePatterns: readonly string[] = [],
  unignoreDirs: ReadonlySet<string> | readonly string[] = [],
  projectRoot = process.cwd()
): boolean {
  if (isLockedSkillPath(relPath, projectRoot)) {
    return true;
  }

  const effectiveRelPath = path.isAbsolute(relPath)
    ? path.relative(projectRoot, relPath)
    : relPath;

  const normalized = normalizePosixPath(effectiveRelPath).toLowerCase();
  const segments = normalized.split('/');
  const unignoreSet = unignoreDirs instanceof Set ? unignoreDirs : new Set(unignoreDirs);

  const rawConfigIgnoredDirs = getAuditConfig(projectRoot)?.paths?.ignoredDirs ?? [];
  const configIgnoredDirs = rawConfigIgnoredDirs.map((d) =>
    toPosixRelative(projectRoot, d).toLowerCase()
  );

  if (matchesDirectorySegments(normalized, segments, unignoreSet, configIgnoredDirs)) {
    return true;
  }

  const configPatterns = getAuditConfig(projectRoot)?.paths?.ignoredPatterns ?? [];
  const configGlobs = getAuditConfig(projectRoot)?.paths?.ignoreGlobs ?? [];
  const allPatterns = [...extraIgnorePatterns, ...configPatterns, ...configGlobs];

  for (const pattern of allPatterns) {
    if (matchesSinglePattern(normalized, pattern)) {
      if (segments.some((seg) => unignoreSet.has(seg))) {
        continue;
      }
      return true;
    }
  }

  return false;
}

function collectSingleFile(
  filePath: string,
  projectRoot: string,
  extraIgnorePatterns: readonly string[],
  allowedExtensions: ReadonlySet<string>,
  unignoreDirs: ReadonlySet<string> | readonly string[]
): string[] {
  const relPath = normalizePosixPath(path.relative(projectRoot, filePath));
  if (!isPathIgnored(relPath, extraIgnorePatterns, unignoreDirs, projectRoot)) {
    const ext = path.extname(filePath).toLowerCase();
    if (allowedExtensions.size === 0 || allowedExtensions.has(ext)) {
      return [filePath];
    }
  }
  return [];
}

function processDirentEntry(
  entry: nodeFs.Dirent,
  dir: string,
  projectRoot: string,
  extraIgnorePatterns: readonly string[],
  allowedExtensions: ReadonlySet<string>,
  unignoreDirs: ReadonlySet<string> | readonly string[]
): string[] {
  const fullPath = path.resolve(dir, entry.name);
  const relPath = normalizePosixPath(path.relative(projectRoot, fullPath));
  if (isPathIgnored(relPath, extraIgnorePatterns, unignoreDirs, projectRoot)) {
    return [];
  }

  if (entry.isDirectory()) {
    return collectRepositoryFiles(
      fullPath,
      projectRoot,
      extraIgnorePatterns,
      allowedExtensions,
      unignoreDirs
    );
  }

  if (entry.isFile()) {
    const ext = path.extname(entry.name).toLowerCase();
    if (allowedExtensions.size === 0 || allowedExtensions.has(ext)) {
      return [fullPath];
    }
  }
  return [];
}

/**
 * Recursively collects scannable files from a directory, applying ignore filters.
 */
export function collectRepositoryFiles(
  dir: string,
  projectRoot = process.cwd(),
  extraIgnorePatterns: readonly string[] = [],
  allowedExtensions: ReadonlySet<string> = SCANNABLE_EXTENSIONS,
  unignoreDirs: ReadonlySet<string> | readonly string[] = []
): string[] {
  if (!nodeFs.existsSync(dir)) return [];

  const stat = nodeFs.statSync(dir);
  if (stat.isFile()) {
    return collectSingleFile(
      dir,
      projectRoot,
      extraIgnorePatterns,
      allowedExtensions,
      unignoreDirs
    );
  }

  let entries: nodeFs.Dirent[];
  try {
    entries = nodeFs.readdirSync(dir, { withFileTypes: true });
  } catch {
    // catch-ok: directory unreadable or permission denied
    return [];
  }

  const results: string[] = [];
  for (const entry of entries) {
    results.push(
      ...processDirentEntry(
        entry,
        dir,
        projectRoot,
        extraIgnorePatterns,
        allowedExtensions,
        unignoreDirs
      )
    );
  }
  return results;
}

export interface AuditorConfig {
  id: string;
  name: string;
  description: string;
  family: AuditFamily;
  requiredFiles?: string[];
  extraIgnorePatterns?: string[];
  unignoreDirs?: string[];
  projectRoot?: string;
  onFilesCollected?: (files: readonly string[]) => void;
}

export interface AuditorContext {
  values: {
    output?: string;
    'errors-only'?: boolean;
  };
  ignorePatterns: readonly string[];
  unignoreDirs: readonly string[];
  isPathIgnored: (relPath: string) => boolean;
  collectFiles: (roots?: readonly string[], allowedExtensions?: ReadonlySet<string>) => string[];
  logProgress: (msg: string) => void;
  logStep: (stepNumber: number, totalSteps: number, description: string) => void;
  addFinding: (finding: AuditFinding) => void;
  addError: (
    message: string,
    file?: string,
    line?: number,
    context?: string,
    ruleId?: string,
    ruleDescription?: string,
    suiteId?: string,
    suiteName?: string
  ) => void;
  addWarning: (
    message: string,
    file?: string,
    line?: number,
    context?: string,
    ruleId?: string,
    ruleDescription?: string,
    suiteId?: string,
    suiteName?: string
  ) => void;
  setMetric: (key: string, value: number | string) => void;
  getAst: (relPath: string, content?: string) => ts.SourceFile;
  checkFiles: () => Promise<void>;
  finish: (
    finalMetrics?: Record<string, number | string>,
    extra?: Partial<StandardAuditResult>
  ) => Promise<StandardAuditResult>;
  getFindings: () => readonly AuditFinding[];
  setStepLogger?: (
    logger: (stepNumber: number, totalSteps: number, description: string) => void
  ) => void;
  setProgressLogger?: (logger: (msg: string) => void) => void;
}

async function persistAuditJsonReport(
  result: StandardAuditResult,
  config: AuditorConfig,
  outputOption?: string
): Promise<string> {
  const scratchFamilyDir = path.resolve(process.cwd(), 'scratch/audits', config.family);
  const targetJsonPath = path.join(scratchFamilyDir, `${config.id}.json`);
  const latestJsonPath = path.resolve(process.cwd(), 'scratch/audits', `latest_${config.id}.json`);

  try {
    await fs.mkdir(scratchFamilyDir, { recursive: true });
    const jsonString = JSON.stringify(result, null, 2);
    await fs.writeFile(targetJsonPath, jsonString, 'utf-8');
    await fs.writeFile(latestJsonPath, jsonString, 'utf-8');

    if (typeof outputOption === 'string' && outputOption) {
      const relOut = path.relative(process.cwd(), path.resolve(process.cwd(), outputOption));
      if (!relOut.startsWith('..') && !path.isAbsolute(relOut)) {
        const outPath = path.resolve(process.cwd(), outputOption);
        await fs.writeFile(outPath, jsonString, 'utf-8');
      }
    }
  } catch (err: unknown) {
    // Gracefully handle write permissions when running in read-only sandbox mode (--allow-fs-read)
    if (process.env.DEBUG === 'true') {
      console.warn(`[AuditorBase] Could not persist audit json: ${(err as Error).message}`);
    }
  }

  return targetJsonPath;
}

function renderConsoleSummary(
  result: StandardAuditResult,
  config: AuditorConfig,
  targetJsonPath: string
): void {
  console.log(
    renderBanner(config.name, `Familia: ${config.family.toUpperCase()}  |  ID: ${config.id}`)
  );
  console.log(renderAuditTaskRow(result));

  if (result.findings.length > 0) {
    console.log(renderFindingsDetail(result.findings));
  }

  if (
    result.findings.some(
      (f) =>
        f.ruleId === 'fallow-similar-code-failed' &&
        (f.context === 'manual-setup-required' || f.context === 'model-not-ready')
    )
  ) {
    console.log('\n' + renderSimilarCodeWarningBanner() + '\n');
  }

  if (result.status === 'skipped') {
    const reason = (result.metrics?.['Skip-Reason'] as string) || 'Omitido';
    console.log(styleText('cyan', `\n⏭️ Auditoría omitida: ${reason}\n`));
    return;
  }

  const relPath = path.relative(process.cwd(), targetJsonPath);
  console.log(
    `\n${result.status === 'passed' ? styleText('green', '✨ Auditoría completada con éxito.') : styleText('red', '🚨 Auditoría finalizada con errores.')}`
  );
  console.log(styleText('dim', `💾 Reporte detallado guardado en: ${relPath}\n`));
}

function normalizeAuditorFilePath(
  file: string | undefined,
  projectRoot: string
): string | undefined | null {
  if (!file) return file;
  const normFile = toPosixRelative(projectRoot, file);
  if (isLockedSkillPath(normFile, projectRoot)) {
    return null;
  }
  return normFile;
}

const globalWorkspaceFileRamCache = new Map<string, string[]>();

/**
 * Clears the in-memory RAM cache for workspace discovered files.
 */
export function clearWorkspaceFileCache(): void {
  globalWorkspaceFileRamCache.clear();
}

const SUB_AUDITOR_CLI_ARGS = {
  ...COMMON_CLI_ARGS,
  output: { type: 'string', alias: 'o', description: 'Output JSON file path' },
  'errors-only': { type: 'boolean', default: false, description: 'Report only error-severity findings' },
  speed: { type: 'string', description: 'Execution speed tier ceiling' },
  'only-speed': { type: 'string', description: 'Exact execution speed tier' },
  fix: { type: 'boolean', default: false, description: 'Run in automatic repair mode' },
  rule: { type: 'string', alias: 'r', description: 'Filter by rule ID' },
  top: { type: 'string', alias: 't', description: 'Maximum findings to display' },
  'changed-since': { type: 'string', description: 'Git ref for differential scan' }
} as const satisfies CittyArgsDef;

export function setupAuditor(config: AuditorConfig): AuditorContext {
  const fileRamCache = new Map<string, string[]>();

  const startTime = performance.now();
  const parsed = parseCittyArgs(SUB_AUDITOR_CLI_ARGS, getProcessCliArgs());
  const values: Record<string, unknown> = { ...parsed };

  const projectRoot = config.projectRoot || process.cwd();
  const combinedIgnores = [...(config.extraIgnorePatterns || [])];
  const unignoreDirs =
    config.unignoreDirs ??
    (config.family === 'documentation' ? getEffectiveUnignoreDirs(projectRoot) : []);

  const isSubprocess = process.env.AUDIT_SUBPROCESS === 'true';
  const findings: AuditFinding[] = [];
  const metrics: Record<string, number | string> = {};

  let customLogProgress: ((msg: string) => void) | undefined;
  let customLogStep:
    | ((stepNumber: number, totalSteps: number, description: string) => void)
    | undefined;

  return {
    values: values as AuditorContext['values'],
    ignorePatterns: combinedIgnores,
    unignoreDirs,
    isPathIgnored: (relPath: string) =>
      isPathIgnored(relPath, combinedIgnores, unignoreDirs, projectRoot),
    collectFiles: (
      roots: readonly string[] = getEffectiveScannableRoots(),
      allowedExtensions = SCANNABLE_EXTENSIONS
    ) => {
      const cacheKey = [
        projectRoot,
        [...roots].sort().join('|'),
        Array.from(allowedExtensions).sort().join('|'),
        combinedIgnores.join('|'),
        [...unignoreDirs].sort().join('|')
      ].join(':::');

      const cached = fileRamCache.get(cacheKey) ?? globalWorkspaceFileRamCache.get(cacheKey);
      if (cached) {
        config.onFilesCollected?.(cached);
        return cached;
      }

      const seen = new Set<string>();
      const all: string[] = []; // no-domain: Non-domain utility collection or data structure
      for (const root of roots) {
        const fullRoot = path.resolve(projectRoot, root);
        for (const file of collectRepositoryFiles(
          fullRoot,
          projectRoot,
          combinedIgnores,
          allowedExtensions,
          unignoreDirs
        )) {
          if (!seen.has(file)) {
            seen.add(file);
            all.push(file);
          }
        }
      }
      fileRamCache.set(cacheKey, all);
      config.onFilesCollected?.(all);
      return all;
    },
    logProgress: (msg: string) => {
      if (customLogProgress) {
        customLogProgress(msg);
      } else {
        console.log(msg);
      }
    },
    logStep: (stepNumber: number, totalSteps: number, description: string) => {
      if (customLogStep) {
        customLogStep(stepNumber, totalSteps, description);
      } else {
        console.log(`🔍 [${stepNumber}/${totalSteps}] ${description}`);
      }
    },
    setStepLogger: (
      logger: (stepNumber: number, totalSteps: number, description: string) => void
    ) => {
      customLogStep = logger;
    },
    setProgressLogger: (logger: (msg: string) => void) => {
      customLogProgress = logger;
    },
    addFinding: (f: AuditFinding) => {
      const normFile = normalizeAuditorFilePath(f.file, projectRoot);
      if (normFile === null) {
        return;
      }
      findings.push({ ...f, file: normFile });
    },
    addError: (
      message: string,
      file?: string,
      line?: number,
      context?: string,
      ruleId?: string,
      ruleDescription?: string,
      suiteId?: string,
      suiteName?: string
    ) => {
      const normFile = normalizeAuditorFilePath(file, projectRoot);
      if (normFile === null) {
        return;
      }
      findings.push({
        severity: 'error',
        message,
        file: normFile,
        line,
        context,
        ruleId,
        ruleDescription,
        suiteId,
        suiteName
      });
    },
    addWarning: (
      message: string,
      file?: string,
      line?: number,
      context?: string,
      ruleId?: string,
      ruleDescription?: string,
      suiteId?: string,
      suiteName?: string
    ) => {
      if (!values['errors-only']) {
        const normFile = normalizeAuditorFilePath(file, projectRoot);
        if (normFile === null) {
          return;
        }
        findings.push({
          severity: 'warning',
          message,
          file: normFile,
          line,
          context,
          ruleId,
          ruleDescription,
          suiteId,
          suiteName
        });
      }
    },
    setMetric: (key: string, value: number | string) => {
      metrics[key] = value;
    },
    getAst: (relPath: string, content?: string): ts.SourceFile => {
      const fullPath = path.isAbsolute(relPath) ? relPath : path.resolve(projectRoot, relPath);
      const raw =
        content !== undefined
          ? content
          : nodeFs.existsSync(fullPath)
            ? nodeFs.readFileSync(fullPath, 'utf-8')
            : '';
      const doc = new AuditedDocument(fullPath, raw, relPath);
      const sf = doc.getAst();
      if (sf) return sf;
      return ts.createSourceFile(path.basename(fullPath), raw, ts.ScriptTarget.Latest, true);
    },
    checkFiles: async () => {
      if (!config.requiredFiles || config.requiredFiles.length === 0) return;
      try {
        for (const file of config.requiredFiles) {
          await fs.access(file);
        }
      } catch (_err) {
        console.error(
          styleText(
            'red',
            `❌ Archivos requeridos no encontrados o no accesibles:\n${config.requiredFiles.map((f) => `   - ${f}`).join('\n')}`
          )
        );
        if (isSubprocess) {
          throw new Error(
            `Archivos requeridos no encontrados: ${config.requiredFiles.join(', ')}`,
            { cause: _err }
          );
        }
        process.exit(1);
      }
    },
    finish: async (
      finalMetrics?: Record<string, number | string>,
      extra?: Partial<StandardAuditResult>
    ) => {
      if (finalMetrics) {
        Object.assign(metrics, finalMetrics);
      }

      const durationMs = Math.round(performance.now() - startTime);
      const errorsCount = findings.filter((f) => f.severity === 'error').length;
      const warningsCount = findings.filter((f) => f.severity === 'warning').length;
      const infoCount = findings.filter((f) => f.severity === 'info').length;
      const { fixableErrors, fixableWarnings } = countFixableFindings(findings);

      const result: StandardAuditResult = {
        id: config.id,
        name: config.name,
        description: config.description,
        family: config.family,
        status: errorsCount === 0 ? 'passed' : 'failed',
        durationMs,
        metrics,
        findings,
        summary: {
          errors: errorsCount,
          warnings: warningsCount,
          info: infoCount,
          fixableErrors,
          fixableWarnings
        },
        ...extra
      };

      const targetJsonPath = await persistAuditJsonReport(
        result,
        config,
        values.output as string | undefined
      );

      if (!isSubprocess) {
        renderConsoleSummary(result, config, targetJsonPath);
        if (errorsCount > 0) {
          process.exit(1);
        }
      }

      return result;
    },
    getFindings: () => [...findings]
  };
}

export const DEFAULT_AUDITOR_CAPABILITIES: AuditorRuleCapabilities = Object.freeze({
  speed: 'light',
  phase: 'normal',
  fix: 'none',
  md: false,
  ast: false,
  changedOnly: false,
  critical: false
});

export const MAX_AUDITOR_DESCRIPTION_LENGTH = 50;
export const MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH = 60;

/**
 * Derives aggregate suite-level capabilities from the logical union of all its sub-auditor ruleCapabilities.
 */
export function deriveSuiteCapabilities(
  ruleCapabilities: Readonly<Record<string, AuditorRuleCapabilities>> | undefined
): AuditorRuleCapabilities {
  if (!ruleCapabilities || typeof ruleCapabilities !== 'object') {
    return { ...DEFAULT_AUDITOR_CAPABILITIES };
  }
  const entries = Object.values(ruleCapabilities);
  if (entries.length === 0) return { ...DEFAULT_AUDITOR_CAPABILITIES };

  const distinctSpeeds: AuditExecutionSpeed[] = [];
  for (const s of AUDIT_EXECUTION_SPEEDS) {
    if (entries.some((c) => normalizeSpeeds(c.speed).includes(s))) {
      distinctSpeeds.push(s);
    }
  }
  const effectiveSpeed: AuditExecutionSpeed | readonly AuditExecutionSpeed[] =
    distinctSpeeds.length === 0
      ? 'light'
      : distinctSpeeds.length === 1
        ? distinctSpeeds[0]!
        : distinctSpeeds;

  const effectivePhase: AuditExecutionPhase = entries.some((c) => c.phase === 'post-build')
    ? 'post-build'
    : entries.some((c) => c.phase === 'post-run')
      ? 'post-run'
      : entries.some((c) => c.phase === 'setup')
        ? 'setup'
        : 'normal';

  const effectiveFix: AuditFixCapability = entries.some((c) => c.fix === 'priority')
    ? 'priority'
    : entries.some((c) => c.fix === 'normal')
      ? 'normal'
      : 'none';

  return {
    speed: effectiveSpeed,
    phase: effectivePhase,
    fix: effectiveFix,
    md: entries.some((c) => c.md),
    ast: entries.some((c) => c.ast),
    changedOnly: entries.some((c) => c.changedOnly),
    critical: entries.some((c) => c.critical)
  };
}

/**
 * Creates individual rule capabilities for suites, automatically adjusting
 * the `fix` capability per rule based on declared fixableRuleIds.
 */
export function createRuleCapabilities<TRuleId extends string>(
  ruleIds: readonly TRuleId[],
  baseCapabilities: AuditorRuleCapabilities,
  fixableRuleIds?: readonly TRuleId[]
): Record<TRuleId, AuditorRuleCapabilities> {
  const isBaseFix = baseCapabilities.fix !== 'none';
  const fixType: AuditFixCapability = baseCapabilities.fix === 'priority' ? 'priority' : 'normal';
  const fixableSet = new Set(fixableRuleIds ?? (isBaseFix ? ruleIds : []));
  const result: Partial<Record<TRuleId, AuditorRuleCapabilities>> = {};
  for (const id of ruleIds) {
    result[id] = {
      ...baseCapabilities,
      fix: fixableSet.has(id) ? fixType : 'none'
    };
  }
  return result as Record<TRuleId, AuditorRuleCapabilities>;
}

/**
 * Creates uniform rule capabilities for suites where every declared rule
 * shares the same operational capabilities.
 */
export function createUniformRuleCapabilities<TRuleId extends string>(
  ruleIds: readonly TRuleId[],
  capabilities: AuditorRuleCapabilities
): Record<TRuleId, AuditorRuleCapabilities> {
  return createRuleCapabilities(ruleIds, capabilities);
}

/**
 * Creates uniform strategic remediation phases for suites where every declared rule
 * shares the same remediation phase.
 */
export function createUniformRemediationPhases<TRuleId extends string>(
  ruleIds: readonly TRuleId[],
  phase: RemediationPhaseId
): Record<TRuleId, RemediationPhaseId> {
  const result: Partial<Record<TRuleId, RemediationPhaseId>> = {};
  for (const id of ruleIds) {
    result[id] = phase;
  }
  return result as Record<TRuleId, RemediationPhaseId>;
}

/**
 * Canonical capability template for standard fast/light rules (speed: 'light', phase: 'normal', fix: 'none').
 */
export const LIGHT_RULE_CAPABILITIES: Readonly<AuditorRuleCapabilities> = Object.freeze({
  ...DEFAULT_AUDITOR_CAPABILITIES,
  speed: 'light',
  phase: 'normal',
  fix: 'none'
});

/**
 * Canonical capability template for rules requiring TypeScript AST context (speed: 'light', ast: true).
 */
export const AST_RULE_CAPABILITIES: Readonly<AuditorRuleCapabilities> = Object.freeze({
  ...DEFAULT_AUDITOR_CAPABILITIES,
  speed: 'light',
  phase: 'normal',
  fix: 'none',
  ast: true
});

export interface FileScanRootsOptions {
  readonly projectRoot?: string;
  readonly roots?: readonly string[];
  readonly fix?: boolean;
}

/**
 * Resolves effective roots for file scan auditors, dynamically consulting configured srcRoots.
 */
export function resolveFileScanRoots(
  options: FileScanRootsOptions = {},
  defaultRootsResolver?: readonly string[] | ((config: AuditEngineConfig) => readonly string[])
): { effectiveRoot: string; targetRoots: readonly string[] } {
  const effectiveRoot = options.projectRoot ?? process.cwd();
  const config = getAuditConfig(effectiveRoot);
  let resolvedDefaultRoots: readonly string[] | undefined;
  if (typeof defaultRootsResolver === 'function') {
    resolvedDefaultRoots = defaultRootsResolver(config);
  } else if (Array.isArray(defaultRootsResolver)) {
    resolvedDefaultRoots = defaultRootsResolver;
  }
  const targetRoots =
    options.roots ??
    resolvedDefaultRoots ??
    config.paths?.srcRoots ??
    DEFAULT_AUDIT_CONFIG.paths.srcRoots;
  return { effectiveRoot, targetRoots };
}

export interface AuditorOptions<TRuleId extends string = string> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly family: AuditFamily;
  readonly packageName: string;
  readonly icon: string;
  readonly ruleCapabilities: Readonly<Record<TRuleId, AuditorCapabilities>>;
  readonly capabilities?: never;
  readonly fixableRuleIds?: readonly TRuleId[];
  readonly fix?: boolean;
  readonly gitIgnoreEntries?: readonly GitIgnoreRequirement[];
  /**
   * Custom cache or temporary directories/files produced by this suite or underlying tool
   * when `scratch/` cannot be utilized (e.g. `['.fallow', '.oxlintcache']`).
   * Automatically registered into gitIgnoreEntries (for auto-injection into .gitignore)
   * and added to canonical ignore patterns so analyzers do not scan them.
   */
  readonly cachePaths?: readonly string[];
  /**
   * Suggested directory ignore defaults declared by this suite or extension (e.g. `['.agents']`).
   * Automatically collected by the configuration scaffolding engine and injected into
   * `paths.ignoredDirs` when generating new audit.config.ts files.
   */
  readonly defaultIgnoredDirs?: readonly string[];
  /**
   * Suggested glob ignore patterns declared by this suite or extension.
   * Automatically collected and injected into `paths.ignoreGlobs`.
   */
  readonly defaultIgnoreGlobs?: readonly string[];
  readonly configFiles?: readonly AuditorConfigFileRequirement<TRuleId>[];
  readonly scripts?: readonly AuditorPackageScriptRequirement[];
  readonly ruleIds: readonly TRuleId[];
  readonly ruleDescriptions: Readonly<Record<TRuleId, string>>;
  /**
   * Mandatory on-demand diagnostic and remediation guide for every declared rule.
   * Explains root causes, what code patterns trigger the violation, and step-by-step resolution.
   */
  readonly ruleRemediations: Readonly<Record<TRuleId, string>>;
  /**
   * Strategic remediation phase for the entire suite. When specified, rules without an explicit
   * entry in ruleRemediationPhases inherit this phase automatically.
   */
  readonly remediationPhase?: RemediationPhaseId;
  /**
   * Mandatory strategic remediation phase for declared rules.
   * Classifies each rule into the canonical 7-tier resolution workflow:
   * 'setup' | 'prune' | 'dedup' | 'contracts' | 'behavior' | 'hygiene' | 'polish'.
   */
  readonly ruleRemediationPhases?: Readonly<Record<TRuleId, RemediationPhaseId>>;
  readonly subAuditors?: readonly SubAuditorStep[];
  readonly roots?: readonly string[];
  readonly allowedExtensions?: ReadonlySet<string>;
  readonly extraIgnorePatterns?: readonly string[];
  readonly unignoreDirs?: readonly string[];
  readonly requiredFiles?: readonly string[];
  readonly requiresAst?: boolean;
  readonly projectRoot?: string;
  /** Section in .auditor/audit.config.ts utilized specifically by this suite (concise key, e.g. 'styles.baseScssFile', 'fallow.security', 'paths', 'core') */
  readonly configKey: string;
  /** Mandatory default configuration object for this suite to be injected into .auditor/audit.config.ts by auditor fix */
  readonly defaultConfig: Readonly<Record<string, unknown>>;
  /**
   * Mandatory minimum baseline or immutable aspects that host projects CANNOT alter, omit, or degrade.
   * Mandatory by contract for all sub-auditors and host extensions (can be empty object {} if no critical constraints).
   */
  readonly criticalConfig: AuditorCriticalConfig;
  /**
   * Whether this suite relies on third-party binary/tool execution.
   * Mandatory boolean across all sub-auditors and extensions.
   */
  readonly usesThirdPartyTool: boolean;
  /**
   * Node.js 26 permissions required by this suite, CLI tool or underlying binaries.
   * Mandatory contract across all sub-auditors and extensions (pass [] if no special permissions needed).
   */
  readonly requiredPermissions: readonly string[];
  /**
   * Mandatory failure policy when usesThirdPartyTool is true.
   * Prohibited when usesThirdPartyTool is false.
   */
  readonly thirdPartyToolPolicy?: ThirdPartyToolFailurePolicy<TRuleId>;
  /**
   * Files this suite is responsible for. Mandatory for direct BaseAuditor subclasses;
   * FileScanAuditor derives it from `roots` + `allowedExtensions` when omitted.
   */
  readonly coverage?: AuditorCoverageDeclaration;
  /** Relative POSIX path globs or paths exempt from being analyzed by this suite. */
  readonly exemptPaths?: readonly string[];
}

export interface ViolationInput<TRuleId extends string = string> {
  readonly ruleId: TRuleId;
  readonly ruleDescription?: string;
  readonly severity: FindingSeverity;
  readonly file?: string;
  readonly filePath?: string;
  readonly line?: number;
  readonly col?: number;
  readonly column?: number;
  readonly message: string;
  readonly context?: string;
  readonly fixable?: boolean;
  readonly remediation?: string;
  readonly remediationPhase?: RemediationPhaseId;
}

/**
 * Base Object-Oriented Auditor class validation helpers.
 */
function validateAuditorIdentity<TRuleId extends string>(options: AuditorOptions<TRuleId>): void {
  if (typeof options.id !== 'string' || options.id.trim() === '') {
    throw new Error('Auditor must define an id');
  }
  if (typeof options.name !== 'string' || options.name.trim() === '') {
    throw new Error(`Auditor [${options.id}] must define a name`);
  }
  if (!options.packageName || options.packageName.trim().length === 0) {
    throw new Error(`Auditor [${options.id}] must define a packageName`);
  }
  if (!options.icon || typeof options.icon !== 'string' || options.icon.trim().length === 0) {
    throw new Error(`Auditor [${options.id}] must define a mandatory thematic icon/emoji`);
  }
  if (!options.description || options.description.trim().length === 0) {
    throw new Error(`Auditor [${options.id}] must define a human-friendly description`);
  }
  if (
    options.description.length > MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH ||
    options.description.includes('\n')
  ) {
    throw new Error(
      `Auditor [${options.id}] description exceeds ${MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH} characters or contains newlines.`
    );
  }
}

function validateAuditorConfigKey<TRuleId extends string>(options: AuditorOptions<TRuleId>): void {
  if (typeof options.configKey !== 'string' || options.configKey.trim() === '') {
    throw new Error(
      `Auditor [${options.id}] must define a mandatory 'configKey' (e.g. 'secretLeaks.enabled', 'packageDistribution.enabled', 'paths', 'core') to ensure zero hardcoded gating in the orchestrator.`
    );
  }
}

function validateAuditorDefaultConfig<TRuleId extends string>(
  options: AuditorOptions<TRuleId>
): void {
  if (!options.defaultConfig || typeof options.defaultConfig !== 'object') {
    throw new Error(
      `Auditor [${options.id}] must define a mandatory 'defaultConfig' (object). Zero-configuration or optional configurations are prohibited; every suite must self-declare its defaults.`
    );
  }
  if (options.configKey !== 'paths' && options.configKey !== 'core') {
    const defaultCfg = options.defaultConfig as Record<string, unknown>; // open-record: Generic key-value data dictionary container
    if (typeof defaultCfg.enabled !== 'boolean') {
      throw new Error(
        `Auditor [${options.id}] must explicitly define 'defaultConfig.enabled' as a boolean (true or false). Ambiguous or optional activation states are strictly prohibited.`
      );
    }
  }
}

function validateCriticalRationale(auditorId: string, criticalConfig: AuditorCriticalConfig): void {
  const { rationale, requiredMinimums, forbiddenOverrides, validate } = criticalConfig;
  const hasConstraints =
    (requiredMinimums !== undefined && Object.keys(requiredMinimums).length > 0) ||
    (forbiddenOverrides !== undefined && Object.keys(forbiddenOverrides).length > 0) ||
    typeof validate === 'function';

  if (hasConstraints && (typeof rationale !== 'string' || rationale.trim() === '')) {
    throw new Error(
      `[Auditor Contract Violation] Auditor [${auditorId}] must define a non-empty 'rationale' in 'criticalConfig' when critical constraints are declared.`
    );
  }
}

function validateCriticalMinimums(
  auditorId: string,
  requiredMinimums?: Record<string, readonly unknown[]>
): void {
  if (requiredMinimums === undefined) return;
  if (typeof requiredMinimums !== 'object' || requiredMinimums === null) {
    throw new Error(
      `[Auditor Contract Violation] Auditor [${auditorId}] 'criticalConfig.requiredMinimums' must be an object.`
    );
  }
  for (const [key, list] of Object.entries(requiredMinimums)) {
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${auditorId}] 'criticalConfig.requiredMinimums.${key}' must be a non-empty array.`
      );
    }
  }
}

function validateCriticalOverrides(
  auditorId: string,
  forbiddenOverrides?: Record<string, readonly unknown[]>
): void {
  if (forbiddenOverrides === undefined) return;
  if (typeof forbiddenOverrides !== 'object' || forbiddenOverrides === null) {
    throw new Error(
      `[Auditor Contract Violation] Auditor [${auditorId}] 'criticalConfig.forbiddenOverrides' must be an object.`
    );
  }
  for (const [key, list] of Object.entries(forbiddenOverrides)) {
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${auditorId}] 'criticalConfig.forbiddenOverrides.${key}' must be a non-empty array of disallowed values.`
      );
    }
  }
}

function validateCriticalCallbacks(auditorId: string, validate?: unknown, repair?: unknown): void {
  if (validate !== undefined && typeof validate !== 'function') {
    throw new Error(
      `[Auditor Contract Violation] Auditor [${auditorId}] 'criticalConfig.validate' must be a function.`
    );
  }
  if (repair !== undefined && typeof repair !== 'function') {
    throw new Error(
      `[Auditor Contract Violation] Auditor [${auditorId}] 'criticalConfig.repair' must be a function.`
    );
  }
}

function validateAuditorCriticalConfig<TRuleId extends string>(
  options: AuditorOptions<TRuleId>
): void {
  if (options.criticalConfig === undefined) {
    throw new Error(
      `[Auditor Contract Violation] Auditor [${options.id}] must define mandatory 'criticalConfig' in its constructor (can be empty object {}, but cannot be undefined).`
    );
  }
  if (typeof options.criticalConfig !== 'object' || options.criticalConfig === null) {
    throw new Error(
      `[Auditor Contract Violation] Auditor [${options.id}] 'criticalConfig' must be an object.`
    );
  }
  validateCriticalRationale(options.id, options.criticalConfig);
  validateCriticalMinimums(options.id, options.criticalConfig.requiredMinimums);
  validateCriticalOverrides(options.id, options.criticalConfig.forbiddenOverrides);
  validateCriticalCallbacks(
    options.id,
    options.criticalConfig.validate,
    options.criticalConfig.repair
  );
}

export const MANDATORY_AUDITOR_CAPABILITY_KEYS = [
  'speed',
  'phase',
  'fix',
  'md',
  'ast',
  'changedOnly',
  'critical'
] as const;

export const MANDATORY_BOOLEAN_CAPABILITY_KEYS = ['md', 'ast', 'changedOnly', 'critical'] as const;

function isValidRuleSpeed(speed: unknown): boolean {
  if (typeof speed === 'string') {
    return AUDIT_EXECUTION_SPEEDS.some((s) => s === speed);
  }
  if (Array.isArray(speed) && speed.length > 0) {
    return speed.every((s) => typeof s === 'string' && AUDIT_EXECUTION_SPEEDS.some((x) => x === s));
  }
  return false;
}

function validateAuditorRuleCapabilities<TRuleId extends string>(
  options: AuditorOptions<TRuleId>
): void {
  if (
    options.ruleCapabilities === undefined ||
    typeof options.ruleCapabilities !== 'object' ||
    options.ruleCapabilities === null
  ) {
    throw new Error(
      `[Auditor Contract Violation] Auditor [${options.id}] must define mandatory 'ruleCapabilities' in its constructor. ` +
        `Every sub-auditor / rule must declare individual capabilities.`
    );
  }
  for (const ruleId of options.ruleIds) {
    const caps = options.ruleCapabilities[ruleId];
    if (!caps || typeof caps !== 'object') {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${options.id}] is missing 'ruleCapabilities' for declared rule '${ruleId}'. ` +
          `Every sub-auditor must declare its individual capabilities.`
      );
    }
    if (!isValidRuleSpeed(caps.speed)) {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${options.id}] must explicitly define 'ruleCapabilities.${ruleId}.speed' as ${AUDIT_EXECUTION_SPEEDS.map((s) => `'${s}'`).join(' | ')} (or a non-empty array of them).`
      );
    }
    if (typeof caps.phase !== 'string' || !AUDIT_EXECUTION_PHASES.some((p) => p === caps.phase)) {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${options.id}] must explicitly define 'ruleCapabilities.${ruleId}.phase' as ${AUDIT_EXECUTION_PHASES.map((p) => `'${p}'`).join(' | ')}.`
      );
    }
    if (typeof caps.fix !== 'string' || !AUDIT_FIX_CAPABILITIES.some((f) => f === caps.fix)) {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${options.id}] must explicitly define 'ruleCapabilities.${ruleId}.fix' as ${AUDIT_FIX_CAPABILITIES.map((f) => `'${f}'`).join(' | ')}.`
      );
    }
    for (const key of MANDATORY_BOOLEAN_CAPABILITY_KEYS) {
      if (typeof caps[key] !== 'boolean') {
        throw new Error(
          `[Auditor Contract Violation] Auditor [${options.id}] must explicitly define sub-capability 'ruleCapabilities.${ruleId}.${key}' as a boolean (true or false).`
        );
      }
    }
    for (const key of Object.keys(caps)) {
      if (
        !MANDATORY_AUDITOR_CAPABILITY_KEYS.includes(
          key as (typeof MANDATORY_AUDITOR_CAPABILITY_KEYS)[number]
        )
      ) {
        throw new Error(
          `[Auditor Contract Violation] Auditor [${options.id}] declared unknown capability '${key}' in rule '${ruleId}'.`
        );
      }
    }
  }
  for (const ruleId of Object.keys(options.ruleCapabilities)) {
    if (!options.ruleIds.includes(ruleId as TRuleId)) {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${options.id}] declares 'ruleCapabilities' for rule '${ruleId}' which is not in 'ruleIds'.`
      );
    }
  }
}

function validateAuditorFixContract<TRuleId extends string>(
  options: AuditorOptions<TRuleId>,
  capabilities: AuditorRuleCapabilities
): void {
  const isFix = capabilities.fix !== 'none';
  const fixableList = options.fixableRuleIds ?? [];
  const configFilesWithFix = (options.configFiles ?? []).filter((c) =>
    Boolean(c.ruleId && c.generateDefaultContent)
  );

  if (isFix) {
    if (fixableList.length === 0 && configFilesWithFix.length === 0) {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${options.id}] declared capabilities.fix !== 'none' (${capabilities.fix}) but failed to explicitly initialize 'fixableRuleIds' in its constructor. ` +
          `Every auto-repairing suite must explicitly declare which ruleIds it can mechanically fix.`
      );
    }
    for (const ruleId of fixableList) {
      if (!options.ruleIds.includes(ruleId)) {
        throw new Error(
          `[Auditor Contract Violation] Auditor [${options.id}] declared fixable rule '${ruleId}', but it is not registered in 'ruleIds'.`
        );
      }
    }
  } else {
    if (fixableList.length > 0) {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${options.id}] declared 'fixableRuleIds' (${fixableList.join(', ')}) but capabilities.fix is 'none'.`
      );
    }
  }
}

function validateAuditorRules<TRuleId extends string>(options: AuditorOptions<TRuleId>): void {
  if (!Array.isArray(options.ruleIds) || options.ruleIds.length === 0) {
    throw new Error(
      `[Auditor Contract Violation] Auditor [${options.id}] must define a mandatory 'ruleIds' array containing at least one ruleId. Zero-rule suites or omitted rule catalogs are strictly prohibited.`
    );
  }
  if (
    !options.ruleDescriptions ||
    typeof options.ruleDescriptions !== 'object' ||
    Object.keys(options.ruleDescriptions).length === 0
  ) {
    throw new Error(
      `Auditor [${options.id}] must define mandatory 'ruleDescriptions' covering all its declared rules.`
    );
  }
  const descriptions = options.ruleDescriptions as Record<string, string | undefined>;
  for (const ruleId of options.ruleIds) {
    if (!descriptions[ruleId]) {
      throw new Error(
        `Auditor [${options.id}] is missing a rule description in 'ruleDescriptions' for declared rule '${ruleId}'.`
      );
    }
  }
  for (const ruleId of Object.keys(options.ruleDescriptions)) {
    if (!options.ruleIds.includes(ruleId as TRuleId)) {
      throw new Error(
        `Auditor [${options.id}] defines description for rule '${ruleId}' in 'ruleDescriptions' that is not declared in 'ruleIds'.`
      );
    }
  }
}

function validateAuditorRuleRemediations<TRuleId extends string>(
  options: AuditorOptions<TRuleId>
): void {
  if (
    !options.ruleRemediations ||
    typeof options.ruleRemediations !== 'object' ||
    Object.keys(options.ruleRemediations).length === 0
  ) {
    throw new Error(
      `[Auditor Contract Violation] Auditor [${options.id}] must define mandatory 'ruleRemediations' covering all its declared rules. ` +
        `Every sub-auditor and host extension is strictly required to expose on-demand diagnostic and remediation guides.`
    );
  }
  const remediations = options.ruleRemediations as Record<string, string | undefined>;
  for (const ruleId of options.ruleIds) {
    const guide = remediations[ruleId];
    if (!guide || typeof guide !== 'string' || guide.trim() === '') {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${options.id}] is missing a mandatory remediation guide in 'ruleRemediations' for declared rule '${ruleId}'. ` +
          `Every rule must provide actionable guidance on root cause and steps to resolve.`
      );
    }
    if (/^Guía de diagnóstico y remediación para/i.test(guide.trim())) {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${options.id}] contains a placeholder remediation guide for rule '${ruleId}'. ` +
          `Every rule must provide actionable guidance on root cause, diagnosis, and steps to resolve.`
      );
    }
  }
  for (const ruleId of Object.keys(options.ruleRemediations)) {
    if (!options.ruleIds.includes(ruleId as TRuleId)) {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${options.id}] defines remediation guide for rule '${ruleId}' in 'ruleRemediations' that is not declared in 'ruleIds'.`
      );
    }
  }
}

function validateAuditorRuleRemediationPhases<TRuleId extends string>(
  options: AuditorOptions<TRuleId>
): void {
  const hasSuitePhase = Boolean(options.remediationPhase && isRemediationPhaseId(options.remediationPhase));
  const hasRulePhases = Boolean(
    options.ruleRemediationPhases &&
      typeof options.ruleRemediationPhases === 'object' &&
      Object.keys(options.ruleRemediationPhases).length > 0
  );

  if (!hasSuitePhase && !hasRulePhases) {
    throw new Error(
      `[Auditor Contract Violation] Auditor [${options.id}] must define mandatory 'remediationPhase' or 'ruleRemediationPhases' in its constructor options. ` +
        `Every sub-auditor and host extension is strictly required to declare how it is classified in the strategic remediation order.`
    );
  }

  if (options.remediationPhase && !isRemediationPhaseId(options.remediationPhase)) {
    throw new Error(
      `[Auditor Contract Violation] Auditor [${options.id}] defines invalid 'remediationPhase': '${String(options.remediationPhase)}'. ` +
        `Must be one of: ${REMEDIATION_PHASE_IDS.join(', ')}.`
    );
  }

  const phases = (options.ruleRemediationPhases ?? {}) as Record<string, RemediationPhaseId | undefined>;
  for (const ruleId of options.ruleIds) {
    const phase = phases[ruleId] ?? options.remediationPhase;
    if (!phase || !isRemediationPhaseId(phase)) {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${options.id}] is missing a valid remediation phase for declared rule '${ruleId}'. ` +
          `Declare 'remediationPhase' or 'ruleRemediationPhases' with one of: ${REMEDIATION_PHASE_IDS.join(', ')}.`
      );
    }
  }

  if (options.ruleRemediationPhases) {
    for (const ruleId of Object.keys(options.ruleRemediationPhases)) {
      if (!options.ruleIds.includes(ruleId as TRuleId)) {
        throw new Error(
          `[Auditor Contract Violation] Auditor [${options.id}] defines remediation phase for rule '${ruleId}' in 'ruleRemediationPhases' that is not declared in 'ruleIds'.`
        );
      }
    }
  }
}

function validateAuditorScripts<TRuleId extends string>(options: AuditorOptions<TRuleId>): void {
  if (!Array.isArray(options.scripts) || options.scripts.length === 0) {
    throw new Error(
      `Auditor [${options.id}] must define a mandatory 'scripts' contract (array of AuditorPackageScriptRequirement). ` +
        `Every sub-auditor and host extension must explicitly declare the canonical package.json script and CLI command used to execute it.`
    );
  }
  for (const script of options.scripts) {
    if (!script.name || typeof script.name !== 'string' || script.name.trim() === '') {
      throw new Error(
        `Auditor [${options.id}] defines an invalid script requirement: 'name' must be a non-empty string.`
      );
    }
    if (!script.command || typeof script.command !== 'string' || script.command.trim() === '') {
      throw new Error(
        `Auditor [${options.id}] defines an invalid script requirement for '${script.name}': 'command' must be a non-empty string.`
      );
    }
    if (
      !script.description ||
      typeof script.description !== 'string' ||
      script.description.trim() === ''
    ) {
      throw new Error(
        `Auditor [${options.id}] defines an invalid script requirement for '${script.name}': 'description' must be a non-empty string.`
      );
    }
  }
}

function validateAuditorThirdPartyToolContract<TRuleId extends string>(
  options: AuditorOptions<TRuleId>
): void {
  if (typeof options.usesThirdPartyTool !== 'boolean') {
    throw new Error(
      `[Auditor Contract Violation] Auditor [${options.id}] must define mandatory 'usesThirdPartyTool' as a boolean (true or false). ` +
        `Every sub-auditor and host extension must explicitly declare whether it delegates to third-party tools or binaries.`
    );
  }

  if (options.usesThirdPartyTool) {
    if (!options.thirdPartyToolPolicy || typeof options.thirdPartyToolPolicy !== 'object') {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${options.id}] declared usesThirdPartyTool: true but failed to provide mandatory 'thirdPartyToolPolicy'. ` +
          `Every suite using third-party tools must declare what happens on failure or when output cannot be parsed.`
      );
    }
    const policy = options.thirdPartyToolPolicy;
    if (!policy.toolName || typeof policy.toolName !== 'string' || policy.toolName.trim() === '') {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${options.id}] 'thirdPartyToolPolicy.toolName' must be a non-empty string naming the external tool.`
      );
    }
    if (policy.fallbackBehavior !== 'throw' && policy.fallbackBehavior !== 'violation') {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${options.id}] 'thirdPartyToolPolicy.fallbackBehavior' must be either 'throw' or 'violation'.`
      );
    }
    if (policy.fallbackBehavior === 'violation') {
      if (!policy.fallbackRuleId || typeof policy.fallbackRuleId !== 'string') {
        throw new Error(
          `[Auditor Contract Violation] Auditor [${options.id}] declared fallbackBehavior: 'violation' but omitted mandatory 'fallbackRuleId'.`
        );
      }
      if (!options.ruleIds.includes(policy.fallbackRuleId as TRuleId)) {
        throw new Error(
          `[Auditor Contract Violation] Auditor [${options.id}] designated fallbackRuleId '${policy.fallbackRuleId}' which is not in declared 'ruleIds'.`
        );
      }
    }
  } else {
    if (options.thirdPartyToolPolicy !== undefined) {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${options.id}] declared usesThirdPartyTool: false but provided 'thirdPartyToolPolicy'. ` +
          `Suites that do not use third-party tools must not declare a thirdPartyToolPolicy.`
      );
    }
  }
}

function validateAuditorRequiredPermissions<TRuleId extends string>(
  options: AuditorOptions<TRuleId>
): void {
  if (options.requiredPermissions === undefined || !Array.isArray(options.requiredPermissions)) {
    throw new Error(
      `[Auditor Contract Violation] Auditor [${options.id}] must define mandatory 'requiredPermissions' array in its constructor options (pass [] if no special permissions are needed).`
    );
  }
}

function validateAuditorOptions<TRuleId extends string>(
  options: AuditorOptions<TRuleId>,
  effectiveCapabilities: AuditorCapabilities
): void {
  validateAuditorIdentity(options);
  validateAuditorConfigKey(options);
  validateAuditorDefaultConfig(options);
  validateAuditorCriticalConfig(options);
  validateAuditorThirdPartyToolContract(options);
  validateAuditorRequiredPermissions(options);
  validateAuditorRules(options);
  validateAuditorRuleCapabilities(options);
  validateAuditorFixContract(options, effectiveCapabilities);
  validateAuditorRuleRemediations(options);
  validateAuditorRuleRemediationPhases(options);
  validateAuditorScripts(options);
  if (options.gitIgnoreEntries !== undefined && !Array.isArray(options.gitIgnoreEntries)) {
    throw new Error(`Auditor [${options.id}] 'gitIgnoreEntries' must be an array if defined.`);
  }
  validateCoverageDeclaration(options.id, options.coverage);
}

function validateAuditorRuleDescriptions<TRuleId extends string>(
  options: AuditorOptions<TRuleId>,
  formatFn: (ruleId: TRuleId, desc: string) => string
): void {
  if (!options.ruleDescriptions) return;

  const declaredRules: readonly string[] =
    options.ruleIds && options.ruleIds.length > 0
      ? options.ruleIds
      : Object.keys(options.ruleDescriptions);
  for (const rawRuleId of declaredRules) {
    const ruleId = rawRuleId as TRuleId;
    const desc = options.ruleDescriptions[ruleId];
    if (!desc || typeof desc !== 'string' || !desc.trim()) {
      throw new Error(
        `Auditor [${options.id}] is missing a rule description for rule '${ruleId}'.`
      );
    }
    const formatted = formatFn(ruleId, desc);
    if (formatted.length > MAX_AUDITOR_DESCRIPTION_LENGTH || formatted.includes('\n')) {
      throw new Error(
        `Auditor [${options.id}] rule description for '${ruleId}' ('${formatted}', length: ${formatted.length}) exceeds ${MAX_AUDITOR_DESCRIPTION_LENGTH} characters or contains newlines.`
      );
    }
  }
}

function extractStringList(candidate: unknown): readonly string[] {
  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === 'string')
    : [];
}

function resolveSubsystemIgnoresAndExemptions(
  options: AuditorOptions<string>,
  config: AuditEngineConfig
): { extraIgnorePatterns: readonly string[]; exemptPaths: readonly string[] } {
  const section = resolveSubsystemConfig(config, options.configKey);
  const effectiveSection =
    section && typeof section === 'object' ? section : options.defaultConfig;
  const sectionObj =
    effectiveSection && typeof effectiveSection === 'object'
      ? (effectiveSection as Record<string, unknown>)
      : {};
  const ignoreGlobs = extractStringList(sectionObj.ignoreGlobs);
  const exemptPaths = [
    ...extractStringList(sectionObj.exemptPaths),
    ...extractStringList(sectionObj.exemptFiles)
  ];
  return {
    extraIgnorePatterns: Array.from(
      new Set([...(options.extraIgnorePatterns ?? []), ...ignoreGlobs])
    ),
    exemptPaths: Array.from(new Set([...(options.exemptPaths ?? []), ...exemptPaths]))
  };
}

function resolveRulePhases<TRuleId extends string>(
  options: AuditorOptions<TRuleId>
): Readonly<Record<TRuleId, RemediationPhaseId>> {
  const resolvedPhases: Record<TRuleId, RemediationPhaseId> = {} as Record<
    TRuleId,
    RemediationPhaseId
  >;
  for (const ruleId of options.ruleIds) {
    resolvedPhases[ruleId] = options.ruleRemediationPhases?.[ruleId] ?? options.remediationPhase!;
  }
  return Object.freeze(resolvedPhases);
}

function resolveFixableRuleIds<TRuleId extends string>(
  options: AuditorOptions<TRuleId>
): Set<TRuleId> {
  const configFixableRules = (options.configFiles ?? [])
    .filter((c) => Boolean(c.ruleId && c.generateDefaultContent))
    .map((c) => c.ruleId as TRuleId);
  return new Set<TRuleId>([
    ...(options.fixableRuleIds ?? []),
    ...configFixableRules
  ]);
}

export abstract class BaseAuditor<TRuleId extends string = string> implements ICompositeAuditor {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly family: AuditFamily;
  public readonly packageName: string;
  public readonly icon: string;
  public readonly capabilities: AuditorCapabilities;
  public readonly ruleCapabilities: Readonly<Record<TRuleId, AuditorCapabilities>>;
  public readonly gitIgnoreEntries: readonly GitIgnoreRequirement[];
  public readonly cachePaths: readonly string[];
  public readonly configFiles: readonly AuditorConfigFileRequirement<TRuleId>[];
  public readonly scripts: readonly AuditorPackageScriptRequirement[];
  public readonly requiredPermissions: readonly string[];
  public readonly ruleIds: readonly TRuleId[];
  public readonly ruleDescriptions: Readonly<Record<TRuleId, string>>;
  public readonly ruleRemediations: Readonly<Record<TRuleId, string>>;
  public readonly ruleRemediationPhases: Readonly<Record<TRuleId, RemediationPhaseId>>;
  public readonly explicitSubAuditors?: readonly SubAuditorStep[];
  public readonly roots: readonly string[];
  public readonly allowedExtensions: ReadonlySet<string>;
  public readonly extraIgnorePatterns: readonly string[];
  public readonly exemptPaths: readonly string[];
  public readonly unignoreDirs: readonly string[];
  public readonly requiredFiles: readonly string[];
  public readonly requiresAst: boolean;
  public readonly projectRoot: string;
  public readonly configKey: string;
  public readonly defaultConfig: Readonly<Record<string, unknown>>;
  public readonly criticalConfig: AuditorCriticalConfig;
  public readonly usesThirdPartyTool: boolean;
  public readonly thirdPartyToolPolicy?: ThirdPartyToolFailurePolicy<TRuleId>;
  protected readonly fixableRuleIds: ReadonlySet<TRuleId>;
  protected readonly durationsByRule: Map<TRuleId, number> = new Map();
  protected auditExecutionDurationMs?: number;
  protected readonly instanceStartTime: number = performance.now();
  protected readonly declaredSubAuditors: Map<TRuleId, () => Promise<void> | void> = new Map();

  protected readonly context: AuditorContext;
  protected readonly countsByRule: Map<TRuleId, number> = new Map();
  protected readonly errorsByRule: Map<TRuleId, number> = new Map();
  protected readonly warningsByRule: Map<TRuleId, number> = new Map();
  protected readonly fixableErrorsByRule: Map<TRuleId, number> = new Map();
  protected readonly fixableWarningsByRule: Map<TRuleId, number> = new Map();
  protected readonly subAuditorReports: SubAuditorReport[] = [];
  protected readonly coverageRecorder: CoverageRecorder;
  protected readonly fixMode: boolean;
  protected isSkipped = false;
  protected skipReason?: string;

  public getFixableRuleIds(): readonly TRuleId[] {
    return Array.from(this.fixableRuleIds);
  }

  public recordRuleDuration(ruleId: TRuleId, durationMs: number): void {
    const current = this.durationsByRule.get(ruleId) ?? 0;
    this.durationsByRule.set(ruleId, current + Math.max(0, durationMs));
  }

  /**
   * Allows an external subprogram with its own telemetry (such as Fallow elapsed_ms)
   * or extension to report or override its net internally measured execution time.
   */
  public reportRuleDuration(ruleId: TRuleId, durationMs: number): void {
    this.durationsByRule.set(ruleId, Math.max(0, durationMs));
  }

  /**
   * Formally declares a sub-tool or sub-auditor bound to a declared rule.
   * The superclass automatically orchestrates its execution and empirically measures
   * its execution runtime homogeneously and transparently.
   */
  public declareSubAuditor(ruleId: TRuleId, action: () => Promise<void> | void): void {
    if (!this.ruleIds.includes(ruleId)) {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${this.id}] attempted to declare sub-auditor for '${ruleId}', but that rule is not registered in 'ruleIds'.`
      );
    }
    this.declaredSubAuditors.set(ruleId, action);
  }

  /**
   * Executes a sub-auditor or rule block empirically measuring its start and end
   * completely transparently.
   */
  public async runSubAuditor<T = void>(ruleId: TRuleId, action: () => Promise<T> | T): Promise<T> {
    this.markRuleEvaluated(ruleId);
    const start = performance.now();
    try {
      return await action();
    } finally {
      this.recordRuleDuration(ruleId, performance.now() - start);
    }
  }

  public runSubAuditorSync<T = void>(ruleId: TRuleId, action: () => T): T {
    this.markRuleEvaluated(ruleId);
    const start = performance.now();
    try {
      return action();
    } finally {
      this.recordRuleDuration(ruleId, performance.now() - start);
    }
  }

  /**
   * @deprecated Prohibited under the Universal Empirical Individual Timing Contract.
   * Batch duration duplication is strictly forbidden. Measure rules individually with runSubAuditorSync or runSubAuditor.
   */
  public async runSubAuditorsBatch(
    ruleIds: readonly TRuleId[],
    _action: () => Promise<void> | void
  ): Promise<void> {
    throw new Error(
      `[BaseAuditor] 'runSubAuditorsBatch' is strictly prohibited under the Universal Empirical Individual Timing Contract. ` +
        `Batch stamping duplicates elapsed time across [${ruleIds.join(', ')}]. ` +
        `Measure each rule individually using 'this.runSubAuditorSync(ruleId, () => ...)' or 'await this.runSubAuditor(ruleId, async () => ...)'.`
    );
  }

  /**
   * @deprecated Prohibited under the Universal Empirical Individual Timing Contract.
   * Batch duration duplication is strictly forbidden. Measure rules individually with runSubAuditorSync or runSubAuditor.
   */
  public runSubAuditorsBatchSync(ruleIds: readonly TRuleId[], _action: () => void): void {
    throw new Error(
      `[BaseAuditor] 'runSubAuditorsBatchSync' is strictly prohibited under the Universal Empirical Individual Timing Contract. ` +
        `Batch stamping duplicates elapsed time across [${ruleIds.join(', ')}]. ` +
        `Measure each rule individually using 'this.runSubAuditorSync(ruleId, () => ...)' or 'await this.runSubAuditor(ruleId, async () => ...)'.`
    );
  }

  public getRuleDuration(ruleId: TRuleId): number | undefined {
    return this.durationsByRule.get(ruleId);
  }

  public getDurationsByRule(): ReadonlyMap<TRuleId, number> {
    return this.durationsByRule;
  }

  private readonly executedCommandTiers: Map<string, string> = new Map();

  /**
   * Resolves the active speed ceiling (`maxSpeed`) and optional exact speed filter (`onlySpeed`)
   * from environment variables or CLI arguments.
   */
  public getExecutionSpeedOptions(): {
    maxSpeed: AuditExecutionSpeed;
    onlySpeed?: AuditExecutionSpeed;
    isSpeedSpecified?: boolean;
  } {
    const rawValues = this.context.values as Record<string, unknown> | undefined;
    const rawOnly =
      (rawValues?.['only-speed'] as string | undefined) || process.env.AUDITOR_ONLY_SPEED;
    const onlySpeed =
      rawOnly && AUDIT_EXECUTION_SPEEDS.some((s) => s === rawOnly)
        ? (rawOnly as AuditExecutionSpeed)
        : undefined;

    const rawSpeed = (rawValues?.speed as string | undefined) || process.env.AUDITOR_SPEED;
    if (rawSpeed && AUDIT_EXECUTION_SPEEDS.some((s) => s === rawSpeed)) {
      return { maxSpeed: rawSpeed as AuditExecutionSpeed, onlySpeed, isSpeedSpecified: true };
    }

    const preset = process.env.AUDITOR_PRESET;
    if (preset === 'lint') return { maxSpeed: 'light', onlySpeed, isSpeedSpecified: true };
    if (preset === 'full' || preset === 'precommit')
      return { maxSpeed: 'full', onlySpeed, isSpeedSpecified: true };
    if (preset === 'critical') return { maxSpeed: 'light', onlySpeed, isSpeedSpecified: true };
    return { maxSpeed: 'heavy', onlySpeed, isSpeedSpecified: Boolean(onlySpeed) };
  }

  /**
   * Resolves the effective speed ('light' | 'heavy' | 'full') for a specific ruleId in the current run,
   * or null if the rule should be skipped under the current speed ceiling or exact speed filter.
   */
  public resolveRuleEffectiveSpeed(ruleId: TRuleId): AuditExecutionSpeed | null {
    const caps = this.ruleCapabilities[ruleId];
    if (!caps) return null;
    const speedOpts = this.getExecutionSpeedOptions();

    // Mandate: if critical=true and speed has 2+, always select fastest when speed is unspecified
    if (caps.critical && !speedOpts.isSpeedSpecified) {
      const speeds = normalizeSpeeds(caps.speed);
      if (speeds.length >= 2) {
        return speeds.reduce((fastest, current) =>
          SPEED_RANK[current] < SPEED_RANK[fastest] ? current : fastest
        );
      }
    }

    return resolveEffectiveSpeed(caps.speed, speedOpts);
  }

  /**
   * Returns the active execution tier ('light', 'heavy', 'full', 'md', 'fix', or 'post-build').
   */
  public getExecutionTier(): AuditorExecutionTier {
    if (this.fixMode || this.isFixModeRequested()) return 'fix';
    if (process.env.AUDITOR_PRESET === 'md') return 'md';
    if (
      process.env.AUDITOR_PHASE === 'post-build' ||
      process.env.AUDITOR_PRESET === 'post-build' ||
      process.env.AUDITOR_PRESET === 'build'
    ) {
      return 'post-build';
    }
    if (process.env.AUDITOR_PRESET === 'critical') {
      const speeds = normalizeSpeeds(this.capabilities.speed);
      if (speeds.includes('light')) {
        return 'light';
      }
    }
    const speedOpts = this.getExecutionSpeedOptions();

    // Mandate: if critical=true and speed has 2+, always select fastest when speed is unspecified
    if (this.capabilities.critical && !speedOpts.isSpeedSpecified) {
      const speeds = normalizeSpeeds(this.capabilities.speed);
      if (speeds.length >= 2) {
        return speeds.reduce((fastest, current) =>
          SPEED_RANK[current] < SPEED_RANK[fastest] ? current : fastest
        );
      }
    }

    return (
      resolveEffectiveSpeed(this.capabilities.speed, speedOpts) ??
      speedOpts.onlySpeed ??
      speedOpts.maxSpeed
    );
  }

  /**
   * Returns true when the active run is a lightweight run ('light' or 'md').
   */
  public isFastMode(): boolean {
    const tier = this.getExecutionTier();
    return tier === 'light' || tier === 'md';
  }

  /**
   * Checks whether a specific declared ruleId is active for the current execution tier/speed.
   */
  public isRuleActiveForCurrentRun(ruleId: TRuleId): boolean {
    const caps = this.ruleCapabilities[ruleId];
    if (!caps) return false;
    const tier = this.getExecutionTier();
    if (tier === 'fix') return caps.fix !== 'none';
    if (tier === 'md') return caps.md;
    if (tier === 'post-build') return caps.phase === 'post-build';
    return this.resolveRuleEffectiveSpeed(ruleId) !== null;
  }

  private isDualOrTieredProfile<TArgs>(
    val: unknown
  ): val is DualCommandProfile<TArgs> | TieredCommandProfile<TArgs> {
    return typeof val === 'object' && val !== null && 'command' in val;
  }

  /**
   * Resolves arguments for a tiered or dual command profile,
   * enforcing the Anti-Repetition Invariant: a command cannot be resolved in multiple tiers in the same run.
   */
  public resolveCommandArgs<TArgs = readonly string[]>(
    profile: DualCommandProfile<TArgs> | TieredCommandProfile<TArgs> | (TArgs & readonly unknown[])
  ): TArgs {
    if (!this.isDualOrTieredProfile<TArgs>(profile)) {
      return profile;
    }
    const tier = this.getExecutionTier();
    const previousTier = this.executedCommandTiers.get(profile.command);
    if (previousTier !== undefined) {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${this.id}]: Command '${profile.command}' was already resolved/executed with profile '${previousTier}'. ` +
          `Executing or resolving multiple speed variants of the SAME command in the same run is strictly prohibited.`
      );
    }
    this.executedCommandTiers.set(profile.command, tier);

    // Multi-tier command profile
    if ('profiles' in profile) {
      return profile.profiles[tier] ?? profile.defaultArgs;
    }

    // Dual command profile compatibility
    const profileTier = this.isFastMode() ? 'fast' : 'heavy';
    return profileTier === 'fast' ? profile.fastArgs : profile.heavyArgs;
  }

  /** Derived from the coverage recorder: record real files with `recordScanned()` instead of counting. */
  protected get filesScannedCount(): number {
    return this.coverageRecorder.scannedCount;
  }

  protected set filesScannedCount(count: number) {
    this.coverageRecorder.recordExternalScanCount(count);
  }

  public markSkipped(reason: string): void {
    this.isSkipped = true;
    this.skipReason = reason;
  }

  private resolveEffectiveCoverage(
    options: AuditorOptions<TRuleId>,
    effectiveProjectRoot: string
  ): AuditorCoverageDeclaration | undefined {
    if (options.coverage) return options.coverage;
    if (options.roots !== undefined) {
      const targetRoots =
        options.roots.length > 0
          ? options.roots
          : getEffectiveScannableRoots(getAuditConfig(effectiveProjectRoot));
      return deriveCoverageFromRoots(
        targetRoots,
        options.allowedExtensions ?? SCANNABLE_EXTENSIONS,
        effectiveProjectRoot
      );
    }
    if (options.requiredFiles && options.requiredFiles.length > 0) {
      return deriveCoverageFromRequiredFiles(
        options.requiredFiles,
        effectiveProjectRoot,
        options.allowedExtensions
      );
    }
    return undefined;
  }

  private resolveEffectiveScripts(
    options: AuditorOptions<TRuleId>
  ): readonly AuditorPackageScriptRequirement[] {
    if (options.scripts && options.scripts.length > 0) {
      return options.scripts;
    }
    return [
      deriveCanonicalAuditorScript(options.id, options.description, {
        category: options.family,
        permissions: options.requiredPermissions ?? [],
        isApplicable: (config) =>
          evaluateSuiteStatus(options.id, config, options.configKey).enabled !== false
      })
    ];
  }

  private registerAuditorDependencies(
    options: AuditorOptions<TRuleId>,
    effectiveScripts: readonly AuditorPackageScriptRequirement[]
  ): void {
    if (options.gitIgnoreEntries && options.gitIgnoreEntries.length > 0) {
      GitIgnoreRegistry.registerMany(options.gitIgnoreEntries);
    }
    if (options.cachePaths && options.cachePaths.length > 0) {
      for (const cp of options.cachePaths) {
        registerDynamicCachePath(cp);
        const trimmed = cp.endsWith('/') ? cp.slice(0, -1) : cp;
        const normPattern = cp.endsWith('/') || !cp.includes('.') ? `${trimmed}/` : cp;
        GitIgnoreRegistry.register({
          id: `${options.id}-${cp}`,
          pattern: normPattern,
          reason: `Cache or temporary artifacts generated by [${options.id}]`,
          isApplicable: (config) =>
            evaluateSuiteStatus(options.id, config, options.configKey).enabled !== false
        });
      }
    }
    if (options.configFiles && options.configFiles.length > 0) {
      ConfigFileRegistry.registerMany(
        options.configFiles as readonly AuditorConfigFileRequirement<string>[]
      );
    }
    if (effectiveScripts && effectiveScripts.length > 0) {
      PackageScriptRegistry.registerMany(effectiveScripts, options.id);
    }
    if (
      (options.defaultIgnoredDirs && options.defaultIgnoredDirs.length > 0) ||
      (options.defaultIgnoreGlobs && options.defaultIgnoreGlobs.length > 0)
    ) {
      SuiteIgnoreRegistry.register({
        suiteId: options.id,
        ignoredDirs: options.defaultIgnoredDirs,
        ignoreGlobs: options.defaultIgnoreGlobs,
        reason: `Suggested ignore patterns declared by [${options.id}]`
      });
    }
  }

  private initExecutionContext(coverageDeclaration: AuditorCoverageDeclaration): AuditorContext {
    return setupAuditor({
      id: this.id,
      name: this.name,
      description: this.description,
      family: this.family,
      requiredFiles: [...this.requiredFiles],
      extraIgnorePatterns: [...this.extraIgnorePatterns],
      unignoreDirs: [...this.unignoreDirs],
      projectRoot: this.projectRoot,
      onFilesCollected: (files) => {
        for (const f of files) {
          const rel = toPosixRelative(this.projectRoot, f);
          if (isDeclaredByCoverage(rel, coverageDeclaration)) {
            this.recordScanned(rel);
          }
        }
      }
    });
  }

  private initRuleLedger(): void {
    for (const ruleId of this.ruleIds) {
      this.countsByRule.set(ruleId, 0);
      this.errorsByRule.set(ruleId, 0);
      this.warningsByRule.set(ruleId, 0);
      this.fixableErrorsByRule.set(ruleId, 0);
      this.fixableWarningsByRule.set(ruleId, 0);
    }
  }

  constructor(options: AuditorOptions<TRuleId>) {
    if (Object.hasOwn(options, 'capabilities')) {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${options.id}] passed redundant 'capabilities' to constructor options. ` +
          `Suite-level capabilities must NOT be passed directly; define individual 'ruleCapabilities' for each sub-auditor/rule and BaseAuditor will automatically derive suite capabilities.`
      );
    }
    validateAuditorRuleCapabilities(options);
    const effectiveProjectRoot = options.projectRoot || process.cwd();
    const effectiveCoverage = this.resolveEffectiveCoverage(options, effectiveProjectRoot);
    const effectiveScripts = this.resolveEffectiveScripts(options);
    const effectiveCapabilities = deriveSuiteCapabilities(options.ruleCapabilities);
    validateAuditorOptions(
      { ...options, coverage: effectiveCoverage, scripts: effectiveScripts },
      effectiveCapabilities
    );

    this.ruleCapabilities = options.ruleCapabilities;
    this.capabilities = effectiveCapabilities;
    this.requiresAst = effectiveCapabilities.ast;
    this.packageName = options.packageName;
    this.icon = options.icon;
    this.id = options.id;
    this.name = options.name;
    this.description = options.description;
    this.family = options.family;
    this.configKey = options.configKey;
    this.defaultConfig = options.defaultConfig;
    this.criticalConfig = options.criticalConfig;
    this.usesThirdPartyTool = options.usesThirdPartyTool;
    this.thirdPartyToolPolicy = options.thirdPartyToolPolicy;
    this.gitIgnoreEntries = options.gitIgnoreEntries ?? [];
    this.cachePaths = options.cachePaths ?? [];
    this.configFiles = options.configFiles ?? [];
    this.scripts = effectiveScripts;
    this.requiredPermissions = options.requiredPermissions ?? [];
    this.registerAuditorDependencies(options, effectiveScripts);
    this.fixMode = Boolean(options.fix);
    this.ruleIds = options.ruleIds;
    this.ruleDescriptions = options.ruleDescriptions;
    this.ruleRemediations = options.ruleRemediations;
    this.ruleRemediationPhases = resolveRulePhases(options);
    this.explicitSubAuditors = options.subAuditors;
    const config = getAuditConfig(effectiveProjectRoot);
    this.roots = options.roots ?? getEffectiveScannableRoots(config);
    this.allowedExtensions = options.allowedExtensions ?? SCANNABLE_EXTENSIONS;
    const { extraIgnorePatterns, exemptPaths } = resolveSubsystemIgnoresAndExemptions(options, config);
    this.extraIgnorePatterns = extraIgnorePatterns;
    this.exemptPaths = exemptPaths;
    this.unignoreDirs =
      options.unignoreDirs ??
      (options.family === 'documentation' ? getEffectiveUnignoreDirs(effectiveProjectRoot) : []);
    this.requiredFiles = options.requiredFiles ?? [];
    this.projectRoot = effectiveProjectRoot;
    this.coverageRecorder = new CoverageRecorder(this.projectRoot, effectiveCoverage!);
    this.fixableRuleIds = resolveFixableRuleIds(options);

    validateAuditorRuleDescriptions(options, (r, d) => this.formatRuleDescription(r, d));
    this.initRuleLedger();
    this.context = this.initExecutionContext(this.coverageRecorder.declaration);
  }

  /**
   * Checks whether the given relative path is exempt according to suite options and configuration.
   */
  public isPathExempt(relPath: string): boolean {
    return isPathExempt(relPath, this.exemptPaths);
  }

  /**
   * Determines whether a given project-relative path is scannable by this auditor,
   * taking into account its extraIgnorePatterns, unignoreDirs, exemptPaths, and global project ignores.
   */
  public isPathScannable(relPath: string): boolean {
    const norm = toPosixRelative(this.projectRoot, relPath);
    if (isPathIgnored(norm, this.extraIgnorePatterns, this.unignoreDirs, this.projectRoot)) {
      return false;
    }
    if (this.isPathExempt(norm)) {
      return false;
    }
    if (this.family !== 'testing' && isTestFileForCodeAudit(norm, this.projectRoot)) {
      return false;
    }
    return true;
  }

  /**
   * Resolves all target project-relative files that this auditor intends to scan,
   * applying declared roots, allowedExtensions, global ignores, and extraIgnorePatterns.
   */
  public getScannableFiles(): readonly string[] {
    const rawFiles = this.context.collectFiles(this.roots, this.allowedExtensions);
    return rawFiles
      .map((f) => toPosixRelative(this.projectRoot, f))
      .filter((rel) => this.isPathScannable(rel));
  }

  /** Full rule catalog used for dormancy detection (declared ruleIds, else ruleDescriptions keys). */
  public getRuleCatalog(): readonly TRuleId[] {
    if (this.ruleIds.length > 0) return this.ruleIds;
    return Object.keys(this.ruleDescriptions ?? {}) as TRuleId[];
  }

  /** Returns the on-demand diagnostic and remediation guide for a declared rule. */
  public getRuleRemediation(ruleId: TRuleId): string | undefined {
    return this.ruleRemediations?.[ruleId];
  }

  /** Records a file that this suite actually analyzed (absolute or project-relative path). */
  protected recordScanned(filePath: string): void {
    this.coverageRecorder.recordScanned(filePath);
  }

  protected unrecordScanned(filePath: string): void {
    this.coverageRecorder.unrecordScanned(filePath);
  }

  protected recordScannedMany(filePaths: Iterable<string>): void {
    for (const f of filePaths) this.coverageRecorder.recordScanned(f);
  }

  /**
   * Evaluates an assertion or check block for a declared rule.
   * Automatically marks the rule as evaluated in the coverage ledger.
   */
  public async evaluateRule(
    ruleId: TRuleId,
    evaluateFn: () => void | Promise<void>
  ): Promise<void> {
    this.markRuleEvaluated(ruleId);
    const start = performance.now();
    try {
      await evaluateFn();
    } finally {
      this.recordRuleDuration(ruleId, performance.now() - start);
    }
  }

  /** Synchronous variant for inline invariant evaluation. */
  public evaluateRuleSync(ruleId: TRuleId, evaluateFn: () => void): void {
    this.markRuleEvaluated(ruleId);
    const start = performance.now();
    try {
      evaluateFn();
    } finally {
      this.recordRuleDuration(ruleId, performance.now() - start);
    }
  }

  /**
   * Asserts a condition for a rule. Automatically marks the rule as evaluated.
   * If condition is false, adds a violation.
   */
  public assertRule(
    ruleId: TRuleId,
    condition: boolean,
    violation: Omit<ViolationInput<TRuleId>, 'ruleId'>
  ): void {
    this.markRuleEvaluated(ruleId);
    if (!condition) {
      this.addViolation({ ruleId, ...violation });
    }
  }

  /** Refines the coverage declaration at runtime (e.g. from config-driven roots loaded after construction). */
  protected redeclareCoverage(declaration: AuditorCoverageDeclaration): void {
    this.coverageRecorder.redeclare(this.id, declaration);
  }

  /** For `declared-only` suites whose external engine reports a file count but no file list. */
  protected recordExternalScanCount(count: number): void {
    this.coverageRecorder.recordExternalScanCount(count);
  }

  /** Adds dynamically discovered rule ids (rule engines without static ruleIds) to the dormancy catalog. */
  protected declareRuleCatalog(ruleIds: readonly string[]): void {
    this.coverageRecorder.declareRuleCatalog(ruleIds);
  }

  /** Records that a rule passed its activation gates and was evaluated (per file, or per tool invocation). */
  protected markRuleEvaluated(ruleId: TRuleId, count = 1): void {
    this.coverageRecorder.markRuleEvaluated(ruleId, count);
  }

  /**
   * Loud failure for obsolete v3 method name.
   * Enforces the Loud Failure Mandate under AGENTS.md.
   */
  protected recordRuleEvaluation(ruleId: string): never {
    throw new Error(
      `[BaseAuditor]: Method 'recordRuleEvaluation' is obsolete and was removed in v4+. Use 'this.markRuleEvaluated("${ruleId}")' instead.`
    );
  }

  /** Explicitly declares a rule as non-applicable for this run; never silent, always justified. */
  public markRuleNotApplicable(ruleId: TRuleId, reason: string): void {
    this.coverageRecorder.markRuleNotApplicable(ruleId, reason);
    if (!this.durationsByRule.has(ruleId)) {
      this.recordRuleDuration(ruleId, 0);
    }
  }

  /**
   * Evaluates suite gating against configuration and marks rules not applicable and suite skipped if disabled.
   * Returns true if the suite is disabled, allowing an immediate clean early return.
   */
  protected isSuiteGatingDisabled(defaultReason = 'Suite desactivada en config'): boolean {
    const config = getAuditConfig(this.projectRoot);
    const gating = evaluateSuiteStatus(this.id, config, this.configKey);
    if (!gating.enabled) {
      const reason = gating.reason ?? defaultReason;
      for (const ruleId of this.ruleIds) {
        this.markRuleNotApplicable(ruleId, reason);
      }
      this.markSkipped(reason);
      return true;
    }
    return false;
  }

  /** Gets evaluation count recorded so far for a given rule. */
  protected getEvaluations(ruleId: TRuleId): number {
    return this.coverageRecorder.getEvaluations(ruleId);
  }

  public getCoverageRecorder(): CoverageRecorder {
    return this.coverageRecorder;
  }

  private async persistCoverageLedger(): Promise<void> {
    const runId = resolveActiveCoverageRunId();
    if (!runId) return;
    for (const [ruleId, count] of this.countsByRule) {
      if (count > 0 && this.coverageRecorder.getEvaluations(ruleId) === 0) {
        this.coverageRecorder.markRuleEvaluated(ruleId);
      }
    }
    await writeCoverageLedger(
      this.projectRoot,
      this.coverageRecorder.toLedger({
        runId,
        suiteId: this.id,
        skipped: this.isSkipped,
        ruleIds: this.getRuleCatalog()
      })
    );
  }

  public getSubAuditors(): readonly SubAuditorStep[] {
    if (this.explicitSubAuditors && this.explicitSubAuditors.length > 0) {
      return this.explicitSubAuditors;
    }
    return this.ruleIds.map((ruleId) => ({
      id: ruleId,
      name: this.formatRuleDescription(ruleId),
      description: this.ruleDescriptions?.[ruleId]
    }));
  }

  private resolveSubAuditorStatus(
    result: number | string,
    count: number,
    errorsCount: number,
    warningsCount: number
  ): SubAuditorStatus {
    if (errorsCount > 0 || result === 'failed') return 'failed';
    if (count > 0 || warningsCount > 0 || result === 'warning') return 'warning';
    return 'passed';
  }

  private formatSubAuditorBadge(result: number | string): string {
    if (typeof result === 'number') {
      return result > 0 ? ` [🐛 ${result}]` : '';
    }
    return result !== 'passed' ? ` [${result}]` : '';
  }

  public logSubAudit(
    stepNumber: number,
    totalSteps: number,
    name: string,
    result: number | string,
    detail?: string,
    counts?: { errors?: number; warnings?: number },
    durationMs?: number,
    speed?: AuditExecutionSpeed
  ): void {
    if (!speed || !AUDIT_EXECUTION_SPEEDS.some((s) => s === speed)) {
      throw new Error(
        `[${this.id}] Sub-auditor step ${stepNumber} ('${name}') logged without mandatory execution speed (${AUDIT_EXECUTION_SPEEDS.map((s) => `'${s}'`).join(' | ')}). ` +
          `All sub-auditors must strictly declare their speed.`
      );
    }
    const count = typeof result === 'number' ? result : 0;
    const errorsCount =
      counts?.errors ??
      (typeof result === 'number' && result > 0
        ? counts?.warnings !== undefined
          ? 0
          : result
        : 0);
    const warningsCount = counts?.warnings ?? 0;
    const badge = this.formatSubAuditorBadge(result);
    const speedBadge = speed === 'light' ? ' 🐇' : speed === 'heavy' ? ' 🐢' : ' 🐘';
    const extra = detail ? ` (${detail})` : '';
    this.context.logStep(stepNumber, totalSteps, `${name}${badge}${speedBadge}${extra}`);
    const status = this.resolveSubAuditorStatus(result, count, errorsCount, warningsCount);
    this.subAuditorReports.push({
      id: `${this.id}_step_${stepNumber}`,
      name,
      status,
      count,
      errorsCount,
      warningsCount,
      detail,
      durationMs,
      speed
    });
  }

  public getCountsByRule(): ReadonlyMap<TRuleId, number> {
    return this.countsByRule;
  }

  public getErrorsByRule(): ReadonlyMap<TRuleId, number> {
    return this.errorsByRule;
  }

  public getWarningsByRule(): ReadonlyMap<TRuleId, number> {
    return this.warningsByRule;
  }

  public getFixableErrorsByRule(): ReadonlyMap<TRuleId, number> {
    return this.fixableErrorsByRule;
  }

  public getFixableWarningsByRule(): ReadonlyMap<TRuleId, number> {
    return this.fixableWarningsByRule;
  }

  public getFindings(): readonly AuditFinding[] {
    return this.context.getFindings();
  }

  public getFixableFindings(): readonly AuditFinding[] {
    return this.context.getFindings().filter((f) => f.fixable === true);
  }

  public getFixableErrors(): number {
    return this.context.getFindings().filter((f) => f.severity === 'error' && f.fixable === true)
      .length;
  }

  public getFixableWarnings(): number {
    return this.context.getFindings().filter((f) => f.severity === 'warning' && f.fixable === true)
      .length;
  }

  public static countFixableFindings(findings: readonly AuditFinding[]): FixableFindingCounts {
    return countFixableFindings(findings);
  }

  public static computeFixableViolations(
    results: readonly StandardAuditResult[],
    isFixMode = false
  ): FixableViolationsSummary {
    return computeResultsFixableViolations(results, isFixMode);
  }

  public formatRuleDescription(ruleId: TRuleId, rawDescription?: string): string {
    const raw = rawDescription || this.ruleDescriptions?.[ruleId] || ruleId;
    if (this.packageName && !raw.toLowerCase().startsWith(this.packageName.toLowerCase() + ':')) {
      return `${this.packageName}: ${raw}`;
    }
    return raw;
  }

  public getRuleLabel(ruleId: string): string {
    return this.formatRuleDescription(ruleId as TRuleId);
  }

  public getFilesScanned(): number {
    return this.filesScannedCount;
  }

  public addViolation(v: ViolationInput<TRuleId>): void {
    if (!(v.ruleId in this.ruleDescriptions)) {
      throw new Error(
        `[Auditor Contract Violation] Rule '${v.ruleId}' emitted in '${this.id}' is NOT registered in 'ruleDescriptions'. All emitted rules must be registered in the constructor.`
      );
    }

    const targetFile = v.file ?? v.filePath;
    const normalizedFile = targetFile ? toPosixRelative(this.projectRoot, targetFile) : targetFile;

    if (normalizedFile && this.isViolationSuppressed(normalizedFile)) {
      return;
    }

    const current = this.countsByRule.get(v.ruleId) ?? 0;
    this.countsByRule.set(v.ruleId, current + 1);
    const isFixable =
      v.fixable !== undefined ? Boolean(v.fixable) : this.fixableRuleIds.has(v.ruleId);

    if (v.severity === 'error') {
      const errCurrent = this.errorsByRule.get(v.ruleId) ?? 0;
      this.errorsByRule.set(v.ruleId, errCurrent + 1);
      if (isFixable) {
        const fixErrCurrent = this.fixableErrorsByRule.get(v.ruleId) ?? 0;
        this.fixableErrorsByRule.set(v.ruleId, fixErrCurrent + 1);
      }
    } else {
      const warnCurrent = this.warningsByRule.get(v.ruleId) ?? 0;
      this.warningsByRule.set(v.ruleId, warnCurrent + 1);
      if (isFixable) {
        const fixWarnCurrent = this.fixableWarningsByRule.get(v.ruleId) ?? 0;
        this.fixableWarningsByRule.set(v.ruleId, fixWarnCurrent + 1);
      }
    }

    const ruleDesc = this.formatRuleDescription(v.ruleId, v.ruleDescription);
    const targetCol = v.col ?? v.column;

    const effectiveRemediation = v.remediation ?? this.ruleRemediations?.[v.ruleId];
    const effectiveRemediationPhase = v.remediationPhase ?? this.ruleRemediationPhases?.[v.ruleId];

    if (v.severity === 'error') {
      this.context.addFinding({
        severity: 'error',
        message: v.message,
        file: normalizedFile,
        line: v.line,
        col: targetCol,
        context: v.context,
        ruleId: v.ruleId,
        ruleDescription: ruleDesc,
        suiteId: this.id,
        suiteName: this.name,
        fixable: isFixable,
        remediation: effectiveRemediation,
        remediationPhase: effectiveRemediationPhase
      });
    } else {
      if (!this.context.values['errors-only']) {
        this.context.addFinding({
          severity: 'warning',
          message: v.message,
          file: normalizedFile,
          line: v.line,
          col: targetCol,
          context: v.context,
          ruleId: v.ruleId,
          ruleDescription: ruleDesc,
          suiteId: this.id,
          suiteName: this.name,
          fixable: isFixable,
          remediation: effectiveRemediation,
          remediationPhase: effectiveRemediationPhase
        });
      }
    }
  }

  public isFixActive(): boolean {
    return this.fixMode || this.isFixModeRequested();
  }

  protected isFixModeRequested(): boolean {
    const rawValues = this.context.values as Record<string, unknown> | undefined; // open-record: Generic parsed CLI flags and options dictionary
    const cliTokens = getProcessCliArgs();
    return (
      this.fixMode ||
      cliTokens.includes('fix') ||
      cliTokens.includes('--fix') ||
      process.env.AUDIT_FIX === 'true' ||
      Boolean(rawValues?.fix)
    );
  }

  /**
   * Resolves whether any declared file or candidate file for this requirement exists on disk.
   * Returns the absolute path of the first existing candidate, or null if none exist.
   */
  public resolveConfigFile(requirement: AuditorConfigFileRequirement<TRuleId>): string | null {
    const candidates =
      requirement.candidateFiles && requirement.candidateFiles.length > 0
        ? requirement.candidateFiles
        : [requirement.file];

    for (const candidate of candidates) {
      const fullPath = path.resolve(this.projectRoot, candidate);
      if (nodeFs.existsSync(fullPath)) {
        this.recordScanned(toPosixRelative(this.projectRoot, fullPath));
        return fullPath;
      }
    }
    return null;
  }

  private async scaffoldDefaultConfigFile(
    requirement: AuditorConfigFileRequirement<TRuleId>,
    config: AuditEngineConfig
  ): Promise<{ resolvedPath: string; created: boolean }> {
    if (requirement.ruleId) {
      this.markRuleEvaluated(requirement.ruleId);
    }
    const targetPath = path.resolve(this.projectRoot, requirement.file);
    nodeFs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const content = await requirement.generateDefaultContent({
      projectRoot: this.projectRoot,
      packageName: this.packageName,
      config
    });
    if (!nodeFs.existsSync(targetPath)) {
      nodeFs.writeFileSync(targetPath, content, 'utf-8');
    }
    this.recordScanned(toPosixRelative(this.projectRoot, targetPath));
    return { resolvedPath: targetPath, created: true };
  }

  private reportMissingConfigFileViolation(
    requirement: AuditorConfigFileRequirement<TRuleId>,
    config: AuditEngineConfig
  ): void {
    if (!requirement.ruleId) return;
    this.markRuleEvaluated(requirement.ruleId);
    const fixCtx: AuditorConfigFixContext = {
      projectRoot: this.projectRoot,
      packageName: this.packageName,
      config
    };
    const message =
      typeof requirement.customMissingMessage === 'function'
        ? requirement.customMissingMessage(fixCtx, requirement.file)
        : (requirement.customMissingMessage ??
          `No se encontró el archivo de configuración requerido '${requirement.file}' (${requirement.description}). Ejecuta con --fix para inicializarlo.`);
    const reportedFile = requirement.customMissingFile
      ? requirement.customMissingFile(fixCtx, requirement.file)
      : requirement.file;

    this.addViolation({
      ruleId: requirement.ruleId,
      severity: 'error',
      file: reportedFile,
      line: 1,
      col: 1,
      context: requirement.file,
      message
    });
  }

  public async ensureConfigFile(
    requirement: AuditorConfigFileRequirement<TRuleId>
  ): Promise<{ resolvedPath: string; created: boolean } | null> {
    const config = getAuditConfig(this.projectRoot);
    if (requirement.isApplicable && !requirement.isApplicable(config, this.projectRoot)) {
      return null;
    }

    const existingPath = this.resolveConfigFile(requirement);
    if (existingPath) {
      if (requirement.ruleId) {
        this.markRuleEvaluated(requirement.ruleId);
      }
      return { resolvedPath: existingPath, created: false };
    }

    if (this.isFixActive()) {
      return this.scaffoldDefaultConfigFile(requirement, config);
    }

    this.reportMissingConfigFileViolation(requirement, config);
    return null;
  }

  /**
   * Iterates through all declared `configFiles`, ensuring that every applicable requirement
   * is satisfied or scaffolded. Returns true if all applicable requirements are met, false otherwise.
   */
  public async verifyAndFixConfigFiles(): Promise<boolean> {
    let allSatisfied = true;
    for (const requirement of this.configFiles) {
      const result = await this.ensureConfigFile(requirement);
      if (result === null) {
        const config = getAuditConfig(this.projectRoot);
        const isApp = requirement.isApplicable
          ? requirement.isApplicable(config, this.projectRoot)
          : true;
        if (isApp) {
          allSatisfied = false;
        }
      }
    }
    return allSatisfied;
  }

  public isPathIgnored(relPath: string): boolean {
    return this.context.isPathIgnored(relPath);
  }

  /**
   * Determines whether a violation on the given relative path should be suppressed
   * due to locked skill protection, subsystem exemptions, subsystem ignore globs,
   * or user-configured paths.ignoreGlobs / paths.ignoredPatterns.
   */
  public isViolationSuppressed(relPath: string): boolean {
    const effectiveRel = path.isAbsolute(relPath)
      ? path.relative(this.projectRoot, relPath)
      : relPath;
    if (isLockedSkillPath(effectiveRel, this.projectRoot)) {
      return true;
    }
    if (this.isPathExempt(effectiveRel)) {
      return true;
    }
    const norm = toPosixRelative(this.projectRoot, effectiveRel);
    for (const pattern of this.extraIgnorePatterns) {
      if (matchesSinglePattern(norm, pattern)) {
        return true;
      }
    }
    const config = getAuditConfig(this.projectRoot);
    const userGlobs = config?.paths?.ignoreGlobs ?? [];
    const userPatterns = config?.paths?.ignoredPatterns ?? [];
    for (const pattern of [...userGlobs, ...userPatterns]) {
      if (matchesSinglePattern(norm, pattern)) {
        return true;
      }
    }
    const userIgnoredDirs = config?.paths?.ignoredDirs ?? [];
    if (userIgnoredDirs.length > 0) {
      const segments = norm.toLowerCase().split('/');
      for (const d of userIgnoredDirs) {
        const cleanD = toPosixRelative(this.projectRoot, d).toLowerCase();
        if (cleanD && (segments.includes(cleanD) || segments.some((s) => s === cleanD))) {
          return true;
        }
      }
    }
    return false;
  }

  protected getLineNumber(content: string, charIndex: number): number {
    return content.slice(0, charIndex).split('\n').length;
  }

  protected getLineAt(content: string, lineIndex: number): string {
    const lines = content.split('\n');
    return lines[lineIndex - 1] ?? '';
  }

  protected scanRegexMatches(
    content: string,
    regex: RegExp,
    relPath: string,
    ruleId: TRuleId,
    message: string,
    filter?: (lineContent: string, match: RegExpExecArray) => boolean,
    sourceForLines: string = content,
    charOffset: number = 0
  ): void {
    const start = performance.now();
    try {
      let match: RegExpExecArray | null;
      const re = new RegExp(regex.source, regex.flags);
      this.markRuleEvaluated(ruleId);
      while ((match = re.exec(content)) !== null) {
        const line = this.getLineNumber(sourceForLines, charOffset + match.index);
        const lineContent = this.getLineAt(sourceForLines, line);
        if (filter && !filter(lineContent, match)) continue;
        this.addViolation({
          ruleId,
          severity: 'error',
          file: relPath,
          line,
          message,
          context: lineContent.trim()
        });
      }
    } finally {
      this.recordRuleDuration(ruleId, performance.now() - start);
    }
  }

  public abstract runAudit(astContext?: SharedAstContext): Promise<void> | void;

  public async execute(astContext?: SharedAstContext): Promise<StandardAuditResult> {
    await loadAuditConfig(this.projectRoot);
    await this.context.checkFiles();
    for (const rf of this.requiredFiles) {
      const abs = path.isAbsolute(rf) ? rf : path.resolve(this.projectRoot, rf);
      const stats = safeStatSync(abs);
      if (stats && !stats.isDirectory()) {
        this.recordScanned(toPosixRelative(this.projectRoot, rf));
      }
    }
    let effectiveAst = astContext;
    if (!effectiveAst && this.requiresAst) {
      const { SharedAstContext } = await import('./astContext.ts');
      effectiveAst = new SharedAstContext();
    }
    const auditExecutionStart = performance.now();
    await this.runAudit(effectiveAst);
    this.auditExecutionDurationMs = Math.max(0, performance.now() - auditExecutionStart);
    if (this.ruleIds.length === 1) {
      const singleRuleId = this.ruleIds[0]!;
      if (!this.durationsByRule.has(singleRuleId)) {
        this.durationsByRule.set(singleRuleId, this.auditExecutionDurationMs);
      }
    }

    this.context.setMetric('Files Scanned', this.filesScannedCount);
    for (const [ruleId, count] of this.countsByRule.entries()) {
      this.context.setMetric(`Rule: ${ruleId}`, count);
    }

    return this.finishAudit();
  }

  public async finishAudit(): Promise<StandardAuditResult> {
    await this.persistCoverageLedger();
    if (this.isSkipped) {
      const skipMessage = this.skipReason || 'Omitido';
      this.context.logProgress(`⏭️  ${skipMessage}`);
      this.context.setMetric('Estado', 'OMITIDO ⏭️');
      if (this.skipReason) {
        this.context.setMetric('Skip-Reason', this.skipReason);
      }
      return this.context.finish(
        {
          'Files Scanned': 0
        },
        {
          status: 'skipped',
          icon: this.icon,
          subAuditors: [
            {
              id: `${this.id}_skipped`,
              name: skipMessage,
              status: 'passed',
              count: 0,
              detail: 'skipped',
              speed: 'light'
            }
          ]
        }
      );
    }

    this.ensureSubAuditorsLogged();
    return this.context.finish(
      {
        'Files Scanned': this.filesScannedCount
      },
      {
        icon: this.icon,
        subAuditors: this.subAuditorReports.length > 0 ? [...this.subAuditorReports] : undefined
      }
    );
  }

  protected ensureSubAuditorsLogged(): void {
    if (this.subAuditorReports.length > 0) return;
    const subAuditors = this.getSubAuditors();
    const totalSteps = Math.max(1, subAuditors.length);

    for (let i = 0; i < subAuditors.length; i++) {
      const sub = subAuditors[i]!;
      const count = this.countsByRule.get(sub.id as TRuleId) ?? 0;
      const errorsCount = this.errorsByRule.get(sub.id as TRuleId) ?? 0;
      const warningsCount = this.warningsByRule.get(sub.id as TRuleId) ?? 0;
      let durationMs = this.durationsByRule.get(sub.id as TRuleId);
      if (
        durationMs === undefined &&
        this.ruleIds.length === 1 &&
        this.auditExecutionDurationMs !== undefined
      ) {
        durationMs = this.auditExecutionDurationMs;
      }
      const empiricalDurationMs = durationMs ?? 0;
      const formattedDuration = formatDurationMs(empiricalDurationMs);

      const ruleCap = this.ruleCapabilities[sub.id as TRuleId];
      if (!ruleCap || !ruleCap.speed) {
        throw new Error(
          `[${this.id}] Missing rule capability or undefined 'speed' for sub-auditor '${sub.id}'. ` +
            `All sub-auditors and rules must strictly declare their execution speed contract.`
        );
      }
      const speed: AuditExecutionSpeed =
        this.resolveRuleEffectiveSpeed(sub.id as TRuleId) ??
        normalizeSpeeds(ruleCap.speed)[0] ??
        'light';

      this.logSubAudit(
        i + 1,
        totalSteps,
        sub.name,
        count,
        formattedDuration,
        { errors: errorsCount, warnings: warningsCount },
        empiricalDurationMs,
        speed
      );
    }
  }

  public importAuditFindings(
    findings: readonly AuditFinding[],
    fallbackRuleId: TRuleId,
    fallbackContext: string = this.id
  ): void {
    for (const f of findings) {
      this.addViolation({
        ruleId: (f.ruleId as TRuleId) || fallbackRuleId,
        severity: f.severity === 'warning' ? 'warning' : 'error',
        file: f.file || '',
        line: f.line || 1,
        context: f.context || fallbackContext,
        message: f.message,
        fixable: f.fixable
      });
    }
  }

  public setStepLogger(
    logger: (stepNumber: number, totalSteps: number, description: string) => void
  ): void {
    this.context.setStepLogger?.(logger);
  }

  public setProgressLogger(logger: (msg: string) => void): void {
    this.context.setProgressLogger?.(logger);
  }

  /**
   * Generates the canonical AuditorManifestDTO for clean and typed introspection,
   * allowing external tools and AI agents to dynamically inspect capabilities and rules.
   */
  public toManifest(): AuditorManifestDTO {
    const rulesRecord: Record<string, string> = {};
    if (this.ruleDescriptions) {
      for (const [k, v] of Object.entries(this.ruleDescriptions)) {
        if (typeof v === 'string') {
          rulesRecord[k] = v;
        }
      }
    }
    return {
      id: this.id,
      name: this.name,
      family: this.family,
      icon: this.icon,
      description: this.description,
      capabilities: {
        speed: Array.isArray(this.capabilities.speed)
          ? [...this.capabilities.speed]
          : this.capabilities.speed,
        phase: this.capabilities.phase,
        fix: this.capabilities.fix,
        md: this.capabilities.md,
        ast: this.capabilities.ast,
        changedOnly: this.capabilities.changedOnly,
        critical: this.capabilities.critical
      },
      rules: rulesRecord,
      remediations: this.ruleRemediations ? { ...this.ruleRemediations } : undefined,
      remediationPhases: this.ruleRemediationPhases ? { ...this.ruleRemediationPhases } : undefined,
      fixableRules: this.getFixableRuleIds().map((r) => String(r)),
      configKey: this.configKey,
      defaultConfig: { ...this.defaultConfig },
      criticalConfig: {
        ...(this.criticalConfig.rationale ? { rationale: this.criticalConfig.rationale } : {}),
        ...(this.criticalConfig.requiredMinimums
          ? { requiredMinimums: this.criticalConfig.requiredMinimums }
          : {}),
        ...(this.criticalConfig.forbiddenOverrides
          ? { forbiddenOverrides: this.criticalConfig.forbiddenOverrides }
          : {})
      },
      usesThirdPartyTool: this.usesThirdPartyTool,
      thirdPartyToolPolicy: this.thirdPartyToolPolicy
        ? { ...this.thirdPartyToolPolicy }
        : undefined,
      scripts: [...this.scripts]
    };
  }

  /**
   * Scans a collection of files in a single pass in memory (RAM).
   * Reads each file from disk exactly once, splits into lines, and evaluates each
   * declared rule handler while automatically measuring empirical rule durations.
   */
  public async scanFilesSinglePass(
    files: readonly string[],
    handlers: ReadonlyArray<{
      ruleId: TRuleId;
      scan: (
        file: string,
        content: string,
        lines: readonly string[],
        doc: AuditedDocument
      ) => void | Promise<void>;
    }>
  ): Promise<void> {
    if (files.length === 0 || handlers.length === 0) return;

    const exempts = this.exemptPaths;

    for (const file of files) {
      const relPath = path.isAbsolute(file)
        ? normalizePosixPath(path.relative(this.projectRoot, file))
        : normalizePosixPath(file);

      if (isPathExempt(relPath, exempts)) continue;

      let content: string;
      try {
        content = nodeFs.readFileSync(file, 'utf-8');
      } catch {
        // catch-ok: unreadable files are skipped
        this.unrecordScanned(relPath);
        continue;
      }

      const lines = content.split('\n');
      const doc = new AuditedDocument(file, content, relPath);

      for (const handler of handlers) {
        const start = performance.now();
        try {
          const res = handler.scan(file, content, lines, doc);
          if (res instanceof Promise) {
            await res;
          }
        } finally {
          this.recordRuleDuration(handler.ruleId, performance.now() - start);
        }
      }

      this.recordScanned(relPath);
    }
  }

  private static isExecutingCli = false;

  public static async runCli(auditor: BaseAuditor<string>): Promise<void> {
    if (BaseAuditor.isExecutingCli) return;
    BaseAuditor.isExecutingCli = true;
    try {
      const result = await auditor.execute();
      process.exit(result.summary.errors > 0 ? 1 : 0);
    } finally {
      BaseAuditor.isExecutingCli = false;
    }
  }

  public static async runCliIfMain(metaUrl: string, auditor: BaseAuditor<string>): Promise<void> {
    if (isMainModule(metaUrl)) {
      // Decouple CLI execution from synchronous ESM evaluation graph
      // prevents unsettled top-level await deadlock cycles in Node.js 26+
      setImmediate(async () => {
        await BaseAuditor.runCli(auditor);
      });
    }
  }
}

/**
 * Specialized File-Scanning Auditor.
 * Automates recursive file discovery, ignore filtering, reading, and line-by-line scanning dispatch.
 */
export abstract class FileScanAuditor<
  TRuleId extends string = string
> extends BaseAuditor<TRuleId> {
  protected readonly declaredFileSubAuditors: Map<
    TRuleId,
    (doc: AuditedDocument) => void | Promise<void>
  > = new Map();

  /**
   * Primary file scanning entry point receiving an immutable AuditedDocument.
   * Automatically executes declared file sub-auditors measuring their runtimes
   * before delegating to scanFile(relPath, content, sourceFile, doc).
   */
  protected scanDocument(doc: AuditedDocument): void | Promise<void> {
    if (isPathExempt(doc.relPath, this.exemptPaths)) {
      return;
    }
    const pending: Promise<void>[] = [];
    for (const [ruleId, handler] of this.declaredFileSubAuditors.entries()) {
      this.markRuleEvaluated(ruleId);
      const start = performance.now();
      try {
        const res = handler(doc);
        if (res instanceof Promise) {
          pending.push(
            res.finally(() => {
              this.recordRuleDuration(ruleId, performance.now() - start);
            })
          );
        } else {
          this.recordRuleDuration(ruleId, performance.now() - start);
        }
      } catch (err) {
        this.recordRuleDuration(ruleId, performance.now() - start);
        throw err;
      }
    }
    const singleRuleId =
      this.declaredFileSubAuditors.size === 0 && this.ruleIds.length === 1
        ? this.ruleIds[0]
        : undefined;
    const startScan = singleRuleId ? performance.now() : 0;
    const scanFileRes = this.scanFile(
      doc.relPath,
      doc.rawContent,
      this.requiresAst ? doc.getAst() : undefined,
      doc
    );
    if (singleRuleId) {
      if (scanFileRes instanceof Promise) {
        pending.push(
          scanFileRes.finally(() => {
            this.recordRuleDuration(singleRuleId, performance.now() - startScan);
          })
        );
      } else {
        this.recordRuleDuration(singleRuleId, performance.now() - startScan);
      }
    } else if (scanFileRes instanceof Promise) {
      pending.push(scanFileRes);
    }
    if (pending.length > 0) {
      return Promise.all(pending).then(() => {});
    }
  }

  /**
   * Helper for in-memory testing of file scanning logic without touching the filesystem.
   */
  public testScanFile(
    relPath: string,
    content: string,
    _sourceFile?: ts.SourceFile
  ): void | Promise<void> {
    const doc = new AuditedDocument(path.resolve(this.projectRoot, relPath), content, relPath);
    const prevTotalEvals = this.getRuleCatalog().reduce(
      (acc, r) => acc + this.getEvaluations(r),
      0
    );
    const finishScan = (): void => {
      this.recordScanned(relPath);
      const newTotalEvals = this.getRuleCatalog().reduce(
        (acc, r) => acc + this.getEvaluations(r),
        0
      );
      if (newTotalEvals === prevTotalEvals) {
        for (const ruleId of this.getRuleCatalog()) {
          this.markRuleEvaluated(ruleId);
        }
      }
    };
    const res = this.scanDocument(doc);
    if (res instanceof Promise) {
      return res.then(finishScan);
    }
    finishScan();
  }

  /**
   * Declares a file-scoped sub-auditor tied to a declared rule.
   * The superclass executes the handler for each audited file and empirically accumulates duration.
   */
  public declareFileSubAuditor(
    ruleId: TRuleId,
    handler: (doc: AuditedDocument) => void | Promise<void>
  ): void {
    if (!this.ruleIds.includes(ruleId)) {
      throw new Error(
        `[Auditor Contract Violation] Auditor [${this.id}] attempted to declare file sub-auditor for '${ruleId}', but that rule is not registered in 'ruleIds'.`
      );
    }
    this.declaredFileSubAuditors.set(ruleId, handler);
  }

  /**
   * Declares a regex pattern sub-auditor tied to a declared rule.
   * Scans safe patterns skipping comments and strings automatically.
   */
  public declarePatternSubAuditor(
    ruleId: TRuleId,
    options: {
      regex: RegExp;
      message: string | ((match: RegExpExecArray, pos: LineColumnPosition) => string);
      severity?: FindingSeverity;
      skipComments?: boolean;
      skipStrings?: boolean;
      fixable?: boolean;
      onMatch?: (match: RegExpExecArray, pos: LineColumnPosition) => boolean | void;
    }
  ): void {
    this.declareFileSubAuditor(ruleId, (doc) => {
      this.scanSafePattern(
        doc,
        {
          ruleId,
          regex: options.regex,
          message: options.message,
          severity: options.severity,
          skipComments: options.skipComments,
          skipStrings: options.skipStrings,
          fixable: options.fixable
        },
        options.onMatch
      );
    });
  }

  /**
   * Overridable file scanning method for sub-auditors.
   */
  protected scanFile(
    _relPath: string,
    _content: string,
    _sourceFile?: ts.SourceFile,
    _doc?: AuditedDocument
  ): void | Promise<void> {
    // Can be overridden by subclasses
  }

  constructor(options: AuditorOptions<TRuleId>) {
    const config = getAuditConfig(options.projectRoot);
    super(
      options.coverage || options.roots !== undefined
        ? options
        : { ...options, roots: getEffectiveScannableRoots(config) }
    );
  }

  /**
   * Determines whether a given project-relative path is scannable by this file-scan auditor.
   */
  public override isPathScannable(relPath: string): boolean {
    return super.isPathScannable(relPath);
  }

  /**
   * Checks whether the given relative path is exempt according to suite options.
   */
  public isCurrentPathExempt(relPath: string): boolean {
    return this.isPathExempt(relPath);
  }

  /**
   * Adds a violation calculating 1-indexed line and column numbers from a string offset.
   */
  protected addViolationAtMatch(params: {
    ruleId: TRuleId;
    filePath: string;
    content: string;
    matchIndex: number;
    message: string;
    severity?: FindingSeverity;
    context?: string;
    doc?: AuditedDocument;
    fixable?: boolean;
  }): void {
    const pos = params.doc
      ? params.doc.getLineAndColumn(params.matchIndex)
      : (() => {
          const preceding = params.content.slice(0, params.matchIndex);
          const line = preceding.split('\n').length;
          const column = (preceding.split('\n').pop()?.length ?? 0) + 1;
          return { line, column, lineText: params.context ?? '' };
        })();

    this.addViolation({
      ruleId: params.ruleId,
      severity: params.severity ?? 'error',
      filePath: params.filePath,
      line: pos.line,
      column: pos.column,
      message: params.message,
      context: params.context ?? pos.lineText.trim(),
      fixable: params.fixable
    });
  }

  /**
   * High-level pattern scanner that skips comments and strings automatically
   * and verifies escape hatches before registering violations.
   */
  protected scanSafePattern(
    doc: AuditedDocument,
    options: {
      regex: RegExp;
      ruleId: TRuleId;
      message: string | ((match: RegExpExecArray, pos: LineColumnPosition) => string);
      severity?: FindingSeverity;
      skipComments?: boolean;
      skipStrings?: boolean;
      fixable?: boolean;
    },
    onMatch?: (match: RegExpExecArray, pos: LineColumnPosition) => boolean | void
  ): void {
    const start = performance.now();
    try {
      const skipComments = options.skipComments ?? true;
      const skipStrings = options.skipStrings ?? true;
      const regex = new RegExp(
        options.regex.source,
        options.regex.flags.includes('g') ? options.regex.flags : options.regex.flags + 'g'
      );
      let m: RegExpExecArray | null;

      while ((m = regex.exec(doc.rawContent)) !== null) {
        const matchIdx = m.index;

        if (skipComments && doc.isInsideComment(matchIdx)) {
          continue;
        }
        if (skipStrings && doc.isInsideString(matchIdx)) {
          continue;
        }

        const pos = doc.getLineAndColumn(matchIdx);

        if (onMatch) {
          const shouldContinue = onMatch(m, pos);
          if (shouldContinue === false) continue;
        }

        const msg =
          typeof options.message === 'function' ? options.message(m, pos) : options.message;
        this.addViolation({
          ruleId: options.ruleId,
          filePath: doc.relPath,
          line: pos.line,
          column: pos.column,
          message: msg,
          severity: options.severity ?? 'error',
          context: pos.lineText.trim(),
          fixable: options.fixable
        });
      }
    } finally {
      this.recordRuleDuration(options.ruleId, performance.now() - start);
    }
  }

  /**
   * Superclass pattern scanner that executes a regex search over content or file lines,
   * skips comments, evaluates filters, records violations, and automatically measures
   * and records the empirical rule duration in the superclass.
   */
  public scanPattern(
    content: string,
    lines: readonly string[],
    file: string,
    regex: RegExp,
    ruleId: TRuleId,
    filter?: (match: RegExpExecArray, line: string) => boolean,
    message?: string | ((match: RegExpExecArray, line: string) => string),
    severity: FindingSeverity = 'error'
  ): void {
    const start = performance.now();
    try {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const matchIndex = match.index;
        const before = content.slice(0, matchIndex);
        const lineNum = (before.match(/\n/g) ?? []).length + 1;
        const col = matchIndex - before.lastIndexOf('\n');
        const line = lines[lineNum - 1] ?? '';
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          continue;
        }
        if (filter && !filter(match, line)) {
          continue;
        }
        const msg =
          typeof message === 'function'
            ? message(match, line)
            : (message ?? `Violación de regla ${ruleId}`);
        this.addViolation({
          ruleId,
          severity,
          file,
          line: lineNum,
          column: col,
          message: msg,
          context: match[0].trim()
        });
      }
    } finally {
      this.recordRuleDuration(ruleId, performance.now() - start);
    }
  }

  private async resolveEffectiveAst(
    astContext?: SharedAstContext
  ): Promise<SharedAstContext | undefined> {
    if (astContext || !this.requiresAst) return astContext;
    const { SharedAstContext } = await import('./astContext.ts');
    return new SharedAstContext();
  }

  private async scanSingleDiscoveredFile(
    file: string,
    effectiveAst: SharedAstContext | undefined,
    catalog: readonly TRuleId[]
  ): Promise<void> {
    const relPath = normalizePosixPath(path.relative(this.projectRoot, file));
    let content: string;
    try {
      content = nodeFs.readFileSync(file, 'utf-8');
    } catch {
      // catch-ok: unreadable files are not recorded as scanned, so coverage reports them as uncovered
      this.unrecordScanned(relPath);
      return;
    }
    const doc = new AuditedDocument(file, content, relPath, effectiveAst);
    const prevTotalEvals = catalog.reduce((acc, r) => acc + this.getEvaluations(r), 0);
    await this.scanDocument(doc);
    if (this.isFixActive() && doc.hasFixes()) {
      doc.applyFixesToFile();
    }
    this.recordScanned(relPath);
    const newTotalEvals = catalog.reduce((acc, r) => acc + this.getEvaluations(r), 0);
    if (newTotalEvals === prevTotalEvals) {
      for (const ruleId of catalog) {
        this.markRuleEvaluated(ruleId);
      }
    }
  }

  public override async runAudit(astContext?: SharedAstContext): Promise<void> {
    const files = this.context.collectFiles(this.roots, this.allowedExtensions);
    const effectiveAst = await this.resolveEffectiveAst(astContext);
    const catalog = this.getRuleCatalog();

    if (files.length === 0) {
      for (const ruleId of catalog) {
        this.runSubAuditorSync(ruleId, () => {
          this.markRuleNotApplicable(ruleId, 'No matching files found in scanned roots');
        });
      }
      this.ensureSubAuditorsLogged();
      return;
    }

    for (const file of files) {
      await this.scanSingleDiscoveredFile(file, effectiveAst, catalog);
    }
  }
}
