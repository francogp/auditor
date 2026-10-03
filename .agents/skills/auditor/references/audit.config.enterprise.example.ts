/**
 * skills/auditor/references/audit.config.enterprise.example.ts
 *
 * Audit configuration example for an Enterprise Billing Portal.
 * Web application with Supabase backend, strict calculation rules,
 * script hardcoding extensions, and domain-type-first contracts.
 *
 * This file serves as a COMPLETE EDUCATIONAL REFERENCE configuration,
 * documenting every single field, its architectural purpose, and the corresponding auditor.
 */

import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  // Human-readable project name displayed in terminal reports and Box-Drawing headers
  name: 'Enterprise Billing Portal',

  paths: {
    srcRoots: ['src'], // Root directories containing application production code
    testRoots: ['tests/unit', 'tests/node'], // Unit and architectural test suites directories (Vitest / Node)
    e2eRoots: ['tests/e2e'], // End-to-End browser test directory with browser emulation
    integrationRoots: ['tests/integration'], // Integration test directory with external services or databases
    migrationsDir: 'supabase/migrations', // Directory containing SQL migration scripts for schema evolution
    scriptsRoots: ['scripts'], // CLI utilities, automation scripts, and maintenance tasks outside production
    codeRoots: ['src', 'scripts', 'supabase'], // Consolidated directories subject to static code audits
    dataRoots: ['src/data'], // Catalogs and tabular data directories (exempt from LOC/complexity limits but audited for types)
    constantsRoots: ['src/logic/constants'], // Global constants and system configuration directories
    componentsRoots: ['src/components'], // Visual UI components (Vue SFC .vue files)
    viewsRoots: ['src/views'], // Main routed page views connected to Vue Router
    storesRoots: ['src/stores'], // Global reactive state stores (Pinia stores)
    composablesRoots: ['src/composables'], // Reusable Vue composables
    typesRoots: ['src/types'], // TypeScript type declarations, contracts, and interfaces
    stylesRoots: ['src/styles'], // Global stylesheets (SCSS/CSS files)
    logicRoots: ['src/logic'], // Pure business logic, coordinators, and calculators decoupled from UI
    exemptFiles: ['src/logic/utils/logger.ts'], // Specific files with justified exceptions for architectural rules
    includeTestsInCodeAudit: false, // Determines whether test files are audited under production code rules (false avoids false positives)
    testFragmentationWhitelist: ['src/logic/calculators/heavyBillingEngine.ts'], // High-complexity modules formally permitted to fragment test suites
    ignoreGlobs: ['supabase/docker/volumes/**'], // Universal glob ignore patterns for static tools and file scanning
    ignoredDirs: ['deploy'] // Directories entirely excluded from auditor analysis and traversal
  },

  persistence: {
    engine: 'supabase', // Active database engine ('supabase', 'sqlite', 'postgres', 'hybrid', 'none')
    schemaQualified: true, // Requires all SQL queries to explicitly qualify the schema (e.g. 'public.table')
    prohibitedTemplateIdentifiers: ['supabase'], // Prohibits accessing database instances directly from .vue templates
    allowedHosts: ['supabase.co', 'localhost', '127.0.0.1'], // Explicitly authorized domains and network endpoints for client connections
    authorizedSaveFiles: [], // Specific modules authorized to perform direct persistence in local storage
    saveKeyPrefixes: ['billing_local_save_'], // Mandatory prefix on local storage keys to ensure isolation and traceability
    forbiddenMockModules: ['@/logic/db/*'] // Data or persistence modules whose mocking is prohibited in integration tests to preserve fidelity
  },

  e2e: {
    idLocatorsOnly: false // If true, requires using exclusively ID (#id) or data-testid selectors in E2E tests
  },

  styles: {
    zLayersEnabled: true, // Enables strict verification of the canonical z-index scale
    baseScssFile: 'src/styles/_base.scss', // Base SCSS file where main design system variables are imported and declared
    zLayersScssFile: 'src/styles/_base.scss', // Canonical SCSS file defining $z-* variables for styles
    zLayersTsFile: 'src/logic/constants/visuals.ts', // Canonical TypeScript file exporting the Z_LAYERS object or enum for logic
    zLayers: {
      BASE: 0, // Background and visual base layer
      LOW: 50, // Subtle decorative elements behind content
      CONTENT: 100, // Main content and standard document flow
      HEADER: 500, // Sticky section headers and top bars
      SIDEBAR: 800, // Collapsible sidebars and lateral navigation menus
      HUD: 1000, // Floating fixed UI elements
      NAVIGATION: 5000, // Main navigation bar and quick access controls
      DROPDOWN: 7000, // Dropdown menus and autocomplete popovers over navigation
      OVERLAY: 10000, // Darkened backdrops and scrims for modals
      MODAL: 11000, // Modal windows and interactive dialog boxes
      MODAL_STEP: 10, // Layer increment for nested modals
      TOOLTIP: 15000, // Information tooltips and contextual popovers above modals
      TOAST: 20000, // High-visibility floating notifications
      MAX: 100000, // General maximum limit for standard layers
      CRITICAL: 999999 // Critical layer reserved for system fatal errors and crash screens
    },
    lineHeightOverlapCheck: true, // Verifies that text line-heights prevent typographic overlap
    globalUtilityClasses: [], // Global CSS utility classes declared as valid exceptions to modular styling
    buttonGovernance: {
      enabled: true, // Enables strict button governance to unify variants across the entire application
      buttonsScssFile: 'src/styles/_buttons.scss', // Source SCSS file declaring canonical button classes
      canonicalVariants: ['btn-primary', 'btn-secondary', 'btn-dark', 'btn-success', 'btn-danger'] // Allowed canonical button variants
    }
  },

  bundle: {
    enabled: true, // Enables bundle budget analysis and compiled production chunk size checks
    distDir: 'dist/assets', // Bundler output directory (Vite/Rollup) where compiled production assets are inspected
    maxClientChunkWarnBytes: 1200 * 1024, // Chunk size threshold in bytes triggering a performance warning (1.2 MB)
    maxClientChunkErrorBytes: 2000 * 1024, // Chunk size threshold in bytes triggering a blocking CI error (2.0 MB)
    exemptChunkPrefixes: [], // Chunk name prefixes exempt from main bundle budgets (e.g. background workers)
    budgets: [
      { pattern: 'index', maxBytes: 1200 * 1024, warnBytes: 800 * 1024 }, // Main entry chunk budget
      { pattern: 'vendor', maxBytes: 2000 * 1024, warnBytes: 1500 * 1024 } // Shared vendor dependencies chunk budget
    ],
    forbiddenUiImports: [
      { module: 'xlsx', reason: 'Heavy spreadsheet parser must be loaded dynamically on demand or in a worker.' }
    ]
  },

  templates: {
    requireInputIds: false, // Optional: enforces id attribute on interactive template elements for E2E tests
    tooltipComponents: ['Tooltip', 'PVTooltip'], // Registered tooltip components for the framework
    safeTemplateFunctions: ['formatMoney', 'formatDate', 'translate'] // Safe functions permitted inside {{ ... }} expressions
  },

  animation: {
    customTimerFunctions: ['requestDelayedFrame'] // Custom timing functions permitted in UI alongside gsapSleep/delayedCall
  },

  constants: {
    ignoredNames: ['TAX_DEFAULT_ROUNDING', 'FISCAL_YEAR_BASE'], // Constants ignored by duplicate detector
    allowedNumericPrefixes: ['BASE_', 'TAX_'], // Permitted prefixes for numeric constants
    exemptMagicNumbers: [21, 10.5, 27] // Fiscal tax rate numbers exempt from magic number alerts
  },

  documentation: {
    knownValidAbstractPaths: ['@docs/architecture/fiscal-engine.md'] // Abstract paths recognized as valid in Markdown code references
  },

  pinia: {
    authorizedMutationFiles: ['src/logic/coordinators/billingSessionCoordinator.ts'] // Files authorized to mutate stores outside actions
  },

  agentPlugin: {
    enabled: true // Integration of AI agent plugin and official skill
  },

  fallow: {
    enabled: true, // Fallow is 100% active (dead code, complexity, duplication, unused exports)
    security: {
      enabled: true // Static vulnerability analysis via Fallow CWE (security sinks, SSRF, command injection)
    },
    enforceTargets: false, // Does NOT disable Fallow; decides whether structural refactoring targets block CI or act as advisory
    maxTargetPriority: 'critical', // Priority threshold when enforceTargets is true ('critical' >= 30, 'high' >= 20, 'all')
    similarCode: {
      enabled: true, // Semantic duplicate discovery using AI vector embeddings
      threshold: 0.95, // Surgical sensitivity (prevents false positives between similar functions)
      ignoreSameFile: true // Ignores pairs from the same file to alert only cross-file duplicates
    }
  },

  domain: {
    timezoneVariable: 'APP_TIMEZONE', // Canonical variable or constant storing system timezone
    timezoneHelperModule: '@/logic/utils/timeUtils', // Centralized module authorized for date manipulation and timezone conversions
    loggerModule: 'src/logic/utils/logger.ts', // Canonical structured logging module replacing direct console.log/error calls
    zLayersFile: 'src/logic/constants/visuals.ts', // Path to canonical TypeScript z-index layers file for domain parity verification
    caseNormalizationExemptTokens: ['iso', 'cuit', 'dni', 'vat', 'kw', 'kwh', 'v', 'a'], // Acronyms and units exempt from casing warnings
    allowedStoreSetterPrefixes: ['set', 'update', 'assign'], // Authorized semantic prefixes for Pinia store mutator methods
    allowedNumericConstantPrefixes: [
      'GEN_', 'ISO_', 'UTF_8', 'BASE_64', 'RGB_', 'RGBA_', 'WASM_', 'HTML_5', 'CSS_3', 'HTTP_', 'D3_'
    ], // Authorized prefixes in numeric constant identifiers
    finiteDomainTypes: [
      'TariffId',
      'VoltageCategory',
      'TaxRateType',
      'ServerId',
      'BillingStatus',
      'ConsumptionStepId',
      'RoundingModeType'
    ], // Finite domain types that must be defined as literal unions rather than loose strings
    infraIdWhitelist: ['projectId', 'scriptId', 'userId', 'logId', 'fileId'], // Infrastructure identifiers permitted with primitive string type
    fallbackIdPatterns: ['tariffId', 'formulaId', 'stepId', 'serverId', 'rateId', 'categoryId'] // Business identifier patterns that must be typed with domain types
  },

  runner: {
    timeoutMs: 0, // 0 = disabled: suites run to completion without arbitrary kills; set e.g. 3600000 for 1h safety ceiling
    maxStalenessMinutes: 10 // Configurable audit report freshness limit in minutes (default: 5)
  },

  extensions: [
    './scripts/auditors/domain_data/validate_script_hardcoding.ts', // Local sub-auditor prohibiting hardcoded fiscal calculation scripts
    './scripts/auditors/architecture/validate_emoji_typography.ts' // Local sub-auditor validating typographic consistency and proper emoji / icon usage
  ]
});
