import { CanonicalRuleSeverityLevel } from "../../core/auditConfigTypes.js";
import { AuditorConfigFileRequirement } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
export type FallowConfigRuleId = 'fallow-config-missing' | 'fallow-config-syntax' | 'fallow-banned-entry-glob' | 'fallow-stale-file' | 'fallow-stale-export' | 'fallow-empty-export-list' | 'fallow-duplicate-entry' | 'fallow-config-workspace-diagnostic';
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
export interface FallowConfigSchema {
  $schema?: string;
  entry?: string[];
  ignorePatterns?: string[];
  ignoreExports?: FallowIgnoreExportEntry[];
  rules?: Record<string, string>;
  typeAware?: boolean;
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
  };
  audit?: {
    worsened?: CanonicalRuleSeverityLevel;
  };
  mutation?: {
    runnerConfig?: Record<string, unknown>;
  };
}
export declare function createDefaultFallowConfigContent(): string;
export interface FallowWorkspaceDiagnosticItem {
  readonly path?: string;
  readonly kind?: string;
  readonly message?: string;
}
export declare function validateFallowWorkspaceDiagnostics(diagnostics: readonly FallowWorkspaceDiagnosticItem[] | undefined, auditor: ValidateFallowConfigAuditor): void;
export interface ValidateFallowConfigOptions {
  readonly projectRoot?: string;
  readonly configFile?: string;
  readonly fix?: boolean;
}
export declare const FALLOW_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<FallowConfigRuleId>;
export declare class ValidateFallowConfigAuditor extends BaseAuditor<FallowConfigRuleId> {
  static readonly cachePaths: readonly [".fallow"];
  constructor(targetPathOrOptions?: string | ValidateFallowConfigOptions);
  runAudit(): Promise<void>;
}