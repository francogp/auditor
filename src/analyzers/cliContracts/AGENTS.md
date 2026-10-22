# Purpose

TypeScript Compiler AST analyzer and rule registry enforcing declarative `citty` CLI contracts (`validate_cli_contracts`) and prohibiting homebrew command-line argument parsing across the repository.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **100% AST-Driven Analysis**: All CLI contract detectors inspect TypeScript AST nodes (`ts.SourceFile`) without regular expressions on code syntax.
- **Zero Spanish Output**: All rule descriptions, violation messages, and diagnostic strings are strictly authored in English (`en`).
- **Zero-Escape Mandate**: All CLI tools, sub-auditors, and reporting scripts must declare canonical `citty` commands without bypass directives or escape hatches.

## Key Files

- [`cliContractHeuristics.ts`](./cliContractHeuristics.ts): Pure AST predicates and Citty builder sets.
- [`cliContractScanner.ts`](./cliContractScanner.ts): Single-pass AST visitor coordinating all CLI contract detectors.
- [`cliContractTypes.ts`](./cliContractTypes.ts): Domain types, rule ID tuple (`CLI_CONTRACT_RULES`), and detector interfaces.
- [`detectors/`](./detectors/AGENTS.md): Specialized per-rule AST detector modules.

## Work Guidance

- Keep each detector focused on a single `CliContractRuleId`.
- Never use regexes to inspect source code; traverse `doc.getAst()` via `ts.forEachChild`.

## Verification

- Run CLI contract suite and 62-case catalog tests: `npm test -- tests/validate_cli_contracts.test.ts`

## Child DOX Index

- [`detectors/`](./detectors/AGENTS.md): Specialized per-rule AST detectors for CLI contract verification.
