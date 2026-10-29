# Purpose

Specialized static analyzers supporting auditor suites. Contains AST constant analysis (`constantAnalyzer.ts`) and DOX documentation hierarchy validation (`doxAnalyzer.ts`). CSS, SCSS, and Vue SFC style verification is delegated to the official Stylelint engine (`validate_stylelint.ts`).

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Pure Diagnostics**: Analyzers produce canonical violation records without direct terminal side-effects.
- **Hermetic AST Processing**: Utilizes the shared TypeScript AST context and visitors for maximum performance and zero platform dependency.
- **Idempotent Mandate Injection (`agentsMandateAnalyzer.ts`)**: `injectOrUpdateMandateInAgentsMd` collects all matching line occurrences, replaces the first match, and splices out subsequent duplicates in reverse order. It avoids inserting redundant blank lines under `## Local Contracts` and bypasses disk writes if the canonical text is already satisfied.
- **Canonical Traversal Integration & Zero Ad-Hoc Post-Filtering (`doxAnalyzer.ts`)**: The DOX hierarchy scanner (`scanDoxHierarchy`) delegates all directory ignoring to `collectRepositoryFiles` using effective ignore directories (`getEffectiveIgnoreDirs`), which natively prunes `ALWAYS_IGNORE_DIRS` (including `.auditor`) at traversal time. `doxAnalyzer` is strictly prohibited from executing manual string-based ignore checks (`relPath !== '.auditor'`) over collected code paths.

## Key Files

- [`accessibilityModernAnalyzer.ts`](./accessibilityModernAnalyzer.ts): JSDOM (`includeNodeLocations: true`) + MagicString analyzer enforcing 7 modern WCAG/HTML/form rules (`a11y-no-positive-tabindex`, `a11y-no-aria-hidden-focusable`, `a11y-svg-accessibility`, `a11y-iframe-title-and-scroll`, `forms-identifier-input-type`, `forms-autocomplete-hygiene`, `html-dialog-popover-exclusivity`) and viewport zoom-lock repair.
- [`agentsMandateAnalyzer.ts`](./agentsMandateAnalyzer.ts): AGENTS.md mandate parsing, language validation, and in-place injection helper.
- [`auditRuleTypes.ts`](./auditRuleTypes.ts): Core rule descriptors, violation schemas, and matching primitives.
- [`cliContracts/`](./cliContracts/AGENTS.md): CLI contract scanner and modular AST detectors.
- [`constantAnalyzer.ts`](./constantAnalyzer.ts): TypeScript AST visitor detecting duplicate or divergent numeric/string constants.
- [`constantRules.ts`](./constantRules.ts): Rules and heuristics for magic numbers, constant names, numeric suffixes, and aliases.
- [`doxAnalyzer.ts`](./doxAnalyzer.ts): AGENTS.md documentation tree walker and link integrity verifier.
- [`homebrew/`](./homebrew/AGENTS.md): Modular analyzer engine and registry detecting homebrew anti-patterns in auditors and extensions.
- [`modernDomAstUtils.ts`](./modernDomAstUtils.ts): Shared JSDOM (`includeNodeLocations: true`, `VirtualConsole`) and TypeScript AST source-span utilities for modern web analyzers.
- [`nativePaths/`](./nativePaths/AGENTS.md): TypeScript AST semantic analyzer enforcing Node.js native standard library for filesystem paths and URLs.
- [`scssModernAnalyzer.ts`](./scssModernAnalyzer.ts): Recursive CSS/SCSS block & value AST parser (`postcss-value-parser` + `MagicString`) enforcing 8 modern layout, selector, and dark-mode rules (`scss-viewport-overflow-and-dvh`, `scss-overflow-clip-margin-trap`, `scss-prefer-user-invalid`, `scss-focus-outline-removal`, `typography-unclamped-viewport-font`, `scss-flexbox-dead-properties`, `scss-universal-expensive-selectors`, `dark-mode-color-scheme-missing`).
- [`securityModernAstAnalyzer.ts`](./securityModernAstAnalyzer.ts): TypeScript Compiler AST + JSDOM + YAML AST (`parseDocument`) analyzer enforcing 5 browser and CI/CD security rules (`security-postmessage-origin-validation`, `security-trusted-types-passthrough`, `security-external-sri-missing`, `security-cookie-samesite-partitioned`, `ci-github-actions-script-injection`).
- [`vueModernHygieneAnalyzer.ts`](./vueModernHygieneAnalyzer.ts): TypeScript Compiler AST (`SharedAstContext`) analyzer enforcing IME-safe Enter key submission (`ime-unsafe-enter-submit`) and pure non-mutating Vue template expressions (`vue-template-no-side-effects`).
- [`webPerfModernAnalyzer.ts`](./webPerfModernAnalyzer.ts): JSDOM + CSS AST analyzer enforcing 4 Core Web Vitals rules (`perf-lcp-lazy-conflict`, `perf-font-preload-crossorigin`, `perf-srcset-missing-sizes`, `perf-content-visibility-intrinsic-size`).
- [`zIndexRules.ts`](./zIndexRules.ts): Z-Index Design System Parity and isolated constant rules.

## Work Guidance

- Analyzers must be stateless or manage caches predictably through AST visitor structures.
- Return structured `Violation[]` objects rather than throwing unhandled runtime exceptions.
- Never hardcode candidate file names; resolve dynamic configuration through `getAuditConfig()`.

## Verification

- Run constant analyzer unit tests: `vp test tests/validate_constant_hygiene.test.ts` (or `npm test -- tests/validate_constant_hygiene.test.ts`)
- Run DOX analyzer unit tests: `vp test tests/validate_dox_integrity.test.ts` (or `npm test -- tests/validate_dox_integrity.test.ts`)

## Child DOX Index

- [`cliContracts/`](./cliContracts/AGENTS.md): CLI contract scanner and modular AST detectors.
- [`homebrew/`](./homebrew/AGENTS.md): Homebrew anti-pattern analyzer and detector registry.
- [`nativePaths/`](./nativePaths/AGENTS.md): Native path and URL integrity AST analyzer.
