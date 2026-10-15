import { BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_test_coverage.d.ts
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
//#endregion