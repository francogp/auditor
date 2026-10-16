import { AuditorConfigFileRequirement } from "../../core/auditContract.js";
import { AuditorOptions, BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_playwright_config.d.ts
export declare const PLAYWRIGHT_CONFIG_RULES: readonly ["playwright-config-missing", "playwright-config-missing-setting"];
export type PlaywrightConfigRuleId = (typeof PLAYWRIGHT_CONFIG_RULES)[number];
export declare const CANONICAL_PLAYWRIGHT_CONFIG_LINES: readonly ["import { defineConfig, devices } from '@playwright/test';", "", "export default defineConfig({", "  testDir: './e2e',", "  timeout: 30000,", "  expect: {", "    timeout: 5000", "  },", "  fullyParallel: true,", "  forbidOnly: !!process.env.CI,", "  retries: process.env.CI ? 2 : 0,", "  workers: process.env.CI ? 1 : undefined,", "  reporter: [['html', { open: 'never' }], ['list']],", "  use: {", "    trace: 'on-first-retry',", "    screenshot: 'only-on-failure'", "  }", "});", ""];
export declare const CANONICAL_PLAYWRIGHT_CONFIG_CONTENT: string;
export declare function isPlaywrightProjectContext(projectRoot: string): boolean;
export declare const PLAYWRIGHT_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<PlaywrightConfigRuleId>;
export declare class ValidatePlaywrightConfigAuditor extends BaseAuditor<PlaywrightConfigRuleId> {
  constructor(rootsOrOptions?: readonly string[] | (Partial<AuditorOptions<PlaywrightConfigRuleId>> & {
    projectRoot?: string;
    fix?: boolean;
    configFile?: string;
  }), maybeProjectRoot?: string);
  runAudit(): Promise<void>;
}
//#endregion