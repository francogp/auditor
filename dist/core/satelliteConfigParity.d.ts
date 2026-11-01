/**
 * src/core/satelliteConfigParity.ts
 *
 * UNIVERSAL RECURSIVE SATELLITE CONFIG PARITY ENGINE & REGISTRY (Node.js 26+ Native)
 *
 * Enforces the Single Source of Truth (SSoT) Sovereignty Mandate:
 *   1. Maintains the canonical catalog of all governed satellite configuration files.
 *   2. Provides deep recursive comparison (deepCompareSatelliteConfig) detecting undeclared,
 *      missing, or divergent properties and sub-properties at any nesting depth.
 *   3. Provides deep recursive projection merging (mergeSatelliteConfigProjection) for deterministic
 *      auto-fix synchronization in `npm run auditor:fix` (phase: 'setup').
 */
/**
 * Immutable catalog of all satellite configuration file basenames governed by @francogp/auditor.
 */
export declare const GOVERNED_SATELLITE_FILES: readonly string[];
/**
 * Checks whether a given file path corresponds to a governed satellite configuration file.
 */
export declare function isGovernedSatelliteFile(filePath: string): boolean;
export type SatelliteParityDiffKind = 'undeclared_entry' | 'divergent_value' | 'missing_required_entry';
export interface SatelliteParityDiff {
  readonly path: string;
  readonly kind: SatelliteParityDiffKind;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly message: string;
}
export interface DeepCompareSatelliteOptions {
  /** The SSoT projection representing the authorized/expected structure */
  readonly ssotProjection: unknown;
  /** The actual configuration object found on disk */
  readonly actualConfig: unknown;
  /** Set of top-level or dotted keys permitted as extra entries (e.g. '$schema', 'extends') */
  readonly allowedExtraKeys?: ReadonlySet<string>;
  /** Key prefix path for nested recursion */
  readonly pathPrefix?: string;
  /** Whether to ignore properties present in SSoT but omitted in satellite */
  readonly ignoreMissingInActual?: boolean;
}
/**
 * Recursively compares an actual satellite configuration against the SSoT projection.
 * Flags any undeclared sub-properties, divergent values, or missing mandatory properties.
 */
export declare function deepCompareSatelliteConfig(options: DeepCompareSatelliteOptions): SatelliteParityDiff[];
export declare const CANONICAL_EXTRA_SATELLITE_KEYS: readonly ["$schema"];
/**
 * Deep merges/projects an SSoT configuration onto a target satellite config object.
 * Overwrites divergent values and removes undeclared entries from governed sections.
 * Returns true if modifications were applied.
 */
export declare function mergeSatelliteConfigProjection(target: Record<string, unknown>, projection: Record<string, unknown>, allowedExtraKeys?: ReadonlySet<string>): boolean;