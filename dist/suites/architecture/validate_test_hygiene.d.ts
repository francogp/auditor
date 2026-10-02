/**
 * scripts/auditors/architecture/validate_test_hygiene.ts
 *
 * TEST HYGIENE & SIMULATION INTEGRITY AUDITOR (Node.js 26+ Native)
 *
 * Enforces test suite architecture and testing hygiene standards across projects:
 *   1. No Tautological Integration Mocks (`no-tautological-integration-mocks`):
 *      In `tests/integration/`, forbids mocking core execution subsystems (`@/logic/db/supabase`).
 *      Integration suites must run against real engines and databases.
 *   2. Playwright ID Locators Only (`playwright-id-locators-only`):
 *      In `scripts/e2e/`, mandates 100% ID-based locators (`#id`, `[id="..."]`, `[data-testid="..."]`).
 *      Forbids text-based selectors (`:has-text`, `getByText`, `getByRole(..., { name: ... })`, `text=`).
 *   3. No Playwright Force Click (`no-playwright-force-click`):
 *      In `scripts/e2e/`, forbids `.click({ force: true })` which bypasses actionable element
 *      visibility and interactability checks.
 *   4. No Test Timeout Inflation (`no-test-timeout-inflation`):
 *      In `tests/` and `scripts/e2e/`, forbids inflating timeouts (> 30000ms) to mask slow tests
 *      or architectural bottlenecks.
 *   5. No Playwright Polling Waits (`no-playwright-polling-waits`):
 *      In `scripts/e2e/`, forbids artificial sleep timers (`page.waitForTimeout()`).
 *
 * Escape Hatches:
 *   `// test-ok`, `// mock-ok`, `// locator-ok`, `// force-ok`, `// timeout-ok`, `// wait-ok`
 *
 * Usage:
 *   npm run validate:test-hygiene
 */
import { FileScanAuditor } from '../../core/auditorBase.ts';
export type TestHygieneRuleId = 'no-tautological-integration-mocks' | 'playwright-id-locators-only' | 'no-playwright-force-click' | 'no-test-timeout-inflation' | 'no-playwright-polling-waits';
export declare const TEST_HYGIENE_RULES: readonly TestHygieneRuleId[];
export declare function getForbiddenIntegrationMockTargets(): readonly string[];
export declare class TestHygieneAuditor extends FileScanAuditor<TestHygieneRuleId> {
    constructor();
    protected scanFile(relPath: string, content: string): void;
    private scanIntegrationMocks;
    private scanE2eSimulations;
    private scanTimeoutInflation;
}
//# sourceMappingURL=validate_test_hygiene.d.ts.map