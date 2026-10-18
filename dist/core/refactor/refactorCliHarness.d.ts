import { TableColumn } from "../unifiedTheme.js";
//#region src/core/refactor/refactorCliHarness.d.ts
export interface DiracInspectionItem {
  readonly line: number;
  readonly kind: string;
  readonly originalSnippet: string;
  readonly suggestedReplacement: string;
  readonly explanation: string;
}
export interface RefactorCliDefinition<TFinding, TPlan> {
  readonly toolName: string;
  readonly toolDescription: string;
  readonly bannerTitle: string;
  readonly bannerSubtitle: string;
  readonly scanningMessage: string;
  readonly zeroFindingsMessage: string;
  readonly tableColumns: readonly TableColumn[];
  readonly discoverInFile: (filePath: string) => readonly TFinding[];
  readonly buildTableRow: (relFile: string, fileFindings: readonly TFinding[]) => Record<string, string>;
  readonly buildSummaryMessage: (filesCount: number, allFindings: readonly TFinding[]) => string;
  readonly toDiracItem: (finding: TFinding) => DiracInspectionItem;
  readonly createPlan: (planId: string, findings: readonly TFinding[]) => TPlan;
  readonly applyPlan: (targetDir: string, plan: TPlan) => {
    readonly filesChanged: number;
    readonly changesApplied: number;
  };
}
export declare function formatCliRelativeFilePath(relPath: string): string;
export declare function runRefactorCliHarness<TFinding, TPlan>(def: RefactorCliDefinition<TFinding, TPlan>, argv?: string[]): Promise<void>;
//#endregion