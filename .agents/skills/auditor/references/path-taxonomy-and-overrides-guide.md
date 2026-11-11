# Path Taxonomy & Dynamic Satellite Overrides Guide (`paths.*`)

This architectural reference defines the canonical taxonomy of filesystem roots in `.auditor/audit.config.ts` (`paths`) and their deterministic projection into satellite tools (`vite.config.ts`, `stylelint`, `html-validate`).

---

## 1. Single Source of Truth: The `paths` Taxonomy

All filesystem roots, code scanning scopes, and exemption boundaries MUST be declared strictly within `.auditor/audit.config.ts`. Satellite configuration files (`vite.config.ts`, `tsconfig.json`) are automatically generated and synchronized via AST during `npm run auditor:fix`.

| Property in `paths` | Architectural Purpose | Direct Effect on Satellite Configurations |
| :--- | :--- | :--- |
| `paths.srcRoots` / `paths.codeRoots` | Core application and library production source code | Absolute rigor: strict Java-style return types (`allowExpressions: true`), zero `: any`, domain-type enforcement. |
| `paths.scriptsRoots` / `paths.cliRoots` | Node.js maintenance scripts, database seeds, migrations, Supabase/Docker CLI tools, simulations (e.g. `['scripts', 'supabase']`). **Note**: `vite.plugins.ts` is also automatically included in script overrides by default. | Automatically injects dynamic AST overrides into `vite.config.ts`: `no-console: 'off'`, `unicorn/prefer-global-this: 'off'`, `typescript/no-floating-promises: 'off'`, `typescript/explicit-function-return-type: 'off'`, `max-depth: 'off'`, `no-unused-expressions: 'off'`, `@francogp/domain-type/unsafe-path-concat: 'off'`, `@francogp/domain-type/hardcoded-slash-path: 'off'`, `@francogp/domain-type/no-hardcoded-secrets: 'off'`, `@francogp/domain-type/no-raw-session-storage: 'off'`, `@francogp/domain-type/no-playwright-polling-waits: 'off'`. |
| `paths.testRoots` / `paths.e2eRoots` / `paths.integrationRoots` | Unit, integration, security, and Playwright E2E simulation test suites | Automatically injects dynamic AST overrides into `vite.config.ts`: `vitest/*: 'off'`, `no-console: 'off'`, `unicorn/prefer-global-this: 'off'`, `typescript/explicit-function-return-type: 'off'`, `max-depth: 'off'`, `no-script-url: 'off'`, `no-implied-eval: 'off'`, `no-new-func: 'off'`, `no-unused-expressions: 'off'`, `@francogp/domain-type/unsafe-path-concat: 'off'`, `@francogp/domain-type/hardcoded-slash-path: 'off'`, `@francogp/domain-type/no-raw-local-storage: 'off'`, `@francogp/domain-type/no-raw-session-storage: 'off'`, `@francogp/domain-type/require-storage-try-catch: 'off'`, `@francogp/domain-type/no-silent-promise-catch: 'off'`, `@francogp/domain-type/no-await-in-loops-query: 'off'`, `@francogp/domain-type/no-literal-suffix-constant: 'off'`, `@francogp/domain-type/no-raw-html-injection: 'off'`, `@francogp/domain-type/no-redundant-constant-alias: 'off'`, `@francogp/domain-type/no-insecure-random: 'off'`. |
| `paths.demoRoots` | Interactive UI prototypes, design system sandboxes, experimental map/editor sub-apps (e.g. `['ui-demo', 'demo', 'test_aventura']`) | Automatically injects dynamic AST overrides into `vite.config.ts`: `no-console: 'off'`, `unicorn/prefer-global-this: 'off'`, `typescript/explicit-function-return-type: 'off'`, `@francogp/domain-type/no-insecure-random: 'off'`, `@francogp/domain-type/no-broad-string-array: 'off'`, `@francogp/domain-type/no-gsap-layout-properties: 'off'`, `@francogp/domain-type/no-record-string-key: 'off'`. |
| `paths.ignoredDirs` | Nested sub-applications, monorepo packages, or secondary apps with independent life cycles (e.g. `['web-app']`) | Universally projected into `lint.ignorePatterns` and `fmt.ignorePatterns` in `vite.config.ts` and stylelint configurations, isolating the nested app from the root workspace audit. |
| `paths.ignoredPatterns` | Specific legacy third-party vendor files, polyfills, or immutable assets (e.g. `['src/paged.polyfill.ts']`) | Automatically excluded across all static analysis engines and satellite linters. |
| `paths.ignoreGlobs` | Workspace-level glob exclusion patterns | Automatically synchronized across all sub-auditors and satellite configurations via AST. |

---

## 2. Test Coverage Thresholds vs. Linter Exemption Distinction Mandate

> 🔴 **CRITICAL ARCHITECTURAL BOUNDARY**:
> Developers and AI agents are **STRICTLY AND CATEGORICALLY PROHIBITED** from attempting to silence linter errors or static analysis findings using `coverage.acknowledgedDegradations`.
> 
> - `coverage.acknowledgedDegradations` is evaluated **EXCLUSIVELY** by `validate_test_coverage` to tolerate documented, intentional coverage threshold drops in legacy or uninstrumentable modules.
> - `coverage.acknowledgedDegradations` **HAS ZERO EFFECT** on Oxlint, Oxfmt, Vite+, Stylelint, or AST plugins.
> - To properly exempt or relax rules for non-production modules, declare them in the appropriate `paths` property (`scriptsRoots`, `testRoots`, `demoRoots`, `ignoredDirs`) in `.auditor/audit.config.ts` and run `npm run auditor:fix`.

---

## 3. Diagnostic & Resolution Workflow for Consumer AI Agents

When an AI agent working in any repository encounters static analysis warnings or "false positives":

1. **Classify the Target File**: Determine whether the file is production application code, a Node.js maintenance script, an automated test fixture, an interactive demo, or a third-party polyfill.
2. **Inspect `.auditor/audit.config.ts`**: Check whether the containing folder is properly declared in `paths` (`scriptsRoots`, `testRoots`, `demoRoots`, `ignoredDirs`).
3. **Declare in SSoT & Synchronize**:
   - Add missing folder names to `paths` in `.auditor/audit.config.ts`.
   - Run `npm run auditor:fix`.
   - The Auditor's AST engine automatically synchronizes `vite.config.ts` and updates `lint.overrides` without human intervention.
4. **Prohibition on Manual Workarounds**: Never edit `vite.config.ts` by hand, never forge proxy scripts in `scratch/`, and never disable rules globally in the configuration without explicit human programmer authorization.

---

## 4. Invariant: Absolute Prohibition on Hardcoded Paths in AST Rules & Linter Plugins

### Why Hardcoded Paths in Linters Are Categorically Forbidden
Hardcoding folder names or path regexes inside linter rules (`domainTypeOxlintPlugin.ts`, AST visitors, static analyzers) is a critical architectural violation that destroys subsystem isolation and causes massive cross-project breakage:
1. **Legacy Analyzer Hangover**: Migrating standalone scripts into Oxlint rules must never preserve legacy directory filtering (`fname.includes('/tests/')`, `fname.includes('/suites/')`, `/(?:src|scripts|tests|database)/`).
2. **Patching Symptoms vs. Architecture**: When a rule triggers in a test, script, or fixture, patching the rule with an ad-hoc `if (fname.includes(...))` check is an anti-pattern. The rule must remain a pure syntax and semantic analyzer.

### The Unbreakable Architectural Rules
1. **Linter Plugins Never Inspect Directory Names**: Oxlint rules and AST plugins must strictly inspect syntax nodes and semantic code patterns (`defineStore`, `createApp`, `vi.mock`), never filesystem folder segments (`/tests/`, `/cli/`, `/suites/`, `/data/`, `/components/`, `/stores/`).
2. **Directory Scoping Belongs 100% to SSoT (`paths.*`)**:
   - What constitutes a test, CLI tool, maintenance script, or demo sandbox is defined exclusively by the project developer in `.auditor/audit.config.ts` (`paths.testRoots`, `paths.cliRoots`, `paths.scriptsRoots`, `paths.demoRoots`).
   - `npm run auditor:fix` projects these scopes dynamically into `vite.config.ts` overrides (`lint.overrides`), disabling rules selectively via `CANONICAL_DYNAMIC_TEST_OVERRIDE_RULES`, `CANONICAL_DYNAMIC_SCRIPT_OVERRIDE_RULES`, and `CANONICAL_DYNAMIC_DEMO_OVERRIDE_RULES`.
3. **Dynamic Rule Off-List Registration**:
   - If an AST rule should not apply to tests or scripts, add the rule ID to `DYNAMIC_TEST_OFF_RULES` or `DYNAMIC_SCRIPT_OFF_RULES` in `src/core/auditConfigDefaults.ts`.
   - Never add path-filtering logic to `domainTypeOxlintPlugin.ts`.
4. **Filename Inspection Restriction**:
   - `getRuleContextFilename` or `context.filename` is restricted strictly and exclusively to immutable file extensions (`.vue`, `.ts`, `.js`) or exact well-known root config filenames (`vite.config.ts`, `vitest.config.ts`).
   - Testing for path substrings or directory separators (`/`, `\\`) is strictly prohibited.

---

## 5. Granular File-Scoped Linter Overrides (`vitePlusConfig.lint.overrides`)

Under the **Zero-Ignore Mandate**, inline suppression comments (`eslint-disable`, `oxlint-disable`, `@ts-ignore`) are categorically forbidden (`oxlint-forbidden-suppression`), and disabling rules globally in `vitePlusConfig.lint.rules` is forbidden by the Anti-Castration Mandate.

However, a specific adapter module may legitimately implement a standard JavaScript/TypeScript protocol that collides with a heuristic linter rule—for example, a fluent database query builder (Supabase/PostgREST-compatible adapter) that intentionally implements `PromiseLike<T>` via a `then()` method, which triggers `unicorn/no-thenable`.

### Canonical SSoT Resolution Protocol

1. **Consult the Human Programmer (`ask_question`)**: Explain why the adapter requires the protocol (e.g., `PromiseLike<T>` compatibility so callers can `await db.from(...).select(...)` directly), why refactoring away `.then()` would break the SDK contract, and propose a narrow single-file override.
2. **Declare Narrow File-Scoped Override in `.auditor/audit.config.ts`**:
   ```typescript
   export default defineAuditConfig({
     // ...
     vitePlusConfig: {
       enabled: true,
       lint: {
         overrides: [
           {
             files: ['src/persistence/sqliteQueryBuilder.ts'],
             rules: {
               'unicorn/no-thenable': 'off'
             }
           }
         ]
       }
     }
   });
   ```
3. **Synchronize via `npm run auditor:fix`**: `resolveEffectiveLintOverrides` merges the SSoT override with the dynamic `testRoots`/`scriptsRoots`/`demoRoots` overrides and projects it deterministically into `vite.config.ts` while keeping `unicorn/no-thenable` strictly active across 99.9% of the codebase.
