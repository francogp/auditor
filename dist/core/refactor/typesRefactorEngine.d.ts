import { TypesFindingItem, TypesRefactorPlan } from "./refactorContracts.js";
//#region src/core/refactor/typesRefactorEngine.d.ts
export declare class TypesRefactorEngine {
  /**
   * Scans a file to discover type assertion and return type hygiene violations.
   */
  static discoverInFile(filePath: string): readonly TypesFindingItem[];
  /**
   * Creates a deterministic refactoring plan from findings.
   */
  static createPlan(planId: string, findings: readonly TypesFindingItem[]): TypesRefactorPlan;
  /**
   * Deterministically applies a TypesRefactorPlan across target source files.
   */
  static applyPlan(targetDir: string, plan: TypesRefactorPlan): {
    readonly filesChanged: number;
    readonly changesApplied: number;
  };
}
//#endregion