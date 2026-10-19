import { BaseRefactorEngine } from "./baseRefactorEngine.js";
import { TypesFindingItem, TypesRefactorPlan } from "./refactorContracts.js";
//#region src/core/refactor/typesRefactorEngine.d.ts
export declare class TypesRefactorEngine extends BaseRefactorEngine<TypesFindingItem, TypesRefactorPlan> {
  readonly toolId = "auditor-types";
  readonly configSectionKey: "typeCheck";
  readonly allowedExtensions: Set<string>;
  discoverInFile(filePath: string): readonly TypesFindingItem[];
  createPlan(typesPlanId: string, typesFindings: readonly TypesFindingItem[]): TypesRefactorPlan;
  applyPlan(projectRoot: string, plan: TypesRefactorPlan): {
    readonly modifiedFiles: readonly string[];
  };
  /**
   * Scans a file to discover type assertion and return type hygiene violations.
   */
  static discoverInFile(filePath: string): readonly TypesFindingItem[];
  /**
   * Creates a deterministic refactoring plan from findings.
   */
  static buildTypeAssertionPlan(planId: string, findings: readonly TypesFindingItem[]): TypesRefactorPlan;
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