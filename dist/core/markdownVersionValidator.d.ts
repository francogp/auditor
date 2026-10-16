//#region src/core/markdownVersionValidator.d.ts
/**
 * src/core/markdownVersionValidator.ts
 *
 * Helper module for validating and synchronizing project SemVer and
 * @francogp/auditor version references across Markdown documentation.
 */
export interface ProjectVersionInfo {
  readonly pkgName: string;
  readonly currentSemver: string;
  readonly fullVersion: string;
  readonly expectedAuditorSemver: string | null;
  readonly expectedAuditorFullVersion: string | null;
}
export interface OutdatedVersionMatch {
  readonly lineNum: number;
  readonly found: string;
  readonly expected: string;
  readonly context: string;
}
/**
 * Resolves the canonical project version and @francogp/auditor version from package.json.
 */
export declare function resolveProjectVersionInfo(rootDir: string): ProjectVersionInfo | null;
/**
 * Scans raw Markdown lines for outdated project or @francogp/auditor SemVer references,
 * optionally returning the updated content when fixing.
 */
export declare function scanAndFixMarkdownProjectVersions(relPath: string, rawLines: readonly string[], info: ProjectVersionInfo | null): {
  matches: OutdatedVersionMatch[];
  updatedContent: string | null;
  checkedCount: number;
};
/**
 * Synchronizes version references in standard documentation files (README.md, skill references)
 * during `auditor-version bump`.
 */
export declare function syncDocumentationVersionReferences(cwd: string): string[];
//#endregion