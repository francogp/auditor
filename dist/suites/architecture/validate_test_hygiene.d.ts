import { SharedAstContext } from "../../core/astContext.js";
import { FileScanAuditor } from "../../core/auditorBase.js";
export type TestHygieneRuleId = 'no-tautological-integration-mocks' | 'playwright-id-locators-only' | 'no-playwright-force-click' | 'no-test-timeout-inflation' | 'no-playwright-polling-waits';
export declare const TEST_HYGIENE_RULES: readonly TestHygieneRuleId[];
export declare function getForbiddenIntegrationMockTargets(): readonly string[];
export interface TestHygieneOptions {
  readonly projectRoot?: string;
}
export declare class TestHygieneAuditor extends FileScanAuditor<TestHygieneRuleId> {
  constructor(options?: TestHygieneOptions);
  protected scanFile(relPath: string, content: string): void;
  runAudit(astContext?: SharedAstContext): Promise<void>;
  private scanIntegrationMocks;
  private scanLineRegexRule;
  private scanPlaywrightLocators;
  private scanPlaywrightForceClick;
  private scanPlaywrightPollingWaits;
  private scanTimeoutInflation;
}