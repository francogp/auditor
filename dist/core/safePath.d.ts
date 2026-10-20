import { sanitizePath } from "./auditConfigLoader.js";
import { toPosixRelative } from "./auditCoverage.js";
import { isPathExempt, normalizePosixPath } from "./reportUtils.js";
//#region src/core/safePath.d.ts
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
/**
 * Normalizes an absolute or relative path to a canonical POSIX path (forward slashes)
 * relative to baseDir. Strips redundant leading `./`.
 */
export declare function toPosixPath(filePath: string, baseDir?: string): string;
/**
 * Validates strict path containment (CWE-22) using native path resolution.
 * Returns true if candidateChild resides inside parentDir without directory traversal.
 * When baseDir is provided, both parentDir and candidateChild are resolved relative to baseDir.
 * When baseDir is omitted and candidateChild is relative, it is resolved relative to parentDir.
 */
export declare function isPathContained(parentDir: string, candidateChild: string, baseDir?: string): boolean;
/**
 * Builds an index of repository files mapping basename to array of absolute paths.
 * Ignores common build/temporary directories.
 */
export declare function buildRepositoryFileIndex(rootDir: string, isIgnoredFn: (fullPath: string) => boolean): Map<string, string[]>;
/**
 * Strips recursive glob wildcards and trailing slashes from path patterns.
 */
export declare function stripGlobSuffix(pattern: string): string;
//#endregion
export { isPathExempt, normalizePosixPath, sanitizePath, toPosixRelative };