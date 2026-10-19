import { AuditEngineConfig } from "../auditConfigTypes.js";
import { BaseRefactorEngine } from "./baseRefactorEngine.js";
import { MotionFindingItem, MotionRefactorPlan } from "./refactorContracts.js";
//#region src/core/refactor/motionRefactorEngine.d.ts
export declare class MotionRefactorEngine extends BaseRefactorEngine<MotionFindingItem, MotionRefactorPlan> {
  readonly toolId = "auditor-motion";
  readonly configSectionKey: "styles";
  readonly allowedExtensions: Set<string>;
  constructor(projectRootOrOptions?: string | {
    projectRoot?: string;
    config?: AuditEngineConfig;
  }, explicitConfig?: AuditEngineConfig);
  resolveTargetRoots(): readonly string[];
  discoverInFile(filePath: string): readonly MotionFindingItem[];
  createPlan(id: string, findings: readonly MotionFindingItem[]): MotionRefactorPlan;
  applyPlan(projectRoot: string, plan: MotionRefactorPlan): {
    readonly modifiedFiles: readonly string[];
  };
  /**
   * Scans a file or directory to discover GSAP & UI timing violations.
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