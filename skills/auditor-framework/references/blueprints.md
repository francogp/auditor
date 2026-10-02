# Host Project Configuration Blueprints

This document contains complete, validated, and domain-agnostic configuration blueprints for integrating and migrating host projects to `@francogp/auditor`.

---

## 🏛️ Mandatory Explicit Configuration Mandate

Every host project using `@francogp/auditor` must explicitly configure all engine subsystems in its `audit.config.ts`:

1. `persistence`: Database engine (`'supabase'`, `'sqlite'`, `'hybrid'`, `'postgres'`, `'custom'`, or `'none'`). Configures `prohibitedTemplateIdentifiers`, `authorizedSaveFiles`, and `allowedHosts` according to host infrastructure.
2. `bundle`: Bundle chunk budgets and size thresholds (`enabled: true` with `maxClientChunkWarnBytes`, `maxClientChunkErrorBytes`, `budgets`, or `enabled: false`). Heavy Web Worker chunks or simulation data modules are declared in `exemptChunkPrefixes`. Forbidden UI value imports are extended in `forbiddenUiImports`.
3. `fallow.security` (or `security`): Fallow CWE static vulnerability gating (`enabled: boolean`). Enables disabling alerts for pure CLI tools and runners.
4. `styles`: Z-layers (`zLayersEnabled: boolean`, direct scale in `zLayers`, SCSS file in `zLayersScssFile`, TS file in `zLayersTsFile`), base SCSS file (`baseScssFile`), line-height overlap check (`lineHeightOverlapCheck: boolean`), and utility classes.
5. `templates`: HTML/Vue template hygiene requirements (`requireInputIds: boolean`, permitted safe functions `safeTemplateFunctions?: string[]`, forbidden render loop patterns `forbiddenTemplateCallPatterns?: string[]`).
6. `animation`: Mandatory GSAP animation governance. `gsapSleep` and `delayedCall` are universal framework standards for UI delays; additional custom timer functions are declared in `customTimerFunctions?: string[]`.
7. `constants`: Duplicate constant ignore names (`ignoredNames?: string[]`), allowed numeric prefixes (`allowedNumericPrefixes?: string[]`), and exempt magic numbers (`exemptMagicNumbers?: number[]`).
8. `documentation`: Known valid abstract code reference paths (`knownValidAbstractPaths?: string[]`).
9. `pinia`: Authorized external store mutation files (`authorizedMutationFiles?: string[]`).
10. `paths`: Directory structure, CLI roots (`cliRoots?: string[]`), and test fragmentation whitelist (`testFragmentationWhitelist?: string[]`).
11. `domain`: Finite domain types (`finiteDomainTypes`), infra ID whitelists (`infraIdWhitelist`), normalization-exempt tokens (`caseNormalizationExemptTokens`), allowed store setter prefixes (`allowedStoreSetterPrefixes`), and allowed numeric constant prefixes (`allowedNumericConstantPrefixes`).
12. `agentPlugin`: AI agent plugin integration (`enabled: boolean`).
13. `fallow`: Deep static intelligence, security, and semantic code similarity (`enabled: boolean`, `security?: { enabled: boolean }`, `enforceTargets?: boolean`, `maxTargetPriority?: 'critical' | 'high' | 'all'`, `similarCode?: { enabled?: boolean, threshold?: number, ignoreSameFile?: boolean }`).

Any omitted subsystem will trigger an immediate runtime failure (`assertAuditConfigComplete`) to alert developers about missing or incomplete configurations following framework updates.

---

## 📁 Available Reference Configuration Files

TypeScript reference configuration blueprints are available in this directory:

- [`audit.config.facturacion2.example.ts`](./audit.config.facturacion2.example.ts): Reference configuration blueprint for Facturación 2.0.
- [`audit.config.pokevicio.example.ts`](./audit.config.pokevicio.example.ts): Reference configuration blueprint for Poké Vicio.
- [`setup-extension-guide.md`](./setup-extension-guide.md): Environment setup script architecture and extension guide for Linux and Windows.
- [`extensions/validate_button_governance.extension.ts`](./extensions/validate_button_governance.extension.ts): Extension blueprint for button governance and anti-clipping standards (Facturación 2.0).
- [`extensions/validate_render_performance.extension.ts`](./extensions/validate_render_performance.extension.ts): Extension blueprint for GPU render and atmosphere hygiene (Poké Vicio).
- [`extensions/validate_overscroll_lock.extension.ts`](./extensions/validate_overscroll_lock.extension.ts): Extension blueprint for mobile touch overscroll containment (Poké Vicio).

---

## 1. Facturación 2.0 (CEVT) — Supabase, Billing Engine & Host Extensions

- **Reference File**: [`audit.config.facturacion2.example.ts`](./audit.config.facturacion2.example.ts)
- **Key Characteristics**:
  - Supabase persistence engine (`persistence.engine: 'supabase'`) with schema-qualified query verification (`schemaQualified: true`).
  - Z-layers defined in `src/styles/_base.scss`.
  - Active bundle auditing for emitted production assets in `dist/assets`.
  - Explicit definition of fiscal domain types (`TariffId`, `VoltageCategory`, `TaxRateType`, `ServerId`, `BillingStatus`, `ConsumptionStepId`, `RoundingModeType`).
  - Strict pattern matching to prevent loose string fallbacks (`tariffId`, `formulaId`, `stepId`, etc.).
  - 2 local host extension auditors (`validate_script_hardcoding.ts`, `validate_emoji_typography.ts`).

---

## 2. Poké Vicio (PokeBorrador) — Hybrid Engine, FSM & Background Workers

- **Reference File**: [`audit.config.pokevicio.example.ts`](./audit.config.pokevicio.example.ts)
- **Key Characteristics**:
  - Hybrid SQLite + Supabase persistence (`persistence.engine: 'hybrid'`) with authorized save coordinator modules (`saveCoordinator.ts`, `saveActionHelpers.ts`).
  - Exemption of heavy Web Worker bundles and simulation data modules (`worker-vendor-pkmn`, `worker-game-data`, `vendor-pkmn-sim`, etc.) from main-thread limits via `bundle.exemptChunkPrefixes`.
  - Battle engine domain types and turn invariants (`PokemonId`, `MoveId`, `AbilityId`, `ItemId`, `FsmState`, etc.).
  - Custom audit families: `fsm` (Finite State Machine & Turn Invariants) and `assets` (Game Assets & Sprite Integrity).
  - 21 local host extension sub-auditors in `scripts/auditors/` (including `validate_render_performance.ts` and `validate_overscroll_lock.ts`).
