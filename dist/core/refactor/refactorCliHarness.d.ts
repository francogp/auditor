import { TableColumn } from "../unifiedTheme.js";
import { CommandDef } from "../cli/cittyHarness.js";
import { BaseRefactorEngine } from "./baseRefactorEngine.js";
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
  readonly engineFactory?: (projectRoot: string) => BaseRefactorEngine<TFinding, TPlan>;
  readonly discoverInFile: (filePath: string) => readonly TFinding[];
  readonly buildTableRow: (relFile: string, fileFindings: readonly TFinding[]) => Record<string, string>;
  readonly buildSummaryMessage: (filesCount: number, allFindings: readonly TFinding[]) => string;
  readonly toDiracItem: (finding: TFinding) => DiracInspectionItem;
  readonly createPlan: (planId: string, findings: readonly TFinding[]) => TPlan;
  readonly applyPlan: (targetDir: string, plan: TPlan) => {
    readonly filesChanged: number;
    readonly changesApplied: number;
  };
  readonly extendedHelp?: string;
}
declare const REFACTOR_HARNESS_ARGS: {
  readonly file: {
    readonly type: "string";
    readonly description: "Target file path to inspect";
  };
  readonly plan: {
    readonly type: "string";
    readonly description: "Path to declarative refactor plan JSON";
  };
  readonly worktree: {
    readonly type: "boolean";
    readonly description: "Execute and verify mutation inside an ephemeral Git Worktree";
    readonly default: false;
  };
  readonly project: {
    readonly type: "string";
    readonly alias: "p";
    readonly description: "Target host project root directory";
    readonly default: ".";
  };
  readonly human: {
    readonly type: "boolean";
    readonly description: "Enable interactive human Box-Drawing console output";
    readonly default: false;
  };
  readonly verbose: {
    readonly type: "boolean";
    readonly description: "Enable verbose diagnostic output";
    readonly default: false;
  };
  readonly format: {
    readonly type: "string";
    readonly description: "Console output format (compact, human, verbose, json)";
  };
  readonly json: {
    readonly type: "boolean";
    readonly description: "Emit structured JSON output";
    readonly default: false;
  };
  readonly help: {
    readonly type: "boolean";
    readonly alias: "h";
    readonly description: "Display command help manual";
    readonly default: false;
  };
};
export declare function formatCliRelativeFilePath(relPath: string): string;
/**
 * Creates a declarative Citty `CommandDef` for a refactoring CLI tool.
 */
export declare function createRefactorCli<TFinding, TPlan>(def: RefactorCliDefinition<TFinding, TPlan>): CommandDef<typeof REFACTOR_HARNESS_ARGS>;
export declare function runRefactorCliHarness<TFinding, TPlan>(def: RefactorCliDefinition<TFinding, TPlan>, argv?: readonly string[]): Promise<void>;
export {};