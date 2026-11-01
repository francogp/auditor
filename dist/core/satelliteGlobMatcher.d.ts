import { AuditConfig } from "./auditConfigTypes.js";
import { stripGlobSuffix } from "./safePath.js";
import { SatelliteGlobMatcherContext, isPatternContainedInGlobs } from "./globContainment.js";
/**
 * Resolves the canonical set of allowed path exemptions and ignore globs from SSoT config.
 * Encapsulates all canonical root categories, data directories, test roots, demo directories,
 * and global ignore globs for satellite configuration sovereignty validators.
 */
export declare function getAllowedSatellitePathExcludes(auditConfig: AuditConfig, projectRoot: string): ReadonlySet<string>;
/**
 * Validates a list of candidate path/glob entries from a satellite configuration file against
 * allowed exemptions and effective ignore globs. Invokes onUndeclared for each entry not covered.
 */
export declare function validateSatelliteUndeclaredEntries(entries: readonly string[], contextOrAllowed: SatelliteGlobMatcherContext | ReadonlySet<string>, effectiveGlobsOrHandler: readonly string[] | ((entry: string, index: number) => void), maybeHandler?: (entry: string, index: number) => void): void;
export { type SatelliteGlobMatcherContext, isPatternContainedInGlobs, stripGlobSuffix };