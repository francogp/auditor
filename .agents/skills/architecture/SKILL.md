---
name: architecture
description: Architectural decision-making framework. Requirements analysis, trade-off evaluation, ADR documentation. Use when making architecture decisions or analyzing system design.
allowed-tools: Read, Glob, Grep
---

# Architecture Decision Framework

> "Requirements drive architecture. Trade-offs inform decisions. ADRs capture rationale."

---

## 🎯 Selective Reading Rule

**Read ONLY files relevant to the request!** Check the content map, find what you need.

| File | Description | When to Read |
| :--- | :--- | :--- |
| `references/context-discovery.md` | Questions to ask, project classification | Starting architecture design |
| `references/trade-off-analysis.md` | ADR templates, trade-off framework | Documenting decisions |
| `references/pattern-selection.md` | Decision trees, anti-patterns | Choosing patterns |
| `references/examples.md` | MVP, SaaS, Enterprise examples | Reference implementations |
| `references/patterns-reference.md` | Quick lookup for patterns | Pattern comparison |

---

## 🔗 Related Skills

| Skill | Use For |
| :--- | :--- |
| [database-design](../database-design/SKILL.md) | Database schema design |
| [domain-type-first](../domain-type-first/SKILL.md) | Strict domain typing & data contracts |

---

## 3. Core Principle: Simplicity

> "Simplicity is the ultimate sophistication."

- Start simple
- Add complexity ONLY when proven necessary
- You can always add patterns later
- Removing complexity is MUCH harder than adding it

---

## 4. Single Source of Truth & Clean Boundaries

Every durable concept must have exactly ONE owner in the codebase:
- **SSoT**: Configuration in configuration files, domain models in types/contracts, documentation in nearest `AGENTS.md`.
- **Decoupled Layers**: UI components must never contain raw I/O or direct database drivers. Service/logic layers orchestrate computations.
- **Fail Loud & Fast**: Invariants and input boundaries must validate strictly. Never silently swallow errors or auto-heal corrupt data.

---

## 5. Numerical Precision & Domain Contracts

When building calculation engines or domain models:
- **Domain-Type-First**: All parameters, intermediate states, and catalog IDs MUST be strongly typed with canonical domain unions.
- **Precision Guarantees**: Arithmetic operations on sensitive values (currency, physical units, metrics) must use exact integer scaling, BigInt, or explicit rounding modes.
- **Tabular Numerics**: Tabular or financial data in UI should leverage `font-variant-numeric: tabular-nums`.

---

## Validation Checklist

Before finalizing architecture:

- [ ] Requirements clearly understood
- [ ] Constraints identified
- [ ] Each decision has trade-off analysis
- [ ] Simpler alternatives considered
- [ ] ADRs written for significant decisions
- [ ] Team expertise matches chosen patterns
