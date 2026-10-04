#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/bump_version.ts
 *
 * CLI tool for inspecting, analyzing, and applying intelligent SemVer version bumps
 * with build timestamp metadata (@francogp/auditor).
 *
 * Commands:
 *   auditor-version               Print current version and build timestamp
 *   auditor-version analyze       Analyze diff and recommend Major/Minor/Patch
 *   auditor-version bump [type]   Apply version bump (auto|major|minor|patch)
 */
import { type VersionBumpType } from '../core/versionAnalyzer.ts';
import { type AuditVersionTargetConfig } from '../core/auditConfig.ts';
export interface MetricTableRow {
    readonly label: string;
    readonly value: string;
}
export interface ApplyBumpOptions {
    cwd?: string;
    bumpType?: VersionBumpType | 'auto';
    commitMessage?: string;
    versionTsPath?: string;
    customNow?: Temporal.ZonedDateTime;
    autoSyncPublicVersionJson?: boolean;
    syncTargets?: readonly (string | AuditVersionTargetConfig)[];
}
export interface ApplyBumpResult {
    previousVersion: string;
    newVersion: string;
    bumpType: VersionBumpType;
    buildId: string;
    buildDate: string;
    packageJsonPath: string;
    versionTsPath: string;
    syncedFiles: string[];
}
/**
 * Applies a SemVer bump and persists it to package.json, version.ts, and configured sync targets.
 */
export declare function applyVersionBump(options?: ApplyBumpOptions): ApplyBumpResult;
export declare function runBumpCli(): void;
//# sourceMappingURL=bump_version.d.ts.map