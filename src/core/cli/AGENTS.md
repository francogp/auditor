# Purpose

Canonical declarative CLI harness powered by `citty` (`citty@^0.2.2`). Centralizes command-line argument parsing, positional `human` / `help` normalization, `--key=value` and bare `key=value` token normalization, and typed option schemas across all `@francogp/auditor` executables and sub-auditors.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Single Authorized `process.argv` Bridge**: `cittyHarness.ts` is the sole module authorized to read `process.argv.slice(2)` (`getProcessCliArgs`) and feed normalized tokens into `citty` (`parseCittyArgs`, `defineCommand`, `runMain`).
- **Universal `human` Mode Support**: `COMMON_CLI_ARGS` and `resolveHumanModeFromArgs` guarantee that every CLI tool and sub-auditor natively accepts `human`, `--human`, `-H`, `--pretty`, and `format=human` without throwing unknown subcommand errors.

## Key Files

- [`cittyHarness.ts`](./cittyHarness.ts): Declarative Citty CLI wrapper (`createAuditorCli`, `parseCittyArgs`, `COMMON_CLI_ARGS`, `normalizeAuditorCliTokens`, `resolveHumanModeFromArgs`).

## Work Guidance

- All CLI scripts under `src/cli/` and sub-auditors under `src/suites/` must consume `cittyHarness.ts` or `createRefactorCli` (`src/core/refactor/refactorCliHarness.ts`) rather than reading `process.argv` directly.

## Verification

- Run CLI contract verification: `npm test -- tests/validate_cli_contracts.test.ts`

## Child DOX Index

- _This directory contains leaf CLI harness modules with no subdirectories._
