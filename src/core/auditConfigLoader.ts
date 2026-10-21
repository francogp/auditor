/**
 * packages/auditor/src/core/auditConfigLoader.ts
 *
 * Config loader, in-memory cache, and child process environment serialization.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type AuditEngineConfig,
  type DeepPartial,
  AUDIT_CONFIG_FILE,
  AUDIT_CONFIG_JSON_FILE
} from './auditConfigTypes.ts';
import { assertNoLegacyRootConfig } from './auditConfigValidators.ts';
import { DEFAULT_AUDIT_CONFIG } from './auditConfigDefaults.ts';
import { defineAuditConfig } from './auditConfigBuilders.ts';

export const MAX_INLINE_ENV_CONFIG_CHARS = 16384;

export function sanitizePath(inputPath: string): string {
  if (!inputPath || typeof inputPath !== 'string') return '';
  return path.normalize(inputPath.trim());
}

let cachedConfig: AuditEngineConfig | null = null;
let cachedProjectRoot: string | null = null;
const configCache = new Map<string, AuditEngineConfig>();

export function tryLoadJsonConfig(
  jsonConfigPath: string,
  projectRoot: string,
  logWarning: boolean = false
): AuditEngineConfig | null {
  if (!fs.existsSync(jsonConfigPath)) return null;
  try {
    const content = fs.readFileSync(jsonConfigPath, 'utf-8');
    const parsed = JSON.parse(content) as DeepPartial<AuditEngineConfig> & { name: string };
    const config = defineAuditConfig(parsed);
    const resolvedRoot = path.resolve(projectRoot);
    configCache.set(resolvedRoot, config);
    cachedConfig = config;
    cachedProjectRoot = resolvedRoot;
    return config;
  } catch (err: unknown) {
    if (logWarning) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[AuditConfig] Failed to load ${AUDIT_CONFIG_JSON_FILE}: ${msg}`, {
        cause: err
      });
    }
    return null;
  }
}

export function serializeAuditConfigToEnv(
  config: AuditEngineConfig,
  projectRoot: string = process.cwd()
): void {
  try {
    process.env.AUDIT_ACTIVE_CONFIG_ROOT = projectRoot;
    const serialized = JSON.stringify(config, (_key, value) => {
      if (value instanceof Set) {
        return Array.from(value);
      }
      return value;
    });

    try {
      const cacheDir = path.resolve(projectRoot, 'scratch', 'cache');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      const ephemeralConfigFile = path.resolve(cacheDir, `active_audit_config_${process.pid}.json`);
      fs.writeFileSync(ephemeralConfigFile, serialized, 'utf-8');
      process.env.AUDIT_ACTIVE_CONFIG_FILE = ephemeralConfigFile;
    } catch {
      // catch-ok: Fallback to process.env.AUDIT_CONFIG_DATA if scratch directory is read-only
    }

    if (serialized.length < MAX_INLINE_ENV_CONFIG_CHARS) {
      process.env.AUDIT_CONFIG_DATA = serialized;
    }
  } catch {
    // catch-ok: Configuration serialization failure should not crash execution
  }
}

export function tryLoadConfigFromEnv(projectRoot: string): AuditEngineConfig | null {
  const activeRoot = process.env.AUDIT_ACTIVE_CONFIG_ROOT || process.cwd();
  if (path.resolve(projectRoot) !== path.resolve(activeRoot)) {
    return null;
  }

  const rawEnvFile = process.env.AUDIT_ACTIVE_CONFIG_FILE;
  if (rawEnvFile) {
    const envFilePath = sanitizePath(rawEnvFile);
    if (fs.existsSync(envFilePath)) {
      try {
        const content = fs.readFileSync(envFilePath, 'utf-8');
        const parsed = JSON.parse(content) as DeepPartial<AuditEngineConfig> & { name: string };
        cachedConfig = defineAuditConfig(parsed);
        cachedProjectRoot = projectRoot;
        return cachedConfig;
      } catch {
        // catch-ok: Fall back to inline env variable on file read or parse failure
      }
    }
  }

  const rawData = process.env.AUDIT_CONFIG_DATA;
  if (rawData) {
    try {
      const parsed = JSON.parse(rawData) as DeepPartial<AuditEngineConfig> & { name: string };
      cachedConfig = defineAuditConfig(parsed);
      cachedProjectRoot = projectRoot;
      return cachedConfig;
    } catch {
      // catch-ok: Fall back on JSON parse error
    }
  }

  return null;
}

let dynamicImportCounter: number = 0; // singleton-ok: Singleton instance state container

function resolveCurrentAuditorEntryUrl(): string | null {
  try {
    const isTs = import.meta.url.endsWith('.ts');
    const auditorRoot = path.resolve(import.meta.dirname, '..', '..');
    const entryFile = isTs
      ? path.resolve(auditorRoot, 'src', 'index.ts')
      : path.resolve(auditorRoot, 'dist', 'index.js');
    if (fs.existsSync(entryFile)) {
      return pathToFileURL(entryFile).href;
    }
  } catch {
    // catch-ok: Fallback when entry cannot be resolved
  }
  return null;
}

export interface ResolvedConfigModuleUrl {
  readonly importUrl: string;
  readonly cleanupFilePath: string | null;
}

export function resolveConfigModuleUrl(
  configPath: string,
  projectRoot: string
): ResolvedConfigModuleUrl {
  const auditorRoot = path.resolve(import.meta.dirname, '..', '..');
  const isInstalledInNodeModules = auditorRoot.split(path.sep).includes('node_modules');
  const isRemoteProject =
    !isInstalledInNodeModules && path.resolve(projectRoot) !== auditorRoot;
  const auditorEntryUrl = resolveCurrentAuditorEntryUrl();

  if (isRemoteProject && auditorEntryUrl) {
    try {
      const rawContent = fs.readFileSync(configPath, 'utf-8');
      if (rawContent.includes('@francogp/auditor')) {
        const rewritten = rawContent
          .replace(/from\s+['"]@francogp\/auditor['"]/g, `from '${auditorEntryUrl}'`)
          .replace(
            /import\s*\(\s*['"]@francogp\/auditor['"]\s*\)/g,
            `import('${auditorEntryUrl}')`
          );
        const scratchDir = path.resolve(auditorRoot, 'scratch');
        if (!fs.existsSync(scratchDir)) {
          fs.mkdirSync(scratchDir, { recursive: true });
        }
        const tempFilePath = path.resolve(
          scratchDir,
          `remote_config_${Date.now()}_${++dynamicImportCounter}.ts`
        );
        fs.writeFileSync(tempFilePath, rewritten, 'utf-8');
        const tempUrl = pathToFileURL(tempFilePath);
        tempUrl.searchParams.set('t', `${performance.now()}_${dynamicImportCounter}`);
        return { importUrl: tempUrl.href, cleanupFilePath: tempFilePath };
      }
    } catch {
      // catch-ok: Fall back to direct fileUrl
    }
  }

  const fileUrl = pathToFileURL(configPath);
  fileUrl.searchParams.set('t', `${performance.now()}_${++dynamicImportCounter}`);
  return { importUrl: fileUrl.href, cleanupFilePath: null };
}

export async function loadAuditConfig(
  projectRoot: string = process.cwd()
): Promise<AuditEngineConfig> {
  if (cachedConfig && cachedProjectRoot === projectRoot) return cachedConfig;

  if (
    process.env.AUDIT_SUBPROCESS === 'true' ||
    process.env.AUDIT_ACTIVE_CONFIG_FILE ||
    process.env.AUDIT_CONFIG_DATA
  ) {
    const envConfig = tryLoadConfigFromEnv(projectRoot);
    if (envConfig) return envConfig;
  }

  assertNoLegacyRootConfig(projectRoot);
  const customConfig = process.env.AUDIT_CONFIG;
  const configPath = path.resolve(projectRoot, customConfig ?? AUDIT_CONFIG_FILE);
  const jsonConfigPath = path.resolve(projectRoot, AUDIT_CONFIG_JSON_FILE);

  if (fs.existsSync(configPath)) {
    const { importUrl, cleanupFilePath } = resolveConfigModuleUrl(configPath, projectRoot);

    try {
      const mod = (await import(importUrl)) as {
        default?: AuditEngineConfig | DeepPartial<AuditEngineConfig>;
      };
      if (!mod.default) {
        throw new Error(
          `[AuditConfig] ${path.relative(projectRoot, configPath)} must default-export defineAuditConfig({...}).`
        );
      }
      cachedConfig = defineAuditConfig(
        mod.default as DeepPartial<AuditEngineConfig> & { name: string }
      );
      const resolvedRoot = path.resolve(projectRoot);
      configCache.set(resolvedRoot, cachedConfig);
      cachedProjectRoot = resolvedRoot;
      serializeAuditConfigToEnv(cachedConfig, projectRoot);
      return cachedConfig;
    } finally {
      if (cleanupFilePath && fs.existsSync(cleanupFilePath)) {
        try {
          fs.unlinkSync(cleanupFilePath);
        } catch {
          // catch-ok: ephemeral file cleanup
        }
      }
    }
  }

  const loaded = tryLoadJsonConfig(jsonConfigPath, projectRoot, true);
  if (loaded) {
    serializeAuditConfigToEnv(loaded, projectRoot);
    return loaded;
  }

  cachedConfig = DEFAULT_AUDIT_CONFIG;
  const resolvedRoot = path.resolve(projectRoot);
  configCache.set(resolvedRoot, cachedConfig);
  cachedProjectRoot = resolvedRoot;
  return cachedConfig;
}

export function getAuditConfig(projectRoot: string = process.cwd()): AuditEngineConfig {
  const resolvedRoot = path.resolve(projectRoot);
  const fromCache = configCache.get(resolvedRoot);
  if (fromCache) {
    return fromCache;
  }
  if (cachedConfig && cachedProjectRoot && path.resolve(cachedProjectRoot) === resolvedRoot) {
    return cachedConfig;
  }

  const envConfig = tryLoadConfigFromEnv(projectRoot);
  if (envConfig) {
    configCache.set(resolvedRoot, envConfig);
    return envConfig;
  }

  const jsonConfigPath = path.resolve(projectRoot, AUDIT_CONFIG_JSON_FILE);
  const loaded = tryLoadJsonConfig(jsonConfigPath, projectRoot, false);
  if (loaded) {
    configCache.set(resolvedRoot, loaded);
    return loaded;
  }

  return cachedConfig ?? DEFAULT_AUDIT_CONFIG;
}

export function setAuditConfig(
  config: AuditEngineConfig,
  projectRoot: string = process.cwd()
): void {
  const resolvedRoot = path.resolve(projectRoot);
  configCache.set(resolvedRoot, config);
  cachedConfig = config;
  cachedProjectRoot = resolvedRoot;
  serializeAuditConfigToEnv(config, projectRoot);
}

export function resetAuditConfig(): void {
  configCache.clear();
  cachedConfig = null;
  cachedProjectRoot = null;
  const rawEnvFile = process.env.AUDIT_ACTIVE_CONFIG_FILE;
  if (rawEnvFile) {
    const cleanEnvFile = sanitizePath(rawEnvFile);
    if (fs.existsSync(cleanEnvFile)) {
      try {
        fs.unlinkSync(cleanEnvFile);
      } catch {
        // catch-ok: Best effort cleanup
      }
    }
  }
  delete process.env.AUDIT_CONFIG_DATA;
  delete process.env.AUDIT_ACTIVE_CONFIG_FILE;
  delete process.env.AUDIT_ACTIVE_CONFIG_ROOT;
}
