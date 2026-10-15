import { AuditedDocument } from "../../core/auditedDocument.js";
import { FileScanAuditor } from "../../core/auditorBase.js";
import ts from "typescript";
//#region src/suites/architecture/validate_magic_numbers.d.ts
export declare const MAGIC_NUMBERS_RULES: readonly ["magic-number-naked"];
export type MagicNumbersRuleId = (typeof MAGIC_NUMBERS_RULES)[number];
export interface ValidateMagicNumbersOptions {
  readonly projectRoot?: string;
  readonly roots?: readonly string[];
}
export declare class ValidateMagicNumbersAuditor extends FileScanAuditor<MagicNumbersRuleId> {
  constructor(options?: ValidateMagicNumbersOptions | readonly string[], maybeProjectRoot?: string);
  private inspectAst;
  protected scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile, doc?: AuditedDocument): void;
}
//#endregion
export { ValidateMagicNumbersAuditor as MagicNumbersAuditor };