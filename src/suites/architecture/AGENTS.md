# Purpose

Architecture validation suites for `@francogp/auditor`. Enforces code quality, Vue SFC hygiene, reactivity rules (Pinia and pure computeds), GSAP animation guidelines, CSS dead code/duplication, bundle budgets, accessibility, security path traversal, and testing hygiene.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Domain-Agnostic Core Rules**: Architectural and style rules in `@francogp/auditor` MUST NOT contain hardcoded host domain terminology (such as billing identifiers, Pokémon Showdown entities, or specific vendor database roots). Domain identification patterns and fallback ID patterns derive dynamically from `config.domain`.
- **Dynamic Persistence Mock Detection**: Forbidden integration mock targets in `validate_test_hygiene.ts` derive dynamically based on `config.persistence.engine` (`supabase`, `sqlite`, `hybrid`).
- **Zero Untested Rules**: Every rule ID declared across these suites is verified with positive and negative test cases.
- **Living Standard Engines**: HTML standards validation delegates to `html-validate` instead of ad-hoc regex.
- **Strict Fallow Error Severity**: All Fallow-derived findings are treated strictly as `severity: 'error'`.

## Key Files

- [`audit_project.ts`](./audit_project.ts): Master architectural rule runner.
- [`audit_rules.ts`](./audit_rules.ts): Declarative rules and violation definitions.
- [`validate_agent_plugin.ts`](./validate_agent_plugin.ts): Antigravity agent plugin registration verification.
- [`validate_audit_headers.ts`](./validate_audit_headers.ts): Verification of file headers and suppression prohibitions.
- [`validate_auditor_tests.ts`](./validate_auditor_tests.ts): Hermetic testing verifier ensuring clean path tests exist.
- [`validate_build_tools.ts`](./validate_build_tools.ts): Cross-platform discovery of native build tools.
- [`validate_bundle_budget.ts`](./validate_bundle_budget.ts): Production bundle chunk size and runtime leak gate.
- [`validate_component_styles.ts`](./validate_component_styles.ts): Component-to-style 1:1 binding and orphan SCSS detection.
- [`validate_console_cleanliness.ts`](./validate_console_cleanliness.ts): Prohibition of `console.log` and `debugger` in source code.
- [`validate_css_duplicates.ts`](./validate_css_duplicates.ts): CSS selector block duplication checker.
- [`validate_dead_css.ts`](./validate_dead_css.ts): Dead scoped CSS class detection in Vue components.
- [`validate_duplicate_constants.ts`](./validate_duplicate_constants.ts): AST analysis of duplicate/divergent constants.
- [`validate_ephemeral_storage_isolation.ts`](./validate_ephemeral_storage_isolation.ts): Strict isolation of temporary files in `scratch/`.
- [`validate_error_suppression.ts`](./validate_error_suppression.ts): Prohibition of silent error suppression and blind schema fallbacks.
- [`validate_eslint.ts`](./validate_eslint.ts): ESLint execution and violation formatting.
- [`validate_fallow_config.ts`](./validate_fallow_config.ts): Fallow configuration file integrity verifier.
- [`validate_html_validate.ts`](./validate_html_validate.ts): W3C/WHATWG Living Standard validator via `html-validate`.
- [`validate_mobile_accessibility.ts`](./validate_mobile_accessibility.ts): Mobile accessibility (viewport zoom, alt tags, tap targets).
- [`validate_native_paths.ts`](./validate_native_paths.ts): Path traversal (CWE-22) and unsafe file concatenation detector.
- [`validate_pinia_reactivity.ts`](./validate_pinia_reactivity.ts): Pinia store destructuring and reactivity rules.
- [`validate_reactive_leaks.ts`](./validate_reactive_leaks.ts): Vue memory leak prevention (uncleaned listeners and timers).
- [`validate_reactive_purity.ts`](./validate_reactive_purity.ts): Pure computed getters and zero side-effects verification.
- [`validate_render_performance.ts`](./validate_render_performance.ts): GPU render hygiene, blend-mode traps, and GSAP layout animation checks.
- [`validate_template_ids.ts`](./validate_template_ids.ts): Uniqueness of template element IDs for deterministic testing.
- [`validate_test_fragmentation.ts`](./validate_test_fragmentation.ts): Vitest anti-fragmentation (bans micro-test files <60 LOC).
- [`validate_test_hygiene.ts`](./validate_test_hygiene.ts): Playwright test hygiene (bans force clicks and blind timeouts).
- [`validate_type_check.ts`](./validate_type_check.ts): Strict TypeScript type checking via `vue-tsc`.
- [`validate_typography_line_height.ts`](./validate_typography_line_height.ts): CSS typography line-height collision detector.
- [`validate_vue_sfc_hygiene.ts`](./validate_vue_sfc_hygiene.ts): Vue SFC `<script setup lang="ts">` standards and template hygiene.
- [`validate_z_index.ts`](./validate_z_index.ts): Z-Index layer scale synchronization between TypeScript and SCSS.

## Child DOX Index

- _This directory contains architecture sub-auditor suites with no subdirectories._
