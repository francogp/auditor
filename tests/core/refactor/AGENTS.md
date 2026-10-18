# Purpose

Test suites and verification contracts for the deterministic code refactoring engine (`src/core/refactor/`). Verifies hybrid AST transformations across TypeScript, Vue SFCs, and SCSS, including micro-context extraction, worktree sandbox lifecycle, and magic number extraction.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Hermetic Testing**: All tests must run in isolated Vitest environments without mutating host git trees.
- **Negative and Violation Paths**: Every refactoring test suite must verify error conditions and clean pass paths.

- [`classHierarchyHoister.test.ts`](./classHierarchyHoister.test.ts): Unit tests for class hierarchy discovery and method hoisting.
- [`hybridHarness.test.ts`](./hybridHarness.test.ts): Unit tests for unified hybrid harness AST execution.
- [`magicNumberExtractor.test.ts`](./magicNumberExtractor.test.ts): Unit tests for zero-token inference and Super-Dirac batch extraction.
- [`magicNumberHarness.test.ts`](./magicNumberHarness.test.ts): Unit tests for value clustering, contracts, and Super-Dirac data structures.
- [`microContextExtractor.test.ts`](./microContextExtractor.test.ts): Unit tests for Dirac micro-context hash-anchored packet extraction.
- [`motionRefactorEngine.test.ts`](./motionRefactorEngine.test.ts): Unit tests for UI animation governance and timer auto-remediation.
- [`o1RefactorEngine.test.ts`](./o1RefactorEngine.test.ts): Unit tests for O(1) data structures and linear search optimization.
- [`paramPermutationMapper.test.ts`](./paramPermutationMapper.test.ts): Unit tests for parameter permutation and call-site alignment.
- [`realWorldIntegration.test.ts`](./realWorldIntegration.test.ts): Integration tests subjecting all refactoring tools to real-world patterns from host projects.
- [`refactorCli.test.ts`](./refactorCli.test.ts): Unit tests for all refactor CLI runners (dupes, magic, motion, o1).
- [`refactorFileScanner.test.ts`](./refactorFileScanner.test.ts): Unit tests for cross-platform file scanner, script extraction, and plan replacements.
- [`worktreeSandbox.test.ts`](./worktreeSandbox.test.ts): Unit tests for ephemeral Git worktree creation, junction linking, and cleanup.

## Work Guidance

Add comprehensive test coverage for all new refactoring components before moving to production CLI integration.

## Verification

```bash
npm test tests/core/refactor/
```

## Child DOX Index

None. Leaf directory.
