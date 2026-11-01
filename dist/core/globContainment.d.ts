import { stripGlobSuffix } from "./safePath.js";
/**
 * Parameter object encapsulating allowed glob exclusions and effective project ignore patterns.
 * Solves the Data Clump smell across glob matching functions.
 */
export interface SatelliteGlobMatcherContext {
  readonly allowedGlobs: ReadonlySet<string>;
  readonly effectiveGlobs: readonly string[];
}
/**
 * Checks whether a candidate path or glob pattern is covered by an allowed glob set
 * or effective ignore globs, accounting for trailing slashes, wildcards, and directory boundaries.
 */
export declare function isPatternContainedInGlobs(pattern: string, contextOrAllowed: SatelliteGlobMatcherContext | ReadonlySet<string>, maybeEffectiveGlobs?: readonly string[]): boolean;
export { stripGlobSuffix };