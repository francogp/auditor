/**
 * src/cli/auditRatchet.ts
 *
 * Warning ratchet for full `audit` runs. Every warning is fingerprinted by content
 * (suite, rule, file, normalized source line, occurrence index) and compared against the
 * baseline committed at the configured production ref. Any fingerprint missing from the
 * production baseline is a NEW warning and fails the run. The local baseline can only shrink.
 */
import type { AuditFinding, StandardAuditResult } from '../core/auditContract.ts';
import type { AuditRatchetConfig } from '../core/auditConfig.ts';
type ResolvedRatchetConfig = Required<AuditRatchetConfig>;
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
export {};
//# sourceMappingURL=auditRatchet.d.ts.map