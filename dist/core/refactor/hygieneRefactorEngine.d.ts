import { OxlintAuditor } from "../../suites/architecture/validate_oxlint.js";
import { BaseRefactorEngine, RefactorEngineOptions } from "./baseRefactorEngine.js";
import { HygieneFindingItem, HygieneRefactorPlan } from "./refactorContracts.js";
import { AstTextReplacement } from "../astScriptExtractor.js";
/**
 * Inspects a file for code hygiene findings and prepares exact AST text replacements.
 */
export declare function inspectHygieneFile(filePath: string, sourceText: string): {
  readonly findings: readonly HygieneFindingItem[];
  readonly replacements: readonly AstTextReplacement[];
};
export type HygieneRefactorEngineOptions = RefactorEngineOptions<OxlintAuditor>;
export declare class HygieneRefactorEngine extends BaseRefactorEngine<HygieneFindingItem, HygieneRefactorPlan, OxlintAuditor> {
  readonly toolId = "auditor-hygiene";
  readonly configSectionKey: "oxlint";
  constructor(options?: HygieneRefactorEngineOptions);
  discoverInFile(filePath: string): readonly HygieneFindingItem[];
  createPlan(hygienePlanId: string, hygieneFindings: readonly HygieneFindingItem[]): HygieneRefactorPlan;
  applyPlan(projectRoot: string, plan: HygieneRefactorPlan): {
    readonly modifiedFiles: readonly string[];
  };
  /**
   * Scans a file to discover accessibility, globalThis, and void violations using TypeScript AST.
   */
  static discoverInFile(filePath: string): readonly HygieneFindingItem[];
  /**
   * Builds a declarative HygieneRefactorPlan from findings.
   */
  static buildHygienePlan(planId: string, findings: readonly HygieneFindingItem[]): HygieneRefactorPlan;
  static createPlan(planId: string, findings: readonly HygieneFindingItem[]): HygieneRefactorPlan;
  /**
   * Applies a HygieneRefactorPlan cleanly using AST replacements.
   */
  static applyPlan(targetDir: string, plan: HygieneRefactorPlan): {
    readonly filesChanged: number;
    readonly changesApplied: number;
  };
}