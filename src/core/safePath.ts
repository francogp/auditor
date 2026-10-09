/**
 * src/core/safePath.ts
 * 
 * Centralized path resolution, sanitization, POSIX conversion, and URL security helper.
 * Prevents directory traversal attacks (CWE-22) and SSRF (CWE-918).
 */

import path from 'node:path';
import fs from 'node:fs';
import { enableCompileCache } from 'node:module';
import { getAuditConfig, sanitizePath } from './auditConfig.ts';
import { isLockedSkillPath } from './auditorBase.ts';

enableCompileCache();

const CWE_PATH_TRAVERSAL_ID_TEXT = '22';

export { sanitizePath };

/**
 * Resolves absolute paths safely within project root boundary using native Node.js path APIs.
 * Prevents directory traversal attacks (CWE-22).
 */
export function safeResolve(...pathSegments: string[]): string {
  const root = path.resolve(process.cwd());
  const resolved = path.resolve(...pathSegments.filter(Boolean));
  const rel = path.relative(root, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Security Violation CWE-${CWE_PATH_TRAVERSAL_ID_TEXT}: Path '${resolved}' escapes project root '${root}'`);
  }
  return resolved;
}

/**
 * Joins path segments safely within project root boundary.
 */
export function safeJoin(...pathSegments: string[]): string {
  return safeResolve(...pathSegments);
}

function assertNotLockedSkill(filePath: string): string {
  const resolved = safeResolve(filePath);
  const root = path.resolve(process.cwd());
  if (isLockedSkillPath(resolved, root)) {
    throw new Error(`Security / Immutability Violation: Cannot write to official locked skill: '${resolved}'`);
  }
  return resolved;
}

/**
 * Safely writes to a file with boundary validation and recursive directory creation.
 */
export function safeWriteFileSync(filePath: string, content: string | Buffer): void {
  const resolved = assertNotLockedSkill(filePath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(resolved, content);
}

/**
 * Safely writes to a file with boundary validation and recursive directory creation (async).
 */
export async function safeWriteFile(filePath: string, content: string | Buffer): Promise<void> {
  const resolved = assertNotLockedSkill(filePath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    await fs.promises.mkdir(dir, { recursive: true });
  }
  await fs.promises.writeFile(resolved, content, typeof content === 'string' ? 'utf-8' : undefined);
}

/**
 * Safely reads a file with boundary validation (async).
 */
export async function safeReadFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
  const resolved = safeResolve(filePath);
  return fs.promises.readFile(resolved, encoding);
}

/**
 * Performs a safe fetch request verifying host against an allowlist (SSRF CWE-918).
 */
export async function safeFetch(rawUrl: string, options?: RequestInit, allowedHosts?: readonly string[]): Promise<Response> {
  const config = getAuditConfig();
  const hosts = allowedHosts ?? config?.persistence?.allowedHosts ?? ['localhost', '127.0.0.1'];
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'https:') {
    throw new Error(`Security Violation CWE-SSRF: Non-HTTPS protocol '${parsed.protocol}' rejected`);
  }
  const host = parsed.hostname.toLowerCase();
  const isAllowed = hosts.some(h => host === h || host.endsWith(`.${h}`));
  if (!isAllowed) {
    throw new Error(`Security Violation CWE-SSRF: Host '${host}' is not in allowed hosts list`);
  }
  // fallow-ignore-next-line security-sink
  return fetch(parsed.toString(), options);
}

/**
 * Builds a safe local relative URL with query parameters (SSRF Prevention CWE-918).
 * Uses WHATWG URL standard API without fragile homebrew regexes.
 */
export function safeDevUrl(endpoint: string, params: Record<string, string> = {}, baseOrigin = 'http://localhost'): string {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = new URL(normalizedEndpoint, baseOrigin);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, val);
  }
  return url.pathname + url.search;
}

import { toPosixRelative } from './auditCoverage.ts';
export { toPosixRelative };
export { normalizePosixPath } from './reportUtils.ts';

/**
 * Normalizes an absolute or relative path to a canonical POSIX path (forward slashes)
 * relative to baseDir. Strips redundant leading `./`.
 */
export function toPosixPath(filePath: string, baseDir: string = process.cwd()): string {
  return toPosixRelative(baseDir, filePath);
}

/**
 * Validates strict path containment (CWE-22) using native path resolution.
 * Returns true if candidateChild resides inside parentDir without directory traversal.
 */
export function isPathContained(parentDir: string, candidateChild: string): boolean {
  const resolvedParent = path.resolve(parentDir);
  const resolvedChild = path.resolve(resolvedParent, candidateChild);
  const rel = path.relative(resolvedParent, resolvedChild);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

export {
  CANONICAL_IGNORE_DIRS,
  SCANNABLE_EXTENSIONS,
  assertSafePathComponent,
  isPathIgnored,
  loadFallowIgnorePatterns,
  collectRepositoryFiles,
  loadLockedSkills,
  isLockedSkillPath,
  clearLockedSkillsCache
} from './auditorBase.ts';

const SKIPPABLE_DIR_NAMES: ReadonlySet<string> = new Set(['node_modules', 'dist', 'scratch']);

function isSkippableDirectory(dirName: string): boolean {
  if (SKIPPABLE_DIR_NAMES.has(dirName)) return true;
  return dirName.startsWith('.') && dirName !== '.' && dirName !== '.agents';
}

function recordIndexedFile(index: Map<string, string[]>, full: string, name: string): void {
  const existing = index.get(name);
  if (existing) {
    existing.push(full);
  } else {
    index.set(name, [full]);
  }
}

/**
 * Builds an index of repository files mapping basename to array of absolute paths.
 * Ignores common build/temporary directories.
 */
export function buildRepositoryFileIndex(
  rootDir: string,
  isIgnoredFn: (fullPath: string) => boolean
): Map<string, string[]> {
  const index = new Map<string, string[]>();

  function walk(currentDir: string): void {
    if (isIgnoredFn(currentDir)) return;
    if (isSkippableDirectory(path.basename(currentDir))) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      // catch-ok: unreadable directory
      return;
    }

    for (const entry of entries) {
      const full = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && !isIgnoredFn(full)) {
        recordIndexedFile(index, full, entry.name);
      }
    }
  }

  walk(rootDir);
  return index;
}
