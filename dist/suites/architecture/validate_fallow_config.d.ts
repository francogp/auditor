import "../../core/auditConfig.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { CanonicalRuleSeverityLevel, FallowTypeAwareRequirePolicy } from "../../core/auditConfigTypes.js";
import { AuditorConfigFileRequirement } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
export type FallowConfigRuleId = 'fallow-config-missing' | 'fallow-config-syntax' | 'fallow-banned-entry-glob' | 'fallow-stale-file' | 'fallow-stale-export' | 'fallow-empty-export-list' | 'fallow-duplicate-entry' | 'fallow-config-workspace-diagnostic' | 'fallow-undeclared-config-entry' | 'fallow-config-doctor';
export declare const FALLOW_CONFIG_RULES: readonly FallowConfigRuleId[];
export declare function getBannedEntryGlobs(projectRoot?: string): readonly string[];
export declare const BANNED_ENTRY_GLOBS: readonly string[];
export declare const escapeRegExp: (s: string) => string;
/**
 * Checks whether a symbol is exported from file content.
 */
export declare function isSymbolExportedInContent(content: string, symbol: string, isVue?: boolean): boolean;
export interface FallowIgnoreExportEntry {
  file: string;
  exports: string[];
}
export declare const FALLOW_CYCLOMATIC_POLICIES: readonly ["standard", "literal-membership"];
export type FallowCyclomaticPolicy = (typeof FALLOW_CYCLOMATIC_POLICIES)[number];
export interface FallowTypeAwareConfig {
  enabled?: boolean;
  projects?: string[];
  require?: FallowTypeAwareRequirePolicy;
}
export interface FallowConfigSchema {
  $schema?: string;
  entry?: string[];
  ignorePatterns?: string[];
  ignoreDependencies?: string[];
  ignoreExports?: FallowIgnoreExportEntry[];
  markupExtensions?: string[];
  rules?: Record<string, string>;
  typeAware?: boolean | FallowTypeAwareConfig;
  duplicates?: {
    mode?: string;
    nearMiss?: boolean;
    minTokens?: number;
    minLines?: number;
    minOccurrences?: number;
  };
  viz?: {
    enabled?: boolean;
    outputPath?: string;
  };
  health?: {
    maxCrap?: number;
    cyclomaticPolicy?: FallowCyclomaticPolicy;
  };
  audit?: {
    worsened?: CanonicalRuleSeverityLevel;
  };
  mutation?: {
    runnerConfig?: string;
  };
}
export declare function createDefaultFallowConfigContent(): string;
export interface FallowWorkspaceDiagnosticItem {
  readonly path?: string;
  readonly kind?: string;
  readonly pattern?: string;
  readonly message?: string;
}
export declare const FALLOW_REDUNDANT_CONFIG_DIAGNOSTIC_KINDS: readonly ["entry-pattern-redundant", "ignore-dependencies-entry-redundant", "ignore-patterns-entry-redundant"];
export type FallowRedundantConfigDiagnosticKind = (typeof FALLOW_REDUNDANT_CONFIG_DIAGNOSTIC_KINDS)[number];
export interface FallowDoctorCheck {
  readonly id?: string;
  readonly name?: string;
  readonly status?: string;
  readonly message?: string;
  readonly remediation?: {
    command?: string;
    cwd?: string;
    mutating?: boolean;
  } | string;
}
export interface FallowDoctorOutput {
  readonly status?: string;
  readonly checks?: readonly FallowDoctorCheck[];
}
export declare function formatDoctorRemediation(remediation?: {
  command?: string;
  cwd?: string;
  mutating?: boolean;
} | string): string;
export declare function validateFallowDoctorResults(parsed: FallowDoctorOutput, auditor: ValidateFallowConfigAuditor): void;
export declare function validateFallowWorkspaceDiagnostics(diagnostics: readonly FallowWorkspaceDiagnosticItem[] | undefined, auditor: ValidateFallowConfigAuditor, config?: FallowConfigSchema): boolean;
export declare function projectFallowConfigFromAuditConfig(auditConfig: ReturnType<typeof getAuditConfig>): Partial<FallowConfigSchema>;
export declare function validateUndeclaredFallowEntries(config: FallowConfigSchema, auditor: ValidateFallowConfigAuditor): boolean;
export interface ValidateFallowConfigOptions {
  readonly projectRoot?: string;
  readonly configFile?: string;
}
export declare const FALLOW_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<FallowConfigRuleId>;
export declare class ValidateFallowConfigAuditor extends BaseAuditor<FallowConfigRuleId> {
  static readonly cachePaths: readonly [".fallow"];
  constructor(options?: ValidateFallowConfigOptions);
  runAudit(): Promise<void>;
}