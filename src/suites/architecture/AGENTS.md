# Purpose

Architecture validation suites for `@francogp/auditor`. Enforces code quality, Vue SFC hygiene, reactivity rules (Pinia and pure computeds), GSAP animation guidelines, CSS dead code/duplication, bundle budgets, accessibility, security path traversal, and testing hygiene.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Domain-Agnostic Core Rules**: Architectural and style rules in `@francogp/auditor` MUST NOT contain hardcoded host domain terminology (such as billing identifiers, Pokémon Showdown entities, or specific vendor database roots). Domain identification patterns and fallback ID patterns derive dynamically from `config.domain`.
- **Configurable Z-Index Parity & Scale Definition**: `zIndexAudit` and `zIndexConstantDeclaration` support direct scale declaration via `config.styles.zLayers` and TypeScript file configuration (`config.styles.zLayersTsFile`), gracefully bypassing checks when `config.styles.zLayersEnabled === false`.
- **Dynamic SCSS Base Resolution**: Resets resolve base SCSS dynamically from `config.styles.baseScssFile` or by inspecting candidate stylesheets across `config.paths.stylesRoots`.
- **Conditional Interactive ID Enforcement**: `missingInteractiveId` activates strictly when `config.templates.requireInputIds === true`.
- **Dynamic Template DB Isolation & Safe Functions**: `dbInTemplates` derives prohibited database identifiers dynamically from `config.persistence.prohibitedTemplateIdentifiers` and `config.persistence.engine`. `functionCallsInTemplates` permits functions declared in `config.templates.safeTemplateFunctions` alongside universal defaults (`t`, `i18n`, `translate`, `typeof`).
- **Agnostic Constant Naming Whitelists**: `badConstantNames` and `noLiteralSuffixInConstantName` derive allowed numeric prefixes from `config.domain.allowedNumericConstantPrefixes` with generic defaults.
- **Centralized Test Path Detection & Pure Config Bundle Budgets**: `validate_bundle_budget.ts` utilizes `isTestPath()` to filter out tests dynamically, blocks heavy drivers (`postgres`, `node:sqlite`) and test runners in UI layers, and permits project-specific extensions via `config.bundle.forbiddenUiImports`. Chunk size budgets and byte thresholds (`maxClientChunkErrorBytes`, `maxClientChunkWarnBytes`, `budgets`) derive 100% dynamically from `config.bundle`, with zero hardcoded limits in framework code.
- **Canonical Catch Block Annotation Standard (`// catch-ok:`)**: `validate_error_suppression.ts` searches the inner body of catch blocks for `// catch-ok: <justification>` annotations and ignores comment lines to prevent regex literal false positives.
- **Static Security Gating & CLI Non-Production Classification**: `audit_project.ts` gates Fallow security checks on `config.security?.enabled !== false` and classifies CLI roots (`isCliPath()`) as non-production to eliminate false-positive CWE sink findings.
- **Configurable Template Call Patterns**: `validate_vue_sfc_hygiene.ts` checks `config.templates.forbiddenTemplateCallPatterns` dynamically.
- **Mandatory GSAP Animation Enforcement & UI Scoping**: Rules `manualAnimations`, `emptyVueTransitions`, `manualTimersFrontend`, and `noLayoutAnimationInGsap` are strictly mandatory (`severity: 'error'`). `manualTimersFrontend` verifies that timers are prohibited inside UI components and views (`.vue` or files within `componentsRoots`/`viewsRoots`), while permitting standard Node.js timers in background CLI processes. `noLayoutAnimationInGsap` detects any `(gsap|timeline|*Timeline|tl).(to|from|fromTo)` calls mutating layout properties. `gsapSleep` and `delayedCall` are universal framework standards for UI delays and animation timing across all projects, scaling deterministically with `timeScale(100)` in automated tests. Additional custom timer functions can be registered dynamically via `config.animation.customTimerFunctions`.
- **Zero Bespoke Host Rules & Extension Delegation**: Bespoke rules such as 360° button borders or canvas render optimizations are excluded from core. Component style validation in core focuses strictly on 1:1 SCSS-to-Vue pairing and orphaned SCSS files, delegating button governance to project-level extensions.
- **Bespoke View Lock Extracted as Extension**: Mobile pull-to-refresh overscroll locks (`overscroll-behavior: none !important;`) are excluded from core architectural suites and maintained as a host extension blueprint (`validate_overscroll_lock.extension.ts`) for mobile canvas applications.
- **Dynamic Test Hygiene & Fragmentation**: `validate_test_hygiene.ts` and `validate_test_fragmentation.ts` derive forbidden integration mock modules (`config.persistence.forbiddenMockModules`), locator constraints (`config.e2e.idLocatorsOnly`), minimum LOC limits (`config.paths.minTestFileLines`), and exempt test suites (`config.paths.testFragmentationWhitelist`) dynamically from configuration.
- **Configurable Pinia Mutation Authorization**: `validate_pinia_reactivity.ts` derives authorized state mutation files dynamically from `config.persistence.authorizedSaveFiles` and `config.pinia.authorizedMutationFiles`.
- **Configurable Constant Governance**: Duplicate constant detection ignores identifiers listed in `config.constants.ignoredNames`, and `magicNumbers` exempts numbers declared in `config.constants.exemptMagicNumbers`.
- **Configurable CLI Logging Cleanliness & Dynamic Test Auditor Locations**: `validate_console_cleanliness.ts` derives permitted terminal output roots dynamically from `config.paths.cliRoots` (`isCliPath()`), avoiding hardcoded framework paths. `validate_auditor_tests.ts` dynamically searches for sub-auditor test files across all paths declared in `config.paths.testRoots`.
- **Dynamic Persistence Mock Detection**: Forbidden integration mock targets in `validate_test_hygiene.ts` derive dynamically based on `config.persistence.engine` (`supabase`, `sqlite`, `hybrid`).
- **Zero Untested Rules & Rule Description Testing Mandate**: Every rule ID declared across these suites is verified with positive and negative test cases. `validate_auditor_tests.ts` statically inspects `ruleDescriptions` across sub-auditor sources and strictly requires that the corresponding test file in `tests/` references 100% of declared rule IDs.
- **Fallow Vector Semantic Cache Architecture & Setup Banner**: `validate_similar_code.ts` executes Fallow ML embeddings on Candle CPU (CPU-only, no GPU/CUDA) via `--threads ${os.availableParallelism()}`. Vector cache resides in `%LOCALAPPDATA%\fallow\similar-code` on Windows (`~/.cache/fallow/similar-code` on Linux). Subdirectories `models/` and `vectors/` are pre-created (`ensureFallowCacheDirs`) to prevent Windows `os error 3`, reducing run times from >230s down to ~2s. Setup failure displays a Box-Drawing warning banner with the manual command (`npx fallow similar-code setup --local --yes`).
- **Official Stylelint Engine, Sass Collision Casing & Component Style Hygiene**: `validate_stylelint.ts` evaluates CSS, SCSS, and Vue SFC styles with the official Stylelint engine, plugins (`stylelint-scss`, `stylelint-order`), and content-hashed caching (`scratch/cache/stylelint_cache.json`). It natively integrates `stylelintSassTrapsPlugin.ts` (`sass-traps/collision-casing`) to detect and auto-repair CSS functions colliding with Dart Sass (`Scale`, `Saturate`, `Drop-Shadow`, `hue-Rotate`, etc.). `validate_dead_css.ts` extracts scoped CSS selectors using AST parsing to detect orphaned classes in Vue templates.
- **Strict ESLint Flat Config Verification (`validate_eslint_config`)**: `validate_eslint_config.ts` statically analyzes `eslint.config.js` to ensure `@typescript-eslint/no-explicit-any: 'error'`, double cast restriction (`as unknown as`), `@typescript-eslint/ban-ts-comment` error status, and legacy `Date` ban are strictly present.
- **Dependency & Distribution Hygiene (`validate_package_hygiene`, `validate_package_distribution`)**: `validate_package_hygiene.ts` delegates to Knip to detect unused dependencies, phantom unlisted dependencies, and unused binary scripts. `validate_package_distribution.ts` delegates to Publint to verify export maps, types declarations, and dual ESM/CJS hazard avoidance.
- **Quantitative Type Coverage Thresholds (`validate_type_coverage`)**: `validate_type_coverage.ts` enforces type coverage percentage (default ≥95%) and identifies un-typed AST nodes to prevent type degradation.
- **Explicit Audit Config Path, Dynamic GitIgnore & Package Scripts Build Governance (`validate_audit_config`)**: `validate_audit_config.ts` enforces that every file, directory, migration path, style sheet, domain catalog, persistence definition, and extension explicitly cited in `audit.config.ts` physically exists on disk (`severity: 'error'`). Additionally, it dynamically aggregates `.gitignore` requirements declared by all active sub-auditors, registered user extensions, and `config.gitIgnore.extraRequiredEntries` without hardcoded lists, verifying that `.gitignore` contains all required entries and supporting automated repair (`--fix`). Furthermore, it governs `package.json` scripts across all projects (consumer applications and standalone package distributions alike): the `"build"` script MUST chain the full auditor prior to compilation (e.g. `"build": "auditor && vite build"` or `"build": "npm run audit && tsc -p tsconfig.build.json && ..."`), strictly banning `audit:for-commit` in builds (`audit-config-invalid-build-script`), and inspecting essential recommended scripts against `recommended_package_scripts_template.json` with auto-repair (`--fix`). Bypassing build chaining is permitted only via explicit configuration (`config.packageScripts.enforceBuildAudit: false`).
- **Anti-Abuse Protection for Constant Exemption Globs (`constants.exemptGlobs`)**: `validate_duplicate_constants.ts` supports exempting legitimate, highly repetitive domain files (such as database seeds, translation maps, or coordinate catalogs) via `config.constants.exemptGlobs`. To prevent erosion of constant quality standards, broad wildcards that could mask entire source trees (e.g. `'src/**'`, `'**'`, `'src/scripts/**'`) are strictly blocked at startup with an informative configuration error.
- **Mandatory Thematic Icon Contract**: Every sub-auditor must explicitly declare a unique, meaningful thematic emoji via `AuditorOptions.icon` (e.g. `'🎨'`, `'🧪'`, `'🛡️'`, `'🔘'`). Generic defaults are barred, ensuring clear visual identification across terminal streaming tables.
- **Living Standard Engines**: HTML standards validation delegates to `html-validate` instead of ad-hoc regex.
- **Strict Fallow Error Severity**: All Fallow-derived findings are treated strictly as `severity: 'error'`.

## Key Files

- [`audit_project.ts`](./audit_project.ts): Master architectural rule runner.
- [`audit_rules.ts`](./audit_rules.ts): Declarative rules and violation definitions.
- [`stylelintSassTrapsPlugin.ts`](./stylelintSassTrapsPlugin.ts): Native Stylelint plugin for Sass collision casing governance and auto-repair.
- [`validate_agent_plugin.ts`](./validate_agent_plugin.ts): Antigravity agent plugin registration verification.
- [`validate_audit_config.ts`](./validate_audit_config.ts): Verification that 100% of paths in `audit.config.ts` exist, dynamic `.gitignore` governance, and `package.json` build chaining.
- [`validate_audit_headers.ts`](./validate_audit_headers.ts): Verification of file headers and suppression prohibitions.
- [`validate_auditor_tests.ts`](./validate_auditor_tests.ts): Hermetic testing verifier ensuring clean path tests exist.
- [`validate_bundle_budget.ts`](./validate_bundle_budget.ts): Production bundle chunk size and runtime leak gate.
- [`validate_component_styles.ts`](./validate_component_styles.ts): Component-to-style 1:1 binding and orphan SCSS detection.
- [`validate_console_cleanliness.ts`](./validate_console_cleanliness.ts): Prohibition of `console.log` and `debugger` in source code.
- [`validate_dead_css.ts`](./validate_dead_css.ts): Dead scoped CSS class detection in Vue components powered by shared AST analysis.
- [`validate_duplicate_constants.ts`](./validate_duplicate_constants.ts): AST analysis of duplicate/divergent constants.
- [`validate_ephemeral_storage_isolation.ts`](./validate_ephemeral_storage_isolation.ts): Strict isolation of temporary files in `scratch/`.
- [`validate_error_suppression.ts`](./validate_error_suppression.ts): Prohibition of silent error suppression and blind schema fallbacks.
- [`validate_eslint.ts`](./validate_eslint.ts): ESLint execution and violation formatting.
- [`validate_eslint_config.ts`](./validate_eslint_config.ts): ESLint Domain-Type-First configuration auditor.
- [`validate_fallow_config.ts`](./validate_fallow_config.ts): Fallow configuration file integrity verifier.
- [`validate_html_validate.ts`](./validate_html_validate.ts): W3C/WHATWG Living Standard validator via `html-validate`.
- [`validate_accessibility.ts`](./validate_accessibility.ts): Vue and web accessibility (WCAG 2.2) standards via `eslint-plugin-vuejs-accessibility` and `vue-eslint-parser`.
- [`validate_native_paths.ts`](./validate_native_paths.ts): Path traversal (CWE-22) and unsafe file concatenation detector.
- [`validate_package_distribution.ts`](./validate_package_distribution.ts): Package.json export map, type definitions, and dual-package hazard auditor via Publint.
- [`validate_package_hygiene.ts`](./validate_package_hygiene.ts): Unused dependencies, phantom unlisted dependencies, and orphan package binaries via Knip.
- [`validate_pinia_reactivity.ts`](./validate_pinia_reactivity.ts): Pinia store destructuring and reactivity rules.
- [`validate_reactive_leaks.ts`](./validate_reactive_leaks.ts): Vue memory leak prevention (uncleaned listeners and timers).
- [`validate_reactive_purity.ts`](./validate_reactive_purity.ts): Pure computed getters and zero side-effects verification.
- [`validate_similar_code.ts`](./validate_similar_code.ts): Fallow ML vector and structural similar-code sub-auditor.
- [`validate_stylelint.ts`](./validate_stylelint.ts): Official Stylelint engine verifying CSS/SCSS hygiene, nesting, and Vue 3 SFC styles with content caching.
- [`validate_template_ids.ts`](./validate_template_ids.ts): Uniqueness of template element IDs for deterministic testing.
- [`validate_test_fragmentation.ts`](./validate_test_fragmentation.ts): Vitest anti-fragmentation (bans micro-test files <60 LOC).
- [`validate_test_hygiene.ts`](./validate_test_hygiene.ts): Playwright test hygiene (bans force clicks and blind timeouts).
- [`validate_type_check.ts`](./validate_type_check.ts): Strict TypeScript type checking via `vue-tsc`.
- [`validate_type_coverage.ts`](./validate_type_coverage.ts): TypeScript type coverage and untyped symbol threshold auditor.
- [`validate_typography_line_height.ts`](./validate_typography_line_height.ts): CSS typography line-height collision detector.
- [`validate_vue_sfc_hygiene.ts`](./validate_vue_sfc_hygiene.ts): Vue SFC `<script setup lang="ts">` standards and template hygiene.
- [`validate_z_index.ts`](./validate_z_index.ts): Z-Index layer scale synchronization between TypeScript and SCSS.

## Child DOX Index

- _This directory contains architecture sub-auditor suites with no subdirectories._
