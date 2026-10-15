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

The `validate_magic_numbers` suite inspects the TypeScript Compiler AST using `SharedAstContext` (`capabilities: { ast: true }`):

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
