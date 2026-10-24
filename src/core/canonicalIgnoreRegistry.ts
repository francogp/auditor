/**
 * packages/auditor/src/core/canonicalIgnoreRegistry.ts
 *
 * CANONICAL IGNORE & PATH EXEMPTION REGISTRY
 * Single Source of Truth for immutable system directories, cache directories,
 * scratch workspaces, and dynamic configuration-driven ignore/unignore resolutions.
 *
 * Rules:
 * 1. Hardcoded folder exceptions are strictly restricted to:
 *    - node_modules (Node package manager standard)
 *    - scratch (ephemeral runtime and audit scratch directory)
 *    - Caches, VCS, and build artifacts (.git, dist, coverage, tmp, etc.)
 * 2. All other application code roots, documentation roots, and skills roots MUST resolve
 *    dynamically from audit.config.ts (config.paths, config.documentation).
 */

import path from 'node:path';
import { getAuditConfig } from './auditConfigLoader.ts';
import { loadLockedSkills } from './lockedSkills.ts';
import { normalizePosixPath } from './reportUtils.ts';

/**
 * Directories that must ALWAYS be ignored across all tools, runners, and static analyzers
 * (compilation, VCS, scratch, test artifacts, runtime volume storage).
 * Strictly conforms to the Zero Hardcoded Paths Mandate exception baseline:
 * 1. node_modules
 * 2. scratch
 * 3. VCS and tool cache/build artifacts (.git, dist, coverage, tmp, etc.)
 * 4. Locked skills dynamically loaded from skills-lock.json
 * 5. Dynamic tool cache paths registered via sub-auditor constructor contracts (cachePaths).
 *
 * ALL OTHER DIRECTORIES MUST BE CONFIGURED IN audit.config.ts (paths.ignoredDirs, paths.ignoreGlobs).
 * HARDCODING APPLICATION, ASSET, OR DOCUMENTATION DIRECTORIES IS CATEGORICALLY PROHIBITED.
 */
export const ALWAYS_IGNORE_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  'scratch',
  '.git',
  '.vscode',
  '.github',
  '.gemini',
  '.auditor',
  'tmp',
  'volumes'
]);

/**
 * Canonical binary, media, font, database, and archive extensions that cannot
 * be inspected by text, AST, or line-based static analysis suites.
 */
export const CANONICAL_BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.tiff',
  '.avif',
  '.svg',
  '.mp3',
  '.ogg',
  '.wav',
  '.flac',
  '.mp4',
  '.webm',
  '.avi',
  '.mov',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.db',
  '.sqlite',
  '.sqlite3',
  '.wasm',
  '.zip',
  '.tar',
  '.gz',
  '.tgz'
]);

/**
 * Canonical tool cache paths declared by built-in sub-auditors and extensions.
 * Initialized with canonical tool caches so standalone functions (isPathIgnored)
 * correctly recognize them even before suite instantiation.
 */
export const BUILTIN_TOOL_CACHE_PATHS: readonly string[] = [
  'dist',
  'dev-dist',
  'build',
  'coverage',
  'test-results',
  '.vitest-cache',
  '.fallow',
  '.oxlintcache',
  '.stylelintcache',
  '.tsbuildinfo'
] as const;

/**
 * Dynamic cache and temporary paths registered by sub-auditors and extensions at runtime.
 */
const dynamicCachePaths = new Set<string>(BUILTIN_TOOL_CACHE_PATHS);

/**
 * Registers a dynamic tool cache directory or file declared by a sub-auditor or extension
 * (e.g. `.fallow`, `.oxlintcache`).
 */
export function registerDynamicCachePath(cachePath: string): void {
  const norm = normalizePosixPath(cachePath);
  const clean = norm.endsWith('/') ? norm.slice(0, -1) : norm;
  if (clean) {
    dynamicCachePaths.add(clean);
  }
}

/**
 * Returns all currently registered dynamic tool cache paths.
 */
export function getDynamicCachePaths(): ReadonlySet<string> {
  return dynamicCachePaths;
}

/**
 * Clears registered dynamic cache paths (useful in test teardown).
 */
export function clearDynamicCachePaths(): void {
  dynamicCachePaths.clear();
  for (const p of BUILTIN_TOOL_CACHE_PATHS) {
    dynamicCachePaths.add(p);
  }
}

/**
 * Canonical ignore directories for application scanners (ALWAYS_IGNORE_DIRS + BUILTIN_TOOL_CACHE_PATHS).
 * All additional application-specific ignore directories must be configured via audit.config.ts.
 */
export const CANONICAL_IGNORE_DIRS: ReadonlySet<string> = new Set([
  ...ALWAYS_IGNORE_DIRS,
  ...BUILTIN_TOOL_CACHE_PATHS
]);

/**
 * Returns the effective set of ignore directories combining canonical defaults,
 * dynamically registered tool caches, and audit.config.ts `paths.ignoredDirs`.
 */
export function getEffectiveIgnoreDirs(projectRoot = process.cwd()): ReadonlySet<string> {
  const config = getAuditConfig(projectRoot);
  const custom = config.paths?.ignoredDirs ?? [];
  return new Set([...ALWAYS_IGNORE_DIRS, ...dynamicCachePaths, ...custom]);
}

/**
 * Returns the effective unignore directories combining:
 * 1. `config.paths.unignoreDirs`
 * 2. `config.documentation.unignoreDirs`
 * 3. Top-level segments derived from `config.documentation.skillsRoots`
 * 4. Physical existence of `.agents` or `skills` in projectRoot
 */
export function getEffectiveUnignoreDirs(projectRoot = process.cwd()): readonly string[] {
  const config = getAuditConfig(projectRoot);
  const customPaths = config.paths?.unignoreDirs;
  if (customPaths && customPaths.length > 0) return customPaths;

  const customDocs = config.documentation?.unignoreDirs;
  if (customDocs && customDocs.length > 0) return customDocs;

  const derived = new Set<string>();
  if (config.documentation?.skillsRoots && config.documentation.skillsRoots.length > 0) {
    for (const r of config.documentation.skillsRoots) {
      const topSegment = normalizePosixPath(path.relative(projectRoot, path.resolve(projectRoot, r))).split('/')[0];
      if (topSegment && topSegment !== '.') derived.add(topSegment);
    }
  }

  return Array.from(derived);
}

export interface EffectiveIgnoreGlobsOptions {
  readonly extraGlobs?: readonly string[];
  readonly includeLockedSkills?: boolean;
  readonly baseDirs?: ReadonlySet<string>;
}

export interface SuiteIgnoreRequirement {
  readonly suiteId: string;
  readonly ignoredDirs?: readonly string[];
  readonly ignoreGlobs?: readonly string[];
  readonly reason?: string;
}

/**
 * Registry where sub-auditors and host extensions declare their suggested ignore defaults
 * to be dynamically collected and injected into newly created or scaffolded audit.config.ts files.
 */
export class SuiteIgnoreRegistry {
  private static readonly requirements = new Map<string, SuiteIgnoreRequirement>();

  public static register(req: SuiteIgnoreRequirement): void {
    this.requirements.set(req.suiteId, req);
  }

  public static getAll(): readonly SuiteIgnoreRequirement[] {
    return Array.from(this.requirements.values());
  }

  public static reset(): void {
    this.requirements.clear();
  }
}

/**
 * Returns a deduplicated array of glob patterns representing all active ignore directories
 * (each formatted as `${dir}/**`), merged with project-level `paths.ignoreGlobs`,
 * `paths.ignoredPatterns`, and optional locked skills from `skills-lock.json`.
 */
export function getEffectiveIgnoreGlobs(
  projectRoot = process.cwd(),
  options: EffectiveIgnoreGlobsOptions = {}
): readonly string[] {
  const config = getAuditConfig(projectRoot);
  const baseDirs = options.baseDirs ?? getEffectiveIgnoreDirs(projectRoot);
  const globs = new Set<string>();

  for (const d of baseDirs) {
    globs.add(`${d}/**`);
  }

  if (config.paths?.ignoreGlobs) {
    for (const g of config.paths.ignoreGlobs) {
      globs.add(normalizePosixPath(g));
    }
  }

  if (config.paths?.ignoredPatterns) {
    for (const p of config.paths.ignoredPatterns) {
      globs.add(normalizePosixPath(p));
    }
  }

  if (options.includeLockedSkills) {
    for (const lg of getLockedSkillsIgnoreGlobs(projectRoot)) {
      globs.add(lg);
    }
  }

  if (options.extraGlobs) {
    for (const eg of options.extraGlobs) {
      globs.add(normalizePosixPath(eg));
    }
  }

  return Array.from(globs);
}

/**
 * Dynamically resolves ignore globs for official locked skills declared in `skills-lock.json`,
 * mapped to roots configured in `config.documentation.skillsRoots`.
 */
export function getLockedSkillsIgnoreGlobs(projectRoot = process.cwd()): readonly string[] {
  const locked = loadLockedSkills(projectRoot);
  if (locked.size === 0) return [];

  const config = getAuditConfig(projectRoot);
  const skillsRoots = config.documentation?.skillsRoots ?? [];
  const globs: string[] = [];

  for (const s of locked) {
    if (skillsRoots.length > 0) {
      for (const root of skillsRoots) {
        const normRoot = normalizePosixPath(root);
        const cleanRoot = normRoot.endsWith('/') ? normRoot.slice(0, -1) : normRoot;
        globs.push(`${cleanRoot}/${s}/**`);
      }
    } else {
      globs.push(`**/${s}/**`);
    }
  }

  return globs;
}
