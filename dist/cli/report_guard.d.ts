#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/report_guard.ts
 *
 * CLI TOOL: PRE-VUELO ARQUITECTÓNICO (Fallow Guard)
 *
 * Inspects architecture boundaries, allowed import zones, forbidden calls,
 * and policy rules for target files before editing or creating them.
 */
export interface GuardFileResult {
    readonly path: string;
    readonly exists?: boolean;
    readonly zone?: string | null;
    readonly boundary?: {
        readonly configured?: boolean;
        readonly unrestricted?: boolean;
        readonly allowed_zones?: readonly string[];
        readonly allowed_type_only_zones?: readonly string[];
        readonly forbidden_calls?: readonly string[];
        readonly coverage_required?: boolean;
    };
    readonly policy_rules?: readonly string[];
    readonly severities?: {
        readonly boundary_violation?: string;
        readonly policy_violation?: string;
    };
    readonly notes?: readonly string[];
}
export interface GuardReportPayload {
    readonly files?: readonly GuardFileResult[];
    readonly kind?: string;
}
export interface GuardOptions {
    readonly json?: boolean;
}
export declare function runGuardReport(projectRoot?: string, files?: readonly string[], options?: GuardOptions): number;
//# sourceMappingURL=report_guard.d.ts.map