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

import { safeJsonParse, safeReadFileSync, tryCatchAsync } from './safeUtils.ts';

const AUDITOR_PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

function splitPackageSpecifier(specifier: string): { pkgName: string; subpath: string } {
  const parts = specifier.split('/');
  const first = parts[0] ?? '';
  const pkgName =
    specifier.startsWith('@') && parts.length >= 2 ? `${first}/${parts[1] ?? ''}` : first;
  const rest = parts.slice(pkgName.includes('/') ? 2 : 1).join('/');
  return { pkgName, subpath: rest ? `./${rest}` : '.' };
}

function extractExportTarget(exportsField: unknown, subpath: string): string | null {
  if (typeof exportsField === 'string' && subpath === '.') return exportsField;
  if (!exportsField || typeof exportsField !== 'object') return null;
  const map = exportsField as Record<string, unknown>;
  const entry = subpath in map ? map[subpath] : subpath === '.' ? exportsField : undefined;
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    const cond = entry as Record<string, unknown>;
    if (typeof cond.import === 'string') return cond.import;
    if (typeof cond.default === 'string') return cond.default;
    if (typeof cond.require === 'string') return cond.require;
  }
  return null;
}

function resolvePackageEntry(pkgDir: string, subpath: string): string | null {
  const pkgJson = safeJsonParse<Record<string, unknown>>(
    safeReadFileSync(path.join(pkgDir, 'package.json')) ?? ''
  );
  if (!pkgJson) return null;
  const exportTarget = extractExportTarget(pkgJson.exports, subpath);
  if (exportTarget) {
    const candidate = path.resolve(pkgDir, exportTarget);
    if (fs.existsSync(candidate)) return candidate;
  }
  if (subpath === '.' && typeof pkgJson.main === 'string') {
    const candidate = path.resolve(pkgDir, pkgJson.main);
    if (fs.existsSync(candidate)) return candidate;
  }
  const fallback =
    subpath === '.' ? path.join(pkgDir, 'index.js') : path.join(pkgDir, `${subpath}.js`);
  return fs.existsSync(fallback) ? fallback : null;
}

function resolveStylelintModuleFromDir(
  specifier: string,
  baseDir: string,
  fallbackDir?: string
): string {
  if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    return path.resolve(baseDir, specifier);
  }
  const { pkgName, subpath } = splitPackageSpecifier(specifier);
  for (const startDir of fallbackDir ? [baseDir, fallbackDir] : [baseDir]) {
    let current = path.resolve(startDir);
    while (true) {
      const pkgDir = path.join(current, 'node_modules', pkgName);
      if (fs.existsSync(path.join(pkgDir, 'package.json'))) {
        const resolved = resolvePackageEntry(pkgDir, subpath);
        if (resolved) return resolved;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return specifier;
}

async function resolveCustomSyntaxValue(
  value: unknown,
  baseDir: string,
  fallbackDir?: string
): Promise<unknown> {
  if (typeof value !== 'string') return value;
  const resolvedPath = path.isAbsolute(value)
    ? value
    : resolveStylelintModuleFromDir(value, baseDir, fallbackDir);
  if (!fs.existsSync(resolvedPath)) return resolvedPath;
  const loaded = await tryCatchAsync(async () => {
    const mod = (await import(pathToFileURL(resolvedPath).href)) as { default?: unknown };
    return mod?.default ?? mod;
  });
  return loaded.status === 'success' ? loaded.value : pathToFileURL(resolvedPath).href;
}

async function applyOverrideExtends(
  entry: StylelintOverrideEntry,
  resolved: Record<string, unknown>,
  baseDir: string,
  fallbackDir: string | undefined,
  visited: Set<string>
): Promise<StylelintOverrideEntry[]> {
  const extraOverrides: StylelintOverrideEntry[] = [];
  const nextExtends: string[] = [];
  const nextPlugins: unknown[] = [];
  let mergedRules =
    entry.rules && typeof entry.rules === 'object'
      ? { ...(entry.rules as Record<string, unknown>) }
      : undefined;

  for (const ext of toStringArray(entry.extends)) {
    const resolvedPath = resolveStylelintModuleFromDir(ext, baseDir, fallbackDir);
    const nested = await flattenStylelintJsonConfig(resolvedPath, fallbackDir, new Set(visited));
    if (!nested) {
      nextExtends.push(resolvedPath);
      continue;
    }
    nextExtends.push(...toStringArray(nested.extends));
    if (Array.isArray(nested.plugins)) nextPlugins.push(...nested.plugins);
    if (nested.customSyntax !== undefined) resolved.customSyntax = nested.customSyntax;
    if (nested.rules && typeof nested.rules === 'object') {
      mergedRules = { ...(nested.rules as Record<string, unknown>), ...mergedRules };
    }
    if (Array.isArray(nested.overrides)) {
      extraOverrides.push(...(nested.overrides as StylelintOverrideEntry[]));
    }
  }

  if (nextExtends.length > 0) resolved.extends = nextExtends;
  else delete resolved.extends;
  if (nextPlugins.length > 0) {
    const ownPlugins = toStringArray(entry.plugins).map((p) =>
      resolveStylelintModuleFromDir(p, baseDir, fallbackDir)
    );
    resolved.plugins = [...nextPlugins, ...ownPlugins];
  }
  if (mergedRules) resolved.rules = mergedRules;
  return extraOverrides;
}

async function resolveSingleStylelintOverride(
  entry: StylelintOverrideEntry,
  baseDir: string,
  fallbackDir: string | undefined,
  visited: Set<string>
): Promise<StylelintOverrideEntry[]> {
  const resolved: Record<string, unknown> = { ...entry };
  const extraOverrides =
    entry.extends !== undefined
      ? await applyOverrideExtends(entry, resolved, baseDir, fallbackDir, visited)
      : [];

  if (entry.plugins !== undefined && entry.extends === undefined) {
    resolved.plugins = toStringArray(entry.plugins).map((p) =>
      resolveStylelintModuleFromDir(p, baseDir, fallbackDir)
    );
  }
  const syntaxCandidate =
    typeof entry.customSyntax === 'string' ? entry.customSyntax : resolved.customSyntax;
  if (typeof syntaxCandidate === 'string') {
    resolved.customSyntax = await resolveCustomSyntaxValue(syntaxCandidate, baseDir, fallbackDir);
  }
  return [resolved as StylelintOverrideEntry, ...extraOverrides];
}

async function resolveStylelintOverrides(
  overrides: unknown,
  baseDir: string,
  fallbackDir?: string,
  visited: Set<string> = new Set<string>()
): Promise<StylelintOverrideEntry[]> {
  if (!Array.isArray(overrides)) return [];
  const result: StylelintOverrideEntry[] = [];
  for (const entry of overrides as StylelintOverrideEntry[]) {
    result.push(...(await resolveSingleStylelintOverride(entry, baseDir, fallbackDir, visited)));
  }
  return result;
}

async function loadStylelintConfigObject(
  filePath: string
): Promise<Record<string, unknown> | null> {
  if (!fs.existsSync(filePath)) return null;
  if (filePath.endsWith('.json')) {
    const raw = safeReadFileSync(filePath);
    return raw ? (safeJsonParse<Record<string, unknown>>(raw) ?? null) : null;
  }
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
    const loaded = await tryCatchAsync(async () => {
      const mod = (await import(pathToFileURL(filePath).href)) as {
        default?: Record<string, unknown>;
      };
      return mod?.default ?? mod;
    });
    if (loaded.status !== 'success') return null;
    return loaded.value && typeof loaded.value === 'object' ? loaded.value : null;
  }
  return null;
}

async function mergeConfigFields(
  acc: FlattenedConfigAccumulator,
  source: Record<string, unknown>,
  baseDir: string,
  fallbackDir?: string
): Promise<void> {
  if (source.rules && typeof source.rules === 'object') {
    acc.rules = { ...acc.rules, ...(source.rules as Record<string, unknown>) };
  }
  for (const [k, v] of Object.entries(source)) {
    if (!SPECIAL_CONFIG_KEYS.has(k)) {
      acc.rest[k] =
        k === 'customSyntax' && typeof v === 'string'
          ? await resolveCustomSyntaxValue(v, baseDir, fallbackDir)
          : v;
    }
  }
}

export async function flattenStylelintJsonConfig(
  filePath: string,
  fallbackDir: string = AUDITOR_PACKAGE_ROOT,
  visited: Set<string> = new Set<string>()
): Promise<Record<string, unknown> | null> {
  if (visited.has(filePath)) return null;
  const parsed = await loadStylelintConfigObject(filePath);
  if (!parsed) return null;
  visited.add(filePath);

  const baseDir = path.dirname(filePath);
  const acc: FlattenedConfigAccumulator = {
    extendsList: [],
    plugins: [],
    overrides: [],
    rules: {},
    rest: {}
  };

  for (const ext of toStringArray(parsed.extends)) {
    const resolvedPath = resolveStylelintModuleFromDir(ext, baseDir, fallbackDir);
    const nested = await flattenStylelintJsonConfig(resolvedPath, fallbackDir, visited);
    if (nested) {
      acc.extendsList.push(...toStringArray(nested.extends));
      if (Array.isArray(nested.plugins)) acc.plugins.push(...nested.plugins);
      if (Array.isArray(nested.overrides)) {
        acc.overrides.push(...(nested.overrides as StylelintOverrideEntry[]));
      }
      await mergeConfigFields(acc, nested, baseDir, fallbackDir);
    } else {
      acc.extendsList.push(resolvedPath);
    }
  }

  for (const plugin of toStringArray(parsed.plugins)) {
    acc.plugins.push(resolveStylelintModuleFromDir(plugin, baseDir, fallbackDir));
  }
  acc.overrides.push(
    ...(await resolveStylelintOverrides(parsed.overrides, baseDir, fallbackDir, visited))
  );
  await mergeConfigFields(acc, parsed, baseDir, fallbackDir);

  const ownRuleKeys =
    parsed.rules && typeof parsed.rules === 'object'
      ? new Set(Object.keys(parsed.rules))
      : new Set<string>();
  const normalizedOverrides =
    ownRuleKeys.size > 0
      ? acc.overrides.map((ov) => {
          if (!ov.rules || typeof ov.rules !== 'object') return ov;
          const filtered = Object.fromEntries(
            Object.entries(ov.rules as Record<string, unknown>).filter(([k]) => !ownRuleKeys.has(k))
          );
          return { ...ov, rules: filtered };
        })
      : acc.overrides;

  return {
    ...acc.rest,
    ...(acc.extendsList.length > 0 ? { extends: acc.extendsList } : {}),
    ...(acc.plugins.length > 0 ? { plugins: acc.plugins } : {}),
    ...(normalizedOverrides.length > 0 ? { overrides: normalizedOverrides } : {}),
    rules: acc.rules
  };
}
