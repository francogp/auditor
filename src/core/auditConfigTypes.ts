/**
 * packages/auditor/src/core/auditConfigTypes.ts
 *
 * TypeScript types and interfaces for the audit configuration contract.
 */

export const AUDITOR_DIR = '.auditor';
export const AUDIT_CONFIG_FILE = `${AUDITOR_DIR}/audit.config.ts`; // Canonical relative configuration path constant
export const AUDIT_CONFIG_JSON_FILE = `${AUDITOR_DIR}/audit.config.json`; // Canonical relative configuration path constant
export const LEGACY_ROOT_CONFIG_FILES = ['audit.config.ts', 'audit.config.json'] as const;

/**
 * Generic base contract for all subsystem configurations in audit.config.ts.
 * Enforces universal 'enabled' state, section-specific path ignores/exemptions,
 * and open indexing for sub-auditor and host extensions.
 */
export interface BaseAuditSubsystemConfig {
  readonly enabled: boolean;
  readonly ignoreGlobs?: readonly string[];
  readonly exemptPaths?: readonly string[];
  readonly exemptFiles?: readonly string[];
  readonly [key: string]: unknown;
}

export interface AuditPathsConfig extends BaseAuditSubsystemConfig {
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
  readonly unignoreDirs?: readonly string[];
  readonly ignoredPatterns?: readonly string[];
  readonly testFilePatterns?: readonly string[];
  readonly testFragmentationWhitelist?: readonly string[];
  readonly skillsLockFile?: string;
}

export const AUDIT_LIST_FILTERS = ['all', 'enabled', 'disabled'] as const;
export type AuditListFilter = (typeof AUDIT_LIST_FILTERS)[number];

export const PERSISTENCE_ENGINES = ['supabase', 'sqlite', 'postgres', 'hybrid', 'none'] as const;
export type PersistenceEngine = (typeof PERSISTENCE_ENGINES)[number];

export interface AuditPersistenceConfig extends BaseAuditSubsystemConfig {
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

export interface AuditDomainConfig extends BaseAuditSubsystemConfig {
  readonly timezoneVariable?: string;
  readonly timezoneHelperModule?: string;
  readonly loggerModule?: string;
  readonly zLayersFile?: string;
  readonly finiteDomainTypes?: readonly string[];
  readonly infraIdWhitelist?: readonly string[];
  readonly fallbackIdPatterns?: readonly string[];
  readonly o1CatalogPatterns?: readonly O1CatalogPatternConfig[];
  readonly exemptSignatures?: readonly string[];
  readonly exemptCollections?: readonly string[];
  readonly caseNormalizationExemptTokens?: readonly string[];
  readonly exemptComparisonTokens?: readonly string[];
  readonly allowedStoreSetterPrefixes?: readonly string[];
  readonly allowedNumericConstantPrefixes?: readonly string[];
  readonly textualFields?: readonly string[];
  readonly exemptPaths?: readonly string[];
  readonly exemptFiles?: readonly string[];
  readonly ignoreGlobs?: readonly string[];
}

export interface CustomAuditFamilyConfig {
  readonly key: string;
  readonly title: string;
  readonly order?: number;
  readonly icon?: string;
  readonly description?: string;
}

export interface AuditTemplatesConfig extends BaseAuditSubsystemConfig {
  readonly requireInputIds?: boolean;
  readonly tooltipComponents?: readonly string[];
  readonly forbiddenTemplateCallPatterns?: readonly string[];
  readonly safeTemplateFunctions?: readonly string[];
}

export interface AuditCssDuplicatesConfig extends BaseAuditSubsystemConfig {
  readonly minDeclarations?: number;
  readonly checkSimilar?: boolean;
  readonly similarityThreshold?: number;
  readonly checkLongLines?: boolean;
  readonly longLineLengthThreshold?: number;
  readonly checkColors?: boolean;
  readonly checkEmptyRules?: boolean;
  readonly checkUnused?: boolean;
}

export interface AuditStylelintStrictValuesConfig extends BaseAuditSubsystemConfig {
  readonly properties?: readonly string[];
  readonly ignoreValues?: Record<string, readonly string[]>;
  readonly ignoreAtRules?: readonly string[];
}

export interface AuditStylelintOrderConfig extends BaseAuditSubsystemConfig {
  readonly enforceHasBlockPartitioning?: boolean;
}

export interface AuditStylelintConfig extends BaseAuditSubsystemConfig {
  readonly configFile?: string;
  readonly rules?: Record<string, unknown>;
  readonly ignoreGlobs?: readonly string[];
  readonly strictValues?: AuditStylelintStrictValuesConfig;
  readonly order?: AuditStylelintOrderConfig;
}

export interface AuditOxlintConfig extends BaseAuditSubsystemConfig {}

export interface AuditHtmlValidateConfig extends BaseAuditSubsystemConfig {}

export interface AuditStylesConfig extends BaseAuditSubsystemConfig {
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
  readonly enforceScss?: boolean;
  readonly exemptCssFiles?: readonly string[];
  readonly exemptPaths?: readonly string[];
  readonly ignoreGlobs?: readonly string[];
}

export interface AuditE2eConfig extends BaseAuditSubsystemConfig {
  readonly idLocatorsOnly?: boolean;
}

export interface ChunkBudgetConfig {
  readonly name: string;
  readonly prefix?: string;
  readonly matcher?: string;
  readonly limitBytes: number;
}

export interface AuditBundleConfig extends BaseAuditSubsystemConfig {
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

export interface AuditAgentPluginConfig extends BaseAuditSubsystemConfig {}

export interface AuditAnimationConfig extends BaseAuditSubsystemConfig {
  readonly customTimerFunctions?: readonly string[];
  readonly exemptPaths?: readonly string[];
  readonly exemptFiles?: readonly string[];
  readonly ignoreGlobs?: readonly string[];
}

export interface AuditTypesConfig extends BaseAuditSubsystemConfig {
  readonly exemptPaths?: readonly string[];
  readonly exemptFiles?: readonly string[];
  readonly ignoreGlobs?: readonly string[];
}

export interface AuditEncodingConfig extends BaseAuditSubsystemConfig {
  readonly defaultEncoding?: 'utf-8';
  readonly prohibitBom?: boolean;
  readonly detectMojibake?: boolean;
  readonly allowedExtensions?: readonly string[];
  readonly exemptGlobs?: readonly string[];
  readonly exemptPaths?: readonly string[];
  readonly exemptFiles?: readonly string[];
}

export interface AuditConstantsConfig extends BaseAuditSubsystemConfig {
  readonly ignoredNames?: readonly string[];
  readonly exemptMagicNumbers?: readonly number[];
  readonly allowedNumericPrefixes?: readonly string[];
  readonly exemptPaths?: readonly string[];
  readonly exemptFiles?: readonly string[];
  readonly ignoreGlobs?: readonly string[];
}

export interface AuditSecurityConfig extends BaseAuditSubsystemConfig {}

export type DocumentationLanguage = 'en' | 'es';

export interface AuditDoxConfig extends BaseAuditSubsystemConfig {
  readonly ignoreGlobs?: readonly string[];
}

export interface AuditDocumentationConfig extends BaseAuditSubsystemConfig {
  readonly language: DocumentationLanguage;
  readonly chatLanguage: DocumentationLanguage;
  readonly knownValidAbstractPaths?: readonly string[];
  readonly skillsRoots?: readonly string[];
  readonly unignoreDirs?: readonly string[];
  readonly allowedNpxBinaries?: readonly string[];
  readonly languageExemptions?: readonly string[];
}

export interface AuditPiniaConfig extends BaseAuditSubsystemConfig {
  readonly authorizedMutationFiles?: readonly string[];
}

export interface AuditFallowSimilarCodeConfig extends BaseAuditSubsystemConfig {
  readonly threshold?: number;
  readonly ignoreSameFile?: boolean;
  readonly minLines?: number;
  readonly timeoutMs?: number;
}

export interface AuditFallowFlagsConfig extends BaseAuditSubsystemConfig {
  readonly maxFlagAgeDays?: number;
  readonly trackRetirement?: boolean;
}

export interface AuditFallowCoverageConfig extends BaseAuditSubsystemConfig {
  readonly path?: string;
  readonly root?: string;
}

export interface AuditFallowDuplicatesConfig extends BaseAuditSubsystemConfig {
  readonly mode?: 'strict' | 'mild' | 'weak' | 'semantic';
  readonly nearMiss?: boolean;
  readonly minTokens?: number;
  readonly minLines?: number;
  readonly minOccurrences?: number;
}

export interface AuditFallowVizConfig extends BaseAuditSubsystemConfig {
  readonly outputPath?: string;
}

export const FALLOW_TARGET_PRIORITIES = [
  'critical',
  'high',
  'medium',
  'moderate',
  'low',
  'all'
] as const;
export type FallowTargetPriorityNamed = (typeof FALLOW_TARGET_PRIORITIES)[number];
export type FallowTargetPriority = FallowTargetPriorityNamed | number;

export interface AuditFallowConfig extends BaseAuditSubsystemConfig {
  readonly security?: AuditSecurityConfig;
  readonly enforceTargets?: boolean;
  readonly maxTargetPriority?: FallowTargetPriority;
  readonly similarCode?: AuditFallowSimilarCodeConfig;
  readonly flags?: AuditFallowFlagsConfig;
  readonly coverage?: AuditFallowCoverageConfig;
  readonly typeAware?: boolean;
  readonly showCascade?: boolean;
  readonly duplicates?: AuditFallowDuplicatesConfig;
  readonly viz?: AuditFallowVizConfig;
}

export const DEFAULT_MAX_AUDIT_STALENESS_MINUTES = 5;

export interface AuditRunnerConfig extends BaseAuditSubsystemConfig {
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly maxStalenessMinutes?: number;
}

export interface AuditPackageHygieneConfig extends BaseAuditSubsystemConfig {
  readonly ignoreDependencies?: readonly string[];
  readonly ignoreBinaries?: readonly string[];
  readonly entry?: readonly string[];
  readonly project?: readonly string[];
}

export const PACKAGE_DISTRIBUTION_LEVELS = ['suggestion', 'warning', 'error'] as const;
export type PackageDistributionLevel = (typeof PACKAGE_DISTRIBUTION_LEVELS)[number];

export interface AuditPackageDistributionConfig extends BaseAuditSubsystemConfig {
  readonly pkgDir?: string;
  readonly level?: PackageDistributionLevel;
}

export interface AuditAccessibilityConfig extends BaseAuditSubsystemConfig {
  readonly rules?: Record<string, boolean>;
}

export interface AuditTypeCoverageConfig extends BaseAuditSubsystemConfig {
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

export interface AuditGitIgnoreConfig extends BaseAuditSubsystemConfig {
  readonly extraRequiredEntries?: readonly (string | AuditGitIgnoreCustomEntry)[];
}

export interface AuditPackageScriptsConfig extends BaseAuditSubsystemConfig {
  readonly enforceBuildAudit?: boolean;
  readonly recommendedScripts?: boolean;
  readonly extraRequiredScripts?: readonly string[];
}

export interface AuditScriptCommandsConfig extends BaseAuditSubsystemConfig {
  readonly exemptGlobs?: readonly string[];
  readonly allowedNpxBinaries?: readonly string[];
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

export interface AuditVersionConfig extends BaseAuditSubsystemConfig {
  readonly autoSyncPublicVersionJson?: boolean;
  readonly syncTargets?: readonly (string | AuditVersionTargetConfig)[];
}

export interface AuditSecretLeaksConfig extends BaseAuditSubsystemConfig {
  readonly maskSecrets?: boolean;
  readonly allowedPatterns?: readonly string[];
  readonly exemptGlobs?: readonly string[];
}

export const NPM_AUDIT_SEVERITY_LEVELS = ['info', 'low', 'moderate', 'high', 'critical'] as const;
export type NpmAuditSeverityLevel = (typeof NPM_AUDIT_SEVERITY_LEVELS)[number];

export interface AuditDependencyVulnerabilitiesConfig extends BaseAuditSubsystemConfig {
  readonly failOn?: NpmAuditSeverityLevel;
  readonly allowList?: readonly string[];
  readonly includeDev?: boolean;
}

export const ACKNOWLEDGEABLE_EXEMPTION_POLICIES = [
  'cli',
  'scripts',
  'data',
  'demo',
  'exemptFiles'
] as const;
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

export interface AuditCoverageConfig extends BaseAuditSubsystemConfig {
  readonly exemptGlobs?: readonly AuditCoverageExemption[];
  readonly acknowledgedDegradations?: readonly AuditCoverageAcknowledgedDegradation[];
}

export interface AuditRatchetConfig extends BaseAuditSubsystemConfig {
  readonly productionRef?: string;
  readonly baselineFile?: string;
}

export interface ResolvedRatchetConfig extends BaseAuditSubsystemConfig {
  readonly productionRef: string;
  readonly baselineFile: string;
}

export interface AuditTestCoverageConfig extends BaseAuditSubsystemConfig {
  readonly threshold?: number;
  readonly path?: string;
  readonly runCommand?: string;
  readonly roots?: readonly string[];
  readonly extensions?: readonly string[];
  readonly exemptGlobs?: readonly string[];
  readonly directoryThresholds?: Record<string, number>;
  readonly enforceInAudit?: boolean;
}

export interface ResolvedTestCoverageConfig extends BaseAuditSubsystemConfig {
  readonly threshold: number;
  readonly path: string;
  readonly runCommand: string;
  readonly roots: readonly string[];
  readonly extensions: readonly string[];
  readonly exemptGlobs: readonly string[];
  readonly directoryThresholds: Record<string, number>;
  readonly enforceInAudit: boolean;
}

export interface ValibotNestedParityTarget {
  readonly id: string;
  readonly interfaceName: string;
  readonly schemaVarName: string;
  readonly serializerFunctionName?: string;
  readonly initialStateProperty?: string;
}

export interface ValibotParityTarget {
  readonly id: string;
  readonly typesFile: string;
  readonly interfaceName: string;
  readonly schemaFile: string;
  readonly schemaVarName: string;
  readonly ephemeralTypeAlias?: string;
  readonly ephemeralKeys?: readonly string[];
  readonly serializerFile?: string;
  readonly serializerFunctionName?: string;
  readonly initialStateFile?: string;
  readonly initialStateFunctionName?: string;
  readonly nestedTargets?: readonly ValibotNestedParityTarget[];
  readonly allowedNullableFields?: readonly string[];
  readonly allowedUnknownFields?: readonly string[];
}

export interface AuditValibotConfig extends BaseAuditSubsystemConfig {
  readonly targets?: readonly ValibotParityTarget[];
}

export interface AuditEnvironmentConfig extends BaseAuditSubsystemConfig {}

export interface AuditAuditorHygieneConfig extends BaseAuditSubsystemConfig {
  readonly roots?: readonly string[];
  readonly disabledDetectors?: readonly string[];
}

export interface AuditScriptExtensionsConfig extends BaseAuditSubsystemConfig {
  readonly enforceTypeScript?: boolean;
  readonly allowMjs?: boolean;
  readonly allowCjs?: boolean;
  readonly allowJsScripts?: boolean;
}

export interface AuditWebPerformanceConfig extends BaseAuditSubsystemConfig {
  readonly maxDomDepth?: number;
  readonly maxInlineSvgSize?: number;
  readonly exemptSvgPaths?: readonly string[];
  readonly exemptImgClasses?: readonly string[];
}

export interface AuditQueryPerformanceConfig extends BaseAuditSubsystemConfig {
  readonly excludeMigrationsDir?: boolean;
  readonly exemptSelectStarPaths?: readonly string[];
}

export interface AuditSecurityHardeningConfig extends BaseAuditSubsystemConfig {}

export interface AuditCodeSimplificationConfig extends BaseAuditSubsystemConfig {
  readonly maxNestingDepth?: number;
  readonly allowMatrixLoops?: boolean;
}

export interface AuditScssArchitectureConfig extends BaseAuditSubsystemConfig {
  readonly maxNestingDepth?: number;
  readonly scopedMaxNestingDepth?: number;
  readonly allowPixelArtSpacing?: boolean;
  readonly allowedSpacingUnits?: readonly string[];
  readonly allowScopedColors?: boolean;
}

export const CANONICAL_RULE_SEVERITY_LEVELS = ['error', 'warn', 'off'] as const;
export type CanonicalRuleSeverityLevel = (typeof CANONICAL_RULE_SEVERITY_LEVELS)[number];
export type OxlintCategorySeverity = CanonicalRuleSeverityLevel;

export interface OxlintCategoriesConfig {
  readonly correctness?: OxlintCategorySeverity;
  readonly suspicious?: OxlintCategorySeverity;
  readonly pedantic?: OxlintCategorySeverity;
  readonly perf?: OxlintCategorySeverity;
  readonly style?: OxlintCategorySeverity;
  readonly restriction?: OxlintCategorySeverity;
  readonly nursery?: OxlintCategorySeverity;
  readonly a11y?: OxlintCategorySeverity;
}

export interface VitePlusFmtOverrideConfig {
  readonly files: readonly string[];
  readonly options: {
    readonly tabWidth?: number;
    readonly singleQuote?: boolean;
    readonly semi?: boolean;
    readonly printWidth?: number;
  };
}

export interface AuditVitePlusFmtConfig extends BaseAuditSubsystemConfig {
  readonly singleQuote?: boolean;
  readonly semi?: boolean;
  readonly trailingComma?: 'none' | 'all' | 'es5';
  readonly tabWidth?: number;
  readonly useTabs?: boolean;
  readonly printWidth?: number;
  readonly sortPackageJson?: boolean;
  readonly sortImports?: boolean;
  readonly ignorePatterns?: readonly string[];
  readonly overrides?: readonly VitePlusFmtOverrideConfig[];
}

export interface VitePlusLintOverrideConfig {
  readonly files: readonly string[];
  readonly rules: Record<string, 'error' | 'warn' | 'off' | readonly unknown[]>;
}

export interface AuditVitePlusLintConfig extends BaseAuditSubsystemConfig {
  readonly typeAware?: boolean;
  readonly typeCheck?: boolean;
  readonly categories?: OxlintCategoriesConfig;
  readonly rules?: Record<string, 'error' | 'warn' | 'off' | readonly unknown[]>;
  readonly ignorePatterns?: readonly string[];
  readonly overrides?: readonly VitePlusLintOverrideConfig[];
}

export interface AuditVitePlusStagedConfig extends BaseAuditSubsystemConfig {
  readonly rules?: Record<string, string>;
}

export interface AuditVitePlusHooksConfig extends BaseAuditSubsystemConfig {}

export interface AuditVitePlusVSCodeConfig extends BaseAuditSubsystemConfig {
  readonly formatOnSave?: boolean;
  readonly defaultFormatter?: string;
  readonly unwantedRecommendations?: readonly string[];
}

export type VitePrecompressReportMode = 'summary' | 'silent' | 'table';
export type PrecompressServerTarget = 'nginx' | 'apache' | 'caddy' | 'all';

export interface AuditVitePlusPrecompressConfig extends BaseAuditSubsystemConfig {
  readonly brotli?: boolean;
  readonly gzip?: boolean;
  readonly server?: PrecompressServerTarget;
  readonly spa?: boolean;
  readonly report?: VitePrecompressReportMode;
  readonly threshold?: number;
  readonly outDir?: string;
}

export interface AuditVitePlusConfig extends BaseAuditSubsystemConfig {
  readonly precompress?: AuditVitePlusPrecompressConfig;
  readonly fmt?: AuditVitePlusFmtConfig;
  readonly lint?: AuditVitePlusLintConfig;
  readonly staged?: AuditVitePlusStagedConfig | Record<string, string>;
  readonly hooks?: AuditVitePlusHooksConfig;
  readonly vscode?: AuditVitePlusVSCodeConfig;
  readonly extraLintRules?: Record<string, CanonicalRuleSeverityLevel>;
}

export interface AuditOxfmtConfig extends BaseAuditSubsystemConfig {}

export type DeepPartial<T> = {
  [P in keyof T]?: string extends P
    ? unknown
    : NonNullable<T[P]> extends Function
      ? T[P]
      : NonNullable<T[P]> extends readonly (infer U)[]
        ? readonly U[]
        : NonNullable<T[P]> extends ReadonlySet<infer S>
          ? ReadonlySet<S>
          : NonNullable<T[P]> extends ReadonlyMap<infer K, infer V>
            ? ReadonlyMap<K, V>
            : NonNullable<T[P]> extends object
              ? DeepPartial<NonNullable<T[P]>>
              : T[P];
};

export interface AuditEngineConfig {
  readonly [key: string]: unknown;
  readonly name: string;
  readonly auditorVersion?: string;
  readonly ratchet?: AuditRatchetConfig;
  readonly testCoverage?: AuditTestCoverageConfig;
  readonly valibot?: AuditValibotConfig;
  readonly paths: AuditPathsConfig;
  readonly persistence: AuditPersistenceConfig;
  readonly domain: AuditDomainConfig;
  readonly environment?: AuditEnvironmentConfig;
  readonly auditorHygiene?: AuditAuditorHygieneConfig;
  readonly scriptExtensions?: AuditScriptExtensionsConfig;
  readonly gitIgnore?: AuditGitIgnoreConfig;
  readonly templates?: AuditTemplatesConfig;
  readonly styles?: AuditStylesConfig;
  readonly stylelint?: AuditStylelintConfig;
  readonly oxlint?: AuditOxlintConfig;
  readonly oxfmt?: AuditOxfmtConfig;
  readonly vitePlusConfig?: AuditVitePlusConfig;
  readonly htmlValidate?: AuditHtmlValidateConfig;
  readonly bundle?: AuditBundleConfig;
  readonly agentPlugin?: AuditAgentPluginConfig;
  readonly animation?: AuditAnimationConfig;
  readonly constants?: AuditConstantsConfig;
  readonly security?: AuditSecurityConfig;
  readonly documentation?: AuditDocumentationConfig;
  readonly dox?: AuditDoxConfig;
  readonly pinia?: AuditPiniaConfig;
  readonly fallow?: AuditFallowConfig;
  readonly e2e?: AuditE2eConfig;
  readonly packageHygiene?: AuditPackageHygieneConfig;
  readonly packageDistribution?: AuditPackageDistributionConfig;
  readonly packageScripts?: AuditPackageScriptsConfig;
  readonly scriptCommands?: AuditScriptCommandsConfig;
  readonly accessibility?: AuditAccessibilityConfig;
  readonly typeCoverage?: AuditTypeCoverageConfig;
  readonly types?: AuditTypesConfig;
  readonly encoding?: AuditEncodingConfig;
  readonly version?: AuditVersionConfig;
  readonly secretLeaks?: AuditSecretLeaksConfig;
  readonly dependencyVulnerabilities?: AuditDependencyVulnerabilitiesConfig;
  readonly coverage?: AuditCoverageConfig;
  readonly webPerformance?: AuditWebPerformanceConfig;
  readonly queryPerformance?: AuditQueryPerformanceConfig;
  readonly securityHardening?: AuditSecurityHardeningConfig;
  readonly codeSimplification?: AuditCodeSimplificationConfig;
  readonly scssArchitecture?: AuditScssArchitectureConfig;
  readonly customFamilies?: readonly CustomAuditFamilyConfig[];
  readonly extensions?: readonly string[];
  readonly presets?: Record<string, readonly string[]>;
  readonly runner?: AuditRunnerConfig;
  readonly _declaredSubsystems?: ReadonlySet<string>;
  readonly _rawPaths?: Readonly<DeepPartial<AuditEngineConfig['paths']>>;
  readonly _rawConfig?: Readonly<DeepPartial<AuditEngineConfig>>;
}

export type AuditConfig = AuditEngineConfig; // Type contract declaration
