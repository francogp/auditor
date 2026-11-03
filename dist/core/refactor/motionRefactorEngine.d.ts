import { OxlintAuditor } from "../../suites/architecture/validate_oxlint.js";
import { BaseRefactorEngine, RefactorEngineOptions } from "./baseRefactorEngine.js";
import { MotionFindingItem, MotionRefactorPlan } from "./refactorContracts.js";
export type MotionRefactorEngineOptions = RefactorEngineOptions<OxlintAuditor>;
export declare class MotionRefactorEngine extends BaseRefactorEngine<MotionFindingItem, MotionRefactorPlan, OxlintAuditor> {
  readonly toolId = "auditor-motion";
  readonly configSectionKey: "animation";
  constructor(options?: MotionRefactorEngineOptions);
  resolveSectionExemptPaths(): readonly string[];
  discoverInFile(filePath: string): readonly MotionFindingItem[];
  createPlan(id: string, findings: readonly MotionFindingItem[]): MotionRefactorPlan;
  applyPlan(projectRoot: string, plan: MotionRefactorPlan): {
    readonly modifiedFiles: readonly string[];
  };
  /**
   * Scans a file or directory using pure TypeScript Compiler AST to discover GSAP & UI timing violations.
   * Strictly ignores stylesheets (.scss, .css) and non-script assets.
   */
  static discoverInFile(filePath: string): readonly MotionFindingItem[];
  /**
   * Generates a declarative MotionRefactorPlan from findings.
   */
  static createPlan(planId: string, findings: readonly MotionFindingItem[]): MotionRefactorPlan;
  private static applyPropertyReplacements;
  private static applyImportInjections;
  /**
   * Applies a MotionRefactorPlan deterministically onto target files.
   */
  static applyPlan(baseDir: string, plan: MotionRefactorPlan): {
    readonly filesChanged: number;
    readonly changesApplied: number;
  };
}