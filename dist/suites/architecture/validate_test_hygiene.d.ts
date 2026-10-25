import { SharedAstContext } from "../../core/astContext.js";
import { AuditedDocument } from "../../core/auditedDocument.js";
import { FileScanAuditor } from "../../core/auditorBase.js";
import ts from "typescript";
export type TestHygieneRuleId = 'no-tautological-integration-mocks' | 'playwright-id-locators-only' | 'no-playwright-force-click' | 'no-test-timeout-inflation' | 'no-playwright-polling-waits';
export declare const TEST_HYGIENE_RULES: readonly TestHygieneRuleId[];
export declare function getForbiddenIntegrationMockTargets(): readonly string[];
export interface TestHygieneOptions {
  readonly projectRoot?: string;
}
export declare class TestHygieneAuditor extends FileScanAuditor<TestHygieneRuleId> {
  constructor(options?: TestHygieneOptions);
  protected scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile, doc?: AuditedDocument): void;
  runAudit(astContext?: SharedAstContext): Promise<void>;
  private scanIntegrationMocksAst;
  private scanPlaywrightLocatorsAst;
  private reportHygieneViolation;
  private scanCallsForViolation;
  private scanPlaywrightForceClickAst;
  private scanPlaywrightPollingWaitsAst;
  private scanTimeoutInflationAst;
}