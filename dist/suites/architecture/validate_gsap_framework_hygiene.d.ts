import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_gsap_framework_hygiene.d.ts
export type GsapFrameworkHygieneRuleId = 'gsap-unscoped-component-selectors' | 'gsap-missing-context-revert' | 'gsap-missing-plugin-registration' | 'gsap-banned-devtools-production';
export declare const GSAP_FRAMEWORK_HYGIENE_RULES: readonly GsapFrameworkHygieneRuleId[];
export declare const DEVTOOLS_GUARD_WINDOW_PRE_CHARS = 150;
export declare const DEVTOOLS_GUARD_WINDOW_POST_CHARS = 200;
interface GsapScopeRange {
  readonly start: number;
  readonly end: number;
}
export declare function findGsapScopeRanges(content: string): readonly GsapScopeRange[];
export declare class ValidateGsapFrameworkHygieneAuditor extends FileScanAuditor<GsapFrameworkHygieneRuleId> {
  constructor(options?: FileScanRootsOptions);
  protected scanFile(relPath: string, content: string): void;
  private isCodeFile;
  private isUiComponent;
  private scanUnscopedSelectors;
  private scanContextRevert;
  private scanPluginRegistration;
  private scanDevtoolsProduction;
}
//#endregion
export {};