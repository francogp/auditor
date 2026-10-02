/**
 * .agents/skills/auditor-framework/references/audit.config.pokevicio.example.ts
 *
 * Ejemplo de configuración de auditoría para Poké Vicio (PokeBorrador).
 * Aplicación web compleja con persistencia híbrida (SQLite + Supabase),
 * Web Workers pesados exentos de budget principal, familias personalizadas y
 * sub-auditores de extensión locales (incluyendo render_performance).
 *
 * Este archivo sirve como REFERENCIA EDUCATIVA COMPLETA de configuración,
 * documentando cada campo, su propósito de arquitectura y el auditor correspondiente.
 */

import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  // Nombre legible del proyecto mostrado en reportes de terminal y encabezados Box-Drawing
  name: 'Poké Vicio',

  paths: {
    srcRoots: ['src'], // Directorios raíz donde reside el código de producción de la aplicación
    testRoots: ['tests'], // Directorios de suites de pruebas unitarias y de simulación de combate
    e2eRoots: ['scripts/e2e'], // Directorio donde residen los scripts de pruebas End-to-End en navegador
    integrationRoots: ['tests/integration'], // Directorio de pruebas de integración con persistencia híbrida
    migrationsDir: 'database/migrations', // Directorio donde residen los scripts SQL de migración
    scriptsRoots: ['scripts'], // Directorio de scripts de soporte, compilación y emulación de juego
    codeRoots: ['src', 'scripts', 'database'], // Alcance consolidado de directorios sujetos a auditoría de código estático
    dataRoots: ['src/data'], // Catálogos masivos de juego (Pokémon, movimientos, ítems) exentos de LOC/complejidad pero fuertemente tipados
    constantsRoots: ['src/logic/constants', 'src/constants'], // Directorios de constantes globales y tablas maestras inmutables
    componentsRoots: ['src/components'], // Directorios de componentes visuales de interfaz (archivos Vue SFC .vue)
    viewsRoots: ['src/views'], // Directorios de vistas de pantalla y escenarios de juego (enrutados por Vue Router)
    storesRoots: ['src/stores'], // Directorios de almacenes de estado reactivo global (Pinia stores)
    composablesRoots: ['src/composables'], // Directorios de composables reactivos reutilizables de Vue
    typesRoots: ['src/types'], // Directorios de declaraciones de tipos TypeScript, contratos de batalla e interfaces
    stylesRoots: ['src/styles'], // Directorios de hojas de estilo globales (archivos SCSS/CSS de la aplicación)
    logicRoots: ['src/logic'], // Directorios de lógica pura de combate, simuladores y coordinadores de juego desacoplados de UI
    exemptFiles: [], // Lista de archivos específicos con excepciones justificadas para ciertas reglas
    testFilePatterns: ['.spec.', '.test.', '.simulation.'], // Patrones de nombres de archivo reconocidos formalmente como suites de prueba
    includeTestsInCodeAudit: false, // Determina si los archivos de prueba se auditan con las reglas de código productivo (false previene falsos positivos)
    testFragmentationWhitelist: ['src/logic/battle/battleEngine.ts'], // Módulos de alta complejidad autorizados formalmente a fragmentar sus suites de prueba
    ignoreGlobs: ['node_modules/**', 'dist/**', 'scratch/**', '.tsbuildinfo/**'], // Patrones glob de exclusión universal para herramientas estáticas y escaneo
    ignoredDirs: ['external', 'showdown', 'backup_legacy_code', 'test aventura'], // Carpetas excluidas en su totalidad del análisis y recorrido del auditor
    ignoredPatterns: ['src/logic/db/migrations_data.ts'] // Patrones de rutas específicas exentas de escaneos particulares
  },

  persistence: {
    engine: 'hybrid', // Motor híbrido que combina persistencia local (SQLite/IndexedDB) para partidas offline y sincronización en la nube (Supabase)
    schemaQualified: false, // En SQLite no se utiliza cualificación de esquemas (como public.tabla)
    prohibitedTemplateIdentifiers: ['supabase', 'db', 'sqlite'], // Prohíbe acceder a instancias de base de datos directamente desde plantillas .vue para evitar fuga de persistencia a la vista
    allowedHosts: ['supabase.co', 'localhost', '127.0.0.1'], // Dominios y endpoints de red explícitamente autorizados para conexiones del cliente
    authorizedSaveFiles: [
      'src/logic/utils/saveCoordinator.ts', // Módulo autorizado para coordinar el guardado de partidas
      'src/logic/utils/saveActionHelpers.ts' // Helpers autorizados para serialización de acciones de guardado
    ],
    saveKeyPrefixes: ['pokemon_local_save_', 'pvs_sandbox_save'], // Prefijos obligatorios en las claves de almacenamiento local para aislar partidas
    positionalArrayColumns: ['team', 'box'], // Columnas de base de datos que almacenan arrays ordenados por posición (slots de equipo y cajas)
    allowedDatabaseDirs: ['backups', 'migrations', 'schemas', 'snapshots'], // Subcarpetas autorizadas dentro del directorio de persistencia
    allowedDatabaseFiles: ['AGENTS.md', '.gitkeep', 'seed.sql'] // Archivos autorizados en la raíz de persistencia sin activar alertas de archivos huérfanos
  },

  e2e: {
    idLocatorsOnly: true // Exige estrictamente el uso de selectores por ID (#id) o data-testid en tests E2E para evitar selectores frágiles por texto o clase
  },

  styles: {
    zLayersEnabled: true, // Activa la verificación estricta de la escala canónica de z-index
    baseScssFile: 'src/styles/core/_base.scss', // Archivo SCSS base donde se importan y declaran las variables principales del sistema de diseño
    zLayersScssFile: 'src/styles/core/_base.scss', // Archivo SCSS canónico donde se definen las variables $z-* para estilos
    zLayersTsFile: 'src/logic/constants/visuals.ts', // Archivo TypeScript canónico donde se exporta el enum/objeto Z_LAYERS para la lógica
    // Nota: El objeto `zLayers` es opcional si `zLayersTsFile` exporta Z_LAYERS; el framework auditor
    // lo resuelve dinámicamente mediante `getEffectiveZLayers()`. Declararlo explícitamente aquí
    // actúa como Single Source of Truth estricto con precedencia absoluta sobre el archivo TypeScript.
    zLayers: {
      BASE: 0, // Capa de fondo y base visual
      LOW: 50, // Elementos decorativos sutiles detrás del contenido
      CONTENT: 100, // Contenido principal y flujo estándar del documento
      HEADER: 500, // Encabezados fijos de sección y barras superiores
      SIDEBAR: 800, // Barras laterales colapsables y menús de navegación lateral
      HUD: 1000, // Elementos flotantes de interfaz de usuario fija
      NAVIGATION: 5000, // Barra de navegación principal y controles de acceso rápido
      DROPDOWN: 7000, // Menús desplegables y autocompletados sobre la navegación
      OVERLAY: 10000, // Fondos oscurecidos y telones para modales
      MODAL: 11000, // Ventanas modales y cuadros de diálogo interactivos
      MODAL_STEP: 10, // Incremento de capa para modales anidados
      TOOLTIP: 15000, // Globos de información y ayudas contextuales sobre modales
      TOAST: 20000, // Notificaciones flotantes de alta visibilidad
      MAX: 100000, // Límite máximo general para capas normales
      CRITICAL: 999999 // Capa crítica reservada para alertas de error del sistema y bloqueos fatales
    },
    globalUtilityClasses: ['pv-button-retro'], // Clases CSS utilitarias globales autorizadas como excepciones al modelo BEM estricto
    heavyEffectPaths: ['src/styles/weather', 'src/styles/atmosphere'] // Módulos de estilos visuales complejos con directivas CSS intensivas autorizadas (clima, efectos ambientales)
  },

  bundle: {
    enabled: true, // Activa el análisis de presupuestos de bundle y pesos de chunks compilados de producción
    maxClientChunkWarnBytes: 1500 * 1024, // Umbral de advertencia para chunks del cliente (1.5 MB)
    maxClientChunkErrorBytes: 2500 * 1024, // Umbral de error crítico para chunks del cliente (2.5 MB)
    exemptChunkPrefixes: [
      'worker-vendor-pkmn', // Web Worker para motor de simulación Pokémon desacoplado del hilo principal
      'worker-game-data', // Web Worker para carga y consulta de datos pesados de juego
      'vendor-pkmn-sim', // Simulador de batallas pesado cargado dinámicamente
      'game-data-pokemon', // Chunk de datos de juego cargado bajo demanda
      'vendor-randoms' // Generador pseudo-aleatorio complejo para batallas
    ],
    budgets: [
      { pattern: 'index', maxBytes: 1500 * 1024, warnBytes: 1000 * 1024 }, // Presupuesto para el chunk principal de entrada de la aplicación
      { pattern: 'battle', maxBytes: 2500 * 1024, warnBytes: 1800 * 1024 } // Presupuesto para la vista pesada de combate
    ],
    forbiddenUiImports: [
      { module: 'lz-string', reason: 'Debe cargarse bajo demanda o en workers de guardado.' } // Compresión pesada que debe ejecutarse fuera del hilo de UI
    ]
  },

  templates: {
    requireInputIds: false, // No exige IDs obligatorios en todos los elementos interactivos
    tooltipComponents: ['Tooltip', 'PVTooltip'], // Componentes de tooltip registrados reconocidos por el auditor de templates
    safeTemplateFunctions: ['t', 'getItemSprite', 'getPokemonSprite'], // Funciones seguras y puras permitidas en plantillas Vue
    forbiddenTemplateCallPatterns: ['(?:[a-zA-Z0-9_]*DataProvider|dataProvider)\\.[a-zA-Z0-9_]+\\s*\\('] // Patrones de llamada prohibidos en plantillas para evitar re-render loops infinitos
  },

  animation: {
    customTimerFunctions: ['battleAnimDelay', 'waitBattleTurn'] // Timers de juego coordinados para pruebas aceleradas determinísticas
  },

  constants: {
    ignoredNames: ['DEFAULT_DEX_GENERATION', 'INITIAL_MONEY'], // Constantes globales exentas de análisis de duplicados
    allowedNumericPrefixes: ['GEN_', 'ISO_', 'BASE_'], // Prefijos permitidos para constantes numéricas
    exemptMagicNumbers: [151, 251, 386, 493] // Cantidades canónicas de generaciones de Pokémon exentas de alertas de números mágicos
  },

  documentation: {
    knownValidAbstractPaths: ['@docs/gameplay/battle-system.md'] // Rutas virtuales válidas en enlaces de documentación Markdown
  },

  pinia: {
    authorizedMutationFiles: ['src/logic/utils/saveCoordinator.ts'] // Archivos autorizados para mutaciones directas de stores fuera de acciones
  },

  agentPlugin: {
    enabled: true // Integración del plugin de agentes de IA y sincronización de reglas
  },

  fallow: {
    enabled: true, // Fallow está 100% activo (código muerto, complejidad, duplicados, unused exports)
    security: {
      enabled: true // Análisis estático de vulnerabilidades Fallow CWE (sinks de seguridad, SSRF, inyecciones de comandos)
    },
    enforceTargets: false, // NO desactiva Fallow. Solo decide si las sugerencias de refactorización estructural (targets) bloquean en CI o son consultivas
    maxTargetPriority: 'critical', // Umbral de prioridad si enforceTargets es true ('critical' >= 30, 'high' >= 20, 'all')
    similarCode: {
      enabled: true, // Búsqueda de duplicación semántica mediante embeddings vectoriales de IA
      threshold: 0.95, // Sensibilidad quirúrgica (evita falsos positivos entre funciones similares)
      ignoreSameFile: true // Ignora pares del mismo archivo (ej. safeWriteFile vs safeWriteFileSync) para alertar solo duplicados entre archivos distintos
    }
  },

  domain: {
    timezoneVariable: 'APP_TIMEZONE', // Constante o variable canónica que almacena la zona horaria del sistema
    timezoneHelperModule: '@/logic/utils/timeUtils', // Módulo centralizado autorizado para manipulaciones de fechas y conversiones de zona horaria
    zLayersFile: 'src/logic/constants/visuals.ts', // Ruta al archivo TypeScript canónico de capas z-index para verificación de paridad de dominio
    caseNormalizationExemptTokens: ['rpg', 'pvp', 'pve', 'fsm', 'dex', 'hp', 'atk', 'def', 'spa', 'spd', 'spe', 'iv', 'ev'], // Siglas, acrónimos técnicos y términos de batalla exentos de advertencias de casing
    allowedStoreSetterPrefixes: ['set', 'update', 'equip'], // Prefijos semánticos autorizados para métodos mutadores en stores de Pinia
    allowedNumericConstantPrefixes: [
      'GEN_', 'ISO_', 'UTF_8', 'BASE_64', 'RGB_', 'RGBA_', 'WASM_', 'HTML_5', 'CSS_3', 'HTTP_', 'D3_',
      'GEN1_', 'GEN2_', 'GEN3_', 'GEN4_', 'GEN5_', 'GEN6_', 'GEN7_', 'GEN8_', 'GEN9_'
    ], // Prefijos autorizados en identificadores de constantes numéricas (incluyendo generaciones Pokémon)
    finiteDomainTypes: [
      'PokemonId', // Identificador canónico de especie Pokémon
      'MoveId', // Identificador canónico de movimiento
      'AbilityId', // Identificador canónico de habilidad
      'ItemId', // Identificador canónico de ítem
      'NatureId', // Identificador canónico de naturaleza
      'Type', // Tipo elemental de Pokémon/movimiento
      'BattleStatus', // Estado alterado en combate (parálisis, veneno, etc.)
      'Weather', // Clima activo en el campo de batalla
      'Terrain', // Terreno activo en el campo de batalla
      'Gender', // Género de la criatura
      'StatId', // Identificador de estadística (HP, ATK, etc.)
      'FsmState' // Estado canónico de la máquina de estados de batalla
    ], // Tipos de dominio cerrado que deben definirse como uniones de literales y no strings abiertos
    infraIdWhitelist: [
      // Identificadores técnicos de infraestructura, sesiones y entidades de juego permitidos con tipo string primitivo
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
      // Patrones de identificadores de negocio de juego que requieren tipado estricto con sus tipos de dominio
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
        name: 'OFFICIAL_SERVERS', // Nombre del catálogo auditado para accesos de complejidad O(1)
        pattern: '\\bOFFICIAL_SERVERS\\.(?:find|filter|some|findLast)\\s*\\(', // Patrón regex de búsqueda lineal O(N) prohibida
        alternative: 'OFFICIAL_SERVERS_BY_ID[serverId]', // Alternativa recomendada de acceso indexado O(1) por clave
        definingFile: 'src/data/system/official_servers.ts' // Archivo donde se define el catálogo indexado
      }
    ]
  },

  customFamilies: [
    {
      key: 'fsm', // Identificador único de la familia personalizada en reportes y CLI
      title: 'Finite State Machine & Turn Invariants', // Título legible desplegado en la tabla Box-Drawing del auditor
      order: 5, // Orden numérico de presentación en la secuencia de familias de auditoría
      icon: '🔄', // Emoji distintivo para renderizado en consola
      description: 'Reglas e invariantes de FSM y combate' // Descripción corta del alcance arquitectónico de la familia
    },
    {
      key: 'assets', // Identificador único de la familia personalizada en reportes y CLI
      title: 'Game Assets & Sprite Integrity', // Título legible desplegado en la tabla Box-Drawing del auditor
      order: 6, // Orden numérico de presentación en la secuencia de familias de auditoría
      icon: '🎨', // Emoji distintivo para renderizado en consola
      description: 'Auditorías de sprites, audio y assets' // Descripción corta del alcance arquitectónico de la familia
    }
  ],

  extensions: [
    './scripts/auditors/architecture/validate_battle_ui_branching.ts', // Valida la simplificación de bifurcaciones complejas en la UI de combate
    './scripts/auditors/architecture/validate_client_sim_decoupling.ts', // Garantiza el desacoplamiento estricto entre el motor de simulación y la UI del cliente
    './scripts/auditors/assets/audit_item_sprite_collisions.ts', // Detecta colisiones de nombres o índices en los sprites de ítems
    './scripts/auditors/assets/validate_asset_usage.ts', // Detecta assets gráficos o de audio huérfanos o no referenciados
    './scripts/auditors/assets/validate_sprites.ts', // Valida dimensiones, formatos y metadatos de la colección de sprites
    './scripts/auditors/domain_data/validate_abilities.ts', // Valida la integridad referencial y tipado del catálogo de habilidades
    './scripts/auditors/domain_data/validate_items.ts', // Valida la integridad de datos y precios del catálogo de ítems
    './scripts/auditors/domain_data/validate_moves.ts', // Valida tipos, potencias y efectos del catálogo de movimientos
    './scripts/auditors/domain_data/validate_pokemon.ts', // Valida estadísticas base y tipos del catálogo de especies de Pokémon
    './scripts/auditors/domain_data/validate_spanish_ids.ts', // Asegura que los identificadores de dominio preserven nombres técnicos en inglés
    './scripts/auditors/domain_data/validate_spawns_whitelist.ts', // Valida tablas de generación de encuentros contra la Pokédex oficial
    './scripts/auditors/fsm/validate_combat_invariants.ts', // Verifica que las transiciones de turnos de combate preserven invariantes matemáticas
    './scripts/auditors/fsm/validate_fsm_diagrams.ts', // Comprueba paridad entre diagramas de estado de combate y código ejecutable
    './scripts/auditors/fsm/validate_fsm_flow_parity.ts', // Valida paridad de flujo entre fases de decisión, animación y resolución
    './scripts/auditors/fsm/validate_fsm_implementation.ts', // Audita la implementación de la máquina de estados finitos (FSM)
    './scripts/auditors/fsm/validate_showdown_parity.ts', // Verifica consistencia de fórmulas mecánicas frente al estándar Pokémon Showdown
    './scripts/auditors/persistence/validate_save_persistence_parity.ts', // Valida paridad de serialización y deserialización de partidas guardadas
    './scripts/auditors/persistence/validate_schema_parity.ts', // Asegura paridad total entre los esquemas de base de datos SQLite y Supabase
    './scripts/auditors/persistence/validate_sql_migrations.ts' // Verifica idempotencia, reversibilidad y sintaxis en migraciones SQL
  ]
});
