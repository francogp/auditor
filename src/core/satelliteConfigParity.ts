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

import { enableCompileCache } from 'node:module';
import path from 'node:path';

enableCompileCache();

/**
 * Immutable catalog of all satellite configuration file basenames governed by @francogp/auditor.
 */
export const GOVERNED_SATELLITE_FILES: readonly string[] = Object.freeze([
  // Fallow
  '.fallowrc.json',
  '.fallowrc',
  '.fallowrc.js',
  '.fallowrc.cjs',
  'fallow.config.js',
  'fallow.config.ts',

  // Stylelint
  '.stylelintrc.json',
  '.stylelintrc',
  '.stylelintrc.js',
  '.stylelintrc.cjs',
  '.stylelintrc.mjs',
  'stylelint.config.js',
  'stylelint.config.cjs',
  'stylelint.config.mjs',

  // HTML-Validate
  '.htmlvalidate.json',
  '.htmlvalidate.js',
  '.htmlvalidate.cjs',

  // Markdownlint
  '.markdownlint.json',
  '.markdownlint.yaml',
  '.markdownlint.yml',

  // TypeScript
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'tsconfig.vitest.json',
  'tsconfig.build.json',
  'tsconfig.ts7.json',

  // Vite+
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mjs'
]);

const GOVERNED_SATELLITE_SET: ReadonlySet<string> = new Set<string>(GOVERNED_SATELLITE_FILES);

/**
 * Checks whether a given file path corresponds to a governed satellite configuration file.
 */
export function isGovernedSatelliteFile(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;
  const basename = path.basename(filePath.trim());
  return GOVERNED_SATELLITE_SET.has(basename);
}

export type SatelliteParityDiffKind =
  | 'undeclared_entry'
  | 'divergent_value'
  | 'missing_required_entry';

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

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function arePrimitiveArraysEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function detectUndeclaredObjectEntries(
  actualConfig: Record<string, unknown>,
  ssotRecord: Record<string, unknown>,
  allowedExtraKeys: ReadonlySet<string>,
  pathPrefix: string
): SatelliteParityDiff[] {
  const diffs: SatelliteParityDiff[] = [];
  for (const key of Object.keys(actualConfig)) {
    const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (allowedExtraKeys.has(fullPath) || allowedExtraKeys.has(key)) {
      continue;
    }

    if (!(key in ssotRecord)) {
      diffs.push({
        path: fullPath,
        kind: 'undeclared_entry',
        expected: undefined,
        actual: actualConfig[key],
        message: `Undeclared configuration entry '${fullPath}' in satellite configuration. To legitimize this entry, declare it in .auditor/audit.config.ts, or remove it from the satellite file.`
      });
    }
  }
  return diffs;
}

function detectMissingOrDivergentObjectEntries(
  ssotRecord: Record<string, unknown>,
  actualConfig: Record<string, unknown>,
  allowedExtraKeys: ReadonlySet<string>,
  pathPrefix: string,
  ignoreMissingInActual: boolean
): SatelliteParityDiff[] {
  const diffs: SatelliteParityDiff[] = [];
  for (const [key, ssotVal] of Object.entries(ssotRecord)) {
    if (ssotVal === undefined) continue;
    const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;

    if (!(key in actualConfig)) {
      if (!ignoreMissingInActual) {
        diffs.push({
          path: fullPath,
          kind: 'missing_required_entry',
          expected: ssotVal,
          actual: undefined,
          message: `Missing required entry '${fullPath}' in satellite configuration.`
        });
      }
      continue;
    }

    const actualVal = actualConfig[key];
    const nestedDiffs = deepCompareSatelliteConfig({
      ssotProjection: ssotVal,
      actualConfig: actualVal,
      allowedExtraKeys,
      pathPrefix: fullPath,
      ignoreMissingInActual
    });
    diffs.push(...nestedDiffs);
  }
  return diffs;
}

/**
 * Recursively compares an actual satellite configuration against the SSoT projection.
 * Flags any undeclared sub-properties, divergent values, or missing mandatory properties.
 */
export function deepCompareSatelliteConfig(
  options: DeepCompareSatelliteOptions
): SatelliteParityDiff[] {
  const {
    ssotProjection,
    actualConfig,
    allowedExtraKeys = new Set<string>(),
    pathPrefix = '',
    ignoreMissingInActual = false
  } = options;

  const diffs: SatelliteParityDiff[] = [];

  // If actual is missing entirely
  if (actualConfig === undefined) {
    if (!ignoreMissingInActual) {
      diffs.push({
        path: pathPrefix || '(root)',
        kind: 'missing_required_entry',
        expected: ssotProjection,
        actual: undefined,
        message: `Missing required configuration section '${pathPrefix || '(root)'}'.`
      });
    }
    return diffs;
  }

  // Object vs non-object mismatch
  if (isPlainObject(ssotProjection)) {
    if (!isPlainObject(actualConfig)) {
      diffs.push({
        path: pathPrefix || '(root)',
        kind: 'divergent_value',
        expected: ssotProjection,
        actual: actualConfig,
        message: `Expected object at '${pathPrefix || '(root)'}', found ${typeof actualConfig}.`
      });
      return diffs;
    }

    diffs.push(
      ...detectUndeclaredObjectEntries(actualConfig, ssotProjection, allowedExtraKeys, pathPrefix),
      ...detectMissingOrDivergentObjectEntries(
        ssotProjection,
        actualConfig,
        allowedExtraKeys,
        pathPrefix,
        ignoreMissingInActual
      )
    );

    return diffs;
  }

  // Array comparison
  if (Array.isArray(ssotProjection)) {
    if (!Array.isArray(actualConfig)) {
      diffs.push({
        path: pathPrefix,
        kind: 'divergent_value',
        expected: ssotProjection,
        actual: actualConfig,
        message: `Expected array at '${pathPrefix}', found ${typeof actualConfig}.`
      });
      return diffs;
    }

    if (!arePrimitiveArraysEqual(ssotProjection, actualConfig)) {
      diffs.push({
        path: pathPrefix,
        kind: 'divergent_value',
        expected: ssotProjection,
        actual: actualConfig,
        message: `Divergent array elements at '${pathPrefix}'. Expected: ${JSON.stringify(ssotProjection)}, Found: ${JSON.stringify(actualConfig)}.`
      });
    }

    return diffs;
  }

  // Primitive comparison
  if (ssotProjection !== actualConfig) {
    diffs.push({
      path: pathPrefix,
      kind: 'divergent_value',
      expected: ssotProjection,
      actual: actualConfig,
      message: `Divergent value at '${pathPrefix}'. Expected: ${JSON.stringify(ssotProjection)}, Found: ${JSON.stringify(actualConfig)}.`
    });
  }

  return diffs;
}

export const CANONICAL_EXTRA_SATELLITE_KEYS = ['$schema'] as const;

/**
 * Deep merges/projects an SSoT configuration onto a target satellite config object.
 * Overwrites divergent values and removes undeclared entries from governed sections.
 * Returns true if modifications were applied.
 */
export function mergeSatelliteConfigProjection(
  target: Record<string, unknown>,
  projection: Record<string, unknown>,
  allowedExtraKeys: ReadonlySet<string> = new Set<string>(CANONICAL_EXTRA_SATELLITE_KEYS)
): boolean {
  let modified = false;

  for (const [key, projVal] of Object.entries(projection)) {
    if (projVal === undefined) continue;

    if (!(key in target)) {
      target[key] = structuredClone(projVal);
      modified = true;
      continue;
    }

    const currentVal = target[key];

    if (isPlainObject(projVal) && isPlainObject(currentVal)) {
      // Recurse into plain object
      const subModified = mergeSatelliteConfigProjection(currentVal, projVal, allowedExtraKeys);
      if (subModified) modified = true;

      // Clean keys in currentVal that are not in projVal and not allowed
      for (const curKey of Object.keys(currentVal)) {
        if (!(curKey in projVal) && !allowedExtraKeys.has(curKey)) {
          delete currentVal[curKey];
          modified = true;
        }
      }
    } else if (Array.isArray(projVal) && Array.isArray(currentVal)) {
      if (!arePrimitiveArraysEqual(projVal, currentVal)) {
        target[key] = structuredClone(projVal);
        modified = true;
      }
    } else if (currentVal !== projVal) {
      target[key] = projVal;
      modified = true;
    }
  }

  return modified;
}
