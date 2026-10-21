import { FindingSeverity } from "../../core/auditContract.js";
import ts from "typescript";
//#region src/analyzers/cliContracts/cliContractTypes.d.ts
export declare const CLI_CONTRACT_RULES: readonly ["cli-contracts-direct-argv-access", "cli-contracts-banned-parser-library", "cli-contracts-homebrew-flag-parsing", "cli-contracts-dynamic-eval-bypass", "cli-contracts-missing-citty-contract", "cli-contracts-missing-citty-dependency", "cli-contracts-unregistered-script"];
export type CliContractRuleId = (typeof CLI_CONTRACT_RULES)[number];
export interface CliContractViolation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly ruleId: CliContractRuleId;
  readonly message: string;
  readonly context: string;
  readonly severity: FindingSeverity;
}
export interface CliContractFinding {
  readonly ruleId: CliContractRuleId;
  readonly node: ts.Node;
  readonly message: string;
}
/**
 * Per-file facts collected in a single AST pre-pass and shared across all CLI contract detectors.
 */
export interface CliContractScanContext {
  readonly sourceFile: ts.SourceFile;
  readonly relPath: string;
  readonly isCliEntrypoint: boolean;
  readonly isAuthorizedHarness: boolean;
  readonly hasCittyContract: boolean;
  readonly processAliases: ReadonlySet<string>;
  readonly argvKeyConstants: ReadonlySet<string>;
  readonly shadowedProcessScopes: ReadonlySet<ts.Node>;
  readonly dynamicProcessParamNodes: ReadonlySet<ts.Node>;
  readonly claimed: Set<ts.Node>;
}
export type CliContractDetector = (node: ts.Node, ctx: CliContractScanContext) => CliContractFinding | null;
//#endregion