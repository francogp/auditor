/**
 * scripts/auditors/architecture/validate_test_hygiene.ts
 *
 * TEST HYGIENE & SIMULATION INTEGRITY AUDITOR (Node.js 26+ Native)
 *
 * Enforces test suite architecture and simulation standards across Facturación 2.0:
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

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import {
  FileScanAuditor,
  BaseAuditor
} from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

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
const FORBIDDEN_INTEGRATION_MOCK_TARGETS = [
  '@/logic/db/supabase'
];

const PLAYWRIGHT_TEXT_LOCATOR_REGEX = /(?::has-text\(|getByText\(|getByRole\(\s*['"](?:button|tab|link)['"]\s*,\s*\{\s*name:|\btext=)/;
const FORCE_CLICK_REGEX = /\.(?:click|dblclick)\s*\(\s*\{[^}]*\bforce\s*:\s*true/;
const WAIT_FOR_TIMEOUT_REGEX = /\bpage\.waitForTimeout\s*\(/;
const TIMEOUT_INFLATION_REGEX = /(?:testTimeout\s*:\s*([3-9]\d{4,}|\d{6,})|\b(?:it|test)\s*\([^,]+,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[\s\S]*?\},\s*([3-9]\d{4,}|\d{6,})\))/;
const VI_MOCK_REGEX = /vi\.mock\(\s*['"]([^'"]+)['"]/g;

export class TestHygieneAuditor extends FileScanAuditor<TestHygieneRuleId> {
  constructor() {
    const config = getAuditConfig();
    const testRoots = [
      ...config.paths.integrationRoots,
      ...config.paths.e2eRoots,
      ...config.paths.testRoots
    ];

    super({
      id: 'validate_test_hygiene',
      name: 'Test Hygiene & Simulation Integrity Validator',
      description: 'Audita higiene en tests, mocks y locators de Playwright',
      family: 'architecture',
      ruleIds: TEST_HYGIENE_RULES,
      packageName: 'Tests',
      ruleDescriptions: {
        'no-tautological-integration-mocks': 'Mock tautológico en integración',
        'playwright-id-locators-only': 'Locator Playwright sin ID',
        'no-playwright-force-click': 'Click forzado force:true',
        'no-test-timeout-inflation': 'Timeout inflado artificialmente',
        'no-playwright-polling-waits': 'Uso de page.waitForTimeout()'
      },
      roots: testRoots.length > 0 ? testRoots : ['tests'],
      allowedExtensions: new Set(['.ts', '.js'])
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const config = getAuditConfig();
    const isIntegration = config.paths.integrationRoots.some(r => relPath.startsWith(r));
    const isE2e = config.paths.e2eRoots.some(r => relPath.startsWith(r));

    // 1. Tautological mocks (integration only)
    if (isIntegration) {
      this.scanIntegrationMocks(relPath, content);
    }

    // 2. Playwright E2E simulation rules
    if (isE2e) {
      this.scanE2eSimulations(relPath, content);
    }

    // 3. Timeout inflation (all test suites)
    this.scanTimeoutInflation(relPath, content);
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

      for (const forbidden of FORBIDDEN_INTEGRATION_MOCK_TARGETS) {
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

  private scanE2eSimulations(relPath: string, content: string): void {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineContent = lines[i];
      if (!lineContent) continue;

      if (PLAYWRIGHT_TEXT_LOCATOR_REGEX.test(lineContent) && !this.isLineIgnored(lineContent, ['locator-ok'])) {
        this.addViolation({
          ruleId: 'playwright-id-locators-only',
          severity: 'error',
          file: relPath,
          line: i + 1,
          message: `Text-based locator detected in E2E simulation. Mandate requires 100% ID-based locators ('#id', '[id="..."]', '[data-testid="..."]').`,
          context: lineContent.trim()
        });
      }

      if (FORCE_CLICK_REGEX.test(lineContent) && !this.isLineIgnored(lineContent, ['force-ok'])) {
        this.addViolation({
          ruleId: 'no-playwright-force-click',
          severity: 'error',
          file: relPath,
          line: i + 1,
          message: `Force click ({ force: true }) detected in E2E simulation. Interactivity checks must pass naturally.`,
          context: lineContent.trim()
        });
      }

      if (WAIT_FOR_TIMEOUT_REGEX.test(lineContent) && !this.isLineIgnored(lineContent, ['wait-ok'])) {
        this.addViolation({
          ruleId: 'no-playwright-polling-waits',
          severity: 'error',
          file: relPath,
          line: i + 1,
          message: `Artificial sleep page.waitForTimeout() detected. Simulations must synchronize via reactive events or locator assertions.`,
          context: lineContent.trim()
        });
      }
    }
  }

  private scanTimeoutInflation(relPath: string, content: string): void {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineContent = lines[i];
      if (!lineContent || this.isLineIgnored(lineContent, ['timeout-ok'])) continue;

      const match = TIMEOUT_INFLATION_REGEX.exec(lineContent);
      if (match) {
        const timeoutMs = match[1] || match[2] || 'unknown';
        this.addViolation({
          ruleId: 'no-test-timeout-inflation',
          severity: 'error',
          file: relPath,
          line: i + 1,
          message: `Test timeout inflation detected (${timeoutMs}ms). Extending test timeouts to mask slowness or contention is strictly forbidden.`,
          context: lineContent.trim()
        });
      }
    }
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new TestHygieneAuditor());
}
