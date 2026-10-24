import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
import ts from "typescript";
export declare const REACTIVE_PURITY_RULES: readonly ["computed-state-mutation", "computed-side-effect"];
export type ReactivePurityRuleId = (typeof REACTIVE_PURITY_RULES)[number];
export declare class ReactivePurityAuditor extends FileScanAuditor<ReactivePurityRuleId> {
  constructor(options?: FileScanRootsOptions);
  private checkComputedCall;
  private activeTargetRule?;
  protected scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile): void;
  private reportComputedViolation;
  private inspectGetterBody;
}