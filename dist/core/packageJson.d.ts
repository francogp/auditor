/**
 * src/core/packageJson.ts
 *
 * CANONICAL PACKAGE.JSON CACHING & DTO PROVIDER (Node.js 26+ Native)
 *
 * Centralizes synchronous reading, parsing, caching, and writing of package.json
 * across all auditors, analyzers, and CLI scripts, eradicating duplicate file reads
 * and uncoordinated JSON parsing.
 */
export declare const PACKAGE_JSON_TYPES: readonly ["module", "commonjs"];
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
/**
 * Returns the parsed package.json object for the specified project root with memory caching.
 * Returns null if the file does not exist or contains invalid JSON syntax.
 */
export declare function getPackageJson(projectRoot?: string, forceReload?: boolean): PackageJsonDTO | null;
/**
 * Clears the in-memory cache for package.json (useful in unit tests or after writes).
 */
export declare function clearPackageJsonCache(): void;
/**
 * Writes updated package.json to disk and refreshes the in-memory cache.
 */
export declare function writePackageJson(projectRoot: string, data: PackageJsonDTO): void;
//# sourceMappingURL=packageJson.d.ts.map