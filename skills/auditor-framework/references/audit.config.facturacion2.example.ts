/**
 * .agents/skills/auditor-framework/references/audit.config.facturacion2.example.ts
 *
 * Ejemplo de configuración de auditoría para Facturación 2.0 (CEVT).
 * Aplicación web con backend Supabase, reglas de cálculo fiscal estricto,
 * extensiones de script hardcoding y tipado de dominio.
 *
 * Este archivo sirve como REFERENCIA EDUCATIVA COMPLETA de configuración,
 * documentando cada campo, su propósito de arquitectura y el auditor correspondiente.
 */

import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  // Nombre legible del proyecto mostrado en reportes de terminal y encabezados Box-Drawing
  name: 'Facturación 2.0 (CEVT)',

  paths: {
    srcRoots: ['src'], // Directorios raíz donde reside el código de producción de la aplicación
    testRoots: ['tests/unit', 'tests/node'], // Directorios de suites de pruebas unitarias y de arquitectura (Vitest / Node)
    e2eRoots: ['tests/e2e'], // Directorio de pruebas de extremo a extremo (E2E) con emulación de navegador
    integrationRoots: ['tests/integration'], // Directorio de pruebas de integración con servicios externos o base de datos
    migrationsDir: 'supabase/migrations', // Directorio donde residen los scripts SQL de migración y evolución del esquema
    scriptsRoots: ['scripts'], // Directorio de utilidades CLI, automatizaciones y scripts de mantenimiento fuera de producción
    codeRoots: ['src', 'scripts', 'supabase'], // Alcance consolidado de directorios sujetos a auditoría de código estático
    dataRoots: ['src/data'], // Directorios de catálogos y datos tabulares (exentos de límites de LOC/complejidad pero auditados para tipos)
    constantsRoots: ['src/logic/constants'], // Directorios donde se declaran constantes globales y configuraciones del sistema
    componentsRoots: ['src/components'], // Directorios de componentes visuales de interfaz (archivos Vue SFC .vue)
    viewsRoots: ['src/views'], // Directorios de vistas de página principales conectadas al router
    storesRoots: ['src/stores'], // Directorios de almacenes de estado reactivo global (Pinia stores)
    composablesRoots: ['src/composables'], // Directorios de composables reactivos reutilizables de Vue
    typesRoots: ['src/types'], // Directorios de declaraciones de tipos TypeScript, contratos e interfaces
    stylesRoots: ['src/styles'], // Directorios de hojas de estilo globales (archivos SCSS/CSS de la aplicación)
    logicRoots: ['src/logic'], // Directorios de lógica pura de negocio, coordinadores y calculadores desacoplados de UI
    exemptFiles: ['src/logic/utils/logger.ts'], // Archivos específicos con excepciones justificadas para ciertas reglas de arquitectura
    includeTestsInCodeAudit: false, // Determina si los archivos de prueba se auditan con las reglas de código de producción (false evita falsos positivos)
    testFragmentationWhitelist: ['src/logic/calculators/heavyBillingEngine.ts'], // Módulos con alta complejidad autorizados formalmente a fragmentar sus suites de prueba
    ignoreGlobs: ['supabase/docker/volumes/**'], // Patrones glob de exclusión universal para herramientas estáticas y escaneo de archivos
    ignoredDirs: ['deploy'] // Directorios excluidos en su totalidad del análisis y recorrido del auditor
  },

  persistence: {
    engine: 'supabase', // Motor de base de datos en uso ('supabase', 'sqlite', 'postgres', 'hybrid', 'none')
    schemaQualified: true, // Exige que toda consulta SQL cualifique explícitamente el esquema (ej. 'public.tabla')
    prohibitedTemplateIdentifiers: ['supabase'], // Prohíbe acceder a instancias de base de datos directamente desde plantillas .vue para evitar fuga de persistencia a la vista
    allowedHosts: ['supabase.co', 'localhost', '127.0.0.1'], // Dominios y endpoints de red explícitamente autorizados para conexiones del cliente
    authorizedSaveFiles: [], // Módulos específicos autorizados a realizar persistencia directa en almacenamiento local
    saveKeyPrefixes: ['facturacion_local_save_'], // Prefijo obligatorio en claves de almacenamiento local para garantizar aislamiento y trazabilidad
    forbiddenMockModules: ['@/logic/db/*'] // Módulos de datos o persistencia cuyo mocking está prohibido en pruebas de integración para preservar fidelidad
  },

  e2e: {
    idLocatorsOnly: false // Si es true, exige usar exclusivamente selectores por ID (#id) o data-testid en tests E2E para evitar selectores frágiles por texto o clases
  },

  styles: {
    zLayersEnabled: true, // Activa la verificación estricta de la escala canónica de z-index
    baseScssFile: 'src/styles/_base.scss', // Archivo SCSS base donde se importan y declaran las variables principales del sistema de diseño
    zLayersScssFile: 'src/styles/_base.scss', // Archivo SCSS canónico donde se definen las variables $z-* para estilos
    zLayersTsFile: 'src/logic/constants/visuals.ts', // Archivo TypeScript canónico donde se exporta el objeto o enum Z_LAYERS para la lógica
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
    lineHeightOverlapCheck: true, // Verifica que las alturas de línea de texto prevengan solapamientos tipográficos
    globalUtilityClasses: [], // Clases utilitarias de CSS declaradas como excepciones válidas al modelo de estilos modulares
    buttonGovernance: {
      enabled: true, // Activa la gobernanza estricta de botones para unificar variantes en toda la aplicación
      buttonsScssFile: 'src/styles/_buttons.scss', // Archivo SCSS fuente donde se declaran las clases canónicas de botones
      canonicalVariants: ['btn-primary', 'btn-secondary', 'btn-dark', 'btn-success', 'btn-danger'] // Lista blanca de variantes canónicas de botones permitidas en vistas y componentes
    }
  },

  bundle: {
    enabled: true, // Activa el análisis de presupuestos de bundle y pesos de chunks compilados de producción
    distDir: 'dist/assets', // Directorio de salida generado por el bundler (Vite/Rollup) donde se inspeccionan los artefactos compilados
    maxClientChunkWarnBytes: 1200 * 1024, // Umbral de tamaño de chunk en bytes que emite una advertencia de rendimiento (1.2 MB)
    maxClientChunkErrorBytes: 2000 * 1024, // Umbral de tamaño de chunk en bytes que emite un error bloqueante en CI (2.0 MB)
    exemptChunkPrefixes: [], // Prefijos de nombres de chunks exentos de los presupuestos principales (ej. workers en segundo plano)
    budgets: [
      { pattern: 'index', maxBytes: 1200 * 1024, warnBytes: 800 * 1024 }, // Presupuesto para el chunk principal de entrada de la aplicación
      { pattern: 'vendor', maxBytes: 2000 * 1024, warnBytes: 1500 * 1024 } // Presupuesto para el chunk de dependencias externas compartidas
    ],
    forbiddenUiImports: [
      { module: 'xlsx', reason: 'Parser pesado de hojas de cálculo debe cargarse bajo demanda o en worker.' } // Parser pesado que nunca debe importarse de forma síncrona en componentes UI
    ]
  },

  templates: {
    requireInputIds: false, // Opcional: exige atributo id en elementos interactivos de templates para tests E2E
    tooltipComponents: ['Tooltip', 'PVTooltip'], // Componentes de tooltip registrados para el framework
    safeTemplateFunctions: ['formatMoney', 'formatDate', 'translate'] // Funciones permitidas dentro de expresiones {{ ... }} en plantillas Vue
  },

  animation: {
    customTimerFunctions: ['requestDelayedFrame'] // Funciones de tiempo personalizadas permitidas en UI además de gsapSleep/delayedCall
  },

  constants: {
    ignoredNames: ['TAX_DEFAULT_ROUNDING', 'FISCAL_YEAR_BASE'], // Constantes ignoradas en el detector de duplicados
    allowedNumericPrefixes: ['BASE_', 'TAX_'], // Prefijos permitidos para constantes numéricas
    exemptMagicNumbers: [21, 10.5, 27] // Números mágicos de tasas fiscales exentos de alerta
  },

  documentation: {
    knownValidAbstractPaths: ['@docs/architecture/fiscal-engine.md'] // Rutas abstractas reconocidas como válidas en Markdown
  },

  pinia: {
    authorizedMutationFiles: ['src/logic/coordinators/billingSessionCoordinator.ts'] // Archivos autorizados para mutar stores fuera de acciones
  },

  agentPlugin: {
    enabled: true // Integración del plugin de agentes de IA y skill oficial
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
    loggerModule: 'src/logic/utils/logger.ts', // Módulo canónico de logging estructurado que reemplaza llamadas directas a console.log/error
    zLayersFile: 'src/logic/constants/visuals.ts', // Ruta al archivo TypeScript canónico de capas z-index para verificación de paridad de dominio
    caseNormalizationExemptTokens: ['cevt', 'cuit', 'dni', 'iva', 'afip', 'kw', 'kwh', 'v', 'a'], // Siglas, acrónimos técnicos y unidades de medida exentos de advertencias de casing
    allowedStoreSetterPrefixes: ['set', 'update', 'assign'], // Prefijos semánticos autorizados para métodos mutadores en stores de Pinia
    allowedNumericConstantPrefixes: [
      'GEN_', 'ISO_', 'UTF_8', 'BASE_64', 'RGB_', 'RGBA_', 'WASM_', 'HTML_5', 'CSS_3', 'HTTP_', 'D3_'
    ], // Prefijos autorizados en identificadores de constantes numéricas para reflejar su dominio técnico
    finiteDomainTypes: [
      'TariffId',
      'VoltageCategory',
      'TaxRateType',
      'ServerId',
      'BillingStatus',
      'ConsumptionStepId',
      'RoundingModeType'
    ], // Tipos de dominio cerrado que deben definirse como uniones de literales y no strings abiertos
    infraIdWhitelist: ['projectId', 'scriptId', 'userId', 'logId', 'fileId'], // Identificadores técnicos de infraestructura permitidos con tipo string primitivo
    fallbackIdPatterns: ['tariffId', 'formulaId', 'stepId', 'serverId', 'rateId', 'categoryId'] // Patrones de identificadores de negocio que deben tiparse obligatoriamente con tipos de dominio
  },

  extensions: [
    './scripts/auditors/domain_data/validate_script_hardcoding.ts', // Sub-auditor local que prohíbe scripts de cálculo fiscal hardcodeados en el código fuente
    './scripts/auditors/architecture/validate_emoji_typography.ts' // Sub-auditor local que valida la coherencia tipográfica y el uso adecuado de emojis en la interfaz
  ]
});
