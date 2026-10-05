/**
 * packages/auditor/src/suites/architecture/validate_auditor_tests.ts
 *
 * AUDITOR TEST EXISTENCE & COMPLETENESS AUDITOR (Node.js 26+ Native)
 *
 * Mandate:
 * Every sub-auditor in packages/auditor/src/suites/ and every host extension plugin
 * declared in audit.config.ts or scripts/auditors/ MUST have:
 *   1. A dedicated test file in packages/auditor/tests/ or tests/node/auditors/.
 *   2. Dedicated tests covering 100% of declared rules (errors and warnings).
 *   3. At least one test verifying clean execution (0 errors, passed status).
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
export type AuditorTestRuleId = 'missing-auditor-test' | 'untested-auditor-rule' | 'missing-clean-auditor-test';
export declare const AUDITOR_TEST_RULES: readonly AuditorTestRuleId[];
export declare const AUDITOR_TEST_DESCRIPTIONS: Record<AuditorTestRuleId, string>;
export declare function extractSuiteDeclaredRules(source: string): string[];
export declare class AuditorTestsAuditor extends BaseAuditor<AuditorTestRuleId> {
    constructor(projectRoot?: string);
    recordScannedFile(filePath: string): void;
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_auditor_tests.d.ts.map