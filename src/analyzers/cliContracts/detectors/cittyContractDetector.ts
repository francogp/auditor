/**
 * src/analyzers/cliContracts/detectors/cittyContractDetector.ts
 *
 * cli-contracts-missing-citty-contract: Ensures every standalone CLI executable in `src/cli/`
 * declares its command interface via Citty (`defineCommand` / `createRefactorCli` / `createAuditorCli`).
 */

import ts from 'typescript';

import type { CliContractDetector } from '../cliContractTypes.ts';

const MISSING_CITTY_CONTRACT_MESSAGE =
  "CLI executable does not declare a formal command contract with 'citty' ('defineCommand', 'createRefactorCli', or 'createAuditorCli'). Every CLI binary must explicitly define its arguments, subcommands, and 'human' flag support.";

export const cittyContractDetector: CliContractDetector = (node, ctx) => {
  if (ctx.isAuthorizedHarness) return null;
  if (!ts.isSourceFile(node)) return null;
  if (!ctx.isCliEntrypoint) return null;

  if (!ctx.hasCittyContract) {
    return {
      ruleId: 'cli-contracts-missing-citty-contract',
      node,
      message: MISSING_CITTY_CONTRACT_MESSAGE
    };
  }

  return null;
};
