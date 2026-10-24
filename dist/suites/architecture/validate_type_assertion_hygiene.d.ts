import { FileScanAuditor } from "../../core/auditorBase.js";
export declare const TYPE_ASSERTION_RULES: readonly ["type-assertion-zero-any", "type-assertion-double-cast", "type-assertion-boolean-literal", "type-assertion-floating-promise", "type-assertion-loose-array"];
export type TypeAssertionRuleId = (typeof TYPE_ASSERTION_RULES)[number];
export interface ValidateTypeAssertionHygieneOptions {
  projectRoot?: string;
  roots?: readonly string[];
}
export declare class ValidateTypeAssertionHygieneAuditor extends FileScanAuditor<TypeAssertionRuleId> {
  constructor(options?: string | ValidateTypeAssertionHygieneOptions);
  scanFile(filePath: string, content: string): Promise<void>;
  private scanAst;
  private scanRegexFallback;
}