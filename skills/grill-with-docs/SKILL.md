---
name: grill-with-docs
description: >-
  Specialized DOX documentation audit session that stress-tests a plan strictly against the project's
  AGENTS.md hierarchy, validates local contracts, and updates AGENTS.md files inline.
  Trigger ONLY when the user explicitly invokes `/grill-with-docs`, "grill with docs", or specifically
  requests auditing/stress-testing a plan against DOX indices or AGENTS.md contracts.
  DO NOT trigger for standard `/grill-me` slash commands, general design interviews, or standard decision alignment.
---

<what-to-do>

Conduct a DOX-driven architectural review session challenging this plan against the AGENTS.md documentation hierarchy until all contract decisions are crystallized. Walk down each branch of the design tree, resolving dependencies and checking compliance with local AGENTS.md rules. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering. When asking a question with discrete options, you MUST call the `ask_question` tool instead of writing options as plain text. This renders an interactive UI the user can click. Use open-ended plain text questions only when the answer space is truly unbounded.

If a *fact* can be found by exploring the codebase or reading the DOX hierarchy, look it up rather than asking me. The *decisions*, though, are mine — put each one to me and wait for my answer.

Do not enact the plan until I confirm we have reached a shared understanding.

</what-to-do>

<supporting-info>

## DOX Hierarchy and Domain Awareness

This repository strictly organizes its domains, rules, guidelines, and structural design using the **DOX framework** (managed and navigated using the [dox-navigator](../dox-navigator/SKILL.md) skill):

- **Root [AGENTS.md](../../../AGENTS.md)**: The entry point, defining global rules, project identity, design standards, database rules, and git protocols. It contains the top-level `Child DOX Index`.
- **Child `AGENTS.md` files**: Each directory branch has its own `AGENTS.md` specifying local contracts, responsibilities, work guidance, verification checks, and lists of its child directories.
- **Strictly Relative Paths**: All links inside any `AGENTS.md` file MUST use relative paths (e.g. `./subfolder/AGENTS.md` or `../sibling/AGENTS.md`). Absolute paths are strictly forbidden.

Before starting the session, you must read the DOX chain (from root to target folders) to fully extract the rules and design standards of the systems you will touch.

## During the session

### Challenge against the DOX Contracts

When the user proposes a change, verify if it violates any global rules in the root `AGENTS.md` or domain rules in the corresponding local `AGENTS.md`. Proactively raise contradictions: "Your local contract for this folder states X, but your plan suggests doing Y — should we adapt the contract, or align the plan?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, verify against the existing codebase and local specifications to propose a precise, canonical term that maintains coherence.

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it immediately.

### Update AGENTS.md files inline

When a design decision, rule, or contract is resolved, update the nearest owning `AGENTS.md` file immediately (usually in the `Local Contracts` or `Work Guidance` sections). Don't batch these up — capture them as they happen.

If the decision modifies the layout or purpose of child directories, update the `Child DOX Index` of the corresponding parent `AGENTS.md` file and keep all links relative.

</supporting-info>
