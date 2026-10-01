/**
 * .agents/skills/auditor-framework/references/audit.config.pokevicio.example.ts
 *
 * Ejemplo de configuración de auditoría para Poké Vicio (PokeBorrador).
 * Aplicación web compleja con persistencia híbrida (SQLite + Supabase),
 * Web Workers pesados exentos de budget principal, familias personalizadas y
 * sub-auditores de extensión locales (incluyendo render_performance).
 */

import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'Poké Vicio',
  paths: {
    srcRoots: ['src'],
    testRoots: ['tests'],
    e2eRoots: ['scripts/e2e'],
    integrationRoots: ['tests/integration'],
    migrationsDir: 'database/migrations',
    scriptsRoots: ['scripts'],
    codeRoots: ['src', 'scripts', 'database'],
    dataRoots: ['src/data'],
    constantsRoots: ['src/logic/constants', 'src/constants'],
    componentsRoots: ['src/components'],
    viewsRoots: ['src/views'],
    storesRoots: ['src/stores'],
    composablesRoots: ['src/composables'],
    typesRoots: ['src/types'],
    stylesRoots: ['src/styles'],
    logicRoots: ['src/logic'],
    exemptFiles: [],
    testFilePatterns: ['.spec.', '.test.', '.simulation.'],
    includeTestsInCodeAudit: false,
    testFragmentationWhitelist: ['src/logic/battle/battleEngine.ts'],
    ignoreGlobs: ['node_modules/**', 'dist/**', 'scratch/**', '.tsbuildinfo/**'],
    ignoredDirs: ['external', 'showdown', 'backup_legacy_code', 'test aventura'],
    ignoredPatterns: ['src/logic/db/migrations_data.ts']
  },
  persistence: {
    engine: 'hybrid',
    schemaQualified: false,
    prohibitedTemplateIdentifiers: ['supabase', 'db', 'sqlite'],
    allowedHosts: ['supabase.co', 'localhost', '127.0.0.1'],
    authorizedSaveFiles: [
      'src/logic/utils/saveCoordinator.ts',
      'src/logic/utils/saveActionHelpers.ts'
    ],
    saveKeyPrefixes: ['pokemon_local_save_', 'pvs_sandbox_save'],
    positionalArrayColumns: ['team', 'box'],
    allowedDatabaseDirs: ['backups', 'migrations', 'schemas', 'snapshots'],
    allowedDatabaseFiles: ['AGENTS.md', '.gitkeep', 'seed.sql']
  },
  e2e: {
    idLocatorsOnly: true
  },
  styles: {
    zLayersEnabled: true,
    baseScssFile: 'src/styles/core/_base.scss',
    zLayersScssFile: 'src/styles/core/_base.scss',
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
    globalUtilityClasses: ['pv-button-retro'],
    heavyEffectPaths: ['src/styles/weather', 'src/styles/atmosphere']
  },
  bundle: {
    enabled: true,
    exemptChunkPrefixes: [
      'worker-vendor-pkmn',
      'worker-game-data',
      'vendor-pkmn-sim',
      'game-data-pokemon',
      'vendor-randoms'
    ],
    forbiddenUiImports: [
      { module: 'lz-string', reason: 'Debe cargarse bajo demanda o en workers de guardado.' }
    ]
  },
  templates: {
    requireInputIds: false,
    tooltipComponents: ['Tooltip', 'PVTooltip'],
    safeTemplateFunctions: ['t', 'getItemSprite', 'getPokemonSprite'],
    forbiddenTemplateCallPatterns: ['(?:[a-zA-Z0-9_]*DataProvider|dataProvider)\\.[a-zA-Z0-9_]+\\s*\\(']
  },
  animation: {
    customTimerFunctions: ['battleAnimDelay', 'waitBattleTurn']
  },
  constants: {
    ignoredNames: ['DEFAULT_DEX_GENERATION', 'INITIAL_MONEY'],
    exemptMagicNumbers: [151, 251, 386, 493]
  },
  documentation: {
    knownValidAbstractPaths: ['@docs/gameplay/battle-system.md']
  },
  pinia: {
    authorizedMutationFiles: ['src/logic/utils/saveCoordinator.ts']
  },
  agentPlugin: {
    enabled: true
  },
  domain: {
    timezoneVariable: 'APP_TIMEZONE',
    timezoneHelperModule: '@/logic/utils/timeUtils',
    zLayersFile: 'src/logic/constants/visuals.ts',
    caseNormalizationExemptTokens: ['rpg', 'pvp', 'pve', 'fsm', 'dex', 'hp', 'atk', 'def', 'spa', 'spd', 'spe', 'iv', 'ev'],
    allowedStoreSetterPrefixes: ['set', 'update', 'equip'],
    allowedNumericConstantPrefixes: [
      'GEN_', 'ISO_', 'UTF_8', 'BASE_64', 'RGB_', 'RGBA_', 'WASM_', 'HTML_5', 'CSS_3', 'HTTP_', 'D3_',
      'GEN1_', 'GEN2_', 'GEN3_', 'GEN4_', 'GEN5_', 'GEN6_', 'GEN7_', 'GEN8_', 'GEN9_'
    ],
    finiteDomainTypes: [
      'PokemonId',
      'MoveId',
      'AbilityId',
      'ItemId',
      'NatureId',
      'Type',
      'BattleStatus',
      'Weather',
      'Terrain',
      'Gender',
      'StatId',
      'FsmState'
    ],
    infraIdWhitelist: [
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
      'nationalId',
      'national_id',
      'nationalDexId',
      'national_dex_id',
      'dexId',
      'dex_id',
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
        name: 'OFFICIAL_SERVERS',
        pattern: '\\bOFFICIAL_SERVERS\\.(?:find|filter|some|findLast)\\s*\\(',
        alternative: 'OFFICIAL_SERVERS_BY_ID[serverId]',
        definingFile: 'src/data/system/official_servers.ts'
      }
    ]
  },
  customFamilies: [
    {
      key: 'fsm',
      title: 'Finite State Machine & Turn Invariants',
      order: 5,
      icon: '🔄',
      description: 'Reglas e invariantes de FSM y combate'
    },
    {
      key: 'assets',
      title: 'Game Assets & Sprite Integrity',
      order: 6,
      icon: '🎨',
      description: 'Auditorías de sprites, audio y assets'
    }
  ],
  extensions: [
    './scripts/auditors/architecture/validate_render_performance.ts',
    './scripts/auditors/architecture/validate_overscroll_lock.ts',
    './scripts/auditors/architecture/validate_battle_ui_branching.ts',
    './scripts/auditors/architecture/validate_client_sim_decoupling.ts',
    './scripts/auditors/assets/audit_item_sprite_collisions.ts',
    './scripts/auditors/assets/validate_asset_usage.ts',
    './scripts/auditors/assets/validate_sprites.ts',
    './scripts/auditors/domain_data/validate_abilities.ts',
    './scripts/auditors/domain_data/validate_items.ts',
    './scripts/auditors/domain_data/validate_moves.ts',
    './scripts/auditors/domain_data/validate_pokemon.ts',
    './scripts/auditors/domain_data/validate_spanish_ids.ts',
    './scripts/auditors/domain_data/validate_spawns_whitelist.ts',
    './scripts/auditors/fsm/validate_combat_invariants.ts',
    './scripts/auditors/fsm/validate_fsm_diagrams.ts',
    './scripts/auditors/fsm/validate_fsm_flow_parity.ts',
    './scripts/auditors/fsm/validate_fsm_implementation.ts',
    './scripts/auditors/fsm/validate_showdown_parity.ts',
    './scripts/auditors/persistence/validate_save_persistence_parity.ts',
    './scripts/auditors/persistence/validate_schema_parity.ts',
    './scripts/auditors/persistence/validate_sql_migrations.ts'
  ]
});
