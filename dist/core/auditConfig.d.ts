/**
 * packages/auditor/src/core/auditConfig.ts
 *
 * UNIFIED AUDIT ENGINE CONFIGURATION (Node.js 26+)
 * Canonical configuration contract, schema defaults, loader, and accessor for the generic auditor.
 */
/**
 * Normalizes and cleans file paths safely using Node.js native path primitives.
 */
export declare function sanitizePath(inputPath: string): string;
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
    readonly forbiddenUiImports?: readonly {
        readonly module: string;
        readonly reason: string;
    }[];
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
export interface AuditDocumentationConfig {
    readonly knownValidAbstractPaths?: readonly string[];
    readonly skillsRoots?: readonly string[];
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
export interface AuditFallowConfig {
    readonly enabled?: boolean;
    readonly security?: AuditSecurityConfig;
    readonly enforceTargets?: boolean;
    readonly maxTargetPriority?: 'critical' | 'high' | 'all';
    readonly similarCode?: AuditFallowSimilarCodeConfig;
    readonly flags?: AuditFallowFlagsConfig;
    readonly coverage?: AuditFallowCoverageConfig;
}
export declare const DEFAULT_MAX_AUDIT_STALENESS_MINUTES = 5;
export interface AuditRunnerConfig {
    /**
     * Timeout in milliseconds for sub-auditors execution.
     * Default: 0 (disabled - sub-auditors run to completion without arbitrary kills).
     * Set to a positive number (e.g. 3600000 for 1 hour) to enforce a safety ceiling.
     */
    readonly timeoutMs?: number;
    /**
     * Worker concurrency limit.
     */
    readonly concurrency?: number;
    /**
     * Maximum allowed age in minutes for scratch/audits/latest_audit.json before being considered stale.
     * Default: 5 minutes.
     * In large codebases where full audits take longer, configure e.g. 15 or 30 minutes.
     */
    readonly maxStalenessMinutes?: number;
}
export interface AuditPackageHygieneConfig {
    readonly enabled?: boolean;
    readonly ignoreDependencies?: readonly string[];
    readonly ignoreBinaries?: readonly string[];
    readonly entry?: readonly string[];
    readonly project?: readonly string[];
}
export interface AuditPackageDistributionConfig {
    readonly enabled: boolean;
    readonly pkgDir?: string;
    readonly level?: 'suggestion' | 'warning' | 'error';
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
export interface AuditVersionTargetConfig {
    readonly path: string;
    readonly type?: 'json' | 'ts';
    readonly jsonField?: string;
    readonly prefixV?: boolean;
    readonly tsExportName?: string;
}
export interface AuditVersionConfig {
    readonly enabled?: boolean;
    readonly autoSyncPublicVersionJson?: boolean;
    readonly syncTargets?: readonly (string | AuditVersionTargetConfig)[];
}
/** Exemption policies whose silencing can be acknowledged (configured, not structural). */
export declare const ACKNOWLEDGEABLE_EXEMPTION_POLICIES: readonly ["cli", "scripts", "data", "demo", "exemptFiles"];
export type AcknowledgeableExemptionPolicy = (typeof ACKNOWLEDGEABLE_EXEMPTION_POLICIES)[number];
export interface AuditCoverageExemption {
    /** POSIX glob of tracked files that no suite needs to analyze. */
    readonly glob: string;
    /** Mandatory justification (>= 15 characters). */
    readonly reason: string;
}
export interface AuditCoverageAcknowledgedDegradation {
    /** Configured exemption policy whose silencing is intentional for the matched files. */
    readonly policy: AcknowledgeableExemptionPolicy;
    readonly glob: string;
    readonly reason: string;
}
export interface AuditCoverageConfig {
    /** Blind-spot detection (uncovered files, drift, dormant rules, degraded coverage). Active by default. */
    readonly enabled?: boolean;
    readonly exemptGlobs?: readonly AuditCoverageExemption[];
    readonly acknowledgedDegradations?: readonly AuditCoverageAcknowledgedDegradation[];
}
export interface AuditEngineConfig {
    readonly name: string;
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
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends readonly (infer U)[] ? readonly U[] : T[P] extends object ? DeepPartial<T[P]> : T[P];
};
export declare const DEFAULT_AUDIT_CONFIG: AuditEngineConfig;
export declare const FORBIDDEN_PRODUCTION_ROOTS: readonly string[];
export declare const MAX_CONSTANTS_EXEMPT_GLOBS = 15;
export declare function validateConstantsExemptGlobs(globs: readonly string[]): void;
export declare const MIN_COVERAGE_REASON_LENGTH = 15;
export declare function defineAuditConfig(config: DeepPartial<AuditEngineConfig> & {
    name: string;
}): AuditEngineConfig;
/**
 * Validates that all required subsystems have valid active or explicitly disabled settings.
 * Enforces the "Active by Default Subsystem Mandate & Zero Silent Skips".
 */
export declare function assertAuditConfigComplete(config: AuditEngineConfig): void;
/**
 * Serializes the active configuration so child worker processes automatically inherit it.
 * Populates process.env.AUDIT_ACTIVE_CONFIG_FILE with an ephemeral file path in scratch/cache/
 * and process.env.AUDIT_CONFIG_DATA with the inline JSON if within size limits.
 */
export declare function serializeAuditConfigToEnv(config: AuditEngineConfig, projectRoot?: string): void;
/**
 * Synchronously loads audit.config.ts or audit.config.json if possible, or falls back to defaults.
 */
export declare function loadAuditConfig(projectRoot?: string): Promise<AuditEngineConfig>;
/**
 * Returns current configuration or default if not yet loaded.
 */
export declare function getAuditConfig(projectRoot?: string): AuditEngineConfig;
/**
 * Manually sets the active configuration in memory (useful for tests or custom runners).
 */
export declare function setAuditConfig(config: AuditEngineConfig, projectRoot?: string): void;
/**
 * For testing purposes: resets the cached config and clears inherited environment configuration.
 */
export declare function resetAuditConfig(): void;
/**
 * Helper to check if a normalized path matches any of the given root directories.
 */
export declare function matchesAnyRoot(normalizedPath: string, roots: readonly string[]): boolean;
/**
 * Determines whether a file path belongs to a test, spec, mock, or e2e directory
 * driven dynamically by the project's audit.config.ts configuration.
 */
export declare function isTestPath(filePath: string): boolean;
/**
 * Determines whether a file path belongs to a data catalog directory (e.g. static game data,
 * catalogs, domain fixtures) configured in paths.dataRoots.
 */
export declare function isDataPath(filePath: string): boolean;
/**
 * Determines whether a file path belongs to a demo/showcase/mock directory
 * configured in paths.demoRoots.
 */
export declare function isDemoPath(filePath: string): boolean;
/**
 * Determines whether a file path belongs to a constants definition directory or module
 * configured in paths.constantsRoots or located within a /constants/ directory.
 */
export declare function isConstantsPath(filePath: string): boolean;
/**
 * Checks whether a file path belongs to an explicitly exempt file in paths.exemptFiles.
 */
export declare function isExemptFile(filePath: string, config?: AuditEngineConfig): boolean;
/**
 * Determines whether a file path belongs to codeRoots configured for general code audits,
 * dynamically respecting whether test directories are included or excluded.
 */
export declare function isInCodeRoots(filePath: string, config?: AuditEngineConfig): boolean;
/**
 * Determines whether the specified project root is the @francogp/auditor provider repository itself.
 */
export declare function isSelfProviderProject(projectRoot: string): boolean;
/**
 * Checks whether a file path belongs to scriptsRoots.
 */
export declare function isScriptPath(filePath: string, config?: AuditEngineConfig): boolean;
/**
 * Checks whether a file path belongs to srcRoots.
 */
export declare function isSrcPath(filePath: string, config?: AuditEngineConfig): boolean;
/**
 * Checks whether a file path belongs to cliRoots.
 */
export declare function isCliPath(filePath: string, config?: AuditEngineConfig): boolean;
/**
 * Resolves the primary SCSS file path for Z-Layers from config or stylesRoots.
 */
export declare function resolveZLayersScssPath(projectRoot?: string): string | undefined;
/**
 * Canonical fallback Z-Layers scale matching framework standards.
 */
export declare const Z_LAYERS: Readonly<Record<string, number>>;
/**
 * Resolves the effective Z-Layers dictionary from config.styles.zLayers,
 * or by parsing the TypeScript file defined in config.styles.zLayersTsFile or config.domain.zLayersFile,
 * or falls back to the default Z_LAYERS.
 */
export declare function getEffectiveZLayers(projectRoot?: string): Record<string, number>;
//# sourceMappingURL=auditConfig.d.ts.map