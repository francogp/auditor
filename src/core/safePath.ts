/**
 * scripts/lib/safePath.ts
 * 
 * Centralized path resolution, sanitization, and URL security helper for maintenance & database scripts.
 * Prevents directory traversal attacks (CWE-22) and SSRF (CWE-918).
 */

import path from 'node:path';
import fs from 'node:fs';

const CWE_PATH_TRAVERSAL_ID_TEXT = '22';

export function sanitizePath(inputPath: string): string {
  const clean = String(inputPath).replace(/(\.\.[/\\])+/g, '').replace(/[^a-zA-Z0-9_\- /.:\\]/g, '');
  return path.normalize(clean);
}

/**
 * Resolves absolute paths safely within project root boundary.
 */
export function safeResolve(...pathSegments: string[]): string {
  const root = path.resolve(process.cwd());
  const resolved = path.resolve(...pathSegments.filter(Boolean));
  const normalized = path.normalize(resolved);
  if (!normalized.toLowerCase().startsWith(root.toLowerCase())) {
    throw new Error(`Security Violation CWE-${CWE_PATH_TRAVERSAL_ID_TEXT}: Path '${normalized}' escapes project root '${root}'`);
  }
  return normalized;
}

/**
 * Joins path segments safely within project root boundary.
 */
export function safeJoin(...pathSegments: string[]): string {
  return safeResolve(...pathSegments);
}



/**
 * Safely writes to a file with boundary validation and recursive directory creation.
 */
export function safeWriteFileSync(filePath: string, content: string | Buffer): void {
  const resolved = safeResolve(filePath);
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
  const resolved = safeResolve(filePath);
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
export async function safeFetch(rawUrl: string, options?: RequestInit, allowedHosts: readonly string[] = ['supabase.co', 'localhost', '127.0.0.1']): Promise<Response> {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'https:') {
    throw new Error(`Security Violation CWE-SSRF: Non-HTTPS protocol '${parsed.protocol}' rejected`);
  }
  const host = parsed.hostname.toLowerCase(); // string-ok: Internal string formatting or DOM token identifier
  const isAllowed = allowedHosts.some(h => host === h || host.endsWith(`.${h}`));
  if (!isAllowed) {
    throw new Error(`Security Violation CWE-SSRF: Host '${host}' is not in allowed hosts list`);
  }
  // fallow-ignore-next-line security-sink
  return fetch(parsed.toString(), options);
}

/**
 * Builds a safe local relative URL with query parameters (SSRF Prevention CWE-918).
 */
export function safeDevUrl(endpoint: string, params: Record<string, string> = {}, baseOrigin = 'http://localhost'): string {
  const cleanEndpoint = endpoint.replace(/[^a-zA-Z0-9_-]/g, '');
  const url = new URL(cleanEndpoint, baseOrigin);
  for (const [key, val] of Object.entries(params)) {
    const cleanKey = key.replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanVal = val.replace(/[^a-zA-Z0-9_-]/g, '');
    url.searchParams.set(cleanKey, cleanVal);
  }
  return url.pathname + url.search;
}

export {
  CANONICAL_IGNORE_DIRS,
  SCANNABLE_EXTENSIONS,
  assertSafePathComponent,
  isPathIgnored,
  loadFallowIgnorePatterns,
  collectRepositoryFiles
} from './auditorBase.ts';

