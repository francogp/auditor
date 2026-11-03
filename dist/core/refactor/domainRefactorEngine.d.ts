import { OxlintAuditor } from "../../suites/architecture/validate_oxlint.js";
import { BaseRefactorEngine, RefactorEngineOptions } from "./baseRefactorEngine.js";
import { DomainFindingItem, DomainRefactorPlan } from "./refactorContracts.js";
export type DomainRefactorEngineOptions = RefactorEngineOptions<OxlintAuditor>;
export declare class DomainRefactorEngine extends BaseRefactorEngine<DomainFindingItem, DomainRefactorPlan, OxlintAuditor> {
  readonly toolId = "auditor-domain";
  readonly configSectionKey: "domain";
  constructor(options?: DomainRefactorEngineOptions);
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
  private static applySnippetReplacements;
  private static applyRecordKeyPlanReplacements;
  /**
   * Deterministically applies a DomainRefactorPlan across target source files.
   */
  static applyPlan(targetDir: string, plan: DomainRefactorPlan): {
    readonly filesChanged: number;
    readonly changesApplied: number;
  };
}