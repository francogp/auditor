# Critical Thinking Lenses & Socratic Questioning Playbook

Comprehensive reference for **Phase 2 (Interactive Discovery & Critical Thinking)** and **Phase 5 (Exploring Design Approaches)** of the [`brainstorming`](../SKILL.md) skill.

## Table of Contents

- [1. Overview: Why Structured Lenses Beat Passive Agreement](#1-overview-why-structured-lenses-beat-passive-agreement)
- [2. Lens 1: First Principles Decomposition](#2-lens-1-first-principles-decomposition)
- [3. Lens 2: Contrarian & Pre-Mortem Analysis](#3-lens-2-contrarian--pre-mortem-analysis)
- [4. Lens 3: Anti-Goals & Failure Conditions](#4-lens-3-anti-goals--failure-conditions)
- [5. Lens 4: Prior Art & Local Precedent](#5-lens-4-prior-art--local-precedent)
- [6. Lens 5: Multi-Disciplinary Expert Panel](#6-lens-5-multi-disciplinary-expert-panel)
- [7. Lens 6: Radical Simplification & YAGNI](#7-lens-6-radical-simplification--yagni)
- [8. Lens 7: Real-World Stress Testing & Edge Cases](#8-lens-7-real-world-stress-testing--edge-cases)
- [9. Socratic Dialogue & `ask_question` Playbook](#9-socratic-dialogue--ask_question-playbook)

---

## 1. Overview: Why Structured Lenses Beat Passive Agreement

Large language models naturally gravitate toward sycophancy—validating the user's initial framing and immediately elaborating on their first proposed solution. In software architecture, this causes two expensive failures:

1. **XY Problem Amplification**: The user asks for *Solution Y* when their actual underlying pain is *Problem X*, which could be solved with 10x less complexity.
2. **Premature Convergence**: Accepting the first plausible design without stress-testing hidden assumptions, operational failure modes, or simpler alternatives.

Before locking understanding or proposing architecture, run the problem through the **7 Critical Thinking Lenses** below. You do not need to recite all seven lenses out loud to the user; apply them internally during analysis and surface only the sharpest, highest-leverage insights and questions.

---

## 2. Lens 1: First Principles Decomposition

Strip away inherited habits, buzzwords, and "how we usually build this" templates to expose the fundamental physics of the problem.

### Internal Analytical Prompts

- What is the irreducible core state change or data transformation required?
- Which parts of the user's request are **hard domain truths** (invariants), and which parts are **incidental implementation guesses**?
- If we could not use any new external library, database table, or abstraction layer, how would this work using only existing primitives?

### Signals That First Principles Are Needed

- The request starts with an implementation mechanism rather than a user outcome (e.g., *"We need a message queue for..."* or *"Let's add a caching layer to..."*).
- The proposed architecture introduces three or more new abstractions for a single workflow.

### High-Leverage Question Patterns

- *"To make sure we solve the root problem: what concrete pain or bottleneck occurs today when `<scenario>` happens?"*
- *"Is `<proposed-mechanism>` a strict external requirement, or are we open to simpler mechanisms if they guarantee `<core-outcome>`?"*

---

## 3. Lens 2: Contrarian & Pre-Mortem Analysis

Act as a constructive devil's advocate. Assume it is six months after deployment and this feature or refactor caused a production incident or became a maintenance nightmare. Work backward to identify why.

### Internal Analytical Prompts

- **The "Do Nothing" Counterfactual**: What happens if we do not build this at all, or solve it purely through configuration/documentation?
- **The Pre-Mortem**: If this design fails catastrophically in production, what is the most likely culprit? (State desynchronization, unbounded memory growth, race conditions, leaky abstractions, or developer confusion?)
- **Hidden Coupling**: Which existing modules will silently break or become harder to test if we introduce this change?

### High-Leverage Question Patterns

- *"If this design causes a headache six months from now, is it more likely to be from `<risk-A>` or `<risk-B>`?"*
- *"What is the strongest argument against building this right now, and how should our design mitigate that concern?"*

---

## 4. Lens 3: Anti-Goals & Failure Conditions

Standard requirements capture *Goals* (what the system should do) and *Non-Goals* (what is out of scope for v1). **Anti-Goals** capture *what must never happen*—outcomes that would make the project a failure even if every functional feature works as specified.

### Examples of High-Value Anti-Goals

| Domain | Goal | Non-Goal (Out of Scope) | Anti-Goal (Unacceptable Outcome) |
| :--- | :--- | :--- | :--- |
| **Static Analysis CLI** | Add semantic duplicate detection | Cross-repository clone search | Increasing cold-start CLI latency on light checks by more than 50 ms |
| **State Management** | Sync user preferences across tabs | Offline conflict resolution UI | Introducing silent state overwrites when two tabs save concurrently |
| **Data Pipeline** | Parse incoming webhook payloads | Historical backfill tool | Dropping or silently coercing malformed fields without raising a typed error |
| **UI Animation** | Add transition to modal dialog | Custom 3D shaders | Triggering layout thrashing or breaking deterministic time-scaling in automated tests |

### High-Leverage Question Patterns

- *"Even if this feature passes all functional tests, what side effect or trade-off would make you consider the implementation unacceptable?"*
- *"Which invariant must never be compromised here: execution speed, zero external dependencies, or strict backward incompatibility?"*

---

## 5. Lens 4: Prior Art & Local Precedent

Never invent a novel pattern when the repository or ecosystem already has an established convention.

### Internal Recon Checklist

1. **Local Codebase Precedent**: Does this repository already solve an analogous problem in another module? (Check base classes, existing sub-auditors, error classes, configuration schemas, and test helpers.)
2. **Ecosystem Prior Art**: How do mature tools in this domain handle this problem? What did users love or hate about those approaches?
3. **Consistency vs. Innovation**: If proposing a pattern that diverges from existing repository conventions, is the benefit worth the cognitive tax of maintaining two paradigms?

### High-Leverage Question Patterns

- *"We currently handle a similar workflow in `<existing-module>` using `<pattern>`. Should this new capability follow that exact contract, or is there a limitation in `<existing-module>` you want to move away from?"*
- *"Are there existing tools or reference implementations whose behavior you want to emulate—or explicitly avoid?"*

---

## 6. Lens 5: Multi-Disciplinary Expert Panel

Evaluate the emerging concept from four specialized engineering viewpoints before presenting options:

### 🛡️ Security & Hardening Viewpoint

- Where does untrusted input cross a trust boundary?
- How is input parsed and validated at the perimeter (e.g., strict schemas via [`/valibot`](../../valibot/SKILL.md), path containment via native `node:path`)?
- Could this introduce ReDoS, injection, path traversal (CWE-22), or secret exposure in logs?

### ⚡ Performance & Algorithmic Viewpoint

- What is the time and space complexity as input size $N$ scales by $10\times$ or $100\times$?
- Are we using $O(1)$ lookups (`Map` / `Set`) instead of nested $O(n^2)$ array scans inside hot loops?
- Can file I/O or AST parsing be shared via single-pass caching rather than re-reading disk per rule?

### 🧩 Domain Typing & DX Viewpoint

- Can invalid states be made unrepresentable at compile time using discriminated unions and branded types ([`/domain-type-first`](../../domain-type-first/SKILL.md))?
- Is the module deep (simple public interface hiding rich internal logic) rather than shallow (pass-through boilerplate)?

### 🧪 Testability & Operations Viewpoint

- Where are the test seams? Can we verify clean paths, error paths, and edge cases hermetically in memory without fragile mocks?
- When this fails in production or CI, will the error message immediately tell the developer *what* broke, *where*, and *how to fix it*?

---

## 7. Lens 6: Radical Simplification & YAGNI

Before finalizing your 2–3 design approaches in Phase 5, ruthlessly apply **YAGNI** (*You Ain't Gonna Need It*) and [`/ponytail`](../../ponytail/SKILL.md) principles:

1. **The 80/20 Cut**: Identify the 20% of the design that delivers 80% of the concrete value. What happens if we delete the remaining 80%?
2. **Speculative Extension Ban**: Remove plugin hooks, generic strategy interfaces with only one implementation, and configuration toggles nobody asked for.
3. **Always Include a "Do-Least / Minimal Viable Architecture" Option**: Among your 2–3 proposed approaches in Phase 5, Option 1 or Option 2 should represent the leanest architectural path that satisfies all strict invariants without introducing new subsystems.

---

## 8. Lens 7: Real-World Stress Testing & Edge Cases

Happy-path designs crumble on contact with production data. Stress-test the concept against the **7 Classic Boundary Conditions**:

1. **Empty / Zero State**: Empty files, zero matches, uninitialized config, missing optional directories.
2. **Single vs. Massive Cardinality**: 1 item vs. 50,000 items (memory pressure, terminal output truncation, batching).
3. **Malformed / Hostile Input**: Invalid UTF-8, syntax errors in parsed files, missing required fields, unexpected symlinks.
4. **Concurrency & Race Conditions**: Parallel test workers, simultaneous file writes, shared cache invalidation.
5. **Cross-Platform Divergences**: POSIX (`/`) vs. Windows (`\`) path separators, case sensitivity, line endings (`LF` vs. `CRLF`), binary shims (`.cmd`).
6. **Partial Failure & Interruptions**: Mid-flight process abort, third-party binary timeout, read-only filesystem permissions.
7. **Idempotency**: If the operation or auto-fix runs twice in a row on the same target, does the second run produce zero diffs?

---

## 9. Socratic Dialogue & `ask_question` Playbook

### Golden Rules of Questioning

1. **One Question Per Turn**: Asking three questions at once splits the user's attention and yields shallow, incomplete answers. Ask the single highest-impact question first.
2. **Never Ask What the Codebase Already Answers**: If `git log`, `package.json`, `.auditor/audit.config.ts`, or source files answer the question, read the files yourself. Reserve user questions for **intent, trade-offs, business priorities, and unspoken constraints**.
3. **Use `ask_question` for Bounded Choices**:
   - Whenever a question has 2–5 distinct, well-defined options (e.g., choosing a persistence strategy, failure policy, scope boundary, or architectural approach), **always invoke the `ask_question` tool**.
   - Put your recommended option first and prefix it with `(Recommended)`.
   - Never add a manual `"Other"` option—the `ask_question` UI provides a built-in write-in field automatically.
   - Phrase each option from the user's perspective as a clear decision, briefly noting its primary trade-off.
4. **Use Plain Text Only for Unbounded Exploration**:
   - When you need the user to describe a workflow, pain point, or domain narrative in their own words, ask a single concise open question at the end of your message without a list of multiple-choice options attached.
5. **Offer Concrete Hypotheses When the User Is Unsure**:
   - If the user says *"I don't know"* or *"What do you think?"*, do not bounce the question back. Propose a concrete default grounded in codebase conventions, explain *why* in two sentences, and ask them to confirm or adjust it.
