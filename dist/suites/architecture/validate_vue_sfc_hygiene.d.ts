import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
import ts from "typescript";
export declare const VUE_SFC_HYGIENE_RULES: readonly ["script-setup-required", "no-script-setup-exports", "vue-template-quote-escaping", "no-data-provider-in-template", "vue-template-magic-calculation", "ime-unsafe-enter-submit", "vue-template-no-side-effects"];
export type VueSfcHygieneRuleId = (typeof VUE_SFC_HYGIENE_RULES)[number];
export declare const SCRIPT_TAG_CONTEXT_MAX_CHARS = 80;
export declare const DEFAULT_DATA_PROVIDER_IN_TEMPLATE_REGEX: RegExp;
export declare class VueSfcHygieneAuditor extends FileScanAuditor<VueSfcHygieneRuleId> {
  private readonly astCache;
  constructor(options?: FileScanRootsOptions);
  protected scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile): void;
  private auditModernVueHygieneRules;
  private auditScriptSetup;
  private auditScriptSetupExports;
  private extractTemplateBlock;
  private auditTemplateQuoteEscaping;
  private extractDynamicExpressions;
  private getTemplateDynamicExpressions;
  private auditDataProviderInTemplate;
  private auditTemplateMagicCalculation;
  private reportTemplateViolation;
}