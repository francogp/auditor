/**
 * docs/audit.config.facturacion2.example.ts
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
    ignoreGlobs: ['supabase/docker/volumes/**'],
    ignoredDirs: ['deploy']
  },
  persistence: {
    engine: 'supabase',
    schemaQualified: true,
    authorizedSaveFiles: [],
    saveKeyPrefixes: ['facturacion_local_save_']
  },
  styles: {
    zLayersEnabled: true,
    zLayersScssFile: 'src/styles/_base.scss',
    globalUtilityClasses: []
  },
  bundle: {
    enabled: true,
    distDir: 'dist/assets',
    exemptChunkPrefixes: []
  },
  templates: {
    requireInputIds: false
  },
  agentPlugin: {
    enabled: true
  },
  domain: {
    timezoneVariable: 'APP_TIMEZONE',
    timezoneHelperModule: '@/logic/utils/timeUtils',
    zLayersFile: 'src/logic/constants/visuals.ts',
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
