---
name: architecture
description: Architectural governance framework. Coordinates /domain-type-first, /clean-code, /dox-navigator, and /ponytail as mandatory pillars before designing, restructuring, or implementing systems.
allowed-tools: Read, Glob, Grep
license: MIT
metadata:
  author: Franco Gastón Pellegrini
  organization: FrancoGP Core Architecture
  date: October 2026
---

# Architecture Governance Framework

> "Requirements drive architecture. Simplicity ensures longevity. Contracts prevent decay."

Whenever making architectural decisions, designing subsystems, restructuring modules, or planning new features, you **MUST** coordinate and strictly enforce the following **4 Mandatory Foundation Skills**:

---

## 🏛️ Mandatory Foundation Pillars

Before writing code or finalizing system designs, invoke and satisfy all 4 pillars:

| Pillar | Skill Command | Mandatory Invariant |
| :--- | :--- | :--- |
| **1. Domain Typing** | [`/domain-type-first`](../domain-type-first/SKILL.md) | **Zero loose strings, zero `any`, zero `unknown`**. All finite sets, parameters, states, and IDs must derive from canonical compile-time domain unions. |
| **2. Clean Code** | [`/clean-code`](../clean-code/SKILL.md) | **Single Responsibility & Fallow Limits**. Max cognitive complexity ≤ 20, cyclomatic ≤ 25. Flat logic over deep nesting, early guard clauses. |
| **3. DOX Indexation** | [`/dox-navigator`](../dox-navigator/SKILL.md) | **Single Source of Truth in `AGENTS.md`**. Every new file, directory, and architectural boundary must be indexed in its local DOX hierarchy with relative links. |
| **4. Anti-Overengineering** | [`/ponytail`](../ponytail/SKILL.md) | **Shortest path that actually works (YAGNI & KISS)**. Standard library and native platform APIs before dependencies. One clean function before fifty layers. |

---

## 🧩 Companion Specialized Skills

For specialized architectural needs, delegate to and complement with:

- **[`codebase-design`](../codebase-design/SKILL.md)**: Deep modules, clear interface boundaries (*seams*), and hiding implementation complexity behind simple public APIs.
- **[`domain-modeling`](../domain-modeling/SKILL.md)**: Formal domain modeling, ubiquitous language, and Architecture Decision Records (ADRs).
- **[`database-design`](../database-design/SKILL.md)** & **[`supabase-postgres-best-practices`](../supabase-postgres-best-practices/SKILL.md)**: Relational schema design, RLS performance, multi-host parity, and 100% immutable *forward-only* SQL migrations.

---

## ⚡ Core Invariants

1. **Decoupled Layers**: UI components must never perform direct I/O, raw file manipulation, or invoke database drivers directly. Logic and services orchestrate computations.
2. **Configuration as SSoT**: File paths, budgets, thresholds, and subsystem flags must resolve strictly and dynamically from the central configuration (`.auditor/audit.config.ts`), never hardcoded.
3. **Fail Loud & Fast**: Invariants and boundary validations must throw explicit, actionable errors (`throw new Error(...)`). Never silently swallow errors, auto-heal corrupt states, or provide runtime fallbacks.
4. **Precision Guarantees**: Arithmetic on sensitive values (currency, timestamps, metric counters) must use exact integer scaling, `BigInt`, or explicit rounding modes.
5. **Dynamic Orchestration & Zero Hardcoding**: Runners, coordinators, and dispatchers must never maintain static lists or hardcoded sequences of tasks, suites, or subsystems. Behavior, execution order, and prioritization must be declared dynamically through constructor metadata (`AuditorCapabilities`, such as `fixPriority`), and resolved dynamically via reflection and AST.
6. **Official Locked Skills Isolation (`skills-lock.json`)**: Official vendor skills tracked in `skills-lock.json` (`gsap-*`, `vitest`, `fallow`, `vue-*`, etc.) are immutable third-party assets. They are strictly ignored during file scanning (`isPathIgnored`), their findings are suppressed (`BaseAuditor`), and filesystem writes are blocked (`safeWriteFile`). AI agents and developers must NEVER inspect, refactor, or edit locked skills during repository maintenance tasks; only custom in-house skills (`architecture`, `auditor`, `safe-commit`, etc.) are subject to codebase governance passes. For architecture, patterns, and full specifications, consult the [Official Locked Skills Guide](./references/skills-lock.md).
