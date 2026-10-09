---
name: testing-patterns
description: Master testing patterns and principles. YOU MUST apply these unit, integration, and mocking strategies to ensure rock-solid code quality. No excuses for untested behavior.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
license: MIT
metadata:
  author: Franco Gastón Pellegrini
  organization: FrancoGP Core Architecture
  date: October 2026
---

# Testing Patterns

> PROACTIVELY apply these principles to build reliable test suites. DO NOT settle for low coverage or flaky tests.

---

## 1. Testing Pyramid

```text
        /\          E2E (Few)
        /\          E2E (Few)
       /  \         Critical flows
      /----\
     /      \       Integration (Some)
    /--------\      API, DB queries
   /          \
  /------------\    Unit (Many)
                    Functions, classes
```

---

## 2. AAA Pattern

| Step | Purpose |
| :--- | :--- |
| **Arrange** | Set up test data |
| **Act** | Execute code under test |
| **Assert** | Verify outcome |

---

## 3. Test Type Selection

### When to Use Each

| Type | Best For | Speed |
| :--- | :--- | :--- |
| **Unit** | Pure functions, logic | Fast (<50ms) |
| **Integration** | API, DB, services | Medium |
| **E2E** | Critical user flows | Slow |

---

## 4. Unit Test Principles

### Good Unit Tests

| Principle | Meaning |
| :--- | :--- |
| Fast | < 100ms each |
| Isolated | No external deps |
| Repeatable | Same result always |
| Self-checking | No manual verification |
| Timely | Written with code |

### What to Unit Test

| Test | Don't Test |
| :--- | :--- |
| Business logic | Framework code |
| Edge cases | Third-party libs |
| Error handling | Simple getters |

---

## 5. Integration Test Principles

### What to Test

| Area | Focus |
| :--- | :--- |
| API endpoints | Request/response |
| Database | Queries, transactions |
| External services | Contracts |

### Setup/Teardown

| Phase | Action |
| :--- | :--- |
| Before All | Connect resources |
| Before Each | Reset state |
| After Each | Clean up |
| After All | Disconnect |

---

## 6. Mocking Principles

### When to Mock

| Mock | Don't Mock |
| :--- | :--- |
| External APIs | The code under test |
| Database (unit) | Simple dependencies |
| Time/random | Pure functions |
| Temporal (Node 26+) | Force Polyfill in `setup.ts` |
| Network | In-memory stores |

### Mock Isolation (CRITICAL)

- **Avoid Multi-Mocking**: Do not call `vi.mock` for the same module multiple times in the same file; Vitest hoists them and the result is unpredictable.
- **Dynamic State Mocks**: Use a single `vi.mock` that returns a shared mock object. Update the properties of this object within each `it` block to change behavior safely without polluting other tests.

### Mock Types

| Type | Use |
| :--- | :--- |
| Stub | Return fixed values |
| Spy | Track calls |
| Mock | Set expectations |
| Fake | Simplified implementation |

---

## 7. Test Organization

### Naming

| Pattern | Example |
| :--- | :--- |
| Should behavior | "should return error when..." |
| When condition | "when user not found..." |
| Given-when-then | "given X, when Y, then Z" |

### Grouping

| Level | Use |
| :--- | :--- |
| describe | Group related tests |
| it/test | Individual case |
| beforeEach | Common setup |

---

## 8. Test Data

### Strategies

| Approach | Use |
| :--- | :--- |
| Factories | Generate test data |
| Fixtures | Predefined datasets |
| Builders | Fluent object creation |

### Principles

- Use realistic data
- Randomize non-essential values (faker)
- Share common fixtures
- Keep data minimal

---

## 9. Best Practices

| Practice | Why |
| :--- | :--- |
| One assert per test | Clear failure reason |
| Independent tests | No order dependency |
| Fast tests | Run frequently |
| Descriptive names | Self-documenting |
| Clean up | Avoid side effects |
| **JSDOM Safety Checks** | Browser APIs (e.g., `IntersectionObserver`, `localStorage`) may be undefined in tests. Always include safety checks (e.g., `if (typeof API === 'undefined') return`) in composables to prevent test crashes. |
| **Prop-Based UI Testing** | For modern components (e.g., `PVTooltip`), verify **Props/Attributes** instead of searching for nested DOM elements. This avoids breakage when elements are **Teleported** or refactored internally. |
| **Asset Resolution Parity** | When migrating assets from external to local, ALWAYS update the corresponding unit tests (e.g., `assets.spec.ts`) to verify the new local path resolution and `.webp` extension. |
| **Sanitization & Recovery** | For "Self-Healing" systems (e.g., legacy data repair), ALWAYS add unit tests that simulate partially corrupt objects to verify successful recovery and prevent reference errors. |
| **TypeScript Global Declarations** | Const globals defined in config files (like `__APP_VERSION__` in `vite.config.ts`) must be explicitly declared in tests using `declare const VAR: type;` to satisfy the TypeScript compiler during pre-commit checks (`npm run typecheck` / `validate_type_check`). |
| **Static Imports over Dynamic Require** | In ESM-based test graphs (especially with Vitest or Node.js native test runners containing top-level await), dynamic `require()` statements inside loop blocks or helper files will trigger compiler/execution crashes. Use static `import` at the top of the test file instead. |
| **Decoupling Integrity Tests** | Verification tests validating static data integrity (e.g., map configurations) should check against explicit/static registries rather than relying on runtime combat-mechanic helpers (which are subject to dynamic rule changes) to avoid flaky assertions. |

---

## 10. Anti-Patterns

| ❌ Don't | ✅ Do |
| :--- | :--- |
| Test implementation | Test behavior |
| Duplicate test code | Use factories |
| Complex test setup | Simplify or split |
| Ignore flaky tests | Fix root cause |
| Skip cleanup | Reset state |

---

> **Remember:** Tests are documentation. If someone can't understand what the code does from the tests, rewrite them.

---

## 11. Mocking Boundaries & Anti-Tautological Governance

In accordance with the **Absolute Prohibition on Tautological Mocking & Falsified Integration Tests Mandate**:

- **Core Subsystems Are NEVER Mocked in Integration Suites**: In integration tests (`tests/integration/`) and end-to-end regression verifications, agents **MUST NEVER** mock out the core execution pipeline under test (e.g. calculation engines, database routers, parsers, core state machines) with dummy mocks (`vi.mock(...)`). Multi-module contracts MUST execute against the real engine or real sandbox instances.
- **Isolated Unit Test Mocking (Side-Effects & UI Only)**: When writing isolated unit tests for individual action dispatchers, only external UI side-effects, notification stores, or external third-party network APIs may be spied or stubbed to verify pure branch routing. Do NOT mock business math or core engine state to falsify passing assertions.

---

## 12. Architecture & Anti-Fragmentation Governance

### 12.1 Domain-Cohesive Test Suites (300 to 800 lines)

- **Consolidation over Micro-Files**: Group related domain behaviors, fixtures, and regression cases into cohesive test suites (e.g. `domain_actions_suite.spec.ts`, `stores_domain_suite.spec.ts`, `services_domain_suite.spec.ts`) instead of scattering assertions across hundreds of micro-files (< 60 lines).
- **Execution Overhead Elimination**: Spawning hundreds of isolated Vitest test files wastes seconds of thread setup, JSDOM instantiation, and module re-parsing. Domain-cohesive suites reduce total suite runtimes dramatically while preserving 100% of test coverage and assertions.

### 12.2 Anti-Fragmentation Mandate (`validate_test_fragmentation.ts`)

- **60-Line Minimum Floor**: Every test file in `tests/` must have at least 60 lines.
- **Whitelist Exemption**: Only dedicated standalone process wrappers (e.g. worker thread serialization, Docker Postgres container reuse benchmarks) or pure Vue SFC view mounting specs are exempt via `TEST_FRAGMENTATION_WHITELIST`.
- **Inline Escape Hatch**: Justified standalone fixtures may use `// test-fragmentation-ok: <justification>`.

### 12.3 Environment Strict Separation (Node vs JSDOM)

| Directory | Target Environment | Scope & Mandate |
| :--- | :--- | :--- |
| `tests/node/` | Native Node.js | Pure domain calculations, database schemas/migrations, CLI scripts, auditors. Never use JSDOM here. |
| `tests/unit/` | JSDOM (inline) | Vue SFC components, modals, Pinia stores with DOM interactions. Use `// @vitest-environment jsdom` or inline environment comment. Pure helpers should run in node. |

### 12.4 Global State Clean Sandbox

- When tests mutate `globalThis.window`, timers, or browser globals in Node or JSDOM, tests **MUST ALWAYS** restore the original state in `afterEach` to prevent silent corruption or race conditions in sibling tests sharing the worker thread.

---

## 13. Static Analysis & Sub-Auditor Testing Mandate (Zero Untested Rules & Warnings)

Every sub-auditor (`BaseAuditor`, `FileScanAuditor`, or host extension plugin) is an automated gatekeeper. An untested or partially tested auditor is a critical blindspot that causes silent failures in production.

### 13.1 Universal Coverage Mandate for All Rules & Warnings

- **100% RuleId Coverage**: Every declared rule ID in `ruleIds`, and every warning or error reported by the suite (including Fallow categories, AST rules, regex tokens, CSS checks, SQL checks, markdown checks) **MUST have a dedicated test case**.
- **Explicit Severity Assertion**: The test MUST explicitly assert that the finding has the expected severity (`expect(finding.severity).toBe('error')` or `expect(finding.severity).toBe('warning')`).
- **Context & Location Assertion**: The test MUST verify that line numbers, relative file paths, and context snippets are accurately captured.

### 13.2 Hermetic Sandbox Testing Pattern

- Sub-auditors should accept a sandbox directory (`tempDir` / `projectRoot`) so test fixtures never mutate or depend on the host repository files.
- Setup a temporary directory with `fs.mkdtemp(path.join(os.tmpdir(), 'auditor-test-'))` in `beforeEach`, and clean it up with `fs.rm(tempDir, { recursive: true, force: true })` in `afterEach`.
- Set `process.env.AUDIT_SUBPROCESS = 'true'` in tests to suppress unwanted terminal stdout prints during test runs.

### 13.3 Triple Assertion Pattern for Every Auditor

Every sub-auditor test suite must follow the triple assertion pattern:

1. **Positive Trigger**: For each rule/warning, write invalid code in the sandbox, run the auditor, and assert that the exact `ruleId` is present in `result.findings` with the expected `severity`.
2. **Negative Pass**: Write valid/compliant code in the sandbox, run the auditor, and assert that `result.summary.errors === 0`, `result.summary.warnings === 0`, and `result.status === 'passed'`.
3. **Escape Hatch Verification**: Write the violating code accompanied by an escape hatch (e.g. `// <rule>-ok:`, `// domain-ok:`, `// script-ok:`), run the auditor, and assert that zero violations are produced for that line.

---

## 14. Test Execution Code Coverage & Ratcheting (`validate_test_coverage`)

All repositories governed by `@francogp/auditor` enforce test execution coverage through standard Istanbul/C8 coverage artifacts (`coverage/coverage-final.json`).

### 14.1 Metric Thresholds & Single Source of Truth

- Thresholds are defined in `.auditor/audit.config.ts` under `config.testCoverage.thresholds`:
  - **Statements**: Minimum percentage of executable statements reached.
  - **Branches**: Minimum percentage of conditional branches tested.
  - **Functions**: Minimum percentage of functions invoked.
  - **Lines**: Minimum percentage of source lines executed.
- When full 100% coverage is mathematically constrained by environment branches or third-party wrappers, the threshold must be configured to the achievable ceiling (e.g., 80%) rather than artificially lowered.

### 14.2 Zero-Tolerance for Shadow Modules (`uncoveredFiles`)

- Files present in the source tree but completely absent from the test coverage report (0% coverage) are flagged as `test-coverage-uncovered-file`.
- Every source module must have companion unit or integration tests, eliminating un-tested shadow modules.

### 14.3 Reporting & Inspection Tools

- Run coverage verification suite: `npm run auditor` or `preset=audit`.
- Inspect detailed table reports: `npm run auditor:coverage` or `auditor-coverage`.

---

## 🌐 Dynamic Language Governance (Zero Hardcoding)

- The agent MUST dynamically consult `.auditor/audit.config.ts` to determine the configured languages:
  - **AI Chat & Conversational Language (`config.documentation.chatLanguage`)**: Governs all interactive chat communication, user interviews, options matrices, `ask_question` dialogs. The agent converses strictly in the language resolved from `config.documentation.chatLanguage`.
  - **Documentation & File Writing Language (`config.documentation.language`)**: Governs code, code comments, commit messages, git tags, documentation files, markdown files, brain artifacts (`walkthrough.md`, `task.md`, `plan_safe_commit.md`), and DOX indices (`AGENTS.md`). The agent writes files strictly in the language resolved from `config.documentation.language`.
- **Zero Language Mixing & Zero Hardcoding**: Skills and agents MUST NEVER hardcode language names or assume fixed languages. The AI agent must dynamically resolve these settings from configuration and never confuse or conflate the chat communication language with the repository file writing language.
