/**
 * packages/auditor/src/core/auditConfigDefaults.ts
 *
 * Canonical default configuration schema and subsystem key collectors.
 */

import {
  type AuditEngineConfig,
  type DeepPartial,
  DEFAULT_MAX_AUDIT_STALENESS_MINUTES
} from './auditConfigTypes.ts';
import { AUDITOR_VERSION } from './version.ts';

export const DEFAULT_SIMILAR_CODE_THRESHOLD = 0.95;
export const DEFAULT_TEST_COVERAGE_PERCENTAGE = 80;
export const DEFAULT_TYPE_COVERAGE_AT_LEAST = 95;
export const DEFAULT_PRECOMPRESS_THRESHOLD_BYTES = 512;

export const DEFAULT_AUDIT_CONFIG: AuditEngineConfig = {
  name: 'Generic Project',
  auditorVersion: AUDITOR_VERSION,
  paths: {
    enabled: true,
    srcRoots: ['src'],
    testRoots: ['tests'],
    e2eRoots: ['tests/e2e'],
    integrationRoots: ['tests/integration'],
    migrationsDir: 'supabase/migrations',
    scriptsRoots: ['scripts'],
    codeRoots: ['src', 'scripts'],
    cliRoots: ['src/cli'],
    dataRoots: ['src/data'],
    demoRoots: [],
    componentsRoots: ['src/components'],
    viewsRoots: ['src/views'],
    storesRoots: ['src/stores'],
    composablesRoots: ['src/composables'],
    typesRoots: ['src/types'],
    stylesRoots: ['src/styles'],
    logicRoots: ['src/logic'],
    exemptFiles: [],
    includeTestsInCodeAudit: false,
    ignoreGlobs: [],
    ignoredDirs: [],
    unignoreDirs: [],
    ignoredPatterns: []
  },
  persistence: {
    enabled: true,
    engine: 'supabase',
    schemaQualified: true,
    authorizedSaveFiles: [],
    saveKeyPrefixes: [],
    supabaseDir: 'supabase',
    dockerContainer: 'supabase-db',
    allowedDatabaseDirs: ['backups', 'migrations', 'schemas'],
    allowedDatabaseFiles: ['AGENTS.md', '.gitkeep'],
    exemptRlsTables: ['_migrations', 'schema_migrations', 'supabase_migrations']
  },
  valibot: {
    enabled: true,
    targets: []
  },
  domain: {
    enabled: true,
    timezoneVariable: 'APP_TIMEZONE',
    finiteDomainTypes: [],
    infraIdWhitelist: [],
    fallbackIdPatterns: [],
    o1CatalogPatterns: [],
    allowedNumericConstantPrefixes: [
      'GEN_',
      'ISO_',
      'UTF_8',
      'BASE_64',
      'RGB_',
      'RGBA_',
      'WASM_',
      'HTML_5',
      'CSS_3',
      'HTTP_',
      'D3_'
    ],
    caseNormalizationExemptTokens: [],
    allowedStoreSetterPrefixes: ['set', 'update', 'clear']
  },
  gitIgnore: {
    enabled: true,
    extraRequiredEntries: []
  },
  templates: {
    enabled: true,
    requireInputIds: true
  },
  styles: {
    enabled: true,
    globalUtilityClasses: [],
    canonicalButtonVariants: [],
    heavyEffectPaths: [],
    zLayersEnabled: true,
    lineHeightOverlapCheck: true,
    stylelint: {
      enabled: true,
      rules: {},
      ignoreGlobs: [],
      order: {
        enabled: true,
        enforceHasBlockPartitioning: true
      }
    },
    enforceScss: true,
    exemptCssFiles: []
  },
  stylelint: {
    enabled: true,
    rules: {},
    ignoreGlobs: [],
    order: {
      enabled: true,
      enforceHasBlockPartitioning: true
    }
  },
  oxlint: {
    enabled: true
  },
  oxfmt: {
    enabled: true
  },
  htmlValidate: {
    enabled: true
  },
  vitePlusConfig: {
    enabled: true,
    precompress: {
      enabled: true,
      server: 'nginx',
      spa: true,
      report: 'summary',
      threshold: DEFAULT_PRECOMPRESS_THRESHOLD_BYTES
    },
    fmt: {
      enabled: true,
      singleQuote: true,
      semi: true,
      trailingComma: 'none',
      sortPackageJson: true,
      ignorePatterns: [],
      overrides: []
    },
    lint: {
      enabled: true,
      typeAware: true,
      typeCheck: true
    },
    staged: {
      enabled: true,
      rules: {
        '*': 'vp check --fix'
      }
    },
    hooks: {
      enabled: true
    },
    vscode: {
      enabled: true,
      formatOnSave: true,
      defaultFormatter: 'oxc.oxc-vscode'
    }
  },
  bundle: {
    enabled: true,
    statsFile: 'scratch/bundle_stats.html',
    distDir: 'dist/assets',
    exemptChunkPrefixes: [],
    maxClientChunkWarnBytes: 1200 * 1024,
    maxClientChunkErrorBytes: 2000 * 1024,
    budgets: [],
    duplicateModuleThresholdBytes: 500 * 1024,
    topModulesLimit: 15
  },
  agentPlugin: {
    enabled: true
  },
  security: {
    enabled: true
  },
  documentation: {
    enabled: true,
    knownValidAbstractPaths: [],
    skillsRoots: ['.agents/skills'],
    allowedNpxBinaries: [],
    language: 'en',
    chatLanguage: 'es',
    languageExemptions: []
  },
  dox: {
    enabled: true,
    ignoreGlobs: ['.agents/**']
  },
  fallow: {
    enabled: true,
    security: {
      enabled: true
    },
    enforceTargets: true,
    maxTargetPriority: 'high',
    similarCode: {
      enabled: true,
      threshold: DEFAULT_SIMILAR_CODE_THRESHOLD,
      ignoreSameFile: true,
      minLines: 3
    },
    flags: {
      enabled: true,
      trackRetirement: true
    },
    coverage: {
      enabled: true
    },
    typeAware: true,
    showCascade: true,
    duplicates: {
      enabled: true,
      nearMiss: true,
      mode: 'strict'
    },
    viz: {
      enabled: true,
      outputPath: 'scratch/fallow_map.html'
    }
  },
  constants: {
    enabled: true,
    ignoredNames: [],
    exemptMagicNumbers: [],
    allowedNumericPrefixes: [],
    exemptPaths: [],
    exemptFiles: [],
    ignoreGlobs: []
  },
  animation: {
    enabled: true,
    customTimerFunctions: [],
    exemptPaths: [],
    exemptFiles: [],
    ignoreGlobs: []
  },
  types: {
    enabled: true,
    exemptPaths: [],
    exemptFiles: [],
    ignoreGlobs: []
  },
  encoding: {
    enabled: true,
    defaultEncoding: 'utf-8',
    prohibitBom: true,
    detectMojibake: true,
    exemptGlobs: [],
    exemptPaths: [],
    exemptFiles: []
  },
  packageHygiene: {
    enabled: true,
    ignoreDependencies: [],
    ignoreBinaries: []
  },
  packageDistribution: {
    enabled: false,
    level: 'warning'
  },
  packageScripts: {
    enabled: true,
    enforceBuildAudit: true,
    recommendedScripts: true,
    extraRequiredScripts: []
  },
  scriptCommands: {
    enabled: true,
    exemptGlobs: [],
    allowedNpxBinaries: []
  },
  environment: {
    enabled: true
  },
  auditorHygiene: {
    enabled: true,
    roots: ['scripts/auditors'],
    exemptFiles: [],
    disabledDetectors: []
  },
  scriptExtensions: {
    enabled: true,
    enforceTypeScript: true,
    allowMjs: false,
    allowCjs: false,
    allowJsScripts: false,
    exemptFiles: []
  },
  accessibility: {
    enabled: true,
    rules: {}
  },
  typeCoverage: {
    enabled: true,
    atLeast: 95,
    strict: true,
    ignoreFiles: []
  },
  version: {
    enabled: true,
    autoSyncPublicVersionJson: true,
    syncTargets: []
  },
  secretLeaks: {
    enabled: true,
    maskSecrets: true,
    allowedPatterns: [],
    exemptGlobs: []
  },
  dependencyVulnerabilities: {
    enabled: true,
    failOn: 'critical',
    allowList: [],
    includeDev: false
  },
  coverage: {
    enabled: true,
    exemptGlobs: [],
    acknowledgedDegradations: []
  },
  webPerformance: {
    enabled: true,
    maxDomDepth: 16,
    maxInlineSvgSize: 2048,
    exemptSvgPaths: [],
    exemptImgClasses: [],
    exemptPaths: []
  },
  queryPerformance: {
    enabled: true,
    excludeMigrationsDir: true,
    exemptSelectStarPaths: [],
    exemptPaths: []
  },
  securityHardening: {
    enabled: true,
    exemptPaths: []
  },
  codeSimplification: {
    enabled: true,
    maxNestingDepth: 4,
    allowMatrixLoops: false,
    exemptPaths: []
  },
  scssArchitecture: {
    enabled: true,
    maxNestingDepth: 3,
    scopedMaxNestingDepth: 4,
    allowPixelArtSpacing: false,
    allowedSpacingUnits: [],
    allowScopedColors: false,
    exemptPaths: []
  },
  ratchet: {
    enabled: true,
    productionRef: 'origin/main',
    baselineFile: '.auditor/audit-baseline.json'
  },
  testCoverage: {
    enabled: true,
    threshold: 80,
    path: 'scratch/coverage/coverage-final.json',
    runCommand: 'vp test --coverage',
    roots: ['src'],
    extensions: ['.ts', '.vue', '.js', '.jsx', '.tsx', '.mjs', '.cjs'],
    exemptGlobs: [],
    directoryThresholds: {},
    enforceInAudit: true
  },
  customFamilies: [],
  extensions: [],
  presets: {},
  runner: {
    enabled: true,
    timeoutMs: 0,
    maxStalenessMinutes: DEFAULT_MAX_AUDIT_STALENESS_MINUTES
  }
};

export function collectDeclaredSubsystems(config: DeepPartial<AuditEngineConfig>): Set<string> {
  const declared = new Set<string>(config._declaredSubsystems ?? []);
  const keys = [
    'persistence',
    'domain',
    'environment',
    'auditorHygiene',
    'scriptExtensions',
    'styles',
    'stylelint',
    'oxlint',
    'oxfmt',
    'vitePlusConfig',
    'valibot',
    'pinia',
    'htmlValidate',
    'templates',
    'bundle',
    'agentPlugin',
    'security',
    'fallow',
    'packageDistribution',
    'packageHygiene',
    'packageScripts',
    'scriptCommands',
    'accessibility',
    'typeCoverage',
    'testCoverage',
    'version',
    'secretLeaks',
    'dependencyVulnerabilities',
    'ratchet',
    'constants',
    'documentation',
    'gitIgnore',
    'coverage',
    'animation',
    'types',
    'webPerformance',
    'queryPerformance',
    'securityHardening',
    'codeSimplification',
    'scssArchitecture',
    'vitePlusConfig'
  ] as const;
  for (const k of keys) {
    if (config[k] !== undefined) declared.add(k);
  }
  for (const k of Object.keys(config)) {
    if (
      k !== '_declaredSubsystems' &&
      k !== '_rawPaths' &&
      k !== '_rawConfig' &&
      k !== 'name' &&
      Reflect.get(config, k) !== undefined
    ) {
      declared.add(k);
    }
  }
  return declared;
}
