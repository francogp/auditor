#!/usr/bin/env -S node --experimental-strip-types
/**
 * scripts/maintenance/audit_full.ts
 *
 * MASTER AUDIT ORCHESTRATOR & UNIFIED RUNNER (Node.js 26+)
 * Dynamically discovers and executes all sub-auditors in scripts/auditors/:
 *   1. Displays formatted step-by-step progress with clean newlines.
 *   2. Renders the complete Box-Drawing summary table grouped by family.
 *   3. Persists the complete structured JSON report to scratch/audits/latest_audit.json.
 */
import { type StandardAuditResult, type AuditFinding, type AuditTaskDefinition, type AuditRunMode } from '../core/auditContract.ts';
import { type AuditPresetName } from './auditScanner.ts';
import '../core/permissionGuard.ts';
export interface AuditFullCliOptions {
    values: Record<string, unknown>;
    positionals: string[];
    project?: string;
    targetFamily: string | undefined;
    formattedRules: string;
    targetPreset: AuditPresetName | undefined;
    targetSuites: string[] | undefined;
    concurrencyLimit: number;
    skipSimilar: boolean;
    isEnabledFilter: boolean;
    isDisabledFilter: boolean;
}
export declare function resolveTargetFamily(familyOption: unknown, positionals: readonly string[], activeFamilies: readonly string[]): string | undefined;
export declare function resolveFormattedRules(values: Record<string, unknown>, positionals: readonly string[]): string;
export declare function resolveTargetSuites(values: Record<string, unknown>): string[] | undefined;
export declare function resolveConcurrencyLimit(concurrencyValue: unknown): number;
export declare function resolveSkipSimilar(): boolean;
export declare function resolveTargetPreset(values: Record<string, unknown>, positionals: readonly string[]): AuditPresetName | undefined;
export declare function parseAuditFullCliArgs(activeFamilies: readonly string[], rawArgs?: readonly string[]): AuditFullCliOptions;
export declare function determineRunMode(targetPreset?: AuditPresetName, targetSuites?: string[], taskArg?: unknown, targetFamily?: string): AuditRunMode;
export declare function buildTaskArgs(task: AuditTaskDefinition, values: Record<string, unknown>, formattedRules: string): string[];
export declare function extractSubprocessErrorMessage(proc: {
    status: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}, timeoutMs?: number, task?: AuditTaskDefinition): string;
export declare function computeAuditCategoryCounts(results: readonly StandardAuditResult[]): Array<[string, {
    errors: number;
    warnings: number;
    findings: AuditFinding[];
}]>;
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
export declare function computeFixableViolations(results: readonly StandardAuditResult[], isFixMode: boolean): FixableCountsResult;
export declare function createAuditBannerDetails(cliOptions: AuditFullCliOptions, isFixMode: boolean, isBuildMode: boolean, tasksCount: number, allAvailableCount: number, omittedCount: number): string[];
export declare const MAX_BANNER_SUBTITLE_WIDTH = 72;
export declare function formatSubtitleDetails(details: readonly string[], maxLineWidth?: number): string;
export declare function runMasterAudit(): Promise<void>;
//# sourceMappingURL=audit_full.d.ts.map