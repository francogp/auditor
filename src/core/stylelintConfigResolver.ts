/**
 * src/core/stylelintConfigResolver.ts
 *
 * Pre-resolves Stylelint JSON configs (`extends`, `plugins`, and `overrides[*].extends`)
 * relative to each config file's own directory so Stylelint 18+ resolves nested
 * presets (e.g. `stylelint-config-standard-scss` inside `@francogp/auditor/node_modules`)
 * independently of npm hoisting or host `cwd`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { safeJsonParse, safeReadFileSync, tryOrNull } from './safeUtils.ts';

interface StylelintOverrideEntry {
  readonly files: string | readonly string[];
  readonly extends?: string | readonly string[];
  readonly plugins?: string | readonly string[];
  readonly [key: string]: unknown; // open-record: arbitrary Stylelint override keys
}

interface FlattenedConfigAccumulator {
  readonly extendsList: string[];
  readonly plugins: unknown[];
  readonly overrides: StylelintOverrideEntry[];
  rules: Record<string, unknown>;
  readonly rest: Record<string, unknown>;
}

const SPECIAL_CONFIG_KEYS = new Set(['extends', 'plugins', 'overrides', 'rules', '$schema']);

function toStringArray(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

function resolveStylelintModuleFromDir(specifier: string, baseDir: string): string {
  if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    return path.resolve(baseDir, specifier);
  }
  const parentUrl = pathToFileURL(path.join(baseDir, 'noop.js')).href;
  return tryOrNull(() => fileURLToPath(import.meta.resolve(specifier, parentUrl))) ?? specifier;
}

function resolveStylelintOverrides(overrides: unknown, baseDir: string): StylelintOverrideEntry[] {
  if (!Array.isArray(overrides)) return [];
  return overrides.map((entry: StylelintOverrideEntry) => {
    const resolved: Record<string, unknown> = { ...entry };
    if (entry.extends !== undefined) {
      resolved.extends = toStringArray(entry.extends).map((ext) =>
        resolveStylelintModuleFromDir(ext, baseDir)
      );
    }
    if (entry.plugins !== undefined) {
      resolved.plugins = toStringArray(entry.plugins).map((plugin) =>
        resolveStylelintModuleFromDir(plugin, baseDir)
      );
    }
    return resolved as StylelintOverrideEntry;
  });
}

function mergeConfigFields(acc: FlattenedConfigAccumulator, source: Record<string, unknown>): void {
  if (source.rules && typeof source.rules === 'object') {
    acc.rules = { ...acc.rules, ...(source.rules as Record<string, unknown>) };
  }
  for (const [k, v] of Object.entries(source)) {
    if (!SPECIAL_CONFIG_KEYS.has(k)) {
      acc.rest[k] = v;
    }
  }
}

export function flattenStylelintJsonConfig(
  filePath: string,
  visited: Set<string> = new Set<string>()
): Record<string, unknown> | null {
  if (!filePath.endsWith('.json') || !fs.existsSync(filePath) || visited.has(filePath)) {
    return null;
  }
  visited.add(filePath);
  const raw = safeReadFileSync(filePath);
  if (!raw) return null;
  const parsed = safeJsonParse<Record<string, unknown>>(raw);
  if (!parsed) return null;

  const baseDir = path.dirname(filePath);
  const acc: FlattenedConfigAccumulator = {
    extendsList: [],
    plugins: [],
    overrides: [],
    rules: {},
    rest: {}
  };

  for (const ext of toStringArray(parsed.extends)) {
    const resolvedPath = resolveStylelintModuleFromDir(ext, baseDir);
    const nested = flattenStylelintJsonConfig(resolvedPath, visited);
    if (nested) {
      acc.extendsList.push(...toStringArray(nested.extends));
      if (Array.isArray(nested.plugins)) acc.plugins.push(...nested.plugins);
      if (Array.isArray(nested.overrides)) {
        acc.overrides.push(...(nested.overrides as StylelintOverrideEntry[]));
      }
      mergeConfigFields(acc, nested);
    } else {
      acc.extendsList.push(resolvedPath);
    }
  }

  for (const plugin of toStringArray(parsed.plugins)) {
    acc.plugins.push(resolveStylelintModuleFromDir(plugin, baseDir));
  }
  acc.overrides.push(...resolveStylelintOverrides(parsed.overrides, baseDir));
  mergeConfigFields(acc, parsed);

  return {
    ...acc.rest,
    ...(acc.extendsList.length > 0 ? { extends: acc.extendsList } : {}),
    ...(acc.plugins.length > 0 ? { plugins: acc.plugins } : {}),
    ...(acc.overrides.length > 0 ? { overrides: acc.overrides } : {}),
    rules: acc.rules
  };
}
