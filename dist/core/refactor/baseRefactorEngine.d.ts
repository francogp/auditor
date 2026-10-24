import { AuditEngineConfig } from "../auditConfigTypes.js";
import { BaseAuditor } from "../auditorBase.js";
export interface ScannedFileFindings<TFinding> {
  readonly file: string;
  readonly fullPath: string;
  readonly findings: readonly TFinding[];
}
export declare abstract class BaseRefactorEngine<TFinding = unknown, TPlan = unknown, TAuditor extends BaseAuditor<any> = BaseAuditor<any>> {
  protected readonly auditor: TAuditor;
  /**
   * Unique identifier of this refactoring tool (e.g. 'auditor-magic', 'auditor-domain').
   */
  abstract readonly toolId: string;
  /**
   * Configuration section key in AuditEngineConfig (e.g. 'constants', 'domain', 'animation').
   */
  abstract readonly configSectionKey?: keyof AuditEngineConfig;
  constructor(auditor: TAuditor);
  get projectRoot(): string;
  get config(): AuditEngineConfig;
  get allowedExtensions(): ReadonlySet<string>;
  getAuditor(): TAuditor;
  resolveTargetRoots(): readonly string[];
  shouldIncludeTests(): boolean;
  shouldIncludeDataPaths(): boolean;
  resolveGlobalIgnorePatterns(): readonly string[];
  resolveSectionIgnorePatterns(): readonly string[];
  resolveCombinedIgnorePatterns(): readonly string[];
  resolveSectionExemptPaths(): readonly string[];
  isToolEnabled(): boolean;
  private isPathInRoots;
  /**
   * Resolves scannable files strictly delegated to the canonical sub-auditor,
   * enforcing target roots (paths.codeRoots) and data directory exclusions when shouldIncludeDataPaths is false.
   */
  getScannableFiles(): readonly string[];
  /**
   * Checks whether a given project-relative path is scannable by the sub-auditor,
   * enforcing target roots (paths.codeRoots) and data directory exclusions when shouldIncludeDataPaths is false.
   */
  isPathScannable(relPath: string): boolean;
  /**
   * Scans an individual file to discover refactoring opportunities.
   */
  abstract discoverInFile(filePath: string): readonly TFinding[];
  /**
   * Discovers refactoring opportunities across all scannable files in the project.
   */
  discoverAll(): readonly ScannedFileFindings<TFinding>[];
  /**
   * Creates a structured refactor plan for an individual file.
   */
  abstract createPlan(id: string, findings: readonly TFinding[]): TPlan;
  /**
   * Applies a refactor plan to source code deterministically.
   */
  abstract applyPlan(projectRoot: string, plan: TPlan): Promise<{
    readonly modifiedFiles: readonly string[];
  }> | {
    readonly modifiedFiles: readonly string[];
  };
}