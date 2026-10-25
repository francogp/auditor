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
 * Usage:
 *   npm run validate:test-hygiene
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import ts from 'typescript';
import { AuditedDocument } from '../../core/auditedDocument.ts';
import { FileScanAuditor, BaseAuditor,
  createUniformRemediationPhases, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { DEFAULT_AUDIT_CONFIG } from '../../core/auditConfigDefaults.ts';
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

const PLAYWRIGHT_TEXT_LOCATOR_REGEX = /:has-text\(|^text=/;
const PLAYWRIGHT_LOCATOR_METHODS: ReadonlySet<string> = new Set<string>(['locator', 'click', 'dblclick']);

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
        ast: true,
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
      roots: testRoots.length > 0 ? testRoots : DEFAULT_AUDIT_CONFIG.paths.testRoots,
      allowedExtensions: new Set(['.ts', '.js'])
    });
  }

  protected override scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile, doc?: AuditedDocument): void {
    const config = getAuditConfig(this.projectRoot);
    const isIntegration = config.paths.integrationRoots.some((r) => relPath.startsWith(r));
    const isE2e = config.paths.e2eRoots.some((r) => relPath.startsWith(r));

    const effectiveDoc = doc ?? new AuditedDocument(relPath, content, relPath);
    const sf = sourceFile ?? effectiveDoc.getAst();
    if (!sf) return;
    const lines = content.split('\n');

    // 1. Tautological mocks (integration only)
    if (isIntegration) {
      this.runSubAuditorSync('no-tautological-integration-mocks', () => {
        this.scanIntegrationMocksAst(relPath, sf, lines);
      });
    }

    // 2. Playwright E2E simulation rules
    if (isE2e) {
      if (config.e2e?.idLocatorsOnly === true) {
        this.runSubAuditorSync('playwright-id-locators-only', () => {
          this.scanPlaywrightLocatorsAst(relPath, sf, lines);
        });
      }

      this.runSubAuditorSync('no-playwright-force-click', () => {
        this.scanPlaywrightForceClickAst(relPath, sf, lines);
      });

      this.runSubAuditorSync('no-playwright-polling-waits', () => {
        this.scanPlaywrightPollingWaitsAst(relPath, sf, lines);
      });
    }

    // 3. Timeout inflation (all test suites)
    this.runSubAuditorSync('no-test-timeout-inflation', () => {
      this.scanTimeoutInflationAst(relPath, sf, lines);
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

  private scanIntegrationMocksAst(relPath: string, sf: ts.SourceFile, lines: string[]): void {
    const forbiddenTargets = getForbiddenIntegrationMockTargets();
    if (forbiddenTargets.length === 0) return;

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const target = extractViMockTarget(node, sf);
        if (target) {
          for (const forbidden of forbiddenTargets) {
            if (target === forbidden || target.endsWith(forbidden.replace(/^@\//, '/'))) {
              const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
              this.reportHygieneViolation(
                'no-tautological-integration-mocks',
                relPath,
                line,
                `Tautological mock detected in integration test. Mocking core execution engine '${target}' is strictly forbidden in tests/integration/.`,
                lines[line]?.trim() ?? ''
              );
              break;
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  private scanPlaywrightLocatorsAst(relPath: string, sf: ts.SourceFile, lines: string[]): void {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && isPlaywrightTextLocator(node, sf)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        this.reportHygieneViolation(
          'playwright-id-locators-only',
          relPath,
          line,
          `Text-based locator detected in E2E spec. Project policy requires 100% ID-based locators ('#id', '[id="..."]', '[data-testid="..."]').`,
          lines[line]?.trim() ?? ''
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  private reportHygieneViolation(
    ruleId: TestHygieneRuleId,
    relPath: string,
    line: number,
    message: string,
    context: string
  ): void {
    this.addViolation({
      ruleId,
      severity: 'error',
      file: relPath,
      line: line + 1,
      message,
      context
    });
  }

  private scanCallsForViolation(
    sf: ts.SourceFile,
    predicate: (call: ts.CallExpression) => boolean,
    onMatch: (node: ts.CallExpression) => void
  ): void {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && predicate(node)) {
        onMatch(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  private scanPlaywrightForceClickAst(relPath: string, sf: ts.SourceFile, lines: string[]): void {
    this.scanCallsForViolation(sf, isForceClick, (node) => {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      this.reportHygieneViolation(
        'no-playwright-force-click',
        relPath,
        line,
        'Force click ({ force: true }) detected in E2E simulation. Interactivity checks must pass naturally.',
        lines[line]?.trim() ?? ''
      );
    });
  }

  private scanPlaywrightPollingWaitsAst(relPath: string, sf: ts.SourceFile, lines: string[]): void {
    this.scanCallsForViolation(sf, isPollingWait, (node) => {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      this.reportHygieneViolation(
        'no-playwright-polling-waits',
        relPath,
        line,
        'Artificial sleep page.waitForTimeout() detected. Simulations must synchronize via reactive events or locator assertions.',
        lines[line]?.trim() ?? ''
      );
    });
  }

  private scanTimeoutInflationAst(relPath: string, sf: ts.SourceFile, lines: string[]): void {
    const reportTimeout = (node: ts.Node, timeoutMs: number): void => {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      this.reportHygieneViolation(
        'no-test-timeout-inflation',
        relPath,
        line,
        `Test timeout inflation detected (${timeoutMs}ms). Extending test timeouts to mask slowness or contention is strictly forbidden.`,
        lines[line]?.trim() ?? ''
      );
    };

    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAssignment(node)) {
        const propName = node.name.getText(sf);
        if (propName === 'testTimeout' || propName === 'timeout') {
          if (ts.isNumericLiteral(node.initializer)) {
            const timeoutMs = parseInt(node.initializer.text, 10);
            if (timeoutMs >= 30000) {
              reportTimeout(node, timeoutMs);
            }
          }
        }
      } else if (ts.isCallExpression(node)) {
        const timeoutMs = getCallTimeoutMs(node);
        if (timeoutMs !== null && timeoutMs >= 30000) {
          reportTimeout(node, timeoutMs);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
}

function isForceClick(call: ts.CallExpression): boolean {
  const expr = call.expression;
  return ts.isPropertyAccessExpression(expr) && (expr.name.text === 'click' || expr.name.text === 'dblclick') && hasForceClickOption(call);
}

function isPollingWait(call: ts.CallExpression): boolean {
  const expr = call.expression;
  return ts.isPropertyAccessExpression(expr) && expr.name.text === 'waitForTimeout';
}

function hasForceClickOption(call: ts.CallExpression): boolean {
  for (const arg of call.arguments) {
    if (ts.isObjectLiteralExpression(arg)) {
      for (const prop of arg.properties) {
        if (ts.isPropertyAssignment(prop) && prop.name.getText() === 'force' && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
          return true;
        }
      }
    }
  }
  return false;
}

function getCallTimeoutMs(call: ts.CallExpression): number | null {
  const expr = call.expression;
  if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'setTimeout') {
    const firstArg = call.arguments[0];
    if (firstArg && ts.isNumericLiteral(firstArg)) {
      return parseInt(firstArg.text, 10);
    }
  }

  let isTestFn = false;
  if (ts.isIdentifier(expr) && (expr.text === 'it' || expr.text === 'test')) {
    isTestFn = true;
  } else if (ts.isPropertyAccessExpression(expr) && (expr.name.text === 'it' || expr.name.text === 'test')) {
    isTestFn = true;
  }

  if (isTestFn && call.arguments.length >= 3) {
    const lastArg = call.arguments[call.arguments.length - 1];
    if (lastArg && ts.isNumericLiteral(lastArg)) {
      return parseInt(lastArg.text, 10);
    }
  }
  return null;
}

function extractViMockTarget(node: ts.CallExpression, sf: ts.SourceFile): string | null {
  const expr = node.expression;
  if (!ts.isPropertyAccessExpression(expr)) return null;
  if (expr.expression.getText(sf) !== 'vi' || (expr.name.text !== 'mock' && expr.name.text !== 'spyOn')) return null;
  const firstArg = node.arguments[0];
  if (!firstArg || (!ts.isStringLiteral(firstArg) && !ts.isNoSubstitutionTemplateLiteral(firstArg))) return null;
  return firstArg.text.replace(/\.ts$/, '').replace(/\.js$/, '');
}

function isPlaywrightTextLocator(node: ts.CallExpression, sf: ts.SourceFile): boolean {
  const expr = node.expression;
  if (!ts.isPropertyAccessExpression(expr)) return false;
  const methodName = expr.name.text;
  if (methodName === 'getByText') return true;
  if (methodName === 'getByRole') {
    const secondArg = node.arguments[1];
    if (secondArg && ts.isObjectLiteralExpression(secondArg)) {
      return secondArg.properties.some(p => p.name?.getText(sf) === 'name');
    }
  }
  if (PLAYWRIGHT_LOCATOR_METHODS.has(methodName)) {
    const firstArg = node.arguments[0];
    if (firstArg && (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg))) {
      return PLAYWRIGHT_TEXT_LOCATOR_REGEX.test(firstArg.text);
    }
  }
  return false;
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new TestHygieneAuditor());
