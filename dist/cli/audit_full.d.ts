import { AuditEngineConfig } from "../core/auditConfigTypes.js";
import { AuditExecutionPhase, AuditExecutionSpeed, AuditFamily, AuditFinding, AuditRunMode, AuditTaskDefinition, StandardAuditResult } from "../core/auditContract.js";
import { BaseAuditor } from "../core/auditorBase.js";
import { ConsoleOutputMode } from "../core/streamingRunner.js";
import { TieredFindingsPhaseGroup } from "../core/unifiedTheme.js";
import { AuditPresetName } from "./auditScanner.js";
//#region src/cli/audit_full.d.ts
export interface AuditFullCliOptions {
  values: Record<string, unknown>;
  positionals: string[];
  project?: string;
  targetFamily: string | undefined;
  formattedRules: string;
  targetPreset: AuditPresetName | undefined;
  targetSuites: string[] | undefined;
  speed?: AuditExecutionSpeed;
  onlySpeed?: AuditExecutionSpeed;
  phase?: AuditExecutionPhase;
  concurrencyLimit: number;
  skipSimilar: boolean;
  isEnabledFilter: boolean;
  isDisabledFilter: boolean;
  consoleMode: ConsoleOutputMode;
}
export declare function resolveTargetFamily(familyOption: unknown, positionals: readonly string[], activeFamilies: readonly string[]): string | undefined;
export declare function resolveFormattedRules(values: Record<string, unknown>, positionals: readonly string[]): string;
export declare function resolveTargetSuites(values: Record<string, unknown>): string[] | undefined;
export declare function resolveConcurrencyLimit(concurrencyValue: unknown): number;
export declare function resolveSkipSimilar(): boolean;
export declare function resolveTargetPreset(values: Record<string, unknown>, positionals: readonly string[]): AuditPresetName | undefined;
export declare function resolveConsoleMode(values: Record<string, unknown>, positionals: readonly string[]): ConsoleOutputMode;
export declare function parseAuditFullCliArgs(activeFamilies: readonly string[], rawArgs?: readonly string[]): AuditFullCliOptions;
export declare function determineRunMode(targetPreset?: AuditPresetName, targetSuites?: string[], taskArg?: unknown, targetFamily?: string, extraOptions?: {
  speed?: unknown;
  onlySpeed?: unknown;
  phase?: unknown;
  changedOnly?: unknown;
}): AuditRunMode;
export declare function buildTaskArgs(task: AuditTaskDefinition, values: Record<string, unknown>, formattedRules: string): string[];
export declare function extractSubprocessErrorMessage(proc: {
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}, timeoutMs?: number, task?: AuditTaskDefinition): string;
export interface MasterReportContext {
  results: StandardAuditResult[];
  tasksToRun: AuditTaskDefinition[];
  allAvailableTasks: AuditTaskDefinition[];
  omittedSuiteIds: string[];
  totalDuration: number;
  config: AuditEngineConfig;
  activeFamilies: readonly AuditFamily[];
  cliOptions: AuditFullCliOptions;
  runMode: AuditRunMode;
  scratchAuditsDir: string;
}
export declare function computeAuditCategoryCounts(results: readonly StandardAuditResult[]): Array<[string, {
  errors: number;
  warnings: number;
  findings: AuditFinding[];
}]>;
export declare function computeTieredAuditCategoryCounts(results: readonly StandardAuditResult[]): TieredFindingsPhaseGroup[];
/** Ratchet applies only to the canonical full run: every default suite, no filters, no build/fix mode. */
export declare function isRatchetScope(cliOptions: AuditFullCliOptions, isFullAudit: boolean): boolean;
export interface FixableCountsResult {
  fixableErrors: number;
  fixableWarnings: number;
  autoFixRecommended: boolean;
}
/**
 * Computes strictly fixable errors and warnings according to the Zero False-Fix Mandate.
 * A finding is fixable IF AND ONLY IF finding.fixable === true.
 * In fix mode (isFixMode === true), any remaining error could not be resolved,
 * so fixableErrors and autoFixRecommended are always 0/false.
 */
export declare const computeFixableViolations: typeof BaseAuditor.computeFixableViolations;
export declare function renderAndPersistMasterReport(ctx: MasterReportContext): Promise<boolean>;
export interface CreateAuditBannerDetailsOptions {
  readonly cliOptions: AuditFullCliOptions;
  readonly isFixMode?: boolean;
  readonly isBuildMode?: boolean;
  readonly tasksCount: number;
  readonly allAvailableCount: number;
  readonly omittedCount?: number;
}
export declare function createAuditBannerDetails(options: CreateAuditBannerDetailsOptions): string[];
export declare const MAX_BANNER_SUBTITLE_WIDTH = 72;
export declare function formatSubtitleDetails(details: readonly string[], maxLineWidth?: number): string;
export declare function resolveFixOrderWeight(task: AuditTaskDefinition): number;
export declare function sortTasksByOrder(tasks: AuditTaskDefinition[], isFixMode?: boolean): void;
export declare function runMasterAudit(): Promise<void>;
//#endregion