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

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { FileScanAuditor, BaseAuditor,
  createUniformRemediationPhases, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import type { SharedAstContext } from '../../core/astContext.ts';

enableCompileCache();

export type TestHygieneRuleId =
  | 'no-tautological-integration-mocks'
  | 'playwright-id-locators-only'
  | 'no-playwright-force-click'
  | 'no-test-timeout-inflation'
  | 'no-playwright-polling-waits';

export const TEST_HYGIENE_RULES: readonly TestHygieneRuleId[] = [
  'no-tautological-integration-mocks',
  'playwright-id-locators-only',
  'no-playwright-force-click',
  'no-test-timeout-inflation',
  'no-playwright-polling-waits'
] as const;

// Core subsystems forbidden from being mocked in tests/integration/
export function getForbiddenIntegrationMockTargets(): readonly string[] {
  const config = getAuditConfig();
  return config.persistence?.forbiddenMockModules ?? [];
}

const PLAYWRIGHT_TEXT_LOCATOR_REGEX =
  /:has-text\(|getByText\(|getByRole\(\s*['"](?:button|tab|link)['"]\s*,\s*\{\s*name:|\btext=/;
const FORCE_CLICK_REGEX = /\.(?:click|dblclick)\s*\(\s*\{[^}]*\bforce\s*:\s*true/;
const WAIT_FOR_TIMEOUT_REGEX = /\bpage\.waitForTimeout\s*\(/;
const TIMEOUT_INFLATION_REGEX =
  /testTimeout\s*:\s*([3-9]\d{4,}|\d{6,})|\b(?:it|test)\s*\([^,]+,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[\s\S]*?\},\s*([3-9]\d{4,}|\d{6,})\)/;
const VI_MOCK_REGEX = /vi\.mock\(\s*['"]([^'"]+)['"]/g;

export interface TestHygieneOptions {
  readonly projectRoot?: string;
}

export class TestHygieneAuditor extends FileScanAuditor<TestHygieneRuleId> {
  constructor(options: TestHygieneOptions = {}) {
    const projectRoot = options.projectRoot ?? process.cwd();
    const config = getAuditConfig(projectRoot);
    const testRoots = [
      ...config.paths.integrationRoots,
      ...config.paths.e2eRoots,
      ...config.paths.testRoots
    ];

    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      projectRoot,
      ruleCapabilities: createRuleCapabilities(TEST_HYGIENE_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_test_hygiene',
      name: 'Test Hygiene & Simulation Integrity Validator',
      description: 'Audits test hygiene, mocks, and Playwright locators',
      family: 'architecture',
      ruleIds: TEST_HYGIENE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(TEST_HYGIENE_RULES, 'hygiene'),
      packageName: 'Tests',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      icon: '🧪',
      ruleDescriptions: {
        'no-tautological-integration-mocks': 'Tautological mock in integration test',
        'playwright-id-locators-only': 'Playwright locator without ID selector',
        'no-playwright-force-click': 'Forced click with force:true',
        'no-test-timeout-inflation': 'Artificially inflated test timeout',
        'no-playwright-polling-waits': 'Use of page.waitForTimeout()'
      },
      ruleRemediations: {
        'no-tautological-integration-mocks':
          '📖 REMEDIATION GUIDE: no-tautological-integration-mocks\n' +
          '1. Root Cause: A mock (`vi.mock()`, `vi.spyOn()`) was found in an integration test replacing the database or primary subsystem under test. Integration tests must validate real wiring with real persistence (in-memory/SQLite).\n' +
          '2. Diagnosis: Review mocks declared in the reported integration test.\n' +
          '3. Canonical Solution: Remove the mock and use an hermetic persistence engine or realistic fixtures. If purely unit-level, move the test to `tests/unit/`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Tautological mock: `vi.mock("@/services/database")` in integration test\n' +
          '   ✅ Real wiring:       Use in-memory SQLite with migrated schema.',
        'playwright-id-locators-only':
          '📖 REMEDIATION GUIDE: playwright-id-locators-only\n' +
          '1. Root Cause: An end-to-end (E2E) test locates elements using fragile CSS class selectors (e.g. `.btn.btn-primary.mt-2`, `div > span:nth-child(3)`). Visual selectors break on cosmetic redesigns.\n' +
          '2. Diagnosis: Inspect the `page.locator(...)` call at the reported line.\n' +
          '3. Canonical Solution: Use robust locators based on unique IDs (`#submit-button`), test attributes (`[data-testid="..."]`), or accessible roles (`page.getByRole(...)`).\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Fragile: `page.locator(".card-body > div.btn-wrapper button")`\n' +
          '   ✅ Robust:  `page.locator("#confirm-checkout-btn")` or `page.getByRole("button", { name: "Confirm" })`',
        'no-playwright-force-click':
          '📖 REMEDIATION GUIDE: no-playwright-force-click\n' +
          '1. Root Cause: `{ force: true }` was passed to a Playwright click action (`locator.click({ force: true })`). Forcing clicks bypasses actionability checks, hiding blocking modals or animations.\n' +
          '2. Diagnosis: Locate the `force: true` option in the E2E test.\n' +
          '3. Canonical Solution: Remove `force: true` and ensure element readiness via `await expect(locator).toBeVisible()` or by managing overlays/animations.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Forced:    `await btn.click({ force: true });`\n' +
          '   ✅ Realistic: `await expect(btn).toBeVisible(); await btn.click();`',
        'no-test-timeout-inflation':
          '📖 REMEDIATION GUIDE: no-test-timeout-inflation\n' +
          '1. Root Cause: A test execution timeout was artificially inflated (`test.setTimeout(60000)`, `vi.setConfig({ testTimeout: ... })`). Inflating timeouts masks performance bottlenecks, infinite loops, or hanging promises.\n' +
          '2. Diagnosis: Locate the custom timeout configuration in the test file.\n' +
          '3. Canonical Solution: Remove the inflated timeout and optimize test execution (e.g. fast-forwarding animations with `gsap.globalTimeline.timeScale(100)` or resolving async steps deterministically).\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Inflated: `test.setTimeout(120000);`\n' +
          '   ✅ Standard: Respect default framework timeouts (5s).',
        'no-playwright-polling-waits':
          '📖 REMEDIATION GUIDE: no-playwright-polling-waits\n' +
          '1. Root Cause: Fixed sleep timers (`page.waitForTimeout(ms)`) were used in E2E tests. Fixed sleeps slow test suites and cause flaky failures on slower CI runners.\n' +
          '2. Diagnosis: Locate `waitForTimeout` calls in the test file.\n' +
          '3. Canonical Solution: Replace fixed sleeps with web-first Playwright assertions that wait automatically for the exact state: `await expect(locator).toHaveText(...)` or `await page.waitForResponse(...)`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Fixed wait:  `await page.waitForTimeout(3000);`\n' +
          '   ✅ Auto-wait:   `await expect(page.locator("#status")).toHaveText("Ready");`'
      },
      roots: testRoots.length > 0 ? testRoots : ['tests'],
      allowedExtensions: new Set(['.ts', '.js'])
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const config = getAuditConfig();
    const isIntegration = config.paths.integrationRoots.some((r) => relPath.startsWith(r));
    const isE2e = config.paths.e2eRoots.some((r) => relPath.startsWith(r));

    // 1. Tautological mocks (integration only)
    if (isIntegration) {
      this.runSubAuditorSync('no-tautological-integration-mocks', () => {
        this.scanIntegrationMocks(relPath, content);
      });
    }

    // 2. Playwright E2E simulation rules
    if (isE2e) {
      this.runSubAuditorSync('playwright-id-locators-only', () => {
        this.scanPlaywrightLocators(relPath, content);
      });

      this.runSubAuditorSync('no-playwright-force-click', () => {
        this.scanPlaywrightForceClick(relPath, content);
      });

      this.runSubAuditorSync('no-playwright-polling-waits', () => {
        this.scanPlaywrightPollingWaits(relPath, content);
      });
    }

    // 3. Timeout inflation (all test suites)
    this.runSubAuditorSync('no-test-timeout-inflation', () => {
      this.scanTimeoutInflation(relPath, content);
    });
  }

  public override async runAudit(astContext?: SharedAstContext): Promise<void> {
    await super.runAudit(astContext);
    const config = getAuditConfig(this.projectRoot);
    const hasIntegration = (config.paths?.integrationRoots ?? []).some((r) =>
      fs.existsSync(path.resolve(this.projectRoot, r))
    );
    if (!hasIntegration) {
      this.markRuleNotApplicable(
        'no-tautological-integration-mocks',
        'No existing integrationRoots found on disk'
      );
    }
    const hasE2e = (config.paths?.e2eRoots ?? []).some((r) =>
      fs.existsSync(path.resolve(this.projectRoot, r))
    );
    if (!hasE2e) {
      this.markRuleNotApplicable(
        'playwright-id-locators-only',
        'No existing e2eRoots found on disk'
      );
      this.markRuleNotApplicable('no-playwright-force-click', 'No existing e2eRoots found on disk');
      this.markRuleNotApplicable(
        'no-playwright-polling-waits',
        'No existing e2eRoots found on disk'
      );
    }
  }

  private scanIntegrationMocks(relPath: string, content: string): void {
    const lines = content.split('\n');
    let match: RegExpExecArray | null;
    VI_MOCK_REGEX.lastIndex = 0;

    while ((match = VI_MOCK_REGEX.exec(content)) !== null) {
      const rawTarget = match[1];
      if (!rawTarget) continue;
      const target = rawTarget.replace(/\.ts$/, '').replace(/\.js$/, '');
      const lineNumber = content.slice(0, match.index).split('\n').length;
      const lineContent = lines[lineNumber - 1] || '';

      if (this.isLineIgnored(lineContent, ['mock-ok'])) continue;

      const forbiddenTargets = getForbiddenIntegrationMockTargets();
      for (const forbidden of forbiddenTargets) {
        if (target === forbidden || target.endsWith(forbidden.replace(/^@\//, '/'))) {
          this.addViolation({
            ruleId: 'no-tautological-integration-mocks',
            severity: 'error',
            file: relPath,
            line: lineNumber,
            message: `Tautological mock detected in integration test. Mocking core execution engine '${target}' is strictly forbidden in tests/integration/.`,
            context: lineContent.trim()
          });
          break;
        }
      }
    }
  }

  private scanLineRegexRule(
    relPath: string,
    content: string,
    ruleId: TestHygieneRuleId,
    regex: RegExp,
    ignoreTags: string[],
    messageFn: (line: string, match: RegExpExecArray) => string
  ): void {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineContent = lines[i];
      if (!lineContent || this.isLineIgnored(lineContent, ignoreTags)) continue;
      const match = regex.exec(lineContent);
      if (match) {
        this.addViolation({
          ruleId,
          severity: 'error',
          file: relPath,
          line: i + 1,
          message: messageFn(lineContent, match),
          context: lineContent.trim()
        });
      }
    }
  }

  private scanPlaywrightLocators(relPath: string, content: string): void {
    const config = getAuditConfig();
    if (config.e2e?.idLocatorsOnly !== true) return;
    this.scanLineRegexRule(
      relPath,
      content,
      'playwright-id-locators-only',
      PLAYWRIGHT_TEXT_LOCATOR_REGEX,
      ['locator-ok'],
      () =>
        `Text-based locator detected in E2E spec. Project policy requires 100% ID-based locators ('#id', '[id="..."]', '[data-testid="..."]').`
    );
  }

  private scanPlaywrightForceClick(relPath: string, content: string): void {
    this.scanLineRegexRule(
      relPath,
      content,
      'no-playwright-force-click',
      FORCE_CLICK_REGEX,
      ['force-ok'],
      () =>
        `Force click ({ force: true }) detected in E2E simulation. Interactivity checks must pass naturally.`
    );
  }

  private scanPlaywrightPollingWaits(relPath: string, content: string): void {
    this.scanLineRegexRule(
      relPath,
      content,
      'no-playwright-polling-waits',
      WAIT_FOR_TIMEOUT_REGEX,
      ['wait-ok'],
      () =>
        `Artificial sleep page.waitForTimeout() detected. Simulations must synchronize via reactive events or locator assertions.`
    );
  }

  private scanTimeoutInflation(relPath: string, content: string): void {
    this.scanLineRegexRule(
      relPath,
      content,
      'no-test-timeout-inflation',
      TIMEOUT_INFLATION_REGEX,
      ['timeout-ok'],
      (_line, match) => {
        const timeoutMs = match[1] || match[2] || 'unknown';
        return `Test timeout inflation detected (${timeoutMs}ms). Extending test timeouts to mask slowness or contention is strictly forbidden.`;
      }
    );
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new TestHygieneAuditor());
