# Purpose

Core runtime foundations of `@francogp/auditor`. Provides the base auditor OOP hierarchy (`BaseAuditor`, `FileScanAuditor`), contract types, configuration loading (`audit.config.ts`), terminal Box-Drawing rendering (`unifiedTheme`), shared AST parsing context, streaming execution runners, and filesystem permission guards.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Base Class Inheritance**: All sub-auditors across the system must inherit from `BaseAuditor` or `FileScanAuditor`.
- **Unified Terminal Rendering**: Output formatting must utilize `unifiedTheme` utilities (`renderBanner`, `renderBoxTable`, `formatStatusBadge`, `getVisualWidth`) within 80-column limits.
- **Config Single Source of Truth**: All dynamic thresholds, custom paths, and extensions are loaded via `auditConfig.ts`.
- **Pure Configuration-Driven Resolution**: `loadZLayers` and path resolvers MUST NOT probe hardcoded candidate file paths (`visuals.ts`, `zLayers.ts`, `layers.ts`). They derive strictly from `config.styles.zLayers` or `config.styles.zLayersTsFile` / `config.domain.zLayersFile`, falling back to in-memory defaults if omitted.
- **Mandatory Explicit Configuration & Zero Silent Skips (`assertAuditConfigComplete`)**: Host projects consuming `@francogp/auditor` MUST explicitly declare all required subsystems (`persistence`, `bundle`, `styles`, `templates`, `agentPlugin`) in `audit.config.ts`, declaring either active configuration options or explicit deactivation (`enabled: false` or `engine: 'none'`). Sub-auditors and entrypoints MUST NEVER silently bypass checks due to missing files or missing configuration.
- **Configurable Bundle Auditing for Non-Web Packages (`bundle.enabled: false`)**: `AuditBundleConfig` in `auditConfig.ts` must expose `readonly enabled?: boolean`. Sub-auditors and the `auditor-bundle` CLI check `bundleConfig?.enabled === false` and exit 0 cleanly with an informational notice, avoiding false-positive gate failures in non-bundled packages or standalone CLI engines.
- **Configurable Subsystem Options**: `auditConfig.ts` exposes granular configuration options to prevent hardcoded host assumptions:
  - `paths.minTestFileLines`: Threshold for test file anti-fragmentation (defaults to 60, <= 0 disables).
  - `paths.testFragmentationWhitelist`: Whitelisted test files exempt from maximum line count anti-fragmentation rules.
  - `paths.testFilePatterns`: Custom file patterns recognized as test code (`.simulation.`, `.spec.`, etc.).
  - `paths.cliRoots`: CLI and tool root directories permitted to emit console output without logging wrappers (`isCliPath`).
  - `persistence.forbiddenMockModules`, `positionalArrayColumns`, `allowedDatabaseDirs`, `allowedDatabaseFiles`: Granular persistence constraints.
  - `persistence.authorizedSaveFiles`: Files authorized for persistent save key coordination.
  - `persistence.prohibitedTemplateIdentifiers`: Database identifiers barred from Vue templates (`['supabase', 'db', 'sqlite']`).
  - `persistence.allowedHosts`: Hostnames permitted for `safeFetch` SSRF prevention.
  - `e2e.idLocatorsOnly`: Flag to enforce ID-only Playwright locators.
  - `templates.tooltipComponents`, `templates.forbiddenTemplateCallPatterns`: Recognized tooltip names and forbidden helper call patterns in templates.
  - `templates.safeTemplateFunctions`: Functions whitelisted for execution inside Vue templates alongside framework defaults (`t`, `i18n`, `translate`, `typeof`).
  - `bundle.maxClientChunkWarnBytes`: Maximum warning byte limit for client chunks.
  - `bundle.maxClientChunkErrorBytes`: Maximum error byte limit for client chunks.
  - `bundle.budgets`: Per-chunk regex pattern matchers and budget limits.
  - `bundle.forbiddenUiImports`: Custom list of forbidden runtime value imports in UI layers.
  - `security.enabled`: Flag to enable or disable static Fallow CWE vulnerability analysis.
  - `styles.zLayers`: Direct numeric scale mapping for Z-index layers (`{ BASE: 0, MODAL: 11000, ... }`).
  - `styles.zLayersTsFile`: Path to TypeScript Z_LAYERS definition module.
  - `styles.baseScssFile`: Base SCSS stylesheet for global styling resets.
  - `styles.lineHeightOverlapCheck`: Optional flag to enable/disable multiline line-height collision detection.
  - `styles.buttonGovernance`: Configuration for button styling consistency.
  - `animation.customTimerFunctions`: Additional timer function names recognized in UI animations (alongside standard `gsapSleep` and `delayedCall`).
  - `constants.ignoredNames`: Identifiers exempt from duplicate constant detection.
  - `constants.allowedNumericPrefixes`: Identifier prefixes exempt from numeric suffix constraints (`['GEN_', 'ISO_', 'BASE_']`).
  - `constants.exemptMagicNumbers`: Numeric literals exempt from magic numbers validation.
  - `documentation.knownValidAbstractPaths`: Abstract docs paths recognized as valid.
  - `pinia.authorizedMutationFiles`: Files authorized for direct pinia state mutations outside store actions.
  - `domain.enabled`: Allows clean deactivation of domain checks for standalone libraries and tool engines.
  - `domain.caseNormalizationExemptTokens`: Domain tokens exempt from lowercase validation (`['rpg', 'pvp', 'cuit', 'dni']`).
  - `domain.allowedStoreSetterPrefixes`: Custom Pinia store action setter prefixes (`['set', 'update', 'equip', 'assign']`).
  - `domain.allowedNumericConstantPrefixes`: Prefix exceptions for numeric constant names (`['GEN_', 'ISO_', 'RGB_']`).
- **Linter Fix Mode Deduplication (`isFixModeRequested`)**: `BaseAuditor` exposes `isFixModeRequested()` to detect CLI fix flags (`--fix`, `fix=true`), deduplicating fix mode handling across external linter wrappers.
- **Permission Boundaries**: File operations adhere to Node.js 26 `--permission` flags with paths verified via `permissionGuard.ts` and `safePath.ts`.

## Key Files

- [`astContext.ts`](./astContext.ts): Shared TypeScript AST cache and parsing engine.
- [`auditConfig.ts`](./auditConfig.ts): SSoT configuration loader (`getAuditConfig`, `defineAuditConfig`).
- [`auditContract.ts`](./auditContract.ts): Core TypeScript interfaces for findings, suites, and results.
- [`auditorBase.ts`](./auditorBase.ts): Abstract base classes (`BaseAuditor`, `FileScanAuditor`) and canonical ignore directories.
- [`gitignoreMatcher.ts`](./gitignoreMatcher.ts): Gitignore parsing and fast path matching utility.
- [`permissionGuard.ts`](./permissionGuard.ts): Node.js `--permission` flag validation and capability probing.
- [`reportUtils.ts`](./reportUtils.ts): Utilities for serializing audit results and summaries to `scratch/audits/`.
- [`safePath.ts`](./safePath.ts): Cross-platform path normalization and traversal prevention.
- [`streamingRunner.ts`](./streamingRunner.ts): Streaming auditor execution engine.
- [`unifiedTheme.ts`](./unifiedTheme.ts): Box-Drawing terminal rendering engine.
- [`version.ts`](./version.ts): Runtime Single Source of Truth for framework version, build ID, and timestamp metadata.
- [`versionAnalyzer.ts`](./versionAnalyzer.ts): Heuristic Git diff analyzer, subsystem impact classifier, and SemVer bump calculation engine.

## Child DOX Index

- _This directory contains pure core foundation modules with no subdirectories._
