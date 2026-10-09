/**
 * src/core/safePath.ts
 *
 * Centralized path resolution, sanitization, POSIX conversion, and URL security helper.
 * Prevents directory traversal attacks (CWE-22) and SSRF (CWE-918).
 */
import { sanitizePath } from './auditConfig.ts';
export { sanitizePath };
/**
 * Resolves absolute paths safely within project root boundary using native Node.js path APIs.
 * Prevents directory traversal attacks (CWE-22).
 */
export declare function safeResolve(...pathSegments: string[]): string;
/**
 * Joins path segments safely within project root boundary.
 */
export declare function safeJoin(...pathSegments: string[]): string;
/**
 * Safely writes to a file with boundary validation and recursive directory creation.
 */
export declare function safeWriteFileSync(filePath: string, content: string | Buffer): void;
/**
 * Safely writes to a file with boundary validation and recursive directory creation (async).
 */
export declare function safeWriteFile(filePath: string, content: string | Buffer): Promise<void>;
/**
 * Safely reads a file with boundary validation (async).
 */
export declare function safeReadFile(filePath: string, encoding?: BufferEncoding): Promise<string>;
/**
 * Performs a safe fetch request verifying host against an allowlist (SSRF CWE-918).
 */
export declare function safeFetch(rawUrl: string, options?: RequestInit, allowedHosts?: readonly string[]): Promise<Response>;
/**
 * Builds a safe local relative URL with query parameters (SSRF Prevention CWE-918).
 * Uses WHATWG URL standard API without fragile homebrew regexes.
 */
export declare function safeDevUrl(endpoint: string, params?: Record<string, string>, baseOrigin?: string): string;
import { toPosixRelative } from './auditCoverage.ts';
export { toPosixRelative };
export { normalizePosixPath } from './reportUtils.ts';
/**
 * Normalizes an absolute or relative path to a canonical POSIX path (forward slashes)
 * relative to baseDir. Strips redundant leading `./`.
 */
export declare function toPosixPath(filePath: string, baseDir?: string): string;
/**
 * Validates strict path containment (CWE-22) using native path resolution.
 * Returns true if candidateChild resides inside parentDir without directory traversal.
 */
export declare function isPathContained(parentDir: string, candidateChild: string): boolean;
export { CANONICAL_IGNORE_DIRS, SCANNABLE_EXTENSIONS, assertSafePathComponent, isPathIgnored, loadFallowIgnorePatterns, collectRepositoryFiles, loadLockedSkills, isLockedSkillPath, clearLockedSkillsCache } from './auditorBase.ts';
/**
 * Builds an index of repository files mapping basename to array of absolute paths.
 * Ignores common build/temporary directories.
 */
export declare function buildRepositoryFileIndex(rootDir: string, isIgnoredFn: (fullPath: string) => boolean): Map<string, string[]>;
//# sourceMappingURL=safePath.d.ts.map