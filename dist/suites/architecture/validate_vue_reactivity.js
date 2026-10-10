/**
 * packages/auditor/src/suites/architecture/validate_vue_reactivity.ts
 *
 * VUE REACTIVITY & STATE HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Enforces Vue 3 Composition API reactivity rules (vue-best-practices):
 *   1. No Side Effects in Computed (`no-side-effects-in-computed`):
 *      Prohibits in-place mutations (.sort, .splice, .push, .pop, .reverse) and
 *      ref reassignments (.value = ) inside computed() property bodies.
 *   2. Watch Reactive Property Getter (`watch-reactive-property-getter`):
 *      Enforces getter function wrapper when watching reactive props (e.g. watch(() => props.foo))
 *      preventing silent reactivity loss on primitive properties.
 *   3. No Async in Computed (`no-async-in-computed`):
 *      Prohibits computed(async () => ...); computed cannot unwrap promises.
 *   4. No Destructured Reactive (`no-destructured-reactive`):
 *      Prohibits destructuring reactive() objects directly without toRefs().
 *      (Note: defineProps destructuring is permitted under Vue 3.5+ native compiler transform).
 *
 * Escape Hatch:
 *   // reactivity-ok: <reason>, // sfc-ok: <reason>
 */
import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { extractVueScriptOrRaw } from "../../core/vueSfcParser.js";
enableCompileCache();
export const VUE_REACTIVITY_RULES = [
    'no-side-effects-in-computed',
    'watch-reactive-property-getter',
    'no-async-in-computed',
    'no-destructured-reactive'
];
const ASYNC_COMPUTED_REGEX = /\bcomputed\s*\(\s*(?:<[^>]+>\s*)?async\s*(?:\([^)]*\)|[\w$]+)\s*=>/g;
const WATCH_PROP_NAKED_REGEX = /\bwatch\s*\(\s*(props\.[\w$]+(?:\.[\w$]+)*)\s*,/g;
const DESTRUCTURED_REACTIVE_REGEX = /const\s+\{[^}]+\}\s*=\s*reactive\s*(?:<[^>]+>\s*)?\(/g;
const DIRECT_REACTIVE_MUTATION_REGEX = /\b(?:(?:props|store)\.(?!value\b)[\w$]+(?:\.[\w$]+)*|[\w$]+\.value)\s*\??\.(?:sort|reverse|splice|push|pop|shift|unshift)\s*\(/g;
const LOCAL_IDENTIFIER_MUTATION_REGEX = /\b([\w$]+)\s*\??\.(sort|reverse|splice|push|pop|shift|unshift)\s*\(/g;
export class ValidateVueReactivityAuditor extends FileScanAuditor {
    constructor(roots, projectRoot) {
        const config = getAuditConfig(projectRoot);
        const effectiveRoots = roots ?? [
            ...(config.paths.componentsRoots ?? ['src/components']),
            ...(config.paths.viewsRoots ?? ['src/views']),
            'src/composables',
            'src/stores'
        ];
        super({
            capabilities: {
                fix: false,
                fixPriority: false,
                lint: true,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
            },
            id: 'validate_vue_reactivity',
            name: 'Vue Reactivity & State Hygiene Auditor',
            description: 'Verifica reactividad y pureza de Vue 3 Composition API',
            family: 'architecture',
            ruleIds: VUE_REACTIVITY_RULES,
            packageName: 'Vue',
            configKey: 'paths',
            defaultConfig: {},
            icon: '⚡',
            ruleDescriptions: {
                'no-side-effects-in-computed': 'Mutación o efecto secundario en computed',
                'watch-reactive-property-getter': 'Propiedad observada sin getter en watch',
                'no-async-in-computed': 'Función asíncrona dentro de computed',
                'no-destructured-reactive': 'Desestructuración de reactive() sin toRefs'
            },
            roots: effectiveRoots,
            allowedExtensions: new Set(['.vue', '.ts', '.js']),
            projectRoot
        });
    }
    scanFile(relPath, content) {
        const scriptContent = extractVueScriptOrRaw(relPath, content);
        if (!scriptContent)
            return;
        this.scanRegexMatches(scriptContent, ASYNC_COMPUTED_REGEX, relPath, 'no-async-in-computed', ['reactivity-ok', 'sfc-ok'], 'Asynchronous callback passed to computed(). computed cannot unwrap promises; use watchEffect or computedAsync from VueUse.', undefined, content);
        this.scanRegexMatches(scriptContent, WATCH_PROP_NAKED_REGEX, relPath, 'watch-reactive-property-getter', ['reactivity-ok', 'sfc-ok'], 'Watching reactive property directly as value instead of a getter. Use watch(() => props.prop, ...) to preserve reactivity.', undefined, content);
        this.scanRegexMatches(scriptContent, DESTRUCTURED_REACTIVE_REGEX, relPath, 'no-destructured-reactive', ['reactivity-ok', 'sfc-ok'], 'Destructuring reactive() object directly causes reactivity loss. Wrap with toRefs() before destructuring.', undefined, content);
        this.markRuleEvaluated('no-side-effects-in-computed');
        this.auditComputedSideEffects(relPath, content, scriptContent);
    }
    reportComputedViolation(relPath, fullContent, startIdx, needle, message) {
        const line = this.getLineNumber(fullContent, fullContent.indexOf(needle, startIdx));
        const lineContent = this.getLineAt(fullContent, line);
        if (this.hasEscapeHatch(lineContent, ['reactivity-ok', 'sfc-ok']))
            return;
        this.addViolation({
            ruleId: 'no-side-effects-in-computed',
            severity: 'error',
            file: relPath,
            line,
            message,
            context: lineContent.trim()
        });
    }
    auditDirectMutations(body, relPath, fullContent, startIdx) {
        const dirRegex = new RegExp(DIRECT_REACTIVE_MUTATION_REGEX.source, DIRECT_REACTIVE_MUTATION_REGEX.flags);
        let dirMatch;
        while ((dirMatch = dirRegex.exec(body)) !== null) {
            this.reportComputedViolation(relPath, fullContent, startIdx, dirMatch[0], `In-place mutation '${dirMatch[0].trim()}' detected inside computed(). Mutating reactive state, props, or stores creates side effects.`);
        }
    }
    evalLocalIdentifierMutation(targetVar, method, fullMatched, body) {
        const declRegex = new RegExp(`\\b(?:const|let|var)\\s+${targetVar}\\b([^;\\n]*)`);
        const declMatch = declRegex.exec(body);
        if (!declMatch) {
            return `In-place mutation '${fullMatched.trim()}' on external variable '${targetVar}' detected inside computed(). Create a shallow copy first.`;
        }
        const initExpr = declMatch[1] ?? '';
        const hasCloning = initExpr.includes('[...') || initExpr.includes('.slice(') || initExpr.includes('.filter(') ||
            initExpr.includes('.map(') || initExpr.includes('Array.from(') || initExpr.includes('new Array') ||
            initExpr.includes('[]') || body.includes(`${targetVar} = [...`) || body.includes(`${targetVar} = ${targetVar}.filter`);
        if (hasCloning || (!initExpr.includes('props.') && !initExpr.includes('.value') && !initExpr.includes('store.'))) {
            return null;
        }
        if (method === 'sort' || method === 'reverse') {
            return `In-place mutation '${fullMatched.trim()}' on aliased reactive state detected inside computed(). Create a shallow copy first (e.g. [...${targetVar}].${method}()).`;
        }
        if (method === 'push' || method === 'pop' || method === 'shift' || method === 'unshift' || method === 'splice') {
            return `In-place mutation '${fullMatched.trim()}' on aliased reactive state detected inside computed(). Create a shallow copy first.`;
        }
        return null;
    }
    auditLocalIdentifierMutations(body, relPath, fullContent, startIdx) {
        const locRegex = new RegExp(LOCAL_IDENTIFIER_MUTATION_REGEX.source, LOCAL_IDENTIFIER_MUTATION_REGEX.flags);
        let locMatch;
        while ((locMatch = locRegex.exec(body)) !== null) {
            const fullMatched = locMatch[0];
            const targetVar = locMatch[1];
            const method = locMatch[2];
            if (!targetVar || !method)
                continue;
            if (locMatch.index > 0 && body[locMatch.index - 1] === '.')
                continue;
            if (targetVar === 'props' || targetVar === 'store' || targetVar === 'value')
                continue;
            const violationMessage = this.evalLocalIdentifierMutation(targetVar, method, fullMatched, body);
            if (violationMessage) {
                this.reportComputedViolation(relPath, fullContent, startIdx, fullMatched, violationMessage);
            }
        }
    }
    auditRefAssignments(body, relPath, fullContent, startIdx) {
        const refAssignRegex = /\b[\w$]+\.value\s*=(?!=)/g;
        let refMatch;
        while ((refMatch = refAssignRegex.exec(body)) !== null) {
            this.reportComputedViolation(relPath, fullContent, startIdx, refMatch[0], `Mutation '${refMatch[0]}' detected inside computed(). Computed properties must be pure derivations without side effects.`);
        }
    }
    auditComputedSideEffects(relPath, fullContent, script) {
        const computedCallRegex = /\bcomputed\s*\(\s*(?:<[^>]+>\s*)?(?:\([^)]*\)|[\w$]+)\s*=>\s*\{/g;
        let compMatch;
        while ((compMatch = computedCallRegex.exec(script)) !== null) {
            const startIdx = compMatch.index + compMatch[0].length;
            const body = this.extractBalancedBlock(script, startIdx);
            if (!body)
                continue;
            this.auditDirectMutations(body, relPath, fullContent, startIdx);
            this.auditLocalIdentifierMutations(body, relPath, fullContent, startIdx);
            this.auditRefAssignments(body, relPath, fullContent, startIdx);
        }
    }
    extractBalancedBlock(text, startIndex) {
        let depth = 1;
        let i = startIndex;
        while (i < text.length && depth > 0) {
            const ch = text[i];
            if (ch === '{')
                depth++;
            else if (ch === '}')
                depth--;
            i++;
        }
        if (depth === 0) {
            return text.slice(startIndex, i - 1);
        }
        return null;
    }
}
// Standalone execution support
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateVueReactivityAuditor());
//# sourceMappingURL=validate_vue_reactivity.js.map