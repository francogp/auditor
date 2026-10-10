# Purpose

Core runtime foundations of `@francogp/auditor`. Provides the base auditor OOP hierarchy (`BaseAuditor`, `FileScanAuditor`), contract types, configuration loading (`audit.config.ts`), terminal Box-Drawing rendering (`unifiedTheme`), shared AST parsing context, streaming execution runners, and filesystem permission guards.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Base Class Inheritance**: All sub-auditors across the system must inherit from `BaseAuditor` or `FileScanAuditor`.
- **Auditor Manifest DTO Contract (`toManifest`, `AuditorManifestDTO`)**: `BaseAuditor` exposes `toManifest(): AuditorManifestDTO` which packages `id`, `name`, `family`, `icon`, `description`, `capabilities`, `rules`, and optional `configKey` into an immutable DTO for AI agents and external tools. Sub-auditors must maintain clean, concise descriptions (`<= 60` chars) and omit redundant configuration summaries.
- **Universal Sub-Auditor Progress Contract & Description Standardization (`ICompositeAuditor`)**: All sub-auditors must declare or dynamically infer their sub-auditor checks via `ICompositeAuditor.getSubAuditors()`. `AuditorOptions` requires mandatory `packageName: string` and `ruleDescriptions: Record<TRuleId, string>` for all declared rules. Descriptions are composed strictly as `${packageName}: ${ruleDescription}`, enforced to `<= 50` characters (`MAX_AUDITOR_DESCRIPTION_LENGTH = 50`) without newlines, throwing an explicit runtime `Error` upon violation. Live step progress renders clean output (silent when 0 findings, `(🐛 ${count})` when findings > 0) and records findings into `StandardAuditResult.subAuditors` via `ensureSubAuditorsLogged()`.
- **Mandatory Constructor Contract & Complete Sub-Fields Mandate (`AuditorCapabilities`, Zero Fallbacks, Loud Failure)**: Every single parameter, property, and sub-field in sub-auditor constructors (`BaseAuditor`, `FileScanAuditor`) MUST be explicitly initialized with 100% completeness. Silent defaults, fallback objects, and partial contracts (`Partial<AuditorCapabilities>`) are STRICTLY AND CATEGORICALLY ERADICATED across the framework. Specifically, `AuditorCapabilities` requires all 9 boolean sub-fields (`fix`, `fixPriority`, `lint`, `md`, `ast`, `changedSince`, `heavy`, `requiresBuild`, `postRun`) to be declared explicitly as booleans (`true` or `false`) in every core suite and host extension. Auto-repairing suites (`capabilities.fix: true`) MUST explicitly initialize `fixableRuleIds: readonly TRuleId[]` with non-empty, registered rule IDs; suites without auto-repair (`fix: false`) are strictly prohibited from declaring `fixableRuleIds`. Metadata properties `configKey`, `defaultConfig`, and `criticalConfig` (can be empty object `{}`, but never undefined) are strictly mandatory across all suites; task factories and discovery runners MUST throw immediate, loud errors (`throw new Error(...)`) if any suite or extension omits explicit configuration keys, defaults, or critical contracts. When the framework updates, unmigrated extensions or sub-auditors lacking required constructor fields or sub-fields MUST fail loudly and block execution, forcing consumers to update all metadata explicitly.
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
  - `documentation.language`: Primary documentation and file writing language (`'en' | 'es'`, strictly defaults to `'en'`).
  - `documentation.chatLanguage`: AI assistant conversational chat communication language (`'en' | 'es'`, strictly defaults to `'es'`).
  - `documentation.knownValidAbstractPaths`: Abstract docs paths recognized as valid.
  - `documentation.languageExemptions`: Paths or globs exempt from natural language checks.
  - `pinia.authorizedMutationFiles`: Files authorized for direct pinia state mutations outside store actions.
  - `domain.enabled`: Allows clean deactivation of domain checks for standalone libraries and tool engines.
  - `domain.caseNormalizationExemptTokens`: Domain tokens exempt from lowercase validation (`['rpg', 'pvp', 'cuit', 'dni']`).
  - `domain.allowedStoreSetterPrefixes`: Custom Pinia store action setter prefixes (`['set', 'update', 'equip', 'assign']`).
  - `domain.allowedNumericConstantPrefixes`: Prefix exceptions for numeric constant names (`['GEN_', 'ISO_', 'RGB_']`).
  - `valibot.targets`: Explicit targets for bidirectional parity verification between TypeScript interfaces, Valibot schemas, serializers, and initial state factories.
- **Linter Fix Mode Deduplication (`isFixModeRequested`)**: `BaseAuditor` exposes `isFixModeRequested()` to detect CLI fix flags (`--fix`, `fix=true`), deduplicating fix mode handling across external linter wrappers.
- **Dynamic GitIgnore Requirements Contract (`GitIgnoreRegistry`, `GitIgnoreRequirement`)**: Sub-auditors (built-in or user-extended) and modules MUST NOT rely on hardcoded gitignore lists. Each sub-auditor declares its required gitignore entries via `AuditorOptions.gitIgnoreEntries?: readonly GitIgnoreRequirement[]` and static `gitIgnoreEntries` on the class. `BaseAuditor` dynamically registers them into `GitIgnoreRegistry`. `ValidateAuditConfigAuditor` dynamically collects requirements from all discovered modules and user extensions, verifying `.gitignore` coverage and providing auto-repair (`--fix`).
- **Dynamic Configuration File Requirements & Auto-Fix Contract (`ConfigFileRegistry`, `AuditorConfigFileRequirement`)**: Sub-auditors and extensions declare required configuration files and canonical scaffolding via `AuditorOptions.configFiles?: readonly AuditorConfigFileRequirement[]`. `BaseAuditor` dynamically registers them into `ConfigFileRegistry` and provides `resolveConfigFile()`, `ensureConfigFile()`, `verifyAndFixConfigFiles()`, and `isFixActive()`. In check mode, missing files emit explicit violations with `ruleId`; in `--fix` mode, canonical configurations are scaffolded automatically.
- **Dynamic Package Script Requirements & Collision Detection Contract (`PackageScriptRegistry`, `AuditorPackageScriptRequirement`, `[COLISIÓN DE COMANDOS]`)**: Sub-auditors (built-in or user-extended) and modules expose package script requirements. `BaseAuditor` automatically derives canonical script requirements (`audit:<short-id>`) by convention from `id`, `description`, and `family` with zero boilerplate, while custom aliases are registered explicitly. `PackageScriptRegistry` guarantees uniqueness of command names and throws an explicit loud error (`[COLISIÓN DE COMANDOS]`) if two sub-auditors or extensions declare conflicting commands under the same script name. `ValidateAuditConfigAuditor` dynamically collects requirements from all discovered modules and user extensions, verifying `package.json` scripts coverage and providing non-destructive auto-repair (`--fix`).
- **Mandatory Thematic Emojis (`AuditorOptions.icon`)**: Every sub-auditor and host extension MUST declare `icon: string` (e.g. `icon: '🏛️'`, `icon: '🎨'`, `icon: '🧩'`). If omitted or empty, `validateAuditorOptions` throws an explicit, loud runtime `Error`. Generic cogs (`⚙️`) are reserved exclusively for internal configuration validators.
- **Transparent Skip Status Contract (`markSkipped`, `status: 'skipped'`, `⏭️ SKIP`)**: When an auditor must be bypassed (environmental guards, config, or fast presets), it calls `this.markSkipped(reason)`. The streaming runner renders `⏭️  SKIP` in cyan with its thematic icon and justification. Summary tables reflect skipped suites: `(X Omitida ⏭️)` rather than masking them as passed.
- **Strict Booleans and Zero Backward Compatibility**: Configurations in `audit.config.ts` MUST use strict types and compile-time booleans (`true`/`false`). Legacy string values like `'off'`, `'on'`, `'essential'` have zero backward compatibility and fail validation immediately with loud errors.
- **Anti-Abuse Protection for `constants.exemptGlobs`**: Broad wildcards matching primary source trees (`**/*`, `src/**`) are strictly rejected. Glob patterns must target specific maintenance scripts or tabular seed data.
- **Permission Boundaries**: File operations adhere to Node.js 26 `--permission` flags with paths verified via `permissionGuard.ts` and `safePath.ts`.
- **Mandatory Auditor Constructor Contract & Zero-Bypass Architecture**: `BaseAuditor` and `FileScanAuditor` constructors strictly require explicit non-empty values for `id`, `name`, `description`, `family`, `packageName`, `icon`, `ruleDescriptions`, `configKey`, `defaultConfig`, and `criticalConfig` (can be empty object `{}`, but never undefined). Omitting any metadata throws an immediate, blocking runtime `Error`. Subsystem auditors must explicitly define `defaultConfig.enabled` as a boolean (`true` or `false`).
- **Mandatory Critical Configuration Contract & Additive-Only Governance (`criticalConfig`, Zero-Cast Contract Testing)**: Every sub-auditor (`BaseAuditor`, `FileScanAuditor`) and host extension (`scripts/auditors/**`) MUST define mandatory `criticalConfig: AuditorCriticalConfig` in its constructor `AuditorOptions`. Silent omission or `undefined` is strictly prohibited and throws an immediate, blocking runtime error. When no critical invariants are required, the suite MUST explicitly pass `criticalConfig: {}`. Critical configurations define non-negotiable architectural baselines (`requiredMinimums`, `forbiddenOverrides`, `validate`, `repair`): host projects are permitted to ADD further restrictions, but are STRICTLY PROHIBITED from removing, omitting, or degrading any canonical minimum. Omissions trigger blocking `audit-config-critical-violation` errors or automatic re-injection in `auditor fix`. Furthermore, unit tests verifying constructor validation against malformed runtime values MUST use flexible typed test harnesses (`Record<string, unknown>`) rather than `@ts-ignore`, `@ts-expect-error`, or double-casts (`as unknown as`), preserving the Zero-Ignore and type assertion hygiene mandates.
- **Dynamic Suite Gating Resolution (`evaluateSuiteStatus`)**: `suiteGating.ts` resolves suite enablement dynamically by querying `task.configKey` against `AuditConfig`. Adding new suites or extensions requires zero hardcoded registry entries in the core gating engine.
- **Closed Box-Drawing Font-Width Invariant & Color Palette (`unifiedTheme.ts`)**: Banners, notice boxes, and footers rendered via `boxen` must maintain strict 80-column alignment without border breakage. Ambiguous Unicode glyphs with variation selectors (`⏭️`) that render as width 1 in Linux monospace terminal fonts while evaluated as width 2 by `string-width` are replaced with clean ASCII labels (e.g. `(3 Omitidas)`). Box borders are dynamically colored according to semantic state (`red` for critical errors/failures, `yellow` for warnings, `green` for passed/approved, `magenta` for repair mode, and `cyan` for info).
- **Respect for unignoreDirs in Path Matching**: In `isPathIgnored()`, when an unignore directory set is specified (e.g. `unignoreDirs: ['.agents']`), ignore pattern matching MUST NOT ignore paths that contain an unignored ancestor directory, ensuring documentation and skill suites thoroughly scan documented assets even when general code scanners ignore them.
- **Auditor Contract Conformance Verification (`auditorContractConformance.ts`)**: All discovered core suites and host extensions must adhere to the 5-point conformance contract: (1) Instantiation & Metadata verification via `validateAuditorConstruction(auditor)`, (2) Clean Path testing (`errors === 0`, `status === 'passed'`, `findings.length === 0`), (3) Violation Detection (`errors > 0`, `status === 'failed'`, `severity === 'error'`), (4) Warning Path verification where warnings are generated (`warnings > 0`, `status === 'warned'`, `severity === 'warning'`), and (5) 100% of declared rule IDs tested. The framework exports `runAuditorContractConformanceTests()` providing dynamic whole-workspace test discovery in 2 lines for test runners.
- **Immediate Completion-Order Output & Head-of-Line Elimination (`streamingRunner.ts`)**: `TaskStreamCoordinator` discards sequential task buffering. As worker processes finish, `onTaskComplete` prints immediately under an atomic async `printLock`, maintaining unbroken per-suite blocks without interleaving between workers.
- **Dynamic Config Import Cache-Busting (`loadAuditConfig`)**: Dynamic ESM imports of `audit.config.ts` append a monotonic microsecond query parameter (`?t=${performance.now()}_${counter}`) to ensure programmatic reloads (e.g. after `auditor fix`) immediately reflect filesystem updates without Node.js module caching hazards.
- **Remote Project Execution Environment (`AUDITOR_HOME_DIR`, `AUDIT_PROJECT_ROOT`)**: When the CLI triggers remote project execution via `bootstrapCliProject()` (`--project`, `project=`, `-p`), `AUDITOR_HOME_DIR` preserves the canonical absolute path of the `@francogp/auditor` installation, while `AUDIT_PROJECT_ROOT` identifies the host workspace target. Core modules and path containment checks (`safeResolve`) align with `process.cwd()` pointing to the host project root, while package binary lookups and worker scripts resolve against `AUDITOR_HOME_DIR`.

## Key Files

- [`astContext.ts`](./astContext.ts): Shared TypeScript AST cache and parsing engine.
- [`auditConfig.ts`](./auditConfig.ts): SSoT configuration loader facade (`getAuditConfig`, `defineAuditConfig`).
- [`auditConfigAntiAbuse.ts`](./auditConfigAntiAbuse.ts): Anti-abuse assertions, glob constraints, and root exemptions for configuration policies.
- [`auditConfigDefaults.ts`](./auditConfigDefaults.ts): Canonical default configuration schema and `defineAuditConfig` builder.
- [`auditConfigLoader.ts`](./auditConfigLoader.ts): Configuration file discovery, loading, and child process environment serialization.
- [`auditConfigTypes.ts`](./auditConfigTypes.ts): Domain types, interfaces, and sub-configuration contracts for the audit engine.
- [`auditConfigValidators.ts`](./auditConfigValidators.ts): Configuration validation rules, legacy config blockers, and anti-abuse policies.
- [`auditContract.ts`](./auditContract.ts): Core TypeScript interfaces for findings, suites, and results.
- [`auditCoverage.ts`](./auditCoverage.ts): Audit file and rule coverage map tracking and verification engine.
- [`auditorBase.ts`](./auditorBase.ts): Abstract base classes (`BaseAuditor`, `FileScanAuditor`) and canonical ignore directories.
- [`auditorContractConformance.ts`](./auditorContractConformance.ts): Dynamic auditor discovery, constructor contract, metadata validation, and test conformance engine.
- [`auditorEnvironment.ts`](./auditorEnvironment.ts): Environment detection helper checking strictly for `AUDITOR_ENV=production`.
- [`auditPathPredicates.ts`](./auditPathPredicates.ts): Project root matching and path category predicates.
- [`auditProjectIdentity.ts`](./auditProjectIdentity.ts): Project identity predicates and framework self-provider detection.
- [`auditRootMatcher.ts`](./auditRootMatcher.ts): Path root matching primitives.
- [`auditTestPredicates.ts`](./auditTestPredicates.ts): Test and spec path detection predicates driven by audit.config.ts.
- [`auditZLayers.ts`](./auditZLayers.ts): Z-Layers SCSS parsing, TypeScript layer map extraction, and fallback definitions.
- [`auditedDocument.ts`](./auditedDocument.ts): Central AuditedDocument engine providing O(log N) line lookup, lexical indexing, Vue SFC blocks, and auto-fix coordination.
- [`configFileRegistry.ts`](./configFileRegistry.ts): Centralized registry for dynamic configuration file requirements and auto-fix scaffolding declared across sub-auditors and extensions.
- [`exemptionPolicies.ts`](./exemptionPolicies.ts): Standardized file classification and complexity exemption policy definitions.
- [`fileTreeRenderer.ts`](./fileTreeRenderer.ts): Box-Drawing hierarchical file and finding tree renderer.
- [`gitIgnoreRegistry.ts`](./gitIgnoreRegistry.ts): Centralized registry for dynamic `.gitignore` requirements declared across sub-auditors and extensions.
- [`gitignoreMatcher.ts`](./gitignoreMatcher.ts): Gitignore parsing and fast path matching utility.
- [`markdownReport.ts`](./markdownReport.ts): Comprehensive Markdown audit report generator.
- [`packageJson.ts`](./packageJson.ts): Canonical package.json caching, reading, and DTO provider.
- [`packageScriptRegistry.ts`](./packageScriptRegistry.ts): Centralized registry for recommended package scripts, collision detection, and command requirements declared across sub-auditors and extensions.
- [`permissionGuard.ts`](./permissionGuard.ts): Node.js `--permission` flag validation and capability probing.
- [`reportUtils.ts`](./reportUtils.ts): Utilities for serializing audit results and summaries to `scratch/audits/`.
- [`safePath.ts`](./safePath.ts): Cross-platform path normalization and traversal prevention.
- [`scannerUtils.ts`](./scannerUtils.ts): Lexical scanning utilities for advancing past string literals, comments, and multiline Vue SFC suppressions.
- [`streamingRunner.ts`](./streamingRunner.ts): Streaming auditor execution engine.
- [`suiteGating.ts`](./suiteGating.ts): Single Source of Truth for suite enablement evaluation and CLI list filter options.
- [`terminalVisuals.ts`](./terminalVisuals.ts): Visual width calculation, text alignment, and ANSI color formatting helpers.
- [`testCoverageCore.ts`](./testCoverageCore.ts): Centralized Istanbul/C8 coverage analysis engine and metric calculations.
- [`unifiedTheme.ts`](./unifiedTheme.ts): Box-Drawing terminal rendering engine.
- [`version.ts`](./version.ts): Runtime Single Source of Truth for framework version, build ID, and timestamp metadata.
- [`versionAnalyzer.ts`](./versionAnalyzer.ts): Heuristic Git diff analyzer, subsystem impact classifier, CandidateVersions contract, and SemVer bump calculation engine (supporting major, minor, patch, and build).
- [`vueSfcParser.ts`](./vueSfcParser.ts): Canonical Vue Single File Component (SFC) block extractor for template, script, and style blocks.

## Work Guidance

- Core abstractions must remain hermetic with zero side-effects on stdout during instantiated runs.
- Terminal rendering in `unifiedTheme.ts` must respect 80-column limits and calculate string widths via `getVisualWidth`.
- Configuration loading must maintain active-by-default behavior and prevent silent bypasses.

## Verification

- Run core unit tests: `npm test -- tests/unified_theme.test.ts`
- Run config loader tests: `npm test -- tests/validate_audit_config.test.ts`
- Run architecture rules: `npm run auditor:lint`

## Child DOX Index

- _This directory contains pure core foundation modules with no subdirectories._
