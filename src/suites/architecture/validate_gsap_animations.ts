/**
 * src/suites/architecture/validate_gsap_animations.ts
 *
 * GSAP ANIMATION & UI TIMING HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Enforces mandatory GSAP animation governance and UI timer architecture (AGENTS.md):
 *   1. `gsap-banned-css-animations`: Prohibits `@keyframes` and `transition:` in styles.
 *   2. `gsap-banned-ui-timers`: Prohibits `setTimeout`/`setInterval` in UI components & views.
 *   3. `gsap-no-layout-properties`: Prohibits layout animations (`backgroundPosition`, `top`, etc.) in GSAP.
 *   4. `gsap-named-timer-constants`: Enforces semantic constants with `_SEC` suffix in GSAP delays.
 *   5. `gsap-empty-vue-transitions`: Prohibits empty Vue transition classes (`.fade-enter-active {}`).
 *   6. `gsap-no-important-transforms`: Prohibits `!important` on `transform` in styles.
 *   7. `gsap-no-important-filters`: Prohibits `!important` on `filter` in styles.
 *   8. `gsap-gpu-layer-promotion`: Flags dynamic filter animations lacking `will-change`.
 *
 * Escape Hatches:
 *   `// timer-ok: <reason>`, `// delay-ok: <reason>`, `// layout-ok: <reason>`, `// gpu-ok: <reason>`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_gsap_animations.ts
 */

import { enableCompileCache } from 'node:module';
import { BaseAuditor,
  createUniformRemediationPhases, FileScanAuditor, createRuleCapabilities,
  resolveFileScanRoots, type FileScanRootsOptions } from '../../core/auditorBase.ts';
import {
  getAuditConfig,
  isInCodeRoots,
  isExemptFile,
  matchesAnyRoot
} from '../../core/auditConfig.ts';
import { normalizePosixPath as normalizeFilePath } from '../../core/safePath.ts';
import { parseVueSfcBlocks } from '../../core/vueSfcParser.ts';
import { isCommentLine } from '../../analyzers/auditRuleTypes.ts';
import {
  advancePastStringOrComment,
  scanBalancedBraces,
  scanBalancedParens
} from '../../core/scannerUtils.ts';

enableCompileCache();

export type GsapAnimationRuleId =
  | 'gsap-banned-css-animations'
  | 'gsap-banned-ui-timers'
  | 'gsap-no-layout-properties'
  | 'gsap-named-timer-constants'
  | 'gsap-empty-vue-transitions'
  | 'gsap-no-important-transforms'
  | 'gsap-no-important-filters'
  | 'gsap-gpu-layer-promotion'
  | 'gsap-timeline-constructor-duration'
  | 'gsap-kebab-case-properties'
  | 'gsap-raw-transform-string'
  | 'gsap-simultaneous-origin-conflict'
  | 'gsap-legacy-ease-names'
  | 'gsap-high-frequency-tween-creation';

export const GSAP_ANIMATION_RULES: readonly GsapAnimationRuleId[] = [
  'gsap-banned-css-animations',
  'gsap-banned-ui-timers',
  'gsap-no-layout-properties',
  'gsap-named-timer-constants',
  'gsap-empty-vue-transitions',
  'gsap-no-important-transforms',
  'gsap-no-important-filters',
  'gsap-gpu-layer-promotion',
  'gsap-timeline-constructor-duration',
  'gsap-kebab-case-properties',
  'gsap-raw-transform-string',
  'gsap-simultaneous-origin-conflict',
  'gsap-legacy-ease-names',
  'gsap-high-frequency-tween-creation'
] as const;

export const CONTEXT_WINDOW_SPAN_CHARS = 500;
export const GSAP_TWEEN_CONFIG_SEARCH_WINDOW_CHARS = 400;

export const BANNED_CSS_ANIMATIONS_REGEX = /@keyframes\b|\btransition\s*:/g;
export const BANNED_UI_TIMERS_REGEX = /\b(?:set|clear)(?:Timeout|Interval)\b/g;
export const NO_IMPORTANT_ON_TRANSFORMS_REGEX = /(?<![\w-])transform\s*:[^;]*!important/gi;
export const NO_IMPORTANT_ON_FILTERS_REGEX = /(?<![\w-])filter\s*:[^;]*!important/gi;
export const EMPTY_VUE_TRANSITIONS_REGEX =
  /\.[\w-]+-(?:enter|leave)-(?:active|from|to)(?:[\s,]+\.[\w-]+-(?:enter|leave)-(?:active|from|to))*\s*\{\s*(?:@include\s+[\w-]+;\s*)?\}/g;
export const GSAP_TWEEN_CALL_REGEX =
  /\b(?:gsap|timeline|\w*Timeline|tl)\s*\.\s*(?:to|from|fromTo)\s*\(/g;
export const GPU_FILTER_REGEX = /(?:backdrop-filter|filter):/gi;

interface TweenConfigObject {
  readonly startOffset: number;
  readonly text: string;
}

/**
 * Extracts configuration object literals directly passed as arguments to a GSAP tween call.
 * Deterministically balances parentheses and object braces, stopping strictly at the closing
 * parenthesis of the tween call, at EOF, or at '</script>' boundary in Vue SFCs.
 */
function extractBalancedBraces(
  content: string,
  braceStart: number,
  limit: number
): { end: number; text: string } | null {
  const result = scanBalancedBraces(content, braceStart + 1, limit, 1, '</script>');
  if (result.depth === 0) {
    return { end: result.end, text: content.slice(braceStart, result.end) };
  }
  return null;
}

function extractTweenConfigObjects(
  content: string,
  openParenIndex: number,
  maxIndex?: number
): TweenConfigObject[] {
  const configs: TweenConfigObject[] = [];
  const limit = maxIndex !== undefined ? Math.min(content.length, maxIndex) : content.length;
  let parenDepth = 1;
  let i = openParenIndex + 1;

  while (i < limit && parenDepth > 0) {
    const ch = content[i];

    if (ch === '<' && content.startsWith('</script>', i)) {
      break;
    }

    const skipped = advancePastStringOrComment(content, i, limit);
    if (skipped !== i) {
      i = skipped;
      continue;
    }

    if (ch === '(') {
      parenDepth++; // homebrew-ok: GSAP tween call argument paren balancing
      i++;
      continue;
    }

    if (ch === ')') {
      parenDepth--;
      i++;
      if (parenDepth === 0) break;
      continue;
    }

    if (ch === '{' && parenDepth === 1) {
      const balanced = extractBalancedBraces(content, i, limit);
      if (balanced) {
        configs.push({
          startOffset: i,
          text: balanced.text
        });
        i = balanced.end;
        continue;
      }
    }

    i++;
  }

  return configs;
}

const TWEEN_CALL_ESCAPE_WINDOW_OFFSET = 400;
const MATCH_ESCAPE_WINDOW_OFFSET = 800;

export const GSAP_LAYOUT_PROPERTIES = [
  'backgroundPosition',
  'backgroundPositionX',
  'backgroundPositionY',
  'top',
  'bottom',
  'left',
  'right',
  'width',
  'height',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'padding',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight'
] as const;

export type GsapLayoutProperty = (typeof GSAP_LAYOUT_PROPERTIES)[number];

const LAYOUT_PROPERTIES_SET: ReadonlySet<string> = new Set<string>(GSAP_LAYOUT_PROPERTIES);

function readTopLevelProperty(
  cfgText: string,
  i: number,
  limit: number
): { nextIndex: number; match: { index: number; propName: string } | null } {
  const idStart = i;
  while (i < limit && /[\w$]/.test(cfgText[i] ?? '')) {
    i++;
  }
  const id = cfgText.slice(idStart, i);
  let j = i;
  while (
    j < limit &&
    (cfgText[j] === ' ' || cfgText[j] === '\t' || cfgText[j] === '\n' || cfgText[j] === '\r')
  ) {
    j++;
  }
  if (j < limit && cfgText[j] === ':' && LAYOUT_PROPERTIES_SET.has(id)) {
    return { nextIndex: j, match: { index: idStart, propName: id } };
  }
  return { nextIndex: j, match: null };
}

function findTopLevelLayoutProperty(cfgText: string): { index: number; propName: string } | null {
  const limit = cfgText.length;
  let braceDepth = 0; // homebrew-ok: GSAP top-level property lexical depth tracking
  let parenDepth = 0; // homebrew-ok: GSAP top-level property lexical depth tracking
  let bracketDepth = 0;
  let i = 0;

  while (i < limit) {
    const skipped = advancePastStringOrComment(cfgText, i, limit);
    if (skipped !== i) {
      i = skipped;
      continue;
    }

    const ch = cfgText[i];
    if (ch === '{') {
      braceDepth++; // homebrew-ok: GSAP top-level property lexical depth tracking
    } else if (ch === '}') {
      braceDepth--;
    } else if (ch === '(') {
      parenDepth++; // homebrew-ok: GSAP top-level property lexical depth tracking
    } else if (ch === ')') {
      parenDepth--;
    } else if (ch === '[') {
      bracketDepth++;
    } else if (ch === ']') {
      bracketDepth--;
    } else if (
      braceDepth === 1 &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      ch &&
      /[a-z_$]/i.test(ch)
    ) {
      const { nextIndex, match } = readTopLevelProperty(cfgText, i, limit);
      if (match) return match;
      i = nextIndex;
      continue;
    }

    i++;
  }

  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getLineAndColumnAt(
  content: string,
  index: number
): { line: number; column: number; lineText: string } {
  const preceding = content.slice(0, index);
  const lines = preceding.split('\n');
  const line = lines.length;
  const column = (lines[lines.length - 1]?.length ?? 0) + 1;
  const lineStart = preceding.lastIndexOf('\n') + 1;
  const lineEnd = content.indexOf('\n', index);
  const lineText = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  return { line, column, lineText };
}

function isStyleContext(content: string, matchIndex: number, filePath?: string): boolean {
  if (!filePath) return true;
  const norm = normalizeFilePath(filePath);
  const isCssFile = norm.endsWith('.scss') || norm.endsWith('.css');
  const isVueFile = norm.endsWith('.vue');
  if (!isCssFile && !isVueFile) return false;

  if (isVueFile) {
    const styleOpenIndex = content.lastIndexOf('<style', matchIndex);
    const styleCloseIndex = content.lastIndexOf('</style>', matchIndex);
    if (styleOpenIndex === -1 || styleOpenIndex < styleCloseIndex) return false;
  }
  return true;
}

function isHighDensityOrSuppressed(
  content: string,
  start: number,
  matchIndex: number,
  context: string,
  filePath?: string
): boolean {
  if (/audit-disable\s+gpu-gaps|will-change:\s*(?:skip|ignore|false)/i.test(context)) {
    return true;
  }
  const beforeMatch = content.substring(start, matchIndex);
  const lastSemi = Math.max(
    beforeMatch.lastIndexOf(';'),
    beforeMatch.lastIndexOf('}'),
    beforeMatch.lastIndexOf('{')
  );
  const selectorText = beforeMatch.substring(lastSemi + 1).trim();

  const highDensityKeywords = /card|item|avatar|badge|icon|grid|list|row|cell|overlay|background/i;
  return (
    highDensityKeywords.test(selectorText) ||
    (filePath ? highDensityKeywords.test(filePath) : false)
  );
}

export class ValidateGsapAnimationsAuditor extends FileScanAuditor<GsapAnimationRuleId> {
  constructor(options: FileScanRootsOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(options);
    const config = getAuditConfig(effectiveRoot);
    const stylesExempts = [
      ...(config.styles?.exemptPaths ?? []),
      ...(config.styles?.exemptCssFiles ?? [])
    ];

    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      projectRoot: effectiveRoot,
      roots: targetRoots,
      id: 'validate_gsap_animations',
      name: 'GSAP Animation & UI Timing Hygiene',
      description: 'Gobernanza estricta de animaciones GSAP y timers UI',
      family: 'architecture',
      packageName: 'GSAP',
      icon: '🎬',
      configKey: 'animation',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      exemptPaths: stylesExempts,
      ruleCapabilities: createRuleCapabilities(GSAP_ANIMATION_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      allowedExtensions: new Set(['.ts', '.vue', '.scss', '.css']),
      ruleIds: GSAP_ANIMATION_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(GSAP_ANIMATION_RULES, 'behavior'),
      ruleDescriptions: {
        'gsap-banned-css-animations': 'Animación manual CSS prohibida',
        'gsap-banned-ui-timers': 'Timer nativo en componente UI',
        'gsap-no-layout-properties': 'Propiedad layout en tween GSAP',
        'gsap-named-timer-constants': 'Número mágico en retardo GSAP',
        'gsap-empty-vue-transitions': 'Transición Vue vacía detectada',
        'gsap-no-important-transforms': '!important en CSS transform',
        'gsap-no-important-filters': '!important en CSS filter',
        'gsap-gpu-layer-promotion': 'Falta will-change en filtro',
        'gsap-timeline-constructor-duration': 'Duration directa en timeline',
        'gsap-kebab-case-properties': 'Propiedad CSS en kebab-case',
        'gsap-raw-transform-string': 'String CSS crudo en transform',
        'gsap-simultaneous-origin-conflict': 'Conflicto svgOrigin y transform',
        'gsap-legacy-ease-names': 'Nombre de ease legado de GSAP v2',
        'gsap-high-frequency-tween-creation': 'Tween en listener continuo'
      },
      ruleRemediations: {
        'gsap-banned-css-animations':
          '📖 GUÍA DE REMEDIACIÓN: gsap-banned-css-animations\n' +
          '1. Causa Raíz: Se detectó una animación o transición manual definida en CSS o SCSS (@keyframes, transition, animation). En proyectos con GSAP como estándar de interfaz, las animaciones CSS rompen la sincronización temporal y el determinismo en tests automatizados (donde timeScale(100) avanza los tweens instantáneamente), provocando timeouts y pruebas visuales inestables.\n' +
          '2. Diagnóstico: Busca la propiedad transition o animation en la regla de estilo del archivo reportado.\n' +
          '3. Solución: Migra la animación a GSAP utilizando gsap.to(), gsap.fromTo(), gsap.timeline(), o los hooks de ciclo de vida del componente en Vue (onMounted, Transition con hooks JS).\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: .modal-card { transition: transform 0.3s ease, opacity 0.3s; }\n' +
          '   ✅ Correcto:   gsap.to(cardEl, { scale: 1, opacity: 1, duration: 0.3, ease: "power2.out" });\n' +
          '5. Excepción Válida: Se autoriza "transition: none" para reseteos y pseudo-clases simples de color/hover autorizadas en _base.scss.',
        'gsap-banned-ui-timers':
          '📖 GUÍA DE REMEDIACIÓN: gsap-banned-ui-timers\n' +
          '1. Causa Raíz: Se detectó el uso de setTimeout(), setInterval() o requestAnimationFrame() en componentes o capas de interfaz (src/ui/). Estos timers nativos no están sincronizados con la línea de tiempo de GSAP ni se limpian automáticamente al desmontar componentes, provocando memory leaks y desincronización en pruebas.\n' +
          '2. Diagnóstico: Identifica la llamada a setTimeout/setInterval en el archivo reportado.\n' +
          '3. Solución:\n' +
          '   a) Para retardos: reemplaza setTimeout(fn, ms) por gsap.delayedCall(segundos, fn) o await gsapSleep(segundos).\n' +
          '   b) Para bucles: utiliza gsap.timeline({ repeat: -1 }) o gsap.ticker.add(fn).\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: Retardos de interfaz con setTimeout nativo\n' +
          '   ✅ Correcto:   `gsap.delayedCall(DELAY_SEC, () => { isVisible.value = false; });`',
        'gsap-no-layout-properties':
          '📖 GUÍA DE REMEDIACIÓN: gsap-no-layout-properties\n' +
          '1. Causa Raíz: Se detectó un tween de GSAP que anima propiedades de layout geométrico (top, left, right, bottom, width, height, margin, padding). Animar estas propiedades fuerza al navegador a recalcular el layout (reflow) en cada frame en la CPU, provocando jank y caídas de FPS.\n' +
          '2. Diagnóstico: Revisa el objeto de propiedades del tween en la línea indicada.\n' +
          '3. Solución: Sustituye las propiedades de layout por transformaciones de GPU compuestas por hardware (x, y, xPercent, yPercent, scale, rotation, autoAlpha).\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: Animar propiedades de layout como top, left o width\n' +
          '   ✅ Correcto:   Animar transformaciones de GPU como x, y, scale y autoAlpha\n' +
          '5. Directiva de Escape: Si el reflow es estrictamente inevitable (ej: acordiones que desplazan el flujo del documento), añade la directiva: // layout-ok: <justificación técnica del reflow inevitable>.',
        'gsap-named-timer-constants':
          '📖 GUÍA DE REMEDIACIÓN: gsap-named-timer-constants\n' +
          '1. Causa Raíz: Se utilizó un valor numérico crudo (número mágico) como duración o retardo en una animación o timer de GSAP sin asociarlo a una constante descriptiva o design token.\n' +
          '2. Diagnóstico: Busca números literales como duraciones o retardos crudos en el tween.\n' +
          '3. Solución: Define o importa una constante con nombre representativo en mayúsculas (ej: MODAL_ENTER_DURATION_SEC) para unificar la velocidad del sistema de diseño.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: Números literales en duration o delay (ej: 0.3 o 350)\n' +
          '   ✅ Correcto:   Constantes semánticas exportadas (ej: UI_TRANSITION_DURATION_SEC)',
        'gsap-empty-vue-transitions':
          '📖 GUÍA DE REMEDIACIÓN: gsap-empty-vue-transitions\n' +
          '1. Causa Raíz: Se declaró una etiqueta <Transition> o <TransitionGroup> en un componente Vue sin definir clases CSS de transición ni vincular hooks de animación de GSAP (@enter, @leave).\n' +
          '2. Diagnóstico: Busca etiquetas <Transition> en el template que carezcan de name, css o listeners.\n' +
          '3. Solución: Vincula los hooks de JavaScript para animar la entrada y salida con GSAP (:css="false" @enter="onEnter" @leave="onLeave") o retira el wrapper si no se requiere animación.',
        'gsap-no-important-transforms':
          '📖 GUÍA DE REMEDIACIÓN: gsap-no-important-transforms\n' +
          '1. Causa Raíz: Se declaró !important en una propiedad CSS transform. Esto anula la matriz de transformación calculada por GSAP e impide que los tweens modifiquen visualmente el elemento.\n' +
          '2. Diagnóstico: Busca "transform: ... !important" en los estilos del componente reportado.\n' +
          '3. Solución: Remueve !important de la regla de transformación y gestiona la jerarquía visual con especificidad de selectores.',
        'gsap-no-important-filters':
          '📖 GUÍA DE REMEDIACIÓN: gsap-no-important-filters\n' +
          '1. Causa Raíz: Se declaró !important en propiedades filter o backdrop-filter en CSS, bloqueando la interpolación dinámica de efectos visuales por parte de GSAP.\n' +
          '2. Diagnóstico: Busca "filter: ... !important" en los estilos reportados.\n' +
          '3. Solución: Retira !important para permitir la transición y modulación de filtros en tiempo de ejecución.',
        'gsap-gpu-layer-promotion':
          '📖 GUÍA DE REMEDIACIÓN: gsap-gpu-layer-promotion\n' +
          '1. Causa Raíz: Un elemento animado intensivamente no ha sido promovido a su propia capa de composición GPU, lo que puede causar repintados continuos del contenedor padre.\n' +
          '2. Diagnóstico: Revisa el contenedor o elemento animado con GSAP.\n' +
          '3. Solución: Agrega force3D: true en la configuración del tween de GSAP o declara will-change: transform en el estilo CSS del elemento.',
        'gsap-timeline-constructor-duration':
          '📖 GUÍA DE REMEDIACIÓN: gsap-timeline-constructor-duration\n' +
          '1. Causa Raíz: Se pasó un parámetro de duración directamente al constructor del timeline. En GSAP v3, los timelines no tienen una duración fija prefijada sino que la calculan dinámicamente sumando sus tweens hijos. Este parámetro es ignorado y denota confusión de API.\n' +
          '2. Diagnóstico: Revisa la creación de instancias de timeline en el código reportado.\n' +
          '3. Solución: Retira duration del constructor del timeline y asígnalo individualmente a cada tween hijo o usa defaults: { duration: X }.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: Pasar duration en el objeto de opciones del timeline\n' +
          '   ✅ Correcto:   Usar defaults: { duration: DURATION_SEC } o duraciones en tweens hijos',
        'gsap-kebab-case-properties':
          '📖 GUÍA DE REMEDIACIÓN: gsap-kebab-case-properties\n' +
          '1. Causa Raíz: Se utilizó una propiedad en kebab-case dentro de un tween de GSAP. GSAP v3 exige la convención camelCase en sus objetos de configuración.\n' +
          '2. Diagnóstico: Revisa las claves del objeto de animación en la línea señalada.\n' +
          '3. Solución: Renombra las propiedades a camelCase (ej: backgroundColor, borderRadius, zIndex, transformOrigin).\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: Claves CSS con guiones como "background" + "-color"\n' +
          '   ✅ Correcto:   Propiedades en camelCase como backgroundColor',
        'gsap-raw-transform-string':
          '📖 GUÍA DE REMEDIACIÓN: gsap-raw-transform-string\n' +
          '1. Causa Raíz: Se pasó un string CSS literal a la propiedad transform en GSAP. Esto desactiva el optimizador matricial interno de GSAP y degrada el rendimiento de animación.\n' +
          '2. Diagnóstico: Busca strings crudos en la propiedad transform dentro de tweens de GSAP.\n' +
          '3. Solución: Utiliza las propiedades discretas y optimizadas de GSAP: x, y, rotation, scale, skewX.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: Asignar transformaciones complejas como cadena CSS cruda\n' +
          '   ✅ Correcto:   Asignar propiedades discretas numéricas ({ x: 30, scale: 1.1 })',
        'gsap-simultaneous-origin-conflict':
          '📖 GUÍA DE REMEDIACIÓN: gsap-simultaneous-origin-conflict\n' +
          '1. Causa Raíz: Se definieron simultáneamente svgOrigin y transformOrigin en el mismo tween de SVG, lo que genera cálculos conflictivos e indeterminismo en la matriz de rotación y escala.\n' +
          '2. Diagnóstico: Revisa si el tween de SVG contiene ambas propiedades.\n' +
          '3. Solución: Conserva únicamente svgOrigin (para coordenadas absolutas en el canvas SVG) o transformOrigin (para puntos relativos al elemento), nunca ambos.',
        'gsap-legacy-ease-names':
          '📖 GUÍA DE REMEDIACIÓN: gsap-legacy-ease-names\n' +
          '1. Causa Raíz: Se utilizaron nombres de aceleración heredados de GSAP v2 en formato PascalCase.\n' +
          '2. Diagnóstico: Busca referencias a clases estáticas de aceleración en mayúsculas.\n' +
          '3. Solución: Actualiza los nombres a strings canónicos en minúsculas de GSAP v3: "power2.out", "back.inOut", "elastic.out", "sine.inOut".\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: Nombres de aceleración heredados v2 en PascalCase\n' +
          '   ✅ Correcto:   Strings canónicos v3 en minúsculas (ej: "power2.out")',
        'gsap-high-frequency-tween-creation':
          '📖 GUÍA DE REMEDIACIÓN: gsap-high-frequency-tween-creation\n' +
          '1. Causa Raíz: Se detectó la creación de instancias de tweens dentro de callbacks de eventos de alta frecuencia (mousemove, pointermove, scroll, touchmove, resize) sin throttling ni uso de gsap.quickTo(). Esto satura la cola de animación y dispara el uso de CPU.\n' +
          '2. Diagnóstico: Revisa el listener de eventos que crea animaciones continuamente.\n' +
          '3. Solución: Inicializa gsap.quickTo() fuera del listener y en el callback únicamente actualiza la coordenada de destino, o utiliza ScrollTrigger / requestAnimationFrame coordinado.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: Crear tweens continuos dentro de listeners de alta frecuencia\n' +
          '   ✅ Correcto:   Inicializar xTo = gsap.quickTo(el, "x") fuera del evento y llamar xTo(val)'
      }
    });

    this.declareFileSubAuditor('gsap-banned-css-animations', (doc) => {
      const norm = normalizeFilePath(doc.relPath);
      if (!norm.endsWith('.scss') && !norm.endsWith('.css') && !norm.endsWith('.vue')) return;
      this.scanCssAnimations(doc.relPath, doc.rawContent);
    });

    this.declareFileSubAuditor('gsap-empty-vue-transitions', (doc) => {
      const norm = normalizeFilePath(doc.relPath);
      if (!norm.endsWith('.scss') && !norm.endsWith('.css') && !norm.endsWith('.vue')) return;
      this.scanEmptyVueTransitions(doc.relPath, doc.rawContent);
    });

    this.declareFileSubAuditor('gsap-no-important-transforms', (doc) => {
      const norm = normalizeFilePath(doc.relPath);
      if (!norm.endsWith('.scss') && !norm.endsWith('.css') && !norm.endsWith('.vue')) return;
      this.scanNoImportantTransforms(doc.relPath, doc.rawContent);
    });

    this.declareFileSubAuditor('gsap-no-important-filters', (doc) => {
      const norm = normalizeFilePath(doc.relPath);
      if (!norm.endsWith('.scss') && !norm.endsWith('.css') && !norm.endsWith('.vue')) return;
      this.scanNoImportantFilters(doc.relPath, doc.rawContent);
    });

    this.declareFileSubAuditor('gsap-gpu-layer-promotion', (doc) => {
      const norm = normalizeFilePath(doc.relPath);
      if (!norm.endsWith('.scss') && !norm.endsWith('.css') && !norm.endsWith('.vue')) return;
      this.scanGpuLayerPromotion(doc.relPath, doc.rawContent);
    });

    this.declareFileSubAuditor('gsap-banned-ui-timers', (doc) => {
      const norm = normalizeFilePath(doc.relPath);
      if ((!norm.endsWith('.ts') && !norm.endsWith('.vue')) || isExemptFile(doc.relPath)) return;
      if (!isInCodeRoots(doc.relPath)) return;
      const scriptRanges = this.getScriptRanges(doc.rawContent, norm);
      this.scanUiTimers(doc.relPath, doc.rawContent, scriptRanges, norm);
    });

    const declareScriptSubAuditor = (
      ruleId: GsapAnimationRuleId,
      scanner: (
        relPath: string,
        rawContent: string,
        scriptRanges: readonly { start: number; end: number }[]
      ) => void
    ) => {
      this.declareFileSubAuditor(ruleId, (doc) => {
        const norm = normalizeFilePath(doc.relPath);
        if ((!norm.endsWith('.ts') && !norm.endsWith('.vue')) || isExemptFile(doc.relPath)) return;
        const scriptRanges = this.getScriptRanges(doc.rawContent, norm);
        scanner(doc.relPath, doc.rawContent, scriptRanges);
      });
    };

    declareScriptSubAuditor('gsap-no-layout-properties', (r, c, ranges) =>
      this.scanLayoutProperties(r, c, ranges)
    );
    declareScriptSubAuditor('gsap-kebab-case-properties', (r, c, ranges) =>
      this.scanKebabCaseProperties(r, c, ranges)
    );
    declareScriptSubAuditor('gsap-raw-transform-string', (r, c, ranges) =>
      this.scanRawTransformString(r, c, ranges)
    );
    declareScriptSubAuditor('gsap-simultaneous-origin-conflict', (r, c, ranges) =>
      this.scanSimultaneousOriginConflict(r, c, ranges)
    );

    this.declareFileSubAuditor('gsap-named-timer-constants', (doc) => {
      const norm = normalizeFilePath(doc.relPath);
      if ((!norm.endsWith('.ts') && !norm.endsWith('.vue')) || isExemptFile(doc.relPath)) return;
      this.scanNamedTimerConstants(doc.relPath, doc.rawContent);
    });

    this.declareFileSubAuditor('gsap-timeline-constructor-duration', (doc) => {
      const norm = normalizeFilePath(doc.relPath);
      if ((!norm.endsWith('.ts') && !norm.endsWith('.vue')) || isExemptFile(doc.relPath)) return;
      this.scanTimelineConstructorDuration(doc.relPath, doc.rawContent);
    });

    this.declareFileSubAuditor('gsap-legacy-ease-names', (doc) => {
      const norm = normalizeFilePath(doc.relPath);
      if ((!norm.endsWith('.ts') && !norm.endsWith('.vue')) || isExemptFile(doc.relPath)) return;
      this.scanLegacyEaseNames(doc.relPath, doc.rawContent);
    });

    this.declareFileSubAuditor('gsap-high-frequency-tween-creation', (doc) => {
      const norm = normalizeFilePath(doc.relPath);
      if ((!norm.endsWith('.ts') && !norm.endsWith('.vue')) || isExemptFile(doc.relPath)) return;
      this.scanHighFrequencyTweens(doc.relPath, doc.rawContent);
    });
  }

  private getScriptRanges(content: string, norm: string): Array<{ start: number; end: number }> {
    const vueBlocks = norm.endsWith('.vue') ? parseVueSfcBlocks(content) : null;
    return vueBlocks
      ? vueBlocks.scripts.map((s) => ({ start: s.contentStartIndex, end: s.endIndex }))
      : [{ start: 0, end: content.length }];
  }

  private getNamedTimerConstantsRegex(): RegExp {
    const config = getAuditConfig(this.projectRoot);
    const customFuncs = config.animation?.customTimerFunctions ?? [];
    const defaultFuncs = ['gsapSleep'] as const;
    const allFuncs = Array.from(new Set([...defaultFuncs, ...customFuncs])).map((f) =>
      escapeRegex(f)
    );
    const funcsPart =
      allFuncs.length > 0
        ? `|\\b(?:${allFuncs.join('|')})\\s*\\(\\s*([0-9]+(?:\\.[0-9]+)?)\\s*\\)`
        : '';
    return new RegExp(
      `\\b(?:gsap\\.)?delayedCall\\s*\\(\\s*([0-9]+(?:\\.[0-9]+)?)\\s*,${funcsPart}`,
      'g'
    );
  }

  private scanCssAnimations(relPath: string, content: string): void {
    const bannedCssRegex = /@keyframes\b|\btransition\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = bannedCssRegex.exec(content)) !== null) {
      if (!isStyleContext(content, m.index, relPath)) continue;

      const { line, column } = getLineAndColumnAt(content, m.index);
      this.addViolation({
        ruleId: 'gsap-banned-css-animations',
        message:
          `Animación o transición CSS detectada: '${m[0]}'. MIGRACIÓN OBLIGATORIA A GSAP: Está estrictamente PROHIBIDO usar animaciones o transiciones CSS en vez de GSAP. ` +
          `[🚨 ALERTA DE SABOTAJE]: ESTÁ CATEGÓRICAMENTE PROHIBIDO BORRAR O ANULAR LA TRANSICIÓN PARA SILENCIAR EL AUDITOR. ` +
          `Todas las transiciones interactivas deben migrarse limpiamente a tweens de GSAP (gsap.to, gsap.fromTo, useGSAP).`,
        filePath: relPath,
        line,
        column,
        severity: 'error'
      });
    }
  }

  private scanEmptyVueTransitions(relPath: string, content: string): void {
    const emptyTransitionsRegex =
      /\.[\w-]+-(?:enter|leave)-(?:active|from|to)(?:[\s,]+\.[\w-]+-(?:enter|leave)-(?:active|from|to))*\s*\{\s*(?:@include\s+[\w-]+;\s*)?\}/g;
    let m: RegExpExecArray | null;
    while ((m = emptyTransitionsRegex.exec(content)) !== null) {
      if (!isStyleContext(content, m.index, relPath)) continue;
      const { line, column } = getLineAndColumnAt(content, m.index);
      this.addViolation({
        ruleId: 'gsap-empty-vue-transitions',
        message: `Transición de Vue vacía detectada: '${m[0].trim()}'. MIGRACIÓN OBLIGATORIA A GSAP: Prohibido vaciar clases de transición para evadir el auditor.`,
        filePath: relPath,
        line,
        column,
        severity: 'error'
      });
    }
  }

  private scanNoImportantTransforms(relPath: string, content: string): void {
    const impTransformRegex = /(?<![\w-])transform\s*:[^;]*!important/gi;
    let m: RegExpExecArray | null;
    while ((m = impTransformRegex.exec(content)) !== null) {
      if (!isStyleContext(content, m.index, relPath)) continue;
      const { line, column } = getLineAndColumnAt(content, m.index);
      this.addViolation({
        ruleId: 'gsap-no-important-transforms',
        message: `Uso de '!important' en 'transform' detectado: '${m[0]}'. Invalida las mutaciones de GSAP en tiempo de ejecución.`,
        filePath: relPath,
        line,
        column,
        severity: 'error'
      });
    }
  }

  private scanNoImportantFilters(relPath: string, content: string): void {
    const impFilterRegex = /(?<![\w-])filter\s*:[^;]*!important/gi;
    let m: RegExpExecArray | null;
    while ((m = impFilterRegex.exec(content)) !== null) {
      if (!isStyleContext(content, m.index, relPath)) continue;
      const { line, column } = getLineAndColumnAt(content, m.index);
      this.addViolation({
        ruleId: 'gsap-no-important-filters',
        message: `Uso de '!important' en 'filter' detectado: '${m[0]}'. Invalida las animaciones de efectos GSAP.`,
        filePath: relPath,
        line,
        column,
        severity: 'error'
      });
    }
  }

  private scanGpuLayerPromotion(relPath: string, content: string): void {
    const filterRegex = /(?:backdrop-filter|filter):/gi;
    let m: RegExpExecArray | null;
    while ((m = filterRegex.exec(content)) !== null) {
      if (!isStyleContext(content, m.index, relPath)) continue;
      const start = Math.max(0, m.index - CONTEXT_WINDOW_SPAN_CHARS);
      const end = Math.min(content.length, m.index + CONTEXT_WINDOW_SPAN_CHARS);
      const context = content.substring(start, end);

      if (isHighDensityOrSuppressed(content, start, m.index, context, relPath)) continue;

      const isDynamic = /transition\s*:[^;]*(?:filter|backdrop-filter|all)|animation\s*:/i.test(
        context
      );
      if (!isDynamic) continue;

      if (!/will-change|will-animate/i.test(context)) {
        const { line, column } = getLineAndColumnAt(content, m.index);
        this.addViolation({
          ruleId: 'gsap-gpu-layer-promotion',
          message:
            "Filtro dinámico detectado sin 'will-change'. Considera añadir promoción de capa GPU.",
          filePath: relPath,
          line,
          column,
          severity: 'error'
        });
      }
    }
  }

  private scanUiTimers(
    relPath: string,
    content: string,
    scriptRanges: Array<{ start: number; end: number }>,
    norm: string
  ): void {
    const config = getAuditConfig(this.projectRoot);
    const uiRoots = [...(config.paths.componentsRoots ?? []), ...(config.paths.viewsRoots ?? [])];
    const isUiFile = norm.endsWith('.vue') || matchesAnyRoot(norm, uiRoots);

    if (!isUiFile || /audit-disable\s+timers/i.test(content)) return;

    const timerRegex = /\b(?:set|clear)(?:Timeout|Interval)\b/g;
    for (const range of scriptRanges) {
      timerRegex.lastIndex = range.start;
      let m: RegExpExecArray | null;
      while ((m = timerRegex.exec(content)) !== null) {
        if (m.index >= range.end) break;
        const { line, column, lineText } = getLineAndColumnAt(content, m.index);
        const trimmedLine = lineText.trim();
        if (isCommentLine(trimmedLine)) continue;
        const textBefore = lineText.slice(0, column - 1);
        if (textBefore.includes('//')) continue;
        if (/\/\/\s*(?:timer-ok|delay-ok):\s*\S+/i.test(lineText)) continue;
        this.addViolation({
          ruleId: 'gsap-banned-ui-timers',
          message: `Timer de ANIMACIÓN/UI detectado: '${m[0]}'. MIGRACIÓN OBLIGATORIA A GSAP: Prohibido en UI. Usa gsap.delayedCall o promesas deterministas.`,
          filePath: relPath,
          line,
          column,
          severity: 'error'
        });
      }
    }
  }

  private forEachTweenConfig(
    content: string,
    scriptRanges: readonly { start: number; end: number }[],
    callback: (cfg: TweenConfigObject, mIndex: number, isAuthorized: boolean) => void
  ): void {
    if (
      !content.includes('gsap') &&
      !content.includes('timeline') &&
      !content.includes('tl.') &&
      !content.includes('Timeline')
    ) {
      return;
    }
    const gsapTweenRegex = /\b(?:gsap|timeline|\w*Timeline|tl)\s*\.\s*(?:to|from|fromTo)\s*\(/g;
    for (const range of scriptRanges) {
      gsapTweenRegex.lastIndex = range.start;
      let m: RegExpExecArray | null;

      while ((m = gsapTweenRegex.exec(content)) !== null) {
        if (m.index >= range.end) break;
        const openParenIdx = m.index + m[0].length - 1;
        const parenResult = scanBalancedParens(content, openParenIdx + 1, range.end);
        const tweenEnd = parenResult.depth === 0 ? parenResult.end : range.end;

        const precedingLineStart = content.lastIndexOf('\n', m.index);
        const prevLineStart =
          precedingLineStart > 0 ? content.lastIndexOf('\n', precedingLineStart - 1) + 1 : 0;
        const tweenSpanText = content.slice(prevLineStart, tweenEnd);
        const isTweenAuthorized = /\/\/\s*(?:layout-ok|shimmer-ok|gpu-ok):\s*\S+/i.test(
          tweenSpanText
        );

        const configObjects = extractTweenConfigObjects(content, openParenIdx, range.end);
        for (const cfg of configObjects) {
          callback(cfg, m.index, isTweenAuthorized);
        }
      }
    }
  }

  private scanLayoutProperties(
    relPath: string,
    content: string,
    scriptRanges: readonly { start: number; end: number }[]
  ): void {
    this.forEachTweenConfig(content, scriptRanges, (cfg, mIndex, isAuthorized) => {
      const foundLayout = findTopLevelLayoutProperty(cfg.text);
      if (foundLayout && !isAuthorized) {
        const matchIdx = cfg.startOffset + foundLayout.index;
        const tweenCallStart = mIndex;
        const windowStart = Math.max(
          0,
          Math.min(
            tweenCallStart - TWEEN_CALL_ESCAPE_WINDOW_OFFSET,
            matchIdx - MATCH_ESCAPE_WINDOW_OFFSET
          )
        );
        const lineEnd = content.indexOf('\n', matchIdx);
        const nearby = content.slice(windowStart, lineEnd === -1 ? content.length : lineEnd);
        if (!/\/\/\s*(?:layout-ok|shimmer-ok|gpu-ok):\s*\S+/i.test(nearby)) {
          const { line, column } = getLineAndColumnAt(content, matchIdx);
          this.addViolation({
            ruleId: 'gsap-no-layout-properties',
            message: `Animación de propiedades CSS de layout en GSAP detectada: '${foundLayout.propName}:'. Usa propiedades aceleradas por GPU (x, y, scale, rotation, opacity) o Flip Plugin (o documenta con '// layout-ok: <justificación>' si es un colapso/acordeón estructural que requiere reflow).`,
            filePath: relPath,
            line,
            column,
            severity: 'error'
          });
        }
      }
    });
  }

  private scanKebabCaseProperties(
    relPath: string,
    content: string,
    scriptRanges: readonly { start: number; end: number }[]
  ): void {
    this.forEachTweenConfig(content, scriptRanges, (cfg) => {
      const kebabRegex =
        /(['"])(?:background-color|border-radius|font-size|z-index|box-shadow|line-height|letter-spacing)\1\s*:/g;
      let kebabMatch: RegExpExecArray | null;
      while ((kebabMatch = kebabRegex.exec(cfg.text)) !== null) {
        const matchIdx = cfg.startOffset + kebabMatch.index;
        const { line, column } = getLineAndColumnAt(content, matchIdx);
        this.addViolation({
          ruleId: 'gsap-kebab-case-properties',
          message: `Clave CSS en kebab-case detectada en tween GSAP: '${kebabMatch[0]}'. Usa camelCase según el estándar de GSAP.`,
          filePath: relPath,
          line,
          column,
          severity: 'error'
        });
      }
    });
  }

  private scanRawTransformString(
    relPath: string,
    content: string,
    scriptRanges: readonly { start: number; end: number }[]
  ): void {
    this.forEachTweenConfig(content, scriptRanges, (cfg) => {
      const rawTransformRegex =
        /\btransform\s*:\s*(['"`])(?:translate|rotate|scale|skew|matrix)[^'"`]*\1/i;
      const rawMatch = rawTransformRegex.exec(cfg.text);
      if (rawMatch) {
        const matchIdx = cfg.startOffset + rawMatch.index;
        const { line, column } = getLineAndColumnAt(content, matchIdx);
        this.addViolation({
          ruleId: 'gsap-raw-transform-string',
          message: `Uso de string CSS 'transform' en GSAP detectado: '${rawMatch[0]}'. Usa alias nativos optimizados de GSAP ('x', 'y', 'rotation', 'scale').`,
          filePath: relPath,
          line,
          column,
          severity: 'error'
        });
      }
    });
  }

  private scanSimultaneousOriginConflict(
    relPath: string,
    content: string,
    scriptRanges: readonly { start: number; end: number }[]
  ): void {
    this.forEachTweenConfig(content, scriptRanges, (cfg) => {
      if (/\bsvgOrigin\s*:/i.test(cfg.text) && /\btransformOrigin\s*:/i.test(cfg.text)) {
        const { line, column } = getLineAndColumnAt(content, cfg.startOffset);
        this.addViolation({
          ruleId: 'gsap-simultaneous-origin-conflict',
          message:
            "Conflicto de orígenes SVG detectado: no declares 'svgOrigin' y 'transformOrigin' simultáneamente en el mismo tween.",
          filePath: relPath,
          line,
          column,
          severity: 'error'
        });
      }
    });
  }

  private scanNamedTimerConstants(relPath: string, content: string): void {
    const namedTimerRegex = this.getNamedTimerConstantsRegex();
    let m: RegExpExecArray | null;
    while ((m = namedTimerRegex.exec(content)) !== null) {
      const valStr = m.slice(1).find(Boolean);
      if (!valStr || parseFloat(valStr) === 0) continue;

      const { line, column, lineText } = getLineAndColumnAt(content, m.index);
      if (/\/\/\s*(?:timer-ok|delay-ok):\s*\S+/i.test(lineText)) continue;

      this.addViolation({
        ruleId: 'gsap-named-timer-constants',
        message: `Número mágico detectado en retardo de animación GSAP: '${m[0].trim()}'. Define y usa una constante semántica con sufijo '_SEC'.`,
        filePath: relPath,
        line,
        column,
        severity: 'error'
      });
    }
  }

  private scanTimelineConstructorDuration(relPath: string, content: string): void {
    const tlConstructorRegex = /\b(?:gsap\.)?timeline\s*\(\s*\{([^)]*)\}\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = tlConstructorRegex.exec(content)) !== null) {
      const configBody = m[1] ?? '';
      const cleaned = configBody.replace(/\bdefaults\s*:\s*\{[^}]*\}/g, '');
      const durationMatch = /\bduration\s*:\s*\d+(?:\.\d+)?/.exec(cleaned);
      if (durationMatch) {
        const { line, column } = getLineAndColumnAt(content, m.index);
        this.addViolation({
          ruleId: 'gsap-timeline-constructor-duration',
          message: `Propiedad 'duration' en constructor de timeline ignorada en GSAP 3. Usa 'defaults: { duration: ... }'.`,
          filePath: relPath,
          line,
          column,
          severity: 'error'
        });
      }
    }
  }

  private scanLegacyEaseNames(relPath: string, content: string): void {
    const legacyEaseRegex =
      /\b(?:Power[0-4]|Quad|Cubic|Quart|Quint|Strong|Linear|Sine|Expo|Circ|Back|Bounce|Elastic)\.(?:ease(?:In|Out|InOut)|easeNone)\b/g;
    let m: RegExpExecArray | null;
    while ((m = legacyEaseRegex.exec(content)) !== null) {
      const { line, column } = getLineAndColumnAt(content, m.index);
      this.addViolation({
        ruleId: 'gsap-legacy-ease-names',
        message: `Ease legado de GSAP v2 '${m[0]}' detectado. Usa el formato canónico de GSAP 3 (ej: 'power2.out', 'none').`,
        filePath: relPath,
        line,
        column,
        severity: 'error'
      });
    }
  }

  private scanHighFrequencyTweens(relPath: string, content: string): void {
    const hfListenerRegex =
      /\b\w+\.addEventListener\s*\(\s*['"](?:mousemove|pointermove|touchmove|wheel|scroll)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = hfListenerRegex.exec(content)) !== null) {
      const listenerChunk = content.slice(m.index, m.index + GSAP_TWEEN_CONFIG_SEARCH_WINDOW_CHARS);
      if (/\bgsap\.(?:to|from|fromTo)\s*\(/.test(listenerChunk)) {
        if (!/\/\/\s*(?:quickto-ok|listener-ok):\s*\S+/i.test(listenerChunk)) {
          const { line, column } = getLineAndColumnAt(content, m.index);
          this.addViolation({
            ruleId: 'gsap-high-frequency-tween-creation',
            message:
              "Creación de tween con 'gsap.to()' dentro de listener continuo. En 'mousemove', etc. usa 'gsap.quickTo()'.",
            filePath: relPath,
            line,
            column,
            severity: 'warning'
          });
        }
      }
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateGsapAnimationsAuditor());
