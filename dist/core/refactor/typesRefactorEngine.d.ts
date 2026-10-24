import { AuditEngineConfig } from "../auditConfigTypes.js";
import { BaseRefactorEngine } from "./baseRefactorEngine.js";
import { TypesFindingItem, TypesRefactorPlan } from "./refactorContracts.js";
import { ValidateTypeAssertionHygieneAuditor } from "../../suites/architecture/validate_type_assertion_hygiene.js";
export declare class TypesRefactorEngine extends BaseRefactorEngine<TypesFindingItem, TypesRefactorPlan, ValidateTypeAssertionHygieneAuditor> {
  readonly toolId = "auditor-types";
  readonly configSectionKey: "types";
  constructor(auditorOrOptions?: ValidateTypeAssertionHygieneAuditor | string | {
    projectRoot?: string;
    config?: AuditEngineConfig;
  }, _explicitConfig?: AuditEngineConfig);
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