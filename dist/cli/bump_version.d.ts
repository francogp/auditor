import { AuditVersionTargetConfig } from "../core/auditConfigTypes.js";
import "../core/auditConfig.js";
import { VERSION_BUMP_TYPES, VersionBumpType } from "../core/versionAnalyzer.js";
export interface MetricTableRow {
  readonly label: string;
  readonly value: string;
}
export type CliBumpType = VersionBumpType;
export declare function isCliBumpType(val: string): val is CliBumpType;
export interface ApplyBumpOptions {
  cwd?: string;
  bumpType?: CliBumpType;
  targetVersion?: string;
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
export declare function runBumpCli(rawArgs?: readonly string[], cwd?: string): void;
export { VERSION_BUMP_TYPES as CLI_BUMP_TYPES };