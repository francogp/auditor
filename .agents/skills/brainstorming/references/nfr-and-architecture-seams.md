# Non-Functional Requirements, Trade-off Matrices & Typed Architecture Seams

Deep-dive engineering reference for **Phase 3 (Non-Functional Requirements)**, **Phase 5 (Exploring Design Approaches)**, and **Phase 6 (Incremental Typed Design Presentation)** of the [`brainstorming`](../SKILL.md) skill.

## Table of Contents

- [1. Non-Functional Requirements (NFR) Catalog & Sensible Defaults](#1-non-functional-requirements-nfr-catalog--sensible-defaults)
- [2. Architectural Trade-Off Evaluation Framework](#2-architectural-trade-off-evaluation-framework)
- [3. Typed Call-Stack Architecture Handoff (`domain-type-first`)](#3-typed-call-stack-architecture-handoff-domain-type-first)
- [4. Designing Deep Modules & Hermetic Test Seams](#4-designing-deep-modules--hermetic-test-seams)

---

## 1. Non-Functional Requirements (NFR) Catalog & Sensible Defaults

Features rarely fail in production because the happy-path logic was wrong; they fail because latency, memory, security boundaries, or failure recovery were treated as an afterthought.

During **Phase 3**, evaluate which NFR dimensions apply to the task. If the user has not specified targets, propose the **Sensible Default Baseline** below and record it explicitly under **Assumptions** in the Understanding Lock.

| NFR Dimension | Key Questions to Resolve | Sensible Default Baseline (When Unspecified) |
| :--- | :--- | :--- |
| **1. Performance & Complexity** | What is the target latency? Are hot loops $O(1)$ or $O(n)$? Can I/O or AST parsing be shared in a single pass? | Zero nested $O(n^2)$ lookups; use `Map`/`Set` for membership/indexing; reuse shared file/AST caches; sub-second response for interactive/light operations. |
| **2. Scale & Resource Budgets** | How many items, files, rows, or concurrent users must this handle without memory spikes? | Must scale cleanly to $10\times$ current repository or dataset size without exhausting heap memory or blocking the event loop. |
| **3. Security & Trust Boundaries** | Where does external or untrusted data enter? How are file paths, queries, and payloads validated? | Parse, don't validate at the perimeter ([`/valibot`](../../valibot/SKILL.md) schemas); enforce path containment via `node:path` (`path.resolve` + `path.relative`); zero `eval`, raw SQL string concatenation, or catastrophic backtracking regexes. |
| **4. Reliability & Failure Semantics** | Should errors fail loudly or degrade gracefully? Are mutations atomic and idempotent? | **Fail loud and fast** (`throw new Error(...)`) on broken contracts or invalid configs; zero silent `catch {}` blocks; auto-fixes and migrations must be 100% deterministic and idempotent. |
| **5. Observability & Diagnostics** | When a failure occurs, what context is emitted? Are execution timings tracked per unit? | Every error message must state *what* failed, *where* (file/line or entity ID), and *how to remediate*; empirical timing recorded per rule/operation. |
| **6. Cross-Platform & Environment** | Does this run across Linux, macOS, and Windows? What runtime permissions apply? | 100% POSIX/Windows parity using native Node.js standard library (`node:fs`, `node:path`); compatible with Node.js Permission Model (`--permission`). |
| **7. Maintainability & Ownership** | Where does this live in the DOX hierarchy? Which configuration acts as the Single Source of Truth? | Zero hardcoded paths or magic numbers; all knobs resolved from `.auditor/audit.config.ts` or canonical constants; indexed in local `AGENTS.md` ([`/dox-navigator`](../../dox-navigator/SKILL.md)). |

---

## 2. Architectural Trade-Off Evaluation Framework

When presenting **2–3 Viable Design Approaches** in **Phase 5**, ensure the alternatives are **materially different** in structure, seam placement, or complexity—never strawman options or cosmetic variations of the same design.

Evaluate and contrast your proposed approaches across these **7 Engineering Dimensions**:

1. **Module Depth (Interface vs. Implementation Ratio)**:
   - *Deep Module (Preferred)*: Exposes a small, simple, strongly-typed public surface while encapsulating complex coordination, caching, and edge-case handling internally ([`codebase-design`](../../codebase-design/SKILL.md)).
   - *Shallow Module (Avoid)*: Adds pass-through classes, wrapper functions, or wide interfaces that leak internal mechanics to callers.
2. **Locality of Invariants & Blast Radius**:
   - If a business rule or domain invariant changes next month, do we edit **one file** (high locality) or **seven files across three layers** (shotgun surgery)?
3. **Caller Burden & Cognitive Load**:
   - How much setup, ordering knowledge, or error-checking boilerplate is forced onto every caller of this API?
4. **Boundary Parsing & Type Safety**:
   - Does the approach parse untrusted input into strict domain types once at the boundary, or does it pass loose `string` / `Record<string, unknown>` values deep into core logic?
5. **Failure & Rollback Model**:
   - What happens mid-execution if step 3 of 5 fails? Can partial state corrupt disk or database integrity?
6. **Hermetic Testability**:
   - Can the core logic be tested in < 10 ms using pure inputs or in-memory fixtures without monkey-patching globals or spinning up external processes?
7. **Implementation & Maintenance Cost (YAGNI)**:
   - Does the added flexibility justify every new file, type, and line of code?

### Canonical Trade-Off Comparison Table Template

Use a compact table when presenting options to the user:

```markdown
| Dimension | Approach A: [Name] (Recommended) | Approach B: [Name] (Minimal / Do-Least) | Approach C: [Name] |
| :--- | :--- | :--- | :--- |
| **Core Mechanism** | [1-line summary] | [1-line summary] | [1-line summary] |
| **Module Depth & Seams** | High (single entry contract) | Medium (extends existing module) | Low (multi-layer orchestration) |
| **Blast Radius** | Isolated to `<module>` | Touches 2 existing callers | Cross-cutting (5+ files) |
| **Testability** | Pure in-memory fixture seam | Requires temp dir fixture | Requires process mock |
| **Primary Trade-Off** | Slightly more upfront type modeling | Less extensible for future formats | Over-engineered for current scale |
```

---

## 3. Typed Call-Stack Architecture Handoff (`domain-type-first`)

Prose descriptions of software architecture are inherently ambiguous. Two engineers reading *"the service validates the config and returns a result"* will write completely incompatible code.

During **Phase 6 (Present the Design Incrementally)**, anchor your architectural sections in **TypeScript contract sketches** following [`/domain-type-first`](../../domain-type-first/SKILL.md):

### 3.1. Finite Domain Unions Derived from Canonical Data

Never use naked `string` for finite categories, modes, phases, statuses, or rule IDs:

```typescript
// Canonical SSoT tuple
export const EXECUTION_MODES = ['check', 'fix', 'report'] as const;

// Derived compile-time union
export type ExecutionMode = (typeof EXECUTION_MODES)[number];
```

### 3.2. Branded Nominal Types for Identifiers & Validated Values

Prevent accidental parameter swapping or unvalidated string injection:

```typescript
export type SuiteId = string & { readonly __brand: 'SuiteId' };
export type NormalizedPosixPath = string & { readonly __brand: 'NormalizedPosixPath' };
```

### 3.3. Discriminated Unions for State Machines & Outcomes

Make illegal combinations of fields unrepresentable at compile time (avoid optional boolean flags like `{ loading?: boolean; error?: string; data?: T }`):

```typescript
export type EvaluationOutcome<TPayload> =
  | { readonly status: 'passed'; readonly payload: TPayload; readonly durationMs: number }
  | { readonly status: 'skipped'; readonly reason: string }
  | { readonly status: 'failed'; readonly violations: readonly Violation[]; readonly durationMs: number };
```

### 3.4. Entrypoint-to-Side-Effect Call Stack Sketch

Show the exact data flow from the public entrypoint down to the boundary side effect in 6–10 lines:

```text
[CLI / Public Entrypoint] parseCliArgs(rawArgv) -> ValidatedCliOptions
  └─> [Orchestrator] runWorkflow(options, dependencies)
        ├─> [Boundary Parser] loadAndValidateConfig(configPath) -> ValidatedConfig
        ├─> [Pure Core Engine] analyzeTargets(files, config) -> EvaluationOutcome<Report>
        └─> [Side-Effect Adapter] renderOrPersistReport(outcome) -> ExitCode
```

---

## 4. Designing Deep Modules & Hermetic Test Seams

Every design presented in **Phase 6** must explicitly answer: *"How will we prove this works hermetically?"*

### Rules for High-Leverage Test Seams

1. **Separate Pure Computation from Side Effects (Functional Core, Imperative Shell)**:
   - Keep AST analysis, diff calculation, domain validation, and state transitions in pure functions or deterministic classes that accept data in memory and return typed structures.
   - Push filesystem writes, process spawning, network I/O, and console rendering to thin boundary adapters.
2. **Constructor / Parameter Dependency Injection Over Module Mocking**:
   - Prefer passing a small typed seam interface (or optional workspace root path / in-memory database handle) over `vi.mock(...)` module surgery.
3. **Mandatory 4-Path Test Matrix**:
   - **Clean Path**: Valid input produces zero errors and expected output (`status === 'passed'`).
   - **Violation / Error Path**: Invalid input deterministically triggers the exact rule ID or typed error with accurate line/context metadata.
   - **Warning / Edge Path**: Boundary conditions (empty input, exempt paths, partial configuration) behave predictably.
   - **Idempotency / Fix Path** (when applicable): Auto-repair transforms broken input into clean input that passes a subsequent check with zero findings.
