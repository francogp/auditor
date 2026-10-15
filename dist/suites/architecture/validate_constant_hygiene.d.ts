import { SharedAstContext } from "../../core/astContext.js";
import { FileScanAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_constant_hygiene.d.ts
export declare const CONSTANT_HYGIENE_RULES: readonly ["duplicate-constant-identical", "duplicate-constant-divergent", "constant-bad-names", "constant-no-alias", "constant-no-literal-suffix"];
export type ConstantHygieneRuleId = (typeof CONSTANT_HYGIENE_RULES)[number];
export declare class ValidateConstantHygieneAuditor extends FileScanAuditor<ConstantHygieneRuleId> {
  private readonly scannedAbsFiles;
  constructor(rootsOrOptions?: readonly string[] | {
    projectRoot?: string;
    roots?: readonly string[];
  }, maybeProjectRoot?: string);
  private scanRegexConstantRules;
  private scanRedundantExportAliases;
  protected scanFile(relPath: string, content: string): void;
  runAudit(astContext?: SharedAstContext): Promise<void>;
}
//#endregion
export { ValidateConstantHygieneAuditor as ConstantHygieneAuditor };