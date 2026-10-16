---
name: grill-with-docs
description: "A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go."
---

# Grill With Docs

Interview the user relentlessly until you reach a shared understanding, while maintaining domain documentation (ADRs and glossary) as decisions are settled.

Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:

```markdown
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Word each question so "yes" accepts your recommended answer.

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, codebase, etc.), look it up or explore it; don't ask the user for anything you could look up yourself. Don't block on it: an ongoing exploration is an unsettled prerequisite, so only the questions downstream of it wait; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

### Document as Decisions Settle

As decisions are locked in during the rounds:

1. **Domain Terms**: If new concepts, domain entities, or nomenclature are introduced, document or update them in the project's domain glossary (`GLOSSARY.md` or as defined by the domain model).
2. **Architecture Decision Records (ADRs)**: For significant architectural choices, write or update an ADR in the project's ADR directory (e.g. `docs/adrs/` or `docs/decisions/`).

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.
