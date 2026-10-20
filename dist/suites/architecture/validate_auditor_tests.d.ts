import { BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_auditor_tests.d.ts
export type AuditorTestRuleId = 'missing-auditor-test' | 'untested-auditor-rule' | 'missing-clean-auditor-test' | 'missing-construction-auditor-test' | 'missing-violation-auditor-test';
export declare const AUDITOR_TEST_RULES: readonly AuditorTestRuleId[];
export declare const AUDITOR_TEST_DESCRIPTIONS: Record<AuditorTestRuleId, string>;
export declare const AUDITOR_TEST_REMEDIATIONS: Record<AuditorTestRuleId, string>;
export declare function extractSuiteDeclaredRules(source: string): string[];
export interface AuditorTestsAuditorOptions {
  readonly projectRoot?: string;
}
export declare class AuditorTestsAuditor extends BaseAuditor<AuditorTestRuleId> {
  constructor(options?: AuditorTestsAuditorOptions);
  recordScannedFile(filePath: string): void;
  runAudit(): Promise<void>;
}
//#endregion