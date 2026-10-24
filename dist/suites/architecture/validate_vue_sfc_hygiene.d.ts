import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
export type VueSfcHygieneRuleId = 'script-setup-required' | 'no-script-setup-exports' | 'vue-template-quote-escaping' | 'no-data-provider-in-template' | 'vue-template-magic-calculation';
export declare const VUE_SFC_HYGIENE_RULES: readonly VueSfcHygieneRuleId[];
export declare const SCRIPT_TAG_CONTEXT_MAX_CHARS = 80;
export declare const DEFAULT_DATA_PROVIDER_IN_TEMPLATE_REGEX: RegExp;
export declare class VueSfcHygieneAuditor extends FileScanAuditor<VueSfcHygieneRuleId> {
  constructor(options?: FileScanRootsOptions);
  protected scanFile(relPath: string, content: string): void;
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