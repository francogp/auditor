---
name: architecture
description: Architectural governance framework. Coordinates /domain-type-first, /clean-code, /dox-navigator, /ponytail, and /auditor as mandatory pillars before designing, restructuring, or implementing systems. Governs mandatory priority of official framework CLI tools over premature ad-hoc scratch scripts, official locked skills isolation, skills-lock.json integrity, deterministic upstream skills updating (e.g. 'actualizar skills', 'update skills', 'actualizar skills-lock', 'sync skills', 'skills-lock.json'), mandatory synchronization between repository dependencies and related agent skills (e.g. updating fallow, vitest, gsap, vue together with their skills), and imperative enforcement of Node.js native standard library for all file, path, and runtime operations (e.g. 'rutas nativas', 'file walker', 'node:path', 'node:fs', 'herramientas nativas de nodejs', 'native nodejs').
allowed-tools: Read, Glob, Grep
license: MIT
metadata:
  author: Franco Gastón Pellegrini
  organization: FrancoGP Core Architecture
  date: October 2026
---

# Architecture Governance Framework

> "Requirements drive architecture. Simplicity ensures longevity. Contracts prevent decay."

Whenever making architectural decisions, designing subsystems, restructuring modules, or planning new features, you **MUST** coordinate and strictly enforce the following **5 Mandatory Foundation Skills**:

---

## 🏛️ Mandatory Foundation Pillars

Before writing code or finalizing system designs, invoke and satisfy all 5 pillars:

| Pillar | Skill Command | Mandatory Invariant |
| :--- | :--- | :--- |
| **1. Domain Typing** | [`/domain-type-first`](../domain-type-first/SKILL.md) | **Zero loose strings, zero `any`, zero `unknown`**. All finite sets, parameters, states, and IDs must derive from canonical compile-time domain unions. |
| **2. Clean Code** | [`/clean-code`](../clean-code/SKILL.md) | **Single Responsibility & Fallow Limits**. Max cognitive complexity ≤ 20, cyclomatic ≤ 25. Flat logic over deep nesting, early guard clauses. |
| **3. DOX Indexation** | [`/dox-navigator`](../dox-navigator/SKILL.md) | **Single Source of Truth in `AGENTS.md`**. Every new file, directory, and architectural boundary must be indexed in its local DOX hierarchy with relative links. |
| **4. Anti-Overengineering** | [`/ponytail`](../ponytail/SKILL.md) | **Shortest path that actually works (YAGNI & KISS)**. Standard library and native platform APIs before dependencies. One clean function before fifty layers. |
| **5. Static Governance & Tools Priority** | [`/auditor`](../auditor/SKILL.md) | **First Official CLI Tools, Zero Premature Scratch Scripts**. Always use `npm run auditor:findings`, `auditor:rules`, `auditor:dupes`, `auditor:magic`, `auditor:motion`. Scratch scripts are strictly a last resort. |

---

## 🧩 Companion Specialized Skills

For specialized architectural needs, delegate to and complement with:

- **[`codebase-design`](../codebase-design/SKILL.md)**: Deep modules, clear interface boundaries (*seams*), and hiding implementation complexity behind simple public APIs.
- **[`domain-modeling`](../domain-modeling/SKILL.md)**: Formal domain modeling, ubiquitous language, and Architecture Decision Records (ADRs).
- **[`database-migrations`](../database-migrations/SKILL.md)** & **[`supabase-postgres-best-practices`](../supabase-postgres-best-practices/SKILL.md)**: Relational schema design, RLS performance, multi-host parity, and 100% immutable *forward-only* SQL migrations.

---

## ⚡ Core Invariants

1. **Decoupled Layers**: UI components must never perform direct I/O, raw file manipulation, or invoke database drivers directly. Logic and services orchestrate computations.
2. **Configuration as SSoT**: File paths, budgets, thresholds, and subsystem flags must resolve strictly and dynamically from the central configuration (`.auditor/audit.config.ts`), never hardcoded.
3. **Fail Loud & Fast**: Invariants and boundary validations must throw explicit, actionable errors (`throw new Error(...)`). Never silently swallow errors, auto-heal corrupt states, or provide runtime fallbacks.
4. **Precision Guarantees**: Arithmetic on sensitive values (currency, timestamps, metric counters) must use exact integer scaling, `BigInt`, or explicit rounding modes.
5. **Dynamic Orchestration & Zero Hardcoding**: Runners, coordinators, and dispatchers must never maintain static lists or hardcoded sequences of tasks, suites, or subsystems. Behavior, execution order, and prioritization must be declared dynamically through constructor metadata (`AuditorRuleCapabilities`, such as `fix: 'priority'`), and resolved dynamically via reflection and AST.
6. **Official Locked Skills Isolation & Zero-Guesswork Update (`skills-lock.json`)**: Official vendor skills tracked in `skills-lock.json` (`gsap-*`, `vitest`, `fallow`, `vue-*`, etc.) are immutable third-party assets. They are strictly ignored during file scanning (`isPathIgnored`), their findings are suppressed (`BaseAuditor`), and filesystem writes are blocked (`safeWriteFile`). AI agents and developers must NEVER inspect, refactor, or edit locked skills during repository maintenance tasks; only custom in-house skills (`architecture`, `auditor`, `safe-commit`, etc.) are subject to codebase governance passes. When asked to update, upgrade, or sync locked skills (*"actualizar skills"*, *"update skills"*), execute the deterministic 4-step protocol (`skills update -p -y` → `git status` → `git diff skills-lock.json` → `vp test tests/locked_skills.test.ts`). For architecture patterns and the complete step-by-step update guide, consult the [Official Locked Skills Guide](./references/skills-lock.md#6-official-locked-skills-update-protocol-step-by-step).
7. **Dynamic Language Governance (Zero Hardcoding)**: The agent MUST dynamically consult `.auditor/audit.config.ts` to determine the configured languages: `config.documentation.chatLanguage` strictly governs interactive chat communication, user interviews, options matrices, and conversational explanations; `config.documentation.language` strictly governs repository files, code comments, documentation, and DOX indices (`AGENTS.md`). Skills and agents MUST NEVER hardcode language names or assume fixed languages. Never conflate or mix chat and file writing languages.
8. **Mandatory Dependency & Skill Synchronization**: Whenever upgrading, bumping, or modifying repository libraries in `package.json` (such as `vite-plus`, `fallow`, `vitest`, `valibot`, `vue`, `gsap`, `playwright`, etc.), developers and AI agents MUST concurrently update any corresponding official agent skills tracked in `skills-lock.json` or packaged agent directives. Upgrading a dependency without synchronizing its associated agent skill leads to documentation drift, obsolete CLI flags, and deprecated pattern guidance. Consult the [Dependency-to-Skill Synchronization Matrix](./references/skills-lock.md#7-mandatory-dependency-to-skill-synchronization-matrix) to look up related skills and update them together.
9. **Official Vite+ (`vite-plus` / `vp`) Packaged Agent Directives**: Officially, the `vite-plus` package ships its own canonical agent specification in `node_modules/vite-plus/AGENTS.md` (along with packaged documentation under `node_modules/vite-plus/docs/` and `https://viteplus.dev/llms-full.txt`), and running `vp config` injects the official Vite+ instructions directly into `AGENTS.md`. Whenever working with Vite+ (`vp` CLI, `vite.config.ts`, `vp check`, `vp lint`, `vp fmt`, `vp test`, `vp pack`, `vp build`, `vp env`, `vp config`, `vp migrate`), agents MUST consult `node_modules/vite-plus/AGENTS.md` and the official Vite+ block in `AGENTS.md` instead of inventing ad-hoc skills or legacy tool configs. Comprehensive CLI commands, tutorial prompts, and safe migration protocols are detailed in [vite-plus-guide.md](../auditor/references/vite-plus-guide.md).
10. **Strict Node.js 26+ Native Standard Library & File Management Mandate**: Developers and AI agents MUST imperatively use Node.js 26+ native standard library modules (`node:path`, `node:fs`, `node:url`, `node:util`, `node:crypto`) for all filesystem, path resolution, URL parsing, and runtime operations, especially when handling files and directories. Inventing fragile homebrew regexes to manipulate paths (`.replace(/\\/g, '/')`, `split('/')`), hardcoded drive prefixes (`C:\\`), manual recursive directory walkers (`walkDir`, custom recursive `readdirSync`), or manual path normalization is STRICTLY PROHIBITED. All path resolutions and directory traversals must strictly rely on native `node:path` methods (`path.resolve()`, `path.relative()`, `path.normalize()`, `path.join()`) and framework canonical utilities (`collectRepositoryFiles`, `safePath`, `assertSafePathComponent`) to guarantee 100% deterministic cross-platform safety across Windows, Linux, and macOS. Detailed specification and migration patterns: [native-nodejs-standard-library.md](./references/native-nodejs-standard-library.md).
11. **Mandatory Official Tools Priority & Zero Premature Scratch Scripts**: Developers and AI agents MUST always inspect, diagnose, and refactor codebase issues using the official CLI tools provided by the framework (`npm run auditor:findings`, `npm run auditor:rules`, `npm run auditor:by-rule`, `npm run auditor:by-file`, `npm run auditor:dupes`, `npm run auditor:magic`, `npm run auditor:motion`, `npm run auditor:o1`, `npm run auditor:dependencies`, `npm run auditor:version`, `auditor guide <ruleId>`, `vp check`). Writing ad-hoc inspection scripts in `scratch/` or inline `node -e` commands is STRICTLY PROHIBITED when official tools exist. Temporary scratch scripts are permitted ONLY as an exceptional last resort when no official tool covers the diagnostic requirement. When invoking npm scripts with options, always pass arguments with `--` (e.g. `npm run auditor:motion -- --help`) or run the installed binary directly, NEVER invoke `npx`.
