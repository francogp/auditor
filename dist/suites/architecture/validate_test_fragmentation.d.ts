/**
 * scripts/auditors/architecture/validate_test_fragmentation.ts
 *
 * TEST ANTI-FRAGMENTATION & JSDOM GOVERNANCE AUDITOR (Node.js 26+ Native)
 *
 * Enforces test suite architecture standards across the test suite:
 *   - Prevents proliferation of micro-files (< 60 lines or configurable minimum).
 *   - Encourages domain-cohesive test suites (300-800 lines) to eliminate
 *     Vitest worker thread setup/teardown and module boot overhead.
 *   - Detects unnecessary @vitest-environment jsdom annotations on tests that do not
 *     mount Vue components or use browser DOM globals, saving ~250ms per suite.
 *   - Generates test suite size distribution analytics (summary=true).
 *
 * Escape Hatches:
 *   - Registered in TEST_FRAGMENTATION_WHITELIST (standalone worker wrappers, SFC view mounts).
 *   - Line annotation: `// test-fragmentation-ok: <justification>`.
 *   - JSDOM annotation: `// jsdom-ok: <justification>`.
 *
 * Usage:
 *   npm run validate:test-fragmentation
 *   npm run validate:test-fragmentation:summary
 */
import { FileScanAuditor } from '../../core/auditorBase.ts';
export type TestFragmentationRuleId = 'no-fragmented-tests' | 'unnecessary-jsdom';
export declare const TEST_FRAGMENTATION_RULES: readonly TestFragmentationRuleId[];
export declare const MIN_TEST_FILE_LINES = 60;
export declare const DISTRIBUTION_SMALL_MAX_LINES = 300;
export declare const DISTRIBUTION_TARGET_MAX_LINES = 800;
export declare const DISTRIBUTION_OVERSIZED_MIN_LINES = 1200;
/**
 * Whitelist of legitimately standalone runners, process wrappers, container benchmarks,
 * and isolated Vue SFC view mounting specs that are exempt from the 60-line floor.
 */
export declare const TEST_FRAGMENTATION_WHITELIST: ReadonlySet<string>;
export interface TestSuiteDistribution {
    micro: number;
    small: number;
    target: number;
    oversized: number;
    other: number;
    totalTestFiles: number;
    totalTestLines: number;
}
export declare class TestFragmentationAuditor extends FileScanAuditor<TestFragmentationRuleId> {
    private readonly minTestLines;
    private readonly fragmentationWhitelist;
    private distribution;
    constructor(roots?: readonly string[], projectRoot?: string);
    getDistribution(): Readonly<TestSuiteDistribution>;
    protected scanFile(relPath: string, content: string): void;
    private checkMicroTestFragmentation;
    private checkUnnecessaryJsdom;
    runAudit(): Promise<void>;
    printDistributionSummary(): void;
}
//# sourceMappingURL=validate_test_fragmentation.d.ts.map