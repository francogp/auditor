import { BaseRefactorEngine, RefactorEngineOptions } from "./baseRefactorEngine.js";
import { DiscoveredMagicItem, MagicRefactorPlan, SuperDiracClusterPacket } from "./magicContracts.js";
import { MagicNumbersAuditor as ValidateMagicNumbersAuditor } from "../../suites/architecture/validate_magic_numbers.js";
export type MagicNumberExtractorOptions = RefactorEngineOptions<ValidateMagicNumbersAuditor>;
export declare class MagicNumberExtractor extends BaseRefactorEngine<DiscoveredMagicItem, MagicRefactorPlan, ValidateMagicNumbersAuditor> {
  readonly toolId = "auditor-magic";
  readonly configSectionKey: "constants";
  get allowedExtensions(): ReadonlySet<string>;
  private readonly existingConstants;
  private readonly cssVariables;
  constructor(options?: MagicNumberExtractorOptions);
  /**
   * Data catalog paths (paths.dataRoots) are exempt from magic number checks,
   * matching validate_magic_numbers suite behavior 1:1.
   */
  shouldIncludeDataPaths(): boolean;
  /**
   * Discovers all candidate source files (TS, Vue SFC, SCSS) in a project
   * dynamically driven by audit.config.ts.
   */
  static discoverScannableFiles(projectRoot: string): string[];
  /**
   * Pre-indexes existing exported constants and CSS variables across the repository.
   */
  indexProjectConstants(projectRoot?: string): void;
  discoverInFile(filePath: string): readonly DiscoveredMagicItem[];
  createPlan(id: string, findings: readonly DiscoveredMagicItem[]): MagicRefactorPlan;
  applyPlan(projectRoot: string, plan: MagicRefactorPlan): Promise<{
    readonly modifiedFiles: readonly string[];
  }>;
  private indexVariableDeclaration;
  private indexTsConstants;
  private indexCssVariables;
  /**
   * Scans a target file for magic literals across TS, Vue SFC, and SCSS.
   */
  scanFile(projectRoot: string, relFile: string): DiscoveredMagicItem[];
  private scanTypeScriptCode;
  private scanScssCode;
  private isExemptTsLiteral;
  private findEnclosingSymbol;
  private inferSemanticRoleAndName;
  private inferTimerRole;
  private inferPropertyRole;
  private inferBinaryThresholdRole;
  private inferMathRole;
  private toScreamingSnake;
  /**
   * Generates Super-Dirac compact batch table packet.
   */
  generateSuperDiracPacket(projectRoot: string, file: string, items: readonly DiscoveredMagicItem[]): SuperDiracClusterPacket;
  /**
   * Generates a fully-executable MagicRefactorPlan ready to be applied by MagicNumberHarness.
   */
  createRefactorPlan(planId: string, file: string, items: readonly DiscoveredMagicItem[], options?: {
    targetLocation?: 'local-file-header' | 'shared-constants-module';
    destinationFile?: string;
  }): MagicRefactorPlan;
}