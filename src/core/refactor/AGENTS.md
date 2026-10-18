# Purpose

Automated code refactoring engine for `@francogp/auditor`. Provides Dirac micro-context extraction for duplicates/triplicates, Value-Clustering Super-Dirac compression and AST span hoisting for magic numbers and design tokens, ephemeral Git worktree sandbox isolation, and the unified Hybrid Harness (`@ast-grep/napi` + `ts-morph` + `magic-string` + `@vue/compiler-sfc`) for safe AST refactoring across TypeScript and Vue files.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Dirac Micro-Context Pattern**: Do not load entire source files into LLM contexts during duplicate remediation. Extract only the clone occurrences with ±5 lines of local context, computing SHA256 integrity anchors and dataflow variables.
- **Value-Clustering Super-Dirac Pattern**: Group identical magic literals and design tokens across files into value clusters (`GroupedOccurrences`). Never send repetitive file listings or full source files to the LLM. Compress prompts using compact markdown tables with zero-token inferred names (`inferredName`).
- **ConstantHygieneGate Enforcement**: All refactored constant declarations MUST pass `ConstantHygieneGate.sanitizeName()`, stripping forbidden numeric suffixes (`_100`), ensuring uppercase SNAKE_CASE, and preventing downstream `validate_constant_hygiene` regressions.
- **Git Worktree Sandbox Isolation**: All destructive AST and code transformations during remediation must execute inside an ephemeral Git worktree (`--worktree`) with directory junctions to `node_modules`. Working tree files are only modified if compilation and tests pass 100% in the sandbox.
- **Hybrid Harness Coordination**: Dispatch transformations by file extension: `ts-morph` for `.ts`/`.tsx` relative imports and type safety, `magic-string` + `vueSfcParser` for `.vue` SFCs, and `@ast-grep/napi` for structural code rewrites.
- **Strict Node.js Native Path & File Scanning Mandate**: All file discovery, script block extraction, and path comparisons across refactoring engines MUST use the canonical repository file collector (`collectRepositoryFiles`) and cross-platform native path normalization and comparison (`isSameFilePath`) via `node:path` and `node:fs`. Ad-hoc recursive file walkers (`walk()`, `readdirSync`) and manual regex-based path separators (`replace(/\\/g, '/')`) are strictly prohibited to prevent cross-platform failures and satisfy `auditor-manual-file-walker` and `validate_native_paths`.
- **Canonical Package Script Injection via Auditor Fix**: All refactoring CLI tools (`auditor:dupes`, `auditor:magic`, `auditor:motion`, `auditor:o1`) MUST be registered in `CORE_PACKAGE_SCRIPT_REQUIREMENTS` (`packageScriptRegistry.ts`) so that `auditor fix` automatically injects their canonical scripts into consuming host projects' `package.json`.
- **Complex Real-World Fixture Test Coverage Mandate**: Refactoring engines (`auditor-dupes`, `auditor-magic`, `auditor-motion`, `auditor-o1`) MUST maintain integration tests with realistic, complex multi-line fixture patterns extracted from real-world host repositories (e.g., state machines, animation hooks, dictionary lookups) to guarantee AST transformation robustness against non-trivial production code.

## Key Files

- [`classHierarchyHoister.ts`](./classHierarchyHoister.ts): Discovers common base classes and hoists shared methods to base class hierarchies.
- [`hybridHarness.ts`](./hybridHarness.ts): Unified refactoring harness dispatching AST mutations to ts-morph, ast-grep, and Vue SFC parsers.
- [`magicContracts.ts`](./magicContracts.ts): Type definitions, contracts, and Value-Clustering Super-Dirac compression models for magic numbers and design token refactoring.
- [`magicNumberExtractor.ts`](./magicNumberExtractor.ts): AST extractor with zero-token contextual semantic inference, SSoT constants discovery, and Super-Dirac batch table generation.
- [`magicNumberHarness.ts`](./magicNumberHarness.ts): Polyglot refactoring harness for magic numbers and design tokens featuring ConstantHygieneGate and atomic span hoisting across TS and Vue SFC files.
- [`microContextExtractor.ts`](./microContextExtractor.ts): Extracts hash-anchored micro-context packets and dataflow metrics for clone groups.
- [`motionRefactorEngine.ts`](./motionRefactorEngine.ts): UI animation governance engine auto-remediating timers, GPU transforms, and legacy GSAP eases.
- [`o1RefactorEngine.ts`](./o1RefactorEngine.ts): O(1) data structure optimizer auto-remediating linear membership lookups, structuredClone migrations, and ReadonlySet hoists.
- [`paramPermutationMapper.ts`](./paramPermutationMapper.ts): Aligns and permutes arguments between clone instances and canonical function signatures.
- [`refactorCliHarness.ts`](./refactorCliHarness.ts): Generic CLI execution harness providing unified argument parsing, Dirac micro-context rendering, Box-Drawing tables, and worktree verification.
- [`refactorContracts.ts`](./refactorContracts.ts): TypeScript type definitions and contracts for clone groups, micro-context packets, and refactor plans.
- [`refactorFileScanner.ts`](./refactorFileScanner.ts): Shared filesystem scanner, script block extractor, and exact text replacement utilities for refactoring engines.
- [`worktreeSandbox.ts`](./worktreeSandbox.ts): Ephemeral Git worktree lifecycle manager with zero-copy node_modules junction support.

## Work Guidance

- Always ensure tests in `tests/core/refactor/` pass before modifying transformation logic.
- Avoid external binary invocations other than `git` inside `worktreeSandbox.ts`.

## Verification

- Run refactor unit tests: `npm test -- tests/core/refactor/`
- Run typecheck: `npm run typecheck`

## Child DOX Index

- _This directory contains pure refactoring engines with no subdirectories._
