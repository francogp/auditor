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
export const PACKAGE_JSON_TYPES = ['module', 'commonjs'];
const packageJsonCache = new Map();
/**
 * Returns the parsed package.json object for the specified project root with memory caching.
 * Returns null if the file does not exist or contains invalid JSON syntax.
 */
export function getPackageJson(projectRoot, forceReload = false) {
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
        const parsed = JSON.parse(raw);
        packageJsonCache.set(pkgPath, parsed);
        return parsed;
    }
    catch {
        // catch-ok: Corrupt or unparseable package.json returns null gracefully
        packageJsonCache.set(pkgPath, null);
        return null;
    }
}
/**
 * Clears the in-memory cache for package.json (useful in unit tests or after writes).
 */
export function clearPackageJsonCache() {
    packageJsonCache.clear();
}
/**
 * Writes updated package.json to disk and refreshes the in-memory cache.
 */
export function writePackageJson(projectRoot, data) {
    const root = path.resolve(projectRoot);
    const pkgPath = path.join(root, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    packageJsonCache.set(pkgPath, data);
}
//# sourceMappingURL=packageJson.js.map