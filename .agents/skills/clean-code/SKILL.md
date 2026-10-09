---
name: clean-code
description: Pragmatic coding standards - concise, direct, no over-engineering, no unnecessary comments
allowed-tools: Read, Write, Edit
version: 2.0
priority: CRITICAL
license: MIT
metadata:
  author: Franco Gastón Pellegrini
  organization: FrancoGP Core Architecture
  date: October 2026
---

# Clean Code - Pragmatic AI Coding Standards

> **CRITICAL SKILL** - Be **concise, direct, and solution-focused**.

---

## Core Principles

| Principle | Rule |
| :--- | :--- |
| **SRP** | Single Responsibility - each function/class does ONE thing |
| **DRY** | Don't Repeat Yourself - reuse existing systems, classes, and patterns |
| **KISS** | Keep It Simple - simplest solution that works |
| **YAGNI** | You Aren't Gonna Need It - don't build unused features |
| **Boy Scout** | Leave code cleaner than you found it |

---

## Naming Rules

| Element | Convention |
| :--- | :--- |
| **Variables** | Reveal intent: `userCount` not `n` |
| **Functions** | Verb + noun: `getUserById()` not `user()` |
| **Booleans** | Question form: `isActive`, `hasPermission`, `canEdit` |
| **Constants** | SCREAMING_SNAKE: `MAX_RETRY_COUNT` |

> **Rule:** If you need a comment to explain a name, rename it.

---

## Function Rules

| Rule | Description |
| :--- | :--- |
| **Small** | Max 20 lines, ideally 5-10 |
| **One Thing** | Does one thing, does it well |
| **One Level** | One level of abstraction per function |
| **Few Args** | Max 3 arguments, prefer 0-2 |
| **No Side Effects** | Don't mutate inputs unexpectedly |

---

## Code Structure

| Pattern | Apply |
| :--- | :--- |
| **Guard Clauses** | Early returns for edge cases |
| **Flat > Nested** | Avoid deep nesting (max 2 levels) |
| **Composition** | Small functions composed together |
| **Modularity** | **Fallow Quality Governance**: Maintain low cognitive (≤ 20) and cyclomatic (≤ 25) complexity, and follow Fallow refactoring targets. Modularize based on Single Responsibility and cognitive load, eliminating arbitrary line limits. |
| **Colocation** | Keep related code close |
| **Layout Centering** | Use `display: flex` + `justify-content` + `align-items` for centering. Avoid `position: absolute` with `translate(-50%, -50%)` as it creates sub-pixel blurring and breaks layout flow. |
| **Stable Sorting** | When using `Array.prototype.sort()`, ensure the comparison function returns stable and predictable values (1, -1, 0). Use a unique identifier (like `uid`) as a final tie-breaker. ALWAYS filter out null/undefined slots BEFORE sorting to prevent runtime type errors. |
| **Reactive State** | Use `reactive()` for complex filter/form objects (5+ properties) instead of multiple `ref()` calls. This simplifies cross-property dependency logic (e.g., `hasActiveFilters`) and ensures consistent HMR and testing behavior. |

---

## Async Code

| Rule | Description |
| :--- | :--- |
| **Await Rejections** | Always `await` async calls inside `try/catch` to ensure rejections are caught. |
| **Fail-Safe** | Use try-catch boundaries to return standard objects (e.g., `{data, error}`) in logic layers. |

---

## AI Coding Style

| Situation | Action |
| :--- | :--- |
| User asks for feature | Write it directly |
| User reports bug | Fix it, don't explain |
| No clear requirement | Ask, don't assume |
| Complex refactor / Tool failure | Prioritize `write_to_file` over partial edits to ensure 100% parity and avoid "phantom" bugs from silent mismatches |

---

## Anti-Patterns (DON'T)

| ❌ Pattern | ✅ Fix |
| :--- | :--- |
| Comment every line | Delete obvious comments |
| Helper for one-liner | Inline the code |
| Factory for 2 objects | Direct instantiation |
| utils.ts with 1 function | Put code where used |
| Reinventing the wheel | Use existing systems (e.g. `BaseModal`) |
| "First we import..." | Just write code |
| Deep nesting | Guard clauses |
| Magic numbers | Named constants |
| God functions | Split by responsibility |
| Empty rulesets | Remove blocks containing only comments |
| Generating reports or logs in arbitrary directories | Write temporary files/reports exclusively to the `scratch/` folder and clean them up when done |
| Misformatted Markdown tables | Ensure Markdown tables have a preceding blank line before the table header to prevent parsing and rendering bugs |

---

## 🔴 Before Editing ANY File (THINK FIRST!)

**Before changing a file, ask yourself:**

| Question | Why |
| :--- | :--- |
| **What imports this file?** | They might break |
| **What does this file import?** | Interface changes |
| **What tests cover this?** | Tests might fail |
| **Is this a shared component?** | Multiple places affected |

**Quick Check:**

```text
File to edit: UserService.ts
└── Who imports this? → UserController.ts, AuthController.ts
└── Do they need changes too? → Check function signatures
```

> 🔴 **Rule:** Edit the file + all dependent files in the SAME task.
> 🔴 **Never leave broken imports or missing updates.**
> 🔴 **Structural Integrity**: When modifying `.vue` files, double-verify that `<script setup>` or closing tags are not accidentally truncated during partial replacements. If the file is complex, prefer a full `write_to_file`.
> 🔴 **Export Integrity**: When refactoring stores or components, ALWAYS verify that the `return` object (Pinia) or exported variables match the current definitions. Stale exports or missing definitions are a primary source of `ReferenceError` during boot. **CRITICAL**: Never duplicate exports (e.g., using both `export function` and `export { ... }` for the same symbol) as it causes a `SyntaxError`.
> 🔴 **Minimal Exports**: Only export a function, constant, or type if there is a verified external consumer (an `import` in another file). Symbols used exclusively within the same module must NOT be exported — unnecessary exports inflate the public API surface, trigger Fallow `unused-exports` warnings, and create dead code that misleads future developers about what is actually used externally. Verify with `grep_search` before exporting.
> 🔴 **CSS Consolidation**: In shared/generic components (e.g., `BaseModal`, `UnifiedCard`), avoid using multiple classes that define overlapping properties (like `height`, `max-height`). Consolidate styles into a single master class and use context-based nesting (e.g., `.type-center &`) to prevent specificity wars and layout bugs.
> 🔴 **CSS Override Governance**: ALWAYS audit the end of large SASS/CSS files for duplicated local class definitions. During migrations, local overrides can silently break global standardizations and cause "phantom" regressions. In shared/generic components (e.g., `.location-card`, `.card`), avoid hardcoding filters or themes that should be handled by specialized atmospheric systems.
> 🔴 **SASS Nesting Traceability**: Maintain a strict trace of nesting levels (max 3-4 deep) to avoid "unmatched brace" syntax errors. In complex components with conditional wrappers, prefer flatter structures to maintain visibility of scope boundaries.
> 🔴 **Extracted Component Scoped Style Linkage**: In Vue 3, parent `<style scoped>` styles DO NOT penetrate child component elements. Extracted child components MUST declare their own `<style scoped lang="scss" src="...">` link or local stylesheet; never rely on simulated parent style inheritance (`// style-inherited` is strictly prohibited).

---

## Summary

| Do | Don't |
| :--- | :--- |
| Write code directly | Write tutorials |
| Let code self-document | Add obvious comments |
| Fix bugs immediately | Explain the fix first |
| Inline small things | Create unnecessary files |
| Name things clearly | Use abbreviations |
| Keep functions small | Write 100+ line functions |

> **Remember: The user wants working code, not a programming lesson.**

---

## 🔴 Self-Check Before Completing (MANDATORY)

**Before saying "task complete", verify:**

| Check | Question |
| :--- | :--- |
| ✅ **Goal met?** | Did I do exactly what user asked? |
| ✅ **Files edited?** | Did I modify all necessary files? |
| ✅ **Code works?** | Did I test/verify the change? |
| ✅ **No errors?** | Lint and TypeScript pass? |
| ✅ **Nothing forgotten?** | Any edge cases missed? |

> 🔴 **Rule:** If ANY check fails, fix it before completing.

---

## Verification Scripts (MANDATORY)

> 🔴 **CRITICAL:** Each agent runs ONLY their own skill's scripts after completing work.

### Agent → Script Mapping

| Role / Concern | Scope | Command |
| :--- | :--- | :--- |
| **Database & Persistence** | Schema & Parity | `auditor family=persistence` |
| **Frontend & Styles** | Accessibility & Styles | `npm run auditor -- task=validate_component_styles` (or `auditor task=validate_component_styles`) |
| **Security & Vulnerabilities** | Security Audit | `npm run auditor:fallow:security` |
| **Testing & Parity** | Full Vitest Suite | `npm run test` (executes 100% of unit and node projects) |
| **Any agent** | Lint & Fast Types | `npm run lint` (runs `npm run auditor:lint` executing lint-capable sub-auditors in parallel) |
| **Any agent** | Unified Global Audit | `npm run auditor` (Terminal summary + full JSON in `scratch/audits/latest_audit.json`) |

> ❌ **WRONG:** Running unapproved raw scripts, nonexistent paths, or invoking the removed `audit:for-commit` / `auditor-commit` gate (use `npm run auditor`, which enforces the warning ratchet)
> ✅ **CORRECT:** Running native TypeScript auditors or official NPM scripts declared in `package.json` (`npm run lint` for fast checks, `npm run auditor` + `npm run test` for full verification)

---

### 🔴 Script Output Handling (READ → SUMMARIZE → ACT)

**When running a validation script, you MUST:**

1. **Run the script** via official NPM script and capture ALL output
2. **Parse the output** - identify errors, warnings, and passes
3. **Summarize to user** in this format:

```markdown
## Script Results: [npm run <script>]

### ❌ Errors Found (X items)
- [File:Line] Error description 1
- [File:Line] Error description 2

### ⚠️ Warnings (Y items)
- [File:Line] Warning description

### ✅ Passed (Z items)
- Check 1 passed
- Check 2 passed
```

1. **Fix errors cleanly at the source** (use `npm run lint:fix` where applicable for automated lint repairs within scope).
2. **After fixing** → Re-run script to confirm 0 errors.

> 🔴 **VIOLATION:** Running script and ignoring output = FAILED task.
> 🔴 **Rule:** Always READ output → SUMMARIZE → VERIFY GREEN (0 errors).

---

## 🌐 Dynamic Language Governance (Zero Hardcoding)

- The agent MUST dynamically consult `.auditor/audit.config.ts` to determine the configured languages:
  - **AI Chat & Conversational Language (`config.documentation.chatLanguage`)**: Governs all interactive chat communication, user interviews, options matrices, `ask_question` dialogs. The agent converses strictly in the language resolved from `config.documentation.chatLanguage`.
  - **Documentation & File Writing Language (`config.documentation.language`)**: Governs code, code comments, commit messages, git tags, documentation files, markdown files, brain artifacts (`walkthrough.md`, `task.md`, `plan_safe_commit.md`), and DOX indices (`AGENTS.md`). The agent writes files strictly in the language resolved from `config.documentation.language`.
- **Zero Language Mixing & Zero Hardcoding**: Skills and agents MUST NEVER hardcode language names or assume fixed languages. The AI agent must dynamically resolve these settings from configuration and never confuse or conflate the chat communication language with the repository file writing language.
