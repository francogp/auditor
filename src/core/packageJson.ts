/**
 * src/core/packageJson.ts
 *
 * CANONICAL PACKAGE.JSON CACHING & DTO PROVIDER (Node.js 26+ Native)
 *
 * Centralizes synchronous reading, parsing, caching, and writing of package.json
 * across all auditors, analyzers, and CLI scripts, eradicating duplicate file reads
 * and uncoordinated JSON parsing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';

enableCompileCache();

export const PACKAGE_JSON_TYPES = ['module', 'commonjs'] as const;
export type PackageJsonType = (typeof PACKAGE_JSON_TYPES)[number];

export interface PackageJsonDTO {
  readonly name?: string;
  readonly version?: string;
  readonly description?: string;
  readonly type?: PackageJsonType;
  readonly main?: string;
  readonly types?: string;
  readonly bin?: string | Record<string, string>;
  readonly scripts?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
  readonly engines?: Record<string, string>;
  readonly files?: readonly string[];
  readonly exports?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

const packageJsonCache = new Map<string, PackageJsonDTO | null>();

/**
 * Returns the parsed package.json object for the specified project root with memory caching.
 * Returns null if the file does not exist or contains invalid JSON syntax.
 */
export function getPackageJson(projectRoot?: string, forceReload: boolean = false): PackageJsonDTO | null {
  const root = projectRoot ? path.resolve(projectRoot) : process.cwd();
  const pkgPath = path.join(root, 'package.json');

  if (!forceReload && packageJsonCache.has(pkgPath)) {
    return packageJsonCache.get(pkgPath) ?? null;
  }

  if (!fs.existsSync(pkgPath)) {
    packageJsonCache.set(pkgPath, null);
    return null;
  }

  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    const parsed = JSON.parse(raw) as PackageJsonDTO;
    packageJsonCache.set(pkgPath, parsed);
    return parsed;
  } catch {
    // catch-ok: Corrupt or unparseable package.json returns null gracefully
    packageJsonCache.set(pkgPath, null);
    return null;
  }
}

/**
 * Clears the in-memory cache for package.json (useful in unit tests or after writes).
 */
export function clearPackageJsonCache(): void {
  packageJsonCache.clear();
}

/**
 * Writes updated package.json to disk and refreshes the in-memory cache.
 */
export function writePackageJson(projectRoot: string, data: PackageJsonDTO): void {
  const root = path.resolve(projectRoot);
  const pkgPath = path.join(root, 'package.json');
  fs.writeFileSync(pkgPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  packageJsonCache.set(pkgPath, data);
}
