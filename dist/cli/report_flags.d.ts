#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/report_flags.ts
 *
 * CLI TOOL: GOBERNANZA DE FEATURE FLAGS (Fallow Flags)
 *
 * Analyzes feature flag usage patterns, branches, single-read sites,
 * and identifies retirement candidates.
 */
export interface FeatureFlagRetirementCandidate {
    readonly name: string;
    readonly age_days?: number;
    readonly read_sites?: number;
    readonly reasons?: readonly string[];
}
export interface FeatureFlagsReportPayload {
    readonly kind?: string;
    readonly total_flags?: number;
    readonly feature_flags?: ReadonlyArray<{
        readonly name?: string;
        readonly read_sites?: number;
        readonly locations?: readonly unknown[];
    }>;
    readonly retirement?: {
        readonly summary?: {
            readonly distinct_flags?: number;
            readonly candidates?: number;
            readonly by_reason?: Record<string, number>;
        };
        readonly flags?: readonly FeatureFlagRetirementCandidate[];
    };
}
export interface FlagsOptions {
    readonly retirement?: boolean;
    readonly top?: number;
    readonly json?: boolean;
}
export declare function runFlagsReport(projectRoot?: string, options?: FlagsOptions): number;
//# sourceMappingURL=report_flags.d.ts.map