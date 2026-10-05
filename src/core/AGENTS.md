# Purpose

Core runtime foundations of `@francogp/auditor`. Provides the base auditor OOP hierarchy (`BaseAuditor`, `FileScanAuditor`), contract types, configuration loading (`audit.config.ts`), terminal Box-Drawing rendering (`unifiedTheme`), shared AST parsing context, streaming execution runners, and filesystem permission guards.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Base Class Inheritance**: All sub-auditors across the system must inherit from `BaseAuditor` or `FileScanAuditor`.
- **Auditor Manifest DTO Contract (`toManifest`, `AuditorManifestDTO`)**: `BaseAuditor` exposes `toManifest(): AuditorManifestDTO` which packages `id`, `name`, `family`, `icon`, `description`, `capabilities`, `rules`, and optional `configKey` into an immutable DTO for AI agents and external tools. Sub-auditors must maintain clean, concise descriptions (`<= 60` chars) and omit redundant configuration summaries.
- **Universal Sub-Auditor Progress Contract & Description Standardization (`ICompositeAuditor`)**: All sub-auditors must declare or dynamically infer their sub-auditor checks via `ICompositeAuditor.getSubAuditors()`. `AuditorOptions` requires mandatory `packageName: string` and `ruleDescriptions: Record<TRuleId, string>` for all declared rules. Descriptions are composed strictly as `${packageName}: ${ruleDescription}`, enforced to `<= 50` characters (`MAX_AUDITOR_DESCRIPTION_LENGTH = 50`) without newlines, throwing an explicit runtime `Error` upon violation. Live step progress renders clean output (silent when 0 findings, `(🐛 ${count})` when findings > 0) and records findings into `StandardAuditResult.subAuditors` via `ensureSubAuditorsLogged()`.
- **Capability-Driven Auto-Coordination Mandate (`AuditorCapabilities`) & Zero-Boilerplate Defaults**: Sub-auditors declare execution capabilities (`fix`, `ast`, `changedSince`, `heavy`, `requiresBuild`) cleanly via `AuditorOptions.capabilities?: Partial<AuditorCapabilities>`. `BaseAuditor` guarantees immutable defaults (`DEFAULT_AUDITOR_CAPABILITIES` with all flags set to `false`). Sub-auditors only declare active capabilities where they differ from defaults (e.g. `capabilities: { fix: true }`).
- **Unified Terminal Rendering**: Output formatting must utilize `unifiedTheme` utilities (`renderBanner`, `renderBoxTable`, `formatStatusBadge`, `getVisualWidth`) within 80-column limits.
- **Config Single Source of Truth**: All dynamic thresholds, custom paths, and extensions are loaded via `auditConfig.ts`.
- **Raw Configuration Preservation for Validation (`_rawPaths`, `_rawConfig`)**: `defineAuditConfig` preserves original, unmerged configuration mappings (`_rawPaths`, `_rawConfig`) so configuration verification sub-auditors (`validate_audit_config`) only assert the physical existence of explicitly cited paths and extensions without false positives from unconfigured defaults.
- **Pure Configuration-Driven Resolution**: `loadZLayers` and path resolvers MUST NOT probe hardcoded candidate file paths (`visuals.ts`, `zLayers.ts`, `layers.ts`). They derive strictly from `config.styles.zLayers` or `config.styles.zLayersTsFile` / `config.domain.zLayersFile`, falling back to in-memory defaults if omitted.
- **Active by Default Subsystem Mandate & Zero Silent Skips (`assertAuditConfigComplete`)**: All configurations and subsystems in `@francogp/auditor` are ACTIVATED BY DEFAULT (`enabled: true`, `persistence.engine: 'supabase'`, `zLayersEnabled: true`, `requireInputIds: true`, `similarCode.enabled: true`, `packageScripts.enabled: true`, etc.). If a host project specifies nothing for a subsystem in `audit.config.ts`, that subsystem is automatically active with complete default configurations. Sub-auditors MUST NEVER silently bypass checks due to missing files or missing configuration; non-applicable subsystems in tool packages or non-web packages must be explicitly deactivated (`enabled: false`, `engine: 'none'`).
- **Parent-to-Worker Configuration Inheritance (`serializeAuditConfigToEnv`, `AUDIT_CONFIG_DATA`, `AUDIT_ACTIVE_CONFIG_FILE`)**: When executing sub-auditors in worker subprocesses (`streamingRunner.ts`), child processes run in isolated V8 environments without in-memory configuration cache. Because sub-auditor constructors are synchronous and cannot `await import('audit.config.ts')`, the orchestrator serializes the resolved configuration into environment variables (`process.env.AUDIT_CONFIG_DATA` if < 16KB, `process.env.AUDIT_ACTIVE_CONFIG_FILE` pointing to `scratch/cache/active_audit_config.json`, and `process.env.AUDIT_ACTIVE_CONFIG_ROOT`). `getAuditConfig()` and `loadAuditConfig()` synchronously reconstruct the full custom configuration from these sources before falling back to defaults. To preserve hermetic test isolation, environment configuration inheritance is strictly scoped to `AUDIT_ACTIVE_CONFIG_ROOT` matching `projectRoot`, ensuring isolated temporary test sandboxes load their own configuration.
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
- **Dynamic GitIgnore Requirements Contract (`GitIgnoreRegistry`, `GitIgnoreRequirement`)**: Sub-auditors (built-in or user-extended) and modules MUST NOT rely on hardcoded gitignore lists. Each sub-auditor declares its required gitignore entries via `AuditorOptions.gitIgnoreEntries?: readonly GitIgnoreRequirement[]` and static `gitIgnoreEntries` on the class. `BaseAuditor` dynamically registers them into `GitIgnoreRegistry`. `ValidateAuditConfigAuditor` dynamically collects requirements from all discovered modules and user extensions, verifying `.gitignore` coverage and providing auto-repair (`--fix`).
- **Mandatory Thematic Emojis (`AuditorOptions.icon`)**: Every sub-auditor and host extension MUST declare `icon: string` (e.g. `icon: '🏛️'`, `icon: '🎨'`, `icon: '🧩'`). If omitted or empty, `validateAuditorOptions` throws an explicit, loud runtime `Error`. Generic cogs (`⚙️`) are reserved exclusively for internal configuration validators.
- **Transparent Skip Status Contract (`markSkipped`, `status: 'skipped'`, `⏭️ SKIP`)**: When an auditor must be bypassed (environmental guards, config, or fast presets), it calls `this.markSkipped(reason)`. The streaming runner renders `⏭️  SKIP` in cyan with its thematic icon and justification. Summary tables reflect skipped suites: `(X Omitida ⏭️)` rather than masking them as passed.
- **Strict Booleans and Zero Backward Compatibility**: Configurations in `audit.config.ts` MUST use strict types and compile-time booleans (`true`/`false`). Legacy string values like `'off'`, `'on'`, `'essential'` have zero backward compatibility and fail validation immediately with loud errors.
- **Anti-Abuse Protection for `constants.exemptGlobs`**: Broad wildcards matching primary source trees (`**/*`, `src/**`) are strictly rejected. Glob patterns must target specific maintenance scripts or tabular seed data.
- **Permission Boundaries**: File operations adhere to Node.js 26 `--permission` flags with paths verified via `permissionGuard.ts` and `safePath.ts`.
- **Respect for unignoreDirs in Path Matching**: In `isPathIgnored()`, when an unignore directory set is specified (e.g. `unignoreDirs: ['.agents']`), ignore pattern matching MUST NOT ignore paths that contain an unignored ancestor directory, ensuring documentation and skill suites thoroughly scan documented assets even when general code scanners ignore them.

## Key Files

- [`astContext.ts`](./astContext.ts): Shared TypeScript AST cache and parsing engine.
- [`auditConfig.ts`](./auditConfig.ts): SSoT configuration loader (`getAuditConfig`, `defineAuditConfig`).
- [`auditContract.ts`](./auditContract.ts): Core TypeScript interfaces for findings, suites, and results.
- [`auditCoverage.ts`](./auditCoverage.ts): Audit file and rule coverage map tracking and verification engine.
- [`auditorBase.ts`](./auditorBase.ts): Abstract base classes (`BaseAuditor`, `FileScanAuditor`) and canonical ignore directories.
- [`exemptionPolicies.ts`](./exemptionPolicies.ts): Standardized file classification and complexity exemption policy definitions.
- [`gitIgnoreRegistry.ts`](./gitIgnoreRegistry.ts): Centralized registry for dynamic `.gitignore` requirements declared across sub-auditors and extensions.
- [`gitignoreMatcher.ts`](./gitignoreMatcher.ts): Gitignore parsing and fast path matching utility.
- [`permissionGuard.ts`](./permissionGuard.ts): Node.js `--permission` flag validation and capability probing.
- [`reportUtils.ts`](./reportUtils.ts): Utilities for serializing audit results and summaries to `scratch/audits/`.
- [`safePath.ts`](./safePath.ts): Cross-platform path normalization and traversal prevention.
- [`streamingRunner.ts`](./streamingRunner.ts): Streaming auditor execution engine.
- [`testCoverageCore.ts`](./testCoverageCore.ts): Centralized Istanbul/C8 coverage analysis engine and metric calculations.
- [`unifiedTheme.ts`](./unifiedTheme.ts): Box-Drawing terminal rendering engine.
- [`version.ts`](./version.ts): Runtime Single Source of Truth for framework version, build ID, and timestamp metadata.
- [`versionAnalyzer.ts`](./versionAnalyzer.ts): Heuristic Git diff analyzer, subsystem impact classifier, and SemVer bump calculation engine.

## Child DOX Index

- _This directory contains pure core foundation modules with no subdirectories._
