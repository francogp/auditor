#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/check_environment.ts
 *
 * SSoT Environment Engine Validator (Node.js 26+ Native)
 * Enforces Node.js and npm version invariants dynamically derived from package.json
 * without hardcoded versions.
 */
export interface SemverVersion {
    major: number;
    minor: number;
    patch: number;
}
export declare function parseSemver(v: string): SemverVersion;
export declare function compareVersions(current: SemverVersion, required: SemverVersion): boolean;
export interface AuditorEngineSpecs {
    readonly node: string;
    readonly npm: string;
}
export declare function getAuditorEngines(): AuditorEngineSpecs;
export declare function checkEnvironment(targetDir?: string, autoRemediate?: boolean): boolean;
//# sourceMappingURL=check_environment.d.ts.map