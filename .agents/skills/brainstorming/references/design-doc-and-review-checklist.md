# Decision Logs, Spec Self-Review Gate & Design Document Templates

Comprehensive reference for **Phase 7 (Decision Log & Spec Self-Review)** and **Phase 8 (Implementation Handoff)** of the [`brainstorming`](../SKILL.md) skill.

## Table of Contents

- [1. Running Decision Log (ADR Format)](#1-running-decision-log-adr-format)
- [2. Spec Self-Review Gate (Anti-Placeholder & Ambiguity Audit)](#2-spec-self-review-gate-anti-placeholder--ambiguity-audit)
- [3. Canonical Design Specification Template](#3-canonical-design-specification-template)
- [4. Pre-Handoff Architectural Governance Checklist](#4-pre-handoff-architectural-governance-checklist)

---

## 1. Running Decision Log (ADR Format)

Throughout a brainstorming session, critical architectural choices are made—sometimes in response to a clarifying question, sometimes when selecting between Approach A and Approach B. If these decisions are not recorded with their rationale, future sessions or reviewers will re-litigate them or accidentally revert them.

Maintain a structured **Decision Log** using the lightweight Architecture Decision Record (ADR) table below:

```markdown
| ID | Decision Topic | Chosen Option | Alternatives Rejected | Rationale & Governing Constraint |
| :--- | :--- | :--- | :--- | :--- |
| **D-01** | [Topic, e.g., State Storage] | [Chosen path] | [Rejected option 1, Rejected option 2] | [Why this won: e.g., guarantees O(1) lookup and zero external dependencies] |
| **D-02** | [Topic, e.g., Failure Policy] | [Chosen path] | [Rejected option] | [Why this won: e.g., complies with Fail Loud & Fast mandate] |
```

### What Belongs in the Decision Log

- Selection of the primary architectural approach over its competitors.
- Any trade-off where performance, strictness, or simplicity was prioritized over another quality.
- Explicit user overrides or confirmations of key assumptions.
- Scope boundaries (why a borderline feature was moved to **Non-Goals**).

---

## 2. Spec Self-Review Gate (Anti-Placeholder & Ambiguity Audit)

Before presenting the final specification or transitioning to `implementation_plan.md` and `task.md`, inspect your entire design with fresh eyes through this **4-Point Self-Review Protocol**:

### 2.1. Zero-Placeholder Scan

Scan the entire specification and plan for forbidden deferral markers:

- `TODO`, `TBD`, `FIXME`, `???`, `[fill in later]`, `etc.`, `and so on`.
- Vague hand-waves such as *"handle errors appropriately"*, *"optimize as needed"*, or *"validate input"*.
- **Remediation**: Replace every vague phrase with the concrete mechanism (e.g., *"throw a descriptive `Error` with the invalid key name"* or *"validate payload against `ConfigSchema` using Valibot"*).

### 2.2. Internal Consistency Check

Verify that all parts of the design agree with one another:

- Do the TypeScript contract signatures match the components described in the architecture diagram?
- Does the data flow cover every state variant declared in the discriminated union?
- Do the proposed file paths respect the existing repository folder structure and naming conventions?

### 2.3. Two-Engineer Ambiguity Test

Ask yourself: *"If two senior engineers read this specification independently without talking to each other, would they produce compatible module boundaries, function signatures, and test cases?"*

- If any requirement could be interpreted in two materially different ways, pick the cleanest interpretation and make it explicit in the contract.

### 2.4. Scope & Decomposition Check

- Is the design small and cohesive enough to be implemented and verified safely in incremental steps?
- If the design touches more than 3 independent subsystems simultaneously, decompose the implementation handoff into sequential, independently verifiable phases.

---

## 3. Canonical Design Specification Template

When documenting the finalized design (either inline, in a persistent design document when requested by the user, or inside the `implementation_plan.md` artifact), follow this structured blueprint:

```markdown
# [Feature / Architecture Title]

## 1. Executive Summary & Purpose
- **Problem Statement**: [1-2 sentences describing the concrete pain or gap]
- **Proposed Solution**: [1-2 sentences summarizing the chosen architectural approach]
- **Delta Summary**: [What exists today vs. what changes after this design]

## 2. Goals, Non-Goals & Anti-Goals
- **Goals (Must Achieve)**:
  - [Measurable functional outcome 1]
  - [Measurable functional outcome 2]
- **Non-Goals (Explicitly Out of Scope)**:
  - [Excluded scope item 1]
- **Anti-Goals (Unacceptable Failure Modes)**:
  - [Invariant that must never be violated even if functional tests pass]

## 3. Non-Functional Requirements (NFRs) & Assumptions
- **Performance & Complexity**: [e.g., O(1) lookup via Map, single-pass AST scan]
- **Scale & Budgets**: [Expected volume and memory bounds]
- **Security & Validation**: [Boundary schema parsing, path containment]
- **Reliability & Idempotency**: [Fail-loud behavior, deterministic re-runs]
- **Confirmed Assumptions**: [List of validated assumptions]

## 4. Evaluated Alternatives & Trade-Off Matrix
| Dimension | Approach A (Selected) | Approach B | Approach C |
| :--- | :--- | :--- | :--- |
| **Summary** | ... | ... | ... |
| **Pros** | ... | ... | ... |
| **Cons / Risks** | ... | ... | ... |

## 5. Architecture & Typed Contracts (`domain-type-first`)
### 5.1. Component & Data Flow Diagram
[Mermaid flowchart or sequenceDiagram with quoted node labels]

### 5.2. Domain Types, State Machines & Interfaces
[TypeScript pseudocode showing branded types, discriminated unions, and public signatures]

### 5.3. Error Handling & Boundary Edge Cases
[How malformed inputs, missing files, or runtime failures are handled]

## 6. Decision Log (ADR)
| ID | Decision Topic | Chosen Option | Alternatives Rejected | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **D-01** | ... | ... | ... | ... |

## 7. Hermetic Verification & Test Seam Strategy
- **Unit & Conformance Tests**: [Clean path, error path, edge cases, idempotency]
- **Quality & Architecture Gates**: [Canonical audit and check scripts to execute]
```

---

## 4. Pre-Handoff Architectural Governance Checklist

Every `implementation_plan.md` and `task.md` generated during **Phase 8 (Implementation Handoff)** must explicitly enforce compliance with the repository's foundational governance skills:

1. **[`/architecture`](../../architecture/SKILL.md) (Master Governance)**:
   - Configuration is the Single Source of Truth (`.auditor/audit.config.ts`). Zero hardcoded paths or fallback candidate lists.
   - Fail loud and fast (`throw new Error(...)`). Zero backward-compatible shims or silent fallbacks.
   - Use native Node.js standard library modules (`node:fs`, `node:path`, `node:url`, `node:crypto`).
2. **[`/domain-type-first`](../../domain-type-first/SKILL.md) (Strict Compile-Time Typing)**:
   - Zero loose `string`, `any`, or `unknown` types in domain logic.
   - Finite sets derived from `as const` tuples; nominal identifiers protected with branded types.
3. **[`/clean-code`](../../clean-code/SKILL.md) & [`/ponytail`](../../ponytail/SKILL.md) (Simplicity & Complexity Budgets)**:
   - Single responsibility, flat control flow with guard clauses, cognitive complexity $\le 20$, cyclomatic complexity $\le 25$.
   - YAGNI enforced: zero speculative wrappers or dead abstractions.
4. **[`/dox-navigator`](../../dox-navigator/SKILL.md) (DOX Hierarchy Synchronization)**:
   - Every new or modified source file and directory must be accurately indexed in its governing `AGENTS.md` under `## Key Files` or `## Child DOX Index`.
   - Respect language separation dynamically configured in `.auditor/audit.config.ts` (`config.documentation.chatLanguage` for user dialogue vs. `config.documentation.language` for files, comments, and documentation).
5. **[`/auditor`](../../auditor/SKILL.md) (Official Verification Tools)**:
   - Verification steps must use canonical repository scripts (`npm run check`, `npm test`, `npm run auditor:findings`) rather than ad-hoc one-liner scripts.
