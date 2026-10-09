#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/update_package.ts
 *
 * Dedicated CLI updater for @francogp/auditor across host repositories.
 * Performs a standard, hermetic npm update without ad-hoc scripts or git cloning.
 */
export interface UpdateAuditorOptions {
    cwd?: string;
    silent?: boolean;
    stopAt?: string;
}
export interface UpdateAuditorResult {
    success: boolean;
    projectRoot: string;
    previousVersion: string;
    newVersion: string;
    error?: string;
}
export declare function findHostProjectRoot(startDir?: string, stopAt?: string): string;
export declare function readInstalledAuditorVersion(projectRoot: string): string;
export declare function updateAuditorPackage(options?: UpdateAuditorOptions): UpdateAuditorResult;
export declare function runAuditorFixAutoRemediation(projectRoot: string, silent?: boolean): boolean;
export declare function runCli(): void;
//# sourceMappingURL=update_package.d.ts.map