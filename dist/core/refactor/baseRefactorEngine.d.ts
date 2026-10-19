import { AuditEngineConfig } from "../auditConfigTypes.js";
//#region src/core/refactor/baseRefactorEngine.d.ts
export interface ScannedFileFindings<TFinding> {
  readonly file: string;
  readonly fullPath: string;
  readonly findings: readonly TFinding[];
}
export declare abstract class BaseRefactorEngine<TFinding = unknown, TPlan = unknown> {
  readonly projectRoot: string;
  readonly config: AuditEngineConfig;
  /**
   * Unique identifier of this refactoring tool (e.g. 'auditor-magic', 'auditor-domain').
   */
  abstract readonly toolId: string;
  /**
   * Configuration section key in AuditEngineConfig (e.g. 'constants', 'domain', 'styles').
   */
  abstract readonly configSectionKey?: keyof AuditEngineConfig;
  /**
   * Allowed file extensions for this refactoring engine.
   */
  abstract readonly allowedExtensions: ReadonlySet<string>;
  constructor(projectRootOrOptions?: string | {
    projectRoot?: string;
    config?: AuditEngineConfig;
  }, explicitConfig?: AuditEngineConfig);
  /**
   * Resolves target roots for this refactoring engine dynamically from audit.config.ts.
   * Defaults to config.paths.codeRoots ?? ['src', 'scripts'].
   */
  resolveTargetRoots(): readonly string[];
  /**
   * Determines whether this engine should inspect test files.
   * Strictly evaluates config.paths.includeTestsInCodeAudit (defaults to false).
   */
  shouldIncludeTests(): boolean;
  /**
   * Determines whether this engine should inspect data catalog paths (paths.dataRoots).
   * Defaults to true, but overridden to false in constant / magic number engines.
   */
  shouldIncludeDataPaths(): boolean;
  /**
   * Resolves global ignore patterns dynamically from config.paths.ignoreGlobs.
   */
  resolveGlobalIgnorePatterns(): readonly string[];
  /**
   * Resolves section-specific ignore patterns from audit.config.ts.
   */
  resolveSectionIgnorePatterns(): readonly string[];
  /**
   * Combines global ignore patterns and tool section-specific ignore patterns.
   */
  resolveCombinedIgnorePatterns(): readonly string[];
  /**
   * Resolves section-specific exempt paths and exempt files from audit.config.ts.
   */
  resolveSectionExemptPaths(): readonly string[];
  /**
   * Checks whether this refactoring tool is enabled in audit.config.ts.
   */
  isToolEnabled(): boolean;
  /**
   * Discovers all scannable files strictly according to audit.config.ts:
   * - Scoped to this engine's target roots (e.g. codeRoots)
   * - Respects global ignoreGlobs and section-specific ignoreGlobs
   * - Respects section-specific exemptPaths and exemptFiles
   * - Excludes test files if shouldIncludeTests() === false
   * - Excludes data catalog files if shouldIncludeDataPaths() === false
   * - Excludes globally exempt files (isExemptFile)
   */
  getScannableFiles(): readonly string[];
  /**
   * Checks if a relative file path matches any section-specific exempt path or glob.
   */
  protected isSectionPathExempt(relPath: string, sectionExemptPaths: readonly string[]): boolean;
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
//#endregion