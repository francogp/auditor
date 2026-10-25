/**
 * packages/auditor/src/core/auditConfigBuilders.ts
 *
 * Subsystem configuration builders and canonical defineAuditConfig coordinator.
 */

import path from 'node:path';
import {
  type AuditEngineConfig,
  type DeepPartial,
  type AuditPersistenceConfig,
  type AuditDomainConfig,
  type AuditEnvironmentConfig,
  type AuditAuditorHygieneConfig,
  type AuditScriptExtensionsConfig,
  type AuditTemplatesConfig,
  type AuditStylesConfig,
  type AuditStylelintConfig,
  type AuditTypesConfig,
  type AuditEncodingConfig,
  type AuditRunnerConfig,
  type AuditOxlintConfig,
  type AuditOxfmtConfig,
  type AuditHtmlValidateConfig,
  type BaseAuditSubsystemConfig,
  type CanonicalRuleSeverityLevel,
  type AuditVitePlusConfig,
  type AuditVitePlusFmtConfig,
  type AuditVitePlusLintConfig,
  type AuditVitePlusPrecompressConfig,
  type AuditVitePlusStagedConfig,
  type AuditBundleConfig,
  type AuditAgentPluginConfig,
  type AuditAnimationConfig,
  type AuditConstantsConfig,
  type AuditSecurityConfig,
  type AuditDocumentationConfig,
  type AuditPiniaConfig,
  type AuditFallowConfig,
  type AuditFallowSimilarCodeConfig,
  type AuditE2eConfig,
  type AuditPackageHygieneConfig,
  type AuditPackageDistributionConfig,
  type AuditPackageScriptsConfig,
  type AuditScriptCommandsConfig,
  type AuditAccessibilityConfig,
  type AuditTypeCoverageConfig,
  type AuditGitIgnoreConfig,
  type AuditVersionConfig,
  type AuditSecretLeaksConfig,
  type AuditDependencyVulnerabilitiesConfig,
  type AuditVersionTargetConfig,
  type AuditCoverageConfig,
  type AuditCoverageExemption,
  type AuditCoverageAcknowledgedDegradation,
  type AuditRatchetConfig,
  type ResolvedRatchetConfig,
  type AuditTestCoverageConfig,
  type ResolvedTestCoverageConfig,
  type AuditValibotConfig,
  type ValibotParityTarget,
  type AuditWebPerformanceConfig,
  type AuditQueryPerformanceConfig,
  type AuditSecurityHardeningConfig,
  type AuditCodeSimplificationConfig,
  type AuditScssArchitectureConfig,
  type ChunkBudgetConfig,
  type O1CatalogPatternConfig,
  DEFAULT_MAX_AUDIT_STALENESS_MINUTES,
  ACKNOWLEDGEABLE_EXEMPTION_POLICIES,
  AUDITOR_DIR
} from './auditConfigTypes.ts';
import { normalizePosixPath } from './reportUtils.ts';
import {
  assertNarrowCoverageGlob,
  assertCoverageReason,
  getExemptRootsForPolicy,
  filterOutExemptRoots
} from './auditConfigAntiAbuse.ts';
import {
  DEFAULT_AUDIT_CONFIG,
  DEFAULT_SIMILAR_CODE_THRESHOLD,
  DEFAULT_TEST_COVERAGE_PERCENTAGE,
  DEFAULT_TYPE_COVERAGE_AT_LEAST,
  DEFAULT_PRECOMPRESS_THRESHOLD_BYTES,
  collectDeclaredSubsystems
} from './auditConfigDefaults.ts';

export function buildPathsConfig(
  raw?: DeepPartial<AuditEngineConfig['paths']>
): AuditEngineConfig['paths'] {
  const p = raw ?? {};
  return {
    ...DEFAULT_AUDIT_CONFIG.paths,
    ...p,
    cliRoots: p.cliRoots ?? DEFAULT_AUDIT_CONFIG.paths.cliRoots,
    testFilePatterns: p.testFilePatterns ?? [],
    testFragmentationWhitelist: p.testFragmentationWhitelist ?? []
  };
}

export function buildPersistenceConfig(
  raw?: DeepPartial<AuditPersistenceConfig>
): AuditPersistenceConfig {
  const p = raw ?? {};
  return {
    ...DEFAULT_AUDIT_CONFIG.persistence,
    ...p,
    forbiddenMockModules: p.forbiddenMockModules ?? [],
    positionalArrayColumns: p.positionalArrayColumns ?? [],
    allowedDatabaseDirs:
      p.allowedDatabaseDirs && p.allowedDatabaseDirs.length > 0
        ? Array.from(new Set(['backups', 'migrations', 'schemas', ...p.allowedDatabaseDirs]))
        : ['backups', 'migrations', 'schemas'],
    allowedDatabaseFiles:
      p.allowedDatabaseFiles && p.allowedDatabaseFiles.length > 0
        ? Array.from(new Set(['AGENTS.md', '.gitkeep', ...p.allowedDatabaseFiles]))
        : ['AGENTS.md', '.gitkeep'],
    allowedHosts: p.allowedHosts ?? ['localhost', '127.0.0.1'],
    prohibitedTemplateIdentifiers: p.prohibitedTemplateIdentifiers ?? []
  };
}

export function buildDomainConfig(raw?: DeepPartial<AuditDomainConfig>): AuditDomainConfig {
  const d = raw ?? {};
  return {
    ...DEFAULT_AUDIT_CONFIG.domain,
    ...d,
    enabled: d.enabled ?? true,
    o1CatalogPatterns: (d.o1CatalogPatterns as readonly O1CatalogPatternConfig[] | undefined) ?? [],
    caseNormalizationExemptTokens: d.caseNormalizationExemptTokens ?? [],
    allowedStoreSetterPrefixes: d.allowedStoreSetterPrefixes ?? ['set', 'update', 'clear'],
    allowedNumericConstantPrefixes:
      d.allowedNumericConstantPrefixes ??
      DEFAULT_AUDIT_CONFIG.domain?.allowedNumericConstantPrefixes ??
      []
  };
}

export function buildTemplatesConfig(
  raw?: DeepPartial<AuditTemplatesConfig>
): AuditTemplatesConfig {
  const t = raw ?? {};
  return {
    ...DEFAULT_AUDIT_CONFIG.templates,
    ...t,
    enabled: t.enabled ?? DEFAULT_AUDIT_CONFIG.templates?.enabled ?? true,
    requireInputIds: t.requireInputIds ?? DEFAULT_AUDIT_CONFIG.templates?.requireInputIds ?? true,
    tooltipComponents: t.tooltipComponents ?? [],
    forbiddenTemplateCallPatterns: t.forbiddenTemplateCallPatterns ?? [],
    safeTemplateFunctions: t.safeTemplateFunctions ?? []
  };
}

function buildStandaloneStylelintConfig(
  stylelint?: DeepPartial<AuditStylelintConfig>,
  stylesStylelint?: DeepPartial<AuditStylelintConfig>
): AuditStylelintConfig {
  const mergedIgnoreGlobs = Array.from(
    new Set([...(stylesStylelint?.ignoreGlobs ?? []), ...(stylelint?.ignoreGlobs ?? [])])
  );
  const mergedExemptPaths = Array.from(
    new Set([...(stylesStylelint?.exemptPaths ?? []), ...(stylelint?.exemptPaths ?? [])])
  );
  const mergedExemptFiles = Array.from(
    new Set([...(stylesStylelint?.exemptFiles ?? []), ...(stylelint?.exemptFiles ?? [])])
  );

  const merged: DeepPartial<AuditStylelintConfig> = {
    ...stylesStylelint,
    ...stylelint,
    ignoreGlobs: mergedIgnoreGlobs.length > 0 ? mergedIgnoreGlobs : undefined,
    exemptPaths: mergedExemptPaths.length > 0 ? mergedExemptPaths : undefined,
    exemptFiles: mergedExemptFiles.length > 0 ? mergedExemptFiles : undefined
  };
  const base = buildBaseSubsystemConfig<AuditStylelintConfig>(merged, true);

  const effectiveRules = {
    ...(stylesStylelint?.rules ?? {}),
    ...(stylelint?.rules ?? {})
  };

  const baseStrict = stylesStylelint?.strictValues;
  const topStrict = stylelint?.strictValues;
  const effectiveStrict =
    topStrict || baseStrict
      ? {
          enabled: topStrict?.enabled ?? baseStrict?.enabled ?? true,
          properties: Array.from(
            new Set([...(baseStrict?.properties ?? []), ...(topStrict?.properties ?? [])])
          ),
          ignoreValues: {
            ...(baseStrict?.ignoreValues ?? {}),
            ...(topStrict?.ignoreValues ?? {})
          } as Record<string, readonly string[]>,
          ignoreAtRules: Array.from(
            new Set([...(baseStrict?.ignoreAtRules ?? []), ...(topStrict?.ignoreAtRules ?? [])])
          )
        }
      : undefined;

  const effectiveConfigFile = stylelint?.configFile ?? stylesStylelint?.configFile;

  const order = {
    enabled: stylelint?.order?.enabled ?? stylesStylelint?.order?.enabled ?? true,
    enforceHasBlockPartitioning:
      stylelint?.order?.enforceHasBlockPartitioning ??
      stylesStylelint?.order?.enforceHasBlockPartitioning ??
      true
  };

  return {
    ...base,
    configFile: effectiveConfigFile,
    rules: Object.keys(effectiveRules).length > 0 ? effectiveRules : {},
    strictValues: effectiveStrict,
    order
  };
}

interface ZLayersStyleSubConfig {
  zLayersEnabled: boolean;
  zLayersScssFile?: string;
  baseScssFile?: string;
  zLayersTsFile?: string;
  zLayers?: AuditStylesConfig['zLayers'];
}

function buildZLayersSubConfig(s: DeepPartial<AuditStylesConfig>): ZLayersStyleSubConfig {
  const def = DEFAULT_AUDIT_CONFIG.styles;
  return {
    zLayersEnabled: s.zLayersEnabled ?? def?.zLayersEnabled ?? true,
    zLayersScssFile: s.zLayersScssFile,
    baseScssFile: s.baseScssFile ?? s.zLayersScssFile,
    zLayersTsFile: s.zLayersTsFile,
    zLayers: s.zLayers ? ({ ...s.zLayers } as Record<string, number>) : undefined
  };
}

export function buildStylesConfig(
  raw?: DeepPartial<AuditStylesConfig>,
  rawStylelintTop?: DeepPartial<AuditStylelintConfig>
): AuditStylesConfig {
  const s = raw ?? {};
  const def = DEFAULT_AUDIT_CONFIG.styles;
  const base = buildBaseSubsystemConfig<AuditStylesConfig>(s, def?.enabled ?? true);
  const stylelint = buildStandaloneStylelintConfig(rawStylelintTop, s.stylelint);
  const zLayers = buildZLayersSubConfig(s);

  return {
    ...base,
    globalUtilityClasses: s.globalUtilityClasses ?? [],
    canonicalButtonVariants: s.canonicalButtonVariants ?? [],
    ...zLayers,
    lineHeightOverlapCheck: s.lineHeightOverlapCheck ?? def?.lineHeightOverlapCheck ?? true,
    heavyEffectPaths: s.heavyEffectPaths ?? [],
    buttonGovernance: s.buttonGovernance
      ? {
          enabled: s.buttonGovernance.enabled ?? true,
          buttonsScssFile: s.buttonGovernance.buttonsScssFile,
          canonicalVariants: s.buttonGovernance.canonicalVariants
        }
      : undefined,
    stylelint,
    enforceScss: s.enforceScss ?? def?.enforceScss ?? false,
    exemptCssFiles: s.exemptCssFiles ?? []
  };
}

export function buildBundleConfig(raw?: DeepPartial<AuditBundleConfig>): AuditBundleConfig {
  const b = raw ?? {};
  const def = DEFAULT_AUDIT_CONFIG.bundle;
  const base = buildBaseSubsystemConfig<AuditBundleConfig>(b, def?.enabled ?? true);
  return {
    ...base,
    statsFile: b.statsFile ?? def?.statsFile,
    distDir: b.distDir ?? def?.distDir,
    exemptChunkPrefixes: b.exemptChunkPrefixes ?? [],
    maxClientChunkWarnBytes:
      b.maxClientChunkWarnBytes ?? def?.maxClientChunkWarnBytes,
    maxClientChunkErrorBytes:
      b.maxClientChunkErrorBytes ?? def?.maxClientChunkErrorBytes,
    budgets: (b.budgets as readonly ChunkBudgetConfig[] | undefined) ?? [],
    duplicateModuleThresholdBytes:
      b.duplicateModuleThresholdBytes ?? def?.duplicateModuleThresholdBytes,
    topModulesLimit: b.topModulesLimit ?? def?.topModulesLimit,
    forbiddenUiImports:
      (b.forbiddenUiImports as
        | readonly { readonly module: string; readonly reason: string }[]
        | undefined) ?? []
  };
}

export function buildAgentAndSecurityConfig(config: DeepPartial<AuditEngineConfig>): {
  agentPlugin: AuditAgentPluginConfig;
  security: AuditSecurityConfig;
  animation: AuditAnimationConfig;
} {
  const secEnabled =
    config.fallow?.security?.enabled ??
    config.security?.enabled ??
    DEFAULT_AUDIT_CONFIG.security?.enabled ??
    true;
  const agentPluginBase = buildBaseSubsystemConfig<AuditAgentPluginConfig>(
    config.agentPlugin,
    DEFAULT_AUDIT_CONFIG.agentPlugin?.enabled ?? true
  );
  const securityBase = buildBaseSubsystemConfig<AuditSecurityConfig>(
    config.security,
    secEnabled
  );
  const animationBase = buildBaseSubsystemConfig<AuditAnimationConfig>(
    config.animation,
    DEFAULT_AUDIT_CONFIG.animation?.enabled ?? true
  );
  return {
    agentPlugin: {
      ...agentPluginBase
    },
    security: {
      ...securityBase,
      enabled: secEnabled
    },
    animation: {
      ...animationBase,
      customTimerFunctions: config.animation?.customTimerFunctions
        ? [...config.animation.customTimerFunctions]
        : (DEFAULT_AUDIT_CONFIG.animation?.customTimerFunctions ?? [])
    }
  };
}

function buildConstantsSubConfig(c?: DeepPartial<AuditConstantsConfig>): AuditConstantsConfig {
  const base = buildBaseSubsystemConfig<AuditConstantsConfig>(
    c,
    DEFAULT_AUDIT_CONFIG.constants?.enabled ?? true
  );
  return {
    ...base,
    ignoredNames: c?.ignoredNames ? [...c.ignoredNames] : (DEFAULT_AUDIT_CONFIG.constants?.ignoredNames ?? []),
    exemptMagicNumbers: c?.exemptMagicNumbers ? [...c.exemptMagicNumbers] : (DEFAULT_AUDIT_CONFIG.constants?.exemptMagicNumbers ?? []),
    allowedNumericPrefixes: c?.allowedNumericPrefixes ? [...c.allowedNumericPrefixes] : (DEFAULT_AUDIT_CONFIG.constants?.allowedNumericPrefixes ?? []),
    exemptPaths: c?.exemptPaths ? [...c.exemptPaths] : (base.exemptPaths ?? []),
    exemptFiles: c?.exemptFiles ? [...c.exemptFiles] : (base.exemptFiles ?? []),
    ignoreGlobs: c?.ignoreGlobs ? [...c.ignoreGlobs] : (base.ignoreGlobs ?? [])
  };
}

function buildDocumentationSubConfig(
  d?: DeepPartial<AuditDocumentationConfig>
): AuditDocumentationConfig {
  const base = buildBaseSubsystemConfig<AuditDocumentationConfig>(
    d,
    DEFAULT_AUDIT_CONFIG.documentation?.enabled ?? true
  );
  return {
    ...base,
    knownValidAbstractPaths: d?.knownValidAbstractPaths ? [...d.knownValidAbstractPaths] : (DEFAULT_AUDIT_CONFIG.documentation?.knownValidAbstractPaths ?? []),
    skillsRoots: d?.skillsRoots ? [...d.skillsRoots] : (DEFAULT_AUDIT_CONFIG.documentation?.skillsRoots ?? []),
    unignoreDirs: d?.unignoreDirs ? [...d.unignoreDirs] : (DEFAULT_AUDIT_CONFIG.documentation?.unignoreDirs ?? []),
    allowedNpxBinaries: d?.allowedNpxBinaries ? [...d.allowedNpxBinaries] : (DEFAULT_AUDIT_CONFIG.documentation?.allowedNpxBinaries ?? []),
    language: d?.language ?? DEFAULT_AUDIT_CONFIG.documentation?.language ?? 'en',
    chatLanguage: d?.chatLanguage ?? DEFAULT_AUDIT_CONFIG.documentation?.chatLanguage ?? 'es',
    languageExemptions: d?.languageExemptions ? [...d.languageExemptions] : (DEFAULT_AUDIT_CONFIG.documentation?.languageExemptions ?? [])
  };
}

export function buildConstantsAndDocConfig(config: DeepPartial<AuditEngineConfig>): {
  constants: AuditConstantsConfig;
  documentation: AuditDocumentationConfig;
  pinia: AuditPiniaConfig;
  e2e: AuditE2eConfig;
} {
  const piniaBase = buildBaseSubsystemConfig<AuditPiniaConfig>(
    config.pinia,
    DEFAULT_AUDIT_CONFIG.pinia?.enabled ?? true
  );
  const e2eBase = buildBaseSubsystemConfig<AuditE2eConfig>(
    config.e2e,
    DEFAULT_AUDIT_CONFIG.e2e?.enabled ?? true
  );
  return {
    constants: buildConstantsSubConfig(config.constants),
    documentation: buildDocumentationSubConfig(config.documentation),
    pinia: {
      ...piniaBase,
      authorizedMutationFiles: config.pinia?.authorizedMutationFiles
        ? [...config.pinia.authorizedMutationFiles]
        : (DEFAULT_AUDIT_CONFIG.pinia?.authorizedMutationFiles ?? [])
    },
    e2e: {
      ...e2eBase,
      idLocatorsOnly: config.e2e?.idLocatorsOnly ?? DEFAULT_AUDIT_CONFIG.e2e?.idLocatorsOnly ?? false
    }
  };
}

export function buildFallowSimilarCodeConfig(
  raw?: DeepPartial<AuditFallowSimilarCodeConfig>
): AuditFallowSimilarCodeConfig {
  const def = DEFAULT_AUDIT_CONFIG.fallow?.similarCode;
  const s = raw ?? {};
  return {
    enabled: s.enabled ?? def?.enabled ?? true,
    threshold: s.threshold ?? def?.threshold ?? DEFAULT_SIMILAR_CODE_THRESHOLD,
    ignoreSameFile: s.ignoreSameFile ?? def?.ignoreSameFile ?? true,
    minLines: s.minLines ?? def?.minLines ?? 3
  };
}

function buildFallowFlagsConfig(
  raw?: DeepPartial<AuditFallowConfig['flags']>,
  def?: AuditFallowConfig['flags']
): AuditFallowConfig['flags'] {
  return {
    enabled: raw?.enabled ?? def?.enabled ?? true,
    maxFlagAgeDays: raw?.maxFlagAgeDays ?? def?.maxFlagAgeDays,
    trackRetirement: raw?.trackRetirement ?? def?.trackRetirement ?? true
  };
}

function buildFallowCoverageConfig(
  raw?: DeepPartial<AuditFallowConfig['coverage']>,
  def?: AuditFallowConfig['coverage']
): AuditFallowConfig['coverage'] {
  return {
    enabled: raw?.enabled ?? def?.enabled ?? true,
    path: raw?.path ?? def?.path,
    root: raw?.root ?? def?.root
  };
}

export function buildFallowConfig(
  raw?: DeepPartial<AuditFallowConfig>,
  rootSecurity?: DeepPartial<AuditSecurityConfig>
): AuditFallowConfig {
  const def = DEFAULT_AUDIT_CONFIG.fallow;
  const f = raw ?? {};
  const base = buildBaseSubsystemConfig<AuditFallowConfig>(f, def?.enabled ?? true);
  const secEnabled = f.security?.enabled ?? rootSecurity?.enabled ?? def?.security?.enabled ?? true;
  return {
    ...base,
    security: {
      enabled: secEnabled
    },
    enforceTargets: f.enforceTargets ?? def?.enforceTargets ?? true,
    maxTargetPriority: f.maxTargetPriority ?? def?.maxTargetPriority ?? 'high',
    similarCode: buildFallowSimilarCodeConfig(f.similarCode),
    flags: buildFallowFlagsConfig(f.flags, def?.flags),
    coverage: buildFallowCoverageConfig(f.coverage, def?.coverage),
    typeAware: f.typeAware ?? def?.typeAware ?? true,
    showCascade: f.showCascade ?? def?.showCascade ?? true,
    duplicates: {
      enabled: f.duplicates?.enabled ?? def?.duplicates?.enabled ?? true,
      nearMiss: f.duplicates?.nearMiss ?? def?.duplicates?.nearMiss ?? true,
      mode: f.duplicates?.mode ?? def?.duplicates?.mode ?? 'strict',
      ...(f.duplicates?.minTokens !== undefined ? { minTokens: f.duplicates.minTokens } : {}),
      ...(f.duplicates?.minLines !== undefined ? { minLines: f.duplicates.minLines } : {}),
      ...(f.duplicates?.minOccurrences !== undefined
        ? { minOccurrences: f.duplicates.minOccurrences }
        : {})
    },
    viz: {
      enabled: f.viz?.enabled ?? def?.viz?.enabled ?? true,
      outputPath: f.viz?.outputPath ?? def?.viz?.outputPath ?? 'scratch/fallow_map.html'
    }
  };
}

export function buildPackageHygieneConfig(
  raw?: DeepPartial<AuditPackageHygieneConfig>
): AuditPackageHygieneConfig {
  const def = DEFAULT_AUDIT_CONFIG.packageHygiene;
  const p = raw ?? {};
  const base = buildBaseSubsystemConfig<AuditPackageHygieneConfig>(p, def?.enabled ?? true);
  return {
    ...base,
    ignoreDependencies: p.ignoreDependencies
      ? [...p.ignoreDependencies]
      : (def?.ignoreDependencies ?? []),
    ignoreBinaries: p.ignoreBinaries ? [...p.ignoreBinaries] : (def?.ignoreBinaries ?? []),
    entry: p.entry ? [...p.entry] : undefined,
    project: p.project ? [...p.project] : undefined
  };
}

export function buildEnvironmentConfig(
  raw?: DeepPartial<AuditEnvironmentConfig>
): AuditEnvironmentConfig {
  const def = DEFAULT_AUDIT_CONFIG.environment;
  return buildBaseSubsystemConfig<AuditEnvironmentConfig>(raw, def?.enabled ?? true);
}

export function buildAuditorHygieneConfig(
  raw?: DeepPartial<AuditAuditorHygieneConfig>
): AuditAuditorHygieneConfig {
  const def = DEFAULT_AUDIT_CONFIG.auditorHygiene;
  const p = raw ?? {};
  const base = buildBaseSubsystemConfig<AuditAuditorHygieneConfig>(p, def?.enabled ?? true);
  return {
    ...base,
    roots: p.roots ? [...p.roots] : (def?.roots ? [...def.roots] : ['scripts/auditors']),
    exemptFiles: p.exemptFiles ? [...p.exemptFiles] : (def?.exemptFiles ?? []),
    disabledDetectors: p.disabledDetectors
      ? [...p.disabledDetectors]
      : (def?.disabledDetectors ?? [])
  };
}

export function buildScriptExtensionsConfig(
  raw?: DeepPartial<AuditScriptExtensionsConfig>
): AuditScriptExtensionsConfig {
  const def = DEFAULT_AUDIT_CONFIG.scriptExtensions;
  const p = raw ?? {};
  const base = buildBaseSubsystemConfig<AuditScriptExtensionsConfig>(p, def?.enabled ?? true);
  return {
    ...base,
    enforceTypeScript: p.enforceTypeScript ?? def?.enforceTypeScript ?? true,
    allowMjs: p.allowMjs ?? def?.allowMjs ?? false,
    allowCjs: p.allowCjs ?? def?.allowCjs ?? false,
    allowJsScripts: p.allowJsScripts ?? def?.allowJsScripts ?? false,
    exemptFiles: p.exemptFiles ? [...p.exemptFiles] : (def?.exemptFiles ?? [])
  };
}

export function buildPackageDistributionConfig(
  raw?: DeepPartial<AuditPackageDistributionConfig>
): AuditPackageDistributionConfig {
  const def = DEFAULT_AUDIT_CONFIG.packageDistribution;
  const p = raw ?? {};
  const base = buildBaseSubsystemConfig<AuditPackageDistributionConfig>(p, def?.enabled ?? false);
  return {
    ...base,
    pkgDir: p.pkgDir ?? def?.pkgDir,
    level: p.level ?? def?.level ?? 'warning'
  };
}

export function buildPackageScriptsConfig(
  raw?: DeepPartial<AuditPackageScriptsConfig>
): AuditPackageScriptsConfig {
  const def = DEFAULT_AUDIT_CONFIG.packageScripts;
  const p = raw ?? {};
  if (p.recommendedScripts !== undefined && typeof p.recommendedScripts !== 'boolean') {
    throw new Error(
      `[AuditConfig] Type error in 'packageScripts.recommendedScripts': received '${String(p.recommendedScripts)}'. ` +
        `Must be a strict boolean value (true or false). Strings such as 'off' or 'essential' are strictly prohibited.`
    );
  }
  if (p.enforceBuildAudit !== undefined && typeof p.enforceBuildAudit !== 'boolean') {
    throw new Error(
      `[AuditConfig] Type error in 'packageScripts.enforceBuildAudit': received '${String(p.enforceBuildAudit)}'. ` +
        `Must be a strict boolean value (true or false).`
    );
  }
  const base = buildBaseSubsystemConfig<AuditPackageScriptsConfig>(p, def?.enabled ?? true);
  return {
    ...base,
    enforceBuildAudit: p.enforceBuildAudit ?? def?.enforceBuildAudit ?? true,
    recommendedScripts: p.recommendedScripts ?? def?.recommendedScripts ?? true,
    extraRequiredScripts: p.extraRequiredScripts
      ? [...p.extraRequiredScripts]
      : (def?.extraRequiredScripts ?? [])
  };
}

export function buildScriptCommandsConfig(
  raw?: DeepPartial<AuditScriptCommandsConfig>
): AuditScriptCommandsConfig {
  const def = DEFAULT_AUDIT_CONFIG.scriptCommands;
  const p = raw ?? {};
  const base = buildBaseSubsystemConfig<AuditScriptCommandsConfig>(p, def?.enabled ?? true);
  return {
    ...base,
    exemptGlobs: p.exemptGlobs ? [...p.exemptGlobs] : (def?.exemptGlobs ?? []),
    allowedNpxBinaries: p.allowedNpxBinaries
      ? [...p.allowedNpxBinaries]
      : (def?.allowedNpxBinaries ?? [])
  };
}

export function buildRatchetConfig(
  raw?: DeepPartial<AuditRatchetConfig>
): ResolvedRatchetConfig {
  const r = raw ?? {};
  if (r.enabled !== undefined && typeof r.enabled !== 'boolean') {
    throw new Error(
      `[AuditConfig] 'ratchet.enabled' must be a strict boolean, received '${String(r.enabled)}'.`
    );
  }
  const productionRef =
    r.productionRef ?? DEFAULT_AUDIT_CONFIG.ratchet?.productionRef ?? 'origin/main';
  if (productionRef.trim() === '' || /\s/u.test(productionRef) || productionRef.startsWith('-')) {
    throw new Error(
      `[AuditConfig] 'ratchet.productionRef' must be a non-empty git ref without whitespace or leading '-', received '${productionRef}'.`
    );
  }
  const baselineFile =
    r.baselineFile ??
    DEFAULT_AUDIT_CONFIG.ratchet?.baselineFile ??
    path.posix.join(AUDITOR_DIR, 'audit-baseline.json');
  const normalized = path.posix.normalize(baselineFile.replaceAll(path.win32.sep, path.posix.sep));
  if (
    path.isAbsolute(baselineFile) ||
    normalized.startsWith('..') ||
    path.extname(baselineFile) !== '.json'
  ) {
    throw new Error(
      `[AuditConfig] 'ratchet.baselineFile' must be a repository-relative '.json' path inside the project, received '${baselineFile}'.`
    );
  }
  return {
    enabled: r.enabled ?? DEFAULT_AUDIT_CONFIG.ratchet?.enabled ?? true,
    productionRef,
    baselineFile: normalized
  };
}

function validateTestCoverageRaw(t: DeepPartial<AuditTestCoverageConfig>): void {
  if (t.enabled !== undefined && typeof t.enabled !== 'boolean') {
    throw new Error(
      `[AuditConfig] 'testCoverage.enabled' must be a strict boolean, received '${String(t.enabled)}'.`
    );
  }
  if (
    t.threshold !== undefined &&
    (typeof t.threshold !== 'number' ||
      Number.isNaN(t.threshold) ||
      t.threshold < 0 ||
      t.threshold > 100)
  ) {
    throw new Error(
      `[AuditConfig] 'testCoverage.threshold' must be a number between 0 and 100, received '${String(t.threshold)}'.`
    );
  }
  if (t.enforceInAudit !== undefined && typeof t.enforceInAudit !== 'boolean') {
    throw new Error(
      `[AuditConfig] 'testCoverage.enforceInAudit' must be a strict boolean, received '${String(t.enforceInAudit)}'.`
    );
  }
}

function resolveTestCoverageCollections(
  t: DeepPartial<AuditTestCoverageConfig>,
  def?: AuditTestCoverageConfig
) {
  return {
    roots: t.roots ? [...t.roots] : (def?.roots ?? ['src']),
    extensions: t.extensions
      ? [...t.extensions]
      : (def?.extensions ?? ['.ts', '.vue', '.js', '.jsx', '.tsx', '.mjs', '.cjs']),
    exemptGlobs: t.exemptGlobs ? [...t.exemptGlobs] : (def?.exemptGlobs ?? []),
    directoryThresholds: t.directoryThresholds
      ? ({ ...t.directoryThresholds } as Record<string, number>)
      : (def?.directoryThresholds ?? {})
  };
}

function normalizePathToPosixGlob(p: string): string {
  const norm = normalizePosixPath(p);
  return norm.endsWith(path.posix.sep) ? `${norm}**` : path.posix.join(norm, '**');
}

export function buildTestCoverageConfig(
  raw?: DeepPartial<AuditTestCoverageConfig>
): ResolvedTestCoverageConfig {
  const def = DEFAULT_AUDIT_CONFIG.testCoverage;
  const t = raw ?? {};
  validateTestCoverageRaw(t);
  const base = buildBaseSubsystemConfig<AuditTestCoverageConfig>(t, def?.enabled ?? true);
  const collections = resolveTestCoverageCollections(t, def);
  const combinedExemptGlobs = Array.from(new Set([
    ...collections.exemptGlobs.map((f) => normalizePosixPath(f)),
    ...(base.ignoreGlobs?.map((f) => normalizePosixPath(f)) ?? []),
    ...(base.exemptPaths?.map(normalizePathToPosixGlob) ?? []),
    ...(base.exemptFiles?.map((f) => normalizePosixPath(f)) ?? [])
  ]));
  return {
    ...base,
    threshold: t.threshold ?? def?.threshold ?? DEFAULT_TEST_COVERAGE_PERCENTAGE,
    path: t.path ?? def?.path ?? 'scratch/coverage/coverage-final.json',
    runCommand: t.runCommand ?? def?.runCommand ?? 'vp test --coverage',
    enforceInAudit: t.enforceInAudit ?? def?.enforceInAudit ?? true,
    ...collections,
    exemptGlobs: combinedExemptGlobs
  };
}

export function buildAccessibilityConfig(
  raw?: DeepPartial<AuditAccessibilityConfig>
): AuditAccessibilityConfig {
  const def = DEFAULT_AUDIT_CONFIG.accessibility;
  const a = raw ?? {};
  const parsedRules: Record<string, boolean> = {};
  const sourceRules = a.rules ?? def?.rules ?? {};
  for (const [key, val] of Object.entries(sourceRules)) {
    if (typeof val !== 'boolean') {
      throw new Error(
        `[AuditConfig] Error de tipo en 'accessibility.rules.${key}': se recibió '${String(val)}'. ` +
          `Debe ser un valor booleano estricto (true o false). El uso de cadenas como 'off' o 'error' está estrictamente prohibido.`
      );
    }
    parsedRules[key] = val;
  }
  const base = buildBaseSubsystemConfig<AuditAccessibilityConfig>(a, def?.enabled ?? true);
  return {
    ...base,
    rules: parsedRules
  };
}

export function buildTypeCoverageConfig(
  raw?: DeepPartial<AuditTypeCoverageConfig>
): AuditTypeCoverageConfig {
  const def = DEFAULT_AUDIT_CONFIG.typeCoverage;
  const t = raw ?? {};
  const base = buildBaseSubsystemConfig<AuditTypeCoverageConfig>(t, def?.enabled ?? true);
  return {
    ...base,
    atLeast: t.atLeast ?? def?.atLeast ?? DEFAULT_TYPE_COVERAGE_AT_LEAST,
    strict: t.strict ?? def?.strict ?? true,
    ignoreFiles: t.ignoreFiles ? [...t.ignoreFiles] : (def?.ignoreFiles ?? [])
  };
}

export function buildGitIgnoreConfig(
  raw?: DeepPartial<AuditGitIgnoreConfig>
): AuditGitIgnoreConfig {
  const def = DEFAULT_AUDIT_CONFIG.gitIgnore;
  const g = raw ?? {};
  const base = buildBaseSubsystemConfig<AuditGitIgnoreConfig>(g, def?.enabled ?? true);
  return {
    ...base,
    extraRequiredEntries: g.extraRequiredEntries
      ? [...g.extraRequiredEntries]
      : (def?.extraRequiredEntries ?? [])
  };
}

function extractStringArrayProperty(
  arr: unknown
): readonly string[] | undefined {
  if (!Array.isArray(arr)) return undefined;
  return arr.filter((x): x is string => typeof x === 'string');
}

export function buildBaseSubsystemConfig<T extends BaseAuditSubsystemConfig>(
  raw?: DeepPartial<T>,
  defaultEnabled = true
): T {
  const enabled = raw?.enabled !== undefined ? (raw.enabled as boolean) : defaultEnabled;
  const ignoreGlobs = extractStringArrayProperty(raw?.ignoreGlobs);
  const exemptPaths = extractStringArrayProperty(raw?.exemptPaths);
  const exemptFiles = extractStringArrayProperty(raw?.exemptFiles);

  const base: BaseAuditSubsystemConfig = {
    enabled,
    ...(ignoreGlobs !== undefined ? { ignoreGlobs } : {}),
    ...(exemptPaths !== undefined ? { exemptPaths } : {}),
    ...(exemptFiles !== undefined ? { exemptFiles } : {})
  };

  return {
    ...raw,
    ...base
  } as T;
}

export function buildOxlintConfig(raw?: DeepPartial<AuditOxlintConfig>): AuditOxlintConfig {
  return buildBaseSubsystemConfig<AuditOxlintConfig>(
    raw,
    DEFAULT_AUDIT_CONFIG.oxlint?.enabled ?? true
  );
}

export function buildOxfmtConfig(raw?: DeepPartial<AuditOxfmtConfig>): AuditOxfmtConfig {
  return buildBaseSubsystemConfig<AuditOxfmtConfig>(
    raw,
    DEFAULT_AUDIT_CONFIG.oxfmt?.enabled ?? true
  );
}

export function buildHtmlValidateConfig(
  raw?: DeepPartial<AuditHtmlValidateConfig>
): AuditHtmlValidateConfig {
  return buildBaseSubsystemConfig<AuditHtmlValidateConfig>(
    raw,
    DEFAULT_AUDIT_CONFIG.htmlValidate?.enabled ?? true
  );
}

function buildVitePlusPrecompressConfig(
  raw?: DeepPartial<AuditVitePlusPrecompressConfig>,
  def?: AuditVitePlusPrecompressConfig
): AuditVitePlusPrecompressConfig {
  const v = raw ?? {};
  return {
    enabled: v.enabled ?? def?.enabled ?? true,
    brotli: v.brotli ?? def?.brotli ?? true,
    gzip: v.gzip ?? def?.gzip ?? true,
    server: v.server ?? def?.server ?? 'nginx',
    spa: v.spa ?? def?.spa ?? true,
    report: v.report ?? def?.report ?? 'summary',
    threshold: v.threshold ?? def?.threshold ?? DEFAULT_PRECOMPRESS_THRESHOLD_BYTES,
    outDir: v.outDir ?? def?.outDir
  };
}

function buildVitePlusFmtConfig(
  raw?: DeepPartial<AuditVitePlusFmtConfig>,
  def?: AuditVitePlusFmtConfig
): AuditVitePlusFmtConfig {
  const v = raw ?? {};
  return {
    enabled: v.enabled ?? def?.enabled ?? true,
    singleQuote: v.singleQuote ?? def?.singleQuote ?? true,
    semi: v.semi ?? def?.semi ?? true,
    trailingComma: v.trailingComma ?? def?.trailingComma ?? 'none',
    tabWidth: v.tabWidth ?? def?.tabWidth,
    useTabs: v.useTabs ?? def?.useTabs,
    printWidth: v.printWidth ?? def?.printWidth ?? 100,
    sortPackageJson: v.sortPackageJson ?? def?.sortPackageJson ?? true,
    ignorePatterns: v.ignorePatterns ? [...v.ignorePatterns] : (def?.ignorePatterns ?? []),
    overrides: v.overrides ? [...v.overrides] : (def?.overrides ?? [])
  };
}

function buildVitePlusLintConfig(
  raw?: DeepPartial<AuditVitePlusLintConfig>,
  def?: AuditVitePlusLintConfig
): AuditVitePlusLintConfig {
  const v = raw ?? {};
  return {
    enabled: v.enabled ?? def?.enabled ?? true,
    typeAware: v.typeAware ?? def?.typeAware ?? true,
    typeCheck: v.typeCheck ?? def?.typeCheck ?? true,
    categories: v.categories ? { ...v.categories } : def?.categories,
    rules: v.rules
      ? ({ ...v.rules } as Record<string, 'error' | 'warn' | 'off' | readonly unknown[]>)
      : def?.rules,
    ignorePatterns: v.ignorePatterns ? [...v.ignorePatterns] : (def?.ignorePatterns ?? []),
    overrides: v.overrides ? [...v.overrides] : (def?.overrides ?? [])
  };
}

function buildVitePlusStagedConfig(
  rawStaged: unknown,
  defStaged: unknown
): AuditVitePlusStagedConfig {
  const isStagedObject = typeof rawStaged === 'object' && rawStaged !== null;
  const isStagedWithRules = isStagedObject && ('rules' in rawStaged || 'enabled' in rawStaged);
  const stagedObj = rawStaged as AuditVitePlusStagedConfig | undefined;
  const defStagedObj = defStaged as AuditVitePlusStagedConfig | undefined;
  const stagedEnabled =
    isStagedWithRules && typeof stagedObj?.enabled === 'boolean'
      ? stagedObj.enabled
      : typeof defStagedObj?.enabled === 'boolean'
        ? defStagedObj.enabled
        : true;
  const stagedRules: Record<string, string> =
    isStagedWithRules && stagedObj?.rules
      ? (stagedObj.rules as Record<string, string>)
      : isStagedObject && !('rules' in rawStaged)
        ? (rawStaged as Record<string, string>)
        : defStagedObj?.rules
          ? (defStagedObj.rules as Record<string, string>)
          : { '*': 'vp check --fix' };
  return {
    enabled: stagedEnabled,
    rules: stagedRules
  };
}

export function buildVitePlusConfig(raw?: DeepPartial<AuditVitePlusConfig>): AuditVitePlusConfig {
  const def = DEFAULT_AUDIT_CONFIG.vitePlusConfig;
  const v = raw ?? {};
  return {
    enabled: v.enabled ?? def?.enabled ?? true,
    precompress: buildVitePlusPrecompressConfig(v.precompress, def?.precompress),
    fmt: buildVitePlusFmtConfig(v.fmt, def?.fmt),
    lint: buildVitePlusLintConfig(v.lint, def?.lint),
    staged: buildVitePlusStagedConfig(v.staged, def?.staged),
    hooks: v.hooks ? { ...v.hooks, enabled: v.hooks.enabled ?? def?.hooks?.enabled ?? true } : def?.hooks,
    vscode: v.vscode ? { ...v.vscode, enabled: v.vscode.enabled ?? def?.vscode?.enabled ?? true } : def?.vscode,
    extraLintRules: v.extraLintRules ? ({ ...v.extraLintRules } as Record<string, CanonicalRuleSeverityLevel>) : def?.extraLintRules
  };
}

export function buildVersionConfig(raw?: DeepPartial<AuditVersionConfig>): AuditVersionConfig {
  const def = DEFAULT_AUDIT_CONFIG.version;
  const v = raw ?? {};
  return {
    enabled: v.enabled ?? def?.enabled ?? true,
    autoSyncPublicVersionJson:
      v.autoSyncPublicVersionJson ?? def?.autoSyncPublicVersionJson ?? true,
    syncTargets: v.syncTargets
      ? ([...v.syncTargets] as readonly (string | AuditVersionTargetConfig)[])
      : (def?.syncTargets ?? [])
  };
}

export function buildSecretLeaksConfig(
  raw?: DeepPartial<AuditSecretLeaksConfig>
): AuditSecretLeaksConfig {
  const def = DEFAULT_AUDIT_CONFIG.secretLeaks;
  const s = raw ?? {};
  const base = buildBaseSubsystemConfig<AuditSecretLeaksConfig>(s, def?.enabled ?? true);
  return {
    ...base,
    maskSecrets: s.maskSecrets ?? def?.maskSecrets ?? true,
    allowedPatterns: s.allowedPatterns ? [...s.allowedPatterns] : (def?.allowedPatterns ?? []),
    exemptGlobs: s.exemptGlobs ? [...s.exemptGlobs] : (def?.exemptGlobs ?? [])
  };
}

export function buildDependencyVulnerabilitiesConfig(
  raw?: DeepPartial<AuditDependencyVulnerabilitiesConfig>
): AuditDependencyVulnerabilitiesConfig {
  const def = DEFAULT_AUDIT_CONFIG.dependencyVulnerabilities;
  const d = raw ?? {};
  const base = buildBaseSubsystemConfig<AuditDependencyVulnerabilitiesConfig>(d, def?.enabled ?? false);
  return {
    ...base,
    failOn: d.failOn ?? def?.failOn ?? 'critical',
    allowList: d.allowList ? [...d.allowList] : (def?.allowList ?? []),
    includeDev: d.includeDev ?? def?.includeDev ?? false
  };
}

function resolveCoverageExemptGlobs(
  rawGlobs: DeepPartial<AuditCoverageConfig>['exemptGlobs'],
  protectedRoots: readonly string[]
): AuditCoverageExemption[] {
  const exemptGlobs: AuditCoverageExemption[] = [];
  for (const entry of rawGlobs ?? []) {
    const glob = entry?.glob ?? '';
    assertNarrowCoverageGlob('coverage.exemptGlobs', glob, protectedRoots);
    assertCoverageReason('coverage.exemptGlobs', glob, entry?.reason);
    exemptGlobs.push({ glob, reason: entry!.reason! });
  }
  return exemptGlobs;
}

function resolveAcknowledgedDegradations(
  rawDegradations: DeepPartial<AuditCoverageConfig>['acknowledgedDegradations'],
  paths: AuditEngineConfig['paths'],
  protectedRoots: readonly string[]
): AuditCoverageAcknowledgedDegradation[] {
  const acknowledgedDegradations: AuditCoverageAcknowledgedDegradation[] = [];
  for (const entry of rawDegradations ?? []) {
    const glob = entry?.glob ?? '';
    const policy = entry?.policy;
    if (!policy || !ACKNOWLEDGEABLE_EXEMPTION_POLICIES.includes(policy)) {
      throw new Error(
        `[AuditConfig] 'coverage.acknowledgedDegradations' declara una política desconocida '${String(policy)}'. ` +
          `Válidas: ${ACKNOWLEDGEABLE_EXEMPTION_POLICIES.join(', ')}.`
      );
    }
    const exemptRoots = getExemptRootsForPolicy(policy, paths);
    const effectiveProtectedRoots =
      exemptRoots.length > 0 ? filterOutExemptRoots(protectedRoots, exemptRoots) : protectedRoots;
    assertNarrowCoverageGlob('coverage.acknowledgedDegradations', glob, effectiveProtectedRoots);
    assertCoverageReason('coverage.acknowledgedDegradations', glob, entry?.reason);
    acknowledgedDegradations.push({ policy, glob, reason: entry!.reason! });
  }
  return acknowledgedDegradations;
}

export function buildCoverageConfig(
  raw: DeepPartial<AuditCoverageConfig> | undefined,
  paths: AuditEngineConfig['paths']
): AuditCoverageConfig {
  const c = raw ?? {};
  const protectedRoots = Array.from(
    new Set([...(paths.srcRoots ?? []), ...(paths.codeRoots ?? []), ...(paths.testRoots ?? [])])
  );
  const base = buildBaseSubsystemConfig<AuditCoverageConfig>(
    c,
    DEFAULT_AUDIT_CONFIG.coverage?.enabled ?? true
  );
  return {
    ...base,
    exemptGlobs: resolveCoverageExemptGlobs(c.exemptGlobs, protectedRoots),
    acknowledgedDegradations: resolveAcknowledgedDegradations(
      c.acknowledgedDegradations,
      paths,
      protectedRoots
    )
  };
}

export function buildValibotConfig(
  raw: DeepPartial<AuditValibotConfig> | undefined
): AuditValibotConfig {
  const v = raw ?? {};
  const base = buildBaseSubsystemConfig<AuditValibotConfig>(
    v,
    DEFAULT_AUDIT_CONFIG.valibot?.enabled ?? true
  );
  return {
    ...base,
    targets: v.targets ? (v.targets as ValibotParityTarget[]) : []
  };
}

export function buildWebPerformanceConfig(
  raw?: DeepPartial<AuditWebPerformanceConfig>
): AuditWebPerformanceConfig {
  const def = DEFAULT_AUDIT_CONFIG.webPerformance!;
  const w = raw ?? {};
  const base = buildBaseSubsystemConfig<AuditWebPerformanceConfig>(w, def.enabled ?? true);
  return {
    ...base,
    maxDomDepth: w.maxDomDepth ?? def.maxDomDepth,
    maxInlineSvgSize: w.maxInlineSvgSize ?? def.maxInlineSvgSize,
    exemptSvgPaths: w.exemptSvgPaths ? [...w.exemptSvgPaths] : def.exemptSvgPaths,
    exemptImgClasses: w.exemptImgClasses ? [...w.exemptImgClasses] : def.exemptImgClasses
  };
}

export function buildQueryPerformanceConfig(
  raw?: DeepPartial<AuditQueryPerformanceConfig>
): AuditQueryPerformanceConfig {
  const def = DEFAULT_AUDIT_CONFIG.queryPerformance!;
  const q = raw ?? {};
  const base = buildBaseSubsystemConfig<AuditQueryPerformanceConfig>(q, def.enabled ?? true);
  return {
    ...base,
    excludeMigrationsDir: q.excludeMigrationsDir ?? def.excludeMigrationsDir,
    exemptSelectStarPaths: q.exemptSelectStarPaths
      ? [...q.exemptSelectStarPaths]
      : def.exemptSelectStarPaths
  };
}

export function buildSecurityHardeningConfig(
  raw?: DeepPartial<AuditSecurityHardeningConfig>
): AuditSecurityHardeningConfig {
  const def = DEFAULT_AUDIT_CONFIG.securityHardening!;
  return buildBaseSubsystemConfig<AuditSecurityHardeningConfig>(raw, def.enabled ?? true);
}

export function buildCodeSimplificationConfig(
  raw?: DeepPartial<AuditCodeSimplificationConfig>
): AuditCodeSimplificationConfig {
  const def = DEFAULT_AUDIT_CONFIG.codeSimplification!;
  const c = raw ?? {};
  const base = buildBaseSubsystemConfig<AuditCodeSimplificationConfig>(c, def.enabled ?? true);
  return {
    ...base,
    maxNestingDepth: c.maxNestingDepth ?? def.maxNestingDepth,
    allowMatrixLoops: c.allowMatrixLoops ?? def.allowMatrixLoops
  };
}

export function buildScssArchitectureConfig(
  raw?: DeepPartial<AuditScssArchitectureConfig>
): AuditScssArchitectureConfig {
  const def = DEFAULT_AUDIT_CONFIG.scssArchitecture!;
  const s = raw ?? {};
  const base = buildBaseSubsystemConfig<AuditScssArchitectureConfig>(s, def.enabled ?? true);
  return {
    ...base,
    maxNestingDepth: s.maxNestingDepth ?? def.maxNestingDepth,
    scopedMaxNestingDepth: s.scopedMaxNestingDepth ?? def.scopedMaxNestingDepth,
    allowPixelArtSpacing: s.allowPixelArtSpacing ?? def.allowPixelArtSpacing,
    allowedSpacingUnits: s.allowedSpacingUnits
      ? [...s.allowedSpacingUnits]
      : def.allowedSpacingUnits,
    allowScopedColors: s.allowScopedColors ?? def.allowScopedColors
  };
}


function buildTypesConfig(types: DeepPartial<AuditTypesConfig> | undefined): AuditTypesConfig {
  return buildBaseSubsystemConfig<AuditTypesConfig>(
    types,
    DEFAULT_AUDIT_CONFIG.types?.enabled ?? true
  );
}

function buildEncodingConfig(
  encoding: DeepPartial<AuditEncodingConfig> | undefined
): AuditEncodingConfig {
  const def = DEFAULT_AUDIT_CONFIG.encoding;
  const base = buildBaseSubsystemConfig<AuditEncodingConfig>(encoding, def?.enabled ?? true);
  return {
    ...base,
    defaultEncoding: encoding?.defaultEncoding ?? def?.defaultEncoding ?? 'utf-8',
    prohibitBom: encoding?.prohibitBom ?? def?.prohibitBom ?? true,
    detectMojibake: encoding?.detectMojibake ?? def?.detectMojibake ?? true,
    allowedExtensions: encoding?.allowedExtensions
      ? [...encoding.allowedExtensions]
      : def?.allowedExtensions,
    exemptGlobs: encoding?.exemptGlobs ? [...encoding.exemptGlobs] : (def?.exemptGlobs ?? [])
  };
}

function buildRunnerConfig(runner: DeepPartial<AuditRunnerConfig> | undefined): AuditRunnerConfig {
  const base = buildBaseSubsystemConfig<AuditRunnerConfig>(runner, true);
  return {
    ...base,
    timeoutMs: runner?.timeoutMs ?? 0,
    concurrency: runner?.concurrency,
    maxStalenessMinutes: runner?.maxStalenessMinutes ?? DEFAULT_MAX_AUDIT_STALENESS_MINUTES
  };
}

export function defineAuditConfig(
  config: DeepPartial<AuditEngineConfig> & { name: string }
): AuditEngineConfig {
  const declared = collectDeclaredSubsystems(config);
  const agentAndSecurity = buildAgentAndSecurityConfig(config);
  const constantsAndDoc = buildConstantsAndDocConfig(config);
  const rawPaths = (config as AuditEngineConfig)._rawPaths ?? config.paths;
  const rawConfig = (config as AuditEngineConfig)._rawConfig ?? config;
  const paths = buildPathsConfig(config.paths);

  return {
    name: config.name,
    ratchet: buildRatchetConfig(config.ratchet),
    valibot: buildValibotConfig(config.valibot),
    paths,
    persistence: buildPersistenceConfig(config.persistence),
    domain: buildDomainConfig(config.domain),
    gitIgnore: buildGitIgnoreConfig(config.gitIgnore),
    templates: buildTemplatesConfig(config.templates),
    styles: buildStylesConfig(config.styles, config.stylelint),
    stylelint: buildStandaloneStylelintConfig(config.stylelint, config.styles?.stylelint),
    oxlint: buildOxlintConfig(config.oxlint),
    oxfmt: buildOxfmtConfig(config.oxfmt),
    htmlValidate: buildHtmlValidateConfig(config.htmlValidate),
    vitePlusConfig: buildVitePlusConfig(config.vitePlusConfig),
    bundle: buildBundleConfig(config.bundle),
    fallow: buildFallowConfig(config.fallow, config.security),
    packageHygiene: buildPackageHygieneConfig(config.packageHygiene),
    packageDistribution: buildPackageDistributionConfig(config.packageDistribution),
    packageScripts: buildPackageScriptsConfig(config.packageScripts),
    scriptCommands: buildScriptCommandsConfig(config.scriptCommands),
    environment: buildEnvironmentConfig(config.environment),
    auditorHygiene: buildAuditorHygieneConfig(config.auditorHygiene),
    scriptExtensions: buildScriptExtensionsConfig(config.scriptExtensions),
    accessibility: buildAccessibilityConfig(config.accessibility),
    typeCoverage: buildTypeCoverageConfig(config.typeCoverage),
    testCoverage: buildTestCoverageConfig(config.testCoverage),
    version: buildVersionConfig(config.version),
    secretLeaks: buildSecretLeaksConfig(config.secretLeaks),
    dependencyVulnerabilities: buildDependencyVulnerabilitiesConfig(
      config.dependencyVulnerabilities
    ),
    coverage: buildCoverageConfig(config.coverage, paths),
    webPerformance: buildWebPerformanceConfig(config.webPerformance),
    queryPerformance: buildQueryPerformanceConfig(config.queryPerformance),
    securityHardening: buildSecurityHardeningConfig(config.securityHardening),
    codeSimplification: buildCodeSimplificationConfig(config.codeSimplification),
    scssArchitecture: buildScssArchitectureConfig(config.scssArchitecture),
    types: buildTypesConfig(config.types),
    encoding: buildEncodingConfig(config.encoding),
    ...agentAndSecurity,
    ...constantsAndDoc,
    customFamilies: config.customFamilies ?? [],
    extensions: config.extensions ?? [],
    presets: (config.presets as Record<string, readonly string[]>) ?? {},
    runner: buildRunnerConfig(config.runner),
    _declaredSubsystems: declared,
    _rawPaths: rawPaths,
    _rawConfig: rawConfig
  };
}
