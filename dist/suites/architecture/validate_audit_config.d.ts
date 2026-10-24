import { AuditEngineConfig } from "../../core/auditConfigTypes.js";
import { AuditTaskDefinition, AuditorConfigFileRequirement } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
import { appendMissingSectionsFallback, appendMissingSectionsToConfigFile, appendMissingSectionsToJsonFile, appendMissingSectionsToTsFile, dtoValueToTsExpression, findConfigObjectLiteral, findTargetAuditConfigObject, formatSectionObjectLiteral, mutateAuditConfigFileAst, parseAuditConfigFileAst, printTsExpression, syncAuditorVersionInTsFile } from "../../core/auditConfigAst.js";
export declare function deepMergeDefaultsObject(target: Record<string, unknown>, defaults: Record<string, unknown>): void;
export declare function buildTaskExpectedConfigTree(tasks: readonly AuditTaskDefinition[]): Map<string, {
  tasks: AuditTaskDefinition[];
  expectedTree: Record<string, unknown>;
}>;
export declare function collectConfigSectionsFromTasks(tasks: readonly AuditTaskDefinition[]): Record<string, Record<string, unknown>>;
export declare function syncAuditorVersionInConfigFile(configFilePath: string, version: string): boolean;
export declare function createDefaultAuditConfigContent(packageName?: string, tasks?: readonly AuditTaskDefinition[]): string;
export interface MissingSectionEntry {
  tasks: AuditTaskDefinition[];
  defaultConfig: Record<string, unknown>;
  missingTree: Record<string, unknown>;
  missingPaths: string[];
}
export declare function computeMissingConfigDiff(expected: unknown, current: unknown, isRootLevel?: boolean): unknown | undefined;
export declare function extractMissingConfigPaths(prefix: string, missingTree: Record<string, unknown>, currentVal?: unknown): string[];
export declare function collectMissingSections(tasks: readonly AuditTaskDefinition[], rawConfig: unknown): Map<string, MissingSectionEntry>;
export type AuditConfigRuleId = 'audit-config-missing-path' | 'audit-config-missing-file' | 'audit-config-invalid-extension' | 'audit-config-missing-gitignore-entry' | 'audit-config-missing-section' | 'audit-config-unknown-field' | 'audit-config-critical-violation' | 'audit-config-unacknowledged-degradation' | 'audit-config-ratchet-relaxation';
export declare const AUDIT_CONFIG_RULES: readonly AuditConfigRuleId[];
export declare const PATH_ROOT_KEYS: readonly (keyof AuditEngineConfig['paths'])[];
export interface ValidateAuditConfigOptions {
  projectRoot?: string;
  fix?: boolean;
}
export declare const AUDIT_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<AuditConfigRuleId>;
export declare class ValidateAuditConfigAuditor extends BaseAuditor<AuditConfigRuleId> {
  constructor(targetPathOrOptions?: string | ValidateAuditConfigOptions);
  runAudit(): Promise<void>;
  private verifyConfigRatchet;
  private verifyUnknownFields;
  private verifyUnknownBundleFields;
  private verifyUnknownTopLevelSections;
  private migrateLegacyEslintConfigSection;
  private verifyUnknownPathsFields;
  private verifyUnknownConstantsFields;
  private verifyRequiredSections;
  private applyMissingSectionsFix;
  private reportMissingSectionViolations;
  private resolveTaskSectionContext;
  private repairCriticalMinimum;
  private verifyTaskMinimumProperty;
  private verifyTaskCriticalMinimums;
  private verifyTaskForbiddenOverrides;
  private verifyTaskCustomValidation;
  private verifyTaskCriticalConfig;
  verifyCriticalConfigurations(config: AuditEngineConfig, tasks: readonly AuditTaskDefinition[]): Promise<void>;
  private handleMissingGitIgnoreFile;
  private appendMissingGitIgnoreEntries;
  private verifyGitIgnore;
  private verifyUnacknowledgedDegradations;
  private checkPathExists;
  private verifyPathRoots;
  private verifyPersistencePaths;
  private verifyDomainPaths;
  private verifyStylesPaths;
  private verifyDomainAndStylePaths;
  private resolveExtensionFiles;
  private checkExtensionStaticContract;
  private instantiateAuditorClass;
  private isAuditorConstructor;
  private verifyExtensionRuntime;
  private verifySingleExtensionFile;
  private verifyExtensionPaths;
}
export declare function enforceCriticalConfigurations(projectRoot: string, tasks: readonly AuditTaskDefinition[]): Promise<boolean>;
export { appendMissingSectionsFallback, appendMissingSectionsToConfigFile, appendMissingSectionsToJsonFile, appendMissingSectionsToTsFile, dtoValueToTsExpression, findConfigObjectLiteral, findTargetAuditConfigObject, formatSectionObjectLiteral, mutateAuditConfigFileAst, parseAuditConfigFileAst, printTsExpression, syncAuditorVersionInTsFile };