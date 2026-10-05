---
name: auditor
description: MANDATORY governance and architectural engine for running, analyzing, inspecting, creating, refactoring, maintaining, administering, and UPDATING ALL static analysis tools, sub-auditors, AST rules, and CLI reporting scripts across the repository. YOU MUST ALWAYS TRIGGER THIS SKILL whenever analyzing audit results, inspecting findings or errors, investigating violations, reading latest_audit.json, debugging audit failures, planning or executing fixes for audit issues, or whenever the user asks to UPDATE OR UPGRADE the auditor package (e.g. 'actualizar auditor', 'actualizame el auditor', 'update auditor', 'actualizar paquete auditor', 'actualizar dependencias de auditor', 'update @francogp/auditor', 'auditor:update', 'npx auditor-update', 'auditor-version', 'version de auditor'), or mentions auditors, audit suites, audit reports, audit tables, Fallow analyzers, report formatting, or modifies ANY file in `scripts/auditors/`, `@francogp/auditor`, `.auditor/`, `src/core/auditorBase.ts`, or `src/core/unifiedTheme.ts`, even if they just mention 'auditor', 'auditores', 'auditoría', 'audit', 'fallow', 'reporte', 'tabla', 'resultados en la tabla', 'desglose', 'complejidad', 'duplicados', 'triplicados', 'superclase', 'BaseAuditor', 'report_fallow', 'report_complexity', 'report_findings', or audit scripts ('npm run audit', 'npm run audit:findings', 'npm run audit:complexity', 'npm run audit:fallow:*', 'npm run audit:lint'). When updating the auditor in host projects, agents MUST use 'npx auditor-update' or 'npm run auditor:update' and 'npx auditor-version -v'. STRICTLY FORBIDDEN to use ad-hoc node -e scripts, git clone into /tmp, or git log inside node_modules; ALWAYS use the framework's native CLI tools. Enforces strict OOP inheritance (BaseAuditor, FileScanAuditor), standardized Box-Drawing table rendering via unifiedTheme (80-col limit, zero wrapping, getVisualWidth emoji alignment), dynamic auto-discovery, zero code duplication, zero project hardcoding in @francogp/auditor, and zero ad-hoc console loggers.
---

# Auditor: Architecture, Verification & Governance Engine

This skill defines the immutable standard and architectural contract for creating, administering, refactoring, and maintaining all sub-auditors, reporting scripts, and the `@francogp/auditor` engine across the repository.

Every sub-auditor and reporter is part of a unified static analysis and verification system orchestrated by `npm run audit`.

---

## 🏛️ Core Principles & Tooling Mandates

0. **Absolute Prohibition on Backward-Compatible Code & Loud Failure Mandate**:
   - Writing backward-compatible shims, deprecated alias suites, legacy fallback wrappers, or dual-execution adapter code across `@francogp/auditor` is **STRICTLY PROHIBITED**.
   - Outdated consumers, legacy configurations, and unmigrated sub-auditor calls MUST fail loudly with immediate, explicit, and blocking errors (`throw new Error(...)` or exit code 1) forcing consumers to upgrade to canonical standards.
   - Maintaining duplicate suites or runtime compatibility bridges that introduce bloat, duplicate findings, or maintenance hazards is completely eradicated.
0.1. **Absolute Prohibition on Suppressing, Silencing, Nullifying, or Bypassing Audit Rules & Zero-Tolerance Fake Pass Mandate**:
   - When auditing a repository or running linters/auditors, AI agents and developers are **STRICTLY AND CATEGORICALLY PROHIBITED** from suppressing, silencing, disabling, or nullifying auditor rules, stylelint rules, ESLint rules, or any static analysis checks (e.g., setting `"rule": null`, `"rule": "off"`, `"rule": 0`, creating dummy override configs that neuter checks, or passing arbitrary skip flags) to make an audit pass or hide findings.
   - If the number of errors or warnings is massive (even hundreds or thousands of errors), **THEY ARE REAL ARCHITECTURAL, SECURITY, OR HYGIENE DEFECTS THAT MUST BE LEGITIMATELY RESOLVED IN THE SOURCE CODE OR FIXED WITH CANONICAL TOOLS (`auditor fix`)**.
   - Modernizing host configurations means **elevating the codebase to meet strict modern standards and exposing defects that were previously hidden**, NEVER degrading, diluting, or castrating the auditor's rules to fit legacy code.
   - Rushing to silence rules to achieve a fake clean pass is considered a critical architectural violation and gross misconduct.
0.2. **Absolute Prohibition on NPX & Mandate of Native Node.js 26+ (`node --experimental-strip-types`) / Canonical NPM Scripts**:
   - Running, recommending, or executing `npx` (e.g., `npx tsx`, `npx auditor`, `npx vitest`) or third-party runtime wrappers across `@francogp/auditor` and consumer host projects is **STRICTLY AND CATEGORICALLY PROHIBITED**.
   - Node.js 26+ runs TypeScript natively without third-party transpiladores. All internal tool executions, inspections, and scripts MUST use native Node.js (`node --experimental-strip-types <script.ts>`) or canonical npm package scripts (`npm run <script>`, `npm test`).
   - If a host project lacks an auditor script in `package.json`, agents MUST run `npm run audit:fix` (or `node --experimental-strip-types ...`) to synchronize scripts, NEVER attempt ad-hoc `npx` commands.
1. **Strict OOP Inheritance Mandate**:
   - Every sub-auditor MUST extend either `BaseAuditor<TRuleId>` or `FileScanAuditor<TRuleId>` from `@francogp/auditor`.
   - Creating standalone procedural scripts, custom CLI loggers, or ad-hoc result printers is **STRICTLY FORBIDDEN**.
2. **Unified Box-Drawing Table & Terminal Width Mandate (Max 80 Cols, Zero Wrapping)**:
   - ALL terminal tables, whether rendered by sub-auditors (`BaseAuditor`), orchestrators (`audit_full.ts`), or interactive reporters (`report_fallow.ts`, `report_complexity.ts`, `report_findings.ts`), MUST use the shared Box-Drawing utilities from `@francogp/auditor` (`renderBanner`, `renderBoxTable`, `formatStatusBadge`, `getVisualWidth`).
   - Hardcoding custom ASCII banners (`╔════...` exceeding 80 columns) or ad-hoc bulleted lists (`•`) is **STRICTLY FORBIDDEN**.
   - Tables must fit within the standard 80-column terminal width (`TERMINAL_WIDTH = 80`) and use `getVisualWidth()` for padding so emojis (`✅`, `❌`, `⚠️`) do NOT throw column borders out of alignment.
   - **Consolidated Total Row Requirement**: Every multi-row summary or breakdown table displaying numeric findings across categories or rules MUST include a dedicated `footerRows` entry labeled `TOTAL CONSOLIDADO` separated by a standard divider (`├───┼───┤`), providing explicit, mathematically transparent sums for all error and warning columns.
3. **Dynamic Auto-Discovery & Extension Mandate (Zero Hardcoded Lists)**:
   - The master orchestrator (`npm run audit`, which also enforces the warning ratchet: 0 errors and 0 new warnings vs `.auditor/audit-baseline.json` at `ratchet.productionRef`) discovers all generic suites dynamically via `@francogp/auditor` and host-specific extensions registered in `.auditor/audit.config.ts`.
   - **Never hardcode an array of auditors or task IDs**. Any generic suite placed in `src/suites/<family>/` or host extension registered in `.auditor/audit.config.ts` is automatically discovered, categorized, timed, and executed.
4. **Strict Agnostic Engine & Zero Project Hardcoding Mandate**:
   - The `@francogp/auditor` core package MUST remain 100% project-agnostic.
   - It is **STRICTLY FORBIDDEN** to hardcode host-specific directory names (e.g. `external`, `backup_legacy_code`, `third_party`), host domain entity identifiers (e.g. `userId`, `invoiceId`, `tariffId`, `formulaId`), or project-specific test subpaths (`fuzzer`, `simulation`) inside `@francogp/auditor`.
   - All host-specific directories, ignore patterns, entity prefixes, and custom test roots MUST be declared in `.auditor/audit.config.ts`:
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
    - All bundle chunk size validation and threshold evaluation MUST resolve dynamically and strictly from `.auditor/audit.config.ts` (`config.bundle.budgets`, `config.bundle.maxClientChunkErrorBytes`, `config.bundle.maxClientChunkWarnBytes`). If unconfigured, no arbitrary framework size penalty is applied.
23. **Static Security Gating & CLI Non-Production Classification (`AuditSecurityConfig`)**:
    - Static security scanning (Fallow CWE sinks) is governed by `config.security.enabled`. CLI tools and maintenance scripts identified by `isCliPath()` are treated as non-production environments with legitimate access to synchronous filesystem and child process operations under Node.js 26 permissions.
24. **Canonical Non-Fatal Catch Annotation Contract (`// catch-ok:`)**:
    - Any intentional, non-fatal catch block across the framework and host projects must declare `// catch-ok: <justification>` within its scope to pass `validate_error_suppression`.
25. **Centralized CLI Entrypoint Verification (`isMainModule`)**:
    - CLI tools and executable scripts MUST use the centralized `isMainModule(import.meta.url)` helper from `@francogp/auditor` to check for direct CLI invocation.
26. **Prohibition of Ad-Hoc Audit Result Parsing & Mandatory Native CLI Reporters Mandate**:
    - AI agents and developers MUST NEVER write or execute ad-hoc inline node scripts (`node -e "..."`), python scripts, or bash one-liners to read, inspect, or summarize `scratch/audits/latest_audit.json` or test coverage files (`coverage/coverage-final.json`).
    - All audit result inspections, category breakdowns, severity filtering, complexity hotspot analyses, and test coverage evaluations MUST be conducted strictly through the framework's native CLI tools:
      - `npm run audit`: Global execution and consolidated Box-Drawing table.
      - `npm run audit:findings` / `npm run audit:errors` / `npm run audit:warnings` / `npm run audit:summary` / `npm run audit:files`: Filtering and breakdown of findings.
      - `npm run audit:test-coverage` (`auditor-test-coverage`): Canonical test execution code coverage analysis, directory aggregates, untracked files detection, uncovered line ranges, and complexity hotspot correlation. Full guide: [`references/test-coverage-guide.md`](./references/test-coverage-guide.md).
      - `npm run audit:by-file`: Hierarchical Box-Drawing tree inspection of findings grouped strictly by file and ordered by line ascending (`├── L12: [Rule] Message`), with filters (`file=`, `category=`, `severity=`, `top=`, `json`).
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
    - **Fast Preset Isolation**: Vector analysis MUST NEVER execute under fast presets (`preset=lint`, `preset=md`). It runs exclusively in full audits (`npm run audit`) or via the dedicated CLI tool (`npm run audit:similar`).
    - **Surgical Sensitivity (`threshold: 0.95`, `ignoreSameFile: true`)**: Core default threshold of `0.95` combined with intra-file exclusion eliminates false positives between synchronous/asynchronous variants or polymorphic class methods, isolating true cross-module duplication.
    - **Hardware Runtime & Multi-Threading**: Fallow runs the local companion model (`jina-embeddings-v2-base-code`) via Hugging Face Candle in **CPU-only mode** (no GPU/CUDA support). Parallelism is accelerated across CPU cores via `--threads ${os.availableParallelism()}`.
    - **Vector Cache Architecture & Windows OS Error 3 Pre-Creation**: Fallow persists model weights and vector embeddings in the standard OS user cache directory: `%LOCALAPPDATA%\fallow\similar-code` on Windows (`~/.cache/fallow/similar-code` on Linux). Subdirectories `models/` and `vectors/` MUST be pre-created prior to execution to avoid Windows `os error 3: The system cannot find the path specified`. With cached vectors, audit time drops from ~230s down to ~2s.
    - **Automatic Model Initialization & Warning Banner Fallback**: If the local model is uninitialized, the suite attempts automatic setup via `fallow similar-code setup --local --yes`. If the automatic setup fails, the auditor displays a prominent Box-Drawing warning banner with the manual installation command (`npx fallow similar-code setup --local --yes`), recording `fallow-similar-code-failed` as a non-fatal warning (`severity: 'warning'`) so other suites remain unblocked.
    - **Specifically Defined Remote Deployments Only (Environment Variable Bypass) & Local Prohibition**: In specifically defined remote CI pipelines, containerized environments, or GitHub Pages deployment workflows where downloading model weights is undesirable in headless ephemeral containers, set `AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1` (or `AUDIT_SKIP_SIMILAR=1`) to cleanly omit vector duplication checks with zero violations. There is NO CLI flag. Setting `AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1` or `AUDIT_SKIP_SIMILAR=1` in local development, interactive agent turns, or local workstation testing is STRICTLY PROHIBITED.
    - **Upstream Specification**: See [Fallow Similar Code Analysis Specification](https://git.mitgai.net/fallow-rs/fallow/blob/main/docs/similar-code-analysis.md).
29. **Universal Ephemeral Scratch (`scratch/`) & Build Output (`dist/`) Isolation Mandate**:
    - **`scratch/` (Mandatory for all drafts & ephemeral data)**: Universal, mandatory directory across ALL projects and repositories for any and all ephemeral files: scratch scripts, AI temporary investigation notes, experimental files, testing dumps, raw json outputs (`scratch/audits/`), and intermediate CLI caches.
      - Every project MUST declare `scratch/` in `.gitignore`.
      - Committing or placing drafts, temporary files, or scratch scripts in `src/`, root, or non-scratch paths (such as `tmp/`, `.tmp/`, `temp/`, `test.js`, `dummy.ts`) is strictly forbidden and actively blocked by `validate_ephemeral_storage_isolation`.
    - **`dist/` (Mandatory for all compilations & production builds)**: Universal, mandatory directory across ALL projects for all compiled outputs, production bundles, generated JS/CSS assets (`dist/assets/`), and packaged library outputs.
      - Every project MUST declare `dist/` in `.gitignore`.
      - Production build artifacts, source maps, and bundle chunks must reside strictly within `dist/` and must never pollute source code trees.
30. **Active by Default Subsystem Mandate & Zero Silent Skips**:
    - All configurations and subsystems in `@francogp/auditor` are ACTIVATED BY DEFAULT (`enabled: true`, `persistence.engine: 'supabase'`, `zLayersEnabled: true`, `requireInputIds: true`, `similarCode.enabled: true`, `packageScripts.enabled: true`, etc.).
    - If a host project specifies nothing for a subsystem in `.auditor/audit.config.ts`, that subsystem is automatically active with complete default configurations.
    - Sub-auditors MUST NEVER silently bypass checks due to missing files or missing configuration; non-applicable subsystems in tool packages or non-web packages must be explicitly deactivated (`enabled: false`, `engine: 'none'`).
31. **Official Stylelint Engine & Pure In-Memory Execution (`validate_stylelint`)**:
    - All stylesheet and component style hygiene, duplicate class rules, similar selectors, empty blocks, property order, and SCSS syntax are analyzed strictly through the official Stylelint engine with Vue SFC and SCSS support (`stylelint`, `stylelint-scss`, `stylelint-order`) and in-memory PostCSS AST processing. Sub-auditors MUST NOT rely on unmaintained, platform-dependent external Go binaries (such as `css-checker-kit`), preventing Smart App Control blocks, `ignore-scripts` install crashes, and OS-level execution failures.
32. **Data Catalog Complexity Exemption (`paths.dataRoots`)**:
    - Files inside `paths.dataRoots` (constant catalogs and tabular mini-databases) are exempted from function complexity and LOC alerts in `audit_project.ts` via `isComplexityExemptPath`, while preserving 100% of domain type checks, O(1) structures, and Fallow dead-code analysis.
33. **Canonical Tool Package Fallow Governance (`.fallowrc.json`)**:
    - Tool packages distributing standalone CLI tools and AI skills must maintain a root `.fallowrc.json` declaring `entry` points, `ignorePatterns` (`skills/**`, `.agents/**`, `scratch/**`, `dist/**`, `tests/**`), and `ignoreDependencies` (for peer/CLI tools such as `fallow`, `html-validate`, `html-validate-vue`, `markdownlint-cli`, `stylelint`, `knip`, `publint`, `type-coverage`, `rollup-plugin-visualizer`, `typescript`). This guarantees unskewed maintainability analysis (>= 90 score) while preserving strict zero-tolerance fallow gating.
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
    - The `@francogp/auditor` engine and consumer projects MUST strictly use the universal standard npm convention `npm run build` (`"build": "npm run audit && tsc -p tsconfig.build.json && node --experimental-strip-types src/cli/make_executable.ts && npm run audit:build"`) for compiling and emitting distribution artifacts into `dist/`. Using platform-specific shell commands like `chmod` that fail on Windows is strictly forbidden; executable permissions are set via cross-platform Node.js filesystem APIs. Inventing arbitrary non-standard script names (such as `compile` or `build:dist`) is strictly forbidden across the framework. Compiling distribution artifacts and executing architectural verification suites MUST remain strictly chained into the build script to ensure non-conforming builds are aborted.
39. **Public Package Anonymity & Zero Host Leakage Mandate**:
    - Standalone tooling packages, exported AI skills (`.agents/skills/**`), reference blueprints (`.agents/skills/*/references/**`), test fixtures, and public documentation MUST NEVER mention or leak private host project names, repository slugs, database schemas, or proprietary business domains. Reference blueprints and examples MUST strictly use generic, domain-neutral archetypes (e.g. `enterprise.example.ts`, `gaming.example.ts`, `app-postgres`, `app_db`, `test@example.com`).
40. **Host AGENTS.md Independence Mandate**:
    - `@francogp/auditor` distributes AI skills (`.agents/skills/*`), CLI binaries, and setup scripts, but MUST NEVER distribute, generate, or force a global `AGENTS.md` onto external consumer host projects. Consumer host projects maintain their own independent, domain-specific `AGENTS.md` hierarchy. The root `AGENTS.md` in `@francogp/auditor` governs exclusively the core auditor engine repository.
41. **Capability-Driven Auto-Coordination Mandate (`AuditorCapabilities`) & Zero-Boilerplate Defaults**:
    - Sub-auditors declare execution capabilities (`fix`, `lint`, `md`, `ast`, `changedSince`, `heavy`, `requiresBuild`) cleanly via `AuditorOptions.capabilities?: Partial<AuditorCapabilities>`.
    - `BaseAuditor` guarantees immutable defaults (`DEFAULT_AUDITOR_CAPABILITIES` with all flags set to `false`). Sub-auditors ONLY declare active capabilities where they differ from defaults (e.g. `capabilities: { lint: true, fix: true }`). Repeating redundant `false` flags across constructors is strictly forbidden.
    - When `auditor fix` or `auditor --fix` is invoked, the master orchestrator (`audit_full.ts`) and scanner (`auditScanner.ts`) dynamically isolate and run only auto-repair suites (`capabilities.fix === true`) under the dedicated `[ 🛠️ MODO REPARACIÓN AUTOMÁTICA ]` terminal interface. Fast presets (`preset=lint`, `preset=md`) dynamically select suites declaring `capabilities.lint === true` or `capabilities.md === true`.
    - Heavy suites (`capabilities.heavy === true`) are automatically bypassed in fast presets (`preset=lint`, `preset=md`). AST requirements are evaluated dynamically without hardcoded suite ID lists.
42. **Strict ESLint Flat Config & Zero-Tolerance Type Integrity (`eslint.config.js`)**:
    - All projects governed by `@francogp/auditor` MUST maintain a root `eslint.config.js` enforcing `@typescript-eslint/no-explicit-any: 'error'`, `@typescript-eslint/no-restricted-syntax` banning `TSUnknownKeyword` (`as unknown as`) and legacy `new Date()` / `Date.now()`. `forbiddenTypeCasts` in `audit_rules.ts` enforces static eradication of `as any`, `: any`, `<any>`, and `as unknown as` with zero tolerance under `/domain-type-first`.
    - `validate_eslint_config` automatically validates that consumer and engine ESLint flat configs do not disable these safety invariants.
43. **Dynamic GitIgnore Requirements Contract (`GitIgnoreRegistry`, `GitIgnoreRequirement`)**:
    - Sub-auditors (built-in or user-extended) and modules MUST NOT rely on hardcoded gitignore lists.
    - Each sub-auditor declares its required gitignore entries via `AuditorOptions.gitIgnoreEntries?: readonly GitIgnoreRequirement[]` and static `gitIgnoreEntries` on the class.
    - `BaseAuditor` dynamically registers them into `GitIgnoreRegistry`.
    - `ValidateAuditConfigAuditor` dynamically collects requirements from all discovered modules, active subsystems, and user extensions, verifying `.gitignore` coverage and providing auto-repair (`--fix`).
44. **Mandatory Pre-Compilation Audit Chaining Across All Projects (`validate_audit_config`)**:
    - Across ALL projects governed by `@francogp/auditor` (consumer applications and standalone package distributions alike), the `"build"` script in `package.json` MUST be chained with a prior invocation of the full auditor (e.g., `"build": "auditor && vite build"`, `"build": "npm run audit && vite build"`, or `"build": "npm run audit && tsc -p tsconfig.build.json && node --experimental-strip-types src/cli/make_executable.ts && npm run audit:build"`).
    - The `audit:for-commit` / `auditor-commit` gate was removed; any script still referencing it fails with `audit-config-removed-commit-gate` (`auditor fix` deletes or rewrites it to `auditor`).
    - Bypassing build chaining is permitted only via explicit configuration (`config.packageScripts.enforceBuildAudit: false`).
    - `validate_audit_config` provides auto-repair (`--fix`) to automatically chain `auditor &&` into the build script and populate missing essential auditor scripts from `recommended_package_scripts_template.json`.
45. **Mandatory Third-Party Licenses & Open-Source Attribution Contract**:
    - Every package `README.md` MUST conclude with a comprehensive "Third-Party Software & Open-Source Licenses" attribution section linking every integrated tool, library, and living specification engine (ESLint, Stylelint, HTML-Validate, Markdownlint, Fallow, Knip, Publint, Type-Coverage, TypeScript, Vitest, Valibot, GSAP, Jina embeddings) to its respective project repository and open-source license.
46. **Strict Local Execution Mandate & Absolute Prohibition of Bypassing Vector Duplication in Local/Development**:
    - AI agents and developers MUST NEVER set `AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1` or `AUDIT_SKIP_SIMILAR=1` during local development, interactive coding turns, bug triage, or local verification runs.
    - Vector semantic duplication analysis (`validate_similar_code`) executes locally on Candle CPU in ~2s leveraging local disk caches (`%LOCALAPPDATA%\fallow\similar-code` on Windows, `~/.cache/fallow/similar-code` on Linux).
    - Running vector analysis locally is mandatory to identify semantic duplication before code is committed or pushed.
    - There is NO CLI flag to skip similar code. The deliberate bypass is STRICTLY AND EXCLUSIVELY available via the environment variable `AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1` (or `AUDIT_SKIP_SIMILAR=1`), reserved exclusively for specifically defined remote deployment workflows (e.g. GitHub Pages deploy workflows or headless CI containers without local disk cache).
47. **Mandatory Thematic Emojis (`AuditorOptions.icon`)**:
    - Every sub-auditor and host extension MUST declare `icon: string` (e.g. `icon: '🏛️'`, `icon: '🎨'`, `icon: '🧩'`).
    - If `icon` is omitted, `undefined`, or empty, `validateAuditorOptions` throws an explicit, loud runtime `Error`.
    - Generic cogs (`⚙️`) are reserved exclusively for internal configuration validators.
48. **Status `skipped` & Transparent Reporting (`markSkipped`, `⏭️ SKIP`)**:
    - When an auditor is bypassed (via environment guard, configuration, or fast preset), it calls `this.markSkipped(reason)`.
    - The streaming runner renders `⏭️  SKIP` in cyan with its thematic icon and justification.
    - Summary tables reflect skipped suites: `(X Omitida ⏭️)` rather than masking them as passed.
49. **Strict Booleans and Zero Backward Compatibility**:
    - All configurations and options use strict types and compile-time booleans (`true`/`false`).
    - Legacy string values like `'off'`, `'on'`, `'essential'` have zero backward compatibility and fail validation immediately with loud errors.
50. **Anti-Abuse Protection for `constants.exemptGlobs`**:
    - Broad wildcards matching primary source trees (`**/*`, `src/**`) are strictly rejected. Glob patterns must target specific maintenance scripts or tabular seed data.
51. **Hierarchical By-File & Line Grouping Mandate (`audit:by-file`, `scratch/audits/by_file.json`)**:
    - All audit findings in `latest_audit.json` (`allFindings`) MUST be sorted stably by relative file path (case-insensitive ASC) and line number ascending (`f.line ?? 0`), with structured index `findingsByFile` and an ephemeral lightweight index `scratch/audits/by_file.json`.
    - The framework exposes the canonical CLI tool `npm run audit:by-file` (binary `auditor-by-file`) rendering a Box-Drawing tree (`├── L<line>: [Rule] Message`) with filters (`file=`, `category=`, `severity=`, `top=`, `json`) to allow developers and AI agents to inspect and repair all violations in a file in a single pass without thrashing or repeated file reads.
52. **Canonical Magic Numbers Heuristics & Radix Exemption Contract**:
    - The `magicNumbers` analyzer strictly prohibits naked numeric literals in business logic (`severity: 'error'`).
    - Provides canonical exemptions for: (1) standard identity values, HTTP status codes, and the universal upper-bound sentinel (`0, 1, 100, 200, 404, 500, 9999`), (2) standard radix arguments (`2, 8, 10, 16, 36`) in `parseInt`, `Number.parseInt`, and `toString(radix)`, (3) descriptive property assignments in module-level constant objects (`const UPPER_CASE = { ... }` or `as const`), and (4) deterministic PRNG / trigonometric hashing patterns (`Math.sin(seed) * N`, `seed * N`). Domain-specific sentinels are configured dynamically via `config.constants.exemptMagicNumbers`.
53. **AST Constant Unwrapping & Duplicate Analysis Invariance**:
    - In `validate_duplicate_constants` (`constantAnalyzer.ts`), constant declaration initializers MUST be unwrapped through `ts.isAsExpression`, `ts.isTypeAssertionExpression`, and `ts.isParenthesizedExpression` before comparative evaluation.
    - Const declarations with identical unwrapped values (e.g. `const FOO = 0.75;` and `const FOO = 0.75 as const;`) MUST be classified as identical duplicates (`duplicate-constant-identical`), strictly preventing false divergent alarms (`duplicate-constant-divergent`).
54. **Sass Function Collision Prevention & Casing Governance (`sass-traps/collision-casing`, `scss-sass-collision-casing`)**:
    - Standard CSS functions that share names with Dart Sass built-in color and math functions (`scale`, `scaleX`, `scaleY`, `scaleZ`, `scale3d`, `saturate`, `grayscale`, `invert`, `alpha`, `brightness`, `contrast`, `drop-shadow`, `hue-rotate`, `translateX`, `translateY`, `translateZ`, `translate3d`, `radial-gradient`, `linear-gradient`) MUST be written with PascalCase/CamelCase initials (e.g. `Scale(1.1)`, `Saturate(0.9)`, `Drop-Shadow(...)`, `hue-Rotate(...)`) inside SCSS and Vue SFC `<style>` blocks.
    - Writing them in lowercase causes Dart Sass compiler crashes (`[sass] $color: 1.1 is not a color.`, `[sass] Missing argument $amount.`).
    - Stylelint natively governs this via the native plugin `sass-traps/collision-casing` mapped to `'scss-sass-collision-casing'`.
    - `.stylelintrc.json` MUST keep `function-name-case: ['lower', { ignoreFunctions: ['/^[A-Z]/', 'Drop-Shadow', 'Drop-shadow', 'hue-Rotate', 'Hue-Rotate'] }]` and `value-keyword-case: ['lower', { camelCaseSvgKeywords: true, ignoreProperties: ['/--.*/'], ignoreFunctions: ['v-bind'] }]` so neither rule is disabled while preserving unquoted `v-bind(...)` in Vue SFC.
    - In `--fix` mode, `validate_stylelint` automatically repairs colliding lowercase functions to their canonical capitalized casing on the PostCSS AST.
55. **Stylelint Mixin Block Ordering Governance (`order/order`, `hasBlock`)**:
    - In `.stylelintrc.json`, `order/order` MUST partition `@include` mixins by `hasBlock`:
      - Blockless mixins (`hasBlock: false`, e.g. utility `@include button-reset;`, `@include flex-center;`) MUST precede standard declarations (`declarations`) so declarations can override mixin defaults.
      - Standard CSS property declarations (`declarations`) come next.
      - Mixins containing nested blocks (`hasBlock: true`, e.g. responsive media queries `@include respond-to('desktop') { ... }`, `@include media-breakpoint-up(...) { ... }`) MUST come AFTER declarations so that media queries properly override declarations down the CSS cascade without being superseded in mobile-first layouts.
      - Pseudo-classes and nested rules follow mixins with blocks.
56. **Documented Commands Governance & Dual Resolution Protocol (`validate_documented_commands`)**:
    - Every documented command across ALL repository markdown files (including `README.md`, manuals, guides, blueprints, and AI skills under `.agents/skills/**`) MUST be strictly validated against the project's executable truth (`package.json.scripts`, `node_modules/.bin`, package dependencies, and `config.documentation.allowedNpxBinaries`).
    - **Skills Verification Mandate**: AI skills under `.agents/skills/**` are first-class execution assets and MUST NEVER be skipped or exempted from command validation. Phantom or unexecutable commands in skills mislead both AI agents and human developers.
    - **Dual Triage Protocol (Declaration vs Documentation)**:
      When `validate_documented_commands` reports an unregistered npm script (`documented-cmd-unregistered-npm`), invalid syntax (`documented-cmd-invalid-npm-syntax`), or unregistered npx binary (`documented-cmd-unregistered-npx`), developers and AI agents **MUST NOT** blindly assume it is an error in documentation to be stripped, renamed, or suppressed.
      Instead, rigorously analyze the author's intent following this decision tree:
      - **Case A: Missing Declaration (Legitimate Tooling Intent)**: If the command represents an intentional project workflow, hook, lifecycle script, test runner, or utility (e.g. `npm run dev`, `npm run test:node`, `npm run env:post-setup`, `npm run validate:documented-commands`), the correct resolution is to **DECLARE IT in `package.json.scripts` or dependencies** where it belongs, ensuring the project provides what is documented.
      - **Case B: Documentation Defect (Legacy, Typo, or Misformatted)**: If the command is an obsolete legacy leftover, has invalid syntax (such as invoking a custom script directly without `run`), or references an external/project-specific tool without generic placeholder notation (`<script>`), the correct resolution is to **UPDATE the documentation** to reflect canonical, working commands or use generic placeholders.
57. **Mandatory README Synchronization & Modernization Mandate**:
    - Whenever releasing framework features, updating generic suites, adjusting canonical package scripts, or performing auditor upgrades in host applications, developers and AI agents MUST review, update, and modernize the root `README.md`.
    - **Script Synchronization**: Verify that all scripts in `package.json` matching `recommended_package_scripts_template.json` (such as `audit:build`, `audit:fix`, `audit:lint`, `audit:similar`, `auditor:update`) are correctly documented in the root `README.md`.
    - **Suite Synchronization**: Ensure generic suites, capabilities, and family breakdowns reflect canonical standards without hardcoding brittle suite counts.
    - **Configuration Examples**: Ensure configuration snippets in `README.md` include all mandatory active subsystems, including the `coverage` ledger (`exemptGlobs` and `acknowledgedDegradations`).
58. **Single Source of Truth Configuration & `.auditor/` Directory Layout**:
    - Dynamically loads paths, persistence settings, and host extensions via `.auditor/audit.config.ts` (or `.auditor/audit.config.json`).
    - Every versioned auditor-owned artifact lives in `.auditor/` (configuration, warning baseline `.auditor/audit-baseline.json`); ephemeral results stay in the git-ignored `scratch/audits/`.
    - Third-party tool configs (`eslint.config.js`, `.stylelintrc.json`, `.fallowrc.json`, `.markdownlint.json`, `.htmlvalidate.json`) stay at the root for native tool and IDE discovery.
    - A root-level `audit.config.ts`/`audit.config.json` fails loudly with `audit-config-root-file`; `auditor fix` moves it into `.auditor/` and rebases its relative imports through the TypeScript AST (`migrateAuditConfig.ts`).
    - Paths declared inside the config remain project-root relative. A configuration that fails to import throws instead of silently falling back to defaults.
59. **Warning Ratchet & Baseline Governance (`ratchet`)**:
    - The master orchestrator (`npm run audit`) automatically enforces **0 errors AND 0 new warnings** through the built-in warning ratchet.
    - Warning fingerprints (`sha256(suite|rule|posixRelFile|lineText|occurrenceIndex)`) are compared against `.auditor/audit-baseline.json` committed at `ratchet.productionRef` (default `origin/main`).
    - Resolving existing warnings automatically shrinks `.auditor/audit-baseline.json` on the next full audit run, ratcheting code quality monotonically upward.
    - Bypassing the ratchet, disabling `ratchet.enabled`, or hand-editing `.auditor/audit-baseline.json` to absorb new warnings is strictly forbidden.
    - The differential `audit:for-commit` gate was completely removed; `npm run audit` itself is the single, definitive quality gate.
60. **Bidirectional DOX Source File Indexing & Link Relocation Diagnostics (`dox-unindexed-file`, `validate_markdown_links`)**:
    - DOX hierarchy (`validate_dox_integrity`) enforces bidirectional synchronization between filesystem and documentation: all non-test source code files (`.ts`, `.vue`, `.js`, etc.) residing in a directory governed by `AGENTS.md` MUST be documented under `## Key Files`. Missing source files trigger `dox-unindexed-file` (`severity: 'error'`).
    - Relative link verification (`validate_markdown_links` and `doxAnalyzer`) detects broken links to local files. If a referenced target does not exist at the specified path but exists elsewhere in the repository, the error message transparently reports: `"pero aparentemente fue localizado en: ..."` and suggests canonical relative paths.
    - **Zero Risky Auto-Fix Mandate**: Broken markdown links and missing code index entries MUST NOT be auto-fixed or auto-rewritten by machine tools; diagnostics are provided so the developer or AI agent can make an informed architectural decision.
61. **Mandatory Test Execution Coverage Enforcement (`validate_test_coverage`, `testCoverage.enforceInAudit`)**:
    - Test coverage enforcement is **active by default** (`testCoverage.enforceInAudit: true`) across `@francogp/auditor`.
    - If overall code coverage or category coverage (statements, branches, functions, lines) falls below the threshold (default: **80%**), `validate_test_coverage` fails with blocking `severity: 'error'`.
    - Untested modules are reported as shadow code. Host projects with mathematical ceilings (e.g. platform-specific wrappers) may configure their achievable ceiling (e.g. 70% or 80%) in `.auditor/audit.config.ts`, but coverage enforcement must remain active and ratcheting.
62. **Dynamic Introspection Catalog & Manifest DTO Mandate (`AuditorManifestDTO`, `--list`, `--info`)**:
    - Every sub-auditor and host extension MUST implement clean dynamic metadata via `BaseAuditor.toManifest(): AuditorManifestDTO`.
    - **Concise Summaries (Zero Text Walls)**: Descriptions MUST be short and direct (`description <= 60 chars`), avoiding multi-line walls of text so AI agents and CLI tools can digest them instantly.
    - The CLI provides dynamic introspection out-of-the-box without filesystem crawling:
      - `node --experimental-strip-types src/cli/audit_full.ts --list` (or `auditor --list`): Box-Drawing table of all discovered suites, flags, and descriptions.
      - `node --experimental-strip-types src/cli/audit_full.ts --list --json` (or `auditor --list --json`): Emits structured `AuditorManifestDTO[]` in JSON format.
      - `node --experimental-strip-types src/cli/audit_full.ts --info=<suiteId>` (or `auditor --info=<suiteId>`): Technical specification sheet of a suite (purpose, flags, evaluated rules, configuration).
      - `node --experimental-strip-types src/cli/audit_full.ts --help` (or `auditor --help`): Interactive CLI manual in 80 columns.
    - **Zero Hardcoding**: The master orchestrator NEVER hardcodes suite lists or descriptions; all catalog data is extracted dynamically via reflection or AST.
63. **Auto-Fix First Protocol & Script Sync Gate**:
    - **Auto-Fix First**: When an audit completes with fixable errors/warnings, `audit_full` renders an emphatic Box-Drawing banner urging `npm run audit:fix` (or `auditor fix`). Agents and developers MUST run auto-fix first to resolve mechanical defects before attempting manual refactoring, and are strictly prohibited from muting or silencing rules in panic.
    - **Script Sync First**: If a recommended auditor script (`audit:by-file`, `audit:findings`, `auditor:update`, etc.) is missing in `package.json`, agents MUST run `npm run audit:fix` (or `node --experimental-strip-types ...`) to synchronize scripts from `recommended_package_scripts_template.json` before attempting manual ad-hoc executions.

---

## 📂 Canonical Architecture: Built-in Suites & Host Extensions

### 1. Generic Built-In Suites (`src/suites/`)
Domain-agnostic suites discovered automatically across canonical architectural families:
- `architecture/` (including `audit_project.ts`, with shared rule module `audit_rules.ts`): AST rules, Fallow intelligence, Z-Index, CSS orphans, emoji typography, HTML5 standards validation (`validate_html_validate`), Stylelint & SCSS hygiene (`validate_stylelint`), ESLint Domain-Type-First governance (`validate_eslint_config`), Knip dependency hygiene (`validate_package_hygiene`), Publint distribution verification (`validate_package_distribution`), Type coverage (`validate_type_coverage`), WCAG 2.2 accessibility (`validate_accessibility`), vector semantic similarity (`validate_similar_code`), test coverage (`validate_test_coverage`), Vue SFC hygiene, Pinia reactivity, reactive leaks and purity
- `domain_data/`: O(1) data structures, Domain-type-first validation (`validate_domain_types.ts`, parameterized via `.auditor/audit.config.ts`)
- `persistence/`: SQL anti-patterns (`validate_sql_anti_patterns.ts`, with hybrid persistence support)
- `documentation/`: Markdown relative links, DOX hierarchy (AGENTS.md) with bidirectional source file indexing (`dox-unindexed-file`), syntax standards, markdown lint, code references, and documented commands verification (`validate_documented_commands.ts`)

### 2. Host Project Extensions (`scripts/auditors/`) & `.auditor/audit.config.ts`
All domain-specific rules unique to host applications (e.g. specialized domain entities, state machines, business workflows, custom SQLite schemas) reside in `scripts/auditors/` (or designated project folders) and extend `BaseAuditor` imported from `@francogp/auditor`.

Configured in `.auditor/audit.config.ts`:
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
- **Host Extension**: `scripts/auditors/<family>/validate_<topic>.ts` (registered in `.auditor/audit.config.ts`).
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
- **Binary Inheritance**: Host `package.json` scripts map directly to exported binaries (`auditor`, `auditor-findings`, etc.) without duplicating framework scripts.
- **Remote Deploy Builds & CI Pipelines ONLY (`AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1`)**: In specifically defined remote deployment workflows (such as GitHub Pages or headless CI containers), builds may set `AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1` to omit Fallow similar-code AI embedding checks. In local development and routine agent turns, bypassing similar code is strictly prohibited because Candle CPU executes locally from cache in ~2s.

📘 **Detailed Guide & Canonical Config**: See [host-package-governance.md](references/host-package-governance.md) for full instructions, CI setups, and `package.json` blueprint.
📘 **Host Migration & Modernization**: See [v4-migration-guide.md](references/v4-migration-guide.md) for the complete v4+ upgrade procedure and mandatory README synchronization checklist.

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
4. **Pre-flight Architecture Verification (`auditor-guard`) & Feature Flags Governance (`auditor-flags`)**:
   - `auditor-guard` (`npm run audit:guard <files>`): Inspects architecture boundaries, allowed import zones, forbidden calls, and policy rules for candidate or changed files before modification.
   - `auditor-flags` (`npm run audit:flags [--retirement]`): Governs feature flags usage, detecting branches, single-read sites, and retirement candidates.
5. **Vitest Coverage & CRAP Score Integration (`audit:coverage-gaps`)**:
   - Discovers `coverage/coverage-final.json` or `config.fallow.coverage.path` and forwards `--coverage` to `fallow health`.
   - Analyzes runtime-reachable exports with zero test references (`npm run audit:coverage-gaps`) and computes test-informed CRAP change risk scores.

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

- [`references/v4-migration-guide.md`](./references/v4-migration-guide.md): Complete guide for modernizing legacy host projects to v4 standards, covering configurations, sub-auditor refactoring, coverage ledgers, and zero-suppression directives.
- [`references/host-package-governance.md`](./references/host-package-governance.md): Host installation, updates via GitHub npm, CI reproducibility, and script inheritance.
- [`references/sub-auditor-authoring-guide.md`](./references/sub-auditor-authoring-guide.md): Complete authoring guide with boilerplate implementations for FileScan, Base, and AST sub-auditors.
- [`references/cli-reporters-guide.md`](./references/cli-reporters-guide.md): Complete reference manual for interactive findings reporting and CLI diagnostic options.
- [`references/test-coverage-guide.md`](./references/test-coverage-guide.md): Complete guide for test execution code coverage analysis, Istanbul/V8 JSON parsing, directory breakdowns, untracked files detection, line ranges, and CI gating.
- [`references/setup-extension-guide.md`](./references/setup-extension-guide.md): Architecture and plugin guides for extending `setup-linux.sh` and `setup-windows.ps1` in host projects.
- [`references/blueprints.md`](./references/blueprints.md): Overview of configuration blueprints and mandatory explicit subsystem configuration.
- [`references/audit.config.enterprise.example.ts`](./references/audit.config.enterprise.example.ts): Reference `.auditor/audit.config.ts` for Enterprise applications (Supabase backend, strict domain types, explicit rules).
- [`references/audit.config.gaming.example.ts`](./references/audit.config.gaming.example.ts): Reference `.auditor/audit.config.ts` for Interactive / Gaming applications (hybrid persistence, Web Workers chunk exemptions, custom families, local extensions).
- [`references/extensions/validate_button_governance.extension.ts`](./references/extensions/validate_button_governance.extension.ts): Reference extension blueprint for design system button governance and anti-clipping.
- [`references/extensions/validate_render_performance.extension.ts`](./references/extensions/validate_render_performance.extension.ts): Reference extension blueprint for GPU render hygiene and atmospheric overlays.
- [`references/plugins/`](./references/plugins/): Sample setup plugins for Docker database containers and local SSL certificates with `mkcert` (Bash & PowerShell).


