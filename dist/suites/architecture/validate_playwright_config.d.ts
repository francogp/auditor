import { AuditorConfigFileRequirement } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
export declare const PLAYWRIGHT_CONFIG_RULES: readonly ["playwright-config-missing", "playwright-config-missing-setting"];
export type PlaywrightConfigRuleId = (typeof PLAYWRIGHT_CONFIG_RULES)[number];
export declare const CANONICAL_PLAYWRIGHT_CONFIG_LINES: readonly ["import { defineConfig, devices } from '@playwright/test';", "", "export default defineConfig({", "  testDir: './e2e',", "  timeout: 30000,", "  expect: {", "    timeout: 5000", "  },", "  fullyParallel: true,", "  forbidOnly: !!process.env.CI,", "  retries: process.env.CI ? 2 : 0,", "  workers: process.env.CI ? 1 : undefined,", "  reporter: [['html', { open: 'never' }], ['list']],", "  use: {", "    trace: 'on-first-retry',", "    screenshot: 'only-on-failure'", "  }", "});", ""];
export declare const CANONICAL_PLAYWRIGHT_CONFIG_CONTENT: string;
export declare function isPlaywrightProjectContext(projectRoot: string): boolean;
export declare const PLAYWRIGHT_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<PlaywrightConfigRuleId>;
export interface PlaywrightConfigAuditorOptions {
  readonly projectRoot?: string;
  readonly configFile?: string;
}
export declare class ValidatePlaywrightConfigAuditor extends BaseAuditor<PlaywrightConfigRuleId> {
  constructor(options?: PlaywrightConfigAuditorOptions);
  runAudit(): Promise<void>;
}