---
name: auditor
description: MANDATORY governance and architectural engine for running, analyzing, inspecting, creating, refactoring, maintaining, administering, and UPDATING ALL static analysis tools, sub-auditors, AST rules, and CLI reporting scripts across the repository. YOU MUST ALWAYS TRIGGER THIS SKILL whenever analyzing audit results, inspecting findings or errors, investigating violations, reading latest_audit.json, debugging audit failures, planning or executing fixes for audit issues, or whenever the user asks to UPDATE OR UPGRADE the auditor package (e.g. 'actualizar auditor', 'actualizame el auditor', 'update auditor', 'actualizar paquete auditor', 'actualizar dependencias de auditor', 'update @francogp/auditor', 'auditor:update', 'npx auditor-update', 'auditor-version', 'version de auditor'), or mentions auditors, audit suites, audit reports, audit tables, Fallow analyzers, report formatting, or modifies ANY file in `scripts/auditors/`, `@francogp/auditor`, `audit.config.ts`, `src/core/auditorBase.ts`, or `src/core/unifiedTheme.ts`, even if they just mention 'auditor', 'auditores', 'auditoría', 'audit', 'fallow', 'reporte', 'tabla', 'resultados en la tabla', 'desglose', 'complejidad', 'duplicados', 'triplicados', 'superclase', 'BaseAuditor', 'report_fallow', 'report_complexity', 'report_findings', or audit scripts ('npm run audit', 'npm run audit:findings', 'npm run audit:complexity', 'npm run audit:fallow:*', 'npm run audit:lint'). When updating the auditor in host projects, agents MUST use 'npx auditor-update' or 'npm run auditor:update' and 'npx auditor-version -v'. STRICTLY FORBIDDEN to use ad-hoc node -e scripts, git clone into /tmp, or git log inside node_modules; ALWAYS use the framework's native CLI tools. Enforces strict OOP inheritance (BaseAuditor, FileScanAuditor), standardized Box-Drawing table rendering via unifiedTheme (80-col limit, zero wrapping, getVisualWidth emoji alignment), dynamic auto-discovery, zero code duplication, zero project hardcoding in @francogp/auditor, and zero ad-hoc console loggers.
---

# Auditor: Architecture, Verification & Governance Engine

This skill defines the immutable standard and architectural contract for creating, administering, refactoring, and maintaining all sub-auditors, reporting scripts, and the `@francogp/auditor` engine across the repository.

Every sub-auditor and reporter is part of a unified static analysis and verification system orchestrated by `npm run audit`.

---

## 🏛️ Core Principles & Tooling Mandates

1. **Strict OOP Inheritance Mandate**:
   - Every sub-auditor MUST extend either `BaseAuditor<TRuleId>` or `FileScanAuditor<TRuleId>` from `@francogp/auditor`.
   - Creating standalone procedural scripts, custom CLI loggers, or ad-hoc result printers is **STRICTLY FORBIDDEN**.
2. **Unified Box-Drawing Table & Terminal Width Mandate (Max 80 Cols, Zero Wrapping)**:
   - ALL terminal tables, whether rendered by sub-auditors (`BaseAuditor`), orchestrators (`audit_full.ts`), or interactive reporters (`report_fallow.ts`, `report_complexity.ts`, `report_findings.ts`), MUST use the shared Box-Drawing utilities from `@francogp/auditor` (`renderBanner`, `renderBoxTable`, `formatStatusBadge`, `getVisualWidth`).
   - Hardcoding custom ASCII banners (`╔════...` exceeding 80 columns) or ad-hoc bulleted lists (`•`) is **STRICTLY FORBIDDEN**.
   - Tables must fit within the standard 80-column terminal width (`TERMINAL_WIDTH = 80`) and use `getVisualWidth()` for padding so emojis (`✅`, `❌`, `⚠️`) do NOT throw column borders out of alignment.
   - **Consolidated Total Row Requirement**: Every multi-row summary or breakdown table displaying numeric findings across categories or rules MUST include a dedicated `footerRows` entry labeled `TOTAL CONSOLIDADO` separated by a standard divider (`├───┼───┤`), providing explicit, mathematically transparent sums for all error and warning columns.
3. **Dynamic Auto-Discovery & Extension Mandate (Zero Hardcoded Lists)**:
   - The master orchestrator (`npm run audit`) and safe-commit diff gatekeeper (`npm run audit:for-commit`) discover all generic suites dynamically via `@francogp/auditor` and host-specific extensions registered in `audit.config.ts`.
   - **Never hardcode an array of auditors or task IDs**. Any generic suite placed in `src/suites/<family>/` or host extension registered in `audit.config.ts` is automatically discovered, categorized, timed, and executed.
4. **Strict Agnostic Engine & Zero Project Hardcoding Mandate**:
   - The `@francogp/auditor` core package MUST remain 100% project-agnostic.
   - It is **STRICTLY FORBIDDEN** to hardcode host-specific directory names (e.g. `external`, `backup_legacy_code`, `third_party`), host domain entity identifiers (e.g. `userId`, `invoiceId`, `tariffId`, `formulaId`), or project-specific test subpaths (`fuzzer`, `simulation`) inside `@francogp/auditor`.
   - All host-specific directories, ignore patterns, entity prefixes, and custom test roots MUST be declared in `audit.config.ts`:
     - `paths.ignoredDirs`: Host-specific third-party or backup folders to skip globally.
     - `paths.ignoredPatterns`: Specific file paths or patterns (e.g. giant SQL migrations or generated data) to skip from standard code scans.
     - `paths.ignoreGlobs`: Glob patterns to exclude.
     - `paths.testFragmentationWhitelist`: Large test files or suites exempt from max test file size limit.
     - `paths.cliRoots`: CLI and tool root directories permitted to emit console output without logging wrappers.
     - `templates.safeTemplateFunctions`: Project-specific functions safe to invoke inside Vue templates.
     - `styles.baseScssFile`: Base SCSS file for global resets and overscroll locks.
     - `bundle.forbiddenUiImports`: Heavy backend modules or drivers barred from UI layers.
     - `animation.customTimerFunctions`: Additional timer function names recognized in UI animations.
     - `constants.ignoredNames`: Constant identifier names ignored during duplicate detection.
     - `constants.exemptMagicNumbers`: Numeric literals exempt from magic numbers validation.
     - `documentation.knownValidAbstractPaths`: Abstract docs paths recognized as valid.
     - `pinia.authorizedMutationFiles`: Files authorized for direct pinia state mutations outside store actions.
     - `domain.fallbackIdPatterns`: Domain-specific catalog ID patterns to disallow fallbacks on.
     - `persistence.allowedDatabaseFiles`: Database generator and schema files exempt from domain type checks.
     - `domain.infraIdWhitelist`: Host-specific infrastructure or external entity IDs (e.g. `cardId`, `slotId`, `assetId`, `serverId`) exempt from domain union rules.
     - `isTestPath(filePath)`: Dynamically checks `testRoots`, `e2eRoots`, and `integrationRoots` from configuration.
     - `isCliPath(filePath)`: Dynamically checks `cliRoots` from configuration.
5. **Mandatory GSAP UI Animation Governance & `gsapSleep` Standard**:
   - GSAP animation enforcement rules (`manualAnimations`, `manualTimersFrontend`, `noLayoutAnimationInGsap`) are strictly mandatory and non-downgradable (`severity: 'error'`).
   - `manualTimersFrontend` scopes timer checks strictly to UI components and views (`.vue` or within `componentsRoots`/`viewsRoots`), barring uncoordinated timers (`setTimeout`, `setInterval`) in UI workflows.
   - `gsapSleep` and `delayedCall` are established, universal framework standards for UI delays and animation timing across all projects, ensuring deterministic test acceleration (scaling with `gsap.globalTimeline.timeScale(100)` during Playwright runs).
   - Additional custom timer functions can be registered dynamically via `config.animation.customTimerFunctions`.
6. **Config-Driven Path Ignored Engine (`isPathIgnored`)**:
   - `isPathIgnored(relPath)` in `auditorBase.ts` unifies `CANONICAL_IGNORE_DIRS` + `config.paths.ignoredDirs` + `config.paths.ignoredPatterns` + `config.paths.ignoreGlobs`.
   - Supports bidirectional leaf and path matching, ensuring both full relative paths and base directory scans in `fs.glob` respect configured ignores.
   - Any sub-auditor discovering or filtering files (`getFilesToAudit`, `FileScanAuditor`, `BaseAuditor`) MUST use `isPathIgnored(p)`.
7. **Concurrent Execution & Completion-Ordered Output Model**:
   - `npm run audit` executes suites concurrently across a pool of background workers (sized to CPU parallelism).
   - Console progress lines (`[ 01/54 | 2% ]`) stream in the order that suites **FINISH** (`coordinator.onTaskComplete`), NOT in the order of task discovery.
   - Heavy suites that take longer (such as full-codebase regex or Fallow intelligence) will complete and log towards the end of the run (e.g. `[ 54/54 | 100% ]`).
8. **Shared AST Engine & Zero Duplicate Parse Mandate (`SharedAstContext`)**:
   - Whenever a sub-auditor performs TypeScript AST analysis or inspects Vue SFC `<script>` blocks, it MUST declare `requiresAst: true` in its constructor configuration (`BaseAuditor` or `FileScanAuditor`).
   - Sub-auditors MUST NEVER instantiate isolated AST parsers or call `ts.createProgram` / `ts.createSourceFile` inside ad-hoc file loops.
   - Sub-auditors consume the centralized `astContext: SharedAstContext` passed to `runAudit(astContext?: SharedAstContext)` or receive the pre-compiled `sourceFile?: ts.SourceFile` directly in `FileScanAuditor.scanFile(relPath, content, sourceFile)`.
   - The master orchestrator (`audit_full.ts`) initializes and preheats `SharedAstContext` **before any tasks run**, providing lazy AST parsing on demand.
9. **Prohibition of Ad-Hoc File Walkers**:
   - Sub-auditors MUST NEVER implement custom recursive directory traversals (`fs.readdir` loops, `getAllFiles`, `getAllVueFiles`, `getFilesRecursively`, `walkSourceFiles`, `walkFiles`, `walkDir`, `collectMarkdownFiles`).
   - File discovery MUST use the centralized, cached, and ignore-aware scanner: `this.context.collectFiles(roots, extensions)` or `collectRepositoryFiles()`.
10. **Unified Dual Output Standard (`StandardAuditResult`)**:
    - **Console (stdout)**: Emits formatted progress lines (`🔍 [X/N]`) followed by clean visual Box-Drawing tables (`[ ✅ PASS ]`, `[ ❌ FAIL ]`, `[ ⚠️ WARN ]`), runtimes in ms, and domain metrics via `@francogp/auditor`.
    - **Scratch Disk (`scratch/audits/`)**: ALWAYS saves 100% complete structured JSON conforming to `StandardAuditResult` to `scratch/audits/<family>/<id>.json` (and `scratch/audits/latest_audit.json` for global runs).
11. **Zero Double-Reporting Anti-Pattern**:
    - NEVER pass string arrays (`errors`, `warnings`) to `context.finish(...)` if violations were already registered with `this.addViolation(...)` or `context.addError()`. Doing so causes duplicate violation listings in the terminal summary table.
12. **Zero Runtime Data Auto-Heal in Tooling**:
    - Auditors verify structural and data integrity. They must never silently patch, mock, or auto-heal corrupt data or invalid structures. Failures must be detected loudly with clear, actionable context.
13. **Mandatory Modular Identity & Human-Friendly Description Mandate (Package + Pure Message, Max 50 chars)**:
    - Every sub-auditor MUST declare via inheritance:
      - `id: string`: Unique canonical auditor ID (e.g. `validate_my_feature`).
      - `name: string`: Formal suite name (e.g. `My Feature Validator`).
      - `packageName: string`: The mandatory scope or technology package of the sub-auditor (e.g. `'ESLint'`, `'TypeScript'`, `'Config'`, `'Estilos'`, `'DOX'`, `'Arquitectura'`).
      - `description: string`: Human-friendly Spanish explanation (strictly max 60 characters, single line, no `\n`) of what the suite verifies (`MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH = 60`).
      - `ruleDescriptions: Record<TRuleId, string>`: Mandatory PURE human-friendly Spanish explanation for 100% of declared rule IDs. NEVER hardcode the package prefix inside rule descriptions (e.g. use `'Error de sintaxis o regla'`, NEVER `'ESLint: Error de sintaxis o regla'`).
    - **Dynamic Composition & 50-Character Box-Drawing Constraint**:
      - `BaseAuditor.formatRuleDescription(ruleId, rawDescription)` dynamically joins both parts strictly as `${packageName}: ${ruleDescription}`.
      - The composed description `${packageName}: ${ruleDescription}` MUST be `<= 50` characters (`MAX_AUDITOR_DESCRIPTION_LENGTH = 50`) and contain zero newlines so that in 80-column terminal tables (column width 52), every row displays cleanly without any `...` truncation.
      - If a composed rule description exceeds 50 characters, `BaseAuditor` throws an explicit runtime `Error` during instantiation detailing the violation. Silent truncation or prefix stripping is **STRICTLY FORBIDDEN**.
    - **Live Terminal Badge Standardization**:
      - When findings = 0: Silent, clean output without unnecessary suffixes (no badges, no "(0 encontradas)", no "(0 incidencias)").
      - When findings > 0: Formatted strictly as `(🐛 ${count})`.
    - Raw unexplained slugs without human context in console output are strictly forbidden.
14. **Absolute Prohibition of Homebrew SLOC Counters Mandate**:
    - Sub-auditors must NEVER implement manual line-counting loops, regex line filters, or ad-hoc SLOC checkers (`checkSloc`, line counting loops).
    - Fallow is the Single Source of Truth (SSoT) for all AST metrics, cognitive and cyclomatic complexity, function unit size, maintainability, dead code, and duplication detection across the codebase.
15. **Human-Friendly Descriptions & Category Breakdown Mandate (Zero Code Slugs & Zero Family Grouping)**:
    - The master audit orchestrator (`npm run audit`) and warnings reporter (`npm run audit:warnings`) MUST render results desglosados strictly by category/rule in an official Box-Drawing table.
    - The table MUST display **100% human-friendly Spanish descriptions** (`finding.ruleDescription` or `suite.description`) defined via inheritance in `BaseAuditor` (`ruleDescriptions: Record<TRuleId, string>`). Displaying raw code slugs, identifiers, or technical keys (e.g. displaying `icon-missing-asset` instead of `'Ícono no encontrado en catálogo de assets'`) is **STRICTLY FORBIDDEN**.
    - Following the table, they MUST output ONLY an illustrative sample of the last 5 errors (`❌ Muestra de errores detectados (últimos 5 de N)`).
    - Listing the full set of warnings or dumping all errors in console output is **STRICTLY FORBIDDEN**.
    - Grouping console results under opaque "FAMILIAS" headers is permanently eradicated. Full machine-readable findings reside in `scratch/audits/latest_audit.json`.
16. **Single Source of Truth Directory Ignore Mandate (`CANONICAL_IGNORE_DIRS` + `getEffectiveIgnoreDirs`)**:
    - Sub-auditors and maintenance scripts MUST NEVER declare local ignore sets (`const IGNORE_DIRS`, `const SKIP_DIRS`, `const SKIP_NAMES`, `const SKIP_SUBDIRECTORIES`).
    - Directory ignores are strictly governed by `CANONICAL_IGNORE_DIRS` in `@francogp/auditor`, combined with `getEffectiveIgnoreDirs()` which dynamically includes `config.paths.ignoredDirs`.
    - Documentation auditors that need to inspect documentation trees must configure `unignoreDirs: ['docs', '.agents']` instead of maintaining custom walkers.
    - Sub-auditors supporting unit-test sandboxes (`tempDir`) must forward `projectRoot: effectiveRoot` via `AuditorOptions` into `super({...})` to guarantee isolation from the live project repository.
17. **Mandatory Audit Metadata & Anti-Staleness Header Mandate (`AuditRunMetadata`)**:
    - The master orchestrator (`src/cli/audit_full.ts`) MUST embed an explicit `meta: AuditRunMetadata` header into `scratch/audits/latest_audit.json` and `scratch/audits/latest_summary.json` containing: `isFullAudit`, `runMode`, `preset`, `timestamp`, `totalDiscoveredSuites`, `executedSuiteCount`, `executedSuites`, and `omittedSuites`.
    - Partial audit runs (such as `npm run audit:md`, `preset=lint`, or single suite executions) update `scratch/audits/latest_audit.json` with `isFullAudit: false` and populate `omittedSuites`.
    - **Strict 5-Minute Staleness Policy (`MAX_AUDIT_STALENESS_MS = 5 * 60 * 1000`)**: If more than 5 minutes have elapsed since `meta.timestamp`, the audit file is considered OBSOLETE. Any tool, script, or AI agent reading `latest_audit.json` MUST reject it with Exit Code 1, forcing a fresh run (`npm run audit`) to prevent decisions based on stale code data.
    - **Zero Tolerated Misleading Reports**: Downstream scripts consuming audit results (`report_complexity.ts`, `report_fallow.ts`, `report_findings.ts`) MUST validate this metadata. If a required suite was omitted, if the report is older than 5 minutes, or if a global report is requested on a partial run, the script MUST fail fast with Exit Code 1 (`assertAuditorExecuted(...)`).
18. **Fallow 100% Error Severity & Zero-Warning Mandate**:
    - Sub-auditors, architecture runners, and plugins integrating Fallow (such as `audit_project.ts` or standalone Fallow inspectors) MUST map ALL Fallow findings to `severity: 'error'`.
    - Downgrading any Fallow finding to `severity: 'warning'` to mask technical debt or bypass audit gates is **STRICTLY PROHIBITED**.
19. **Static Security Single Source of Truth (Fallow CWE vs ESLint Syntax)**:
    - Codebase vulnerability analysis (CWE) is strictly and exclusively delegated to **Fallow** (`fallow security`).
    - Using `eslint-plugin-security` in ESLint configurations is **STRICTLY PROHIBITED**. ESLint must focus exclusively on ECMAScript/TypeScript syntax correctness, style, and Vue SFC integrity. Sub-auditors analyzing AST or traversing files are legitimate development operations and must never be encumbered by blunt regex-based linter false positives.
20. **Standard Living Specification Engines Over Handcrafted Regex Mandate**:
    - When validating web standards, markup hygiene, accessibility, or obsolete HTML5 elements/attributes, the auditor framework and linters MUST NOT implement handcrafted manual regular expressions or arbitrary AST pattern lists (e.g. in ESLint).
    - Sub-auditors MUST delegate to authoritative, actively maintained specification engines (`html-validate` with `html-validate-vue`) that embody the W3C / WHATWG Living Standard, bridging their output into canonical `AuditFinding[]` objects.
21. **Child Process Stream Isolation & Ephemeral Scratch Output Mandate**:
    - Sub-auditors invoking external CLI tools or linters (`html-validate`, `vue-tsc`, `fallow`) via child processes (`spawnSync`) MUST NEVER rely on piping large JSON payloads across standard output (`stdout`), as Node.js process exits can truncate unbuffered output streams.
    - Tools supporting direct file output MUST write raw JSON to an isolated ephemeral file in `scratch/audits/<family>/` (e.g. `-f json=scratch/audits/architecture/html-validate-raw.json`) and parse it cleanly from disk.
22. **Zero Hardcoded Bundle Limits & Pure Configuration Budgets (`validate_bundle_budget`)**:
    - The core engine MUST NEVER hardcode fallback chunk size thresholds (`MAX_CLIENT_CHUNK_WARN_BYTES`, `MAX_CLIENT_CHUNK_ERROR_BYTES`) or ad-hoc file budgets.
    - All bundle chunk size validation and threshold evaluation MUST resolve dynamically and strictly from `audit.config.ts` (`config.bundle.budgets`, `config.bundle.maxClientChunkErrorBytes`, `config.bundle.maxClientChunkWarnBytes`). If unconfigured, no arbitrary framework size penalty is applied.
23. **Static Security Gating & CLI Non-Production Classification (`AuditSecurityConfig`)**:
    - Static security scanning (Fallow CWE sinks) is governed by `config.security.enabled`. CLI tools and maintenance scripts identified by `isCliPath()` are treated as non-production environments with legitimate access to synchronous filesystem and child process operations under Node.js 26 permissions.
24. **Canonical Non-Fatal Catch Annotation Contract (`// catch-ok:`)**:
    - Any intentional, non-fatal catch block across the framework and host projects must declare `// catch-ok: <justification>` within its scope to pass `validate_error_suppression`.
25. **Centralized CLI Entrypoint Verification (`isMainModule`)**:
    - CLI tools and executable scripts MUST use the centralized `isMainModule(import.meta.url)` helper from `@francogp/auditor` to check for direct CLI invocation.
26. **Prohibition of Ad-Hoc Audit Result Parsing & Mandatory Native CLI Reporters Mandate**:
    - AI agents and developers MUST NEVER write or execute ad-hoc inline node scripts (`node -e "..."`), python scripts, or bash one-liners to read, inspect, or summarize `scratch/audits/latest_audit.json`.
    - All audit result inspections, category breakdowns, severity filtering, and complexity hotspot analyses MUST be conducted strictly through the framework's native CLI tools:
      - `npm run audit`: Global execution and consolidated Box-Drawing table.
      - `npm run audit:findings` / `npm run audit:errors` / `npm run audit:warnings` / `npm run audit:summary` / `npm run audit:files`: Filtering and breakdown of findings.
      - `npm run audit:complexity`: Cognitive/cyclomatic complexity hotspots and Fallow refactoring targets.
      - `npm run audit:similar`: Semantic and structural clone detection using Fallow ML vector embeddings in Box-Drawing tables.
      - `npm run audit:review`: Graph-grounded architectural review brief for changed code using Fallow code review graphs.
      - `npm run audit:fallow:dupes` / `npm run audit:fallow:triplets` / `npm run audit:fallow:security` / `npm run audit:fallow:dead-code`: Fallow intelligence deep dives.
    - If `report_findings` warns that `latest_audit.json` is stale (>5 min), the agent MUST immediately execute `npm run audit` to produce a fresh, valid report before inspecting findings. Bypassing the anti-staleness check with homebrew scripts is strictly forbidden.
    - **Missing Tool Mandate (Solicitud y Creación de Nuevas Herramientas)**: If a specific inspection, filtering, or reporting capability is missing or not provided by existing native tools, AI agents and developers MUST NOT create ad-hoc scripts or one-off terminal hacks. Instead, they MUST explicitly propose and create a new official native CLI tool in `src/cli/` (or extend an existing reporter), registering its canonical script in `package.json` with full Box-Drawing theme support (`unifiedTheme.ts`), 80-column limits, and permission flags.
27. **Fallow Refactoring Targets & Workspace Diagnostics Governance (`config.fallow`)**:
    - Fallow provides hotspot refactoring targets and project workspace diagnostics.
    - `config.fallow.enforceTargets`: When set to `true`, hotspot refactoring targets meeting `maxTargetPriority` (`'critical'`, `'high'`, `'all'`) are promoted to blocking `severity: 'error'` findings under rule `fallow-refactoring-targets`. When `false` (default), they remain purely advisory.
    - Workspace-level diagnostics (e.g. invalid configurations or structural issues) are validated under `validate_fallow_config` as `fallow-workspace-diagnostic`.
28. **Semantic Vector Code Duplication Governance & Fast-Preset Bypass (`validate_similar_code`)**:
    - Vector embeddings similarity detection (`fallow similar-code`) identifies semantic duplicates across files even with different syntax or function signatures.
    - **Fast Preset Isolation**: Vector analysis MUST NEVER execute under fast presets (`preset=lint`, `preset=md`, `audit:for-commit`). It runs exclusively in full audits (`npm run audit`) or via the dedicated CLI tool (`npm run audit:similar`).
    - **Surgical Sensitivity (`threshold: 0.95`, `ignoreSameFile: true`)**: Core default threshold of `0.95` combined with intra-file exclusion eliminates false positives between synchronous/asynchronous variants or polymorphic class methods, isolating true cross-module duplication.
    - **Hardware Runtime & Multi-Threading**: Fallow runs the local companion model (`jina-embeddings-v2-base-code`) via Hugging Face Candle in **CPU-only mode** (no GPU/CUDA support). Parallelism is accelerated across CPU cores via `--threads ${os.availableParallelism()}`.
    - **Vector Cache Architecture & Windows OS Error 3 Pre-Creation**: Fallow persists model weights and vector embeddings in the standard OS user cache directory: `%LOCALAPPDATA%\fallow\similar-code` on Windows (`~/.cache/fallow/similar-code` on Linux). Subdirectories `models/` and `vectors/` MUST be pre-created prior to execution to avoid Windows `os error 3: The system cannot find the path specified`. With cached vectors, audit time drops from ~230s down to ~2s.
    - **Automatic Model Initialization & Warning Banner Fallback**: If the local model is uninitialized, the suite attempts automatic setup via `fallow similar-code setup --local --yes`. If the automatic setup fails, the auditor displays a prominent Box-Drawing warning banner with the manual installation command (`npx fallow similar-code setup --local --yes`), recording `fallow-similar-code-failed` as a non-fatal warning (`severity: 'warning'`) so other suites remain unblocked.
    - **GitHub Pages & CI Deployments Bypass (`--skip-similar`)**: In CI pipelines, containerized environments, or GitHub Pages builds where external AI model downloads or heavy vector embeddings are undesirable, pass `--skip-similar`, `--no-similar`, or set `AUDIT_SKIP_SIMILAR=1` to cleanly omit vector duplication checks with zero violations.
    - **Upstream Specification**: See [Fallow Similar Code Analysis Specification](https://git.mitgai.net/fallow-rs/fallow/blob/main/docs/similar-code-analysis.md).
29. **Universal Ephemeral Scratch (`scratch/`) & Build Output (`dist/`) Isolation Mandate**:
    - **`scratch/` (Mandatory for all drafts & ephemeral data)**: Universal, mandatory directory across ALL projects and repositories for any and all ephemeral files: scratch scripts, AI temporary investigation notes, experimental files, testing dumps, raw json outputs (`scratch/audits/`), and intermediate CLI caches.
      - Every project MUST declare `scratch/` in `.gitignore`.
      - Committing or placing drafts, temporary files, or scratch scripts in `src/`, root, or non-scratch paths (such as `tmp/`, `.tmp/`, `temp/`, `test.js`, `dummy.ts`) is strictly forbidden and actively blocked by `validate_ephemeral_storage_isolation`.
    - **`dist/` (Mandatory for all compilations & production builds)**: Universal, mandatory directory across ALL projects for all compiled outputs, production bundles, generated JS/CSS assets (`dist/assets/`), and packaged library outputs.
      - Every project MUST declare `dist/` in `.gitignore`.
      - Production build artifacts, source maps, and bundle chunks must reside strictly within `dist/` and must never pollute source code trees.
30. **Mandatory Explicit Configuration & Zero Silent Skips**:
    - Host projects using the auditor MUST explicitly declare in `audit.config.ts` whether each subsystem is active (with valid parameters) or ignored (e.g. `bundle: { enabled: false }`, `styles: { zLayersEnabled: false }`, `persistence: { engine: 'none' }`).
    - Sub-auditors MUST NEVER silently bypass checks due to missing files or missing configuration; if a subsystem is unconfigured, the auditor MUST fail with an explicit configuration error.
31. **Native PostCSS AST Style Analysis & Pure Execution (`validate_css_duplicates`, `cssAnalyzer`)**:
    - All stylesheet and component style hygiene, duplicate class rules, similar selectors, and unvariabled tokens must be analyzed strictly through pure TypeScript AST engines via PostCSS and `postcss-scss` in memory. Sub-auditors MUST NOT rely on unmaintained, platform-dependent external Go binaries (such as `css-checker-kit`), preventing Smart App Control blocks, `ignore-scripts` install crashes, and OS-level execution failures.
32. **Data Catalog Complexity Exemption (`paths.dataRoots`)**:
    - Files inside `paths.dataRoots` (constant catalogs and tabular mini-databases) are exempted from function complexity and LOC alerts in `audit_project.ts` via `isComplexityExemptPath`, while preserving 100% of domain type checks, O(1) structures, and Fallow dead-code analysis.
33. **Canonical Tool Package Fallow Governance (`.fallowrc.json`)**:
    - Tool packages distributing standalone CLI tools and AI skills must maintain a root `.fallowrc.json` declaring `entry` points, `ignorePatterns` (`skills/**`, `.agents/**`, `scratch/**`, `dist/**`, `tests/**`), and `ignoreDependencies` (for peer/CLI tools such as `fallow`, `html-validate`, `html-validate-vue`, `markdownlint-cli`, `postcss`, `postcss-scss`, `rollup-plugin-visualizer`, `typescript`). This guarantees unskewed maintainability analysis (>= 90 score) while preserving strict zero-tolerance fallow gating.
34. **Zero Live Host Mutation & Hermetic Sandbox Verification**:
    - Verification of `@francogp/auditor` across consumer host projects MUST be conducted exclusively in isolated ephemeral git worktrees (e.g. `/tmp/<project>-sandbox`) with deliberate fault injection, guaranteeing zero mutation or drift in the real host repositories.
35. **Mandatory English for All Repository Files, Skills, Documentation & Examples**:
    - All files inside the repository (source code, TypeScript definitions, tests, skills under `.agents/skills/**`, references under `.agents/skills/*/references/**`, documentation, blueprints, configuration examples, and `.md` files) MUST ALWAYS be written strictly and exclusively in English with zero language mixing. Writing any skill, skill documentation, reference guide, or code example in Spanish or mixing languages is strictly prohibited.
    - *Sole Exception: Interactive terminal tables and human-readable CLI audit rule descriptions (`ruleDescriptions` in sub-auditors) are declared in Spanish by deliberate UX design for the local developer console.*
36. **Mandatory Safe-Commit Protocol & Absolute Prohibition on Manual Git Commit/Push**:
    - Executing manual `git commit`, `git tag`, or `git push` directly in the shell without running the certified `/safe-commit` workflow is STRICTLY FORBIDDEN across the entire repository. Every change, bug fix, release, or version bump MUST execute all phases of `/safe-commit` sequentially.
    - In Phase 1 (Step 1.4), agents MUST explicitly analyze version diffs and consult the user via `ask_question` regarding the recommended SemVer bump (`major`, `minor`, `patch`) or maintaining the current version, NEVER unilaterally bumping versions or tagging releases without prior explicit user approval.
37. **Strict Single Build & Atomic Tagging Mandate**:
    - In `/safe-commit`, version bump decisions occur in Phase 1 (Step 1.4) to guarantee that Phase 2 compiles the target version exactly once (`Strict Single Build Mandate`). When bumped, annotated Git tags (`v<version>`) are created atomically with the commit and pushed with `--follow-tags`.
38. **Universal Standard Build Script Mandate (`npm run build`)**:
    - The `@francogp/auditor` engine and consumer projects MUST strictly use the universal standard npm convention `npm run build` (`"build": "tsc -p tsconfig.build.json && node --experimental-strip-types src/cli/make_executable.ts"`) for compiling and emitting distribution artifacts into `dist/`. Using platform-specific shell commands like `chmod` that fail on Windows is strictly forbidden; executable permissions are set via cross-platform Node.js filesystem APIs. Inventing arbitrary non-standard script names (such as `compile` or `build:dist`) is strictly forbidden across the framework. Compiling distribution artifacts and executing architectural verification suites MUST remain strictly decoupled into distinct commands (`npm run build` vs `npm run audit`).
39. **Public Package Anonymity & Zero Host Leakage Mandate**:
    - Standalone tooling packages, exported AI skills (`.agents/skills/**`), reference blueprints (`.agents/skills/*/references/**`), test fixtures, and public documentation MUST NEVER mention or leak private host project names, repository slugs, database schemas, or proprietary business domains. Reference blueprints and examples MUST strictly use generic, domain-neutral archetypes (e.g. `enterprise.example.ts`, `gaming.example.ts`, `app-postgres`, `app_db`, `test@example.com`).
40. **Host AGENTS.md Independence Mandate**:
    - `@francogp/auditor` distributes AI skills (`.agents/skills/*`), CLI binaries, and setup scripts, but MUST NEVER distribute, generate, or force a global `AGENTS.md` onto external consumer host projects. Consumer host projects maintain their own independent, domain-specific `AGENTS.md` hierarchy. The root `AGENTS.md` in `@francogp/auditor` governs exclusively the core auditor engine repository.

---

## 📂 Canonical Architecture: Built-in Suites & Host Extensions

### 1. Generic Built-In Suites (`src/suites/`)
37 domain-agnostic suites discovered automatically across 4 canonical families:
- `architecture/` (29 suites + shared rule module `audit_rules.ts`): AST rules, Fallow intelligence, Z-Index, CSS orphans, emoji typography, HTML5 standards validation (`validate_html_validate`), vector semantic similarity (`validate_similar_code`), Vue SFC hygiene, Pinia reactivity, reactive leaks and purity
- `domain_data/` (2 suites): O(1) data structures, Domain-type-first validation (`validate_domain_types.ts`, parameterized via `audit.config.ts`)
- `persistence/` (1 suite): SQL anti-patterns (`validate_sql_anti_patterns.ts`, with hybrid persistence support)
- `documentation/` (5 suites): Markdown relative links, DOX hierarchy (AGENTS.md), syntax standards, markdown lint, code references

### 2. Host Project Extensions (`scripts/auditors/`) & `audit.config.ts`
All domain-specific rules unique to host applications (e.g. specialized domain entities, state machines, business workflows, custom SQLite schemas) reside in `scripts/auditors/` (or designated project folders) and extend `BaseAuditor` imported from `@francogp/auditor`.

Configured at root in `audit.config.ts`:
- `paths.migrationsDir`: `'database/migrations'`
- `paths.testFilePatterns`: `['.spec.', '.test.', '.simulation.']` (Dynamic test file recognition)
- `paths.testFragmentationWhitelist`: `['src/large-feature.ts']` (Files exempt from test fragmentation limits)
- `paths.e2eRoots`: `['tests/e2e']`
- `paths.cliRoots`: `['src/cli']` (CLI entrypoints exempt from console logger wrapper)
- `paths.ignoredDirs`: `['external', 'backup_legacy_code', 'fixtures']`
- `paths.ignoredPatterns`: `['src/generated/migrations_data.ts']`
- `persistence.engine`: `'hybrid' | 'supabase' | 'sqlite' | 'postgres' | 'none'`
- `persistence.prohibitedTemplateIdentifiers`: `['supabase', 'db', 'sqlite']` (Identifiers barred from Vue `<template>`)
- `persistence.authorizedSaveFiles`: `['src/logic/utils/saveCoordinator.ts']` (Files authorized for save keys)
- `persistence.allowedHosts`: `['supabase.co', 'localhost', '127.0.0.1']` (SSRF allowlist for `safeFetch`)
- `styles.zLayers`: Direct numeric scale `{ BASE: 0, MODAL: 11000, ... }`
- `styles.zLayersTsFile`: `'src/logic/constants/visuals.ts'` (TypeScript Z_LAYERS definition)
- `styles.zLayersScssFile`: `'src/styles/_base.scss'` (SCSS variables mapping)
- `styles.baseScssFile`: `'src/styles/_base.scss'` (Base SCSS file for global resets and overscroll locks)
- `styles.lineHeightOverlapCheck`: `boolean` (Anti-zero line-height verification)
- `bundle.maxClientChunkWarnBytes`: Max client chunk size warning threshold in bytes (e.g. `1200 * 1024`)
- `bundle.maxClientChunkErrorBytes`: Max client chunk size error threshold in bytes (e.g. `2000 * 1024`)
- `bundle.budgets`: Per-chunk regex pattern matchers and budget limits (`[{ pattern: 'vendor', maxBytes: 2000 * 1024 }]`)
- `bundle.exemptChunkPrefixes`: `['worker-vendor-sim', 'worker-game-data']` (Exempt client chunks)
- `bundle.forbiddenUiImports`: `[{ module: 'xlsx', reason: 'Parser pesado' }]` (Heavy modules barred in UI)
- `security.enabled`: `boolean` (Enables or disables static Fallow CWE security analysis)
- `templates.safeTemplateFunctions`: `['formatMoney', 'translate']` (Functions safe in templates)
- `templates.forbiddenTemplateCallPatterns`: Heavy classes/helpers barred from template calls
- `animation.customTimerFunctions`: `['requestDelayedFrame']` (Custom timer functions recognized in UI)
- `constants.ignoredNames`: `['TAX_DEFAULT_ROUNDING']` (Constants ignored in duplicate detection)
- `constants.allowedNumericPrefixes`: `['GEN_', 'ISO_', 'BASE_']` (Prefixes allowed for numeric constants)
- `constants.exemptMagicNumbers`: `[21, 10.5, 27]` (Numeric literals exempt from magic numbers check)
- `documentation.knownValidAbstractPaths`: `['@docs/architecture/fiscal-engine.md']` (Abstract valid docs paths)
- `pinia.authorizedMutationFiles`: `['src/logic/coordinators/sessionCoordinator.ts']` (Authorized store mutation files)
- `domain.caseNormalizationExemptTokens`: `['iso', 'vat', 'cuit', 'dni', ...]` (Tokens exempt from lowercasing)
- `domain.allowedStoreSetterPrefixes`: `['set', 'update', 'equip', 'assign']` (Pinia store action prefixes)
- `domain.allowedNumericConstantPrefixes`: `['GEN_', 'ISO_', 'UTF_8', 'RGB_', ...]` (Constant naming exceptions)
- `domain.finiteDomainTypes`: `['UserId', 'InvoiceId', 'RoleId', 'CustomerId', ...]`
- `domain.fallbackIdPatterns`: `['userId', 'invoiceId', 'roleId', 'customerId', ...]`
- `fallow.enabled`: `boolean` (Enables Fallow static intelligence and deep analysis)
- `fallow.enforceTargets`: `boolean` (When true, promotes refactoring targets to blocking errors)
- `fallow.maxTargetPriority`: `'critical' | 'high' | 'all'` (Priority filter threshold for refactoring targets)
- `fallow.similarCode.enabled`: `boolean` (Enables vector semantic duplication detection in full audit)
- `fallow.similarCode.threshold`: `number` (Similarity threshold, default `0.95`)
- `fallow.similarCode.ignoreSameFile`: `boolean` (Excludes intra-file candidate pairs, default `true`)
- `extensions`: [Host project custom plugins in `scripts/auditors/`]

### File Naming Conventions:
- **Generic Suite**: `src/suites/<family>/validate_<topic>.ts`
- **Host Extension**: `scripts/auditors/<family>/validate_<topic>.ts` (registered in `audit.config.ts`).
- **Private Helper**: `_<helper_name>.ts` (ignored by discovery).
- **Interactive Developer Reporter**: `src/cli/report_<topic>.ts` (e.g. `report_fallow.ts`, `report_complexity.ts`).

---

## 🛠️ Step-by-Step Guide: How to Create a New Sub-Auditor

### 📦 Architecture & Templates (`assets/templates/`)
Pre-formatted, production-ready templates conforming to all project standards are bundled directly within this skill for instant scaffolding:
- **Line-by-Line Scanner (`FileScanAuditor`)**: [`assets/templates/file_scan_auditor_template.ts`](./assets/templates/file_scan_auditor_template.ts) — Best for regex patterns, forbidden tokens, or syntax rules across file lines.
- **Composite / Database / Asset Auditor (`BaseAuditor`)**: [`assets/templates/base_auditor_template.ts`](./assets/templates/base_auditor_template.ts) — Best for multi-source comparisons, database schema validations, or dataset integrity checks.
- **AST-Driven Sub-Auditor (`requiresAst: true` & `SharedAstContext`)**: [`assets/templates/ast_auditor_template.ts`](./assets/templates/ast_auditor_template.ts) — Best for TypeScript AST analysis without redundant compiler overhead.
- **Dedicated Vitest Unit Test**: [`assets/templates/auditor_unit_test_template.test.ts`](./assets/templates/auditor_unit_test_template.test.ts) — Mandatory companion unit test covering 100% of rule IDs and clean execution.
- **Recommended Host NPM Scripts Template (`package.json`)**: [`assets/templates/recommended_package_scripts_template.json`](./assets/templates/recommended_package_scripts_template.json) — Complete canonical `scripts` block for consumer projects, exposing all 25+ auditor tools, CLI reporters, and quality gates.

📘 **Comprehensive Walkthrough**: See [`references/sub-auditor-authoring-guide.md`](./references/sub-auditor-authoring-guide.md) for complete step-by-step code implementations of Options A, B, and C.

---

## 🚀 Host Installation, Updates & Governance (`@francogp/auditor`)

`@francogp/auditor` is consumed across host projects as a native GitHub npm package (`github:francogp/auditor`).

- **Auditor Updates (`npx auditor-update` / `npm run auditor:update`)**: Pull latest upstream changes strictly via the official native CLI binary `npx auditor-update` (or `npm run auditor:update`). This hermetically updates the package, checks the stamped build version (`npx auditor-version -v`), and renders a verified Box-Drawing summary.
  - **Absolute Prohibition on Ad-Hoc Scripts & Cloning**: Running `node -e` scripts, `git clone` into `/tmp`, searching `git log` inside `node_modules`, or using manual ad-hoc scripts is STRICTLY FORBIDDEN. Bundled skills (`.agents/skills/*`) and agent rules (`AGENTS.md`) are updated automatically via host `.agents/plugins.json` and `.agents/skills.json` pointing to `node_modules/@francogp/auditor`.
- **Hermetic CI**: Use standard `npm ci` for deterministic, zero-drift pipeline execution.
- **Binary Inheritance**: Host `package.json` scripts map directly to exported binaries (`auditor`, `auditor-commit`, `auditor-findings`, etc.) without duplicating framework scripts.
- **Deploy Builds & CI Pipelines (`--skip-similar`)**: When host applications run the auditor during `build` (e.g. `"build": "auditor --skip-similar && vite build"`) or in GitHub Pages workflows, they MUST use `--skip-similar` (or `AUDIT_SKIP_SIMILAR=1`). This ignores the Fallow similar-code AI embedding suite without altering `audit.config.ts`, avoiding heavy model downloads and timeouts while executing 100% of architectural, lint, type, and style suites.

📘 **Detailed Guide & Canonical Config**: See [host-package-governance.md](references/host-package-governance.md) for full instructions, CI setups, and `package.json` blueprint.

---

## 🛡️ Testing & Conformance Verification (Zero Untested Rules & Warnings Mandate)

Every sub-auditor (generic suites in `src/suites/` and host extension plugins in `scripts/auditors/`) MUST adhere strictly to the **Zero Untested Rules & Warnings Mandate**:

1. **Dedicated Exhaustive Unit Test File**:
   - Generic suites: `tests/<suite_filename>.test.ts`
   - Host extension plugins: `tests/node/auditors/<suite_filename>.test.ts`
2. **100% RuleId Coverage (Every Error and Every Warning)**:
   - For **every single declared `ruleId`** in `ruleIds` (and every Fallow category/metric mapped by the auditor), there MUST be at least one dedicated test case with a dirty fixture triggering that exact rule.
   - The test MUST explicitly assert:
     - `expect(finding.ruleId).toBe('<exact-rule-id>')`
     - `expect(finding.severity).toBe('<error|warning>')`
     - The violation is captured in `result.findings` with appropriate file, line, and context.
3. **Clean Workspace / Negative Verification (Mandatory Error Severity)**:
   - Every test suite (both core suites in `tests/` and host extension plugins in `tests/node/auditors/`) MUST include a test asserting that valid, compliant code produces **zero errors and passed status** (`expect(result.summary.errors).toBe(0)`, `expect(result.status).toBe('passed')`).
   - The rule `missing-clean-auditor-test` is classified strictly as `severity: 'error'`. Omission of clean path verification fails the audit build.
4. **Hermetic Test Isolation via `finishAudit()` or Sandbox Directories**:
   - Sub-auditor unit tests MUST NEVER execute full workspace scans (`auditor.execute()`) directly on `process.cwd()` without isolation.
   - When unit testing individual file-scanning logic, tests MUST pass synthetic code to `testScanFile(...)` and invoke `await auditor.finishAudit()`.
   - When testing full filesystem traversals, tests MUST instantiate the auditor with a temporary sandbox directory via `projectRoot` (`new MyAuditor({ projectRoot: tempDir })`). Scanning the live host repository in unit tests leaks application code defects into testing infrastructure.
5. **Escape Hatch & Suppression Verification**:
   - If the auditor supports suppression comments (e.g. `// <rule>-ok:`, `// domain-ok:`, `// script-ok:`) or configuration ignore patterns, the test suite MUST verify that valid suppressions prevent false positives and are not reported as violations.
6. **Continuous Meta-Conformance Enforcement**:
   - The meta-test `tests/auditor_architecture_conformance.test.ts` continuously checks that **100% of discovered suites have a dedicated unit test file**. No sub-auditor or plugin may be merged without its companion test suite.

---

## 🔍 Interactive Findings Reporter (`report_findings.ts`) & CLI Diagnostics

The findings reporter (`src/cli/report_findings.ts`) is the official SSoT diagnostic tool for querying, grouping, and inspecting audit results without running arbitrary terminal scripts or raw grep commands:
- **CLI Options & Filters**: Supports `severity=...`, `category=...`, `dir=...`, `scope=...`, `search=...`, and directory breakdowns (`breakdown`).
- **Official NPM Scripts**: `npm run audit:findings`, `npm run audit:errors`, `npm run audit:warnings`, `npm run audit:summary`, `npm run audit:similar`, `npm run audit:review`.
- **Proactive Tool Evolution Mandate**: Proactively add missing capabilities directly into official native tools (`report_findings.ts`) rather than using disposable terminal one-liners (`node -e`).
- **Full Reference**: Detailed flag tables and usage examples are maintained in [`references/cli-reporters-guide.md`](./references/cli-reporters-guide.md).

---

## 🧠 Fallow Code Quality Governance & Content-Aware Complexity (Zero Arbitrary Line Limits)

Fallow is integrated into `@francogp/auditor` (`audit_project.ts` and `report_fallow.ts`) to evaluate **code structure, semantic content, and mental load** through AST parsing, NOT through arbitrary line limits:

1. **AST Content Analysis over Raw Line Counts**:
   - Arbitrary line limits (such as `≤ 60 LOC` per function or raw file line caps) are **STRICTLY FORBIDDEN**. Raw line counts penalize comments, JSDocs, Mermaid architecture diagrams, TypeScript domain interfaces, blank lines, and formatting.
   - Code quality is governed strictly by Fallow's native complexity metrics declared in `.fallowrc.json`:
     - `maxCognitive` (default: 20): Measures mental nesting and cognitive branching.
     - `maxCyclomatic` (default: 25): Measures independent execution control paths.
     - `maxCrap` (default: 500): Measures change risk anti-patterns against test coverage.
2. **Strict Demarcation of Telemetry vs Auditor Errors (`fallow health`)**:
   - In `fallow health`, Fallow outputs informational statistics (`large_functions`, `targets`, `hotspots`).
   - The auditor framework maps **ONLY `data.findings`** (true complexity threshold breaches) as blocking auditor errors (`severity: 'error'`).
   - Converting informational statistics (`large_functions` or `targets`) into fatal auditor errors is strictly prohibited; doing so forces unnatural micro-fragmentation of clear, declarative functions.
3. **Module Sizing Protocol**:
   - Modules and components should be decomposed when their **cognitive load** or responsibilities grow unwieldy (Single Responsibility Principle), not by counting lines.

---

## 🛠️ Master Environment Setup Scripts Governance (`setup-linux.sh`, `setup-windows.ps1`)

The root environment initialization scripts `setup-linux.sh` and `setup-windows.ps1` belong canonically to `@francogp/auditor`.

1. **Strict Prohibition on Local Host Patches**:
   - AI agents and developers **MUST NEVER** attempt to apply ad-hoc local patches, temporary regex replacements, or logic mutations directly inside a host project's `setup-linux.sh` or `setup-windows.ps1`.
2. **Upstream Reporting Protocol**:
   - If an issue, defect, version synchronization gap (e.g. Node vs NPM in `--declared-versions`), or platform incompatibility is discovered:
     - The agent **MUST PROACTIVELY NOTIFY THE USER**, clearly explaining the root cause.
     - The agent **MUST INSTRUCT THE USER** that the change must be requested and made upstream in the `@francogp/auditor` repository.
     - Once resolved and released upstream, the host project updates via `npm run auditor:update` and synchronizes the official scripts.

---

## 📚 References & Host Integration Blueprints

The following reference manuals and configuration blueprints are maintained in `references/`:

- [`references/host-package-governance.md`](./references/host-package-governance.md): Host installation, updates via GitHub npm, CI reproducibility, and script inheritance.
- [`references/sub-auditor-authoring-guide.md`](./references/sub-auditor-authoring-guide.md): Complete authoring guide with boilerplate implementations for FileScan, Base, and AST sub-auditors.
- [`references/cli-reporters-guide.md`](./references/cli-reporters-guide.md): Complete reference manual for interactive findings reporting and CLI diagnostic options.
- [`references/setup-extension-guide.md`](./references/setup-extension-guide.md): Architecture and plugin guides for extending `setup-linux.sh` and `setup-windows.ps1` in host projects.
- [`references/blueprints.md`](./references/blueprints.md): Overview of configuration blueprints and mandatory explicit subsystem configuration.
- [`references/audit.config.enterprise.example.ts`](./references/audit.config.enterprise.example.ts): Reference `audit.config.ts` for Enterprise applications (Supabase backend, strict domain types, explicit rules).
- [`references/audit.config.gaming.example.ts`](./references/audit.config.gaming.example.ts): Reference `audit.config.ts` for Interactive / Gaming applications (hybrid persistence, Web Workers chunk exemptions, custom families, local extensions).
- [`references/extensions/validate_button_governance.extension.ts`](./references/extensions/validate_button_governance.extension.ts): Reference extension blueprint for design system button governance and anti-clipping.
- [`references/extensions/validate_render_performance.extension.ts`](./references/extensions/validate_render_performance.extension.ts): Reference extension blueprint for GPU render hygiene and atmospheric overlays.
- [`references/plugins/`](./references/plugins/): Sample setup plugins for Docker database containers and local SSL certificates with `mkcert` (Bash & PowerShell).


