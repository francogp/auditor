/**
 * packages/auditor/src/core/auditConfig.ts
 *
 * UNIFIED AUDIT ENGINE CONFIGURATION (Node.js 26+)
 * Canonical configuration contract, schema defaults, loader, and accessor for the generic auditor.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface AuditPathsConfig {
  readonly srcRoots: readonly string[];
  readonly testRoots: readonly string[];
  readonly e2eRoots: readonly string[];
  readonly integrationRoots: readonly string[];
  readonly migrationsDir: string;
  readonly scriptsRoots: readonly string[];
  readonly codeRoots: readonly string[];
  readonly dataRoots?: readonly string[];
  readonly constantsRoots?: readonly string[];
  readonly ignoreGlobs?: readonly string[];
  readonly ignoredDirs?: readonly string[];
  readonly ignoredPatterns?: readonly string[];
}

export interface AuditPersistenceConfig {
  readonly engine: 'supabase' | 'sqlite' | 'postgres' | 'hybrid' | 'none';
  readonly schemaQualified: boolean;
  readonly authorizedSaveFiles?: readonly string[];
  readonly saveKeyPrefixes?: readonly string[];
  readonly supabaseDir?: string;
  readonly dockerContainer?: string;
}

export interface O1CatalogPatternConfig {
  readonly name: string;
  readonly pattern: string;
  readonly alternative: string;
  readonly definingFile: string;
}

export interface AuditDomainConfig {
  readonly timezoneVariable?: string;
  readonly timezoneHelperModule?: string;
  readonly zLayersFile?: string;
  readonly finiteDomainTypes?: readonly string[];
  readonly infraIdWhitelist?: readonly string[];
  readonly fallbackIdPatterns?: readonly string[];
  readonly o1CatalogPatterns?: readonly O1CatalogPatternConfig[];
}

export interface CustomAuditFamilyConfig {
  readonly key: string;
  readonly title: string;
  readonly order?: number;
  readonly icon?: string;
  readonly description?: string;
}

export interface AuditTemplatesConfig {
  readonly requireInputIds?: boolean;
}

export interface AuditStylesConfig {
  readonly globalUtilityClasses?: readonly string[];
  readonly canonicalButtonVariants?: readonly string[];
  readonly zLayersEnabled?: boolean;
  readonly zLayersScssFile?: string;
}

export interface ChunkBudgetConfig {
  readonly name: string;
  readonly prefix?: string;
  readonly matcher?: string;
  readonly limitBytes: number;
}

export interface AuditBundleConfig {
  readonly enabled?: boolean;
  readonly statsFile?: string;
  readonly distDir?: string;
  readonly exemptChunkPrefixes?: readonly string[];
  readonly maxClientChunkWarnBytes?: number;
  readonly maxClientChunkErrorBytes?: number;
  readonly budgets?: readonly ChunkBudgetConfig[];
  readonly duplicateModuleThresholdBytes?: number;
  readonly topModulesLimit?: number;
}

export interface AuditAgentPluginConfig {
  readonly enabled?: boolean;
}

export interface AuditEngineConfig {
  readonly name: string;
  readonly paths: AuditPathsConfig;
  readonly persistence: AuditPersistenceConfig;
  readonly domain: AuditDomainConfig;
  readonly templates?: AuditTemplatesConfig;
  readonly styles?: AuditStylesConfig;
  readonly bundle?: AuditBundleConfig;
  readonly agentPlugin?: AuditAgentPluginConfig;
  readonly customFamilies?: readonly CustomAuditFamilyConfig[];
  readonly extensions?: readonly string[];
  readonly presets?: Record<string, readonly string[]>;
  readonly _declaredSubsystems?: ReadonlySet<string>;
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends readonly (infer U)[]
    ? readonly U[]
    : T[P] extends object
      ? DeepPartial<T[P]>
      : T[P];
};

export const DEFAULT_AUDIT_CONFIG: AuditEngineConfig = {
  name: 'Generic Project',
  paths: {
    srcRoots: ['src'],
    testRoots: ['tests'],
    e2eRoots: ['tests/e2e'],
    integrationRoots: ['tests/integration'],
    migrationsDir: 'supabase/migrations',
    scriptsRoots: ['scripts'],
    codeRoots: ['src', 'scripts'],
    dataRoots: ['src/data'],
    constantsRoots: ['src/constants'],
    ignoreGlobs: [],
    ignoredDirs: [],
    ignoredPatterns: []
  },
  persistence: {
    engine: 'supabase',
    schemaQualified: true,
    authorizedSaveFiles: [],
    saveKeyPrefixes: [],
    supabaseDir: 'supabase',
    dockerContainer: 'supabase-db'
  },
  domain: {
    timezoneVariable: 'APP_TIMEZONE',
    finiteDomainTypes: [],
    infraIdWhitelist: [],
    fallbackIdPatterns: [],
    o1CatalogPatterns: []
  },
  templates: {
    requireInputIds: false
  },
  styles: {
    globalUtilityClasses: [],
    canonicalButtonVariants: []
  },
  bundle: {
    statsFile: 'scratch/bundle_stats.html',
    distDir: 'dist/assets',
    exemptChunkPrefixes: [],
    maxClientChunkWarnBytes: 1200 * 1024,
    maxClientChunkErrorBytes: 2000 * 1024,
    budgets: [],
    duplicateModuleThresholdBytes: 500 * 1024,
    topModulesLimit: 15
  },
  agentPlugin: {
    enabled: true
  },
  customFamilies: [],
  extensions: [],
  presets: {}
};

let cachedConfig: AuditEngineConfig | null = null;
let cachedProjectRoot: string | null = null;

export function defineAuditConfig(config: DeepPartial<AuditEngineConfig> & { name: string }): AuditEngineConfig {
  const declared = new Set<string>();
  if (config.persistence !== undefined) declared.add('persistence');
  if (config.domain !== undefined) declared.add('domain');
  if (config.styles !== undefined) declared.add('styles');
  if (config.templates !== undefined) declared.add('templates');
  if (config.bundle !== undefined) declared.add('bundle');
  if (config.agentPlugin !== undefined) declared.add('agentPlugin');

  return {
    name: config.name,
    paths: {
      ...DEFAULT_AUDIT_CONFIG.paths,
      ...(config.paths ?? {})
    },
    persistence: {
      ...DEFAULT_AUDIT_CONFIG.persistence,
      ...(config.persistence ?? {})
    },
    domain: {
      ...DEFAULT_AUDIT_CONFIG.domain,
      ...(config.domain ?? {}),
      o1CatalogPatterns: (config.domain?.o1CatalogPatterns as readonly O1CatalogPatternConfig[] | undefined) ?? []
    },
    templates: {
      ...DEFAULT_AUDIT_CONFIG.templates,
      ...(config.templates ?? {})
    },
    styles: {
      globalUtilityClasses: config.styles?.globalUtilityClasses ?? [],
      canonicalButtonVariants: config.styles?.canonicalButtonVariants ?? [],
      zLayersEnabled: config.styles?.zLayersEnabled,
      zLayersScssFile: config.styles?.zLayersScssFile
    },
    bundle: {
      enabled: config.bundle?.enabled,
      statsFile: config.bundle?.statsFile ?? DEFAULT_AUDIT_CONFIG.bundle?.statsFile,
      distDir: config.bundle?.distDir ?? DEFAULT_AUDIT_CONFIG.bundle?.distDir,
      exemptChunkPrefixes: config.bundle?.exemptChunkPrefixes ?? [],
      maxClientChunkWarnBytes: config.bundle?.maxClientChunkWarnBytes ?? DEFAULT_AUDIT_CONFIG.bundle?.maxClientChunkWarnBytes,
      maxClientChunkErrorBytes: config.bundle?.maxClientChunkErrorBytes ?? DEFAULT_AUDIT_CONFIG.bundle?.maxClientChunkErrorBytes,
      budgets: (config.bundle?.budgets as readonly ChunkBudgetConfig[] | undefined) ?? [],
      duplicateModuleThresholdBytes: config.bundle?.duplicateModuleThresholdBytes ?? DEFAULT_AUDIT_CONFIG.bundle?.duplicateModuleThresholdBytes,
      topModulesLimit: config.bundle?.topModulesLimit ?? DEFAULT_AUDIT_CONFIG.bundle?.topModulesLimit
    },
    agentPlugin: {
      enabled: config.agentPlugin?.enabled ?? DEFAULT_AUDIT_CONFIG.agentPlugin?.enabled ?? true
    },
    customFamilies: config.customFamilies ?? [],
    extensions: config.extensions ?? [],
    presets: config.presets ?? {},
    _declaredSubsystems: declared
  };
}

/**
 * Validates that all required subsystems are explicitly declared in audit.config.ts.
 * Enforces the "Mandato de Configuración Explícita y Cero Omisiones Silenciosas".
 */
export function assertAuditConfigComplete(config: AuditEngineConfig): void {
  const missing: string[] = [];

  if (!config._declaredSubsystems?.has('persistence') || !config.persistence?.engine) {
    missing.push("  - 'persistence': Debe declarar explícitamente 'persistence: { engine: \"supabase\" | \"sqlite\" | \"postgres\" | \"hybrid\" | \"none\" }'.");
  }
  if (!config._declaredSubsystems?.has('bundle') || config.bundle?.enabled === undefined) {
    missing.push("  - 'bundle': Debe declarar explícitamente 'bundle: { enabled: true }' (con 'exemptChunkPrefixes' si aplica) o 'bundle: { enabled: false }'.");
  }
  if (!config._declaredSubsystems?.has('styles') || (config.styles?.zLayersEnabled === undefined && !config.styles?.zLayersScssFile && (!config.styles?.globalUtilityClasses || config.styles.globalUtilityClasses.length === 0))) {
    missing.push("  - 'styles': Debe declarar explícitamente 'styles: { zLayersEnabled: true, zLayersScssFile: \"...\" }' o 'styles: { zLayersEnabled: false }'.");
  }
  if (!config._declaredSubsystems?.has('templates') || config.templates?.requireInputIds === undefined) {
    missing.push("  - 'templates': Debe declarar explícitamente 'templates: { requireInputIds: false }' o 'templates: { requireInputIds: true }'.");
  }
  if (!config._declaredSubsystems?.has('agentPlugin') || config.agentPlugin?.enabled === undefined) {
    missing.push("  - 'agentPlugin': Debe declarar explícitamente 'agentPlugin: { enabled: true }' o 'agentPlugin: { enabled: false }'.");
  }

  if (missing.length > 0) {
    throw new Error(
      `[AuditConfig] Configuración obligatoria incompleta en audit.config.ts (Mandato de Configuración Explícita y Cero Omisiones Silenciosas):\n` +
      missing.join('\n') +
      `\n\nTodos los subsistemas deben estar explícitamente configurados (activos o ignorados con enabled: false o engine: 'none').`
    );
  }
}

/**
 * Synchronously loads audit.config.ts or audit.config.json if possible, or falls back to defaults.
 */
export async function loadAuditConfig(projectRoot: string = process.cwd()): Promise<AuditEngineConfig> {
  if (cachedConfig && cachedProjectRoot === projectRoot) return cachedConfig;

  const configPath = path.resolve(projectRoot, 'audit.config.ts');
  const jsonConfigPath = path.resolve(projectRoot, 'audit.config.json');

  if (fs.existsSync(configPath)) {
    try {
      const fileUrl = pathToFileURL(configPath).href;
      const mod = (await import(fileUrl)) as { default?: AuditEngineConfig | DeepPartial<AuditEngineConfig> };
      if (mod.default) {
        cachedConfig = defineAuditConfig(mod.default as DeepPartial<AuditEngineConfig> & { name: string });
        cachedProjectRoot = projectRoot;
        return cachedConfig;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AuditConfig] Warning: Failed to load audit.config.ts: ${msg}. Using defaults.`);
    }
  } else if (fs.existsSync(jsonConfigPath)) {
    try {
      const content = fs.readFileSync(jsonConfigPath, 'utf-8');
      const parsed = JSON.parse(content) as DeepPartial<AuditEngineConfig> & { name: string };
      cachedConfig = defineAuditConfig(parsed);
      cachedProjectRoot = projectRoot;
      return cachedConfig;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AuditConfig] Warning: Failed to load audit.config.json: ${msg}. Using defaults.`);
    }
  }

  cachedConfig = DEFAULT_AUDIT_CONFIG;
  cachedProjectRoot = projectRoot;
  return cachedConfig;
}

/**
 * Returns current configuration or default if not yet loaded.
 */
export function getAuditConfig(): AuditEngineConfig {
  return cachedConfig ?? DEFAULT_AUDIT_CONFIG;
}

/**
 * For testing purposes: resets the cached config.
 */
export function resetAuditConfig(): void {
  cachedConfig = null;
  cachedProjectRoot = null;
}

/**
 * Determines whether a file path belongs to a test, spec, mock, or e2e directory
 * driven dynamically by the project's audit.config.ts configuration.
 */
export function isTestPath(filePath: string): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const base = norm.split('/').pop() || '';

  if (base.includes('.test.') || base.includes('.spec.')) {
    return true;
  }

  const config = getAuditConfig();
  const configuredRoots = [
    ...(config.paths.testRoots ?? []),
    ...(config.paths.e2eRoots ?? []),
    ...(config.paths.integrationRoots ?? [])
  ];

  for (const root of configuredRoots) {
    const cleanRoot = root.replace(/^\/+|\/+$/g, '').toLowerCase();
    if (cleanRoot && (norm === cleanRoot || norm.startsWith(cleanRoot + '/') || norm.includes('/' + cleanRoot + '/'))) {
      return true;
    }
  }

  if (configuredRoots.length === 0 && (norm.startsWith('tests/') || norm.includes('/tests/'))) {
    return true;
  }

  return false;
}

/**
 * Determines whether a file path belongs to a data catalog directory (e.g. static game data,
 * catalogs, domain fixtures) configured in paths.dataRoots.
 */
export function isDataPath(filePath: string): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const config = getAuditConfig();
  const dataRoots = config?.paths?.dataRoots ?? ['src/data'];

  for (const root of dataRoots) {
    const cleanRoot = root.replace(/^\/+|\/+$/g, '').toLowerCase();
    if (cleanRoot && (norm === cleanRoot || norm.startsWith(cleanRoot + '/') || norm.includes('/' + cleanRoot + '/'))) {
      return true;
    }
  }

  return false;
}

/**
 * Determines whether a file path belongs to a constants definition directory or module
 * configured in paths.constantsRoots or located within a /constants/ directory.
 */
export function isConstantsPath(filePath: string): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  if (norm.includes('/constants/') || norm.startsWith('constants/')) {
    return true;
  }

  const config = getAuditConfig();
  const constantsRoots = config?.paths?.constantsRoots ?? ['src/constants'];

  for (const root of constantsRoots) {
    const cleanRoot = root.replace(/^\/+|\/+$/g, '').toLowerCase();
    if (cleanRoot && (norm === cleanRoot || norm.startsWith(cleanRoot + '/') || norm.includes('/' + cleanRoot + '/'))) {
      return true;
    }
  }

  return false;
}
