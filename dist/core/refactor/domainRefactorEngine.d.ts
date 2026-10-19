import { BaseRefactorEngine } from "./baseRefactorEngine.js";
import { DomainFindingItem, DomainRefactorPlan } from "./refactorContracts.js";
//#region src/core/refactor/domainRefactorEngine.d.ts
export declare class DomainRefactorEngine extends BaseRefactorEngine<DomainFindingItem, DomainRefactorPlan> {
  readonly toolId = "auditor-domain";
  readonly configSectionKey: "domain";
  readonly allowedExtensions: Set<string>;
  discoverInFile(filePath: string): readonly DomainFindingItem[];
  createPlan(domainPlanId: string, domainFindings: readonly DomainFindingItem[]): DomainRefactorPlan;
  applyPlan(projectRoot: string, plan: DomainRefactorPlan): {
    readonly modifiedFiles: readonly string[];
  };
  /**
   * Scans a file to discover domain type hygiene and branded ID opportunities.
   */
  static discoverInFile(filePath: string): readonly DomainFindingItem[];
  static buildDomainHygienePlan(planId: string, targetFiles: readonly string[], findings: readonly DomainFindingItem[]): DomainRefactorPlan;
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