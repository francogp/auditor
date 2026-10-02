/**
 * src/cli/stamp_version.ts
 *
 * Automatically stamps a semver-compliant build timestamp version into package.json
 * and generates src/core/version.ts Single Source of Truth during compilation.
 */
export interface StampVersionResult {
    version: string;
    buildId: string;
    buildDate: string;
    packageJsonPath: string;
    versionTsPath: string;
}
/**
 * Generates an elegant build ID and updates package.json and version.ts.
 */
export declare function stampVersion(projectRoot?: string, customNow?: Temporal.ZonedDateTime): StampVersionResult;
//# sourceMappingURL=stamp_version.d.ts.map