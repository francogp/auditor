# Official Locked Skills Architecture & Isolation Guide

> **Module**: `.agents/skills/architecture/references/skills-lock.md`  
> **Auditor Engine Core**: `src/core/auditorBase.ts` & `src/core/safePath.ts`  
> **Test Coverage**: [`tests/locked_skills.test.ts`](../../../../tests/locked_skills.test.ts)

---

## 1. Overview & Architectural Motivation

In modern agentic software development, repositories frequently import official, upstream-curated **agent skills** from external vendor repositories (such as `antfu/skills`, `anthropics/skills`, `greensock/gsap-skills`, `fallow-rs/fallow-skills`, `vuejs-ai/skills`, `obra/superpowers`, etc.).

Without formal architectural boundaries, two critical hazards emerge:

1. **Agent Over-Auditing & False Positives**: Static analysis engines and AI agents mistakenly treat third-party vendor skills as project application code, attempting to enforce local naming conventions, CSS guidelines, or TypeScript types on immutable vendor assets.
2. **Accidental Vendor Mutation & Drift**: AI agents perform unauthorized refactorings, style tweaks, or "fixes" inside imported vendor skills, corrupting upstream integrity and diverging from upstream releases.

To eliminate these hazards, the framework establishes **Official Locked Skills Isolation** powered by `skills-lock.json`.

---

## 2. The `skills-lock.json` Manifest

Vendor skills are tracked declaratively in `skills-lock.json`. The framework searches candidate locations in strict order of precedence:

1. Custom path declared via `config.paths.skillsLockFile` in `.auditor/audit.config.ts`.
2. `skills-lock.json` (Project root)
3. `.auditor/skills-lock.json` (Auditor directory)
4. `.agents/skills-lock.json` (Agents directory)
5. `node_modules/@francogp/auditor/skills-lock.json` (Inherited from upstream framework)

### 2.1 Manifest Structure Example

```json
{
  "version": 1,
  "skills": {
    "grill-with-docs": {
      "source": "mattpocock/skills",
      "sourceType": "github",
      "skillPath": "skills/engineering/grill-with-docs/SKILL.md",
      "computedHash": "8341c12d5250aed474553f4a864a93fbd51bc4d01b4a839b1a477193cc163a50"
    },
    "gsap-core": {
      "source": "greensock/gsap-skills",
      "sourceType": "github",
      "skillPath": "skills/gsap-core/SKILL.md",
      "computedHash": "c4a01101d9e1aafbf4b49f75d74f9349790d8741981ba0237c990093863035a6"
    },
    "vitest": {
      "source": "antfu/skills",
      "sourceType": "github",
      "skillPath": "skills/vitest/SKILL.md",
      "computedHash": "21af2b13d47d31f3094b61c0f41abc8d6a7eed0df3c9a4029ea671f6978b7209"
    },
    "vue-best-practices": {
      "source": "vuejs-ai/skills",
      "sourceType": "github",
      "skillPath": "skills/vue-best-practices/SKILL.md",
      "computedHash": "3df585ad31aec78fe55c56c1411262737e6b231677a3153dec512a882fde80cd"
    }
  }
}
```

---

## 3. Four Core Architectural Guarantees

```mermaid
flowchart TD
    A["skills-lock.json"] --> B["loadLockedSkills(projectRoot)"]
    B --> C["isLockedSkillPath(filePath)"]
    
    C -->|Match Found| G1["1. File Scanner (isPathIgnored)\nStrictly Excluded"]
    C -->|Match Found| G2["2. AST/Linter Findings\nSilently Dropped"]
    C -->|Match Found| G3["3. safeWriteFile / safeWriteFileSync\nThrows Immutability Violation"]
    C -->|Match Found| G4["4. AI Agent Governance\nDo NOT review or edit locked skills"]

    C -->|Not in Lockfile| H["Custom In-House Skill\n(architecture, safe-commit, auditor...)\nFully audited, maintained & editable"]

    style A fill:#1a1a2e,stroke:#00b4d8,stroke-width:2px,color:#fff
    style G1 fill:#e94560,stroke:#fff,stroke-width:1px,color:#fff
    style G2 fill:#e94560,stroke:#fff,stroke-width:1px,color:#fff
    style G3 fill:#e94560,stroke:#fff,stroke-width:1px,color:#fff
    style G4 fill:#e94560,stroke:#fff,stroke-width:1px,color:#fff
    style H fill:#0f3460,stroke:#00b4d8,stroke-width:2px,color:#fff
```

### 3.1 Immutability & Write Protection (`src/core/safePath.ts`)

The framework wraps all file write operations with `assertNotLockedSkill()`:

```typescript
function assertNotLockedSkill(filePath: string): string {
  const resolved = safeResolve(filePath);
  const root = path.resolve(process.cwd());
  if (isLockedSkillPath(resolved, root)) {
    throw new Error(`Security / Immutability Violation: Cannot write to official locked skill: '${resolved}'`);
  }
  return resolved;
}
```

Any attempt by a tool, subagent, or auto-fixer to mutate files under `.agents/skills/<lockedSkill>`, `skills/<lockedSkill>`, or `.skills/<lockedSkill>` fails immediately and loudly.

### 3.2 File Scanner Exclusion (`src/core/auditorBase.ts`)

During repository audits, `isPathIgnored()` checks `isLockedSkillPath()`. Files belonging to locked skills are cleanly skipped during file collection, preventing wasteful I/O and false positives.

### 3.3 Finding & Violation Suppression (`BaseAuditor.ts`)

If an external tool or holistic AST scanner processes a file that resolves into a locked skill directory, `BaseAuditor` drops the finding before recording metrics:

```typescript
// Findings belonging to official locked skills are discarded
if (this.isLockedSkillPath(finding.file)) {
  return;
}
```

This guarantees that project metrics (e.g., Fallow health score, linter error count) reflect **only** first-party workspace code.

### 3.4 AI Agent Governance & Review Scope

When an AI agent is instructed to audit skills, review governance rules, or check for conflicting directives:

- **Locked Skills**: **NEVER review or modify**. They are third-party external specifications.
- **Custom In-House Skills**: **Fully actionable**. Review, maintain, and refine according to repository standards.

---

## 4. Custom In-House Skills vs. Official Locked Skills

| Attribute | Official Locked Skills | Custom In-House Skills |
| :--- | :--- | :--- |
| **Tracked in** | `skills-lock.json` | Not in `skills-lock.json` |
| **Examples** | `gsap-*`, `vitest`, `fallow`, `vue-*`, `grill-with-docs`, `to-spec` | `architecture`, `auditor`, `safe-commit`, `dox-navigator`, `learn-with-docs` |
| **Ownership** | External vendor / upstream ecosystem | Repository authors & tooling engineers |
| **Immutability** | Strictly immutable (write protected) | Maintainable, editable, and evolvable |
| **Audit Status** | Skipped by scanners, findings dropped | 100% audited by `@francogp/auditor` |
| **Governance** | Upstream upstream maintainer rules | Local repository DOX & contracts |

---

## 5. Developer & Agent Guidelines

1. **Checking Skill Status**:
   To determine whether a skill is locked or custom, inspect `skills-lock.json` or call `loadLockedSkills()`:

   ```typescript
   import { loadLockedSkills, isLockedSkillPath } from '@francogp/auditor';
   
   const locked = loadLockedSkills();
   const isLocked = locked.has('gsap-core'); // true
   const isCustom = !locked.has('safe-commit'); // true
   ```

2. **Promoting a Skill to Locked Status**:
   When importing an external skill, add its entry to `skills-lock.json` with `source`, `sourceType`, `skillPath`, and `computedHash`. The framework will automatically activate immutability and scan exclusions across all tools.

3. **Editing Custom Skills**:
   When editing skills like `safe-commit` or `learn-with-docs`, do so freely using standard tools; they are first-class codebase assets not restricted by `skills-lock.json`.

---

## 6. Official Locked Skills Update Protocol (Step-by-Step)

When developers or users request to update, upgrade, or sync external skills (e.g. *"actualizar skills"*, *"update skills"*, *"actualizar skills-lock"*, *"sync skills"*), execute this deterministic zero-guesswork workflow without redundant investigation.

### 6.1 Canonical Command Execution

Use the official Skills CLI (`skills`) documented in [`find-skills`](../../find-skills/SKILL.md):

```bash
# Update ALL project-scoped skills non-interactively
skills update -p -y

# Or update a specific locked skill by name
skills update <skill-name> -p -y
```

> **Note**: If `skills` is not yet present in `$PATH`, it can be run via npm package execution (`skills` package on npm).

**Key Flags Explained**:

- `-p` / `--project`: Restricts update strictly to the project repository scope (`.agents/skills/`), avoiding global user-level contamination.
- `-y` / `--yes`: Skips interactive confirmation prompts, enabling non-blocking execution.

### 6.2 Automated Manifest Synchronization

Running `skills update` automatically:

1. Fetches the latest revisions from the upstream Git repositories configured in `skills-lock.json` (`obra/superpowers`, `greensock/gsap-skills`, `fallow-rs/fallow-skills`, `DietrichGebert/ponytail`, `mattpocock/skills`, `vuejs-ai/skills`, etc.).
2. Re-computes and overwrites cryptographic `computedHash` SHA-256 signatures directly in `skills-lock.json`.
3. Overwrites skill definition files in `.agents/skills/<skill-name>/`.

### 6.3 Post-Update Verification Pipeline

Immediately following command completion, verify the changes and validate isolation integrity:

```bash
# 1. Review lockfile and skill changes
git status --short skills-lock.json .agents/skills

# 2. Inspect modified skill hashes
git diff skills-lock.json

# 3. Verify framework isolation tests pass 100%
vp test tests/locked_skills.test.ts # or npm test -- tests/locked_skills.test.ts
```

### 6.4 Reporting Template

Deliver a consolidated final report detailing:

- Total skills audited vs. updated vs. already up-to-date.
- Per-skill change breakdown (modified files, added/removed features, upstream version upgrades).
- Confirmation of updated `skills-lock.json` hashes and 100% passing test status.

---

## 7. Mandatory Dependency-to-Skill Synchronization Matrix

When upgrading, bumping, or adding libraries in `package.json`, developers and AI agents must check whether the dependency has a corresponding official agent skill in the repository. If so, the skill **must be updated simultaneously** to keep agent knowledge aligned with library capabilities, CLI flags, and best practices.

### 7.1 Dependency-to-Skill Mapping Matrix

| Library / Package (`package.json`) | Associated Agent Skill(s) | Upstream Repository Source |
| :--- | :--- | :--- |
| `vite-plus`, `@voidzero-dev/vite-plus-core` | Packaged `node_modules/vite-plus/AGENTS.md` (injected into `AGENTS.md` via `vp config`), [`vite`](../../vite/SKILL.md), [`vitest`](../../vitest/SKILL.md) | `voidzero-dev/vite-plus` (`https://viteplus.dev/llms-full.txt`), `antfu/skills` |
| `fallow` | [`fallow`](../../fallow/SKILL.md), [`fallow-review`](../../fallow-review/SKILL.md) | `fallow-rs/fallow-skills` |
| `vitest`, `@vitest/*` | [`vitest`](../../vitest/SKILL.md) | `antfu/skills` |
| `vite`, `rolldown` | [`vite`](../../vite/SKILL.md) | `antfu/skills` |
| `valibot` | [`valibot`](../../valibot/SKILL.md) | `open-circle/agent-skills` |
| `pinia` | [`pinia`](../../pinia/SKILL.md), [`vue-pinia-best-practices`](../../vue-pinia-best-practices/SKILL.md) | `antfu/skills`, `vuejs-ai/skills` |
| `vue`, `vue-router` | [`vue-best-practices`](../../vue-best-practices/SKILL.md), [`vue-debug-guides`](../../vue-debug-guides/SKILL.md), [`vue-jsx-best-practices`](../../vue-jsx-best-practices/SKILL.md), [`vue-options-api-best-practices`](../../vue-options-api-best-practices/SKILL.md), [`vue-router-best-practices`](../../vue-router-best-practices/SKILL.md), [`vue-testing-best-practices`](../../vue-testing-best-practices/SKILL.md), [`create-adaptable-composable`](../../create-adaptable-composable/SKILL.md) | `vuejs-ai/skills` |
| `gsap` | [`gsap-core`](../../gsap-core/SKILL.md), [`gsap-frameworks`](../../gsap-frameworks/SKILL.md), [`gsap-performance`](../../gsap-performance/SKILL.md), [`gsap-plugins`](../../gsap-plugins/SKILL.md), [`gsap-react`](../../gsap-react/SKILL.md), [`gsap-scrolltrigger`](../../gsap-scrolltrigger/SKILL.md), [`gsap-timeline`](../../gsap-timeline/SKILL.md), [`gsap-utils`](../../gsap-utils/SKILL.md) | `greensock/gsap-skills` |
| `@playwright/test`, `playwright` | [`playwright-cli`](../../playwright-cli/SKILL.md) | `microsoft/playwright-cli` |
| `@vueuse/core`, `vueuse` | [`vueuse-functions`](../../vueuse-functions/SKILL.md) | `vueuse/skills` |

### 7.2 Coupled Update Protocol

When the user asks to update dependencies (e.g. *"actualizar dependencias"*, *"update fallow"*, *"upgrade vitest"*, *"upgrade vite-plus"*):

1. **Update Library**: Bump the package version in `package.json` and install dependencies.
2. **Identify Associated Skills**: Match the upgraded package against the table above. For `vite-plus`, run `vp config` so the official instructions from `node_modules/vite-plus/AGENTS.md` are synchronized into `AGENTS.md`.
3. **Update Associated Skills**: Run the skill update command for each affected skill (`skills update <skill-name> -p -y`) or synchronize all project skills concurrently (`skills update -p -y`).
4. **Verify Lockfile & Tests**: Ensure `skills-lock.json` reflects the new hashes and run tests: `git diff skills-lock.json` and `npm test tests/locked_skills.test.ts`.
5. **Report Coordinated Updates**: In the final response, confirm both the new library version and the updated skill status.
