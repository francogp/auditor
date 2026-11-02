import { AuditTaskDefinition } from "./auditContract.js";
export type RecommendationKind = 'missing_section' | 'missing_property' | 'missing_elements' | 'missing_plugin' | 'relaxed_ceiling' | 'relaxed_floor' | 'relaxed_boolean' | 'relaxed_severity';
export interface ConfigRecommendation {
  readonly path: string;
  readonly subsystem: string;
  readonly kind: RecommendationKind;
  readonly currentValue: unknown;
  readonly recommendedValue: unknown;
  readonly rationale: string;
  readonly impact: 'hardening' | 'feature' | 'hygiene';
}
export interface HardenedSetting {
  readonly path: string;
  readonly subsystem: string;
  readonly currentValue: unknown;
  readonly defaultValue: unknown;
  readonly reason: string;
}
export interface ConfigAdvisorReport {
  readonly projectRoot: string;
  readonly configFile: string;
  readonly totalChecked: number;
  readonly optimalCount: number;
  readonly hardenedCount: number;
  readonly recommendationsCount: number;
  readonly recommendations: readonly ConfigRecommendation[];
  readonly hardenedSettings: readonly HardenedSetting[];
}
export interface ConfigAdvisorOptions {
  readonly projectRoot?: string;
  readonly targetSubsystem?: string;
  readonly tasks?: readonly AuditTaskDefinition[];
  readonly rawConfigOverride?: Record<string, unknown>;
}
export declare function parseAuditConfigFileToRecord(configFilePath: string): Record<string, unknown> | null;
/**
 * Heuristically detects whether a numeric property represents a maximum ceiling
 * (where lower is stricter, higher is more permissive).
 */
export declare function isNumericCeiling(key: string, dotPath: string): boolean;
/**
 * Heuristically detects whether a numeric property represents a minimum floor
 * (where higher is stricter, lower is more permissive).
 */
export declare function isNumericFloor(key: string, dotPath: string): boolean;
/**
 * Assembles the full unified expected configuration tree by dynamically querying
 * all discovered subauditors and falling back to canonical engine defaults.
 */
export declare function buildUnifiedExpectedConfigTree(tasks: readonly AuditTaskDefinition[]): Record<string, Record<string, unknown>>;
/**
 * Fully agnostic, recursive property evaluator. Works across ANY subsystem,
 * current or future, inspecting objects, arrays, numbers, booleans, and severities.
 */
export declare function evaluateAgnosticPropertyTree(subsystem: string, currentPath: string, expectedVal: unknown, localVal: unknown, recommendations: ConfigRecommendation[], hardenedSettings: HardenedSetting[], projectRoot?: string): void;
/**
 * 100% Dynamic Project Configuration Evaluator.
 * Accepts sync tasks when provided, or dynamically loads them via `discoverAuditors`.
 */
export declare function evaluateProjectConfigAsync(projectRoot?: string, options?: ConfigAdvisorOptions): Promise<ConfigAdvisorReport>;
/**
 * Synchronous project config evaluator (when tasks are provided or loaded synchronously).
 */
export declare function evaluateProjectConfig(projectRoot?: string, options?: ConfigAdvisorOptions): ConfigAdvisorReport;