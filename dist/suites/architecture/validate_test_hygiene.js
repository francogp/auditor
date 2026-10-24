import { DEFAULT_AUDIT_CONFIG } from "../../core/auditConfigDefaults.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
// src/suites/architecture/validate_test_hygiene.ts
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
enableCompileCache();
const TEST_HYGIENE_RULES = [
	"no-tautological-integration-mocks",
	"playwright-id-locators-only",
	"no-playwright-force-click",
	"no-test-timeout-inflation",
	"no-playwright-polling-waits"
];
function getForbiddenIntegrationMockTargets() {
	return getAuditConfig().persistence?.forbiddenMockModules ?? [];
}
const PLAYWRIGHT_TEXT_LOCATOR_REGEX = /:has-text\(|getByText\(|getByRole\(\s*['"](?:button|tab|link)['"]\s*,\s*\{\s*name:|\btext=/;
const FORCE_CLICK_REGEX = /\.(?:click|dblclick)\s*\(\s*\{[^}]*\bforce\s*:\s*true/;
const WAIT_FOR_TIMEOUT_REGEX = /\bpage\.waitForTimeout\s*\(/;
const TIMEOUT_INFLATION_REGEX = /testTimeout\s*:\s*([3-9]\d{4,}|\d{6,})|\b(?:it|test)\s*\([^,]+,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[\s\S]*?\},\s*([3-9]\d{4,}|\d{6,})\)/;
const VI_MOCK_REGEX = /vi\.mock\(\s*['"]([^'"]+)['"]/g;
var TestHygieneAuditor = class extends FileScanAuditor {
	constructor(options = {}) {
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
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_test_hygiene",
			name: "Test Hygiene & Simulation Integrity Validator",
			description: "Audits test hygiene, mocks, and Playwright locators",
			family: "architecture",
			ruleIds: TEST_HYGIENE_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(TEST_HYGIENE_RULES, "hygiene"),
			packageName: "Tests",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "🧪",
			ruleDescriptions: {
				"no-tautological-integration-mocks": "Tautological mock in integration test",
				"playwright-id-locators-only": "Playwright locator without ID selector",
				"no-playwright-force-click": "Forced click with force:true",
				"no-test-timeout-inflation": "Artificially inflated test timeout",
				"no-playwright-polling-waits": "Use of page.waitForTimeout()"
			},
			ruleRemediations: {
				"no-tautological-integration-mocks": "📖 REMEDIATION GUIDE: no-tautological-integration-mocks\n1. Root Cause: A mock (`vi.mock()`, `vi.spyOn()`) was found in an integration test replacing the database or primary subsystem under test. Integration tests must validate real wiring with real persistence (in-memory/SQLite).\n2. Diagnosis: Review mocks declared in the reported integration test.\n3. Canonical Solution: Remove the mock and use an hermetic persistence engine or realistic fixtures. If purely unit-level, move the test to `tests/unit/`.\n4. Example / Auto-fix command:\n   ❌ Tautological mock: `vi.mock(\"@/services/database\")` in integration test\n   ✅ Real wiring:       Use in-memory SQLite with migrated schema.",
				"playwright-id-locators-only": "📖 REMEDIATION GUIDE: playwright-id-locators-only\n1. Root Cause: An end-to-end (E2E) test locates elements using fragile CSS class selectors (e.g. `.btn.btn-primary.mt-2`, `div > span:nth-child(3)`). Visual selectors break on cosmetic redesigns.\n2. Diagnosis: Inspect the `page.locator(...)` call at the reported line.\n3. Canonical Solution: Use robust locators based on unique IDs (`#submit-button`), test attributes (`[data-testid=\"...\"]`), or accessible roles (`page.getByRole(...)`).\n4. Example / Auto-fix command:\n   ❌ Fragile: `page.locator(\".card-body > div.btn-wrapper button\")`\n   ✅ Robust:  `page.locator(\"#confirm-checkout-btn\")` or `page.getByRole(\"button\", { name: \"Confirm\" })`",
				"no-playwright-force-click": "📖 REMEDIATION GUIDE: no-playwright-force-click\n1. Root Cause: `{ force: true }` was passed to a Playwright click action (`locator.click({ force: true })`). Forcing clicks bypasses actionability checks, hiding blocking modals or animations.\n2. Diagnosis: Locate the `force: true` option in the E2E test.\n3. Canonical Solution: Remove `force: true` and ensure element readiness via `await expect(locator).toBeVisible()` or by managing overlays/animations.\n4. Example / Auto-fix command:\n   ❌ Forced:    `await btn.click({ force: true });`\n   ✅ Realistic: `await expect(btn).toBeVisible(); await btn.click();`",
				"no-test-timeout-inflation": "📖 REMEDIATION GUIDE: no-test-timeout-inflation\n1. Root Cause: A test execution timeout was artificially inflated (`test.setTimeout(60000)`, `vi.setConfig({ testTimeout: ... })`). Inflating timeouts masks performance bottlenecks, infinite loops, or hanging promises.\n2. Diagnosis: Locate the custom timeout configuration in the test file.\n3. Canonical Solution: Remove the inflated timeout and optimize test execution (e.g. fast-forwarding animations with `gsap.globalTimeline.timeScale(100)` or resolving async steps deterministically).\n4. Example / Auto-fix command:\n   ❌ Inflated: `test.setTimeout(120000);`\n   ✅ Standard: Respect default framework timeouts (5s).",
				"no-playwright-polling-waits": "📖 REMEDIATION GUIDE: no-playwright-polling-waits\n1. Root Cause: Fixed sleep timers (`page.waitForTimeout(ms)`) were used in E2E tests. Fixed sleeps slow test suites and cause flaky failures on slower CI runners.\n2. Diagnosis: Locate `waitForTimeout` calls in the test file.\n3. Canonical Solution: Replace fixed sleeps with web-first Playwright assertions that wait automatically for the exact state: `await expect(locator).toHaveText(...)` or `await page.waitForResponse(...)`.\n4. Example / Auto-fix command:\n   ❌ Fixed wait:  `await page.waitForTimeout(3000);`\n   ✅ Auto-wait:   `await expect(page.locator(\"#status\")).toHaveText(\"Ready\");`"
			},
			roots: testRoots.length > 0 ? testRoots : DEFAULT_AUDIT_CONFIG.paths.testRoots,
			allowedExtensions: /* @__PURE__ */ new Set([".ts", ".js"])
		});
	}
	scanFile(relPath, content) {
		const config = getAuditConfig(this.projectRoot);
		const isIntegration = config.paths.integrationRoots.some((r) => relPath.startsWith(r));
		const isE2e = config.paths.e2eRoots.some((r) => relPath.startsWith(r));
		if (isIntegration) this.runSubAuditorSync("no-tautological-integration-mocks", () => {
			this.scanIntegrationMocks(relPath, content);
		});
		if (isE2e) {
			this.runSubAuditorSync("playwright-id-locators-only", () => {
				this.scanPlaywrightLocators(relPath, content);
			});
			this.runSubAuditorSync("no-playwright-force-click", () => {
				this.scanPlaywrightForceClick(relPath, content);
			});
			this.runSubAuditorSync("no-playwright-polling-waits", () => {
				this.scanPlaywrightPollingWaits(relPath, content);
			});
		}
		this.runSubAuditorSync("no-test-timeout-inflation", () => {
			this.scanTimeoutInflation(relPath, content);
		});
	}
	async runAudit(astContext) {
		await super.runAudit(astContext);
		const config = getAuditConfig(this.projectRoot);
		if (!(config.paths?.integrationRoots ?? []).some((r) => fs.existsSync(path.resolve(this.projectRoot, r)))) this.markRuleNotApplicable("no-tautological-integration-mocks", "No existing integrationRoots found on disk");
		if (!(config.paths?.e2eRoots ?? []).some((r) => fs.existsSync(path.resolve(this.projectRoot, r)))) {
			this.markRuleNotApplicable("playwright-id-locators-only", "No existing e2eRoots found on disk");
			this.markRuleNotApplicable("no-playwright-force-click", "No existing e2eRoots found on disk");
			this.markRuleNotApplicable("no-playwright-polling-waits", "No existing e2eRoots found on disk");
		}
	}
	scanIntegrationMocks(relPath, content) {
		const lines = content.split("\n");
		let match;
		VI_MOCK_REGEX.lastIndex = 0;
		while ((match = VI_MOCK_REGEX.exec(content)) !== null) {
			const rawTarget = match[1];
			if (!rawTarget) continue;
			const target = rawTarget.replace(/\.ts$/, "").replace(/\.js$/, "");
			const lineNumber = content.slice(0, match.index).split("\n").length;
			const lineContent = lines[lineNumber - 1] || "";
			const forbiddenTargets = getForbiddenIntegrationMockTargets();
			for (const forbidden of forbiddenTargets) if (target === forbidden || target.endsWith(forbidden.replace(/^@\//, "/"))) {
				this.addViolation({
					ruleId: "no-tautological-integration-mocks",
					severity: "error",
					file: relPath,
					line: lineNumber,
					message: `Tautological mock detected in integration test. Mocking core execution engine '${target}' is strictly forbidden in tests/integration/.`,
					context: lineContent.trim()
				});
				break;
			}
		}
	}
	scanLineRegexRule(relPath, content, ruleId, regex, messageFn) {
		const lines = content.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const lineContent = lines[i];
			if (!lineContent) continue;
			const match = regex.exec(lineContent);
			if (match) this.addViolation({
				ruleId,
				severity: "error",
				file: relPath,
				line: i + 1,
				message: messageFn(lineContent, match),
				context: lineContent.trim()
			});
		}
	}
	scanPlaywrightLocators(relPath, content) {
		if (getAuditConfig().e2e?.idLocatorsOnly !== true) return;
		this.scanLineRegexRule(relPath, content, "playwright-id-locators-only", PLAYWRIGHT_TEXT_LOCATOR_REGEX, () => `Text-based locator detected in E2E spec. Project policy requires 100% ID-based locators ('#id', '[id="..."]', '[data-testid="..."]').`);
	}
	scanPlaywrightForceClick(relPath, content) {
		this.scanLineRegexRule(relPath, content, "no-playwright-force-click", FORCE_CLICK_REGEX, () => `Force click ({ force: true }) detected in E2E simulation. Interactivity checks must pass naturally.`);
	}
	scanPlaywrightPollingWaits(relPath, content) {
		this.scanLineRegexRule(relPath, content, "no-playwright-polling-waits", WAIT_FOR_TIMEOUT_REGEX, () => `Artificial sleep page.waitForTimeout() detected. Simulations must synchronize via reactive events or locator assertions.`);
	}
	scanTimeoutInflation(relPath, content) {
		this.scanLineRegexRule(relPath, content, "no-test-timeout-inflation", TIMEOUT_INFLATION_REGEX, (_line, match) => {
			return `Test timeout inflation detected (${match[1] || match[2] || "unknown"}ms). Extending test timeouts to mask slowness or contention is strictly forbidden.`;
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new TestHygieneAuditor());
export { TEST_HYGIENE_RULES, TestHygieneAuditor, getForbiddenIntegrationMockTargets };
