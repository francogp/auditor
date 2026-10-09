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
import { parseArgs, styleText } from 'node:util';
import { enableCompileCache } from 'node:module';
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
  type AuditorCapabilities,
  type AuditorCoverageDeclaration,
  type GitIgnoreRequirement,
  type AuditorConfigFileRequirement,
  type AuditorPackageScriptRequirement,
  type AuditorConfigFixContext,
  type AuditorManifestDTO,
  deriveCanonicalAuditorScript
} from './auditContract.ts';
import { GitIgnoreRegistry } from './gitIgnoreRegistry.ts';
import { ConfigFileRegistry } from './configFileRegistry.ts';
import { PackageScriptRegistry } from './packageScriptRegistry.ts';

export { deriveCanonicalAuditorScript };
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
import {
  renderBanner,
  renderAuditTaskRow,
  renderFindingsDetail,
  renderSimilarCodeWarningBanner
} from './unifiedTheme.ts';
import { isMainModule } from '../cli/cliUtils.ts';
import { type AuditEngineConfig, getAuditConfig, loadAuditConfig } from './auditConfig.ts';
import { evaluateSuiteStatus } from './suiteGating.ts';
import type { SharedAstContext } from './astContext.ts';
import type ts from 'typescript';

enableCompileCache();

/** Directories that must ALWAYS be ignored across all tools, runners, and auditors (compilation, VCS, scratch, test artifacts) */
export const ALWAYS_IGNORE_DIRS: ReadonlySet<string> = new Set([ // runtime-set: Fast O(1) membership lookup set
  'node_modules',
  '.git',
  '.tsbuildinfo',
  '.vitest-cache',
  '.fallow',
  '.vscode',
  '.github',
  '.gemini',
  'dist',
  'dev-dist',
  'build',
  'coverage',
  'results',
  'test-results',
  'scratch',
  'tmp',
  'volumes'
]);

/** Additional directories ignored during code scanning (documentation/skills and static assets) */
export const CODE_ONLY_IGNORE_DIRS: ReadonlySet<string> = new Set([ // runtime-set: Fast O(1) membership lookup set
  '.agents',
  'skills',
  'public',
  'packages',
  'docs'
]);

/** Canonical ignore directories for application code auditors (union of ALWAYS + CODE_ONLY) */
export const CANONICAL_IGNORE_DIRS: ReadonlySet<string> = new Set([ // runtime-set: Fast O(1) membership lookup set
  ...ALWAYS_IGNORE_DIRS,
  ...CODE_ONLY_IGNORE_DIRS
]);

/** Returns the effective set of ignore directories combining canonical defaults with audit.config.ts paths.ignoredDirs */
export function getEffectiveIgnoreDirs(): ReadonlySet<string> {
  const config = getAuditConfig();
  const custom = config.paths?.ignoredDirs ?? [];
  return new Set([...CANONICAL_IGNORE_DIRS, ...custom]);
}

/** Returns the effective set of unignore directories combining audit.config.ts paths.unignoreDirs, documentation.unignoreDirs, and derived skillsRoots */
export function getEffectiveUnignoreDirs(projectRoot = process.cwd()): readonly string[] {
  const config = getAuditConfig(projectRoot);
  const customPaths = config.paths?.unignoreDirs;
  if (customPaths && customPaths.length > 0) return customPaths;

  const customDocs = config.documentation?.unignoreDirs;
  if (customDocs && customDocs.length > 0) return customDocs;

  const derived = new Set<string>();
  if (config.documentation?.skillsRoots && config.documentation.skillsRoots.length > 0) {
    for (const r of config.documentation.skillsRoots) {
      const topSegment = r.replace(/\\/g, '/').replace(/^\/+/, '').split('/')[0];
      if (topSegment) derived.add(topSegment);
    }
  }
  if (derived.size > 0) {
    return Array.from(derived);
  }
  return ['.agents', 'skills', 'docs'];
}

export const SCANNABLE_EXTENSIONS: ReadonlySet<string> = new Set(['.ts', '.js', '.vue', '.cjs', '.mjs']); // runtime-set: Fast O(1) membership lookup set

export const CANONICAL_SCANNABLE_ROOTS = [
  'scripts',
  'src',
  'tests'
] as const;
export type CanonicalScannableRoot = (typeof CANONICAL_SCANNABLE_ROOTS)[number];

function resolvePersistenceExtraRoots(config: ReturnType<typeof getAuditConfig>): string[] {
  if (config.persistence?.engine === 'none') return [];
  const extra: string[] = []; // no-domain: Dynamic filesystem root paths
  if (config.persistence?.supabaseDir) extra.push(config.persistence.supabaseDir);
  if (config.paths?.migrationsDir) extra.push(config.paths.migrationsDir);
  return extra;
}

function resolveDeclaredPathRoots(paths?: AuditEngineConfig['paths']): string[] {
  if (!paths) return ['src', 'scripts', 'tests'];
  return [
    ...(paths.codeRoots ?? ['src', 'scripts']),
    ...(paths.testRoots ?? ['tests']),
    ...(paths.integrationRoots ?? []),
    ...(paths.e2eRoots ?? []),
    ...(paths.demoRoots ?? []),
    ...(paths.dataRoots ?? []),
    ...(paths.cliRoots ?? [])
  ];
}

export function getEffectiveScannableRoots(config = getAuditConfig()): readonly string[] {
  return Array.from(new Set([
    ...resolveDeclaredPathRoots(config.paths),
    ...resolvePersistenceExtraRoots(config)
  ]));
}

/**
 * Validates that a path component is safe against path traversal.
 */
export function assertSafePathComponent(component: string): void {
  if (component.includes('..')) {
    throw new Error(`Path traversal attempt detected in path component: ${component}`);
  }
}


/**
 * Loads directory ignore patterns from .fallowrc.json if present.
 */
export function loadFallowIgnorePatterns(projectRoot = process.cwd()): string[] {
  const fallowRcPath = path.resolve(projectRoot, '.fallowrc.json');
  try {
    if (nodeFs.existsSync(fallowRcPath)) {
      const raw = nodeFs.readFileSync(fallowRcPath, 'utf-8');
      const data = JSON.parse(raw) as { ignorePatterns?: string[] };
      return Array.isArray(data.ignorePatterns) ? data.ignorePatterns : [];
    }
  } catch {
    // catch-ok: Ignore fallback
  }
  return [];
}

let lockedSkillsCache: Set<string> | null = null;
let lockedSkillsCacheRoot: string | null = null;

export function clearLockedSkillsCache(): void {
  lockedSkillsCache = null;
  lockedSkillsCacheRoot = null;
}

/**
 * Canonical candidate relative locations for skills-lock.json in order of precedence.
 */
export const SKILLS_LOCK_CANDIDATE_PATHS: readonly string[] = [
  'skills-lock.json',
  '.auditor/skills-lock.json',
  '.agents/skills-lock.json'
];

function parseLockedSkillsFile(skillsLockPath: string): string[] {
  try {
    if (!nodeFs.existsSync(skillsLockPath)) return [];
    const raw = nodeFs.readFileSync(skillsLockPath, 'utf-8');
    const data = JSON.parse(raw) as { skills?: Record<string, unknown> };
    if (data?.skills && typeof data.skills === 'object') {
      return Object.keys(data.skills).map(s => s.toLowerCase()); // no-domain: Skill name case-insensitive key
    }
  } catch {
    // catch-ok: Ignore missing or malformed skills-lock.json candidate
  }
  return [];
}

function resolveSkillsLockCandidates(projectRoot: string): string[] {
  const candidatePaths = [...SKILLS_LOCK_CANDIDATE_PATHS];
  try {
    const config = getAuditConfig(projectRoot);
    if (config?.paths?.skillsLockFile && !candidatePaths.includes(config.paths.skillsLockFile)) {
      candidatePaths.unshift(config.paths.skillsLockFile);
    }
  } catch {
    // catch-ok: Ignore config load failures during skill lock resolution
  }
  return candidatePaths;
}

export function loadLockedSkills(projectRoot = process.cwd()): ReadonlySet<string> {
  if (lockedSkillsCache && lockedSkillsCacheRoot === projectRoot) {
    return lockedSkillsCache;
  }
  const locked = new Set<string>();
  for (const relPath of resolveSkillsLockCandidates(projectRoot)) {
    for (const skill of parseLockedSkillsFile(path.resolve(projectRoot, relPath))) {
      locked.add(skill);
    }
  }
  lockedSkillsCache = locked;
  lockedSkillsCacheRoot = projectRoot;
  return locked;
}

/**
 * Checks whether a relative POSIX or absolute path belongs to an official/locked skill directory
 * (e.g. .agents/skills/<lockedSkill>/**, skills/<lockedSkill>/**, .skills/<lockedSkill>/**).
 */
export function isLockedSkillPath(filePath: string, projectRoot = process.cwd()): boolean {
  const locked = loadLockedSkills(projectRoot);
  if (locked.size === 0) return false;

  const rel = path.isAbsolute(filePath)
    ? path.relative(projectRoot, filePath)
    : filePath;

  const normalized = rel.replace(/\\/g, '/').toLowerCase().replace(/^\/+/, '');
  const segments = normalized.split('/');

  for (let i = 0; i < segments.length - 1; i++) {
    const parent = segments[i];
    const candidate = segments[i + 1];
    if ((parent === 'skills' || parent === '.skills') && candidate && locked.has(candidate)) {
      return true;
    }
    if (parent === '.agents' && candidate === 'skills' && i + 2 < segments.length) {
      const skillName = segments[i + 2];
      if (skillName && locked.has(skillName)) {
        return true;
      }
    }
  }

  return false;
}

function matchesDirectorySegments(
  normalized: string,
  segments: readonly string[],
  unignoreSet: ReadonlySet<string>,
  configIgnoredDirs: readonly string[]
): boolean {
  let hasUnignoredAncestor = false;
  const hasConfigIgnored = configIgnoredDirs.length > 0;

  for (const seg of segments) {
    if (ALWAYS_IGNORE_DIRS.has(seg)) {
      return true;
    }

    if (unignoreSet.has(seg)) {
      hasUnignoredAncestor = true;
      continue;
    }

    if (!hasUnignoredAncestor) {
      const isIgnored =
        CODE_ONLY_IGNORE_DIRS.has(seg) ||
        (hasConfigIgnored &&
          configIgnoredDirs.some(
            d => d === seg || normalized === d || normalized.startsWith(d + '/') || normalized.includes('/' + d + '/')
          ));
      if (isIgnored) {
        return true;
      }
    }
  }

  return false;
}

export function matchesSinglePattern(normalized: string, pattern: string): boolean {
  let cleanPattern = pattern.toLowerCase(); // no-domain: Non-domain utility collection or data structure
  const matchesAnywhere = cleanPattern.startsWith('**/');
  if (matchesAnywhere) {
    cleanPattern = cleanPattern.slice(3);
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

  return (
    normalized === cleanPattern ||
    normalized.startsWith(cleanPattern + '/')
  );
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

  const normalized = relPath.split(path.sep).join(path.posix.sep).toLowerCase();
  const segments = normalized.split('/');
  const unignoreSet = unignoreDirs instanceof Set ? unignoreDirs : new Set(unignoreDirs);

  const rawConfigIgnoredDirs = getAuditConfig()?.paths?.ignoredDirs ?? [];
  const configIgnoredDirs = rawConfigIgnoredDirs.map(d => d.toLowerCase().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')); // no-domain: Non-domain utility collection or data structure

  if (matchesDirectorySegments(normalized, segments, unignoreSet, configIgnoredDirs)) {
    return true;
  }

  const configPatterns = getAuditConfig()?.paths?.ignoredPatterns ?? [];
  const configGlobs = getAuditConfig()?.paths?.ignoreGlobs ?? [];
  const allPatterns = [...extraIgnorePatterns, ...configPatterns, ...configGlobs];

  for (const pattern of allPatterns) {
    if (matchesSinglePattern(normalized, pattern)) {
      if (segments.some(seg => unignoreSet.has(seg))) {
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
  const relPath = path.relative(projectRoot, filePath).split(path.sep).join(path.posix.sep);
  if (!isPathIgnored(relPath, extraIgnorePatterns, unignoreDirs, projectRoot)) {
    const ext = path.extname(filePath).toLowerCase();
    if (allowedExtensions.has(ext)) {
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
  const relPath = path.relative(projectRoot, fullPath).split(path.sep).join(path.posix.sep);
  if (isPathIgnored(relPath, extraIgnorePatterns, unignoreDirs, projectRoot)) {
    return [];
  }

  if (entry.isDirectory()) {
    return collectRepositoryFiles(fullPath, projectRoot, extraIgnorePatterns, allowedExtensions, unignoreDirs);
  }

  if (entry.isFile()) {
    const ext = path.extname(entry.name).toLowerCase();
    if (allowedExtensions.has(ext)) {
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
    return collectSingleFile(dir, projectRoot, extraIgnorePatterns, allowedExtensions, unignoreDirs);
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
    results.push(...processDirentEntry(entry, dir, projectRoot, extraIgnorePatterns, allowedExtensions, unignoreDirs));
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
  addError: (message: string, file?: string, line?: number, context?: string, ruleId?: string, ruleDescription?: string, suiteId?: string, suiteName?: string) => void;
  addWarning: (message: string, file?: string, line?: number, context?: string, ruleId?: string, ruleDescription?: string, suiteId?: string, suiteName?: string) => void;
  setMetric: (key: string, value: number | string) => void;
  checkFiles: () => Promise<void>;
  finish: (finalMetrics?: Record<string, number | string>) => Promise<StandardAuditResult>;
  setStepLogger?: (logger: (stepNumber: number, totalSteps: number, description: string) => void) => void;
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

    if (typeof outputOption === 'string' && outputOption && !outputOption.includes('..')) {
      const outPath = path.resolve(process.cwd(), outputOption);
      await fs.writeFile(outPath, jsonString, 'utf-8');
    }
  } catch {
    // catch-ok: Ignorar errores de escritura si el comando se ejecuta en modo solo lectura (--allow-fs-read)
  }

  return targetJsonPath;
}

function renderConsoleSummary(
  result: StandardAuditResult,
  config: AuditorConfig,
  targetJsonPath: string
): void {
  console.log(renderBanner(config.name, `Familia: ${config.family.toUpperCase()}  |  ID: ${config.id}`));
  console.log(renderAuditTaskRow(result));

  if (result.findings.length > 0) {
    console.log(renderFindingsDetail(result.findings));
  }

  if (result.findings.some(f => f.ruleId === 'fallow-similar-code-failed' && (f.context === 'manual-setup-required' || f.context === 'model-not-ready'))) {
    console.log('\n' + renderSimilarCodeWarningBanner() + '\n');
  }

  if (result.status === 'skipped') {
    const reason = (result.metrics?.['Skip-Reason'] as string) || 'Omitido';
    console.log(styleText('cyan', `\n⏭️ Auditoría omitida: ${reason}\n`));
    return;
  }

  const relPath = path.relative(process.cwd(), targetJsonPath);
  console.log(`\n${result.status === 'passed' ? styleText('green', '✨ Auditoría completada con éxito.') : styleText('red', '🚨 Auditoría finalizada con errores.')}`);
  console.log(styleText('dim', `💾 Reporte detallado guardado en: ${relPath}\n`));
}

function normalizeAuditorFilePath(file: string | undefined, projectRoot: string): string | undefined | null {
  if (!file) return file;
  const normFile = path.isAbsolute(file)
    ? path.relative(projectRoot, file).replace(/\\/g, '/')
    : file.replace(/\\/g, '/');
  if (isLockedSkillPath(normFile, projectRoot)) {
    return null;
  }
  return normFile;
}

export function setupAuditor(config: AuditorConfig): AuditorContext {

  const startTime = performance.now();
  const args = process.argv.slice(2);
  const normalized = args.map(a => a.includes('=') && !a.startsWith('-') ? `--${a}` : (['errors-only'].includes(a) ? `--${a}` : a));

  const { values } = parseArgs({
    args: normalized,
    options: {
      output: { type: 'string', short: 'o' },
      'errors-only': { type: 'boolean' }
    },
    strict: false
  });

  const projectRoot = config.projectRoot || process.cwd();
  const scannableRoots = getEffectiveScannableRoots(getAuditConfig(projectRoot));
  const fallowIgnores = loadFallowIgnorePatterns(projectRoot).filter(pat => {
    const norm = pat.replace(/\/\*\*?$/, '').replace(/^\/+/, '');
    return !scannableRoots.some(r => r === norm || norm.startsWith(`${r}/`));
  });
  const combinedIgnores = [...fallowIgnores, ...(config.extraIgnorePatterns || [])];
  const unignoreDirs = config.unignoreDirs ?? (config.family === 'documentation' ? getEffectiveUnignoreDirs(projectRoot) : []);

  const isSubprocess = process.env.AUDIT_SUBPROCESS === 'true';
  const findings: AuditFinding[] = [];
  const metrics: Record<string, number | string> = {};

  let customLogProgress: ((msg: string) => void) | undefined;
  let customLogStep: ((stepNumber: number, totalSteps: number, description: string) => void) | undefined;

  return {
    values: values as AuditorContext['values'],
    ignorePatterns: combinedIgnores,
    unignoreDirs,
    isPathIgnored: (relPath: string) => isPathIgnored(relPath, combinedIgnores, unignoreDirs, projectRoot),
    collectFiles: (roots: readonly string[] = getEffectiveScannableRoots(), allowedExtensions = SCANNABLE_EXTENSIONS) => {
      const all: string[] = []; // no-domain: Non-domain utility collection or data structure
      for (const root of roots) {
        const fullRoot = path.resolve(projectRoot, root);
        all.push(...collectRepositoryFiles(fullRoot, projectRoot, combinedIgnores, allowedExtensions, unignoreDirs));
      }
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
    setStepLogger: (logger: (stepNumber: number, totalSteps: number, description: string) => void) => {
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
    addError: (message: string, file?: string, line?: number, context?: string, ruleId?: string, ruleDescription?: string, suiteId?: string, suiteName?: string) => {
      const normFile = normalizeAuditorFilePath(file, projectRoot);
      if (normFile === null) {
        return;
      }
      findings.push({ severity: 'error', message, file: normFile, line, context, ruleId, ruleDescription, suiteId, suiteName });
    },
    addWarning: (message: string, file?: string, line?: number, context?: string, ruleId?: string, ruleDescription?: string, suiteId?: string, suiteName?: string) => {
      if (!values['errors-only']) {
        const normFile = normalizeAuditorFilePath(file, projectRoot);
        if (normFile === null) {
          return;
        }
        findings.push({ severity: 'warning', message, file: normFile, line, context, ruleId, ruleDescription, suiteId, suiteName });
      }
    },
    setMetric: (key: string, value: number | string) => {
      metrics[key] = value;
    },
    checkFiles: async () => {
      if (!config.requiredFiles || config.requiredFiles.length === 0) return;
      try {
        for (const file of config.requiredFiles) {
          await fs.access(file);
        }
      } catch (_err) {
        console.error(styleText('red', `❌ Archivos requeridos no encontrados o no accesibles:\n${config.requiredFiles.map(f => `   - ${f}`).join('\n')}`));
        if (isSubprocess) {
          throw new Error(`Archivos requeridos no encontrados: ${config.requiredFiles.join(', ')}`, { cause: _err });
        }
        process.exit(1);
      }
    },
    finish: async (finalMetrics?: Record<string, number | string>) => {
      if (finalMetrics) {
        Object.assign(metrics, finalMetrics);
      }

      const durationMs = Math.round(performance.now() - startTime);
      const errorsCount = findings.filter(f => f.severity === 'error').length;
      const warningsCount = findings.filter(f => f.severity === 'warning').length;
      const infoCount = findings.filter(f => f.severity === 'info').length;

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
          info: infoCount
        }
      };

      const targetJsonPath = await persistAuditJsonReport(result, config, values.output as string | undefined);

      if (!isSubprocess) {
        renderConsoleSummary(result, config, targetJsonPath);
        if (errorsCount > 0) {
          process.exit(1);
        }
      }

      return result;
    }

  };
}

export const DEFAULT_AUDITOR_CAPABILITIES: AuditorCapabilities = Object.freeze({
  fix: false,
  fixPriority: false,
  lint: false,
  md: false,
  ast: false,
  changedSince: false,
  heavy: false,
  requiresBuild: false,
  postRun: false
});

export const MAX_AUDITOR_DESCRIPTION_LENGTH = 50;
export const MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH = 60;

export interface AuditorOptions<TRuleId extends string = string> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly family: AuditFamily;
  readonly packageName: string;
  readonly icon: string;
  readonly capabilities?: Partial<AuditorCapabilities>;
  readonly fix?: boolean;
  readonly gitIgnoreEntries?: readonly GitIgnoreRequirement[];
  readonly configFiles?: readonly AuditorConfigFileRequirement<TRuleId>[];
  readonly scripts?: readonly AuditorPackageScriptRequirement[];
  readonly ruleIds?: readonly TRuleId[];
  readonly ruleDescriptions: Readonly<Record<TRuleId, string>>;
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
   * Files this suite is responsible for. Mandatory for direct BaseAuditor subclasses;
   * FileScanAuditor derives it from `roots` + `allowedExtensions` when omitted.
   */
  readonly coverage?: AuditorCoverageDeclaration;
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
  if (options.description.length > MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH || options.description.includes('\n')) {
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

function validateAuditorDefaultConfig<TRuleId extends string>(options: AuditorOptions<TRuleId>): void {
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

function validateAuditorCapabilities<TRuleId extends string>(options: AuditorOptions<TRuleId>): void {
  if (options.capabilities === undefined) return;
  if (typeof options.capabilities !== 'object' || options.capabilities === null) {
    throw new Error(`Auditor [${options.id}] 'capabilities' must be an object if defined.`);
  }
  const KNOWN_CAPABILITIES = ['fix', 'fixPriority', 'lint', 'md', 'ast', 'changedSince', 'heavy', 'requiresBuild', 'postRun'] as const;
  for (const [key, val] of Object.entries(options.capabilities)) {
    if (!KNOWN_CAPABILITIES.includes(key as typeof KNOWN_CAPABILITIES[number])) {
      throw new Error(`Auditor [${options.id}] declared unknown capability '${key}'.`);
    }
    if (typeof val !== 'boolean') {
      throw new Error(`Auditor [${options.id}] capability '${key}' must be a boolean.`);
    }
  }
}

function validateAuditorRules<TRuleId extends string>(options: AuditorOptions<TRuleId>): void {
  if (!options.ruleDescriptions || typeof options.ruleDescriptions !== 'object' || Object.keys(options.ruleDescriptions).length === 0) {
    throw new Error(`Auditor [${options.id}] must define mandatory 'ruleDescriptions' covering all its declared rules.`);
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
      throw new Error(`Auditor [${options.id}] defines an invalid script requirement: 'name' must be a non-empty string.`);
    }
    if (!script.command || typeof script.command !== 'string' || script.command.trim() === '') {
      throw new Error(`Auditor [${options.id}] defines an invalid script requirement for '${script.name}': 'command' must be a non-empty string.`);
    }
    if (!script.description || typeof script.description !== 'string' || script.description.trim() === '') {
      throw new Error(`Auditor [${options.id}] defines an invalid script requirement for '${script.name}': 'description' must be a non-empty string.`);
    }
  }
}

function validateAuditorOptions<TRuleId extends string>(options: AuditorOptions<TRuleId>): void {
  validateAuditorIdentity(options);
  validateAuditorConfigKey(options);
  validateAuditorDefaultConfig(options);
  validateAuditorCapabilities(options);
  validateAuditorRules(options);
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

  const declaredRules: readonly string[] = options.ruleIds && options.ruleIds.length > 0 ? options.ruleIds : Object.keys(options.ruleDescriptions);
  for (const rawRuleId of declaredRules) {
    const ruleId = rawRuleId as TRuleId;
    const desc = options.ruleDescriptions[ruleId];
    if (!desc || typeof desc !== 'string' || !desc.trim()) {
      throw new Error(`Auditor [${options.id}] is missing a rule description for rule '${ruleId}'.`);
    }
    const formatted = formatFn(ruleId, desc);
    if (formatted.length > MAX_AUDITOR_DESCRIPTION_LENGTH || formatted.includes('\n')) {
      throw new Error(
        `Auditor [${options.id}] rule description for '${ruleId}' ('${formatted}', length: ${formatted.length}) exceeds ${MAX_AUDITOR_DESCRIPTION_LENGTH} characters or contains newlines.`
      );
    }
  }
}

export abstract class BaseAuditor<TRuleId extends string = string> implements ICompositeAuditor {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly family: AuditFamily;
  public readonly packageName: string;
  public readonly icon: string;
  public readonly capabilities: AuditorCapabilities;
  public readonly gitIgnoreEntries: readonly GitIgnoreRequirement[];
  public readonly configFiles: readonly AuditorConfigFileRequirement<TRuleId>[];
  public readonly scripts: readonly AuditorPackageScriptRequirement[];
  public readonly ruleIds: readonly TRuleId[];
  public readonly ruleDescriptions: Readonly<Record<TRuleId, string>>;
  public readonly explicitSubAuditors?: readonly SubAuditorStep[];
  public readonly roots: readonly string[];
  public readonly allowedExtensions: ReadonlySet<string>;
  public readonly extraIgnorePatterns: readonly string[];
  public readonly unignoreDirs: readonly string[];
  public readonly requiredFiles: readonly string[];
  public readonly requiresAst: boolean;
  public readonly projectRoot: string;
  public readonly configKey: string;
  public readonly defaultConfig: Readonly<Record<string, unknown>>;

  protected readonly context: AuditorContext;
  protected readonly countsByRule: Map<TRuleId, number> = new Map();
  protected readonly errorsByRule: Map<TRuleId, number> = new Map();
  protected readonly warningsByRule: Map<TRuleId, number> = new Map();
  protected readonly subAuditorReports: SubAuditorReport[] = [];
  protected readonly coverageRecorder: CoverageRecorder;
  protected readonly fixMode: boolean;
  protected isSkipped = false;
  protected skipReason?: string;

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
      const targetRoots = options.roots.length > 0 ? options.roots : getEffectiveScannableRoots();
      return deriveCoverageFromRoots(targetRoots, options.allowedExtensions ?? SCANNABLE_EXTENSIONS);
    }
    if (options.requiredFiles && options.requiredFiles.length > 0) {
      return deriveCoverageFromRequiredFiles(options.requiredFiles, effectiveProjectRoot, options.allowedExtensions);
    }
    return undefined;
  }

  private resolveEffectiveScripts(options: AuditorOptions<TRuleId>): readonly AuditorPackageScriptRequirement[] {
    if (options.scripts && options.scripts.length > 0) {
      return options.scripts;
    }
    return [
      deriveCanonicalAuditorScript(options.id, options.description, {
        category: options.family,
        isApplicable: (config) => evaluateSuiteStatus(options.id, config, options.configKey).enabled !== false
      })
    ];
  }

  private registerAuditorDependencies(options: AuditorOptions<TRuleId>, effectiveScripts: readonly AuditorPackageScriptRequirement[]): void {
    if (options.gitIgnoreEntries && options.gitIgnoreEntries.length > 0) {
      GitIgnoreRegistry.registerMany(options.gitIgnoreEntries);
    }
    if (options.configFiles && options.configFiles.length > 0) {
      ConfigFileRegistry.registerMany(options.configFiles as readonly AuditorConfigFileRequirement<string>[]);
    }
    if (effectiveScripts && effectiveScripts.length > 0) {
      PackageScriptRegistry.registerMany(effectiveScripts, options.id);
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

  constructor(options: AuditorOptions<TRuleId>) {
    const effectiveProjectRoot = options.projectRoot || process.cwd();
    const effectiveCoverage = this.resolveEffectiveCoverage(options, effectiveProjectRoot);
    const effectiveScripts = this.resolveEffectiveScripts(options);
    validateAuditorOptions({ ...options, coverage: effectiveCoverage, scripts: effectiveScripts });

    const astRequired = Boolean(options.requiresAst || options.capabilities?.ast);
    this.capabilities = { ...DEFAULT_AUDITOR_CAPABILITIES, ...options.capabilities, ast: astRequired };
    this.requiresAst = astRequired;
    this.packageName = options.packageName;
    this.icon = options.icon;
    this.id = options.id;
    this.name = options.name;
    this.description = options.description;
    this.family = options.family;
    this.configKey = options.configKey;
    this.defaultConfig = options.defaultConfig;
    this.gitIgnoreEntries = options.gitIgnoreEntries ?? [];
    this.configFiles = options.configFiles ?? [];
    this.scripts = effectiveScripts;
    this.registerAuditorDependencies(options, effectiveScripts);
    this.fixMode = Boolean(options.fix);
    this.ruleIds = options.ruleIds ?? (Object.keys(options.ruleDescriptions) as TRuleId[]);
    this.ruleDescriptions = options.ruleDescriptions;
    this.explicitSubAuditors = options.subAuditors;
    this.roots = options.roots ?? getEffectiveScannableRoots();
    this.allowedExtensions = options.allowedExtensions ?? SCANNABLE_EXTENSIONS;
    this.extraIgnorePatterns = options.extraIgnorePatterns ?? [];
    this.unignoreDirs = options.unignoreDirs ?? (options.family === 'documentation' ? getEffectiveUnignoreDirs(effectiveProjectRoot) : []);
    this.requiredFiles = options.requiredFiles ?? [];
    this.projectRoot = effectiveProjectRoot;
    this.coverageRecorder = new CoverageRecorder(this.projectRoot, effectiveCoverage!);

    validateAuditorRuleDescriptions(options, (r, d) => this.formatRuleDescription(r, d));

    for (const ruleId of this.ruleIds) {
      this.countsByRule.set(ruleId, 0);
      this.errorsByRule.set(ruleId, 0);
      this.warningsByRule.set(ruleId, 0);
    }

    this.context = this.initExecutionContext(this.coverageRecorder.declaration);
  }

  /** Full rule catalog used for dormancy detection (declared ruleIds, else ruleDescriptions keys). */
  public getRuleCatalog(): readonly TRuleId[] {
    if (this.ruleIds.length > 0) return this.ruleIds;
    return Object.keys(this.ruleDescriptions ?? {}) as TRuleId[];
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
    await evaluateFn();
  }

  /** Synchronous variant for inline invariant evaluation. */
  public evaluateRuleSync(
    ruleId: TRuleId,
    evaluateFn: () => void
  ): void {
    this.markRuleEvaluated(ruleId);
    evaluateFn();
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
    throw new Error(`[BaseAuditor]: Method 'recordRuleEvaluation' is obsolete and was removed in v4+. Use 'this.markRuleEvaluated("${ruleId}")' instead.`);
  }

  /** Explicitly declares a rule as non-applicable for this run; never silent, always justified. */
  protected markRuleNotApplicable(ruleId: TRuleId, reason: string): void {
    this.coverageRecorder.markRuleNotApplicable(ruleId, reason);
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
    await writeCoverageLedger(this.projectRoot, this.coverageRecorder.toLedger({
      runId,
      suiteId: this.id,
      skipped: this.isSkipped,
      ruleIds: this.getRuleCatalog()
    }));
  }

  public getSubAuditors(): readonly SubAuditorStep[] {
    if (this.explicitSubAuditors && this.explicitSubAuditors.length > 0) {
      return this.explicitSubAuditors;
    }
    return this.ruleIds.map(ruleId => ({
      id: ruleId,
      name: this.formatRuleDescription(ruleId),
      description: this.ruleDescriptions?.[ruleId]
    }));
  }

  private resolveSubAuditorStatus(
    result: number | 'passed' | 'warning' | 'failed' | string,
    count: number,
    errorsCount: number,
    warningsCount: number
  ): SubAuditorStatus {
    if (errorsCount > 0 || result === 'failed') return 'failed';
    if (count > 0 || warningsCount > 0 || result === 'warning') return 'warning';
    return 'passed';
  }

  private formatSubAuditorBadge(result: number | 'passed' | 'warning' | 'failed' | string): string {
    if (typeof result === 'number') {
      return result > 0 ? ` (🐛 ${result})` : '';
    }
    return result !== 'passed' ? ` (${result})` : '';
  }

  public logSubAudit(
    stepNumber: number,
    totalSteps: number,
    name: string,
    result: number | 'passed' | 'warning' | 'failed' | string,
    detail?: string,
    counts?: { errors?: number; warnings?: number }
  ): void {
    const count = typeof result === 'number' ? result : 0;
    const errorsCount = counts?.errors ?? (typeof result === 'number' && result > 0 ? (counts?.warnings !== undefined ? 0 : result) : 0);
    const warningsCount = counts?.warnings ?? 0;
    const badge = this.formatSubAuditorBadge(result);
    const extra = detail ? (badge ? ` - ${detail}` : ` (${detail})`) : '';
    this.context.logStep(stepNumber, totalSteps, `${name}${badge}${extra}`);
    const status = this.resolveSubAuditorStatus(result, count, errorsCount, warningsCount);
    this.subAuditorReports.push({
      id: `${this.id}_step_${stepNumber}`,
      name,
      status,
      count,
      errorsCount,
      warningsCount,
      detail
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
    if (targetFile && isLockedSkillPath(targetFile, this.projectRoot)) {
      return;
    }

    const current = this.countsByRule.get(v.ruleId) ?? 0;
    this.countsByRule.set(v.ruleId, current + 1);
    if (v.severity === 'error') {
      const errCurrent = this.errorsByRule.get(v.ruleId) ?? 0;
      this.errorsByRule.set(v.ruleId, errCurrent + 1);
    } else {
      const warnCurrent = this.warningsByRule.get(v.ruleId) ?? 0;
      this.warningsByRule.set(v.ruleId, warnCurrent + 1);
    }

    const ruleDesc = this.formatRuleDescription(v.ruleId, v.ruleDescription);
    const normalizedFile = targetFile
      ? (path.isAbsolute(targetFile)
          ? path.relative(this.projectRoot, targetFile).replace(/\\/g, '/')
          : targetFile.replace(/\\/g, '/'))
      : targetFile;

    const targetCol = v.col ?? v.column;

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
        suiteName: this.name
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
          suiteName: this.name
        });
      }
    }
  }

  public isLineIgnored(line: string, customTokens: readonly string[] = []): boolean {
    const baseTokens = ['domain-ok', 'string-ok', 'test-ok', 'fallow-ignore-next-line', ...customTokens];
    const pattern = new RegExp(`(?:--|\\/\\/|<!--)\\s*(?:${baseTokens.join('|')})\\b`, 'i');
    return pattern.test(line);
  }

  protected hasEscapeHatch(line: string, hatches: readonly string[]): boolean {
    return hatches.some(h => line.includes(`// ${h}`) || line.includes(`/* ${h}`) || line.includes(`<!-- ${h}`));
  }

  public isFixActive(): boolean {
    return this.fixMode || this.isFixModeRequested();
  }

  protected isFixModeRequested(): boolean {
    const rawValues = this.context.values as Record<string, unknown> | undefined; // open-record: Generic parsed CLI flags and options dictionary
    return (
      this.fixMode ||
      process.argv.includes('fix') ||
      process.argv.includes('--fix') ||
      process.env.AUDIT_FIX === 'true' ||
      Boolean(rawValues?.fix)
    );
  }

  /**
   * Resolves whether any declared file or candidate file for this requirement exists on disk.
   * Returns the absolute path of the first existing candidate, or null if none exist.
   */
  public resolveConfigFile(requirement: AuditorConfigFileRequirement<TRuleId>): string | null {
    const candidates = requirement.candidateFiles && requirement.candidateFiles.length > 0
      ? requirement.candidateFiles
      : [requirement.file];

    for (const candidate of candidates) {
      const fullPath = path.resolve(this.projectRoot, candidate);
      if (nodeFs.existsSync(fullPath)) {
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
    const message = typeof requirement.customMissingMessage === 'function'
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
        const isApp = requirement.isApplicable ? requirement.isApplicable(config, this.projectRoot) : true;
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
    escapeHatches: readonly string[],
    message: string,
    filter?: (lineContent: string, match: RegExpExecArray) => boolean,
    sourceForLines: string = content,
    charOffset: number = 0
  ): void {
    let match: RegExpExecArray | null;
    const re = new RegExp(regex.source, regex.flags);
    this.markRuleEvaluated(ruleId);
    while ((match = re.exec(content)) !== null) {
      const line = this.getLineNumber(sourceForLines, charOffset + match.index);
      const lineContent = this.getLineAt(sourceForLines, line);
      if (filter && !filter(lineContent, match)) continue;
      if (this.hasEscapeHatch(lineContent, escapeHatches)) continue;
      this.addViolation({
        ruleId,
        severity: 'error',
        file: relPath,
        line,
        message,
        context: lineContent.trim()
      });
    }
  }

  public abstract runAudit(astContext?: SharedAstContext): Promise<void> | void;

  public async execute(astContext?: SharedAstContext): Promise<StandardAuditResult> {
    await loadAuditConfig(this.projectRoot);
    await this.context.checkFiles();
    for (const rf of this.requiredFiles) {
      const abs = path.isAbsolute(rf) ? rf : path.resolve(this.projectRoot, rf);
      try {
        if (nodeFs.existsSync(abs) && !nodeFs.statSync(abs).isDirectory()) {
          this.recordScanned(toPosixRelative(this.projectRoot, rf));
        }
      } catch {
        // catch-ok: ignore missing files
      }
    }
    let effectiveAst = astContext;
    if (!effectiveAst && this.requiresAst) {
      const { SharedAstContext } = await import('./astContext.ts');
      effectiveAst = new SharedAstContext();
    }
    await this.runAudit(effectiveAst);

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
      const result = await this.context.finish({
        'Files Scanned': 0
      });
      result.status = 'skipped';
      result.icon = this.icon;
      result.subAuditors = [{
        id: `${this.id}_skipped`,
        name: skipMessage,
        status: 'passed',
        count: 0,
        detail: 'skipped'
      }];
      return result;
    }

    this.ensureSubAuditorsLogged();
    const result = await this.context.finish({
      'Files Scanned': this.filesScannedCount
    });
    result.icon = this.icon;
    if (this.subAuditorReports.length > 0) {
      result.subAuditors = [...this.subAuditorReports];
    }
    return result;
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
      this.logSubAudit(i + 1, totalSteps, sub.name, count, undefined, { errors: errorsCount, warnings: warningsCount });
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
        message: f.message
      });
    }
  }

  public setStepLogger(logger: (stepNumber: number, totalSteps: number, description: string) => void): void {
    this.context.setStepLogger?.(logger);
  }

  public setProgressLogger(logger: (msg: string) => void): void {
    this.context.setProgressLogger?.(logger);
  }

  /**
   * Genera el DTO canónico AuditorManifestDTO para introspección limpia y tipada,
   * permitiendo a herramientas externas y agentes consultar dinámicamente qué hace y cómo opera.
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
        fix: this.capabilities.fix,
        lint: this.capabilities.lint,
        md: this.capabilities.md,
        ast: this.capabilities.ast,
        changedSince: this.capabilities.changedSince,
        heavy: this.capabilities.heavy,
        requiresBuild: this.capabilities.requiresBuild,
        postRun: this.capabilities.postRun
      },
      rules: rulesRecord,
      configKey: this.configKey,
      defaultConfig: { ...this.defaultConfig },
      scripts: [...this.scripts]
    };
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
      await BaseAuditor.runCli(auditor);
    }
  }
}

/**
 * Specialized File-Scanning Auditor.
 * Automates recursive file discovery, ignore filtering, reading, and line-by-line scanning dispatch.
 */
export abstract class FileScanAuditor<TRuleId extends string = string> extends BaseAuditor<TRuleId> {
  protected abstract scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile): void | Promise<void>;

  constructor(options: AuditorOptions<TRuleId>) {
    super(options.coverage || options.roots !== undefined
      ? options
      : { ...options, roots: getEffectiveScannableRoots() }
    );
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
  }): void {
    const preceding = params.content.slice(0, params.matchIndex);
    const line = preceding.split('\n').length;
    const column = (preceding.split('\n').pop()?.length ?? 0) + 1;

    this.addViolation({
      ruleId: params.ruleId,
      severity: params.severity ?? 'error',
      filePath: params.filePath,
      line,
      column,
      message: params.message,
      context: params.context
    });
  }

  private async resolveEffectiveAst(astContext?: SharedAstContext): Promise<SharedAstContext | undefined> {
    if (astContext || !this.requiresAst) return astContext;
    const { SharedAstContext } = await import('./astContext.ts');
    return new SharedAstContext();
  }

  private async scanSingleDiscoveredFile(
    file: string,
    effectiveAst: SharedAstContext | undefined,
    catalog: readonly TRuleId[]
  ): Promise<void> {
    const relPath = path.relative(this.projectRoot, file).split(path.sep).join(path.posix.sep);
    let content: string;
    try {
      content = nodeFs.readFileSync(file, 'utf-8');
    } catch {
      // catch-ok: unreadable files are not recorded as scanned, so coverage reports them as uncovered
      this.unrecordScanned(relPath);
      return;
    }
    const sourceFile = effectiveAst && this.requiresAst ? effectiveAst.getSourceFile(file, content) : undefined;
    const prevTotalEvals = catalog.reduce((acc, r) => acc + this.getEvaluations(r), 0);
    await this.scanFile(relPath, content, sourceFile);
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
        this.markRuleNotApplicable(ruleId, 'No matching files found in scanned roots');
      }
      this.ensureSubAuditorsLogged();
      return;
    }

    for (const file of files) {
      await this.scanSingleDiscoveredFile(file, effectiveAst, catalog);
    }

    this.ensureSubAuditorsLogged();
  }
}

