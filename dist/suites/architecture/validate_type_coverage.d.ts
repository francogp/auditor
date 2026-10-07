import { BaseAuditor } from '../../core/auditorBase.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
export declare const DEFAULT_MIN_TYPE_COVERAGE_PERCENT: 95;
export declare const TYPE_COVERAGE_RULES: readonly ["type-coverage-below-threshold", "type-coverage-untyped-identifier"];
export type TypeCoverageRuleId = (typeof TYPE_COVERAGE_RULES)[number];
export interface UntypedSymbol {
    readonly filePath: string;
    readonly line: number;
    readonly character: number;
    readonly text: string;
}
export interface TypeCoverageReport {
    readonly correctCount?: number;
    readonly totalCount?: number;
    readonly percent?: number;
    readonly percentString?: string;
    readonly atLeastFailed?: boolean;
    readonly anys?: readonly UntypedSymbol[];
}
/**
 * Parses raw JSON output from type-coverage into canonical AuditFindings.
 */
export declare function parseTypeCoverageReport(report: TypeCoverageReport, threshold: number, projectRoot?: string): AuditFinding[];
export declare const DEFAULT_TYPE_COVERAGE_THRESHOLD = 95;
export declare class ValidateTypeCoverageAuditor extends BaseAuditor<TypeCoverageRuleId> {
    constructor(options?: {
        projectRoot?: string;
    });
    runAudit(): Promise<void>;
    private executeTypeCoverageCli;
    private applyCoverageMetricsAndFindings;
}
//# sourceMappingURL=validate_type_coverage.d.ts.map