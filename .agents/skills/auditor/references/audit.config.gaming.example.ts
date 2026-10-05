/**
 * skills/auditor/references/audit.config.gaming.example.ts
 *
 * Audit configuration example for a Gaming / Turn-Based Battle App.
 * Complex web application with hybrid persistence (SQLite + Supabase),
 * heavy Web Workers exempt from main-thread budget, custom audit families, and
 * local host extension sub-auditors (including render_performance).
 *
 * This file serves as a COMPLETE EDUCATIONAL REFERENCE configuration,
 * documenting every single field, its architectural purpose, and the corresponding auditor.
 */

import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  // Human-readable project name displayed in terminal reports and Box-Drawing headers
  name: 'Turn-Based Battle Game',

  paths: {
    srcRoots: ['src'], // Root directories containing application production code
    testRoots: ['tests'], // Unit test suites and battle simulation test directories
    e2eRoots: ['scripts/e2e'], // End-to-End browser test directory
    integrationRoots: ['tests/integration'], // Integration test directory with hybrid persistence
    migrationsDir: 'database/migrations', // Directory containing SQL migration scripts
    scriptsRoots: ['scripts'], // Support, compilation, and game emulation scripts directory
    codeRoots: ['src', 'scripts', 'database'], // Consolidated directories subject to static code audits
    dataRoots: ['src/data'], // Massive game catalogs (creatures, moves, items) exempt from LOC/complexity limits but strongly typed
    constantsRoots: ['src/logic/constants', 'src/constants'], // Global constants and immutable master tables directories
    componentsRoots: ['src/components'], // Visual UI components (Vue SFC .vue files)
    viewsRoots: ['src/views'], // Screen views and game battle scenarios (Vue Router)
    storesRoots: ['src/stores'], // Global reactive state stores (Pinia stores)
    composablesRoots: ['src/composables'], // Reusable Vue composables
    typesRoots: ['src/types'], // TypeScript type declarations, battle contracts, and interfaces
    stylesRoots: ['src/styles'], // Global stylesheets (SCSS/CSS files)
    logicRoots: ['src/logic'], // Pure battle logic, simulators, and game coordinators decoupled from UI
    exemptFiles: [], // Specific files with justified exceptions for architectural rules
    testFilePatterns: ['.spec.', '.test.', '.simulation.'], // File name patterns formally recognized as test suites
    includeTestsInCodeAudit: false, // Determines whether test files are audited under production code rules (false avoids false positives)
    testFragmentationWhitelist: ['src/logic/battle/battleEngine.ts'], // High-complexity modules formally permitted to fragment test suites
    ignoreGlobs: ['node_modules/**', 'dist/**', 'scratch/**', '.tsbuildinfo/**'], // Universal glob ignore patterns for static tools and file scanning
    ignoredDirs: ['external', 'legacy_sim', 'backup_legacy_code', 'test_sandbox'], // Folders entirely excluded from auditor analysis and traversal
    ignoredPatterns: ['src/logic/db/migrations_data.ts'] // Specific path patterns exempt from particular scans
  },

  persistence: {
    engine: 'hybrid', // Hybrid engine combining local persistence (SQLite/IndexedDB) for offline play with cloud sync (Supabase)
    schemaQualified: false, // SQLite does not use schema qualification (such as public.table)
    prohibitedTemplateIdentifiers: ['supabase', 'db', 'sqlite'], // Prohibits accessing database instances directly from .vue templates
    allowedHosts: ['supabase.co', 'localhost', '127.0.0.1'], // Explicitly authorized domains and network endpoints for client connections
    authorizedSaveFiles: [
      'src/logic/utils/saveCoordinator.ts', // Module authorized to coordinate save operations
      'src/logic/utils/saveActionHelpers.ts' // Authorized helpers for save action serialization
    ],
    saveKeyPrefixes: ['game_local_save_', 'sandbox_save'], // Mandatory prefixes on local storage keys to isolate saves
    positionalArrayColumns: ['team', 'box'], // Database columns storing arrays ordered by position (team slots and boxes)
    allowedDatabaseDirs: ['backups', 'migrations', 'schemas', 'snapshots'], // Authorized subdirectories within persistence directory
    allowedDatabaseFiles: ['AGENTS.md', '.gitkeep', 'seed.sql'] // Authorized files at persistence root without triggering orphan alerts
  },

  e2e: {
    idLocatorsOnly: true // Strictly enforces using ID (#id) or data-testid selectors in E2E tests
  },

  styles: {
    zLayersEnabled: true, // Enables strict verification of the canonical z-index scale
    baseScssFile: 'src/styles/core/_base.scss', // Base SCSS file where main design system variables are imported and declared
    zLayersScssFile: 'src/styles/core/_base.scss', // Canonical SCSS file defining $z-* variables for styles
    zLayersTsFile: 'src/logic/constants/visuals.ts', // Canonical TypeScript file exporting Z_LAYERS enum/object for logic
    // Note: The `zLayers` object is optional if `zLayersTsFile` exports Z_LAYERS; the framework
    // resolves it dynamically via `getEffectiveZLayers()`. Declaring it explicitly here
    // acts as strict Single Source of Truth with absolute precedence over the TypeScript file.
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
    globalUtilityClasses: ['btn-game-retro'], // Global CSS utility classes authorized as exceptions to strict BEM
    heavyEffectPaths: ['src/styles/weather', 'src/styles/atmosphere'], // Style modules with authorized heavy CSS directives (weather, atmospheric effects)
    stylelint: {
      enabled: true, // Enables Stylelint & SCSS hygiene verification
      configFile: undefined, // Optional custom config path (e.g. '.stylelintrc.json'); auto-discovers local or defaults to canonical
      rules: {
        // Optional rule overrides passed directly to Stylelint (e.g. 'alpha-value-notation': 'number').
        // Note: 'sass-traps/collision-casing' is automatically enforced and auto-repaired by default.
      },
      ignoreGlobs: [] // Additional globs to ignore during CSS/SCSS linting
    }
  },

  bundle: {
    enabled: true, // Enables bundle budget analysis and compiled production chunk size checks
    maxClientChunkWarnBytes: 1500 * 1024, // Warning threshold for client chunks (1.5 MB)
    maxClientChunkErrorBytes: 2500 * 1024, // Critical error threshold for client chunks (2.5 MB)
    exemptChunkPrefixes: [
      'worker-vendor-sim', // Web Worker for battle simulation engine decoupled from main thread
      'worker-game-data', // Web Worker for loading and querying heavy game data
      'vendor-sim', // Heavy dynamically loaded battle simulator
      'game-data-entities', // On-demand loaded game data chunk
      'vendor-randoms' // Complex pseudo-random number generator for battles
    ],
    budgets: [
      { pattern: 'index', maxBytes: 1500 * 1024, warnBytes: 1000 * 1024 }, // Main entry chunk budget
      { pattern: 'battle', maxBytes: 2500 * 1024, warnBytes: 1800 * 1024 } // Heavy battle view chunk budget
    ],
    forbiddenUiImports: [
      { module: 'lz-string', reason: 'Must be loaded on-demand or in save workers.' } // Heavy compression that must execute outside UI thread
    ]
  },

  templates: {
    requireInputIds: false, // Does not require mandatory IDs on all interactive elements
    tooltipComponents: ['Tooltip', 'GameTooltip'], // Registered tooltip components recognized by template auditor
    safeTemplateFunctions: ['t', 'getItemSprite', 'getCreatureSprite'], // Safe and pure functions permitted in Vue templates
    forbiddenTemplateCallPatterns: ['(?:[a-zA-Z0-9_]*DataProvider|dataProvider)\\.[a-zA-Z0-9_]+\\s*\\('] // Forbidden call patterns preventing infinite re-render loops
  },

  animation: {
    customTimerFunctions: ['battleAnimDelay', 'waitBattleTurn'] // Coordinated game timers for deterministic accelerated tests
  },

  constants: {
    ignoredNames: ['DEFAULT_GENERATION', 'INITIAL_COINS'], // Global constants exempt from duplicate analysis
    allowedNumericPrefixes: ['GEN_', 'ISO_', 'BASE_'], // Permitted prefixes for numeric constants
    exemptMagicNumbers: [100, 200, 300, 500, 9999999999] // Canonical generation limits or far-future sentinels (0, 1, 100, 200, 404, 500, 9999 are built-in defaults)
  },

  ratchet: {
    enabled: true, // Warning ratchet on full `npm run audit` runs: 0 errors and 0 NEW warnings (active by default)
    productionRef: 'origin/main', // Git ref holding the authoritative baseline; must resolve (verified by validate_audit_config)
    baselineFile: '.auditor/audit-baseline.json' // Committed, shrink-only baseline of warning fingerprints; bootstrap once with `npm run audit -- --init-baseline`
  },

  coverage: {
    enabled: true, // Enforces 100% file coverage across all versioned files and ledgers
    exemptGlobs: [
      {
        glob: 'deploy-*.sh',
        reason: 'Host server provisioning and deployment shell scripts'
      },
      {
        glob: 'public/data/locales/*.json',
        reason: 'Static i18n locale dictionary assets not audited by code linters'
      }
    ],
    acknowledgedDegradations: [
      {
        policy: 'scripts',
        glob: 'scripts/**',
        reason: 'Maintenance, battle simulation benchmarking, and deployment scripts'
      },
      {
        policy: 'cli',
        glob: 'scripts/**',
        reason: 'CLI scripts authorized for console and local tool operations'
      },
      {
        policy: 'data',
        glob: 'src/data/**',
        reason: 'Tabular creature catalogs and game formula constants'
      },
      {
        policy: 'demo',
        glob: 'ui-demo/**',
        reason: 'Experimental battle canvas sandboxes and interactive galleries'
      }
    ]
  },

  documentation: {
    knownValidAbstractPaths: ['@docs/gameplay/battle-system.md'] // Virtual paths valid in Markdown documentation links
  },

  pinia: {
    authorizedMutationFiles: ['src/logic/utils/saveCoordinator.ts'] // Files authorized for direct store mutations outside actions
  },

  packageScripts: {
    enabled: true, // Enables package.json script governance and verification
    enforceBuildAudit: true, // Requires "build" script to chain full auditor prior to compilation ("auditor && ...")
    recommendedScripts: true, // Validates that essential runner and CLI scripts from the canonical catalog exist
    extraRequiredScripts: [] // Additional custom npm scripts required by host infrastructure or CI
  },

  gitIgnore: {
    enabled: true, // Enables dynamic .gitignore coverage auditing from sub-auditor requirements
    extraRequiredEntries: [] // Project-specific additional ignore patterns required in .gitignore
  },

  agentPlugin: {
    enabled: true // Integration of AI agent plugin and rule synchronization
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
    zLayersFile: 'src/logic/constants/visuals.ts', // Path to canonical TypeScript z-index layers file for domain parity verification
    caseNormalizationExemptTokens: ['rpg', 'pvp', 'pve', 'fsm', 'dex', 'hp', 'atk', 'def', 'spe', 'exp'], // Battle acronyms and terms exempt from casing warnings
    allowedStoreSetterPrefixes: ['set', 'update', 'equip'], // Authorized semantic prefixes for Pinia store mutator methods
    allowedNumericConstantPrefixes: [
      'GEN_', 'ISO_', 'UTF_8', 'BASE_64', 'RGB_', 'RGBA_', 'WASM_', 'HTML_5', 'CSS_3', 'HTTP_', 'D3_',
      'GEN1_', 'GEN2_', 'GEN3_', 'GEN4_', 'GEN5_', 'GEN6_', 'GEN7_', 'GEN8_', 'GEN9_'
    ], // Authorized prefixes in numeric constant identifiers
    finiteDomainTypes: [
      'CreatureId', // Canonical creature species identifier
      'MoveId', // Canonical move identifier
      'AbilityId', // Canonical ability identifier
      'ItemId', // Canonical item identifier
      'NatureId', // Canonical nature identifier
      'Type', // Elemental type of creature/move
      'BattleStatus', // Altered battle status (paralysis, poison, etc.)
      'Weather', // Active weather on battlefield
      'Terrain', // Active terrain on battlefield
      'Gender', // Creature gender
      'StatId', // Stat identifier (HP, ATK, etc.)
      'FsmState' // Canonical battle finite state machine state
    ], // Closed domain types that must be defined as literal unions rather than loose strings
    infraIdWhitelist: [
      // Infrastructure, session, and game entity technical identifiers permitted with primitive string type
      'saveId',
      'userId',
      'sessionId',
      'combatantId',
      'slotId',
      'cardId',
      'serverId',
      'server_id',
      'selectedServerId',
      'selected_server_id',
      'assetId',
      'asset_id',
      'uuid',
      'roomId',
      'indexId',
      'index_id',
      'catalogId',
      'catalog_id',
      'catId',
      'cat_id',
      'shadowId',
      'shadow_id',
      'sellerId',
      'seller_id',
      'listingId',
      'matchId',
      'inviteId',
      'friendId',
      'awardId',
      'last_save_id',
      'lastSaveId',
      'targetTrainerId',
      'challengerId',
      'offerId',
      'tradeId',
      'p_trade_id',
      'buyerId',
      'buyer_id',
      'senderId',
      'sender_id',
      'receiver_id',
      'p_receiver_id',
      'requestId',
      'requester_id',
      'addressee_id',
      'relId',
      'claimId',
      'currentSessionId',
      'current_session_id',
      'targetChatId',
      'seatId',
      'opponentId',
      'opponent_id',
      'player_id'
    ],
    fallbackIdPatterns: [
      // Game business identifier patterns requiring strict typing with domain types
      'heldItem',
      'item',
      'species',
      'ability',
      'move',
      'moveId',
      'itemId',
      'speciesId',
      'abilityId'
    ],
    o1CatalogPatterns: [
      {
        name: 'OFFICIAL_SERVERS', // Catalog name audited for O(1) access complexity
        pattern: '\\bOFFICIAL_SERVERS\\.(?:find|filter|some|findLast)\\s*\\(', // Prohibited linear O(N) search regex pattern
        alternative: 'OFFICIAL_SERVERS_BY_ID[serverId]', // Recommended key-indexed O(1) access alternative
        definingFile: 'src/data/system/official_servers.ts' // Defining file for indexed catalog
      }
    ]
  },

  constants: {
    exemptGlobs: [
      'scripts/maintenance/**', // Specific maintenance scripts exempt from magic numbers
      'scripts/data/generate_*.ts', // Data generators exempt from magic numbers
      'src/data/seed/**' // Seed databases exempt from magic numbers
    ]
  },

  customFamilies: [
    {
      key: 'fsm', // Unique family identifier in reports and CLI
      title: 'Finite State Machine & Turn Invariants', // Human-readable title displayed in Box-Drawing table
      order: 5, // Display order in audit family sequence
      icon: '🔄', // Distinctive emoji for console rendering
      description: 'FSM and combat turn invariants' // Short description of architectural scope
    },
    {
      key: 'assets', // Unique family identifier in reports and CLI
      title: 'Game Assets & Sprite Integrity', // Human-readable title displayed in Box-Drawing table
      order: 6, // Display order in audit family sequence
      icon: '🎨', // Distinctive emoji for console rendering
      description: 'Sprite, audio, and asset integrity' // Short description of architectural scope
    }
  ],

  runner: {
    timeoutMs: 0, // 0 = disabled: suites run to completion without arbitrary kills; set e.g. 3600000 for 1h safety ceiling
    maxStalenessMinutes: 10 // Configurable audit report freshness limit in minutes (default: 5)
  },

  extensions: [
    './scripts/auditors/architecture/validate_battle_ui_branching.ts', // Validates simplification of complex branching in battle UI
    './scripts/auditors/architecture/validate_client_sim_decoupling.ts', // Ensures strict decoupling between simulation engine and client UI
    './scripts/auditors/assets/audit_item_sprite_collisions.ts', // Detects name or index collisions in item sprites
    './scripts/auditors/assets/validate_asset_usage.ts', // Detects orphan or unreferenced graphic and audio assets
    './scripts/auditors/assets/validate_sprites.ts', // Validates dimensions, formats, and metadata of sprite collection
    './scripts/auditors/domain_data/validate_abilities.ts', // Validates referential integrity and typing of abilities catalog
    './scripts/auditors/domain_data/validate_items.ts', // Validates data integrity and prices of items catalog
    './scripts/auditors/domain_data/validate_moves.ts', // Validates types, powers, and effects of moves catalog
    './scripts/auditors/domain_data/validate_creatures.ts', // Validates base stats and types of creature species catalog
    './scripts/auditors/domain_data/validate_technical_ids.ts', // Ensures domain identifiers preserve technical English naming
    './scripts/auditors/domain_data/validate_spawns_whitelist.ts', // Validates encounter generation tables against canonical catalog
    './scripts/auditors/fsm/validate_combat_invariants.ts', // Verifies combat turn transitions preserve mathematical invariants
    './scripts/auditors/fsm/validate_fsm_diagrams.ts', // Checks parity between combat state diagrams and executable code
    './scripts/auditors/fsm/validate_fsm_flow_parity.ts', // Validates flow parity across decision, animation, and resolution phases
    './scripts/auditors/fsm/validate_fsm_implementation.ts', // Audits finite state machine (FSM) implementation
    './scripts/auditors/fsm/validate_sim_parity.ts', // Verifies consistency of battle mechanics against reference simulator
    './scripts/auditors/persistence/validate_save_persistence_parity.ts', // Validates serialization and deserialization parity of save games
    './scripts/auditors/persistence/validate_schema_parity.ts', // Ensures complete parity between SQLite and Supabase database schemas
    './scripts/auditors/persistence/validate_sql_migrations.ts' // Verifies idempotency, reversibility, and syntax in SQL migrations
  ]
});
