import { DomainFindingItem, DomainRefactorPlan } from "./refactorContracts.js";
//#region src/core/refactor/domainRefactorEngine.d.ts
export declare class DomainRefactorEngine {
  /**
   * Scans a file to discover domain type hygiene and branded ID opportunities.
   */
  static discoverInFile(filePath: string): readonly DomainFindingItem[];
  /**
   * Creates a deterministic refactoring plan from findings.
   */
  static createPlan(planId: string, findings: readonly DomainFindingItem[]): DomainRefactorPlan;
  /**
   * Deterministically applies a DomainRefactorPlan across target source files.
   */
  static applyPlan(targetDir: string, plan: DomainRefactorPlan): {
    readonly filesChanged: number;
    readonly changesApplied: number;
  };
}
//#endregion