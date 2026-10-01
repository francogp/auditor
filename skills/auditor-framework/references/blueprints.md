# Blueprints de Configuración para Proyectos Anfitriones

Este documento contiene los modelos de configuración completos, validados y agnósticos para la integración y migración de proyectos reales del ecosistema a `@francogp/auditor`.

---

## 🏛️ Mandato de Configuración Explícita Obligatoria

Todo proyecto que utilice `@francogp/auditor` debe declarar explícitamente todos los subsistemas del motor en su `audit.config.ts`:

1. `persistence`: Motor de base de datos (`'supabase'`, `'sqlite'`, `'hybrid'`, `'postgres'`, `'custom'` o `'none'`). Configura `prohibitedTemplateIdentifiers`, `authorizedSaveFiles` y `allowedHosts` según la infraestructura.
2. `bundle`: Presupuestos de tamaño de bundle (`enabled: true` con opciones o `enabled: false`). Chunks de Web Worker o módulos de simulación se declaran en `exemptChunkPrefixes`. Imports de valor prohibidos en UI se extienden en `forbiddenUiImports`.
3. `styles`: Z-layers (`zLayersEnabled: boolean`, escala directa en `zLayers`, archivo SCSS en `zLayersScssFile`, archivo TS en `zLayersTsFile`), archivo SCSS base (`baseScssFile`), verificación interlineal (`lineHeightOverlapCheck: boolean`) y clases de utilidad.
4. `templates`: Requisitos de validación de templates HTML/Vue (`requireInputIds: boolean`, funciones seguras permitidas en templates `safeTemplateFunctions?: string[]`, patrones prohibidos en render loop `forbiddenTemplateCallPatterns?: string[]`).
5. `animation`: Gobernanza de animaciones GSAP obligatoria. `gsapSleep` y `delayedCall` son estándares del framework para la UI; temporizadores personalizados adicionales se declaran en `customTimerFunctions?: string[]`.
6. `constants`: Nombres de constantes ignorados en duplicados (`ignoredNames?: string[]`) y números mágicos exentos (`exemptMagicNumbers?: number[]`).
7. `documentation`: Rutas abstractas válidas en referencias de código (`knownValidAbstractPaths?: string[]`).
8. `pinia`: Archivos autorizados para mutaciones de stores fuera de acciones (`authorizedMutationFiles?: string[]`).
9. `paths`: Rutas del código y lista blanca de fragmentación de tests (`testFragmentationWhitelist?: string[]`).
10. `domain`: Tipos finitos (`finiteDomainTypes`), whitelists de infra IDs (`infraIdWhitelist`), tokens exentos de normalización (`caseNormalizationExemptTokens`), prefijos de setters de store (`allowedStoreSetterPrefixes`) y prefijos numéricos de constantes (`allowedNumericConstantPrefixes`).
11. `agentPlugin`: Integración del plugin de agentes de IA (`enabled: boolean`).

Cualquier subsistema omitido provocará un fallo inmediato en tiempo de ejecución (`assertAuditConfigComplete`) para alertar al desarrollador sobre configuraciones desactualizadas o incompletas tras actualizaciones del motor.

---

## 📁 Archivos de Ejemplo Disponibles

Los archivos fuente TypeScript de ejemplo se encuentran disponibles en este mismo directorio:

- [`audit.config.facturacion2.example.ts`](./audit.config.facturacion2.example.ts): Configuración de referencia para Facturación 2.0.
- [`audit.config.pokevicio.example.ts`](./audit.config.pokevicio.example.ts): Configuración de referencia para Poké Vicio.
- [`setup-extension-guide.md`](./setup-extension-guide.md): Guía de arquitectura y plugins de extensión para setup en Linux y Windows.
- [`extensions/validate_button_governance.extension.ts`](./extensions/validate_button_governance.extension.ts): Blueprint de extensión para gobernanza de botones y anti-clipping (Facturación 2.0).
- [`extensions/validate_render_performance.extension.ts`](./extensions/validate_render_performance.extension.ts): Blueprint de extensión de auditoría para render/GPU (Poké Vicio).
- [`extensions/validate_overscroll_lock.extension.ts`](./extensions/validate_overscroll_lock.extension.ts): Blueprint de extensión para bloqueo de sobre-desplazamiento móvil (Poké Vicio).

---

## 1. Facturación 2.0 (CEVT) — Supabase, Motor Fiscal y Extensiones

- **Archivo de ejemplo**: [`audit.config.facturacion2.example.ts`](./audit.config.facturacion2.example.ts)
- **Características principales**:
  - Motor de persistencia Supabase (`persistence.engine: 'supabase'`) con verificación de esquemas calificados (`schemaQualified: true`).
  - Capas Z en `src/styles/_base.scss`.
  - Auditoría de bundle activa para chunks en `dist/assets`.
  - Definición explícita de tipos de dominio fiscales (`TariffId`, `VoltageCategory`, `TaxRateType`, `ServerId`, `BillingStatus`, `ConsumptionStepId`, `RoundingModeType`).
  - Patrones de identificación para evitar fallbacks no seguros (`tariffId`, `formulaId`, `stepId`, etc.).
  - 2 sub-auditores de extensión locales (`validate_script_hardcoding.ts`, `validate_emoji_typography.ts`).

---

## 2. Poké Vicio (PokeBorrador) — Híbrido, FSM y Web Workers

- **Archivo de ejemplo**: [`audit.config.pokevicio.example.ts`](./audit.config.pokevicio.example.ts)
- **Características principales**:
  - Persistencia híbrida SQLite + Supabase (`persistence.engine: 'hybrid'`) con archivos de guardado autorizados (`saveCoordinator.ts`, `saveActionHelpers.ts`).
  - Exención de chunks pesados de Web Workers y datos de simulación (`worker-vendor-pkmn`, `worker-game-data`, `vendor-pkmn-sim`, etc.) del límite del hilo principal vía `bundle.exemptChunkPrefixes`.
  - Tipos de dominio para el motor de combate e invariantes (`PokemonId`, `MoveId`, `AbilityId`, `ItemId`, `FsmState`, etc.).
  - Familias de auditoría personalizadas: `fsm` (Finite State Machine & Turn Invariants) y `assets` (Game Assets & Sprite Integrity).
  - 21 sub-auditores de extensión locales en `scripts/auditors/` (incluyendo `validate_render_performance.ts` y `validate_overscroll_lock.ts`).
