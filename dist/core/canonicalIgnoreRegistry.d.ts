import { BaseEntityRegistry, IBaseEntityRegistry } from "./baseRegistry.js";
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
export declare const ALWAYS_IGNORE_DIRS: ReadonlySet<string>;
/**
 * Canonical binary, media, font, database, and archive extensions that cannot
 * be inspected by text, AST, or line-based static analysis suites.
 */
export declare const CANONICAL_BINARY_EXTENSIONS: ReadonlySet<string>;
/**
 * Canonical tool cache paths declared by built-in sub-auditors and extensions.
 * Initialized with canonical tool caches so standalone functions (isPathIgnored)
 * correctly recognize them even before suite instantiation.
 */
export declare const BUILTIN_TOOL_CACHE_PATHS: readonly string[];
/**
 * Registers a dynamic tool cache directory or file declared by a sub-auditor or extension
 * (e.g. `.fallow`, `.oxlintcache`).
 */
export declare function registerDynamicCachePath(cachePath: string): void;
/**
 * Returns all currently registered dynamic tool cache paths.
 */
export declare function getDynamicCachePaths(): ReadonlySet<string>;
/**
 * Clears registered dynamic cache paths (useful in test teardown).
 */
export declare function clearDynamicCachePaths(): void;
/**
 * Canonical ignore directories for application scanners (ALWAYS_IGNORE_DIRS + BUILTIN_TOOL_CACHE_PATHS).
 * All additional application-specific ignore directories must be configured via audit.config.ts.
 */
export declare const CANONICAL_IGNORE_DIRS: ReadonlySet<string>;
/**
 * Returns the effective set of ignore directories combining canonical defaults,
 * dynamically registered tool caches, and audit.config.ts `paths.ignoredDirs`.
 */
export declare function getEffectiveIgnoreDirs(projectRoot?: string): ReadonlySet<string>;
/**
 * Returns the effective unignore directories combining:
 * 1. `config.paths.unignoreDirs`
 * 2. `config.documentation.unignoreDirs`
 * 3. Top-level segments derived from `config.documentation.skillsRoots`
 * 4. Physical existence of `.agents` or `skills` in projectRoot
 */
export declare function getEffectiveUnignoreDirs(projectRoot?: string): readonly string[];
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
export type ISuiteIgnoreRegistry = IBaseEntityRegistry<SuiteIgnoreRequirement>;
export declare class SuiteIgnoreRegistryImpl extends BaseEntityRegistry<SuiteIgnoreRequirement> implements ISuiteIgnoreRegistry {
  constructor();
}
/**
 * Universal singleton instance for SuiteIgnoreRegistry.
 * Inherits directly from BaseEntityRegistry to eliminate Middle Man delegation.
 */
export declare const SuiteIgnoreRegistry: ISuiteIgnoreRegistry;
export type SuiteIgnoreRegistry = ISuiteIgnoreRegistry;
/**
 * Returns a deduplicated array of glob patterns representing all active ignore directories
 * (each formatted as `${dir}/**`), merged with project-level `paths.ignoreGlobs`,
 * `paths.ignoredPatterns`, and optional locked skills from `skills-lock.json`.
 */
export declare function getEffectiveIgnoreGlobs(projectRoot?: string, options?: EffectiveIgnoreGlobsOptions): readonly string[];
/**
 * Dynamically resolves ignore globs for official locked skills declared in `skills-lock.json`,
 * mapped to roots configured in `config.documentation.skillsRoots`.
 */
export declare function getLockedSkillsIgnoreGlobs(projectRoot?: string): readonly string[];