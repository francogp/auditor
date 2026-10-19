import { DiscoveredMagicItem, MagicRefactorPlan, SuperDiracClusterPacket } from "./magicContracts.js";
//#region src/core/refactor/magicNumberExtractor.d.ts
export declare class MagicNumberExtractor {
  private readonly existingConstants;
  private readonly cssVariables;
  /**
     * Pre-indexes existing exported constants and CSS variables across the repository.
    /**
     * Recursively discovers all candidate source files (TS, Vue SFC, SCSS) in a project,
     * cleanly ignoring build outputs, dependencies, and ephemeral directories.
     */
  static discoverScannableFiles(projectRoot: string): string[];
  /**
   * Pre-indexes existing exported constants and CSS variables across the repository.
   */
  indexProjectConstants(projectRoot: string): void;
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
//#endregion