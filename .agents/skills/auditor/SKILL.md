---
name: auditor
description: MANDATORY governance and architectural engine for running, analyzing, inspecting, creating, refactoring, maintaining, administering, and UPDATING ALL static analysis tools, sub-auditors, AST rules, and CLI reporting scripts across the repository. YOU MUST ALWAYS TRIGGER THIS SKILL whenever analyzing audit results, inspecting findings or errors, investigating violations, reading latest_audit.json, debugging audit failures, planning or executing fixes for audit issues, or whenever the user asks to UPDATE OR UPGRADE the auditor package (e.g. 'actualizar auditor', 'actualizame el auditor', 'update auditor', 'actualizar paquete auditor', 'actualizar dependencias de auditor', 'update @francogp/auditor', 'auditor:update', 'auditor-update', 'auditor-version', 'version de auditor'), or mentions auditors, audit suites, audit reports, audit tables, Fallow analyzers, report formatting, or modifies ANY file in `scripts/auditors/`, `@francogp/auditor`, `.auditor/`, `src/core/auditorBase.ts`, or `src/core/unifiedTheme.ts`, even if they just mention 'auditor', 'auditores', 'auditoría', 'audit', 'fallow', 'reporte', 'tabla', 'resultados en la tabla', 'desglose', 'complejidad', 'duplicados', 'triplicados', 'superclase', 'BaseAuditor', 'report_fallow', 'report_complexity', 'report_findings', or audit scripts ('npm run auditor', 'npm run auditor:findings', 'npm run auditor:complexity', 'npm run auditor:fallow:*', 'npm run auditor:lint'). When updating the auditor in host projects, agents MUST use 'auditor-update' or 'npm run auditor:update' and 'auditor-version -v'. STRICTLY FORBIDDEN to use ad-hoc node -e scripts, git clone into /tmp, or git log inside node_modules; ALWAYS use the framework's native CLI tools. Enforces strict OOP inheritance (BaseAuditor, FileScanAuditor), standardized Box-Drawing table rendering via unifiedTheme (80-col limit, zero wrapping, getVisualWidth emoji alignment), dynamic auto-discovery, zero code duplication, zero project hardcoding in @francogp/auditor, zero ad-hoc console loggers, zero manual step logging (auditor-manual-step-logging), mandatory rule timing wrappers (auditor-unmeasured-rule), and zero redundant rule markings (auditor-redundant-rule-evaluated).
license: MIT
metadata:
  author: Franco Gastón Pellegrini
  organization: FrancoGP Core Architecture
  date: October 2026
---

# Auditor: Architecture, Verification & Governance Engine

This skill defines the immutable standard and architectural contract for creating, administering, refactoring, and maintaining all sub-auditors, reporting scripts, and the `@francogp/auditor` engine across the repository.

Every sub-auditor and reporter is part of a unified static analysis and verification system orchestrated by `npm run auditor`.

---

## 🏗️ 3-Tier Hierarchical Architecture & Atomic Console Mandate

The framework enforces a universal, 3-tier hierarchical and symmetric architecture where official suites and host project extensions share identical OOP abstractions:

```mermaid
graph TD
  M["Auditor Maestro (Global Orchestrator)"] --> O["Official Suites (src/suites/)"]
  M --> E["Host Project Extensions (.auditor/audit.config.ts)"]
  O --> SO["Official Sub-Auditors (Shared Resources & AST)"]
  E --> SE["Extension Sub-Auditors (Shared Resources & AST)"]

  style M fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#f8fafc
  style O fill:#064e3b,stroke:#34d399,stroke-width:2px,color:#f8fafc
  style E fill:#78350f,stroke:#fbbf24,stroke-width:2px,color:#f8fafc
  style SO fill:#312e81,stroke:#818cf8,stroke-width:2px,color:#f8fafc
  style SE fill:#831843,stroke:#f472b6,stroke-width:2px,color:#f8fafc
```

1. **Global Orchestrator (`npm run auditor`)**: Discovers suites dynamically, manages CPU worker pools, and coordinates atomic console output.
2. **Symmetric OOP Model**: Both official suites and host extensions inherit from `BaseAuditor` or `FileScanAuditor`, implementing identical interfaces, capability declarations, and error handling.
3. **Resource Sharing (`SharedAstContext`)**: Multi-rule sub-auditors share cached resources (filesystem reads, preheated ASTs, external tool passes) to maximize performance.
4. **Atomic Console Mandate**: Multi-rule suites MUST wait for all sub-checks to finish before rendering step reports (`│  🔍 [X/Y] ...`), preventing mixed output across concurrent workers.
5. **Mandatory Construction Contract (`ruleRemediations`)**: `AuditorOptions` strictly requires: `id`, `name`, `description`, `family`, `packageName`, `icon`, `ruleDescriptions`, `ruleRemediations`, `ruleCapabilities`, `configKey`, `defaultConfig`, and `criticalConfig`. Omitting any field or lacking a remediation guide for any declared rule ID throws a loud runtime error.
6. **On-Demand Diagnostic Guides (`auditor guide`)**: Any diagnostic and remediation manual can be rendered on-demand in the terminal via `npm run auditor guide <ruleId>`, `auditor guide suite=<suiteId>`, or `auditor guide family=<family>` with zero truncation and Box-Drawing formatting.
7. **Compiled Artifact Verification (`npm run auditor:post-build`)**: Rules declaring `phase: 'post-build'` (`capabilities.phase === 'post-build'`) are excluded from pre-build source audit and execute post-build against `dist/` via `npm run auditor:post-build` (`auditor phase=post-build`).

---

## 🏛️ Core Principles & Tooling Mandates

### 1. Absolute Prohibition on Backward-Compatible Code & Loud Failure Mandate

- Writing backward-compatible shims, deprecated aliases, or legacy fallback wrappers is **STRICTLY PROHIBITED**.
- Outdated consumers, obsolete configs, and unmigrated calls MUST fail loudly with immediate, blocking errors (`throw new Error(...)` or exit code 1) forcing canonical upgrades.

### 2. Prohibition on Modifying or Disabling Configurations Without Prior Human Authorization

- **NEVER turn off, relax, revert, or modify auditor configuration** (`.auditor/audit.config.ts`, `vite.config.ts`, `.stylelintrc.json`, `.fallowrc.json`) when encountering errors or warnings.
- Errors are **REAL ARCHITECTURAL DEFECTS** that must be resolved in source code or via `npm run auditor:fix`.
- If an agent believes a configuration genuinely requires adjustment, the agent **MUST HALT IMMEDIATELY AND EXPLICITLY CONSULT THE HUMAN PROGRAMMER** via `ask_question`, presenting the technical explanation, trade-offs, pros, and cons before modifying any configuration.

### 3. Absolute Prohibition on Suppressing Audit Rules & Zero-Tolerance Fake Pass Mandate

- Suppressing, silencing, or bypassing rules (e.g., setting `"rule": null`, `"rule": "off"`, passing arbitrary skip flags) to achieve a fake pass is considered critical architectural sabotage.

### 4. Node.js 26+ Native Engine & Prohibition of NPX / Third-Party Runners

- Executes strictly under Node.js 26+ native engine with native TypeScript (`node --experimental-strip-types`).
- Invoking or recommending npx runners (such as tsx, legacy auditor, or vitest via npx) or third-party runners is **STRICTLY PROHIBITED**. Use native Node.js or canonical npm scripts (`npm run <script>`, `npm test`).

### 5. Strict OOP Inheritance Mandate

- Every sub-auditor MUST extend `BaseAuditor<TRuleId>` or `FileScanAuditor<TRuleId>`.
- Procedural scripts, custom CLI loggers, and ad-hoc result printers are **STRICTLY FORBIDDEN**.

### 6. Dynamic Monospace Box-Drawing Table Mandate (80 Columns, Zero Wrapping)

- All terminal output uses shared Box-Drawing utilities (`renderBanner`, `renderBoxTable`, `formatStatusBadge`, `getVisualWidth`).
- Tables must fit within standard 80 columns (`TERMINAL_WIDTH = 80`) and use `getVisualWidth()` for emoji padding.
- Multi-row summary tables MUST include a `TOTAL CONSOLIDADO` footer row.

### 7. Universal Empirical Individual Timing Mandate

- 100% of declared sub-auditors and rules must record real empirical execution runtime badges (`(X ms)` or `(<0,1 ms)`). Suites taking seconds or hundreds of ms must NEVER show `(0 ms)` on child rules.
- **Prohibition of Synthetic Division**: Multi-rule suites must NEVER synthetically divide suite duration or stamp batch durations identically onto rules.
- **Superclass Wrappers**: Wrap rule checks with `this.runSubAuditorSync(ruleId, () => T)` or `await this.runSubAuditor(ruleId, async () => T)`. These helpers invoke `markRuleEvaluated(ruleId)` internally.
- **Deconstruction of External Tools**: Execute the shared tool pass, then aggregate findings per rule inside dedicated `this.runSubAuditorSync(ruleId, () => { ... })` blocks.
- **Explicit Non-Applicability (`markRuleNotApplicable`)**: When a subsystem or directory does not exist, call `this.runSubAuditorSync(ruleId, () => this.markRuleNotApplicable(ruleId, 'reason'))`.

### 8. Atomic Console Streaming & Completion-Ordered Output (`streamingRunner.ts`)

- Master audit executes suites concurrently across CPU workers (`Math.max(1, Math.floor(availableCpus / 2))`).
- **Completion Order**: Suites appear in console strictly in the order they **FINISH** ($T_{\text{finish}} = T_{\text{start}} + \text{durationMs}$). The printed duration reflects active child runtime (`performance.now() - taskStart`), not global wall-clock time. Short suites queued later display after earlier heavy suites.
- **`printLock` Mutex**: Guarantees each suite's output block renders as an unbroken atomic unit.

### 9. Execution Lifecycle Phases (`phase: 'normal' | 'post-run' | 'post-build'`)

- **`phase: 'normal'`**: Standard source code and architecture suites dispatched across concurrent worker pools.
- **`phase: 'post-run'` (`validate_audit_coverage`)**: Completely excluded from concurrent worker pools; executes sequentially ONLY AFTER 100% of preceding suites finish and flush coverage ledgers to `scratch/audits/coverage/<suiteId>.json`, eliminating false `coverage-missing-ledger` alarms.
- **`phase: 'post-build'` (`npm run auditor:post-build` / `auditor phase=post-build`)**: Verifies compiled distribution artifacts in `dist/` after compilation completes.

### 10. Shared AST Engine & Zero Duplicate Parse Mandate (`SharedAstContext`)

- Suites requiring AST or Vue SFC `<script>` parsing declare `requiresAst: true` (and `ast: true` in `ruleCapabilities`).
- NEVER call `ts.createProgram` or `ts.createSourceFile` in file loops. Consume `SharedAstContext` preheated by the orchestrator.

### 11. Centralized Directory Scanning & In-RAM File Cache (`WorkspaceFileCache`, `scanFilesSinglePass`)

- Sub-auditors MUST NEVER implement custom recursive directory traversals (`fs.readdir` loops, `walkDir`, `getAllFiles`). Use `this.context.collectFiles(roots, extensions)` or `collectRepositoryFiles()`.
- Multi-rule suites scanning the same file set MUST use `await this.scanFilesSinglePass(files, handlers)` backed by the in-RAM `WorkspaceFileCache`, reading each file once and prohibiting nested rule-over-files disk loops (`auditor-inefficient-file-scan`).

### 12. Mandatory Modular Identity & Human-Friendly Description Standard

- `packageName`: Mandatory package/technology scope (e.g. `'Oxlint'`, `'TypeScript'`, `'Config'`, `'Estilos'`).
- `description`: Suite purpose, max 60 characters (`MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH = 60`).
- `ruleDescriptions`: Pure Spanish explanation for each rule ID. Composed `${packageName}: ${ruleDescription}` MUST be `<= 50` characters (`MAX_AUDITOR_DESCRIPTION_LENGTH = 50`) without newlines.
- Positive health phrasing for active checks (e.g. `'Salud del motor similar-code'`), reserving error phrasing for violation messages.

### 13. Single Source of Truth Directory Ignores & Dynamic Path Exemptions (`isPathIgnored`, `isPathExempt`)

- Sub-auditors MUST NEVER declare local ignore arrays or hardcoded candidate paths. Use `isPathIgnored(relPath)` unifying `CANONICAL_IGNORE_DIRS` + `config.paths.ignoredDirs` + `ignoredPatterns` + `ignoreGlobs`.
- `FileScanAuditor` natively accepts `exemptPaths` in constructor options and evaluates `isPathExempt(relPath, this.exemptPaths)`, cleanly ignoring configured files or patterns.

### 14. Universal Ephemeral Scratch (`scratch/`) & Build Output (`dist/`) Isolation

- `scratch/`: All temporary files, AI drafts, testing dumps, and raw audit outputs (`scratch/audits/`). Must be in `.gitignore`.
- `dist/`: All compiled outputs and production bundles. Must be in `.gitignore`.

### 15. Dynamic Auto-Discovery & Zero Hardcoded Suite Maps

- Generic suites in `src/suites/<family>/` and host extensions in `.auditor/audit.config.ts` are discovered dynamically. Never hardcode static suite arrays.

### 16. Pure Configuration-Driven Resolution & Anti-Hardcoding Mandate (`auditor-hardcoded-config`)

- `@francogp/auditor` MUST remain 100% domain-agnostic. No hardcoded host directories, domain entity IDs, fallback filenames (e.g. `['visuals.ts', 'constants.ts']`), or business rules in core suites or host extensions.
- All candidate paths, target directories, and exemption patterns MUST resolve dynamically from `.auditor/audit.config.ts`.
- Enforced at build and audit time by `validate_auditor_hygiene` (`auditor-hardcoded-config`), which flags hardcoded candidate arrays and fallback path lists with `severity: 'error'`.

### 17. Active by Default Subsystem Mandate ("All Defaults ON")

- All subsystems in `@francogp/auditor` are ACTIVATED BY DEFAULT (`enabled: true`). Host configurations declare customizations or explicit deactivations (`enabled: false`, `engine: 'none'`).

### 18. Mandatory GSAP UI Animation Governance & Anti-Destruction of CSS Transitions

- UI animations and delays must use GSAP standard primitives (`gsapSleep`, `delayedCall`, `gsap.to`).
- Deleting or stripping CSS transitions (`transition: ...`) to pass audits is **STRICTLY FORBIDDEN**. Transitions must be cleanly migrated to GSAP tweens.

### 19. Vector Semantic Duplication Architecture (`validate_similar_code`)

- Detects semantic clones via Fallow embeddings (`jina-embeddings-v2-base-code`) on **Candle CPU** (CPU-only, no GPU/CUDA) with `--threads ${os.availableParallelism()}`.
- Caches persist in `%LOCALAPPDATA%\fallow\similar-code` (Windows) or `~/.cache/fallow/similar-code` (Linux).
- Bypassed cleanly in `speed=light` (`npm run auditor:lint`) and production deployment builds (`AUDITOR_ENV=production` via `npm run build:deploy`). Skipping vector analysis in local development is strictly prohibited.

### 20. Fallow 100% Error Severity & Holistic Refactoring Targets

- All Fallow findings map strictly to `severity: 'error'`. Downgrading to warning is prohibited.
- Governed by holistic Fallow Refactoring Targets (`fallow-refactoring-targets`, `config.fallow.enforceTargets: true`), eliminating artificial function fragmentation.

### 21. Orthogonal 7-Field Rule Capabilities Contract (`AuditorRuleCapabilities`)

- Every sub-auditor declares capabilities on each rule individually via `ruleCapabilities: Record<TRuleId, AuditorRuleCapabilities>`.
- Passing suite-level `capabilities` directly in constructor options is prohibited (`capabilities?: never`).
- Each rule capability explicitly initializes all 7 orthogonal fields (the legacy contract field `changedSince` is completely eradicated in favor of `changedOnly: boolean`):
  - `speed`: `'light' | 'heavy' | 'full' | readonly AuditExecutionSpeed[]` (`🐇` `'light'`, `🐢` `'heavy'`, `🐘` `'full'`, or array `['light', 'full']` for multi-tier CLI tools).
  - `phase`: `'normal' | 'post-run' | 'post-build'`.
  - `fix`: `'none' | 'normal' | 'priority'` (`'priority'` executes first during `auditor fix` to bootstrap config/environment).
  - `md`: `boolean` (included in `auditor preset=md` / `npm run auditor:md`).
  - `ast`: `boolean` (preheats `SharedAstContext`).
  - `changedOnly`: `boolean` (supports differential scoping via `--changed-since`).
  - `critical`: `boolean` (indispensable for code correctness, typing, and syntax; bypasses speed ceiling in `auditor:lint` and `auditor:critical`).
- Canonical templates export `LINT_RULE_CAPABILITIES` and `AST_RULE_CAPABILITIES`, or accept explicit 7-field literals via `createUniformRuleCapabilities(RULES, { ... })` / `createRuleCapabilities(RULES, baseCapabilities, fixableRuleIds)`.

### 21.1 Speed Engine: Ceiling vs. Exact Modes, Visual Icons (`🐇` / `🐢` / `🐘`) & Multi-Tier Mandates

- **3 Canonical Speed Tiers (`AuditExecutionSpeed`)**:
  - `'light'` (`🐇`): Fast static lint and AST rules (`npm run auditor:lint` / `auditor speed=light`).
  - `'heavy'` (`🐢`): Default workspace audit ceiling (`npm run auditor` / `auditor` / `auditor speed=heavy`), running `'light'` + `'heavy'` suites.
  - `'full'` (`🐘`): Exhaustive pre-build/release ceiling (`npm run auditor:full` / `auditor speed=full`), running `'light'` + `'heavy'` + `'full'` (including `fallow dead-code --type-aware`).
- **Ceiling Mode (`speed=light|heavy|full`)**: Cumulative up to the requested ceiling (`speed=heavy` runs `light` + `heavy`; `speed=full` runs `light` + `heavy` + `full`).
- **Exact Isolation Mode (`only-speed=light|heavy|full`)**: Executes ONLY rules matching that exact tier.
- **Mandatory Speed Selection in Multi-Speed Critical Suites**: If a suite or rule declares `critical: true` and `speed` has 2 or more speeds declared (e.g. `speed: ['light', 'full']`), it **MUST ALWAYS choose the fastest (`light`) when no speed is specified in the invocation** (`auditor`, direct node execution, or `npm run <validate-script>`), guaranteeing that direct local executions run instantaneously with incremental/cache enabled.
- **Mandatory Authentic Tiers & Prohibition of Duplicated Tiers**: Inventing or duplicating speed tiers that repeat identical CLI arguments or behaviors as another tier (such as inventing a `heavy` tier identical to `light`) is STRICTLY PROHIBITED. Each declared tier (`light`, `heavy`, `full`) MUST execute genuinely different commands or CLI flags of the underlying tool. If a tool only supports 2 distinct operational modes (e.g. `tsc` with `--incremental` in `light` vs without `--incremental` in `full`), ONLY those 2 basic tiers are declared (`['light', 'full']`). Only tools with 3 completely decoupled subcommands (such as `validate_fallow`: `dead-code --no-type-aware`, `dupes`, `type-aware`) declare all 3 tiers.
- **Permanent Cache Mandate (Cache is NEVER Turned Off in Full)**: In the Full (`🐘`) tier, the entire project is audited without incremental/delta scoping (evaluating all files), BUT THE CACHE IS NEVER TURNED OFF. Tools with caching support (`oxlint --cache`, `stylelint cache: true`, `type-coverage --cache`, Fallow graph cache) MUST maintain their cache permanently enabled across all tiers to avoid re-processing identical files on disk.
- **Clean Composition in `TieredCommandProfile`**: Repeating identical literal arrays in `profiles` is strictly prohibited. Profiles must be cleanly composed using shared constants (e.g. `standardArgs`, `incrementalArgs`).
- **LPT Task Scheduler (Longest Processing Time First)**: In `audit_full`, suites with higher speed tiers (`🐘` `'full'`, `🐢` `'heavy'`) are sorted and dispatched FIRST in the worker queue so multi-core CPU workers absorb heavy tasks immediately.

### 21.2 Mnemonic Command Naming & Master Build Chaining

- `npm run auditor:lint` (`auditor speed=light`): Fast `🐇` lint pass.
- `npm run auditor` (`auditor`): Default `🐢` heavy audit pass.
- `npm run auditor:full` (`auditor speed=full`): Exhaustive `🐘` pre-compilation/release audit pass.
- `npm run auditor:post-build` (`auditor phase=post-build`, binary `auditor-post-build`): Post-compilation artifact verification against `dist/`.
- `npm run build`: Chains `"npm run auditor:full && <compile> && npm run auditor:post-build"`.
- `npm run build:deploy` (`auditor-build-deploy`): Runs `npm run build` under `AUDITOR_ENV=production` for Docker/CI/deploy environments.

### 22. Strict Vite+ (`vp`) Unified Configuration & Code Hygiene Governance (`validate_vite_plus_config`, `validate_oxlint`, `validate_oxfmt`)

- Eradicates standalone `eslint.config.*`, `vitest.config.*`, `tsdown.config.*`, `tsconfig.build.json`, and `.nvmrc` across all projects in favor of unified **Vite+ (`vite-plus` / CLI `vp`)**.
- Governs `vite.config.ts` (`defineConfig` from `'vite-plus'`) enforcing:
  1. `lint`: Oxlint + type-aware rules (`options: { typeAware: true, typeCheck: true }`), JS plugin `@francogp/auditor/domain-type-plugin` enforcing the `/domain-type-first` rules, `@typescript-eslint/no-explicit-any: 'error'`, `@typescript-eslint/ban-ts-comment: 'error'`, `@typescript-eslint/consistent-type-assertions: ['error', { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }]`, and banning double casting `as unknown as T` or uncoordinated `Date` constructors without explicit domain wrappers.
  2. `test`: Vitest runner importing from `'vite-plus/test'`, supporting multi-project configurations and V8 coverage.
  3. `fmt`: Oxfmt formatting (`singleQuote: true`, `semi: true`, `trailingComma: 'none'`, `printWidth: 100`), audited and validated by `validate_oxfmt`.
  4. `staged`: Native git hooks (`{ '*': 'vp check --fix' }`).
  5. `pack`: Tsdown library packaging when `packageDistribution.enabled: true`.
  6. `dynamic exclusion sync`: `syncViteConfigWithAuditConfig` dynamically projects `config.paths.ignoreGlobs` into `lint.ignorePatterns` and `fmt.ignorePatterns`.
- **Mandatory Injected Rule & Configuration Canary Verification**:
  Every rule injected or mandated by Vite+ (Oxlint, Oxfmt, domain-types) must have active automated canary tests asserting positive failure detection, clean compliance, and auto-fix behavior. Furthermore, all auditor configuration options must have canaries verifying both active state and disabled state (`enabled: false`).
- **Non-Destructive Auto-Fix Migration Workflow (`auditor fix`)**:
  When migrating a legacy project, `auditor fix` executes the strict 5-stage non-destructive protocol:
  1. **Preserve & Merge Configs**: Reads existing `vitest.config.*` (extracting `test: { ... }` blocks, projects, and custom pools) and merges them into `vite.config.ts`, preserving 100% of existing application plugins, aliases, and server configs.
  2. **Rewrite Imports**: Rewrites test imports from `'vitest'` to `'vite-plus/test'`.
  3. **Migrate Node Runtime**: Migrates `.nvmrc` to `.node-version` (canonical for `vp env`).
  4. **Synchronize `package.json`**: Adds `"vite-plus": "^1.2.0"` to `devDependencies`, strips obsolete `eslint*` packages, and modernizes scripts to `vp check`.
  5. **Clean Legacy Artifacts**: Purges obsolete config files (`vitest.config.*`, `eslint.config.*`, `.nvmrc`) ONLY AFTER all preceding migration steps have succeeded.

### 23. Authentic Documented Commands Governance (`validate_documented_commands`)

- Every documented command in Markdown files and AI skills (`.agents/skills/**`) is validated against executable truth (`package.json.scripts`, `node_modules/.bin`).

### 24. Executable Script & Pipeline Commands Governance (`validate_script_commands`)

- Audits all executable scripts (`.sh`, `.bash`, `.zsh`, `.ps1`, `.bat`, `.cmd`), Dockerfiles, GitHub Actions workflows (`.github/workflows/*.yml`), and maintenance scripts (`scripts/**/*.{ts,js,mjs}`).
- Uses AST parsers (`unbash` for Shell, `yaml` for CI workflows, TypeScript Compiler AST for maintenance scripts) rather than fragile regex line scanners.
- Inspects both process runner calls (`execSync`, `spawn`, `execa`) and CLI diagnostic help guidance (`console.log`, `throw new Error(...)`), verifying scripts exist in `package.json.scripts` while ignoring generic syntax placeholders (`<comando>`, `[...]`, `$...`).
- All rules enforce `severity: 'error'` and `fix: 'none'` with zero backwards-compatibility shims.

### 25. Single Source of Truth Configuration Layout (`.auditor/`)

- All auditor-owned configuration and warning baselines live in `.auditor/` (`audit.config.ts`, `audit-baseline.json`). Root-level `audit.config.ts` fails loudly.

### 26. Warning Ratchet & Baseline Governance (`ratchet`)

- Full audit (`npm run auditor` / `npm run auditor:full`) enforces **0 errors AND 0 new warnings** comparing fingerprints against `.auditor/audit-baseline.json`. Resolving existing warnings monotonically shrinks the baseline.

### 27. Canonical DOX Hierarchy Governance (`validate_dox_integrity`)

- Every `AGENTS.md` MUST contain all 6 mandatory sections in order: `# Purpose` ➔ `## Ownership` ➔ `## Local Contracts` ➔ `## Work Guidance` ➔ `## Verification` ➔ `## Child DOX Index`.
- Source code files in governed directories MUST be indexed under `## Key Files`.

### 28. Test Execution Code Coverage Ratcheting (`validate_test_coverage`)

- Istanbul/C8 coverage (`coverage/coverage-final.json`) evaluated against `config.testCoverage.thresholds` (default 80%). Untested files detected as shadow code.

### 29. Universal Dynamic Language Governance

- `config.documentation.language`: Governs repository documentation, Markdown files, DOX (`AGENTS.md`), code comments, commit messages, and release notes (default: `'en'`).
- `config.documentation.chatLanguage`: Governs conversational chat communication and `ask_question` dialogs with the human programmer (default: `'es'`). Never conflate the two.

### 30. Sub-Auditor & Extension Hygiene Governance (`validate_auditor_hygiene`)

- Enforces 17 strict hygiene rules eradicating homebrew utilities, hardcoded configurations, and inefficient I/O:
  1. `auditor-manual-package-json` (`getPackageJson()`)
  2. `auditor-manual-vue-sfc-regex` (`parseVueSfc()`)
  3. `auditor-isolated-ts-ast` (`SharedAstContext`)
  4. `auditor-manual-path-normalization` (`normalizePosixPath` / `toPosixRelative`)
  5. `auditor-direct-console-call` (`BaseAuditor` / `UnifiedTheme`)
  6. `auditor-manual-comment-stripping` (`stripComments` / `stripCommentsAndStrings`)
  7. `auditor-manual-brace-counting` (`scanBalancedDelimiter`)
  8. `auditor-manual-cwe22-path-check` (`isPathInside` / `isInsideRoot`)
  9. `auditor-manual-dir-walk` (`collectFiles` / `collectRepositoryFiles`)
  10. `auditor-manual-path-predicate` (`isTestPath` / `isTestFileForCodeAudit`)
  11. `auditor-manual-timing` (`runSubAuditorSync` / `runSubAuditor`)
  12. `auditor-hardcoded-config` (`hardcodedConfigDetector.ts` - prohibits hardcoded candidate paths, fallback filenames, or local ignore arrays)
  13. `auditor-manual-step-logging` (prohibits `this.context.logStep(...)`)
  14. `auditor-unmeasured-rule` (prohibits `addViolation` outside timing wrappers)
  15. `auditor-redundant-rule-evaluated` (prohibits manual `markRuleEvaluated` before timing wrappers)
  16. `auditor-third-party-tool-contract` (enforces `usesThirdPartyTool` and `thirdPartyToolPolicy`)
  17. `auditor-inefficient-file-scan` (prohibits nested rule-over-files loops and blind wildcards; requires `scanFilesSinglePass` and `WorkspaceFileCache`)

### 31. Grounded Fixability Contract (`fixable: boolean`)

- A finding reports `fixable: true` ONLY when a programmatic automated fixer exists for that exact violation.
- Aggregated via `BaseAuditor.countFixableFindings()` and `BaseAuditor.computeFixableViolations()`.

### 32. Mandatory Safe-Commit Pipeline Protocol

- Manual `git commit`, `git tag`, or `git push` without running `/safe-commit` is strictly forbidden.

> [!NOTE]
> 📘 **Deep Technical Subsystem Specifications**: For detailed rules on Dart Sass collision casing, mixin block ordering, sentinels, by-file grouping, monospace emoji variation selectors, idempotent AGENTS.md auto-repairs, script extensions migration, and Mermaid syntax, see [subsystem-rules-reference.md](./references/subsystem-rules-reference.md).

---

## 📂 Canonical Architecture: Built-in Suites & Host Extensions

### 1. Generic Built-In Suites (`src/suites/`)

Discovered automatically across 6 architectural families:

- **`architecture/`**: AST rules, Fallow intelligence, component styles, HTML-Validate, Stylelint, Vite+ config, Git config, Auditor hygiene, Knip package hygiene, Publint distribution, Type coverage, WCAG accessibility, vector similar-code, test coverage, AGENTS integrity, Vue SFC hygiene, code simplification, SCSS architecture.
- **`domain_data/`**: O(1) data structures, canonical domain catalogs, Domain-Type-First validation.
- **`performance/`**: Web performance optimization, Database query performance.
- **`security/`**: Static security hardening, secret leaks, dependency CVE vulnerabilities.
- **`persistence/`**: Client Web Storage, SQL anti-patterns, Valibot schema and serializer bidirectional parity.
- **`documentation/`**: Documented commands, Markdown links, DOX hierarchy (AGENTS.md), documentation language, markdown lint, Mermaid syntax.

### 2. Host Project Extensions (`scripts/auditors/`) & Configuration

Domain-specific rules unique to host applications reside in `scripts/auditors/` extending `BaseAuditor`.

> [!TIP]
> 📘 **Complete Configuration Reference**: For the complete catalog of all subsystem options and validated example blueprints for Enterprise and Gaming applications, see [blueprints.md](./references/blueprints.md), [audit.config.enterprise.example.ts](./references/audit.config.enterprise.example.ts), and [audit.config.gaming.example.ts](./references/audit.config.gaming.example.ts).

---

## 🛠️ Scaffolding & Code Templates (`assets/templates/`)

Pre-formatted, production-ready templates conforming to all project standards:

- **Line-by-Line Scanner (`FileScanAuditor`)**: [`assets/templates/file_scan_auditor_template.ts`](./assets/templates/file_scan_auditor_template.ts)
- **Composite / Database / Asset Auditor (`BaseAuditor`)**: [`assets/templates/base_auditor_template.ts`](./assets/templates/base_auditor_template.ts)
- **AST-Driven Sub-Auditor (`requiresAst: true` & `SharedAstContext`)**: [`assets/templates/ast_auditor_template.ts`](./assets/templates/ast_auditor_template.ts)
- **Dedicated Vitest Unit Test**: [`assets/templates/auditor_unit_test_template.test.ts`](./assets/templates/auditor_unit_test_template.test.ts)
- **Unified Vite+ Configuration (`vite.config.ts`)**: [`assets/templates/vite_plus_config_template.ts`](./assets/templates/vite_plus_config_template.ts)
- **Vite+ Test Coverage Blueprint**: [`assets/templates/vite_coverage_config_template.ts`](./assets/templates/vite_coverage_config_template.ts)

📘 **Step-by-Step Authoring Walkthrough**: See [sub-auditor-authoring-guide.md](./references/sub-auditor-authoring-guide.md) and [extension-helpers-guide.md](./references/extension-helpers-guide.md).

---

## 🚀 Host Installation, Updates & Governance

`@francogp/auditor` is consumed across host projects as a native GitHub npm package (`github:francogp/auditor#semver:*`).

- **Installation (`npm install -D github:francogp/auditor#semver:* --allow-git=all`)**: Direct npm dependency declaration referencing GitHub repository. The `--allow-git=all` flag is required only for the very first install on npm 12+ (default `allow-git=none` raises `EALLOWGIT`); afterwards the pre-flight bootstrap persists `allow-git=all` in `.npmrc`, so plain `npm update` works without flags. Alternative: create `.npmrc` with `allow-git=all` before installing.
- **Zero-Setup Pre-Flight Auto-Bootstrap (`ensureProjectBootstrapped`)**: Runs transparently on `auditor` or `npm run auditor`. Scaffolds `.auditor/audit.config.ts` on virgin projects, automatically injects missing sub-auditor configuration sections on legacy/updated projects via AST, registers Antigravity skills in `.agents/`, and synchronizes `.gitignore` without relying on npm install scripts. It also persists `allow-git=all` in the host `.npmrc` (`ensureNpmrcAllowGit`), required by npm 12+ for plain `npm update` to resolve `github:francogp/auditor#semver:*`.
- **Conditional Minimum Library Versions (`auditor-dependencies` / `validate_dependency_minimums`)**: The auditor exposes a non-negotiable version floor for shared libraries (`typescript`, `vite-plus`, `vue`, `vue-router`, `pinia`, `gsap`, `valibot`, `sass`, `html-validate`, `markdownlint-cli`, `fallow`, `@playwright/test`) as optional `peerDependencies` of its own `package.json` (SSoT, read by `getAuditorMinimumVersions()`; zero hardcoded versions).
  - **Inspection & Diagnosis Tool**: Always inspect via `auditor-dependencies` (or `npm run auditor:dependencies` / `auditor dependencies`). Use `auditor-dependencies --commands` to output ready-to-run grouped `npm install` and `npm install -D` commands.
  - **Conditional Scope**: Only libraries the host already declares are checked (declared range floor + `package-lock.json` version, `severity: 'error'`, lint-only); absent libraries are ignored.
  - **Prohibition on Ad-Hoc Discovery**: Writing ad-hoc `node -e` scripts or running manual `npm view` queries on arbitrary host dependencies is STRICTLY PROHIBITED; always use `auditor-dependencies`. To raise a floor upstream, edit the auditor `peerDependencies` and release a new `vX.Y.Z` tag.
- **Updates (`auditor-update` / `npm run auditor:update`)**: Pull latest upstream changes strictly via the official native CLI binary `auditor-update` (or `npm run auditor:update`) and verify with `auditor-version -v`. Ad-hoc `node -e` scripts or cloning into `/tmp` are strictly forbidden.
- **Host Extensions Migration (v7+)**: Local extensions in `scripts/auditors/` must pass explicit 7-field `ruleCapabilities: createUniformRuleCapabilities(RULES, { speed: 'light', phase: 'normal', fix: 'none', md: false, ast: false, changedOnly: false, critical: false })` and eliminate `logStep(...)` manual calls. See [sub-auditor-authoring-guide.md](./references/sub-auditor-authoring-guide.md#16-host-extension-migration-quick-guide-v7-modernization).
- **Massive Styles Migration (`scss-strict-values`)**: When upgrading causes large volumes of design token issues, inherit `./node_modules/@francogp/auditor/.stylelintrc.json`, calibrate `maxNestingDepth: 5`, and apply AST codemods in an isolated worktree (`scratch/wt-migration`). See [host-package-governance.md](./references/host-package-governance.md#13-mass-migration-recipes-for-host-upgrades).
- **Deployment Builds (`AUDITOR_ENV=production`)**: In production deployments, Docker containers, or CI pipelines, run `npm run build:deploy` (`auditor-build-deploy`) under `AUDITOR_ENV=production` to cleanly skip Candle CPU vector duplication and test coverage checks without failing builds on uncommitted coverage files.

📘 **Detailed Governance Guide**: See [host-package-governance.md](./references/host-package-governance.md).

---

## 🎯 Remote Project Execution & Cross-Repository Testing (`--project` / `-p`)

Test new suites, fixes, and analyzers against local host applications without intermediate commits:

```bash
npm run auditor -- project="../PokeBorrador"
npm run auditor:lint -- project="../PokeBorrador"
npm run auditor:fix -- project="../PokeBorrador"
npm run auditor:findings -- project="../PokeBorrador"
```

📘 **Detailed Architecture & CLI Guide**: See [cross-repo-testing-guide.md](./references/cross-repo-testing-guide.md).

---

## 🛡️ Testing & Conformance Verification

Every sub-auditor and host extension MUST adhere to the **5-Point Conformance Contract**:

1. Instantiation & Metadata verification (`validateAuditorConstruction(auditor)`).
2. Clean Workspace / Negative Verification (`errors === 0`, `status === 'passed'`).
3. Violation Detection (`errors > 0`, `status === 'failed'`).
4. Warning Verification (where warnings are declared).
5. 100% of declared rule IDs tested.

Hermetic test isolation requires using `testScanFile` + `finishAudit()` for snippets, or passing a temporary sandbox directory via `projectRoot`. Live repository scanning in unit tests is strictly prohibited.

📘 **Comprehensive Testing Guide**: See [auditor-testing-guide.md](./references/auditor-testing-guide.md).

---

## 🔍 Interactive Findings Reporter (`report_findings.ts`) & CLI Tools

- `npm run auditor:findings` / `npm run auditor:errors` / `npm run auditor:warnings` / `npm run auditor:summary`
- `npm run auditor:by-file`: Hierarchical Box-Drawing tree inspection of findings grouped by file and line.
- `npm run auditor:test-coverage`: Test execution code coverage analysis, directory aggregates, and uncovered line ranges.
- `npm run auditor:complexity`: Code complexity hotspots and Fallow refactoring targets.
- `npm run auditor:similar`: Semantic and structural clone detection using Fallow ML vector embeddings.
- `npm run auditor:review`: Graph-grounded architectural review brief for changed code.

📘 **Full CLI Diagnostics Reference**: See [cli-reporters-guide.md](./references/cli-reporters-guide.md) and [test-coverage-guide.md](./references/test-coverage-guide.md).

---

## 🛠️ Master Environment Setup & Update Scripts Governance

Root environment lifecycle scripts belong canonically to `@francogp/auditor`:

- `setup-linux.sh` & `setup-windows.ps1`: Core setup engine locking declared versions (`.node-version` / `package.json`).
- `update-linux.sh` & `update-windows.ps1`: Parameterless wrappers delegating with `--update-version` / `-UpdateVersion`.
- Local patches in host projects are strictly prohibited; fixes must be synchronized upstream via `syncEnvScripts`.

📘 **Setup Extension & Plugin Architecture**: See [setup-extension-guide.md](./references/setup-extension-guide.md).

---

## 📚 References & Host Integration Blueprints Index

| Reference Guide | Description |
|---|---|
| [`references/error-triage-guide.md`](./references/error-triage-guide.md) | Catálogo maestro de triaje y remediación de errores, causas raíz y uso de `auditor guide`. |
| [`references/sub-auditor-authoring-guide.md`](./references/sub-auditor-authoring-guide.md) | Complete sub-auditor authoring guide with boilerplate implementations. |
| [`references/extension-helpers-guide.md`](./references/extension-helpers-guide.md) | Standard framework helpers, base methods, and migration guide for host extensions. |
| [`references/subsystem-rules-reference.md`](./references/subsystem-rules-reference.md) | Detailed technical specifications for Dart Sass casing, sentinels, by-file grouping, and more. |
| [`references/blueprints.md`](./references/blueprints.md) | Configuration blueprints overview and active subsystem settings. |
| [`references/cross-repo-testing-guide.md`](./references/cross-repo-testing-guide.md) | Cross-repository testing guide for `--project` / `-p` CLI execution. |
| [`references/auditor-testing-guide.md`](./references/auditor-testing-guide.md) | 5-point conformance testing contract and hermetic unit testing patterns. |
| [`references/host-package-governance.md`](./references/host-package-governance.md) | Host installation, GitHub npm updates, CI reproducibility, and binary inheritance. |
| [`references/cli-reporters-guide.md`](./references/cli-reporters-guide.md) | Reference manual for interactive findings reporting and CLI diagnostic options. |
| [`references/test-coverage-guide.md`](./references/test-coverage-guide.md) | Test execution code coverage analysis, Istanbul/V8 JSON parsing, and CI gating. |
| [`references/setup-extension-guide.md`](./references/setup-extension-guide.md) | Environment setup script architecture and extension plugins for Linux and Windows. |
| [`references/audit.config.enterprise.example.ts`](./references/audit.config.enterprise.example.ts) | Reference configuration for Enterprise applications (Supabase backend, strict types). |
| [`references/audit.config.gaming.example.ts`](./references/audit.config.gaming.example.ts) | Reference configuration for Gaming applications (hybrid persistence, Web Workers). |
| [`references/v8-migration-guide.md`](./references/v8-migration-guide.md) | Guía de modernización de aplicaciones anfitrionas a la versión 8 de `@francogp/auditor`. |
| [`references/vite-plus-guide.md`](./references/vite-plus-guide.md) | Guía canónica de referencia de Vite+ (`vp`), comandos CLI, tutorial oficial y arquitectura de migración. |
| [`references/extensions/`](./references/extensions/) | Reference blueprints for host extension plugins. |
| [`references/plugins/`](./references/plugins/) | Sample setup plugins for Docker database containers and local SSL certificates. |
