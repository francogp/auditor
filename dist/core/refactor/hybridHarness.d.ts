import { RefactorPlan } from "./refactorContracts.js";
//#region src/core/refactor/hybridHarness.d.ts
export declare class HybridHarnessEngine {
  static execute(projectRoot: string, plan: RefactorPlan): Promise<void>;
  static expandMetavariables(rewrite: string, match: any): string;
  private static ensureNamedImport;
  private static applyAstGrepPatternRewrite;
}
//#endregion