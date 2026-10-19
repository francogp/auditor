import { BaseRefactorEngine } from "./baseRefactorEngine.js";
import { O1FindingItem, O1RefactorPlan } from "./refactorContracts.js";
//#region src/core/refactor/o1RefactorEngine.d.ts
export declare class O1RefactorEngine extends BaseRefactorEngine<O1FindingItem, O1RefactorPlan> {
  readonly toolId = "auditor-o1";
  readonly configSectionKey: "codeSimplification";
  readonly allowedExtensions: Set<string>;
  discoverInFile(filePath: string): readonly O1FindingItem[];
  createPlan(o1PlanId: string, o1Findings: readonly O1FindingItem[]): O1RefactorPlan;
  applyPlan(projectRoot: string, plan: O1RefactorPlan): {
    readonly modifiedFiles: readonly string[];
  };
  /**
   * Scans a file to discover O(1) optimization opportunities.
   */
  static discoverInFile(filePath: string): readonly O1FindingItem[];
  /**
   * Builds a declarative O1RefactorPlan from findings.
   */
  static buildOptimizationPlan(planId: string, findings: readonly O1FindingItem[]): O1RefactorPlan;
  static createPlan(planId: string, findings: readonly O1FindingItem[]): O1RefactorPlan;
  private static applyHoistReplacements;
  /**
   * Applies an O1RefactorPlan deterministically onto target files.
   */
  static applyPlan(baseDir: string, plan: O1RefactorPlan): {
    readonly filesChanged: number;
    readonly changesApplied: number;
  };
}
//#endregion