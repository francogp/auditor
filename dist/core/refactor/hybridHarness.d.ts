import { RefactorPlan } from "./refactorContracts.js";
export declare class HybridHarnessEngine {
  static execute(projectRoot: string, plan: RefactorPlan): Promise<void>;
  private static ensureSharedModule;
  private static rewriteVueSfc;
  private static rewriteTypeScriptFile;
  static expandMetavariables(rewrite: string, match: {
    getMatch?: (name: string) => {
      text: () => string;
    } | null;
  }): string;
  private static ensureNamedImport;
  private static applyAstGrepPatternRewrite;
}