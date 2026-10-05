# Host Project Configuration Blueprints

This document contains complete, validated, and domain-agnostic configuration blueprints for integrating and migrating host projects to `@francogp/auditor`.

---

## 🏛️ Active by Default Subsystem Mandate & Zero Silent Skips

All configurations and subsystems in `@francogp/auditor` are **ACTIVATED BY DEFAULT** (`enabled: true`, `persistence.engine: 'supabase'`, `zLayersEnabled: true`, `requireInputIds: true`, `similarCode.enabled: true`, `packageScripts.enabled: true`, etc.). If a host project omits any subsystem in `.auditor/audit.config.ts`, that subsystem automatically defaults to active with complete standard defaults. Host projects only need to declare configurations to customize settings or explicitly deactivate non-applicable subsystems (`enabled: false`, `engine: 'none'`). Sub-auditors never silently bypass checks due to missing files or missing configuration:

1. `persistence`: Database engine (defaults to `'supabase'`; or `'sqlite'`, `'postgres'`, `'hybrid'`, `'none'`). Configures `prohibitedTemplateIdentifiers`, `authorizedSaveFiles`, and `allowedHosts` according to host infrastructure.
2. `bundle`: Bundle chunk budgets and size thresholds (defaults to `enabled: true` with `maxClientChunkWarnBytes`, `maxClientChunkErrorBytes`, `budgets`, or `enabled: false`). Heavy Web Worker chunks or simulation data modules are declared in `exemptChunkPrefixes`. Forbidden UI value imports are extended in `forbiddenUiImports`.
3. `fallow.security` (or `security`): Fallow CWE static vulnerability gating (defaults to `enabled: true`). Disables alerts for pure CLI tools and runners (`enabled: false`).
4. `styles`: Z-layers (defaults to `zLayersEnabled: true`, direct scale in `zLayers`, SCSS file in `zLayersScssFile`, TS file in `zLayersTsFile`), base SCSS file (`baseScssFile`), line-height overlap check (`lineHeightOverlapCheck: true`), and utility classes.
5. `templates`: HTML/Vue template hygiene requirements (defaults to `requireInputIds: true`, permitted safe functions `safeTemplateFunctions?: string[]`, forbidden render loop patterns `forbiddenTemplateCallPatterns?: string[]`).
6. `animation`: Mandatory GSAP animation governance. `gsapSleep` and `delayedCall` are universal framework standards for UI delays; additional custom timer functions are declared in `customTimerFunctions?: string[]`.
7. `constants`: Duplicate constant ignore names (`ignoredNames?: string[]`), allowed numeric prefixes (`allowedNumericPrefixes?: string[]`), exempt magic numbers (`exemptMagicNumbers?: number[]`), and anti-abuse specific file exemption globs (`exemptGlobs?: string[]`).
8. `documentation`: Known valid abstract code reference paths (`knownValidAbstractPaths?: string[]`).
9. `pinia`: Authorized external store mutation files (`authorizedMutationFiles?: string[]`).
10. `paths`: Directory structure, CLI roots (`cliRoots?: string[]`), and test fragmentation whitelist (`testFragmentationWhitelist?: string[]`).
11. `domain`: Finite domain types (`finiteDomainTypes`), infra ID whitelists (`infraIdWhitelist`), normalization-exempt tokens (`caseNormalizationExemptTokens`), allowed store setter prefixes (`allowedStoreSetterPrefixes`), and allowed numeric constant prefixes (`allowedNumericConstantPrefixes`).
12. `agentPlugin`: AI agent plugin integration (defaults to `enabled: true`).
13. `fallow`: Deep static intelligence, security, and semantic code similarity (defaults to `enabled: true`, `security: { enabled: true }`, `similarCode: { enabled: true, threshold: 0.95, ignoreSameFile: true }`).
14. `packageScripts`: Build script chaining and recommended scripts governance (defaults to `enabled: true`, `enforceBuildAudit: true`, `recommendedScripts: true`).
15. `gitIgnore`: Dynamic gitignore entry verification (defaults to `enabled: true`, `extraRequiredEntries: []`).
16. `packageHygiene`: Knip-powered dependency and binary script hygiene (defaults to `enabled: true`).
17. `accessibility`: Web accessibility standards (defaults to `enabled: true`).
18. `typeCoverage`: Strict TypeScript type coverage (defaults to `enabled: true`, `atLeast: 95`).
19. `coverage`: Full file audit coverage ledger, blind-spot detection, and acknowledged degradation policies (defaults to `enabled: true`).
20. `version`: Semantic version synchronization across files and build metadata (defaults to `enabled: true`).

When omitted, each subsystem is safely populated with its active defaults. If explicitly configured with invalid types or unknown enumeration values, `assertAuditConfigComplete` immediately alerts developers with detailed diagnostics.

---

## 📁 Available Reference Configuration Files

TypeScript reference configuration blueprints are available in this directory:

- [`audit.config.enterprise.example.ts`](./audit.config.enterprise.example.ts): Reference configuration blueprint for Enterprise applications.
- [`audit.config.gaming.example.ts`](./audit.config.gaming.example.ts): Reference configuration blueprint for Interactive / Gaming applications.
- [`setup-extension-guide.md`](./setup-extension-guide.md): Environment setup script architecture and extension guide for Linux and Windows.
- [`extensions/validate_button_governance.extension.ts`](./extensions/validate_button_governance.extension.ts): Extension blueprint for button governance and anti-clipping standards.
- [`extensions/validate_render_performance.extension.ts`](./extensions/validate_render_performance.extension.ts): Extension blueprint for GPU render and atmosphere hygiene.
- [`extensions/validate_overscroll_lock.extension.ts`](./extensions/validate_overscroll_lock.extension.ts): Extension blueprint for mobile touch overscroll containment.

---

## 1. Enterprise Architecture (Supabase, Domain Contracts & Extensions)

- **Reference File**: [`audit.config.enterprise.example.ts`](./audit.config.enterprise.example.ts)
- **Key Characteristics**:
  - Supabase persistence engine (`persistence.engine: 'supabase'`) with schema-qualified query verification (`schemaQualified: true`).
  - Z-layers defined in `src/styles/_base.scss`.
  - Active bundle auditing for emitted production assets in `dist/assets`.
  - Explicit definition of business domain types (`TariffId`, `VoltageCategory`, `TaxRateType`, `ServerId`, `BillingStatus`, `ConsumptionStepId`, `RoundingModeType`).
  - Strict pattern matching to prevent loose string fallbacks (`tariffId`, `formulaId`, `stepId`, etc.).
  - 2 local host extension auditors (`validate_script_hardcoding.ts`, `validate_emoji_typography.ts`).

---

## 2. Gaming & Interactive Architecture (Hybrid Persistence, FSM & Workers)

- **Reference File**: [`audit.config.gaming.example.ts`](./audit.config.gaming.example.ts)
- **Key Characteristics**:
  - Hybrid SQLite + Supabase persistence (`persistence.engine: 'hybrid'`) with authorized save coordinator modules (`saveCoordinator.ts`, `saveActionHelpers.ts`).
  - Exemption of heavy Web Worker bundles and simulation data modules (`worker-vendor-sim`, `worker-game-data`, `vendor-sim`, etc.) from main-thread limits via `bundle.exemptChunkPrefixes`.
  - Battle engine domain types and turn invariants (`CreatureId`, `MoveId`, `AbilityId`, `ItemId`, `FsmState`, etc.).
  - Custom audit families: `fsm` (Finite State Machine & Turn Invariants) and `assets` (Game Assets & Sprite Integrity).
  - Local host extension sub-auditors in `scripts/auditors/` (including `validate_render_performance.ts` and `validate_overscroll_lock.ts`).
