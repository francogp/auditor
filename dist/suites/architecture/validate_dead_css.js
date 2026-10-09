/**
 * packages/auditor/src/suites/architecture/validate_dead_css.ts
 *
 * SCOPED DEAD CSS AUDITOR (Node.js 26+ Native)
 *
 * Enforces lean CSS bundles by detecting orphaned/unused classes inside <style scoped>
 * blocks of Vue components across src/components and src/views.
 *
 * Escape Hatch:
 *   // css-ok: <justification> or // dead-css-ok: <justification>
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_dead_css.ts
 *   npm run validate:dead-css
 */
import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { parseVueSfc } from "../../core/vueSfcParser.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
import { toPosixRelative } from "../../core/safePath.js";
enableCompileCache();
export const DEAD_CSS_RULES = [
    'dead-scoped-css'
];
export const DEFAULT_GLOBAL_UTILITY_CLASSES = new Set([
    'clickable', 'flex', 'hidden', 'active', 'disabled',
    'w-full', 'h-full', 'truncate', 'pointer-events-none', 'pointer-events-auto', 'select-none',
    'custom-scrollbar', 'empty-state', 'scrollable-content', 'modal-footer', 'emoji',
    'tabular-nums'
]);
export function getEffectiveGlobalUtilityClasses(projectRoot) {
    const config = getAuditConfig(projectRoot);
    const configured = config.styles?.globalUtilityClasses ?? [];
    return new Set([...DEFAULT_GLOBAL_UTILITY_CLASSES, ...configured]);
}
const VUE_TRANSITION_SUFFIXES = [
    '-enter-from',
    '-enter-active',
    '-enter-to',
    '-leave-from',
    '-leave-active',
    '-leave-to'
];
const EXCLUDED_EXTENSIONS = new Set(['scss', 'css', 'vue', 'png', 'webp']);
const MAX_PREV_COMMENT_LINES = 2;
export function extractClassNamesFromSelector(selector) {
    const classRegex = /(?:^|[^\w-])\.([a-z_-][\w-]*)/gi;
    const classes = [];
    let match;
    while ((match = classRegex.exec(selector)) !== null) {
        const className = match[1];
        if (className) {
            classes.push(className);
        }
    }
    return classes;
}
export function extractScopedRulesFromVueContent(rawContent) {
    const rules = [];
    const styleRegex = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
    let match;
    while ((match = styleRegex.exec(rawContent)) !== null) {
        const attrs = match[1] ?? '';
        if (!/\bscoped\b/i.test(attrs))
            continue;
        const preContent = rawContent.slice(0, match.index);
        const startLine = preContent.split('\n').length;
        const body = match[2] ?? '';
        const lines = body.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/(?:^|[^\w-])\.[a-z_-][\w-]*/i.test(line)) {
                const colonIdx = line.indexOf(':');
                const dotIdx = line.indexOf('.');
                if (colonIdx === -1 || colonIdx > dotIdx) {
                    rules.push({
                        line: startLine + i,
                        selector: line.trim(),
                        rawBlock: line
                    });
                }
            }
        }
    }
    return rules;
}
function collectGlobalCodeTokens(projectRoot, srcFiles) {
    const globalTokens = new Set();
    for (const relPath of srcFiles) {
        if (isTestPath(relPath))
            continue;
        const fullPath = path.resolve(projectRoot, relPath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const contentWithoutStyles = content.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
        const words = contentWithoutStyles.match(/[\w-]{2,}/g);
        if (words) {
            for (const w of words)
                globalTokens.add(w);
        }
    }
    return globalTokens;
}
function extractComponentLogic(rawContent) {
    const sfc = parseVueSfc(rawContent);
    const templateContent = sfc.template?.content ?? '';
    const scriptsContent = sfc.scripts.map(s => s.content).join('\n');
    const componentLogic = `${templateContent}\n${scriptsContent}`;
    const dynamicPrefixes = new Set();
    const dynamicClassRegex = /`([\w-]+-)\$\{/g;
    let dynMatch;
    while ((dynMatch = dynamicClassRegex.exec(componentLogic)) !== null) {
        if (dynMatch[1])
            dynamicPrefixes.add(dynMatch[1]);
    }
    const concatPrefixRegex = /['"]([\w-]+-)['"]\s*\+/g;
    while ((dynMatch = concatPrefixRegex.exec(componentLogic)) !== null) {
        if (dynMatch[1])
            dynamicPrefixes.add(dynMatch[1]);
    }
    return { componentLogic, dynamicPrefixes };
}
function isClassExempt(className, globalUtilityClasses, dynamicPrefixes) {
    if (globalUtilityClasses.has(className))
        return true;
    if (VUE_TRANSITION_SUFFIXES.some(suffix => className.endsWith(suffix)))
        return true;
    if (Array.from(dynamicPrefixes).some(prefix => className.startsWith(prefix)))
        return true;
    return false;
}
function isRuleExemptByComments(rule, contentLines) {
    if (rule.rawBlock.includes('css-ok') || rule.rawBlock.includes('dead-css-ok'))
        return true;
    const lineIdx = rule.line - 1;
    const blockLineCount = rule.rawBlock.split('\n').length;
    const endLineIdx = lineIdx + blockLineCount;
    const surroundingLines = contentLines.slice(Math.max(0, lineIdx - MAX_PREV_COMMENT_LINES), endLineIdx);
    return surroundingLines.some(l => l.includes('css-ok') || l.includes('dead-css-ok'));
}
function auditSingleRuleClasses(rule, params, dynamicPrefixes, componentLogic) {
    let count = 0;
    const classNames = extractClassNamesFromSelector(rule.selector);
    for (const className of classNames) {
        if (EXCLUDED_EXTENSIONS.has(className) || isClassExempt(className, params.globalUtilityClasses, dynamicPrefixes)) {
            continue;
        }
        count++;
        if (!componentLogic.includes(className) && !params.globalTokens.has(className)) {
            params.auditor.addViolation({
                ruleId: 'dead-scoped-css',
                severity: 'error',
                file: params.relFile,
                line: rule.line,
                message: `Clase CSS scoped '.${className}' es código muerto (huérfana): no se encuentra en el componente ni en el código de la aplicación.`,
                context: className
            });
        }
    }
    return count;
}
function auditComponentScopedCss(params) {
    const { componentLogic, dynamicPrefixes } = extractComponentLogic(params.rawContent);
    const contentLines = params.rawContent.split('\n');
    let checkedCount = 0;
    for (const rule of params.scopedRules) {
        if (isRuleExemptByComments(rule, contentLines))
            continue;
        checkedCount += auditSingleRuleClasses(rule, params, dynamicPrefixes, componentLogic);
    }
    return checkedCount;
}
export class DeadCssAuditor extends BaseAuditor {
    constructor(projectRoot = process.cwd()) {
        super({
            id: 'validate_dead_css',
            name: 'Scoped Dead CSS Auditor',
            description: 'Detecta clases CSS scoped huérfanas en componentes Vue',
            family: 'architecture',
            ruleIds: DEAD_CSS_RULES,
            packageName: 'CSS',
            configKey: 'styles.enabled',
            defaultConfig: { enabled: true },
            icon: '💀',
            ruleDescriptions: {
                'dead-scoped-css': 'Clase scoped huérfana sin uso'
            },
            coverage: {
                include: ['src/components/**/*.vue', 'src/views/**/*.vue']
            },
            projectRoot
        });
    }
    async runAudit() {
        const config = getAuditConfig(this.projectRoot);
        const globalUtilityClasses = getEffectiveGlobalUtilityClasses(this.projectRoot);
        const srcRoots = config.paths.srcRoots ?? ['src'];
        const allSrcFiles = await this.context.collectFiles(srcRoots, new Set(['.ts', '.vue', '.json']));
        const globalTokens = collectGlobalCodeTokens(this.projectRoot, allSrcFiles);
        const compRoots = [
            ...(config.paths.componentsRoots ?? ['src/components']),
            ...(config.paths.viewsRoots ?? ['src/views'])
        ];
        const componentFiles = await this.context.collectFiles(compRoots, new Set(['.vue']));
        if (componentFiles.length === 0) {
            this.markRuleNotApplicable('dead-scoped-css', 'No se encontraron componentes .vue en el proyecto');
        }
        let scopedClassesChecked = 0;
        for (const relPath of componentFiles) {
            if (isTestPath(relPath))
                continue;
            const fullPath = path.resolve(this.projectRoot, relPath);
            const relFile = toPosixRelative(this.projectRoot, fullPath);
            this.recordScanned(relFile);
            this.markRuleEvaluated('dead-scoped-css');
            const rawContent = fs.readFileSync(fullPath, 'utf-8');
            const scopedRules = extractScopedRulesFromVueContent(rawContent);
            scopedClassesChecked += auditComponentScopedCss({
                rawContent,
                relFile,
                scopedRules,
                globalTokens,
                globalUtilityClasses,
                auditor: this
            });
        }
        this.context.setMetric('Components Scanned', this.filesScannedCount);
        this.context.setMetric('Scoped Classes', scopedClassesChecked);
    }
}
// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new DeadCssAuditor());
//# sourceMappingURL=validate_dead_css.js.map