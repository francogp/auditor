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
import { BaseAuditor, FileScanAuditor, createRuleCapabilities } from "../../core/auditorBase.js";
import { getAuditConfig, isInCodeRoots, isExemptFile, matchesAnyRoot } from "../../core/auditConfig.js";
import { normalizePosixPath as normalizeFilePath } from "../../core/safePath.js";
import { parseVueSfcBlocks } from "../../core/vueSfcParser.js";
import { isCommentLine } from "../../analyzers/auditRuleTypes.js";
import { advancePastStringOrComment, scanBalancedBraces, scanBalancedParens } from "../../core/scannerUtils.js";
enableCompileCache();
export const GSAP_ANIMATION_RULES = [
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
];
export const CONTEXT_WINDOW_SPAN_CHARS = 500;
export const GSAP_TWEEN_CONFIG_SEARCH_WINDOW_CHARS = 400;
export const BANNED_CSS_ANIMATIONS_REGEX = /@keyframes\b|\btransition\s*:/g;
export const BANNED_UI_TIMERS_REGEX = /\b(?:set|clear)(?:Timeout|Interval)\b/g;
export const NO_IMPORTANT_ON_TRANSFORMS_REGEX = /(?<![\w-])transform\s*:[^;]*!important/gi;
export const NO_IMPORTANT_ON_FILTERS_REGEX = /(?<![\w-])filter\s*:[^;]*!important/gi;
export const EMPTY_VUE_TRANSITIONS_REGEX = /\.[\w-]+-(?:enter|leave)-(?:active|from|to)(?:[\s,]+\.[\w-]+-(?:enter|leave)-(?:active|from|to))*\s*\{\s*(?:@include\s+[\w-]+;\s*)?\}/g;
export const GSAP_TWEEN_CALL_REGEX = /\b(?:gsap|timeline|\w*Timeline|tl)\s*\.\s*(?:to|from|fromTo)\s*\(/g;
export const GPU_FILTER_REGEX = /(?:backdrop-filter|filter):/gi;
/**
 * Extracts configuration object literals directly passed as arguments to a GSAP tween call.
 * Deterministically balances parentheses and object braces, stopping strictly at the closing
 * parenthesis of the tween call, at EOF, or at '</script>' boundary in Vue SFCs.
 */
function extractBalancedBraces(content, braceStart, limit) {
    const result = scanBalancedBraces(content, braceStart + 1, limit, 1, '</script>');
    if (result.depth === 0) {
        return { end: result.end, text: content.slice(braceStart, result.end) };
    }
    return null;
}
function extractTweenConfigObjects(content, openParenIndex, maxIndex) {
    const configs = [];
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
            if (parenDepth === 0)
                break;
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
];
const LAYOUT_PROPERTIES_SET = new Set(GSAP_LAYOUT_PROPERTIES);
function readTopLevelProperty(cfgText, i, limit) {
    const idStart = i;
    while (i < limit && /[\w$]/.test(cfgText[i] ?? '')) {
        i++;
    }
    const id = cfgText.slice(idStart, i);
    let j = i;
    while (j < limit && (cfgText[j] === ' ' || cfgText[j] === '\t' || cfgText[j] === '\n' || cfgText[j] === '\r')) {
        j++;
    }
    if (j < limit && cfgText[j] === ':' && LAYOUT_PROPERTIES_SET.has(id)) {
        return { nextIndex: j, match: { index: idStart, propName: id } };
    }
    return { nextIndex: j, match: null };
}
function findTopLevelLayoutProperty(cfgText) {
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
        }
        else if (ch === '}') {
            braceDepth--;
        }
        else if (ch === '(') {
            parenDepth++; // homebrew-ok: GSAP top-level property lexical depth tracking
        }
        else if (ch === ')') {
            parenDepth--;
        }
        else if (ch === '[') {
            bracketDepth++;
        }
        else if (ch === ']') {
            bracketDepth--;
        }
        else if (braceDepth === 1 && parenDepth === 0 && bracketDepth === 0 && ch && /[a-z_$]/i.test(ch)) {
            const { nextIndex, match } = readTopLevelProperty(cfgText, i, limit);
            if (match)
                return match;
            i = nextIndex;
            continue;
        }
        i++;
    }
    return null;
}
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function getLineAndColumnAt(content, index) {
    const preceding = content.slice(0, index);
    const lines = preceding.split('\n');
    const line = lines.length;
    const column = (lines[lines.length - 1]?.length ?? 0) + 1;
    const lineStart = preceding.lastIndexOf('\n') + 1;
    const lineEnd = content.indexOf('\n', index);
    const lineText = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    return { line, column, lineText };
}
function isStyleContext(content, matchIndex, filePath) {
    if (!filePath)
        return true;
    const norm = normalizeFilePath(filePath);
    const isCssFile = norm.endsWith('.scss') || norm.endsWith('.css');
    const isVueFile = norm.endsWith('.vue');
    if (!isCssFile && !isVueFile)
        return false;
    if (isVueFile) {
        const styleOpenIndex = content.lastIndexOf('<style', matchIndex);
        const styleCloseIndex = content.lastIndexOf('</style>', matchIndex);
        if (styleOpenIndex === -1 || styleOpenIndex < styleCloseIndex)
            return false;
    }
    return true;
}
function isHighDensityOrSuppressed(content, start, matchIndex, context, filePath) {
    if (/audit-disable\s+gpu-gaps|will-change:\s*(?:skip|ignore|false)/i.test(context)) {
        return true;
    }
    const beforeMatch = content.substring(start, matchIndex);
    const lastSemi = Math.max(beforeMatch.lastIndexOf(';'), beforeMatch.lastIndexOf('}'), beforeMatch.lastIndexOf('{'));
    const selectorText = beforeMatch.substring(lastSemi + 1).trim();
    const highDensityKeywords = /card|item|avatar|badge|icon|grid|list|row|cell|overlay|background/i;
    return highDensityKeywords.test(selectorText) || (filePath ? highDensityKeywords.test(filePath) : false);
}
export class ValidateGsapAnimationsAuditor extends FileScanAuditor {
    constructor(roots, projectRoot) {
        const config = getAuditConfig(projectRoot);
        const effectiveRoots = roots ?? config.paths.srcRoots;
        super({
            usesThirdPartyTool: false,
            id: 'validate_gsap_animations',
            name: 'GSAP Animation & UI Timing Hygiene',
            description: 'Gobernanza estricta de animaciones GSAP y timers UI',
            family: 'architecture',
            packageName: 'GSAP',
            icon: '🎬',
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            ruleCapabilities: createRuleCapabilities(GSAP_ANIMATION_RULES, {
                speed: 'light',
                phase: 'normal',
                fix: 'none',
                md: false,
                ast: false,
                changedOnly: false, critical: false
            }),
            roots: effectiveRoots,
            allowedExtensions: new Set(['.ts', '.vue', '.scss', '.css']),
            ruleIds: GSAP_ANIMATION_RULES,
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
                'gsap-banned-css-animations': 'Guía de diagnóstico y remediación para gsap-banned-css-animations. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'gsap-banned-ui-timers': 'Guía de diagnóstico y remediación para gsap-banned-ui-timers. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'gsap-no-layout-properties': 'Guía de diagnóstico y remediación para gsap-no-layout-properties. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'gsap-named-timer-constants': 'Guía de diagnóstico y remediación para gsap-named-timer-constants. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'gsap-empty-vue-transitions': 'Guía de diagnóstico y remediación para gsap-empty-vue-transitions. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'gsap-no-important-transforms': 'Guía de diagnóstico y remediación para gsap-no-important-transforms. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'gsap-no-important-filters': 'Guía de diagnóstico y remediación para gsap-no-important-filters. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'gsap-gpu-layer-promotion': 'Guía de diagnóstico y remediación para gsap-gpu-layer-promotion. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'gsap-timeline-constructor-duration': 'Guía de diagnóstico y remediación para gsap-timeline-constructor-duration. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'gsap-kebab-case-properties': 'Guía de diagnóstico y remediación para gsap-kebab-case-properties. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'gsap-raw-transform-string': 'Guía de diagnóstico y remediación para gsap-raw-transform-string. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'gsap-simultaneous-origin-conflict': 'Guía de diagnóstico y remediación para gsap-simultaneous-origin-conflict. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'gsap-legacy-ease-names': 'Guía de diagnóstico y remediación para gsap-legacy-ease-names. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'gsap-high-frequency-tween-creation': 'Guía de diagnóstico y remediación para gsap-high-frequency-tween-creation. Revisa la incidencia detectada y ajusta el código correspondiente.',
            },
        });
        this.declareFileSubAuditor('gsap-banned-css-animations', (doc) => {
            const norm = normalizeFilePath(doc.relPath);
            if (!norm.endsWith('.scss') && !norm.endsWith('.css') && !norm.endsWith('.vue'))
                return;
            this.scanCssAnimations(doc.relPath, doc.rawContent);
        });
        this.declareFileSubAuditor('gsap-empty-vue-transitions', (doc) => {
            const norm = normalizeFilePath(doc.relPath);
            if (!norm.endsWith('.scss') && !norm.endsWith('.css') && !norm.endsWith('.vue'))
                return;
            this.scanEmptyVueTransitions(doc.relPath, doc.rawContent);
        });
        this.declareFileSubAuditor('gsap-no-important-transforms', (doc) => {
            const norm = normalizeFilePath(doc.relPath);
            if (!norm.endsWith('.scss') && !norm.endsWith('.css') && !norm.endsWith('.vue'))
                return;
            this.scanNoImportantTransforms(doc.relPath, doc.rawContent);
        });
        this.declareFileSubAuditor('gsap-no-important-filters', (doc) => {
            const norm = normalizeFilePath(doc.relPath);
            if (!norm.endsWith('.scss') && !norm.endsWith('.css') && !norm.endsWith('.vue'))
                return;
            this.scanNoImportantFilters(doc.relPath, doc.rawContent);
        });
        this.declareFileSubAuditor('gsap-gpu-layer-promotion', (doc) => {
            const norm = normalizeFilePath(doc.relPath);
            if (!norm.endsWith('.scss') && !norm.endsWith('.css') && !norm.endsWith('.vue'))
                return;
            this.scanGpuLayerPromotion(doc.relPath, doc.rawContent);
        });
        this.declareFileSubAuditor('gsap-banned-ui-timers', (doc) => {
            const norm = normalizeFilePath(doc.relPath);
            if ((!norm.endsWith('.ts') && !norm.endsWith('.vue')) || isExemptFile(doc.relPath))
                return;
            if (!isInCodeRoots(doc.relPath))
                return;
            const scriptRanges = this.getScriptRanges(doc.rawContent, norm);
            this.scanUiTimers(doc.relPath, doc.rawContent, scriptRanges, norm);
        });
        const declareScriptSubAuditor = (ruleId, scanner) => {
            this.declareFileSubAuditor(ruleId, (doc) => {
                const norm = normalizeFilePath(doc.relPath);
                if ((!norm.endsWith('.ts') && !norm.endsWith('.vue')) || isExemptFile(doc.relPath))
                    return;
                const scriptRanges = this.getScriptRanges(doc.rawContent, norm);
                scanner(doc.relPath, doc.rawContent, scriptRanges);
            });
        };
        declareScriptSubAuditor('gsap-no-layout-properties', (r, c, ranges) => this.scanLayoutProperties(r, c, ranges));
        declareScriptSubAuditor('gsap-kebab-case-properties', (r, c, ranges) => this.scanKebabCaseProperties(r, c, ranges));
        declareScriptSubAuditor('gsap-raw-transform-string', (r, c, ranges) => this.scanRawTransformString(r, c, ranges));
        declareScriptSubAuditor('gsap-simultaneous-origin-conflict', (r, c, ranges) => this.scanSimultaneousOriginConflict(r, c, ranges));
        this.declareFileSubAuditor('gsap-named-timer-constants', (doc) => {
            const norm = normalizeFilePath(doc.relPath);
            if ((!norm.endsWith('.ts') && !norm.endsWith('.vue')) || isExemptFile(doc.relPath))
                return;
            this.scanNamedTimerConstants(doc.relPath, doc.rawContent);
        });
        this.declareFileSubAuditor('gsap-timeline-constructor-duration', (doc) => {
            const norm = normalizeFilePath(doc.relPath);
            if ((!norm.endsWith('.ts') && !norm.endsWith('.vue')) || isExemptFile(doc.relPath))
                return;
            this.scanTimelineConstructorDuration(doc.relPath, doc.rawContent);
        });
        this.declareFileSubAuditor('gsap-legacy-ease-names', (doc) => {
            const norm = normalizeFilePath(doc.relPath);
            if ((!norm.endsWith('.ts') && !norm.endsWith('.vue')) || isExemptFile(doc.relPath))
                return;
            this.scanLegacyEaseNames(doc.relPath, doc.rawContent);
        });
        this.declareFileSubAuditor('gsap-high-frequency-tween-creation', (doc) => {
            const norm = normalizeFilePath(doc.relPath);
            if ((!norm.endsWith('.ts') && !norm.endsWith('.vue')) || isExemptFile(doc.relPath))
                return;
            this.scanHighFrequencyTweens(doc.relPath, doc.rawContent);
        });
    }
    getScriptRanges(content, norm) {
        const vueBlocks = norm.endsWith('.vue') ? parseVueSfcBlocks(content) : null;
        return vueBlocks
            ? vueBlocks.scripts.map(s => ({ start: s.contentStartIndex, end: s.endIndex }))
            : [{ start: 0, end: content.length }];
    }
    getNamedTimerConstantsRegex() {
        const config = getAuditConfig(this.projectRoot);
        const customFuncs = config.animation?.customTimerFunctions ?? [];
        const defaultFuncs = ['gsapSleep'];
        const allFuncs = Array.from(new Set([...defaultFuncs, ...customFuncs])).map(f => escapeRegex(f));
        const funcsPart = allFuncs.length > 0 ? `|\\b(?:${allFuncs.join('|')})\\s*\\(\\s*([0-9]+(?:\\.[0-9]+)?)\\s*\\)` : '';
        return new RegExp(`\\b(?:gsap\\.)?delayedCall\\s*\\(\\s*([0-9]+(?:\\.[0-9]+)?)\\s*,${funcsPart}`, 'g');
    }
    scanCssAnimations(relPath, content) {
        const bannedCssRegex = /@keyframes\b|\btransition\s*:/g;
        let m;
        while ((m = bannedCssRegex.exec(content)) !== null) {
            if (!isStyleContext(content, m.index, relPath))
                continue;
            const { line, column } = getLineAndColumnAt(content, m.index);
            this.addViolation({
                ruleId: 'gsap-banned-css-animations',
                message: `Animación o transición CSS detectada: '${m[0]}'. MIGRACIÓN OBLIGATORIA A GSAP: Está estrictamente PROHIBIDO usar animaciones o transiciones CSS en vez de GSAP. ` +
                    `[🚨 ALERTA DE SABOTAJE]: ESTÁ CATEGÓRICAMENTE PROHIBIDO BORRAR O ANULAR LA TRANSICIÓN PARA SILENCIAR EL AUDITOR. ` +
                    `Todas las transiciones interactivas deben migrarse limpiamente a tweens de GSAP (gsap.to, gsap.fromTo, useGSAP).`,
                filePath: relPath,
                line,
                column,
                severity: 'error'
            });
        }
    }
    scanEmptyVueTransitions(relPath, content) {
        const emptyTransitionsRegex = /\.[\w-]+-(?:enter|leave)-(?:active|from|to)(?:[\s,]+\.[\w-]+-(?:enter|leave)-(?:active|from|to))*\s*\{\s*(?:@include\s+[\w-]+;\s*)?\}/g;
        let m;
        while ((m = emptyTransitionsRegex.exec(content)) !== null) {
            if (!isStyleContext(content, m.index, relPath))
                continue;
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
    scanNoImportantTransforms(relPath, content) {
        const impTransformRegex = /(?<![\w-])transform\s*:[^;]*!important/gi;
        let m;
        while ((m = impTransformRegex.exec(content)) !== null) {
            if (!isStyleContext(content, m.index, relPath))
                continue;
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
    scanNoImportantFilters(relPath, content) {
        const impFilterRegex = /(?<![\w-])filter\s*:[^;]*!important/gi;
        let m;
        while ((m = impFilterRegex.exec(content)) !== null) {
            if (!isStyleContext(content, m.index, relPath))
                continue;
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
    scanGpuLayerPromotion(relPath, content) {
        const filterRegex = /(?:backdrop-filter|filter):/gi;
        let m;
        while ((m = filterRegex.exec(content)) !== null) {
            if (!isStyleContext(content, m.index, relPath))
                continue;
            const start = Math.max(0, m.index - CONTEXT_WINDOW_SPAN_CHARS);
            const end = Math.min(content.length, m.index + CONTEXT_WINDOW_SPAN_CHARS);
            const context = content.substring(start, end);
            if (isHighDensityOrSuppressed(content, start, m.index, context, relPath))
                continue;
            const isDynamic = /transition\s*:[^;]*(?:filter|backdrop-filter|all)|animation\s*:/i.test(context);
            if (!isDynamic)
                continue;
            if (!/will-change|will-animate/i.test(context)) {
                const { line, column } = getLineAndColumnAt(content, m.index);
                this.addViolation({
                    ruleId: 'gsap-gpu-layer-promotion',
                    message: "Filtro dinámico detectado sin 'will-change'. Considera añadir promoción de capa GPU.",
                    filePath: relPath,
                    line,
                    column,
                    severity: 'error'
                });
            }
        }
    }
    scanUiTimers(relPath, content, scriptRanges, norm) {
        const config = getAuditConfig(this.projectRoot);
        const uiRoots = [
            ...(config.paths.componentsRoots ?? []),
            ...(config.paths.viewsRoots ?? [])
        ];
        const isUiFile = norm.endsWith('.vue') || matchesAnyRoot(norm, uiRoots);
        if (!isUiFile || /audit-disable\s+timers/i.test(content))
            return;
        const timerRegex = /\b(?:set|clear)(?:Timeout|Interval)\b/g;
        for (const range of scriptRanges) {
            timerRegex.lastIndex = range.start;
            let m;
            while ((m = timerRegex.exec(content)) !== null) {
                if (m.index >= range.end)
                    break;
                const { line, column, lineText } = getLineAndColumnAt(content, m.index);
                const trimmedLine = lineText.trim();
                if (isCommentLine(trimmedLine))
                    continue;
                const textBefore = lineText.slice(0, column - 1);
                if (textBefore.includes('//'))
                    continue;
                if (/\/\/\s*(?:timer-ok|delay-ok):\s*\S+/i.test(lineText))
                    continue;
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
    forEachTweenConfig(content, scriptRanges, callback) {
        if (!content.includes('gsap') && !content.includes('timeline') && !content.includes('tl.') && !content.includes('Timeline')) {
            return;
        }
        const gsapTweenRegex = /\b(?:gsap|timeline|\w*Timeline|tl)\s*\.\s*(?:to|from|fromTo)\s*\(/g;
        for (const range of scriptRanges) {
            gsapTweenRegex.lastIndex = range.start;
            let m;
            while ((m = gsapTweenRegex.exec(content)) !== null) {
                if (m.index >= range.end)
                    break;
                const openParenIdx = m.index + m[0].length - 1;
                const parenResult = scanBalancedParens(content, openParenIdx + 1, range.end);
                const tweenEnd = parenResult.depth === 0 ? parenResult.end : range.end;
                const precedingLineStart = content.lastIndexOf('\n', m.index);
                const prevLineStart = precedingLineStart > 0 ? content.lastIndexOf('\n', precedingLineStart - 1) + 1 : 0;
                const tweenSpanText = content.slice(prevLineStart, tweenEnd);
                const isTweenAuthorized = /\/\/\s*(?:layout-ok|shimmer-ok|gpu-ok):\s*\S+/i.test(tweenSpanText);
                const configObjects = extractTweenConfigObjects(content, openParenIdx, range.end);
                for (const cfg of configObjects) {
                    callback(cfg, m.index, isTweenAuthorized);
                }
            }
        }
    }
    scanLayoutProperties(relPath, content, scriptRanges) {
        this.forEachTweenConfig(content, scriptRanges, (cfg, mIndex, isAuthorized) => {
            const foundLayout = findTopLevelLayoutProperty(cfg.text);
            if (foundLayout && !isAuthorized) {
                const matchIdx = cfg.startOffset + foundLayout.index;
                const tweenCallStart = mIndex;
                const windowStart = Math.max(0, Math.min(tweenCallStart - TWEEN_CALL_ESCAPE_WINDOW_OFFSET, matchIdx - MATCH_ESCAPE_WINDOW_OFFSET));
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
    scanKebabCaseProperties(relPath, content, scriptRanges) {
        this.forEachTweenConfig(content, scriptRanges, (cfg) => {
            const kebabRegex = /(['"])(?:background-color|border-radius|font-size|z-index|box-shadow|line-height|letter-spacing)\1\s*:/g;
            let kebabMatch;
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
    scanRawTransformString(relPath, content, scriptRanges) {
        this.forEachTweenConfig(content, scriptRanges, (cfg) => {
            const rawTransformRegex = /\btransform\s*:\s*(['"`])(?:translate|rotate|scale|skew|matrix)[^'"`]*\1/i;
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
    scanSimultaneousOriginConflict(relPath, content, scriptRanges) {
        this.forEachTweenConfig(content, scriptRanges, (cfg) => {
            if (/\bsvgOrigin\s*:/i.test(cfg.text) && /\btransformOrigin\s*:/i.test(cfg.text)) {
                const { line, column } = getLineAndColumnAt(content, cfg.startOffset);
                this.addViolation({
                    ruleId: 'gsap-simultaneous-origin-conflict',
                    message: "Conflicto de orígenes SVG detectado: no declares 'svgOrigin' y 'transformOrigin' simultáneamente en el mismo tween.",
                    filePath: relPath,
                    line,
                    column,
                    severity: 'error'
                });
            }
        });
    }
    scanNamedTimerConstants(relPath, content) {
        const namedTimerRegex = this.getNamedTimerConstantsRegex();
        let m;
        while ((m = namedTimerRegex.exec(content)) !== null) {
            const valStr = m.slice(1).find(Boolean);
            if (!valStr || parseFloat(valStr) === 0)
                continue;
            const { line, column, lineText } = getLineAndColumnAt(content, m.index);
            if (/\/\/\s*(?:timer-ok|delay-ok):\s*\S+/i.test(lineText))
                continue;
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
    scanTimelineConstructorDuration(relPath, content) {
        const tlConstructorRegex = /\b(?:gsap\.)?timeline\s*\(\s*\{([^)]*)\}\s*\)/g;
        let m;
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
    scanLegacyEaseNames(relPath, content) {
        const legacyEaseRegex = /\b(?:Power[0-4]|Quad|Cubic|Quart|Quint|Strong|Linear|Sine|Expo|Circ|Back|Bounce|Elastic)\.(?:ease(?:In|Out|InOut)|easeNone)\b/g;
        let m;
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
    scanHighFrequencyTweens(relPath, content) {
        const hfListenerRegex = /\b\w+\.addEventListener\s*\(\s*['"](?:mousemove|pointermove|touchmove|wheel|scroll)['"]/g;
        let m;
        while ((m = hfListenerRegex.exec(content)) !== null) {
            const listenerChunk = content.slice(m.index, m.index + GSAP_TWEEN_CONFIG_SEARCH_WINDOW_CHARS);
            if (/\bgsap\.(?:to|from|fromTo)\s*\(/.test(listenerChunk)) {
                if (!/\/\/\s*(?:quickto-ok|listener-ok):\s*\S+/i.test(listenerChunk)) {
                    const { line, column } = getLineAndColumnAt(content, m.index);
                    this.addViolation({
                        ruleId: 'gsap-high-frequency-tween-creation',
                        message: "Creación de tween con 'gsap.to()' dentro de listener continuo. En 'mousemove', etc. usa 'gsap.quickTo()'.",
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
//# sourceMappingURL=validate_gsap_animations.js.map