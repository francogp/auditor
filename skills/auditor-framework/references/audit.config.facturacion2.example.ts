/**
 * .agents/skills/auditor-framework/references/audit.config.facturacion2.example.ts
 *
 * Ejemplo de configuración de auditoría para Facturación 2.0 (CEVT).
 * Aplicación web con backend Supabase, reglas de cálculo fiscal estricto,
 * extensiones de script hardcoding y tipado de dominio.
 */

import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'Facturación 2.0 (CEVT)',
  paths: {
    srcRoots: ['src'],
    testRoots: ['tests/unit', 'tests/node'],
    e2eRoots: ['tests/e2e'],
    integrationRoots: ['tests/integration'],
    migrationsDir: 'supabase/migrations',
    scriptsRoots: ['scripts'],
    codeRoots: ['src', 'scripts', 'supabase'],
    dataRoots: ['src/data'],
    constantsRoots: ['src/logic/constants'],
    componentsRoots: ['src/components'],
    viewsRoots: ['src/views'],
    storesRoots: ['src/stores'],
    composablesRoots: ['src/composables'],
    typesRoots: ['src/types'],
    stylesRoots: ['src/styles'],
    logicRoots: ['src/logic'],
    exemptFiles: ['src/logic/utils/logger.ts'],
    includeTestsInCodeAudit: false,
    testFragmentationWhitelist: ['src/logic/calculators/heavyBillingEngine.ts'],
    ignoreGlobs: ['supabase/docker/volumes/**'],
    ignoredDirs: ['deploy']
  },
  persistence: {
    engine: 'supabase',
    schemaQualified: true,
    prohibitedTemplateIdentifiers: ['supabase'],
    allowedHosts: ['supabase.co', 'localhost', '127.0.0.1'],
    authorizedSaveFiles: [],
    saveKeyPrefixes: ['facturacion_local_save_'],
    forbiddenMockModules: ['@/logic/db/*']
  },
  e2e: {
    idLocatorsOnly: false
  },
  styles: {
    zLayersEnabled: true,
    baseScssFile: 'src/styles/_base.scss',
    zLayersScssFile: 'src/styles/_base.scss',
    zLayersTsFile: 'src/logic/constants/visuals.ts',
    zLayers: {
      BASE: 0,
      LOW: 50,
      CONTENT: 100,
      HEADER: 500,
      SIDEBAR: 800,
      HUD: 1000,
      NAVIGATION: 5000,
      DROPDOWN: 7000,
      OVERLAY: 10000,
      MODAL: 11000,
      MODAL_STEP: 10,
      TOOLTIP: 15000,
      TOAST: 20000,
      MAX: 100000,
      CRITICAL: 999999
    },
    lineHeightOverlapCheck: true,
    globalUtilityClasses: [],
    buttonGovernance: {
      enabled: true,
      buttonsScssFile: 'src/styles/_buttons.scss',
      canonicalVariants: ['btn-primary', 'btn-secondary', 'btn-dark', 'btn-success', 'btn-danger']
    }
  },
  bundle: {
    enabled: true,
    distDir: 'dist/assets',
    exemptChunkPrefixes: [],
    forbiddenUiImports: [
      { module: 'xlsx', reason: 'Parser pesado de hojas de cálculo debe cargarse bajo demanda o en worker.' }
    ]
  },
  templates: {
    requireInputIds: false,
    tooltipComponents: ['Tooltip', 'PVTooltip'],
    safeTemplateFunctions: ['formatMoney', 'formatDate', 'translate']
  },
  animation: {
    customTimerFunctions: ['requestDelayedFrame']
  },
  constants: {
    ignoredNames: ['TAX_DEFAULT_ROUNDING', 'FISCAL_YEAR_BASE'],
    exemptMagicNumbers: [21, 10.5, 27]
  },
  documentation: {
    knownValidAbstractPaths: ['@docs/architecture/fiscal-engine.md']
  },
  pinia: {
    authorizedMutationFiles: ['src/logic/coordinators/billingSessionCoordinator.ts']
  },
  agentPlugin: {
    enabled: true
  },
  domain: {
    timezoneVariable: 'APP_TIMEZONE',
    timezoneHelperModule: '@/logic/utils/timeUtils',
    loggerModule: 'src/logic/utils/logger.ts',
    zLayersFile: 'src/logic/constants/visuals.ts',
    caseNormalizationExemptTokens: ['cevt', 'cuit', 'dni', 'iva', 'afip', 'kw', 'kwh', 'v', 'a'],
    allowedStoreSetterPrefixes: ['set', 'update', 'assign'],
    allowedNumericConstantPrefixes: [
      'GEN_', 'ISO_', 'UTF_8', 'BASE_64', 'RGB_', 'RGBA_', 'WASM_', 'HTML_5', 'CSS_3', 'HTTP_', 'D3_'
    ],
    finiteDomainTypes: [
      'TariffId',
      'VoltageCategory',
      'TaxRateType',
      'ServerId',
      'BillingStatus',
      'ConsumptionStepId',
      'RoundingModeType'
    ],
    infraIdWhitelist: ['projectId', 'scriptId', 'userId', 'logId', 'fileId'],
    fallbackIdPatterns: ['tariffId', 'formulaId', 'stepId', 'serverId', 'rateId', 'categoryId']
  },
  extensions: [
    './scripts/auditors/domain_data/validate_script_hardcoding.ts',
    './scripts/auditors/architecture/validate_emoji_typography.ts'
  ]
});
