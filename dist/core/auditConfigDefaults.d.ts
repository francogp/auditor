/**
 * packages/auditor/src/core/auditConfigDefaults.ts
 *
 * Canonical default configuration, builders, and defineAuditConfig coordinator.
 */
import { type AuditEngineConfig, type DeepPartial, type AuditPersistenceConfig, type AuditDomainConfig, type AuditEnvironmentConfig, type AuditAuditorHygieneConfig, type AuditScriptExtensionsConfig, type AuditTemplatesConfig, type AuditStylesConfig, type AuditStylelintConfig, type AuditEslintConfig, type AuditBundleConfig, type AuditAgentPluginConfig, type AuditAnimationConfig, type AuditConstantsConfig, type AuditSecurityConfig, type AuditDocumentationConfig, type AuditPiniaConfig, type AuditFallowConfig, type AuditFallowSimilarCodeConfig, type AuditE2eConfig, type AuditPackageHygieneConfig, type AuditPackageDistributionConfig, type AuditPackageScriptsConfig, type AuditAccessibilityConfig, type AuditTypeCoverageConfig, type AuditGitIgnoreConfig, type AuditVersionConfig, type AuditSecretLeaksConfig, type AuditDependencyVulnerabilitiesConfig, type AuditCoverageConfig, type AuditRatchetConfig, type AuditTestCoverageConfig, type AuditValibotConfig } from './auditConfigTypes.ts';
export declare const DEFAULT_SIMILAR_CODE_THRESHOLD = 0.95;
export declare const DEFAULT_TEST_COVERAGE_PERCENTAGE = 80;
export declare const DEFAULT_TYPE_COVERAGE_AT_LEAST = 95;
export declare const DEFAULT_AUDIT_CONFIG: AuditEngineConfig;
export declare function collectDeclaredSubsystems(config: DeepPartial<AuditEngineConfig>): Set<string>;
export declare function buildPathsConfig(raw?: DeepPartial<AuditEngineConfig['paths']>): AuditEngineConfig['paths'];
export declare function buildPersistenceConfig(raw?: DeepPartial<AuditPersistenceConfig>): AuditPersistenceConfig;
export declare function buildDomainConfig(raw?: DeepPartial<AuditDomainConfig>): AuditDomainConfig;
export declare function buildTemplatesConfig(raw?: DeepPartial<AuditTemplatesConfig>): AuditTemplatesConfig;
export declare function buildStylesConfig(raw?: DeepPartial<AuditStylesConfig>, rawStylelintTop?: DeepPartial<AuditStylelintConfig>): AuditStylesConfig;
export declare function buildBundleConfig(raw?: DeepPartial<AuditBundleConfig>): AuditBundleConfig;
export declare function buildAgentAndSecurityConfig(config: DeepPartial<AuditEngineConfig>): {
    agentPlugin: AuditAgentPluginConfig;
    security: AuditSecurityConfig;
    animation: AuditAnimationConfig;
};
export declare function buildConstantsAndDocConfig(config: DeepPartial<AuditEngineConfig>): {
    constants: AuditConstantsConfig;
    documentation: AuditDocumentationConfig;
    pinia: AuditPiniaConfig;
    e2e: AuditE2eConfig;
};
export declare function buildFallowSimilarCodeConfig(raw?: DeepPartial<AuditFallowSimilarCodeConfig>): AuditFallowSimilarCodeConfig;
export declare function buildFallowConfig(raw?: DeepPartial<AuditFallowConfig>, rootSecurity?: DeepPartial<AuditSecurityConfig>): AuditFallowConfig;
export declare function buildPackageHygieneConfig(raw?: DeepPartial<AuditPackageHygieneConfig>): AuditPackageHygieneConfig;
export declare function buildEnvironmentConfig(raw?: DeepPartial<AuditEnvironmentConfig>): AuditEnvironmentConfig;
export declare function buildAuditorHygieneConfig(raw?: DeepPartial<AuditAuditorHygieneConfig>): AuditAuditorHygieneConfig;
export declare function buildScriptExtensionsConfig(raw?: DeepPartial<AuditScriptExtensionsConfig>): AuditScriptExtensionsConfig;
export declare function buildPackageDistributionConfig(raw?: DeepPartial<AuditPackageDistributionConfig>): AuditPackageDistributionConfig;
export declare function buildPackageScriptsConfig(raw?: DeepPartial<AuditPackageScriptsConfig>): AuditPackageScriptsConfig;
export declare function buildRatchetConfig(raw?: DeepPartial<AuditRatchetConfig>): Required<AuditRatchetConfig>;
export declare function buildTestCoverageConfig(raw?: DeepPartial<AuditTestCoverageConfig>): Required<AuditTestCoverageConfig>;
export declare function buildAccessibilityConfig(raw?: DeepPartial<AuditAccessibilityConfig>): AuditAccessibilityConfig;
export declare function buildTypeCoverageConfig(raw?: DeepPartial<AuditTypeCoverageConfig>): AuditTypeCoverageConfig;
export declare function buildGitIgnoreConfig(raw?: DeepPartial<AuditGitIgnoreConfig>): AuditGitIgnoreConfig;
export declare function buildEslintConfig(raw?: DeepPartial<AuditEslintConfig>): AuditEslintConfig;
export declare function buildVersionConfig(raw?: DeepPartial<AuditVersionConfig>): AuditVersionConfig;
export declare function buildSecretLeaksConfig(raw?: DeepPartial<AuditSecretLeaksConfig>): AuditSecretLeaksConfig;
export declare function buildDependencyVulnerabilitiesConfig(raw?: DeepPartial<AuditDependencyVulnerabilitiesConfig>): AuditDependencyVulnerabilitiesConfig;
export declare function buildCoverageConfig(raw: DeepPartial<AuditCoverageConfig> | undefined, paths: AuditEngineConfig['paths']): AuditCoverageConfig;
export declare function buildValibotConfig(raw: DeepPartial<AuditValibotConfig> | undefined): AuditValibotConfig;
export declare function defineAuditConfig(config: DeepPartial<AuditEngineConfig> & {
    name: string;
}): AuditEngineConfig;
//# sourceMappingURL=auditConfigDefaults.d.ts.map