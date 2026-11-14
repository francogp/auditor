# Built-in Auditor Suites Catalog

This reference provides the comprehensive taxonomy and architectural grouping of official sub-auditor suites in `@francogp/auditor`.

---

## Architectural Suites (`src/suites/` — 55 Built-in Suites)

Official suites are discovered dynamically across the `src/suites/` directories:

### 1. `architecture/` (42 suites)

- **Setup & Satellite Configurations (`phase: 'setup'`)**: `validate_audit_config`, `validate_vite_plus_config`, `validate_tsconfig`, `validate_fallow_config`, `validate_stylelint_config`, `validate_html_validate_config`, `validate_playwright_config`, `validate_docker_config`, `validate_editorconfig`, `validate_npmrc_config`, `validate_git_config`, `validate_environment_engines`, `validate_dependency_minimums`, `validate_package_scripts`, `validate_cli_contracts`, `validate_script_commands`, `validate_script_extensions`, `validate_agent_plugin`, `validate_file_encoding`.
- **Unified AST & Code Hygiene (`validate_oxlint`, `validate_oxfmt`)**: `validate_oxlint` executes native Oxlint plugins (`vitest`, `node`, `promise`, `unicorn`, `typescript`, `vue`, `import`, `jsx-a11y`) plus all 68 `@francogp/domain-type` AST rules covering Domain-Type-First contracts, Valibot parity, GSAP UI animations/timers/ScrollTrigger, Vue SFC hygiene, Pinia/Router safety, Web Storage & database access, query performance, OWASP security hardening, secret leaks, CLI contracts, and sub-auditor hygiene. `validate_oxfmt` validates formatting via `vp fmt --check`.
- **Styles, Markup & Accessibility**: `validate_stylelint`, `validate_scss_architecture`, `validate_component_styles`, `validate_dead_css`, `validate_z_index`, `validate_typography_line_height`, `validate_html_validate`, `validate_template_ids`, `validate_accessibility`.
- **Intelligence, Testing, Security & Bundle Verification**: `validate_fallow`, `validate_similar_code`, `validate_magic_numbers`, `validate_type_coverage`, `validate_package_hygiene`, `validate_dependency_vulnerabilities`, `validate_auditor_tests`, `validate_test_fragmentation`, `validate_test_coverage`, `validate_audit_coverage`, `audit_project`, `audit_rules`, and `validate_bundle_budget` (`phase: 'post-build'`).

### 2. `documentation/` (10 suites)

- **Documentation & DOX Hygiene**: `validate_documented_commands`, `validate_dox_integrity`, `validate_agents_config_mandate`, `validate_documentation_language`, `validate_markdown_code_references`, `validate_markdown_links`, `validate_markdown_lint`, `validate_markdown_lint_config`, `validate_markdown_syntax`, `validate_mermaid_syntax`.

### 3. `domain_data/` (1 suite)

- **Algorithmic Optimizations**: `validate_o1_data_structures` (O(1) Set/Map lookups vs linear array searches; canonical domain & branded type rules execute inside `validate_oxlint`).

### 4. `performance/` (1 suite)

- **Web & Runtime**: `validate_web_performance` (Core Web Vitals, WebP/AVIF media, `font-display: swap`, inline SVG bounds, DOM depth; database query rules execute inside `validate_oxlint`).

### 5. `persistence/` (1 suite)

- **SQL & Schema Standards**: `validate_sql_anti_patterns` (relational schema & migration anti-patterns; client Web Storage and Valibot serializer parity rules execute inside `validate_oxlint`).

---

## Host Project Extensions (`scripts/auditors/`)

Domain-specific rules unique to host applications reside in `scripts/auditors/` extending `BaseAuditor` or `FileScanAuditor`, inheriting identical lifecycle phases, error reporting, and Box-Drawing formatting.
