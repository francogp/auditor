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
  readonly cliRoots?: readonly string[];
  readonly dataRoots?: readonly string[];
  readonly constantsRoots?: readonly string[];
  readonly componentsRoots?: readonly string[];
  readonly viewsRoots?: readonly string[];
  readonly storesRoots?: readonly string[];
  readonly composablesRoots?: readonly string[];
  readonly typesRoots?: readonly string[];
  readonly stylesRoots?: readonly string[];
  readonly logicRoots?: readonly string[];
  readonly exemptFiles?: readonly string[];
  readonly includeTestsInCodeAudit?: boolean;
  readonly minTestFileLines?: number;
  readonly ignoreGlobs?: readonly string[];
  readonly ignoredDirs?: readonly string[];
  readonly ignoredPatterns?: readonly string[];
  readonly testFilePatterns?: readonly string[];
  readonly testFragmentationWhitelist?: readonly string[];
}

export interface AuditPersistenceConfig {
  readonly engine: 'supabase' | 'sqlite' | 'postgres' | 'hybrid' | 'none';
  readonly schemaQualified: boolean;
  readonly authorizedSaveFiles?: readonly string[];
  readonly saveKeyPrefixes?: readonly string[];
  readonly forbiddenMockModules?: readonly string[];
  readonly positionalArrayColumns?: readonly string[];
  readonly allowedDatabaseDirs?: readonly string[];
  readonly allowedDatabaseFiles?: readonly string[];
  readonly supabaseDir?: string;
  readonly dockerContainer?: string;
  readonly allowedHosts?: readonly string[];
  readonly prohibitedTemplateIdentifiers?: readonly string[];
}

export interface O1CatalogPatternConfig {
  readonly name: string;
  readonly pattern: string;
  readonly alternative: string;
  readonly definingFile: string;
}

export interface AuditDomainConfig {
  readonly enabled?: boolean;
  readonly timezoneVariable?: string;
  readonly timezoneHelperModule?: string;
  readonly loggerModule?: string;
  readonly zLayersFile?: string;
  readonly finiteDomainTypes?: readonly string[];
  readonly infraIdWhitelist?: readonly string[];
  readonly fallbackIdPatterns?: readonly string[];
  readonly o1CatalogPatterns?: readonly O1CatalogPatternConfig[];
  readonly caseNormalizationExemptTokens?: readonly string[];
  readonly allowedStoreSetterPrefixes?: readonly string[];
  readonly allowedNumericConstantPrefixes?: readonly string[];
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
  readonly tooltipComponents?: readonly string[];
  readonly forbiddenTemplateCallPatterns?: readonly string[];
  readonly safeTemplateFunctions?: readonly string[];
}

export interface AuditStylesConfig {
  readonly globalUtilityClasses?: readonly string[];
  readonly canonicalButtonVariants?: readonly string[];
  readonly zLayersEnabled?: boolean;
  readonly zLayersScssFile?: string;
  readonly baseScssFile?: string;
  readonly zLayersTsFile?: string;
  readonly zLayers?: Record<string, number>;
  readonly lineHeightOverlapCheck?: boolean;
  readonly heavyEffectPaths?: readonly string[];
  readonly buttonGovernance?: {
    readonly enabled: boolean;
    readonly buttonsScssFile?: string;
    readonly canonicalVariants?: readonly string[];
  };
}

export interface AuditE2eConfig {
  readonly idLocatorsOnly?: boolean;
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
  readonly forbiddenUiImports?: readonly { readonly module: string; readonly reason: string }[];
}

export interface AuditAgentPluginConfig {
  readonly enabled?: boolean;
}

export interface AuditAnimationConfig {
  readonly customTimerFunctions?: readonly string[];
}

export interface AuditConstantsConfig {
  readonly ignoredNames?: readonly string[];
  readonly exemptMagicNumbers?: readonly number[];
  readonly allowedNumericPrefixes?: readonly string[];
}

export interface AuditSecurityConfig {
  readonly enabled?: boolean;
}

export interface AuditDocumentationConfig {
  readonly knownValidAbstractPaths?: readonly string[];
}

export interface AuditPiniaConfig {
  readonly authorizedMutationFiles?: readonly string[];
}

export interface AuditFallowSimilarCodeConfig {
  readonly enabled?: boolean;
  readonly threshold?: number;
  readonly ignoreSameFile?: boolean;
  readonly minLines?: number;
}

export interface AuditFallowConfig {
  readonly enabled?: boolean;
  readonly security?: AuditSecurityConfig;
  readonly enforceTargets?: boolean;
  readonly maxTargetPriority?: 'critical' | 'high' | 'all';
  readonly similarCode?: AuditFallowSimilarCodeConfig;
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
  readonly animation?: AuditAnimationConfig;
  readonly constants?: AuditConstantsConfig;
  readonly security?: AuditSecurityConfig;
  readonly documentation?: AuditDocumentationConfig;
  readonly pinia?: AuditPiniaConfig;
  readonly fallow?: AuditFallowConfig;
  readonly e2e?: AuditE2eConfig;
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
    cliRoots: ['src/cli'],
    dataRoots: ['src/data'],
    constantsRoots: ['src/constants'],
    componentsRoots: ['src/components'],
    viewsRoots: ['src/views'],
    storesRoots: ['src/stores'],
    composablesRoots: ['src/composables'],
    typesRoots: ['src/types'],
    stylesRoots: ['src/styles'],
    logicRoots: ['src/logic'],
    exemptFiles: [],
    includeTestsInCodeAudit: false,
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
    o1CatalogPatterns: [],
    allowedNumericConstantPrefixes: [
      'GEN_', 'ISO_', 'UTF_8', 'BASE_64', 'RGB_', 'RGBA_', 'WASM_', 'HTML_5', 'CSS_3', 'HTTP_', 'D3_'
    ]
  },
  templates: {
    requireInputIds: false
  },
  styles: {
    globalUtilityClasses: [],
    canonicalButtonVariants: [],
    heavyEffectPaths: []
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
  security: {
    enabled: true
  },
  fallow: {
    enabled: true,
    security: {
      enabled: true
    },
    enforceTargets: false,
    maxTargetPriority: 'critical',
    similarCode: {
      enabled: false,
      threshold: 0.95,
      ignoreSameFile: true,
      minLines: 3
    }
  },
  constants: {
    ignoredNames: [],
    exemptMagicNumbers: [],
    allowedNumericPrefixes: []
  },
  customFamilies: [],
  extensions: [],
  presets: {}
};

let cachedConfig: AuditEngineConfig | null = null;
let cachedProjectRoot: string | null = null;

function collectDeclaredSubsystems(config: DeepPartial<AuditEngineConfig>): Set<string> {
  const declared = new Set<string>();
  const keys = ['persistence', 'domain', 'styles', 'templates', 'bundle', 'agentPlugin', 'security', 'fallow'] as const;
  for (const k of keys) {
    if (config[k] !== undefined) declared.add(k);
  }
  return declared;
}

function buildPathsConfig(raw?: DeepPartial<AuditEngineConfig['paths']>): AuditEngineConfig['paths'] {
  const p = raw ?? {};
  return {
    ...DEFAULT_AUDIT_CONFIG.paths,
    ...p,
    cliRoots: p.cliRoots ?? DEFAULT_AUDIT_CONFIG.paths.cliRoots,
    testFilePatterns: p.testFilePatterns ?? [],
    testFragmentationWhitelist: p.testFragmentationWhitelist ?? []
  };
}

function buildPersistenceConfig(raw?: DeepPartial<AuditPersistenceConfig>): AuditPersistenceConfig {
  const p = raw ?? {};
  return {
    ...DEFAULT_AUDIT_CONFIG.persistence,
    ...p,
    forbiddenMockModules: p.forbiddenMockModules ?? [],
    positionalArrayColumns: p.positionalArrayColumns ?? [],
    allowedDatabaseDirs: p.allowedDatabaseDirs ?? [],
    allowedDatabaseFiles: p.allowedDatabaseFiles ?? [],
    allowedHosts: p.allowedHosts ?? ['localhost', '127.0.0.1'],
    prohibitedTemplateIdentifiers: p.prohibitedTemplateIdentifiers ?? []
  };
}

function buildDomainConfig(raw?: DeepPartial<AuditDomainConfig>): AuditDomainConfig {
  const d = raw ?? {};
  return {
    ...DEFAULT_AUDIT_CONFIG.domain,
    ...d,
    enabled: d.enabled ?? true,
    o1CatalogPatterns: (d.o1CatalogPatterns as readonly O1CatalogPatternConfig[] | undefined) ?? [],
    caseNormalizationExemptTokens: d.caseNormalizationExemptTokens ?? [],
    allowedStoreSetterPrefixes: d.allowedStoreSetterPrefixes ?? ['set', 'update', 'clear'],
    allowedNumericConstantPrefixes: d.allowedNumericConstantPrefixes ?? DEFAULT_AUDIT_CONFIG.domain?.allowedNumericConstantPrefixes ?? []
  };
}

function buildTemplatesConfig(raw?: DeepPartial<AuditTemplatesConfig>): AuditTemplatesConfig {
  const t = raw ?? {};
  return {
    ...DEFAULT_AUDIT_CONFIG.templates,
    ...t,
    tooltipComponents: t.tooltipComponents ?? [],
    forbiddenTemplateCallPatterns: t.forbiddenTemplateCallPatterns ?? [],
    safeTemplateFunctions: t.safeTemplateFunctions ?? []
  };
}

function buildStylesConfig(raw?: DeepPartial<AuditStylesConfig>): AuditStylesConfig {
  const s = raw ?? {};
  return {
    globalUtilityClasses: s.globalUtilityClasses ?? [],
    canonicalButtonVariants: s.canonicalButtonVariants ?? [],
    zLayersEnabled: s.zLayersEnabled,
    zLayersScssFile: s.zLayersScssFile,
    baseScssFile: s.baseScssFile ?? s.zLayersScssFile,
    zLayersTsFile: s.zLayersTsFile,
    zLayers: s.zLayers,
    lineHeightOverlapCheck: s.lineHeightOverlapCheck ?? true,
    heavyEffectPaths: s.heavyEffectPaths ?? [],
    buttonGovernance: s.buttonGovernance
  };
}

function buildBundleConfig(raw?: DeepPartial<AuditBundleConfig>): AuditBundleConfig {
  const b = raw ?? {};
  return {
    enabled: b.enabled,
    statsFile: b.statsFile ?? DEFAULT_AUDIT_CONFIG.bundle?.statsFile,
    distDir: b.distDir ?? DEFAULT_AUDIT_CONFIG.bundle?.distDir,
    exemptChunkPrefixes: b.exemptChunkPrefixes ?? [],
    maxClientChunkWarnBytes: b.maxClientChunkWarnBytes ?? DEFAULT_AUDIT_CONFIG.bundle?.maxClientChunkWarnBytes,
    maxClientChunkErrorBytes: b.maxClientChunkErrorBytes ?? DEFAULT_AUDIT_CONFIG.bundle?.maxClientChunkErrorBytes,
    budgets: (b.budgets as readonly ChunkBudgetConfig[] | undefined) ?? [],
    duplicateModuleThresholdBytes: b.duplicateModuleThresholdBytes ?? DEFAULT_AUDIT_CONFIG.bundle?.duplicateModuleThresholdBytes,
    topModulesLimit: b.topModulesLimit ?? DEFAULT_AUDIT_CONFIG.bundle?.topModulesLimit,
    forbiddenUiImports: (b.forbiddenUiImports as readonly { readonly module: string; readonly reason: string }[] | undefined) ?? []
  };
}

function buildAgentAndSecurityConfig(config: DeepPartial<AuditEngineConfig>): {
  agentPlugin: AuditAgentPluginConfig;
  security: AuditSecurityConfig;
  animation: AuditAnimationConfig;
} {
  const secEnabled = config.fallow?.security?.enabled ?? config.security?.enabled ?? DEFAULT_AUDIT_CONFIG.security?.enabled ?? true;
  return {
    agentPlugin: {
      enabled: config.agentPlugin?.enabled ?? DEFAULT_AUDIT_CONFIG.agentPlugin?.enabled ?? true
    },
    security: {
      enabled: secEnabled
    },
    animation: {
      customTimerFunctions: config.animation?.customTimerFunctions ?? []
    }
  };
}

function buildConstantsAndDocConfig(config: DeepPartial<AuditEngineConfig>): {
  constants: AuditConstantsConfig;
  documentation: AuditDocumentationConfig;
  pinia: AuditPiniaConfig;
  e2e: AuditE2eConfig;
} {
  const c = config.constants;
  return {
    constants: {
      ignoredNames: c?.ignoredNames ?? [],
      exemptMagicNumbers: c?.exemptMagicNumbers ?? [],
      allowedNumericPrefixes: c?.allowedNumericPrefixes ?? []
    },
    documentation: {
      knownValidAbstractPaths: config.documentation?.knownValidAbstractPaths ?? []
    },
    pinia: {
      authorizedMutationFiles: config.pinia?.authorizedMutationFiles ?? []
    },
    e2e: {
      idLocatorsOnly: config.e2e?.idLocatorsOnly ?? false
    }
  };
}

function buildFallowSimilarCodeConfig(
  raw?: DeepPartial<AuditFallowSimilarCodeConfig>
): AuditFallowSimilarCodeConfig {
  const def = DEFAULT_AUDIT_CONFIG.fallow?.similarCode;
  const s = raw ?? {};
  return {
    enabled: s.enabled ?? def?.enabled ?? false,
    threshold: s.threshold ?? def?.threshold ?? 0.95,
    ignoreSameFile: s.ignoreSameFile ?? def?.ignoreSameFile ?? true,
    minLines: s.minLines ?? def?.minLines ?? 3
  };
}

function buildFallowConfig(
  raw?: DeepPartial<AuditFallowConfig>,
  rootSecurity?: DeepPartial<AuditSecurityConfig>
): AuditFallowConfig {
  const def = DEFAULT_AUDIT_CONFIG.fallow;
  const f = raw ?? {};
  const secEnabled = f.security?.enabled ?? rootSecurity?.enabled ?? def?.security?.enabled ?? true;
  return {
    enabled: f.enabled ?? def?.enabled ?? true,
    security: {
      enabled: secEnabled
    },
    enforceTargets: f.enforceTargets ?? def?.enforceTargets ?? false,
    maxTargetPriority: f.maxTargetPriority ?? def?.maxTargetPriority ?? 'critical',
    similarCode: buildFallowSimilarCodeConfig(f.similarCode)
  };
}

export function defineAuditConfig(config: DeepPartial<AuditEngineConfig> & { name: string }): AuditEngineConfig {
  const declared = collectDeclaredSubsystems(config);
  const agentAndSecurity = buildAgentAndSecurityConfig(config);
  const constantsAndDoc = buildConstantsAndDocConfig(config);

  return {
    name: config.name,
    paths: buildPathsConfig(config.paths),
    persistence: buildPersistenceConfig(config.persistence),
    domain: buildDomainConfig(config.domain),
    templates: buildTemplatesConfig(config.templates),
    styles: buildStylesConfig(config.styles),
    bundle: buildBundleConfig(config.bundle),
    fallow: buildFallowConfig(config.fallow, config.security),
    ...agentAndSecurity,
    ...constantsAndDoc,
    customFamilies: config.customFamilies ?? [],
    extensions: config.extensions ?? [],
    presets: config.presets ?? {},
    _declaredSubsystems: declared
  };
}

function checkInfrastructureSubsystems(
  declared: ReadonlySet<string> | undefined,
  config: AuditEngineConfig,
  missing: string[]
): void {
  if (!declared?.has('persistence') || !config.persistence?.engine) {
    missing.push("  - 'persistence': Debe declarar explícitamente 'persistence: { engine: \"supabase\" | \"sqlite\" | \"postgres\" | \"hybrid\" | \"none\" }'.");
  }
  if (!declared?.has('bundle') || config.bundle?.enabled === undefined) {
    missing.push("  - 'bundle': Debe declarar explícitamente 'bundle: { enabled: true }' (con 'exemptChunkPrefixes' si aplica) o 'bundle: { enabled: false }'.");
  }
}

function checkUiSubsystems(
  declared: ReadonlySet<string> | undefined,
  config: AuditEngineConfig,
  missing: string[]
): void {
  const s = config.styles;
  const hasZStyles = s?.zLayersEnabled !== undefined || s?.zLayersScssFile || (s?.globalUtilityClasses && s.globalUtilityClasses.length > 0);
  if (!declared?.has('styles') || !hasZStyles) {
    missing.push("  - 'styles': Debe declarar explícitamente 'styles: { zLayersEnabled: true, zLayersScssFile: \"...\" }' o 'styles: { zLayersEnabled: false }'.");
  }
  if (!declared?.has('templates') || config.templates?.requireInputIds === undefined) {
    missing.push("  - 'templates': Debe declarar explícitamente 'templates: { requireInputIds: false }' o 'templates: { requireInputIds: true }'.");
  }
  if (!declared?.has('agentPlugin') || config.agentPlugin?.enabled === undefined) {
    missing.push("  - 'agentPlugin': Debe declarar explícitamente 'agentPlugin: { enabled: true }' o 'agentPlugin: { enabled: false }'.");
  }
}

function checkSubsystemDeclarations(config: AuditEngineConfig): string[] {
  const declared = config._declaredSubsystems;
  const missing: string[] = [];
  checkInfrastructureSubsystems(declared, config, missing);
  checkUiSubsystems(declared, config, missing);
  return missing;
}

/**
 * Validates that all required subsystems are explicitly declared in audit.config.ts.
 * Enforces the "Mandato de Configuración Explícita y Cero Omisiones Silenciosas".
 */
export function assertAuditConfigComplete(config: AuditEngineConfig): void {
  const missing = checkSubsystemDeclarations(config);

  if (missing.length > 0) {
    throw new Error(
      `[AuditConfig] Configuración obligatoria incompleta en audit.config.ts (Mandato de Configuración Explícita y Cero Omisiones Silenciosas):\n` +
      missing.join('\n') +
      `\n\nTodos los subsistemas deben estar explícitamente configurados (activos o ignorados con enabled: false o engine: 'none').`
    );
  }
}

function tryLoadJsonConfig(
  jsonConfigPath: string,
  projectRoot: string,
  logWarning: boolean = false
): AuditEngineConfig | null {
  if (!fs.existsSync(jsonConfigPath)) return null;
  try {
    const content = fs.readFileSync(jsonConfigPath, 'utf-8');
    const parsed = JSON.parse(content) as DeepPartial<AuditEngineConfig> & { name: string };
    cachedConfig = defineAuditConfig(parsed);
    cachedProjectRoot = projectRoot;
    return cachedConfig;
  } catch (err: unknown) {
    if (logWarning) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AuditConfig] Warning: Failed to load audit.config.json: ${msg}. Using defaults.`);
    }
    return null;
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
  } else {
    const loaded = tryLoadJsonConfig(jsonConfigPath, projectRoot, true);
    if (loaded) return loaded;
  }

  cachedConfig = DEFAULT_AUDIT_CONFIG;
  cachedProjectRoot = projectRoot;
  return cachedConfig;
}

/**
 * Returns current configuration or default if not yet loaded.
 */
export function getAuditConfig(projectRoot: string = process.cwd()): AuditEngineConfig {
  if (cachedConfig && (!cachedProjectRoot || cachedProjectRoot === projectRoot)) {
    return cachedConfig;
  }

  const jsonConfigPath = path.resolve(projectRoot, 'audit.config.json');
  const loaded = tryLoadJsonConfig(jsonConfigPath, projectRoot, false);
  if (loaded) return loaded;

  return cachedConfig ?? DEFAULT_AUDIT_CONFIG;
}

/**
 * Manually sets the active configuration in memory (useful for tests or custom runners).
 */
export function setAuditConfig(config: AuditEngineConfig, projectRoot: string = process.cwd()): void {
  cachedConfig = config;
  cachedProjectRoot = projectRoot;
}

/**
 * For testing purposes: resets the cached config.
 */
export function resetAuditConfig(): void {
  cachedConfig = null;
  cachedProjectRoot = null;
}

/**
 * Helper to check if a normalized path matches any of the given root directories.
 */
export function matchesAnyRoot(normalizedPath: string, roots: readonly string[]): boolean {
  if (!normalizedPath || !roots || roots.length === 0) return false;
  return roots.some(root => {
    const cleanRoot = root.replace(/^\/+|\/+$/g, '').toLowerCase();
    return cleanRoot !== '' && (
      normalizedPath === cleanRoot ||
      normalizedPath.startsWith(cleanRoot + '/') ||
      normalizedPath.includes('/' + cleanRoot + '/')
    );
  });
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
  const customTestPatterns = config?.paths?.testFilePatterns ?? [];
  if (customTestPatterns.some(pat => base.includes(pat.toLowerCase()))) {
    return true;
  }

  const configuredRoots = [
    ...(config.paths.testRoots ?? []),
    ...(config.paths.e2eRoots ?? []),
    ...(config.paths.integrationRoots ?? [])
  ];

  if (matchesAnyRoot(norm, configuredRoots)) {
    return true;
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

  return matchesAnyRoot(norm, dataRoots);
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

  return matchesAnyRoot(norm, constantsRoots);
}

/**
 * Checks whether a file path belongs to an explicitly exempt file in paths.exemptFiles.
 */
export function isExemptFile(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const exemptFiles = config?.paths?.exemptFiles ?? [];
  return exemptFiles.some(f => {
    const clean = f.replace(/^\/+|\/+$/g, '').toLowerCase();
    return norm === clean || norm.endsWith('/' + clean);
  });
}

/**
 * Determines whether a file path belongs to codeRoots configured for general code audits,
 * dynamically respecting whether test directories are included or excluded.
 */
export function isInCodeRoots(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  if (norm.includes('node_modules')) return false;

  const codeRoots = config?.paths?.codeRoots ?? ['src', 'scripts'];
  if (!matchesAnyRoot(norm, codeRoots)) return false;

  // When includeTestsInCodeAudit is true, or codeRoots explicitly includes a testRoot, tests ARE audited!
  const includesTests = config?.paths?.includeTestsInCodeAudit === true ||
    (config?.paths?.testRoots ?? []).some(tr => codeRoots.includes(tr));

  if (!includesTests && isTestPath(filePath)) {
    return false;
  }

  return true;
}

/**
 * Checks whether a file path belongs to scriptsRoots.
 */
export function isScriptPath(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const scriptsRoots = config?.paths?.scriptsRoots ?? ['scripts'];
  return matchesAnyRoot(norm, scriptsRoots);
}

/**
 * Checks whether a file path belongs to srcRoots.
 */
export function isSrcPath(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const srcRoots = config?.paths?.srcRoots ?? ['src'];
  return matchesAnyRoot(norm, srcRoots);
}

/**
 * Checks whether a file path belongs to cliRoots.
 */
export function isCliPath(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const cliRoots = config?.paths?.cliRoots ?? ['src/cli'];
  return matchesAnyRoot(norm, cliRoots);
}

/**
 * Resolves the primary SCSS file path for Z-Layers from config or stylesRoots.
 */
export function resolveZLayersScssPath(projectRoot: string = process.cwd()): string | undefined {
  const config = getAuditConfig(projectRoot);
  const rawTarget = config.styles?.zLayersScssFile ?? config.styles?.baseScssFile;
  if (rawTarget) {
    const configuredPath = path.resolve(projectRoot, rawTarget);
    if (fs.existsSync(configuredPath)) return configuredPath;
  }

  const stylesRoots = config.paths?.stylesRoots ?? ['src/styles'];
  const baseNames = ['_base.scss', 'core/_base.scss', 'base.scss', 'main.scss', 'index.scss'];
  for (const r of stylesRoots) {
    for (const b of baseNames) {
      const candidate = path.resolve(projectRoot, r, b);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return undefined;
}
