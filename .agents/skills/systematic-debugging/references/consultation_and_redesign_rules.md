# Consultation & Redesign Rules

This reference document defines the escalation criteria and consultation protocols when a bug repair requires significant architectural changes, database migrations, or compromises with project rules.

---

## 1. Dual Mode Invocation Detection

The agent must first detect how the debugging workflow was invoked:

| Invocation Mode | Trigger Context | Escalation Behavior |
| :--- | :--- | :--- |
| **Explicit Invocation** | User explicitly ran `/systematic-debugging` or directly prompted to investigate/fix a bug in the active chat. | **PAUSE & CONSULT**: The agent MUST halt code changes and present a structured consultation matrix before modifying `src/` or `database/`. |
| **Automatic Invocation** | Invoked autonomously by a subagent, background simulation runner, CI check, or self-healing routine. | **AUTONOMOUS RESOLUTION**: Proceed autonomously selecting the most minimalist solution (Ponytail), logging the design decisions into the final execution ledger without blocking. |

---

## 2. Mandatory Pause Triggers (Explicit Mode)

In **Explicit Mode**, the agent MUST pause execution and consult the user whenever ANY of the following conditions are met:

1. **Database Schema or Persistence Mutations**:
   - The fix requires modifying PostgreSQL/Supabase schemas, adding SQL migrations in `supabase/migrations/`, or altering core entity structures.
2. **Breaking API & Contract Changes**:
   - The fix alters the signature or return type of public store actions, Supabase client interfaces, or core calculation engine exports consumed across multiple components.
3. **DOX & Rule Collisions**:
   - The proposed fix would violate or weaken an existing rule documented in `AGENTS.md` (e.g. 1:1 canonical calculation parity, Zero-Fallback policy, Fail Loud & Fast, or Domain-Type-First).
4. **Multiple Viable Architectural Paths**:
   - There are two or more competing designs with non-trivial trade-offs (e.g. state normalization vs event bus vs computed store derivation).

---

## 3. Structured Consultation Format

When halting for user consultation in Explicit Mode, the agent MUST render the full structured consultation matrix directly in visible chat text (and in any consultation artifact) before prompting the user or calling `ask_question`:

```markdown
### ⚠️ Architectural Consultation Required

**Problem Context**:
[Clear, concise explanation of the bug and why a standard local fix is insufficient]

**Underlying Conflict / Decision**:
[Explain the collision with DOX rules, DB schema, or public contracts]

**Option 1: [Recommended Option Title]** (Recommended)
- **Approach**: [Technical summary of the change]
- **Pros**: [Key architectural advantages, compliance with standards]
- **Cons**: [Trade-offs, files affected, migration requirements]
- **Impact**: [Components or tests that will be touched]

**Option 2: [Alternative Option Title]**
- **Approach**: [Technical summary of the alternative]
- **Pros**: [Advantages]
- **Cons**: [Disadvantages]
- **Impact**: [Files touched]

*Please select an option to proceed with the repair.*
```

---

## 4. Autonomous Resolution Protocol (Automatic Mode)

When operating under **Automatic Invocation**:

1. **Apply Ponytail Filter**:
   - Select the least complex, most minimal working solution.
   - Avoid speculative abstractions, unnecessary new dependencies, or redundant helper classes.
2. **Never Weaken Core Gates**:
   - Even in automatic mode, the agent is strictly forbidden from introducing masking fallbacks (`||`, `??`), inflating Playwright action timeouts beyond 10s, or using `@ts-ignore`.
3. **Document in Ledger**:
   - Record the decision, rationalization, and files touched under `## Critical Decisions` in the final summary report.
