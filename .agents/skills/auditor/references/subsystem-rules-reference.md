# Specialized Subsystem Rules & Technical Specifications Reference

This reference documents the detailed technical specifications, edge-case handling, and architectural invariants for specialized static analysis subsystems across `@francogp/auditor`.

---

## Table of Contents

1. [Stylelint, SCSS Architecture & Dart Sass Collision Casing](#1-stylelint-scss-architecture--dart-sass-collision-casing)
2. [AST Magic Numbers & Sentinels Governance](#2-ast-magic-numbers--sentinels-governance)
3. [Hierarchical By-File & Line Grouping (`auditor:by-file`)](#3-hierarchical-by-file--line-grouping-auditorby-file)
4. [Terminal Alignment & Monospace Variation Selectors](#4-terminal-alignment--monospace-variation-selectors)
5. [Idempotent `AGENTS.md` Injections & Anti-Duplication Pruning](#5-idempotent-agentsmd-injections--anti-duplication-pruning)
6. [Mermaid Diagram Syntax & Quoted Character Governance](#6-mermaid-diagram-syntax--quoted-character-governance)
7. [Local Git Repository Configuration Governance](#7-local-git-repository-configuration-governance)
8. [Zero False-Fix Mandate & Grounded Fixability Contract](#8-zero-false-fix-mandate--grounded-fixability-contract)
9. [Script Extensions Governance & Automated TypeScript Migration](#9-script-extensions-governance--automated-typescript-migration)
10. [Dynamic Exemption Architecture & Anti-Hardcoding Invariant (`isPathExempt`, `auditor-hardcoded-config`)](#10-dynamic-exemption-architecture--anti-hardcoding-invariant-ispathexempt-auditor-hardcoded-config)
11. [Vite+ Unified Toolchain Governance](#11-vite-unified-toolchain-governance-validate_vite_plus_config-validate_oxlint-validate_oxfmt)
12. [GSAP UI Animation Governance & Anti-Destruction Mandate](#12-gsap-ui-animation-governance--anti-destruction-mandate)
13. [Modern Performance, Security & Architecture Expansion Suites](#13-modern-performance-security--architecture-expansion-suites)
14. [Documented Commands Governance & Dual Resolution Protocol](#14-documented-commands-governance--dual-resolution-protocol)
15. [Dynamic Sub-Auditor Conformance Testing Mandate](#15-dynamic-sub-auditor-conformance-testing-mandate)
16. [Markdown Project SemVer Reference Synchronization Mandate](#16-markdown-project-semver-reference-synchronization-mandate)
17. [TypeScript Compiler Baseline & ES2025 Standard Mandate (`validate_tsconfig`)](#17-typescript-compiler-baseline--es2025-standard-mandate-validate_tsconfig)

---

## 1. Stylelint, SCSS Architecture & Dart Sass Collision Casing

### 1.1. Dart Sass Collision Casing (`scss-sass-collision-casing`)

Standard CSS functions sharing names with Dart Sass built-in color and math functions (`scale`, `scaleX`, `scaleY`, `scaleZ`, `scale3d`, `saturate`, `grayscale`, `invert`, `alpha`, `brightness`, `contrast`, `drop-shadow`, `hue-rotate`, `translateX`, `translateY`, `translateZ`, `translate3d`, `radial-gradient`, `linear-gradient`) MUST be written with PascalCase/CamelCase initials (e.g. `Scale(1.1)`, `Saturate(0.9)`, `Drop-Shadow(...)`, `hue-Rotate(...)`) inside SCSS and Vue SFC `<style>` blocks.

- **Root Cause**: Writing them in lowercase causes Dart Sass compiler crashes (`[sass] $color: 1.1 is not a color.`, `[sass] Missing argument $amount.`).
- **Stylelint Configuration**: `.stylelintrc.json` MUST keep:
  - `function-name-case: ['lower', { ignoreFunctions: ['/^[A-Z]/', 'Drop-Shadow', 'Drop-shadow', 'hue-Rotate', 'Hue-Rotate'] }]`
  - `value-keyword-case: ['lower', { camelCaseSvgKeywords: true, ignoreProperties: ['/--.*/'], ignoreFunctions: ['v-bind'] }]`
- **Auto-Repair**: In `--fix` mode, `validate_stylelint` automatically repairs colliding lowercase functions to capitalized casing on the PostCSS AST.

### 1.2. Stylelint Mixin Block Ordering (`order/order`, `hasBlock`)

In `.stylelintrc.json`, `order/order` partitions `@include` mixins by `hasBlock`:

1. **Blockless Mixins (`hasBlock: false`)**: Utility mixins (`@include button-reset;`, `@include flex-center;`) precede standard property declarations so properties can override defaults.
2. **Standard CSS Declarations**: Normal property rules.
3. **Mixins with Blocks (`hasBlock: true`)**: Responsive media queries (`@include respond-to('desktop') { ... }`) MUST follow declarations so media queries properly override base values down the CSS cascade in mobile-first layouts.
4. **Pseudo-classes & Nested Rules**: Follow mixins with blocks.

### 1.3. SCSS Preprocessor Enforcement (`validate_component_styles`)

- **SFC SCSS Mandate (`banned-plain-css-style`)**: Every `<style>` block in a `.vue` component MUST declare `lang="scss"`. Un-annotated `<style>` or `<style lang="css">` blocks trigger `severity: 'error'` with `fixable: true`.
- **Auto-Fix Upgrade**: `auditor fix` automatically upgrades tags to `lang="scss"` (e.g. `<style scoped>` -> `<style scoped lang="scss">`), processing blocks in reverse offset order to prevent corruption.
- **Raw CSS File Ban (`banned-raw-css-file`)**: Plain standalone `.css` stylesheets in `srcRoots` and `stylesRoots` are forbidden; all stylesheets must use `.scss`. Vendor exceptions are declared in `styles.exemptCssFiles`.

---

## 2. AST Magic Numbers & Sentinels Governance

The `validate_magic_numbers` suite inspects the TypeScript Compiler AST using `SharedAstContext` (with rule capability `ast: true`):

- **Zero Directory Ignores**: Constant data structures (`const`, `as const`, arrays, matrices, dictionaries, enums, literal types, readonly class fields, default parameter values) are recognized semantically without requiring directory ignore lists.
- **Built-in Sentinels**: Built-in base, calendar, and geometry sentinels (`-1, 0, 1, 2, 3, 4, 5, 10, 24, 60, 100, 360, 1000, 1024`) and next-tick delay `0` are permitted without false alarms.
- **Timer Delays**: Named constants are required for all positive timer delays (`setTimeout`, `setInterval`, `delayedCall`, `gsapSleep`). Host projects declare domain sentinels in `config.constants.exemptMagicNumbers` or line-level `// const-ok: <justification>`.
- **Vue Template Safeguard (`vue-template-magic-calculation`)**: Flags inline calculations (`*`, `/`, `%`) and comparisons involving numbers inside Vue `<template>` expressions while allowing markup props (`:span="12"`), index offsets (`+ 1`), and bounds checks (`.length === 0`).
- **AST Unwrapping Invariance**: In `validate_duplicate_constants`, constant declaration initializers are unwrapped through `ts.isAsExpression`, `ts.isTypeAssertionExpression`, and `ts.isParenthesizedExpression` before comparative evaluation to prevent false divergent alarms between typed and untyped literals.

---

## 3. Hierarchical By-File & Line Grouping (`auditor:by-file`)

All audit findings in `latest_audit.json` (`allFindings`) are stably sorted by relative file path (case-insensitive ASC) and line number ascending (`f.line ?? 0`), with structured index `findingsByFile` and an ephemeral lightweight index in `scratch/audits/by_file.json`.

The framework exposes `npm run auditor:by-file` (binary `auditor-by-file`), rendering a Box-Drawing tree:

```text
src/example.ts (3 incidencias)
  ├── L12: [Oxlint] Parámetro no tipado
  ├── L45: [Estilos] Valor mágico de color
  └── L89: [Simplify] Else redundante tras return
```

Supports filters: `file=<path>`, `category=<cat>`, `severity=<sev>`, `top=<n>`, `json`.

---

## 4. Terminal Alignment & Monospace Variation Selectors

Ambiguous symbols with Unicode variation selectors (e.g. `⏭️` / `\u23ED\uFE0F`) are treated as width 2 by Node's `string-width` but render as width 1 in many Linux monospace fonts, causing closed Box-Drawing borders (`boxen`, `cli-table3`) to misalign.

Inside closed Box-Drawing frames, terminal themes MUST use clean ASCII text (e.g. `(3 Omitidas)`) or standard universally supported wide emojis, avoiding ambiguous symbols with optional variation selectors.

---

## 5. Idempotent `AGENTS.md` Injections & Anti-Duplication Pruning

Auto-repair analyzers (`agentsMandateAnalyzer.ts`, `validate_agents_config_mandate.ts`, `validate_documentation_language.ts`) that inject or update mandatory sections in `AGENTS.md` must be strictly idempotent:

- Repeated runs of `auditor fix` or toggling language modes MUST NEVER duplicate lines or whitespace.
- The engine collects all matching line indices, updates the first instance in place, and splices out all subsequent duplicate matches in reverse order.
- If exactly one valid section already exists, disk writes are bypassed completely.

---

## 6. Mermaid Diagram Syntax & Quoted Character Governance

`validate_mermaid_syntax` is active in fast lint and doc presets (`speed: 'light', md: true`):

- Enforces valid diagram syntax across all Markdown files.
- Enforces strict double quotes on edge labels and node shapes containing special punctuation (`%`, `&`, `<`, `>`, `≠`, `≥`, `≤`, `(`, `)`, `/`, `?`, `!`, `+`, `:`, `=`, `#`, `*`, `~`) to prevent IDE and web renderer crashes.

---

## 7. Local Git Repository Configuration Governance

Governed by `validate_git_config` declaring `fix: 'priority'`:

- Enforces `core.filemode = false`, `core.autocrlf = input`, and `core.eol = lf` locally across all workspaces in `.git/config`.
- Prevents cross-platform line ending corruption and phantom executable bit changes across Linux and Windows.
- Runs with bootstrap priority during `auditor fix`.

---

## 8. Zero False-Fix Mandate & Grounded Fixability Contract

- **Capability vs Finding**: A sub-auditor declaring `capabilities.fix === true` signals that the suite possesses auto-repair logic for specific rules, NOT that every finding emitted by the suite is mechanically fixable.
- **Explicit Finding Fixability**: Each finding MUST report `fixable: true` ONLY when a dedicated, automated programmatic fixer exists for that exact violation (e.g. `Boolean(msg.fix)` from Oxlint/Stylelint or concrete AST replacements). Findings without automated remediation MUST report `fixable: false`.
- **Instance Getters in `BaseAuditor`**:
  - `getFixableErrors()`, `getFixableWarnings()`, `getFixableFindings()`, `getFixableErrorsByRule()`, `getFixableWarningsByRule()`.
  - Centralized static helpers: `BaseAuditor.countFixableFindings(findings)` and `BaseAuditor.computeFixableViolations(results, isFixMode)`.
- **Post-Fix Invariant**: When running under auto-fix mode (`auditor fix` / `npm run auditor:fix`), post-repair passes MUST guarantee `fixableErrors === 0`, completely eliminating false-positive auto-repair prompts on subsequent runs.

---

## 9. Script Extensions Governance & Automated TypeScript Migration

Governed by `validate_script_extensions` when `scriptExtensions.enabled !== false`:

- **Legacy Module Prohibition (`banned-mjs-extension`, `banned-cjs-extension`)**: Standalone `.mjs` and CommonJS `.cjs` files are prohibited anywhere in the repository (`severity: 'error'`).
- **Untyped Script Prohibition (`banned-raw-js-script`)**: Standalone `.js` scripts in `scriptsRoots` and `cliRoots` must be TypeScript (`.ts`). Standard configuration files (`vite.config.ts`, `postcss.config.js`, etc.) are exempt.
- **Automated `--fix` Migration**: `auditor fix` renames files to `.ts` on disk, rewrites relative import references across project code files, and updates package scripts in `package.json`.

---

## 10. Dynamic Exemption Architecture & Anti-Hardcoding Invariant (`isPathExempt`, `auditor-hardcoded-config`)

- **Zero Hardcoded Paths Invariant**: Sub-auditors and extensions are strictly prohibited from declaring hardcoded candidate file arrays (e.g. `['visuals.ts', 'constants.ts']`), local directory ignore lists, or arbitrary fallback filenames. All file targets, search roots, migration paths, and exclusion patterns MUST resolve dynamically from `.auditor/audit.config.ts`.
- **Auditor Hygiene Detector (`auditor-hardcoded-config`)**: Enforced at build and audit time by `validate_auditor_hygiene` via `hardcodedConfigDetector.ts`. It statically scans all sub-auditors and extensions in `src/suites/**/*.ts` and `scripts/auditors/**/*.ts`, flagging any hardcoded candidate arrays or ignore lists with `severity: 'error'`.
- **`FileScanAuditor` Native Exemption (`options.exemptPaths`)**:
  - `FileScanAuditor` accepts `exemptPaths?: readonly (string | RegExp)[]` in its constructor options.
  - Subclasses pass `config.<section>?.exemptPaths` directly to `super({ ... })`.
  - The base class automatically invokes `isPathExempt(doc.relPath, this.exemptPaths)` before dispatching to `scanDocument` or `scanFile`, eliminating manual loop boilerplate and duplicate code across suites.
- **Configurable Suite Exemptions**:
  - `webPerformance`: `exemptPaths`, `exemptSvgPaths`, `exemptImgClasses`
  - `queryPerformance`: `exemptPaths`, `exemptSelectStarPaths`
  - `securityHardening`: `exemptPaths` (and natively allows empty string `.innerHTML = ''`)
  - `codeSimplification`: `exemptPaths`, `allowMatrixLoops`
  - `scssArchitecture`: `exemptPaths`, `scopedMaxNestingDepth`, `allowPixelArtSpacing`, `allowedSpacingUnits`, `allowScopedColors`

---

## 11. Vite+ Unified Toolchain Governance (`validate_vite_plus_config`, `validate_oxlint`, `validate_oxfmt`)

- **Dynamic Exclusion Synchronization (`syncViteConfigWithAuditConfig`)**:
  Exclusion globs configured in `audit.config.ts` (`config.paths.ignoreGlobs`) are automatically projected into `lint.ignorePatterns` and `fmt.ignorePatterns` inside `vite.config.ts`. This guarantees third-party and scratch paths (`external/**`, `dist/**`, `scratch/**`) are never audited by Oxlint or Oxfmt, preventing false-positive violations.
- **Mandatory Oxlint Injected Rules & Anti-Castration**:
  `validate_vite_plus_config` enforces that `vite.config.ts` declares:
  - `@typescript-eslint/no-explicit-any: 'error'`
  - `@typescript-eslint/ban-ts-comment: 'error'`
  - `@typescript-eslint/consistent-type-assertions: ['error', { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }]`
  - Casting rules banning double unknown casts (`as unknown as`) and legacy `new Date()` / `Date.now()`.
  Silencing or setting any rule to `'off'`, `0`, or `'warn'` is strictly prohibited and fails under canonical thematic rules (`vite-plus-config-lint`, `vite-plus-config-core`). In `--fix` mode, the orchestrator automatically re-injects the mandatory baseline.
- **Source Code Formatting Hygiene (`validate_oxfmt`)**:
  `validate_oxfmt` validates project-wide code formatting using Oxfmt (`vp fmt --check` in check mode, and `vp fmt` in `--fix` mode), mapping diffs directly to actionable `AuditFinding` items with `fixable: true`.
- **Mandatory Canary Verification**:
  All mandatory injected rules and configuration toggles must have active automated canary tests asserting positive detection, negative compliance, and active vs disabled behavior.

---

## 12. GSAP UI Animation Governance & Anti-Destruction Mandate

Governed by `validate_gsap_animations.ts`:

- **Scope of Manual Timers (`manualTimersFrontend`)**: Timer enforcement (`setTimeout`, `setInterval`) is strictly scoped to frontend UI components and views (`.vue` or files within `componentsRoots` and `viewsRoots`). Legitimate Node.js CLI tools and runner scripts are permitted to use standard timers.
- **Universal GSAP Standard**: `gsapSleep` and `delayedCall` are universal standards for UI delays and animation timing across all projects, scaling deterministically with `timeScale(100)` during automated tests.
- **GPU Transforms vs Layout Properties (`gsap-no-layout-properties`)**: UI animations must use GPU transforms (`scaleX`, `scaleY`, `x`, `y`, `Flip`). When variable content height legitimately requires layout property animation (e.g. accordion dropdowns), developers must provide a statement-level `// layout-ok: <technical justification>` comment covering the tween.
- **Anti-Destruction Mandate for CSS/SCSS Transitions**: Developers and AI agents are strictly prohibited from deleting CSS/SCSS transitions (`transition: ...`) to pass audits or silence `gsap-banned-css-animations`. Interactive UI transitions must be cleanly migrated to GSAP tweens (`gsap.to`, `gsap.fromTo`, `useGSAP`). Deleting transitions without migration degrades UX and is treated as architectural sabotage.

---

## 13. Modern Performance, Security & Architecture Expansion Suites

1. **`validate_web_performance.ts`** (`performance` family, 7 rules):
   - Enforces modern image compression (WebP/AVIF).
   - Enforces `@font-face` `font-display: swap`.
   - Restricts inline SVG payload bounds (<=2KB).
   - Prohibits render-blocking CSS/script resources in `<head>`.
   - Restricts DOM depth limits (<=16 levels).
   - Mandates explicit layout dimensions (`width` and `height`) on media.
   - Enforces compressed streaming video codecs (`webm` / `preload="none"`).
2. **`validate_query_performance.ts`** (`performance` family, 6 rules):
   - Enforces foreign key secondary indexing in relational schemas.
   - Prohibits unbounded `SELECT *` in SQL/ORM queries.
   - Flags unpaginated collection queries missing `.limit` or `.range`.
   - Detects N+1 async database queries inside iterative loops.
   - Blocks full-table `SELECT COUNT(*)`.
   - Mandates cursor pagination over high `OFFSET`.
3. **`validate_security_hardening.ts`** (`security` family, 8 rules):
   - Prohibits hardcoded credentials, API keys, and sensitive tokens.
   - Prohibits insecure PRNG (`Math.random()`) for sensitive values.
   - Flags ReDoS-vulnerable regular expressions.
   - Prohibits raw HTML injection (`v-html`, `innerHTML`).
   - Mandates CSRF tokens in HTML mutation forms.
   - Prohibits dynamic evaluation (`eval`, `new Function`).
   - Bars permissive wildcard CORS headers (`Access-Control-Allow-Origin: *`).
   - Detects unvalidated open redirects.
4. **`validate_code_simplification.ts`** (`architecture` family, 6 rules):
   - Detects accumulated dead code and unreachable branches.
   - Flags boolean trap parameters.
   - Restricts excessive control flow nesting (>4 levels).
   - Flags redundant else branches after `return` or `throw`.
   - Flags premature abstraction wrappers.
   - Restricts massive switch branching (>10 cases).
5. **`validate_scss_architecture.ts`** (`architecture` family, 5 rules):
   - Enforces SCSS preprocessor architecture across Single File Components.
   - Governs `:deep()` selector scope.
   - Prohibits obsolete non-standard spacing units (`pt`, `in`, `cm`, `mm`).
   - Mandates design system theme token usage.
   - Limits SCSS selector nesting depth (<=4 levels).

---

## 14. Documented Commands Governance & Dual Resolution Protocol

Governed by `validate_documented_commands.ts`:

- Every command documented across Markdown files (READMEs, manuals, blueprints, AI skills) must be verified against executable truth:
  - `package.json.scripts`
  - `node_modules/.bin`
  - Declared dependencies
  - `config.documentation.allowedNpxBinaries`
- **Dual Triage Protocol**: When `validate_documented_commands` reports an unregistered npm script (`documented-cmd-unregistered-npm`), invalid syntax (`documented-cmd-invalid-npm-syntax`), or unregistered npx binary (`documented-cmd-unregistered-npx`), developers and AI agents must NOT blindly delete or suppress the documentation:
  1. **Declaration Path**: If the command represents a legitimate, intended project workflow, hook, test runner, or lifecycle script, declare it in `package.json.scripts` or dependencies.
  2. **Documentation Path**: If it is an obsolete legacy leftover or typo, update the documentation or use generic placeholders (e.g. `<script>`, `<command>`).

---

## 15. Dynamic Sub-Auditor Conformance Testing Mandate

Governed by `auditorContractConformance.ts` and `validate_auditor_tests.ts`:

Every sub-auditor and host extension must be covered by a dedicated Vitest unit test fulfilling the strict 6-point contract:

1. **Instantiation & Metadata**: Validated via `validateAuditorConstruction(auditor)`.
2. **Clean Path Testing**: Asserts `errors === 0`, `status === 'passed'`, and `findings.length === 0`.
3. **Violation Detection**: Asserts `errors > 0`, `status === 'failed'`, and `severity === 'error'`.
4. **Warning Path Verification**: Where applicable, asserts `warnings > 0`, `status === 'warned'`, and `severity === 'warning'`.
5. **100% Rule Coverage**: Asserts that 100% of declared rule IDs are explicitly tested.
6. **Fixer Verification (`checkFixVerification`)**: Every sub-auditor declaring `fix: 'normal' | 'priority'` must include a dedicated unit test invoking its fixer (`fix: true` or `fixMode: true`) and asserting `errors === 0` or `status === 'passed'` after remediation.

To prevent startup failures in consumer projects where Vitest is absent, `auditorContractConformance.ts` strictly avoids top-level static runtime imports of optional peer dependencies (`vitest`), using type-only imports and resolving runner hooks dynamically.

---

## 16. Markdown Project SemVer Reference Synchronization Mandate

Governed by `validate_markdown_code_references` and `src/core/markdownVersionValidator.ts`:

- **Universal Project Version Verification (`markdown-outdated-project-version`)**: All Markdown documentation across the workspace (including `README.md`, `.agents/skills/**`, and `docs/**`) is scanned across both natural prose and fenced code blocks (`` ```bash ``, `` ```json ``, `` ```ts ``).
- **Enforced Surfaces**:
  1. `github:francogp/auditor#vX.Y.Z` install tags must strictly match the current SemVer in `package.json`.
  2. Release tag examples (e.g. `` `#vX.Y.Z` ``) mentioning `@francogp/auditor` or release tags.
  3. `auditorVersion: 'X.Y.Z-build...'` properties in config examples.
  4. Explicit package version assertions `${pkgName}@X.Y.Z` or `${pkgName} vX.Y.Z`.
- **Exemptions**: Explicit historical changelogs (`CHANGELOG.md`, `v8-migration-guide.md`) and sentences describing legacy/historical context (e.g. `Since version X.Y.Z`, `legacy vX`, `auditor-update vX.Y.Z`).
- **Automated Synchronization**: In `--fix` mode (`auditor fix`) and automatically during `auditor-version bump`, all references on disk are updated to the active SemVer.

---

## 17. TypeScript Compiler Baseline & ES2025 Standard Mandate (`validate_tsconfig`)

Governed by `src/suites/architecture/validate_tsconfig.ts`:

- **Node.js 26+ Native Standard**: In modern Node 26+ and TypeScript 6.0+ environments, `compilerOptions.target` must strictly be `'ES2025'` or `'ESNext'` (`ALLOWED_TARGETS = ['es2025', 'esnext']`).
- **Violation Detection (`tsconfig-missing-strict-compiler-option`)**: Omitting `target` or specifying an outdated target (e.g. `'ES2022'`, `'ES2020'`, `'ES6'`) triggers a blocking violation (`severity: 'error'`).
- **Anti-Castration Mandate**: Enforces `strict: true`, `noImplicitAny: true`, `noUncheckedIndexedAccess: true`, and `moduleResolution: "bundler" | "node16" | "nodenext"`.
- **Automated Repair (`auditor fix`)**: Automatically upgrades outdated `target` values to `'ES2025'` and re-injects missing strict compiler options without degrading existing configurations.

---

## 18. Serial Fix Execution (`concurrency = 1`) & Pure TypeScript Compiler AST Configuration Sync

Governed by `src/cli/audit_full.ts`, `src/core/viteConfigAst.ts`, and `src/core/vitePlusConfigSync.ts`:

- **100% Serial Execution in Auto-Fix Mode (`concurrency = 1`)**: When running `auditor fix` (`--fix`), `audit_full.ts` enforces `effectiveConcurrency = 1`, disables `sharedAstContext` to ensure fresh disk reads between fixers, clears stale subprocess JSON files prior to each execution, and runs fix-enabled suites in deterministic 4-phase order (`FIX_MODE_EXPLICIT_ORDER`).
- **Pure AST & Native JSON Configuration Governance**: Configuration files (`vite.config.ts`, `playwright.config.ts`, `tsconfig.json`, `package.json`, `.fallowrc.json`, `.stylelintrc.json`, `.htmlvalidate.json`) and Vite+ import specifier migrations (`rewriteModuleSpecifiersToVitePlusAst`) are parsed, inspected, and mutated exclusively via the TypeScript Compiler AST (`ts.createSourceFile`, `ts.factory`, `ts.transform`, `ts.createPrinter()`) or native JSON parsing (`JSON.parse` / `ts.readConfigFile` + `JSON.stringify`), eradicating manual string manipulation and regex brace-counting.
