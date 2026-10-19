import { AuditEngineConfig } from "../auditConfigTypes.js";
import { BaseRefactorEngine } from "./baseRefactorEngine.js";
import { MotionFindingItem, MotionRefactorPlan } from "./refactorContracts.js";
import { ValidateGsapAnimationsAuditor } from "../../suites/architecture/validate_gsap_animations.js";
//#region src/core/refactor/motionRefactorEngine.d.ts
export declare class MotionRefactorEngine extends BaseRefactorEngine<MotionFindingItem, MotionRefactorPlan, ValidateGsapAnimationsAuditor> {
  readonly toolId = "auditor-motion";
  readonly configSectionKey: "animation";
  constructor(auditorOrOptions?: ValidateGsapAnimationsAuditor | string | {
    projectRoot?: string;
    config?: AuditEngineConfig;
  }, _explicitConfig?: AuditEngineConfig);
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
//#endregion