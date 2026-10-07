/**
 * @file validate_test_coverage.ts
 * @description Architecture sub-auditor verifying that repository test execution coverage
 * meets configured thresholds and has no untracked blind spots when enforceInAudit is enabled.
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
export declare const TEST_COVERAGE_RULES: readonly ["test-coverage-below-threshold", "test-coverage-missing-report", "test-coverage-untracked-files"];
export type TestCoverageRuleId = (typeof TEST_COVERAGE_RULES)[number];
export interface ValidateTestCoverageOptions {
    projectRoot?: string;
}
export declare const DEFAULT_COVERAGE_THRESHOLD = 80;
export declare class ValidateTestCoverageAuditor extends BaseAuditor<TestCoverageRuleId> {
    constructor(options?: ValidateTestCoverageOptions);
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_test_coverage.d.ts.map