# Purpose

Modular TypeScript AST detectors for the rules of `validate_cli_contracts`, detecting direct `process.argv` access, banned third-party CLI parsers, homebrew flag heuristics, dynamic evaluation bypasses, missing Citty command contracts, missing `citty` devDependencies, and unregistered `:human` package scripts.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Single-Rule Isolation**: Each file implements one `CliContractRuleId` detector conforming to `CliAstDetector`.
- **Canonical Harness Exemption**: `src/core/cli/cittyHarness.ts` and `src/cli/cliUtils.ts` are the sole authorized modules permitted to bridge Node.js `process.argv` into `citty`.

## Key Files

- [`argvAccessDetector.ts`](./argvAccessDetector.ts): Detects direct, bracketed, destructured, or aliased `process.argv`, `Deno.args`, and `Bun.argv` access (`cli-contracts-direct-argv-access`).
- [`bannedParserDetector.ts`](./bannedParserDetector.ts): Detects imports or `require()` calls to `minimist`, `yargs`, `commander`, `cac`, `arg`, `mri`, `sade`, `meow`, `clipanion`, `oclif`, or `node:util.parseArgs` (`cli-contracts-banned-parser-library`).
- [`cittyContractDetector.ts`](./cittyContractDetector.ts): Verifies that CLI entrypoints under `src/cli/` declare a Citty command contract (`cli-contracts-missing-citty-contract`).
- [`dynamicBypassDetector.ts`](./dynamicBypassDetector.ts): Detects `eval()`, `new Function()`, and synchronous `fs.readFileSync(0)` stdin bypasses (`cli-contracts-dynamic-eval-bypass`).
- [`homebrewFlagDetector.ts`](./homebrewFlagDetector.ts): Detects manual flag parsing heuristics (`startsWith('--')`, `includes('--flag')`, `BOOLEAN_FLAGS`, `args[0]`) (`cli-contracts-homebrew-flag-parsing`).
- [`unregisteredScriptDetector.ts`](./unregisteredScriptDetector.ts): Verifies that `src/core/packageScriptRegistry.ts` registers all 5 mandatory `:human` package scripts (`cli-contracts-unregistered-script`).

## Work Guidance

- Add positive and negative test cases to `tests/fixtures/cli_contracts/*.cases` whenever refining AST heuristics.

## Verification

- Run CLI contract detector tests: `npm test -- tests/validate_cli_contracts.test.ts`

## Child DOX Index

- _This directory contains leaf AST detector modules with no subdirectories._
