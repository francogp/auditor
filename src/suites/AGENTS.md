# Purpose

Modular static analysis and architecture verification suites for `@francogp/auditor`. Contains 91 domain-agnostic suites organized across 6 canonical families: `architecture/`, `domain_data/`, `persistence/`, `performance/`, `security/`, and `documentation/`.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Family Organization**: Every suite resides in its canonical family directory.
- **Suite Naming Convention**: Generic suites follow `validate_<topic>.ts`.
- **Inheritance Mandate**: Every suite extends `BaseAuditor` or `FileScanAuditor`.
- **Mandatory Thematic Emojis (`icon`)**: Every suite declares its dedicated thematic emoji representing its domain.
- **Zero Untested Rules**: Every suite has a corresponding test in `tests/<suite_filename>.test.ts`.
- **Universal English Output & Dual Console Model Mandate**: All CLI outputs, terminal messages, progress logs, skip reasons, diagnostic violation messages (`addViolation({ message })`), rule descriptions (`ruleDescriptions`), package names (`packageName`), and remediation manuals (`ruleRemediations`) MUST be strictly and exclusively in 100% technical English. The console provides a strict dual output model: (1) Default AI mode emits minimal, token-efficient executive blocks without decorative emojis or Boxen frames (`[OK]`, `[FAIL]`). (2) Human mode (`human`, `--human`, `isHumanConsoleMode`) ONLY changes language to English, preserving full Box-Drawing frames, tables, speed badges (`🐇`, `🐢`, `🐘`), status icons (`✅`, `❌`, `⏭️`), step progression (`🔍 [X/Y]`), and emojis (`🎉`, `🚨`, `⚠️`, `🛠️`). Every sub-auditor MUST declare English `packageName: string` and English `ruleDescriptions: Record<TRuleId, string>`, with composed descriptions (`${packageName}: ${ruleDescription}`) strictly bounded to `<= 50` characters.
- **Universal Empirical Individual Timing Mandate**: Multi-rule suites must measure each declared rule individually using superclass execution wrappers (`this.runSubAuditorSync<T>`, `this.runSubAuditor<T>`, or `declareFileSubAuditor`). Synthetic duration division or duplicate batch stamping across rules is strictly prohibited. Calling `markRuleEvaluated` immediately prior to `runSubAuditorSync` is redundant boilerplate because `runSubAuditorSync` automatically marks the rule evaluated. Legacy batch methods (`runSubAuditorsBatch`, `runSubAuditorsBatchSync`) are strictly prohibited and fail loudly with an immediate runtime Error; monolithic external tools report individual rule telemetry directly via `this.reportRuleDuration(ruleId, durationMs)`. When a subsystem or directory does not exist or is disabled in config, suites must explicitly call `this.markRuleNotApplicable(ruleId, 'reason')` to prevent false passes with `(0 ms)` badges.

## Work Guidance

- Ensure all sub-auditors implement `toManifest()` accurately with description `<= 60` characters.
- Maintain pure English `packageName` and `ruleDescriptions` composed as `${packageName}: ${ruleDescription}` under `<= 50` characters.
- Use explicit 7-field orthogonal `ruleCapabilities` (`speed`, `phase`, `fix`, `md`, `ast`, `changedOnly`, `critical`) via `createUniformRuleCapabilities` or `createRuleCapabilities`, and use `this.scanFilesSinglePass(files, handlers)` backed by `WorkspaceFileCache` in multi-rule `BaseAuditor` suites.

## Verification

- Run all family suites: `vp test tests/validate_*.test.ts` (or `npm test -- tests/validate_*.test.ts`)
- Run light speed suites: `npm run auditor -- speed=light`

## Child DOX Index

- [`architecture/AGENTS.md`](./architecture/AGENTS.md): Architectural integrity suites (Vue, GSAP, CSS, Fallow, Z-index, simplification, SCSS).
- [`documentation/AGENTS.md`](./documentation/AGENTS.md): Documentation integrity suites (DOX, links, markdownlint).
- [`domain_data/AGENTS.md`](./domain_data/AGENTS.md): Domain modeling and O(1) data structure suites.
- [`persistence/AGENTS.md`](./persistence/AGENTS.md): Persistence integrity and SQL anti-pattern suites.
- [`performance/AGENTS.md`](./performance/AGENTS.md): Web performance, asset budgets, Core Web Vitals, and database query optimization suites.
- [`security/AGENTS.md`](./security/AGENTS.md): Security hardening, secret leak detection, ReDoS prevention, and OWASP compliance suites.
