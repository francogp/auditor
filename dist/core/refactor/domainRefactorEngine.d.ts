import { AuditEngineConfig } from "../auditConfigTypes.js";
import { BaseRefactorEngine } from "./baseRefactorEngine.js";
import { DomainFindingItem, DomainRefactorPlan } from "./refactorContracts.js";
import { DomainTypesAuditor } from "../../suites/domain_data/validate_domain_types.js";
export declare class DomainRefactorEngine extends BaseRefactorEngine<DomainFindingItem, DomainRefactorPlan, DomainTypesAuditor> {
  readonly toolId = "auditor-domain";
  readonly configSectionKey: "domain";
  constructor(auditorOrOptions?: DomainTypesAuditor | string | {
    projectRoot?: string;
    config?: AuditEngineConfig;
  }, _explicitConfig?: AuditEngineConfig);
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