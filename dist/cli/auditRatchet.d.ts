import { ResolvedRatchetConfig } from "../core/auditConfigTypes.js";
import { AuditFinding, StandardAuditResult } from "../core/auditContract.js";
//#region src/cli/auditRatchet.d.ts
export declare const RATCHET_SOURCES: readonly ["production", "local-bootstrap"];
export type RatchetSource = (typeof RATCHET_SOURCES)[number];
interface WarningRatchetOutcome {
  readonly source: RatchetSource;
  readonly newWarnings: readonly AuditFinding[];
  readonly resolvedCount: number;
  readonly baselineUpdated: boolean;
}
/** True when `ref` resolves to a commit in the repository at `projectRoot`. */
export declare function resolveGitCommit(projectRoot: string, ref: string): boolean;
/** Returns a human-readable defect for a malformed local baseline, or null when it is valid. */
export declare function describeBaselineDefect(projectRoot: string, baselineFile: string): string | null;
/**
 * Compares the run's warnings with the production baseline.
 * When `allowShrink` is set and no new warning exists, rewrites the local baseline to the current (smaller) set,
 * carrying over entries of suites skipped in this run.
 */
export declare function runWarningRatchet(projectRoot: string, ratchet: ResolvedRatchetConfig, results: readonly StandardAuditResult[], allowShrink: boolean): WarningRatchetOutcome;
/** Writes the first baseline. Refused when the production ref already carries one. */
export declare function initWarningBaseline(projectRoot: string, ratchet: ResolvedRatchetConfig, results: readonly StandardAuditResult[]): number;
//#endregion
export {};