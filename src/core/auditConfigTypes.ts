/**
 * packages/auditor/src/core/auditConfigTypes.ts
 *
 * TypeScript types and interfaces for the audit configuration contract.
 */

export const AUDITOR_DIR = '.auditor';
export const AUDIT_CONFIG_FILE = `${AUDITOR_DIR}/audit.config.ts`; // path-ok: Canonical relative configuration path constant
export const AUDIT_CONFIG_JSON_FILE = `${AUDITOR_DIR}/audit.config.json`; // path-ok: Canonical relative configuration path constant
export const LEGACY_ROOT_CONFIG_FILES = ['audit.config.ts', 'audit.config.json'] as const;

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
  readonly demoRoots?: readonly string[];
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
  readonly skillsLockFile?: string;
}

export const AUDIT_LIST_FILTERS = ['all', 'enabled', 'disabled'] as const;
export type AuditListFilter = (typeof AUDIT_LIST_FILTERS)[number];

export const PERSISTENCE_ENGINES = ['supabase', 'sqlite', 'postgres', 'hybrid', 'none'] as const;
export type PersistenceEngine = (typeof PERSISTENCE_ENGINES)[number];

export interface AuditPersistenceConfig {
  readonly engine: PersistenceEngine;
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
  readonly exemptRlsTables?: readonly string[];
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

export interface AuditCssDuplicatesConfig {
  readonly enabled?: boolean;
  readonly minDeclarations?: number;
  readonly checkSimilar?: boolean;
  readonly similarityThreshold?: number;
  readonly checkLongLines?: boolean;
  readonly longLineLengthThreshold?: number;
  readonly checkColors?: boolean;
  readonly checkEmptyRules?: boolean;
  readonly checkUnused?: boolean;
}

export interface AuditStylelintConfig {
  readonly enabled?: boolean;
  readonly configFile?: string;
  readonly rules?: Record<string, unknown>;
  readonly ignoreGlobs?: readonly string[];
}

export interface AuditEslintConfig {
  readonly enabled?: boolean;
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
  readonly duplicates?: AuditCssDuplicatesConfig;
  readonly stylelint?: AuditStylelintConfig;
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
  readonly exemptGlobs?: readonly string[];
}

export interface AuditSecurityConfig {
  readonly enabled?: boolean;
}

export type DocumentationLanguage = 'en' | 'es';

export interface AuditDocumentationConfig {
  readonly knownValidAbstractPaths?: readonly string[];
  readonly skillsRoots?: readonly string[];
  readonly allowedNpxBinaries?: readonly string[];
  readonly language?: DocumentationLanguage;
  readonly languageExemptions?: readonly string[];
}

export interface AuditPiniaConfig {
  readonly authorizedMutationFiles?: readonly string[];
}

export interface AuditFallowSimilarCodeConfig {
  readonly enabled?: boolean;
  readonly threshold?: number;
  readonly ignoreSameFile?: boolean;
  readonly minLines?: number;
  readonly timeoutMs?: number;
}

export interface AuditFallowFlagsConfig {
  readonly enabled?: boolean;
  readonly maxFlagAgeDays?: number;
  readonly trackRetirement?: boolean;
}

export interface AuditFallowCoverageConfig {
  readonly enabled?: boolean;
  readonly path?: string;
  readonly root?: string;
}

export const FALLOW_TARGET_PRIORITIES = ['critical', 'high', 'all'] as const;
export type FallowTargetPriority = (typeof FALLOW_TARGET_PRIORITIES)[number];

export interface AuditFallowConfig {
  readonly enabled?: boolean;
  readonly security?: AuditSecurityConfig;
  readonly enforceTargets?: boolean;
  readonly maxTargetPriority?: FallowTargetPriority;
  readonly similarCode?: AuditFallowSimilarCodeConfig;
  readonly flags?: AuditFallowFlagsConfig;
  readonly coverage?: AuditFallowCoverageConfig;
}

export const DEFAULT_MAX_AUDIT_STALENESS_MINUTES = 5;

export interface AuditRunnerConfig {
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly maxStalenessMinutes?: number;
}

export interface AuditPackageHygieneConfig {
  readonly enabled?: boolean;
  readonly ignoreDependencies?: readonly string[];
  readonly ignoreBinaries?: readonly string[];
  readonly entry?: readonly string[];
  readonly project?: readonly string[];
}

export const PACKAGE_DISTRIBUTION_LEVELS = ['suggestion', 'warning', 'error'] as const;
export type PackageDistributionLevel = (typeof PACKAGE_DISTRIBUTION_LEVELS)[number];

export interface AuditPackageDistributionConfig {
  readonly enabled: boolean;
  readonly pkgDir?: string;
  readonly level?: PackageDistributionLevel;
}

export interface AuditAccessibilityConfig {
  readonly enabled?: boolean;
  readonly rules?: Record<string, boolean>;
}

export interface AuditTypeCoverageConfig {
  readonly enabled?: boolean;
  readonly atLeast?: number;
  readonly strict?: boolean;
  readonly ignoreFiles?: readonly string[];
}

export interface AuditGitIgnoreCustomEntry {
  readonly id: string;
  readonly pattern: string;
  readonly reason: string;
  readonly samplePath?: string;
}

export interface AuditGitIgnoreConfig {
  readonly enabled?: boolean;
  readonly extraRequiredEntries?: readonly (string | AuditGitIgnoreCustomEntry)[];
}

export interface AuditPackageScriptsConfig {
  readonly enabled?: boolean;
  readonly enforceBuildAudit?: boolean;
  readonly recommendedScripts?: boolean;
  readonly extraRequiredScripts?: readonly string[];
}

export const VERSION_TARGET_TYPES = ['json', 'ts'] as const;
export type VersionTargetType = (typeof VERSION_TARGET_TYPES)[number];

export interface AuditVersionTargetConfig {
  readonly path: string;
  readonly type?: VersionTargetType;
  readonly jsonField?: string;
  readonly prefixV?: boolean;
  readonly tsExportName?: string;
}

export interface AuditVersionConfig {
  readonly enabled?: boolean;
  readonly autoSyncPublicVersionJson?: boolean;
  readonly syncTargets?: readonly (string | AuditVersionTargetConfig)[];
}

export const ACKNOWLEDGEABLE_EXEMPTION_POLICIES = ['cli', 'scripts', 'data', 'demo', 'exemptFiles'] as const;
export type AcknowledgeableExemptionPolicy = (typeof ACKNOWLEDGEABLE_EXEMPTION_POLICIES)[number];

export interface AuditCoverageExemption {
  readonly glob: string;
  readonly reason: string;
}

export interface AuditCoverageAcknowledgedDegradation {
  readonly policy: AcknowledgeableExemptionPolicy;
  readonly glob: string;
  readonly reason: string;
}

export interface AuditCoverageConfig {
  readonly enabled?: boolean;
  readonly exemptGlobs?: readonly AuditCoverageExemption[];
  readonly acknowledgedDegradations?: readonly AuditCoverageAcknowledgedDegradation[];
}

export interface AuditRatchetConfig {
  readonly enabled?: boolean;
  readonly productionRef?: string;
  readonly baselineFile?: string;
}

export interface AuditTestCoverageConfig {
  readonly enabled?: boolean;
  readonly threshold?: number;
  readonly path?: string;
  readonly runCommand?: string;
  readonly roots?: readonly string[];
  readonly extensions?: readonly string[];
  readonly exemptGlobs?: readonly string[];
  readonly directoryThresholds?: Record<string, number>;
  readonly enforceInAudit?: boolean;
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends readonly (infer U)[]
    ? readonly U[]
    : T[P] extends object
      ? DeepPartial<T[P]>
      : T[P];
};

export interface AuditEngineConfig {
  readonly name: string;
  readonly ratchet?: AuditRatchetConfig;
  readonly testCoverage?: AuditTestCoverageConfig;
  readonly paths: AuditPathsConfig;
  readonly persistence: AuditPersistenceConfig;
  readonly domain: AuditDomainConfig;
  readonly gitIgnore?: AuditGitIgnoreConfig;
  readonly templates?: AuditTemplatesConfig;
  readonly styles?: AuditStylesConfig;
  readonly stylelint?: AuditStylelintConfig;
  readonly eslint?: AuditEslintConfig;
  readonly bundle?: AuditBundleConfig;
  readonly agentPlugin?: AuditAgentPluginConfig;
  readonly animation?: AuditAnimationConfig;
  readonly constants?: AuditConstantsConfig;
  readonly security?: AuditSecurityConfig;
  readonly documentation?: AuditDocumentationConfig;
  readonly pinia?: AuditPiniaConfig;
  readonly fallow?: AuditFallowConfig;
  readonly e2e?: AuditE2eConfig;
  readonly packageHygiene?: AuditPackageHygieneConfig;
  readonly packageDistribution?: AuditPackageDistributionConfig;
  readonly packageScripts?: AuditPackageScriptsConfig;
  readonly accessibility?: AuditAccessibilityConfig;
  readonly typeCoverage?: AuditTypeCoverageConfig;
  readonly version?: AuditVersionConfig;
  readonly coverage?: AuditCoverageConfig;
  readonly customFamilies?: readonly CustomAuditFamilyConfig[];
  readonly extensions?: readonly string[];
  readonly presets?: Record<string, readonly string[]>;
  readonly runner?: AuditRunnerConfig;
  readonly _declaredSubsystems?: ReadonlySet<string>;
  readonly _rawPaths?: Readonly<DeepPartial<AuditEngineConfig['paths']>>;
  readonly _rawConfig?: Readonly<DeepPartial<AuditEngineConfig>>;
}

export type AuditConfig = AuditEngineConfig; // type-ok: Type contract declaration
