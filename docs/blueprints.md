# Blueprints de Configuración para Proyectos Anfitriones

Este documento contiene los modelos de configuración completos, validados y agnósticos para la migración de proyectos reales del ecosistema a `@francogp/auditor`.

---

## 🏛️ Mandato de Configuración Explícita Obligatoria

Todo proyecto que utilice `@francogp/auditor` debe declarar explícitamente todos los subsistemas del motor en su `audit.config.ts`:

1. `persistence`: Motor de base de datos (`'supabase'`, `'sqlite'`, `'hybrid'`, `'custom'` o `'none'`).
2. `bundle`: Presupuestos de tamaño de bundle (`enabled: true` con opciones o `enabled: false`).
3. `styles`: Z-layers y clases de utilidad (`zLayersEnabled: true` con archivo base o `zLayersEnabled: false`).
4. `templates`: Requisitos de validación de templates HTML/Vue (`requireInputIds: boolean`).
5. `agentPlugin`: Integración del plugin de agentes de IA (`enabled: boolean`).

Cualquier subsistema omitido provocará un fallo inmediato en tiempo de ejecución (`assertAuditConfigComplete`) para alertar al desarrollador sobre configuraciones desactualizadas o incompletas.

---

## 📁 Archivos de Ejemplo Disponibles

Los archivos fuente TypeScript de ejemplo se encuentran disponibles en este mismo directorio:

- [`audit.config.facturacion2.example.ts`](./audit.config.facturacion2.example.ts): Configuración de referencia para Facturación 2.0.
- [`audit.config.pokevicio.example.ts`](./audit.config.pokevicio.example.ts): Configuración de referencia para Poké Vicio.

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
  - Exención de chunks pesados de Web Workers y datos de simulación (`worker-vendor-pkmn`, `worker-game-data`, `vendor-pkmn-sim`, etc.) del límite del hilo principal.
  - Tipos de dominio para el motor de combate e invariantes (`PokemonId`, `MoveId`, `AbilityId`, `ItemId`, `FsmState`, etc.).
  - Familias de auditoría personalizadas: `fsm` (Finite State Machine & Turn Invariants) y `assets` (Game Assets & Sprite Integrity).
  - 19 sub-auditores de extensión locales en `scripts/auditors/`.
