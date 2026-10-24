import { SharedAstContext } from "../../core/astContext.js";
import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
export declare const CONSTANT_HYGIENE_RULES: readonly ["duplicate-constant-identical", "duplicate-constant-divergent", "constant-bad-names", "constant-no-alias", "constant-no-literal-suffix"];
export type ConstantHygieneRuleId = (typeof CONSTANT_HYGIENE_RULES)[number];
export declare class ValidateConstantHygieneAuditor extends FileScanAuditor<ConstantHygieneRuleId> {
  private readonly scannedAbsFiles;
  constructor(options?: FileScanRootsOptions);
  private scanRegexConstantRules;
  private scanRedundantExportAliases;
  protected scanFile(relPath: string, content: string): void;
  runAudit(astContext?: SharedAstContext): Promise<void>;
}
export { ValidateConstantHygieneAuditor as ConstantHygieneAuditor };