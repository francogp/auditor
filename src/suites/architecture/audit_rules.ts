/**
 * scripts/maintenance/audit_rules.ts
 * 
 * Centralized audit rules and checkers for the unified audit engine.
 */

import path from 'node:path';
import { statSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { getAuditConfig, isTestPath, isDataPath, isConstantsPath } from '../../core/auditConfig.ts';
import { isPathIgnored } from '../../core/auditorBase.ts';

export const AUDIT_SEVERITIES = ['error', 'warning'] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

export interface RuleDescriptor {
  readonly id: string;
  readonly name: string;
  readonly category?: string;
  readonly aliases?: readonly string[];
  readonly packageName?: string;
}

export interface AuditRule extends Partial<RuleDescriptor> {
  regex: RegExp;
  message: string | ((match: string) => string);
  fix?: (match: string) => string;
  check?: (context: string, match: RegExpExecArray, filePath?: string) => boolean;
  severity?: AuditSeverity;
  fixable?: boolean;
  addImport?: string;
  maxLines?: number;
  ignorePattern?: RegExp;
  exemptConfigFiles?: RegExp;
}

export function matchesRule(descriptor: RuleDescriptor | AuditRule, selectedRules: ReadonlySet<string>): boolean {
  if (selectedRules.size === 0) return true;
  const tokens = [
    ...(descriptor.id ? [descriptor.id.toLowerCase()] : []), // string-ok: Internal string formatting or DOM token identifier
    ...(descriptor.name ? [descriptor.name.toLowerCase()] : []), // string-ok: Internal string formatting or DOM token identifier
    ...(descriptor.category ? [descriptor.category.toLowerCase()] : []), // string-ok: Internal string formatting or DOM token identifier
    ...(descriptor.aliases ? descriptor.aliases.filter(Boolean).map(a => a.toLowerCase()) : []) // string-ok: Internal string formatting or DOM token identifier
  ].filter(t => t.length > 0);
  for (const selected of selectedRules) {
    if (tokens.some(t => t === selected || t.includes(selected) || selected.includes(t))) {
      return true;
    }
  }
  return false;
}

export const Z_INDEX_CONSISTENCY_DESCRIPTOR: RuleDescriptor = {
  id: 'z-index-parity',
  name: 'Z-Index Parity (visuals.ts <-> _base.scss)',
  category: 'Z-Index fuera de estándar',
  aliases: ['z-index', 'zindex', 'visuals', 'parity', 'z-index-parity']
};

export const FALLOW_SUITE_DESCRIPTORS: Record<'dupes' | 'security' | 'dead-code' | 'health', RuleDescriptor> = {
  dupes: {
    id: 'fallow:dupes',
    name: 'Fallow Code Duplication & Clones',
    category: 'Fallow: Código duplicado',
    aliases: ['dupes', 'duplicados', 'triplicados', 'clones', 'fallow:dupes', 'fallow-dupes', 'fallow']
  },
  security: {
    id: 'fallow:security',
    name: 'Fallow Security CWE Vulnerabilities',
    category: 'Fallow: Vulnerabilidad de seguridad',
    aliases: ['security', 'seguridad', 'cwe', 'vulnerabilidad', 'vulnerabilidades', 'fallow:security', 'fallow-security', 'fallow']
  },
  'dead-code': {
    id: 'fallow:dead-code',
    name: 'Fallow Dead Code, Circular Dependencies & Unused',
    category: 'Fallow: Archivos huérfanos',
    aliases: [
      'dead-code',
      'deadcode',
      'codigo-muerto',
      'circular',
      'huérfano',
      'unused',
      'fallow:dead-code',
      'fallow-dead-code',
      'fallow',
      'store-members',
      'class-members',
      'types',
      'emits',
      'unlisted'
    ]
  },
  health: {
    id: 'fallow:health',
    name: 'Fallow Code Health & Complexity',
    category: 'Fallow: Complejidad',
    aliases: ['health', 'salud', 'complexity', 'complejidad', 'fallow:health', 'fallow-health', 'fallow']
  }
};

export const SASS_MIGRATOR_DESCRIPTOR: RuleDescriptor = {
  id: 'sass-migrator',
  name: 'SASS Module Migrator',
  category: 'SASS Migrator',
  aliases: ['sass', 'sass-migrator', 'import', '@import', 'scss']
};

export interface Violation {
  file: string;
  line: number;
  message: string;
  context: string;
  severity: AuditSeverity;
  fixable: boolean;
  packageName?: string;
  ruleId?: string;
  ruleDescription?: string;
}

export const CANONICAL_DEFAULT_Z_LAYERS: Record<string, number> = {
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
};

function loadZLayers(): Record<string, number> {
  const config = getAuditConfig();
  const relFile = config.domain.zLayersFile ?? 'src/logic/constants/visuals.ts';
  const candidates = [
    path.resolve(process.cwd(), relFile),
    path.resolve(process.cwd(), '../..', relFile)
  ];
  for (const absPath of candidates) {
    if (existsSync(absPath)) {
      try {
        const content = readFileSync(absPath, 'utf-8');
        const match = content.match(/export\s+const\s+Z_LAYERS\s*=\s*\{([\s\S]*?)\}\s*(?:as\s+const)?;/);
        if (match && match[1]) {
          const result: Record<string, number> = {};
          const lines = match[1].split('\n');
          for (const line of lines) {
            const m = line.match(/([A-Z_a-z]\w*)\s*:\s*(-?\d+)/);
            if (m && m[1] && m[2]) {
              result[m[1]] = parseInt(m[2], 10);
            }
          }
          return result;
        }
      } catch {
        // Fallback
      }
    }
  }
  return CANONICAL_DEFAULT_Z_LAYERS;
}

export const Z_LAYERS: Record<string, number> = loadZLayers();

// Invert Z_LAYERS for lookup
export const Z_VALUE_MAP = Object.fromEntries(
  Object.entries(Z_LAYERS).map(([key, value]) => [value, key])
);

// Sorted values for nearest search
export const Z_SORTED_ENTRIES = Object.entries(Z_LAYERS).sort((a, b) => a[1] - b[1]);
/** Sentinel: initial minDiff larger than any possible difference between Z layer values. */
const Z_LAYERS_DIFF_SENTINEL = Z_SORTED_ENTRIES.length + 1;

/** 
 * Native cross-platform path resolver using node:path.
 * Produces a normalized relative POSIX path from the project root for deterministic rule evaluation.
 */
export function normalizeFilePath(filePath: string): string {
  const rel = path.isAbsolute(filePath) ? path.relative(process.cwd(), filePath) : filePath;
  return rel.replace(/\\/g, '/').toLowerCase(); // string-ok: Internal string formatting or DOM token identifier
}

export const viewport: AuditRule = { // string-ok: Internal string formatting or DOM token identifier
  id: 'viewport',
  name: 'Viewport Units',
  category: 'Viewport (dvh/dvw)',
  aliases: ['viewport', 'dvh', 'dvw', 'vh', 'vw'],
  regex: /\b\d+(?:\.\d+)?(vw|vh)\b/gi,
  message: (match: string) => `Unidad legacy detectada: '${match}'. Usa 'd${match.slice(-2)}' para soporte mobile dinámico.`,
  fix: (match: string) => `d${match.toLowerCase().slice(-2)}` // string-ok: Internal string formatting or DOM token identifier
};

const CONTEXT_WINDOW_SPAN_CHARS = 500;

export const gpuGaps: AuditRule = {
  id: 'gpuGaps',
  name: 'GPU Gaps Promotion',
  category: 'Falta will-change (GPU)',
  aliases: ['gpu', 'gpu-gaps', 'will-change', 'filter'],
  regex: /(backdrop-filter|filter):/gi,
  message: "Filtro detectado sin 'will-change'. Considera añadir promoción de capa.",
  severity: 'error',
  check: (content: string, match: RegExpExecArray, filePath?: string) => {
    // Only check CSS/SCSS files and <style> blocks in .vue files
    if (filePath) {
      const norm = normalizeFilePath(filePath);
      const isCssFile = norm.endsWith('.scss') || norm.endsWith('.css');
      const isVueFile = norm.endsWith('.vue');
      if (!isCssFile && !isVueFile) return false;

      // For .vue files, check only inside <style> block
      if (isVueFile) {
        const styleOpenIndex = content.lastIndexOf('<style', match.index);
        const styleCloseIndex = content.lastIndexOf('</style>', match.index);
        if (styleOpenIndex === -1 || styleOpenIndex < styleCloseIndex) return false;
      }
    }

    const start = Math.max(0, match.index - CONTEXT_WINDOW_SPAN_CHARS);
    const end = Math.min(content.length, match.index + CONTEXT_WINDOW_SPAN_CHARS);
    const context = content.substring(start, end);

    if (/audit-disable\s+gpu-gaps|will-change:\s*(skip|ignore|false)/i.test(context)) {
      return false;
    }

    const beforeMatch = content.substring(start, match.index);
    const lastSemi = Math.max(beforeMatch.lastIndexOf(';'), beforeMatch.lastIndexOf('}'), beforeMatch.lastIndexOf('{'));
    const selectorText = beforeMatch.substring(lastSemi + 1).trim();

    const highDensityKeywords = /(card|item|sprite|avatar|nickname|badge|icon|grid|list|row|cell|weather|overlay|background)/i;
    if (highDensityKeywords.test(selectorText) || (filePath && highDensityKeywords.test(filePath))) {
      return false;
    }

    const isDynamic = /transition\s*:[^;]*(filter|backdrop-filter|all)|animation\s*:/gi.test(context);
    if (!isDynamic) {
      return false;
    }

    return !/(will-change|will-animate)/gi.test(context);
  },
  fixable: false 
};

export const legacyDates: AuditRule = {
  id: 'legacyDates',
  name: 'Temporal Migration',
  category: 'Uso de Date (Temporal)',
  aliases: ['temporal', 'date', 'dates', 'legacy-dates'],
  regex: /new Date\(|Date\.now\(\)/g,
  message: "Uso de 'Date' detectado. Usa 'Temporal'.",
  severity: 'error', // string-ok: Internal string formatting or DOM token identifier
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const lowerPath = normalizeFilePath(filePath);
    if (lowerPath.includes('migrate_temporal.ts') || lowerPath.endsWith('eslint.config.js')) {
      return false;
    }
    return !isTestPath(filePath);
  },
  fixable: false
};

export const hardcodedTimezone: AuditRule = {
  regex: /toZonedDateTimeISO\(\s*['"]([^'"]+)['"]\s*\)|toPlainDateTime\(\s*['"]([^'"]+)['"]\s*\)|Temporal\.TimeZone\.from\(\s*['"]([^'"]+)['"]\s*\)/g,
  message: (match: string) => {
    const tzVar = getAuditConfig().domain.timezoneVariable ?? 'APP_TIMEZONE';
    const helperMod = getAuditConfig().domain.timezoneHelperModule ?? '@/logic/utils/timeUtils';
    return `Timezone hardcodeado detectado: '${match}'. Usa la variable global '${tzVar}' importada desde '${helperMod}' para respetar la configuración del servidor.`;
  },
  severity: 'error',
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => { // string-ok: Internal string formatting or DOM token identifier
    if (!filePath) return false;
    if (filePath.endsWith('timeUtils.ts')) return false;
    return !isTestPath(filePath);
  },
  fixable: false
};

export function getDomainIdFallbackRegex(): RegExp {
  const config = getAuditConfig();
  const patterns = config?.domain?.fallbackIdPatterns && config.domain.fallbackIdPatterns.length > 0
    ? config.domain.fallbackIdPatterns
    : ['[a-zA-Z0-9_]*[iI]d', 'type', 'status', 'category', 'mode', 'kind'];
  const joined = patterns.join('|');
  return new RegExp(
    `(?:${joined})\\s*(?:=|:)\\s*.*(?:\\?|\\|\\||\\?\\?)\\s*['"]['"]|` +
    `\\b(?:${joined})\\s*(?:\\|\\||\\?\\?)\\s*[^,\\n;)]*\\b(?:name|description|title)\\b|` +
    `\\b(?:name|description|title)\\s*(?:\\|\\||\\?\\?)\\s*[^,\\n;)]*\\b(?:${joined})\\b`,
    'g'
  );
}

export const noDomainIdFallbacks: AuditRule = {
  get regex() {
    return getDomainIdFallbackRegex();
  },
  message: "FALLBACK SILENCIOSO EN ID DE DOMINIO / NOMBRE DETECTADO. Queda estrictamente prohibido usar fallbacks silenciosos (|| '', ?? '', .id || .name) para identificadores de dominio. Debe usarse una función de validación estricta que lance un error explícito (Fail Loud) si el ID falta o es inválido.",
  severity: 'error', // string-ok: Internal string formatting or DOM token identifier
  check: (content: string, match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const normPath = normalizeFilePath(filePath);
    if (normPath.includes('audit_rules.ts') || normPath.includes('.test.') || normPath.includes('.spec.') || normPath.includes('tests/')) return false;
    if (!normPath.includes('src/')) return false;

    // Respect standard escape hatches for pure display localization / text
    const matchIndex = match.index ?? 0;
    const lineStart = content.lastIndexOf('\n', matchIndex) + 1;
    const lineEnd = content.indexOf('\n', matchIndex);
    const line = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    if (/\/\/\s*(?:text-ok|domain-ok|string-ok|no-domain)/.test(line)) return false;

    const configPatterns = getAuditConfig()?.domain?.fallbackIdPatterns;
    if (configPatterns && configPatterns.length > 0) {
      const matchText = match[0] || '';
      const matchesConfig = configPatterns.some(p => matchText.includes(p));
      if (!matchesConfig) return false;
    }

    return true;
  },
  fixable: false
};

export const nodePrefix: AuditRule = {
  regex: /import .* from ['"](fs|path|os|crypto|util|url|events|stream|child_process)['"]/g,
  message: "Import de Node sin prefijo 'node:'.",
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath || filePath.includes('audit_rules.ts')) return false;
    return true;
  },
  fix: (match: string) => match.replace(/['"](fs|path|os|crypto|util|url|events|stream|child_process)['"]/, (m) => m.slice(0, 1) + 'node:' + m.slice(1))
};

const RULES_TARGET_NODE_VERSION_LABEL = '26';

export const esmExtensions: AuditRule = {
  regex: /import\s+[\s\S]*?\s+from\s+['"](\.\.?[^'"]+)['"]/g,
  message: (match: string) => `Import relativo sin extensión: '${match}'. En Node.js ${RULES_TARGET_NODE_VERSION_LABEL}+ nativo las extensiones son obligatorias.`,
  severity: 'error',
  fix: (match: string) => match.replace(/(['"])(\.\.?\/[^'"]+)(?<!\.[jt]s)(?<!\.vue)(?<!\.json)(['"])/g, '$1$2.ts$3'),
  check: (_content: string, match: RegExpExecArray, filePath?: string) => {
    if (!filePath || filePath.endsWith('.vue') || filePath.includes('audit_rules.ts')) return false;
    const importPath = match[1] || '';
    if (/\.(ts|js|vue|json|scss|css|svg|png|jpg|jpeg|webp|ogg|mp3|wasm)$/i.test(importPath)) return false;
    return true;
  }
};

export const tsIgnore: AuditRule = {
  regex: /\/\/\s*@ts-(ignore|nocheck|expect-error)/g,
  message: "Uso de supresión de TypeScript detectado. Prohibido por la política 'Zero-Ignore'.",
  severity: 'error',
  fix: () => '',
  fixable: true
};

export const noAliasConstants: AuditRule = {
  regex: /\bconst\s+([A-Z0-9_]{3,})\s*(?::\s*[^=]+)?=\s*([A-Z0-9_]+(?:\.[A-Z0-9_]+)*)\s*(?:as\s+[^;]+)?;?\s*$/gm,
  message: (match: string) => `Alias de constante detectado: '${match.trim()}'. Está PROHIBIDO inicializar una constante con otra constante o propiedad de constante existente para crear un alias duplicado/intermedio. Usa la constante canónica de origen de forma directa.`,
  severity: 'error',
  check: (content: string, match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const norm = normalizeFilePath(filePath);
    if (norm.includes('node_modules')) return false;
    const constA = match[1];
    const constB = match[2];
    if (!constA || !constB || constA === constB) return false;
    // Do not flag if right-hand side is followed by a dot (.) or function invocation indicating a method call
    const afterMatch = content.substring(match.index + match[0].length);
    if (afterMatch.trimStart().startsWith('.') || afterMatch.trimStart().startsWith('(')) return false;
    // Do not flag if the right-hand side value is purely numeric digits or formatted numeric literals (e.g. 3_000)
    if (/^[\d_]+$/.test(constB) || /^\d/.test(constB)) return false;
    return true;
  }
};

export const noLiteralSuffixInConstantName: AuditRule = {
  regex: /\b([A-Z0-9_]+_(\d{2,}))\b/g,
  message: (match: string) => `Constante con sufijo numérico crudo detectada: '${match}'. Está PROHIBIDO incluir literales numéricos al final de los nombres de constantes (ej: _100, _600, _10000). Usa nombres semánticos descriptivos.`,
  severity: 'error',
  check: (_content: string, match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const norm = normalizeFilePath(filePath);
    if (norm.includes('node_modules') || norm.includes('.spec.') || norm.includes('.test.')) return false;
    const constName = match[1] || '';
    if (/^\d/.test(constName)) return false;
    // Ignorar excepciones conocidas legítimas como Gen1, Gen2, RGB, HTTP, 2D, 3D, W3C, ISO, etc.
    if (/(?:GEN_\d|ISO_\d|UTF_8|BASE_64|RGB_|RGBA_|WASM_|HTML_5|CSS_3|HTTP_\d)/i.test(constName)) return false;
    return true;
  }
};

export const timersPromises: AuditRule = {
  regex: /new Promise\(r => setTimeout\(r, (\d+)\)\)/g,
  message: "Uso de setTimeout manual en script Node. Considera 'import { setTimeout } from \"node:timers/promises\"'.",
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => !!filePath && normalizeFilePath(filePath).includes('scripts/') && !normalizeFilePath(filePath).includes('node_modules'),
  fixable: false
};

export const explicitResource: AuditRule = {
  regex: /const (\w+) = (new DatabaseSync|fs\.openSync)/g,
  message: `Recurso detectado sin 'using'. Usa Explicit Resource Management (Node ${RULES_TARGET_NODE_VERSION_LABEL}+).`,
  fix: (match: string) => match.replace('const', 'using'),
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => !!filePath && normalizeFilePath(filePath).includes('scripts/')
};

export const manualAnimations: AuditRule = {
  regex: /@keyframes\b|\btransition\s*:/g,
  message: (match: string) => `Animación manual detectada: '${match}'. MIGRACIÓN OBLIGATORIA A GSAP: Está strictly PROHIBIDO borrar esta animación sin haberla migrado antes a GSAP para preservar la experiencia visual.`,
  severity: 'error',
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const norm = normalizeFilePath(filePath);
    return norm.endsWith('.scss') || norm.endsWith('.css') || norm.endsWith('.vue');
  },
  fixable: false
};

export const emptyVueTransitions: AuditRule = {
  regex: /\.(?:[\w-]+)-(?:enter|leave)-(?:active|from|to)(?:[\s,]+(?:\.(?:[\w-]+)-(?:enter|leave)-(?:active|from|to)))*\s*\{\s*(?:@include\s+[\w-]+;\s*)?\}/g,
  message: (match: string) => `Transición de Vue vacía detectada: '${match.trim()}'. MIGRACIÓN OBLIGATORIA A GSAP: Prohibido vaciar las clases de transición de Vue para evadir el auditor. Migra la animación a hooks GSAP (<Transition :css="false" @enter="..." @leave="...">) o usa composables de animación.`,
  severity: 'error',
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const norm = normalizeFilePath(filePath);
    return norm.endsWith('.scss') || norm.endsWith('.css') || norm.endsWith('.vue');
  },
  fixable: false
};

export const manualTimersFrontend: AuditRule = {
  regex: /\b(set|clear)(Timeout|Interval)\b/g,
  message: (match: string) => `Timer de ANIMACIÓN/UI detectado: '${match}'. MIGRACIÓN OBLIGATORIA A GSAP: Prohibido en componentes UI y lógicas para gestionar flujo visual o reintentos de carga. Usa gsap.delayedCall, timelines o promesas deterministas.`,
  severity: 'error', 
  check: (content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    if (/audit-disable\s+timers/i.test(content)) return false;
    const norm = normalizeFilePath(filePath);
    if (!norm.includes('src/')) return false;
    if (norm.includes('.spec.') || norm.includes('.test.') || norm.includes('node_modules')) return false;
    if (norm.includes('src/logic/utils/timeutils') || norm.includes('src/stores/auth') || norm.includes('src/views/auth/') || norm.includes('src/logic/auth/')) return false;

    // Check for line-level timer-ok or delay-ok justification
    const matchIndex = _match.index ?? 0;
    const lineStart = content.lastIndexOf('\n', matchIndex) + 1;
    const lineEnd = content.indexOf('\n', matchIndex);
    const line = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    if (/\/\/\s*(?:timer-ok|delay-ok):\s*\S+/i.test(line)) return false;

    return true;
  },
  fixable: false
};

export const zeroTimerLogic: AuditRule = {
  id: 'zeroTimerLogic',
  name: 'Zero Timer Logic',
  aliases: ['zerotimerbattlelogic', 'zerotimercalculationlogic', 'zerotimerlogic'],
  regex: /\b(sleep)\s*\(/g,
  message: "Uso de 'sleep()' nativo detectado en lógica central. Las funciones de lógica de negocio deben ser 100% deterministas y orientadas a eventos.",
  severity: 'error',
  check: (content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    if (/audit-disable\s+timers/i.test(content)) return false;
    const norm = normalizeFilePath(filePath);
    if (!norm.includes('src/logic/') && !norm.includes('src/components/')) return false;
    if (norm.includes('.spec.') || norm.includes('.test.') || norm.includes('gsaphelpers')) return false;
    return true;
  },
  fixable: false
};

export const zeroTimerBattleLogic = zeroTimerLogic;
export const zeroTimerCalculationLogic = zeroTimerLogic;

export const noPlaywrightWaitForTimeout: AuditRule = {
  regex: /\bpage\.waitForTimeout\s*\(/g,
  message: "Uso de 'page.waitForTimeout()' detectado. Está ESTRICTAMENTE PROHIBIDO usar esperas de tiempo arbitrarias en pruebas E2E. La sincronización debe ser orientada a eventos o selectores deterministas.",
  severity: 'error',
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const norm = normalizeFilePath(filePath);
    if (norm.includes('node_modules')) return false;
    if (norm.includes('tests/unit/')) return false;
    return norm.includes('scripts/e2e/') || norm.includes('tests/');
  },
  fixable: false
};

export const jsonStringifyInWatch: AuditRule = {
  regex: /\bwatch\s*\(\s*(?:\(\)\s*=>\s*)?JSON\.stringify/g,
  message: "Uso de 'JSON.stringify' dentro de un watcher detectado. Serializar objetos/arrays en watchers de alta frecuencia satura la CPU. Realiza comparaciones directas por elementos o usa watchers profundos ({ deep: true }) con moderación.",
  severity: 'error',
  fixable: false
};

export const intersectionObserverRoot: AuditRule = {
  regex: /new\s+IntersectionObserver\s*\(\s*[^,]+,\s*\{\s*[^}]*root\s*:\s*(?!null\b)[a-zA-Z0-9_$]/g,
  message: "Uso de 'root' dinámico o DOM en IntersectionObserver detectado. En contenedores escalados o con zoom (ej: #zoomable-content), usar un root distinto de null genera fallos de cálculo de visibilidad que apagan animaciones. Deja 'root' como 'null' (viewport) o no lo declares.",
  severity: 'warning',
  fixable: false
};

export const dbInTemplates: AuditRule = {
  regex: /\bsupabase\b/g,
  message: "Acceso directo a Supabase detectado dentro de un bloque <template>. Está PROHIBIDO consultar la base de datos en el render loop. Cachea los datos reactivamente con 'computed' o acciones de store en <script> y expón una estructura de datos lista para renderizar.",
  severity: 'error',
  fixable: false
};

export const functionCallsInTemplates: AuditRule = {
  regex: /(?::[a-z0-9-]+|v-bind:[a-z0-9-]+)="([a-zA-Z0-9_$]+)\([^"]*\)"|\{\{\s*([a-zA-Z0-9_$]+)\([^}]*\)\}/gi,
  message: (match: string) => `Llamada a función/método '${match}' detectada en plantilla Vue. Está PROHIBIDO llamar a funciones que realicen consultas a bases de datos, transformaciones de array (.map/.filter) o lógica pesada en el render loop. Cachea los datos con 'computed'.`,
  severity: 'error',
  check: (content: string, match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const funcName = match[1] || match[2];
    if (!funcName) return false;
    
    const safeFunctions = /^(t|i18n|translate|formatCurrency|formatNumber|class|style|typeof)$/i;
    if (safeFunctions.test(funcName)) return false;
    
    try {
      const scriptStart = content.indexOf('<script');
      const scriptEnd = content.indexOf('</script>');
      if (scriptStart === -1 || scriptEnd === -1) return false;
      const scriptContent = content.substring(scriptStart, scriptEnd);
      
      const funcDefRegex = new RegExp(`(?:const|let|var|function)\\s+${funcName}\\b[^;]*`, 'g');
      const defMatch = funcDefRegex.exec(scriptContent);
      if (!defMatch) return false;
      
      const defStart = defMatch.index;
      const defContext = scriptContent.substring(defStart, Math.min(scriptContent.length, defStart + 1000));
      
      const isHeavy = /\b(supabase|\.map\(|\.filter\(|\.reduce\()/i.test(defContext);
      return isHeavy;
    } catch (_e) {
      return false;
    }
  },
  fixable: false
};

export const zIndexAudit: AuditRule = {
  id: 'zIndexAudit',
  name: 'Z-Index Audit',
  category: 'Z-Index fuera de estándar',
  aliases: ['z-index', 'zindex', 'z_index'],
  // Matches both CSS `z-index: N` and JS inline-style `zIndex: N`
  regex: /(?:z-index|zIndex)\s*:\s*(-?\d+)\b/gi,
  message: (match: string) => {
    const numMatch = match.match(/-?\d+/);
    if (!numMatch || !numMatch[0]) return `Z-Index hardcodeado detectado: '${match}'. Usa 'var(--z-layer)'.`;
    const val = parseInt(numMatch[0]);
     // string-ok: Internal string formatting or DOM token identifier
    const entry = Z_VALUE_MAP[val];
    if (entry) {
      const key = entry.toLowerCase().replace(/_/g, '-'); // string-ok: Internal string formatting or DOM token identifier
      return `Z-Index hardcodeado detectado: '${match}'. Corresponde a Z_LAYERS.${entry}. Usa 'var(--z-${key})'.`;
    }

    let nearestKey = '';
    let minDiff = Z_LAYERS_DIFF_SENTINEL;
    for (const [key, zVal] of Z_SORTED_ENTRIES) {
      const diff = Math.abs(val - zVal);
      if (diff < minDiff) {
        minDiff = diff;
        nearestKey = key;
      }
    } // string-ok: Internal string formatting or DOM token identifier

    if (nearestKey) {
      const key = nearestKey.toLowerCase().replace(/_/g, '-'); // string-ok: Internal string formatting or DOM token identifier
      const offset = val - (Z_LAYERS[nearestKey as keyof typeof Z_LAYERS] ?? 0); // domain-ok: Open dynamic text or non-domain string payload
      const sign = offset >= 0 ? '+' : '-';
      return `Z-Index relativo detectado: '${match}'. Cerca de Z_LAYERS.${nearestKey}. Usa 'calc(var(--z-${key}) ${sign} ${Math.abs(offset)})'.`;
    }

    return `Z-Index hardcodeado fuera de estándar: '${match}'. Define una nueva capa en 'visuals.ts' o usa una existente.`;
  },
  severity: 'error',
  fix: (match: string) => {
    const valMatch = match.match(/-?\d+/);
    if (!valMatch) return match;
    const val = parseInt(valMatch[0]);

    const entry = Z_VALUE_MAP[val];
    const isJsProp = match.startsWith('zIndex'); // string-ok: Internal string formatting or DOM token identifier
    const propName = isJsProp ? 'zIndex' : 'z-index';
    if (entry) {
      const key = entry.toLowerCase().replace(/_/g, '-'); // string-ok: Internal string formatting or DOM token identifier
      const valStr = `var(--z-${key})`;
      return isJsProp ? `${propName}: '${valStr}'` : `${propName}: ${valStr}`;
    }

    let nearestKey = '';
    let minDiff = Z_LAYERS_DIFF_SENTINEL;
    for (const [key, zVal] of Z_SORTED_ENTRIES) {
      const diff = Math.abs(val - zVal);
      if (diff < minDiff) {
        minDiff = diff;
        nearestKey = key;
      }
    } // string-ok: Internal string formatting or DOM token identifier

    if (nearestKey) {
      const key = nearestKey.toLowerCase().replace(/_/g, '-'); // string-ok: Internal string formatting or DOM token identifier
      const offset = val - (Z_LAYERS[nearestKey as keyof typeof Z_LAYERS] ?? 0); // domain-ok: Open dynamic text or non-domain string payload
      const sign = offset >= 0 ? '+' : '-';
      const valStr = `calc(var(--z-${key}) ${sign} ${Math.abs(offset)})`;
      return isJsProp ? `${propName}: '${valStr}'` : `${propName}: ${valStr}`;
    }

    return match;
  },
  fixable: true
};

export const zIndexConstantDeclaration: AuditRule = {
  regex: /const\s+([A-Z0-9_]*Z_INDEX[A-Z0-9_]*)\s*=\s*(?:'[^']+'|"[^"]+"|\d+)/gi,
  message: (match: string) => `Declaración de constante de Z-Index aislada detectada: '${match}'. Está PROHIBIDO declarar constantes de Z-Index fuera de 'src/logic/constants/visuals.ts' (Z_LAYERS). Registra la capa en Z_LAYERS o consume 'Z_LAYERS.<CAPA>'.`,
  severity: 'error',
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const norm = normalizeFilePath(filePath);
    return !norm.includes('src/logic/constants/visuals.ts') && !norm.includes('node_modules');
  },
  fixable: false
};

export const forbiddenFallbacks: AuditRule = {
  regex: /\b\w*Provider\.\w+\([^)]*\)\s*(?:\|\||\?\?)|\b([a-zA-Z0-9_$]+)\.(?:[a-zA-Z0-9_]*[iI]d|id|name)\s*(?:\|\||\?\?)\s*\1\.(?:name|description|title|id)\b|\b(?:\w+\??\.)*\w*[uU]id\s*(?:\|\||\?\?)\s*(?:\w+\??\.)*\w*[uU]id\b|\.catch\(\s*(?:\([^)]*\)|[a-zA-Z0-9_$]+)?\s*=>\s*(?:true|false|null|undefined|\{\}|""|''|\[\])\s*\)/g,
  message: (match: string) => `Patrón de fallback silencioso o búsqueda prohibida detectado: '${match}'. En (/domain-type-first Zero-Fallback Mandate), está ESTRICTAMENTE PROHIBIDO encadenar fallbacks en IDs de dominio, usar descripciones como fallback de ID, o silenciar promesas con .catch(() => false/null/{}/void). Se debe fallar ruidosamente con throw new Error().`,
  severity: 'error',
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const norm = normalizeFilePath(filePath);
    if (norm.includes('node_modules') || norm.includes('external')) return false;
    const isTestOrMock = norm.includes('.spec.') || norm.includes('.test.') || norm.includes('tests/fixtures');
    if (isTestOrMock) return false;
    return norm.includes('src/') || norm.includes('scripts/e2e/');
  },
  fixable: false
};

export const doxIndexIntegrity: AuditRule = {
  id: 'doxIndexIntegrity',
  name: 'DOX Tag & Section Integrity',
  category: 'DOX / AGENTS.md',
  aliases: ['dox', 'agents', 'agents.md', 'documentation', 'dox-integrity', 'doxindexintegrity'],
  regex: /^# Purpose/gm,
  message: 'Inconsistencia en jerarquía de documentación DOX Index (AGENTS.md)',
  severity: 'error',
  check: (content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath || !filePath.endsWith('AGENTS.md')) return false;

    // 1. Verify presence of Child DOX Index section
    if (!content.includes('## Child DOX Index')) {
      return true; // Missing mandatory DOX Index header
    }

    const dir = path.dirname(filePath);

    // 2. Extract and validate linked entries strictly inside Child DOX Index section
    const childIndexPos = content.indexOf('## Child DOX Index');
    const childSectionContent = childIndexPos !== -1 ? content.slice(childIndexPos) : '';

    const linkRegex = /-\s*\[([^\]]+)\]\(([^)]+)\)/g;
    let linkMatch;
    const indexedSubdirs = new Set<string>();

    while ((linkMatch = linkRegex.exec(childSectionContent)) !== null) {
      const linkPath = linkMatch[2];
      if (!linkPath || linkPath.startsWith('http') || linkPath.startsWith('#')) continue;
      if (linkPath.includes('(gitignored')) continue;

      const cleanPath = linkPath.split('#')[0]!;
      const resolved = path.resolve(dir, cleanPath);

      // STRICT MANDATE: Entry MUST be an AGENTS.md file or a directory containing an AGENTS.md file
      try {
        const stat = statSync(resolved);
        if (stat.isDirectory()) {
          const targetAgents = path.join(resolved, 'AGENTS.md');
          if (!existsSync(targetAgents)) {
            return true; // Directory in Child DOX Index lacks an AGENTS.md file
          }
          indexedSubdirs.add(path.basename(resolved));
        } else if (cleanPath.endsWith('AGENTS.md')) {
          indexedSubdirs.add(path.basename(path.dirname(resolved)));
        } else {
          return true; // Only AGENTS.md files or directories containing AGENTS.md allowed
        }
      } catch (_e) {
        return true; // Broken link
      }
    }

    // 3. Verify that all child subdirectories containing an AGENTS.md are indexed by parent
    try {
      const dirEntries = readdirSync(dir, { withFileTypes: true });
      for (const entry of dirEntries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const childAgentsPath = path.join(dir, entry.name, 'AGENTS.md');
        if (existsSync(childAgentsPath)) {
          if (!indexedSubdirs.has(entry.name)) {
            return true; // Parent AGENTS.md omitted child AGENTS.md in its Child DOX Index
          }
        }
      }
    } catch (err) {
      void err;
    }

    return false;
  },
  fixable: false
};

export const forbiddenTypeCasts: AuditRule = {
  regex: /\bas\s+unknown\s+as\b|\bas\s+any\s+as\b/g,
  message: (match: string) => `Casteo arbitrario prohibido detectado: '${match}'. Viola las directivas de integridad de tipos (@/domain-type-first y Regla 7 de AGENTS.md). Define e importa la interfaz o unión de tipos explícita.`,
  severity: 'error',
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const norm = normalizeFilePath(filePath);
    if (norm.includes('node_modules')) return false;
    if (isTestPath(filePath)) return false;
    const codeRoots = getAuditConfig()?.paths?.codeRoots ?? ['src', 'scripts'];
    const isInCodeRoots = codeRoots.some(root => norm.includes(root.replace(/^\/+|\/+$/g, '')));
    if (!isInCodeRoots) return false;
    return true;
  },
  fixable: false
};



/** Standard numeric identity values and HTTP status codes exempt from magic number audit */
export const EXEMPT_AUDIT_NUMERIC_LITERALS: ReadonlySet<number> = new Set([0, 1, 100, 200, 404, 500]); // runtime-set: Fast O(1) membership lookup set

export const magicNumbers: AuditRule = {
  regex: /([^A-Z0-9_\w#$])(\d{2,})(\b)/g,
  message: (match: string) => `Número mágico inline detectado: '${match.trim()}'. Viola el Absolute Prohibition on Magic Numbers (Named Constants Mandate). Declara la constante nominada descriptiva (readonly / as const) o impórtala desde un módulo de constantes.`,
  severity: 'error',
  check: (content: string, match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const norm = normalizeFilePath(filePath);
    
    // STRICT SCOPE: Only audit files in configured code roots
    const codeRoots = getAuditConfig()?.paths?.codeRoots ?? ['src', 'scripts'];
    const isInCodeRoots = codeRoots.some(root => norm.includes(root.replace(/^\/+|\/+$/g, '')));
    if (!isInCodeRoots) return false;

    // Ignore tests, configured ignored paths, data catalogs, constants modules, config files, and styles
    if (
      isTestPath(filePath) ||
      isPathIgnored(filePath) ||
      isDataPath(filePath) ||
      isConstantsPath(filePath) ||
      norm.endsWith('config.ts') ||
      norm.endsWith('.scss') || norm.endsWith('.css')
    ) {
      return false;
    }

    const lineStartPos = content.lastIndexOf('\n', match.index - 1) + 1;
    const lineEndPos = content.indexOf('\n', match.index);
    const line = lineEndPos === -1 ? content.slice(lineStartPos) : content.slice(lineStartPos, lineEndPos);
    const trimmed = line.trim();

    // Ignore actual comment lines or numbers located after // in an inline comment
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
    const inlineCommentIdx = line.indexOf('//');
    if (inlineCommentIdx !== -1 && (match.index - lineStartPos) > inlineCommentIdx) return false;

    // Ignore numbers inside string literals (single, double, or template quotes).
    // Count quotes in the line UP TO AND INCLUDING the match character to detect if we're inside a string.
    const lineIncludingMatch = content.substring(lineStartPos, match.index + 1); // +1 to include match char
    const singleQuotes = (lineIncludingMatch.match(/(?<!\\)'/g) || []).length;
    const doubleQuotes = (lineIncludingMatch.match(/(?<!\\)"/g) || []).length;
    const lineBackticks = (lineIncludingMatch.match(/(?<!\\)`/g) || []).length;
    if (singleQuotes % 2 === 1 || doubleQuotes % 2 === 1 || lineBackticks % 2 === 1) return false;

    // Check if inside a multiline template literal
    const contentBefore = content.substring(0, match.index);
    const totalBackticks = (contentBefore.match(/(?<!\\)`/g) || []).length;
    if (totalBackticks % 2 === 1) {
      const lastBacktickPos = contentBefore.lastIndexOf('`');
      const textSinceBacktick = contentBefore.substring(lastBacktickPos);
      const openInterpolations = (textSinceBacktick.match(/\$\{/g) || []).length;
      const closeInterpolations = (textSinceBacktick.match(/\}/g) || []).length;
      if (openInterpolations <= closeInterpolations) {
        return false; // Literal string inside multiline template literal
      }
    }

    // Ignore declarations and imports where constants/types/enums are being defined
    if (trimmed.includes('const ') || trimmed.includes('readonly ') || trimmed.includes('import ') || trimmed.includes('enum ') || trimmed.includes('type ') || trimmed.includes('interface ')) return false;
    // Ignore property definitions alone on a line inside const objects (e.g. `FOG_MAX: 0.85,`)
    if (/^\w[\w]*\s*:\s*-?[\d.]+[,]?\s*$/.test(trimmed)) return false;

    // Ignore regex literal escape sequences (e.g. `\(16\)` inside /.../g patterns)
    if (match.index > 0 && content[match.index - 1] === '\\') return false;

    // Ignore standard decimal radix 10 in parseInt(..., 10)
    if (match[2] === '10' && /\bparseInt\s*\([^,]+,\s*10\s*\)/.test(line)) return false;

    // Ignore numbers inside a const data-literal block using bracket-balance.
    // Walk backward from the match to find the last `const` declaration and check
    // whether there are more open brackets {/[ than close }/] since that point.
    const contentUpToMatch = content.substring(0, match.index);
    const lastConstPos = Math.max(
      contentUpToMatch.lastIndexOf('\nconst '),
      contentUpToMatch.lastIndexOf('\n  const '),
      contentUpToMatch.lastIndexOf('\n    const '),
    );
    if (lastConstPos !== -1) {
      const fromLastConst = contentUpToMatch.substring(lastConstPos);
      const openCount = (fromLastConst.split('{').length - 1) + (fromLastConst.split('[').length - 1);
      const closeCount = (fromLastConst.split('}').length - 1) + (fromLastConst.split(']').length - 1);
      if (openCount > closeCount) return false;
    }

    // Ignore CSS colors, properties, SVG paths, SQL definitions, hex literals, URLs, and <style> block contents
    if (/rgba?\s*\(|hsl\s*\(|#[0-9a-fA-F]{3,8}\b|0x[0-9a-fA-F]+/i.test(line)) return false;
    if (/<svg|<path|<rect|<circle|<g\b|viewBox=|d=["']M/i.test(line)) return false;
    if (/\b(?:VARCHAR|CHAR|INT|TIMESTAMP|DECIMAL)\s*\(\s*\d+/i.test(line)) return false;
    if (/https?:\/\/|localhost|127\.0\.0\.1|utf-8/i.test(line)) return false;

    // Check if line is inside a <style> block in .vue files
    if (filePath.endsWith('.vue')) {
      const styleOpenIndex = content.lastIndexOf('<style', match.index);
      const styleCloseIndex = content.lastIndexOf('</style>', match.index);
      if (styleOpenIndex !== -1 && styleOpenIndex > styleCloseIndex) {
        return false; // Inside <style> section of Vue component
      }
    }

    const num = parseInt(match[2] || '', 10);
    if (isNaN(num) || EXEMPT_AUDIT_NUMERIC_LITERALS.has(num)) return false;

    return true;
  },
  fixable: false
};

export const badConstantNames: AuditRule = {
  regex: /^\s*(?:export\s+)?const\s+([A-Z0-9_]+?_\d+)\b/gm,
  message: (match: string) => `Nombre de constante antipatrón detectado en declaración: '${match.trim()}'. Está PROHIBIDO incluir el valor numérico en el nombre de la constante (ej: usa ARCHAEOLOGY_CAVE_BASE_WEIGHT en lugar de ARCHAEOLOGY_CAVE_BASE_WEIGHT_10). Describe el propósito semántico o la intención de dominio.`,
  severity: 'error',
  check: (_content: string, match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const norm = normalizeFilePath(filePath);
    if (norm.includes('node_modules') || norm.includes('.spec.') || norm.includes('.test.')) return false;
    const constName = match[1] || '';
    if (/(?:GEN_\d|ISO_\d|UTF_8|BASE_64|RGB_|RGBA_|WASM_|HTML_5|CSS_3|HTTP_\d|D3_|GEN1_|GEN2_|GEN3_|GEN4_|GEN5_|GEN6_|GEN7_|GEN8_|GEN9_)/i.test(constName)) return false;
    return true;
  },
  fixable: false
};

function checkTypeScriptRuleMatch(content: string, match: RegExpExecArray, filePath?: string, extraBypasses: string[] = []): boolean {
  if (!filePath) return false;
  const norm = normalizeFilePath(filePath);
  const codeRoots = getAuditConfig()?.paths?.codeRoots ?? ['src', 'scripts'];
  const isInCodeRoots = codeRoots.some(root => norm.includes(root.replace(/^\/+|\/+$/g, '')));
  if (!isInCodeRoots) return false;

  const lineStartPos = content.lastIndexOf('\n', match.index - 1) + 1;
  const lineEndPos = content.indexOf('\n', match.index);
  const line = lineEndPos === -1 ? content.slice(lineStartPos) : content.slice(lineStartPos, lineEndPos);
  const trimmed = line.trim();

  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
  if (line.includes('// domain-ok: Open dynamic text or non-domain string payload') || line.includes('// no-domain: Non-domain utility collection or data structure') || extraBypasses.some(b => line.includes(b))) return false;

  return true;
}

export const noLiteralBooleanType: AuditRule = {
  regex: /\b(?:(?:export\s+)?const|let|var)\s+[A-Z_a-z]\w*\s*:\s*(?:true|false)\b|\b(?:export\s+)?type\s+[A-Z_a-z]\w*\s*=\s*(?:true|false)\s*;|^\s*(?:readonly\s+)?[A-Z_a-z]\w*\??:\s*(?:true|false)\s*;|\(\s*[A-Z_a-z]\w*\??:\s*(?:true|false)\b/gm,
  message: (match: string) => `Tipo de dato booleano literal detectado: '${match.trim()}'. Queda prohibido declarar tipos de datos con literales booleanos (: true / : false) en lugar del tipo de dato canónico 'boolean'. Usa ': boolean'.`,
  severity: 'error',
  check: (content: string, match: RegExpExecArray, filePath?: string) => checkTypeScriptRuleMatch(content, match, filePath, ['// boolean-ok: Explicit boolean flag annotation']),
  fixable: true,
  fix: (content: string) => content.replace(/:\s*(?:true|false)\b/g, ': boolean')
};

export const noInlineAnonymousObjectType: AuditRule = {
  regex: /\(\s*(?:[A-Z_a-z]\w*\s*,\s*)*[A-Z_a-z]\w*\??\s*:\s*\{\s*(?:readonly\s+)?[A-Z_a-z]\w*\??\s*:\s*(?:string|number|boolean|unknown|any|[A-Z]\w*)(?:\[\])?\s*(?:;|,)\s*(?:readonly\s+)?[A-Z_a-z]\w*\??\s*:[^\n}]*\}\s*[,)]/g,
  message: (match: string) => `Tipo de objeto anónimo inline detectado en parámetro: '${match.trim()}'. Está PROHIBIDO usar estructuras de objeto anónimas inline en firmas de función (estilo Java). Define e importa una interface o tipo nombrado (ej. UserPayload).`,
  severity: 'error',
  check: (content: string, match: RegExpExecArray, filePath?: string) => checkTypeScriptRuleMatch(content, match, filePath, ['// type-ok: Type contract declaration', 'withDefaults']),
  fixable: false
};

export const noFloatingPromises: AuditRule = {
  regex: /^\s*(?!(?:await|void|return|const|let|var)\s+)(?:[A-Z_a-z]\w*\.)?[a-z]\w*Async\s*\([^)]*\)\s*;/gm,
  message: (match: string) => `Promesa flotante detectada: '${match.trim()}'. Toda llamada a función asíncrona debe ser manejada explícitamente con await, void o .catch().`,
  severity: 'error',
  check: (content: string, match: RegExpExecArray, filePath?: string) => checkTypeScriptRuleMatch(content, match, filePath, ['// promise-ok: Background promise handler']),
  fixable: true,
  fix: (content: string) => content.replace(/^\s*([a-z]\w*Async\s*\([^)]*\)\s*;)/gm, 'void $1')
};

export const noLeakedGlobalState: AuditRule = {
  regex: /^(?:export\s+)?let\s+[a-z]\w*\s*=/gm,
  message: (match: string) => `Variable mutable global detectada a nivel de módulo: '${match.trim()}'. Encapsula el estado dentro de un Pinia store, clase o marca // singleton-ok: Singleton instance state container.`,
  severity: 'error',
  check: (content: string, match: RegExpExecArray, filePath?: string) => checkTypeScriptRuleMatch(content, match, filePath, ['// singleton-ok:']),
  fixable: false
};

export const missingInteractiveId: AuditRule = {
  regex: /<([a-zA-Z0-9_-]+)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gis,
  message: (match: string) => `Elemento interactivo de UI sin atributo ID detectado: '${match.replace(/\s+/g, ' ').slice(0, 90)}...'. Todo elemento interactivo (button, input, select, textarea o elementos con eventos @click/@change/@submit) en templates Vue DEBE poseer un atributo 'id' o ':id' explícito para garantizar testabilidad y accesibilidad Playwright.`,
  severity: 'error',
  check: (content: string, match: RegExpExecArray, filePath?: string) => {
    if (!filePath || !filePath.endsWith('.vue')) return false;
    const norm = normalizeFilePath(filePath);
    if (norm.includes('node_modules')) return false;

    // Check if inside <template> block
    const templateOpenIndex = content.lastIndexOf('<template', match.index);
    const templateCloseIndex = content.lastIndexOf('</template>', match.index);
    if (templateOpenIndex === -1) return false;
    if (templateCloseIndex !== -1 && templateOpenIndex < templateCloseIndex) return false;

    const tagStr = match[0];
    const tagName = (match[1] || '').toLowerCase();

    // Is it an inherently interactive tag?
    const isInteractiveTag = ['button', 'input', 'select', 'textarea'].includes(tagName); // no-domain: Non-domain utility collection or data structure

    // Does it have interactive event bindings?
    const hasInteractiveEvent = /@(?:click|change|submit|input|keydown\.enter)\b|v-on:(?:click|change|submit|input)/i.test(tagStr);

    if (!isInteractiveTag && !hasInteractiveEvent) {
      return false;
    }

    // Exempt hidden inputs
    if (tagName === 'input' && /type\s*=\s*["']hidden["']/i.test(tagStr)) {
      return false;
    }

    // Check for id or :id or v-bind:id
    if (/\b(?:id|:id|v-bind:id)\s*=/i.test(tagStr)) {
      return false;
    }

    // Check for escape hatch
    if (/id-ok/i.test(tagStr)) {
      return false;
    }

    return true;
  },
  fixable: false
};

export const sassTraps: AuditRule = {
  regex: /(?<![.$])\b(scale|grayscale|invert|opacity|brightness|blur|rotate|translate|saturate|drop-shadow|translatex|translatey|translatez|skewx|skewy|matrix|rgba|rgb)\s*\(/g,
  message: (match: string) => `Función SASS/CSS propensa a colisión detectada en minúscula: '${match}'. ERROR: Para prevenir errores y advertencias de deprecación en Dart Sass, capitaliza la función manualmente (ej: Grayscale, Rgba, Scale).`,
  severity: 'error',
  fixable: false,
  check: (content: string, match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return true;
    const norm = normalizeFilePath(filePath);
    if (!norm.endsWith('.scss') && !norm.endsWith('.css') && !norm.endsWith('.vue')) return false;
    const matchIndex = match.index ?? 0;
    if (matchIndex > 0) {
      const prevChar = content[matchIndex - 1];
      if (prevChar === '.' || prevChar === '$') return false;
    }
    return true;
  }
};

const BASE_INFRA_AND_UUID_IDENTIFIERS: ReadonlySet<string> = new Set<string>([ // runtime-set: Fast O(1) membership lookup set
  'userId', 'user_id', 'clientId', 'client_id', 'profileId', 'profile_id', 'accountId', 'account_id',
  'sessionId', 'session_id', 'socketId', 'socket_id',
  'notificationId', 'notification_id', 'taskId', 'task_id', 'jobId', 'job_id',
  'conversationId', 'conversation_id', 'terminalId', 'terminal_id',
  'messageId', 'message_id', 'authId', 'auth_id',
  'elementId', 'modalId', 'tabId', 'domId', 'htmlId', 'uid', 'toastId',
  'targetUid', 'cardId', 'slotId',
  'sourceId', 'source_id', 'targetId', 'rawId', 'expectedId', 'expected_id',
  'eventId', 'event_id', 'categoryId', 'category_id', 'categoryIdOrUid', 'maybeUid',
  'serverId', 'server_id', 'selectedServerId', 'selected_server_id', 'assetId', 'asset_id'
]);

function getEffectiveInfraIdentifiers(): ReadonlySet<string> {
  const config = getAuditConfig();
  const configured = config.domain.infraIdWhitelist ?? [];
  return new Set([...BASE_INFRA_AND_UUID_IDENTIFIERS, ...configured]);
}

export const strictDomainParamTypes: AuditRule = {
  id: 'strictDomainParamTypes',
  name: 'Strict Domain Param Types',
  regex: /\b([A-Za-z0-9_]{2,}[iI]d)\s*\??:\s*(?:string\b(?!\s*\[\])|(?:[A-Z]\w*Id|[A-Z]\w*)\s*\|\s*string\b)/g,
  message: (match: string) => match.includes('|')
    ? `[TUTORIAL DOMAIN-TYPE-FIRST] Parámetro o propiedad '${match}' combina un tipo de dominio con '| string'.
   📚 REGLA: (/domain-type-first) está ESTRICTAMENTE PROHIBIDO combinar uniones finitas con '| string'.
   💡 SOLUCIÓN: Usa exclusivamente la unión canónica pura.`
    : `[TUTORIAL DOMAIN-TYPE-FIRST] Parámetro o propiedad '${match}' tipado con 'string' plano.
   📚 REGLA: Los IDs de dominio de catálogo DEBEN ser tipados con su unión canónica de dominio.
   💡 INSTANCIAS vs CATÁLOGO:
      - Si representa una instancia dinámica / UUID (ej. ID generado), nómbralo como '*Uid' (ej. 'targetUid', 'instanceUid') para ser reconocido automáticamente.
      - Si es un UUID o identificador de infraestructura externo no estándar (DOM, WebSocket), debe justificarse explícitamente mediante '// uuid-ok: <motivo técnico>' o '// infra-id-ok: <motivo técnico>'.`,
  severity: 'error',
  check: (content: string, match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const norm = normalizeFilePath(filePath);
    if (norm.includes('audit_rules.ts') || norm.includes('.test.') || norm.includes('.spec.') || norm.includes('tests/')) return false;
    if (norm.endsWith('database.ts') || norm.endsWith('database.types.ts')) return false;
    if (!norm.includes('src/')) return false;

    const idParamName = match[1];
    if (!idParamName) return false;

    // Wildcard unions with | string are NEVER allowed to be bypassed
    if (match[0].includes('|')) {
      return true;
    }

    // Check for genuine instance UIDs (e.g. invoiceUid, readingUid, calculationUid, targetUid, uid)
    // Distinguishes genuine UIDs from domain IDs ending in 'u' + 'Id' (like 'australopithecuId')
    const GENUINE_UID_PATTERN = /^_{0,2}(?:uid|UID|[a-zA-Z0-9_]+(?:Uid|UID|_uid|_UID)|[a-zA-Z0-9_]+[uU]idOr[a-zA-Z0-9_]+|[a-zA-Z0-9_]+OrUid)$/;
    if (GENUINE_UID_PATTERN.test(idParamName)) {
      return false;
    }

    const infraIds = getEffectiveInfraIdentifiers();
    // Check if it is in the standard infrastructure whitelist
    if (infraIds.has(idParamName)) {
      return false;
    }

    // Check if it is a SQL RPC parameter prefixed with p_ matching standard infra whitelist
    if (idParamName.startsWith('p_') && infraIds.has(idParamName.slice(2))) {
      return false;
    }

    const matchIndex = match.index ?? 0;
    const lineStart = content.lastIndexOf('\n', matchIndex) + 1;
    const lineEnd = content.indexOf('\n', matchIndex);
    const line = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

    // Require specific detailed ignore comments with reason: "// uuid-ok: <reason>", "// infra-id-ok: <reason>", or "// domain-ok: <reason>"
    const justifiedIgnoreRegex = /\/\/\s*(?:uuid-ok|infra-id-ok|domain-ok):\s*\S+/i;
    if (justifiedIgnoreRegex.test(line)) {
      return false;
    }

    return true;
  },
  fixable: false
};

export const noInlineTypeImports: AuditRule = {
  id: 'noInlineTypeImports',
  name: 'No Inline Type Imports',
  regex: /:\s*import\(['"][^'"]+['"]\)\.[A-Za-z0-9_]+/g,
  message: (match: string) => `[TUTORIAL CLEAN IMPORTS] Uso de import de tipo inline '${match}'.
   📚 REGLA: Se prohíbe importar tipos inline en parámetros o propiedades dentro del código fuente (.ts/.vue).
   💡 SOLUCIÓN: Agrega 'import type { ... } from '...'' explícitamente en la cabecera del archivo y usa el nombre del tipo directamente en la firma para mantener legible el código y claro el árbol de dependencias. (Solo archivos ambientales .d.ts están exentos).`,
  severity: 'error',
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const norm = normalizeFilePath(filePath);
    if (!norm.includes('src/')) return false;
    if (norm.endsWith('.d.ts')) return false; // Allowed in ambient .d.ts declaration files
    if (norm.includes('.test.') || norm.includes('.spec.') || norm.includes('tests/')) return false;
    return true;
  },
  fixable: false
};

export const noInlineLiteralUnions: AuditRule = {
  id: 'noInlineLiteralUnions',
  name: 'No Inline Literal Unions',
  regex: /:\s*(?:'[^']+'|"[^"]+")(?:\s*\|\s*(?:'[^']+'|"[^"]+")){2,}/g,
  message: (match: string) => `[TUTORIAL DOMAIN-TYPE-FIRST] Unión literal de strings inline detectada: '${match.slice(1).trim()}'.
   📚 REGLA: (/domain-type-first) está PROHIBIDO declarar uniones de literales inline ad-hoc dispersas en componentes o funciones.
   💡 SOLUCIÓN: Centraliza el catálogo en 'src/types/' mediante un array 'as const' y deriva el tipo canónico con '(typeof ARRAY)[number]' (ej. 'export const FOOS = [...] as const; export type Foo = (typeof FOOS)[number];').`,
  severity: 'error',
  check: (content: string, match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const norm = normalizeFilePath(filePath);
    if (!norm.includes('src/')) return false;
    if (norm.includes('/types/')) return false; // Allowed in canonical type definitions under src/types/
    if (norm.includes('.test.') || norm.includes('.spec.') || norm.includes('tests/')) return false;

    const matchIndex = match.index ?? 0;
    const lineStartIndex = content.lastIndexOf('\n', matchIndex) + 1;
    const lineEndIndex = content.indexOf('\n', matchIndex);
    const line = content.slice(lineStartIndex, lineEndIndex === -1 ? undefined : lineEndIndex);

    // Escape hatch check
    if (/\/\/\s*(?:domain-ok|type-ok|string-ok):\s*\S+/i.test(line)) {
      return false;
    }

    return true;
  },
  fixable: false
};

export const noImportantOnTransforms: AuditRule = {
  id: 'noImportantOnTransforms',
  name: 'No !important on CSS Transforms',
  category: 'Animaciones GSAP',
  regex: /(?<![\w-])transform\s*:[^;]*!important/gi,
  message: (match: string) => `Uso de '!important' en 'transform' detectado: '${match}'. El uso de !important en transform congela e invalida las mutaciones de GSAP en tiempo de ejecución.`,
  severity: 'error',
  fixable: false,
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return true;
    const norm = normalizeFilePath(filePath);
    return norm.endsWith('.scss') || norm.endsWith('.css') || norm.endsWith('.vue');
  }
};

export const noImportantOnFilters: AuditRule = {
  id: 'noImportantOnFilters',
  name: 'No !important on CSS Filters',
  category: 'Animaciones GSAP',
  regex: /(?<![\w-])filter\s*:[^;]*!important/gi,
  message: (match: string) => `Uso de '!important' en 'filter' detectado: '${match}'. El uso de !important en filter congela e invalida las animaciones de efectos GSAP.`,
  severity: 'error',
  fixable: false,
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return true;
    const norm = normalizeFilePath(filePath);
    return norm.endsWith('.scss') || norm.endsWith('.css') || norm.endsWith('.vue');
  }
};

export const noRawJsonImportsOutsideData: AuditRule = {
  id: 'noRawJsonImportsOutsideData',
  name: 'No Raw JSON Import Outside Data Layer',
  category: 'Optimización de Bundle',
  regex: /\bimport\s+[^;]+\s+from\s+['"][^'"]+\.json['"]/g,
  message: (match: string) => `Importación estática de JSON fuera de src/data/ o scripts/: '${match}'. Centraliza catálogos en src/data/ o usa importación dinámica para prevenir empaquetado redundante.`,
  severity: 'error',
  fixable: false,
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return true;
    const norm = normalizeFilePath(filePath);
    const codeRoots = getAuditConfig()?.paths?.codeRoots ?? ['src', 'scripts'];
    const isExcluded = norm.startsWith('src/data/') || norm.startsWith('scripts/') || norm.startsWith('tests/') || codeRoots.some(r => r !== 'src' && norm.startsWith(r + '/'));
    return !isExcluded;
  }
};

export const noSassAtImport: AuditRule = {
  id: 'noSassAtImport',
  name: 'No SASS @import Deprecated Directive',
  category: 'SASS Migrator',
  regex: /@import\s+['"][^'"]+['"]/g,
  message: (match: string) => `Regla obsoleta '@import' detectada en Sass: '${match}'. Dart Sass requiere migrar a '@use' o '@forward'.`,
  severity: 'error',
  fixable: false,
  check: (content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return true;
    const norm = normalizeFilePath(filePath);
    return norm.endsWith('.scss') || norm.endsWith('.css') || (norm.endsWith('.vue') && content.includes('lang="scss"'));
  }
};

export const overscrollBehaviorLock: AuditRule = {
  id: 'overscrollBehaviorLock',
  name: 'Global Overscroll Behavior Lock',
  category: 'Overscroll Navigation Lock',
  regex: /html\s*,\s*body\s*\{/g,
  message: `Mandato de bloqueo de sobre-desplazamiento violado: '_base.scss' debe declarar 'overscroll-behavior: none !important;' para prevenir pull-to-refresh y navegación gestual accidental en navegadores móviles.`,
  severity: 'error',
  fixable: false,
  check: (content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const config = getAuditConfig();
    if (config.styles?.zLayersEnabled === false) return false;
    const norm = normalizeFilePath(filePath);
    const configuredScss = config.styles?.zLayersScssFile ? normalizeFilePath(config.styles.zLayersScssFile) : null;
    if (configuredScss) {
      if (!norm.endsWith(configuredScss)) return false;
    } else {
      if (!norm.endsWith('src/styles/core/_base.scss') && !norm.endsWith('src/styles/_base.scss')) return false;
    }
    return !content.includes('overscroll-behavior: none !important;');
  }
};

export const noLayoutAnimationInGsap: AuditRule = {
  id: 'noLayoutAnimationInGsap',
  name: 'No Layout Animation In GSAP',
  category: 'Rendimiento GPU (GSAP)',
  aliases: ['gsap-layout', 'nolayoutanimationingsap', 'layout-animation', 'perf-gsap'],
  regex: /\b(?:gsap|timeline|weatherTimeline|tl)\s*\.\s*(?:to|from|fromTo)\s*\(/g,
  message: (match: string) => `[TUTORIAL GPU OPTIMIZATION] Se detectó animación de propiedades CSS de layout/repintado CPU en llamada a GSAP: '${match}'.
   📚 REGLA: (gpu_optimization_manual.md) está PROHIBIDO animar propiedades de layout o backgroundPosition ('backgroundPosition', 'backgroundPositionX', 'backgroundPositionY') en GSAP porque colapsan el fill-rate forzando reflows y repintados continuos a 60 FPS.
   💡 SOLUCIÓN: Usa propiedades aceleradas por GPU ('x', 'y', 'scale', 'scaleX', 'scaleY', 'rotation', 'opacity', 'transform'). Para fondos continuos, usa translate3d modular con 'gsap.utils.unitize'.`,
  severity: 'error',
  check: (content: string, match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const norm = normalizeFilePath(filePath);
    if (!norm.includes('src/') || norm.includes('ui-demo/')) return false;
    if (norm.includes('.test.') || norm.includes('.spec.') || norm.includes('tests/')) return false;

    // Look ahead within the GSAP call (up to 400 chars) for tween config object
    const startIdx = match.index ?? 0;
    const chunk = content.slice(startIdx, startIdx + 400);
    const layoutPropRegex = /\b(backgroundPosition|backgroundPositionX|backgroundPositionY)\s*:/;
    const found = layoutPropRegex.exec(chunk);
    if (!found) return false;

    // Verify it's within the GSAP call parentheses
    const closeParen = chunk.indexOf(')');
    if (closeParen !== -1 && found.index > closeParen) {
      return false;
    }

    // Check for justified ignore comment on the current or preceding line
    const beforeChunk = content.slice(Math.max(0, startIdx - 200), startIdx);
    const lineEnd = content.indexOf('\n', startIdx);
    const currentLine = content.slice(startIdx, lineEnd === -1 ? undefined : lineEnd);
    const nearby = beforeChunk + '\n' + currentLine;
    if (/\/\/\s*(?:layout-ok|shimmer-ok|gpu-ok):\s*\S+/i.test(nearby)) {
      return false;
    }

    return true;
  },
  fixable: false
};

export const namedTimerConstants: AuditRule = {
  id: 'namedTimerConstants',
  name: 'Named GSAP Delay Constants',
  category: 'Retardos GSAP sin constante nombrada',
  aliases: ['timer-constants', 'named-timer-constants', 'timer_constants', 'delayedcall-magic', 'gsap-delay-constants'],
  regex: /\b(?:gsap\.)?delayedCall\s*\(\s*([0-9]+(?:\.[0-9]+)?)\s*,|\bgsapSleep\s*\(\s*([0-9]+(?:\.[0-9]+)?)\s*\)/g,
  message: (match: string) => `Número mágico detectado en retardo de animación GSAP: '${match.trim()}'. Define y usa una constante semántica con sufijo '_SEC' (segundos), ej. 'ANIMATION_DELAY_SEC'. Recuerda que en src/ los timers nativos (setTimeout/setInterval) están TERMINANTEMENTE PROHIBIDOS (regla manualTimersFrontend) y debe usarse ÚNICAMENTE GSAP.`,
  severity: 'error',
  check: (content: string, match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const norm = normalizeFilePath(filePath);
    if (!norm.includes('src/') && !norm.includes('scripts/')) return false;
    if (norm.includes('.spec.') || norm.includes('.test.') || norm.includes('node_modules')) return false;

    // Permitir 0 (deferral / microtask idiomático)
    const valStr = match[1] || match[2];
    if (!valStr || parseFloat(valStr) === 0) return false;

    // Check for suppression on the line
    const matchIndex = match.index ?? 0;
    const lineStart = content.lastIndexOf('\n', matchIndex) + 1;
    const lineEnd = content.indexOf('\n', matchIndex);
    const line = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    if (/\/\/\s*(?:timer-ok|delay-ok):\s*\S+/i.test(line)) return false;

    return true;
  },
  fixable: false
};

export const auditRulesConfig = {
  viewport, gpuGaps, legacyDates, hardcodedTimezone, nodePrefix, esmExtensions, tsIgnore, timersPromises, explicitResource, zIndexAudit, zIndexConstantDeclaration, manualAnimations, emptyVueTransitions, manualTimersFrontend, zeroTimerLogic, zeroTimerBattleLogic, zeroTimerCalculationLogic, noPlaywrightWaitForTimeout, jsonStringifyInWatch, intersectionObserverRoot, dbInTemplates, functionCallsInTemplates, forbiddenFallbacks, forbiddenTypeCasts, doxIndexIntegrity, noDomainIdFallbacks, strictDomainParamTypes, noInlineTypeImports, noInlineLiteralUnions, magicNumbers, badConstantNames, noAliasConstants, noLiteralSuffixInConstantName, noLiteralBooleanType, noInlineAnonymousObjectType, noFloatingPromises, noLeakedGlobalState, missingInteractiveId, sassTraps,
  noImportantOnTransforms, noImportantOnFilters, noRawJsonImportsOutsideData, noSassAtImport, overscrollBehaviorLock,
  noLayoutAnimationInGsap, namedTimerConstants
};

// Ensure every rule in auditRulesConfig has its descriptor fields populated dynamically
for (const [key, rule] of Object.entries(auditRulesConfig)) {
  const r = rule as AuditRule;
  if (!r.id) {
    (r as { id: string }).id = key;
  }
  if (!r.name) {
    (r as { name: string }).name = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()); // string-ok: Internal string formatting or DOM token identifier
  }
  if (!r.aliases) {
    const keyParts = key.split(/(?=[A-Z])/).map(s => s.toLowerCase()); // string-ok: Internal string formatting or DOM token identifier
    (r as { aliases: readonly string[] }).aliases = [key.toLowerCase(), ...keyParts]; // string-ok: Internal string formatting or DOM token identifier
  }
}


