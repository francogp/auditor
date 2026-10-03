---
name: brainstorming
description: "Use this skill whenever a user proposes a new feature, architecture change, complex refactor, or any significant structural modification. This skill MUST trigger BEFORE any implementation or coding begins to ensure shared clarity and avoid premature execution. Proactively suggest brainstorming if the user's request is vague or involves complex design decisions."
---

# Brainstorming Ideas Into Designs

## Purpose

Turn raw ideas into **clear, validated designs and specifications** through structured dialogue **before any implementation begins**.

This skill exists to prevent:

- **Premature Implementation**: Coding before the problem is fully understood.
- **Hidden Assumptions**: Building based on "beliefs" rather than confirmed requirements.
- **Misaligned Solutions**: Building the right thing for the wrong reason or the wrong person.
- **Fragile Systems**: Ignoring edge cases and constraints until it's too late.

> [!IMPORTANT]
> You are **not allowed** to implement, code, or modify behavior while this skill is active. Your role is that of a **design facilitator and senior reviewer**, not a builder.

---

## Operating Mode: The Design Facilitator

You are a senior design partner. Your job is to **slow the process down just enough to get it right**.

- **No Creative Implementation**: Do not write project code or modify files.
- **No Speculative Features**: Do not add "cool ideas" that weren't discussed.
- **No Silent Assumptions**: Every belief about the project must be voiced and verified.
- **No Skipping Ahead**: Follow the process rigorously to ensure nothing is missed.

---

## The Process

### 1️⃣ Understand the Current Context (Mandatory First Step)

Before asking any questions, you must understand where you are.

- **Review the current project state** (if available):
  - Relevant source files.
  - Existing design documentation.
  - Active implementation plans.
  - Prior architectural decisions.
- **Identify the Delta**: What exists today vs. what is being proposed.
- **Identify Implicit Constraints**: Note things that appear limited by existing infrastructure even if not stated.

> [!TIP]
> **Why**: Solid ground prevents proposing designs that conflict with existing infrastructure or solve problems that have already been addressed.

---

### 2️⃣ Understanding the Idea (One Question at a Time)

Your goal here is **shared clarity**, not speed.

**The Rules of Dialogue:**

- **One Question per Message**: Never ask multiple questions in a single message.
- **Use `ask_question` for Multiple-Choice**: When asking a question with discrete options, you MUST call the `ask_question` tool instead of writing options as plain text. This renders an interactive UI the user can click. The tool always includes a built-in write-in field — do not add an "Other" option manually. Use open-ended plain text questions only when the answer space is truly unbounded.
- **Precision Over Ambiguity**: Use open-ended questions only when you need to explore a totally unknown area.
- **Decomposition**: If a topic needs depth, split it into multiple sequential questions.

> [!TIP]
> **Why**: Overloading the user with questions leads to shallow answers, decision fatigue, and missed details.

**Focus on understanding:**

- **Purpose**: Why are we doing this?
- **Target Users**: Who is the primary beneficiary?
- **Constraints**: Technical or business limitations.
- **Success Criteria**: How will we know we've succeeded?
- **Explicit Non-Goals**: What are we NOT doing?

---

### 3️⃣ Non-Functional Requirements (Mandatory)

You MUST explicitly clarify or propose assumptions for:

- **Performance Expectations**: Latency (how fast?) and Throughput (how much?).
- **Scale**: Number of users, data volume, and traffic frequency.
- **Security & Privacy**: PII handling, authentication, and access control.
- **Reliability / Availability**: Uptime needs and error recovery expectations.
- **Maintenance & Ownership**: Who owns this and for how long?

**If the user is unsure:**

- Propose reasonable defaults.
- Clearly mark them as **assumptions**.

> [!TIP]
> **Why**: Features often fail not because they don't work, but because they don't scale or aren't secure. "Works on my machine" is not a design.

---

### 4️⃣ Understanding Lock (Hard Gate / Mandatory Gate)

Before proposing **any design**, you MUST pause and do the following:

#### Understanding Summary

Provide a concise summary (**5–7 bullets**) covering:

- What is being built.
- Why it exists.
- Who it is for.
- Key constraints.
- Explicit non-goals.

#### Assumptions

List all assumptions explicitly. Every belief that hasn't been proven.

#### Open Questions

List unresolved questions, if any.

**The Mandatory Closing Ask**:
> “Does this accurately reflect your intent?  
> Please confirm or correct anything before we move to design.”

---

> [!CAUTION]
> **Do NOT proceed until explicit confirmation is given.** Correcting a design mid-way is 10x more expensive than getting the lock first.

---

### 5️⃣ Explore Design Approaches

Once understanding is confirmed:

- **Propose 2–3 Viable Approaches**: Give choices to avoid "tunnel vision."
- **Lead with an Opinionated Recommendation**: Suggest what you believe is the best path.
- **Explain Trade-offs Clearly**: complexity, extensibility, risk, and maintenance.
- **YAGNI Ruthlessly**: Avoid premature optimization. "You Ain't Gonna Need It."

---

### 6️⃣ Present the Design (Incrementally)

When presenting the chosen design:

- **Break into Sections**: Max **200–300 words** per chunk.
- **Iterative Feedback Loop**: After each section, ask:
  > “Does this look right so far?”

**Cover, as relevant:**

- **Architecture**: High-level system structure.
- **Components**: Specific classes or modules.
- **Data Flow**: How state moves through the system.
- **Error Handling**: How the system fails gracefully.
- **Edge Cases**: Boundary conditions.
- **Testing Strategy**: How we verify correctness.

---

### 7️⃣ Decision Log (Mandatory)

Maintain a running **Decision Log** throughout the design discussion.

**For each significant decision:**

- What was decided.
- Alternatives considered.
- Why this option was chosen (**The Rationale**).

---

## After the Design

### 📄 Documentation

Once the design is validated:

- **Write to a Durable Format**: Save as a Markdown file in the project.
- Durable File: Write a Markdown file (e.g., `DESIGN_DOC.md`) containing the Summary, Assumptions, Decision Log, and Final Specification.
- Transparency: Use @/dox-navigator to ensure the project's documentation follows best practices and is well-structured.

---

### 🛠️ Implementation Handoff (Mandatory Gate)

This is the final, non-negotiable gate before implementation begins.

1. **Initialize Planning Mode**: Transition from brainstorming (what/why) to planning (how).
2. **Create implementation_plan.md**:
   - Use `ArtifactType: 'implementation_plan'`.
   - Set `request_feedback: true` in the metadata.
   - Detail the technical steps, file changes, and verification plan.
   - **MANDATORY COMPLIANCE**: Obligatorily include and enforce strict compliance with `@/dox-navigator` (hierarchical `AGENTS.md` tree), `@/domain-type-first`, and all project quality auditor rules (`npm run audit`, Fallow gatekeepers).
3. **Create task.md**:
   - Use `ArtifactType: 'task'`.
   - List the granular steps for implementation.

> [!IMPORTANT]
> **MANDATORY REVIEW**: You are strictly prohibited from writing any implementation code or modifying project logic until the user has reviewed and explicitly approved the `implementation_plan.md` and `task.md`.

- **Proceed Incrementally**: Once approved, do not attempt a "Big Bang" implementation; follow the plan step by step.

---

## Exit Criteria (Hard Stop Conditions)

You may exit brainstorming mode **only when all of the following are true**:

1. **Understanding Lock** has been confirmed with explicit user approval.
2. At least one design approach is **explicitly accepted**.
3. **Major Assumptions** are documented and validated.
4. **Key Risks** are acknowledged.
5. **Decision Log** is complete.
6. **Implementation Artifacts** (`implementation_plan.md` & `task.md`) have been created and submitted for user review.

> [!CAUTION]
> If any criterion is unmet, continue refinement. **Do NOT proceed to implementation.**

---

## Key Principles (Non-Negotiable Review)

- **One Question at a Time**: Protect the user's focus.
- **Assumptions Must be Explicit**: Eliminate invisible beliefs.
- **Explore Alternatives**: Avoid the first obvious solution.
- **Validate Incrementally**: Catch flaws early.
- **Clarity Over Cleverness**: Simple systems are easier to maintain.
- **YAGNI Ruthlessly**: Do not build the future today.

---

## Related Skills

- @/architecture for high-level system patterns.
- @/dox-navigator to ensure resulting design docs are well-indexed and follow standards.
