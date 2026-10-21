/**
 * src/analyzers/cliContracts/cliContractTypes.ts
 *
 * Canonical rule catalog and shared contracts for the CLI contracts AST analyzer
 * consumed by validate_cli_contracts.
 */

import type ts from 'typescript';

import type { FindingSeverity } from '../../core/auditContract.ts';

export const CLI_CONTRACT_RULES = [
  'cli-contracts-direct-argv-access',
  'cli-contracts-banned-parser-library',
  'cli-contracts-homebrew-flag-parsing',
  'cli-contracts-dynamic-eval-bypass',
  'cli-contracts-missing-citty-contract',
  'cli-contracts-missing-citty-dependency',
  'cli-contracts-unregistered-script'
] as const;

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

export type CliContractDetector = (
  node: ts.Node,
  ctx: CliContractScanContext
) => CliContractFinding | null;
