/**
 * scripts/auditors/architecture/validate_vue_sfc_hygiene.ts
 *
 * VUE SFC & SCRIPT SETUP HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Enforces Vue 3 Composition API & Single File Component architecture rules (vue-best-practices):
 *   1. Script Setup Required (`script-setup-required`):
 *      Components in `src/components/` and `src/views/` must use `<script setup lang="ts">`.
 *      Options API (`export default { ... }`) is strictly forbidden.
 *   2. No Script Setup Exports (`no-script-setup-exports`):
 *      `<script setup>` cannot contain ES module exports (`export const`, `export type`,
 *      `export interface`). Shared contracts must be extracted to companion `*Types.ts` files.
 *   3. Vue Template Quote Escaping (`vueTemplateQuoteEscaping`):
 *      Prohibits unescaped inner double quotes inside double-quoted template attribute bindings
 *      (e.g. `:alt="tier?.name || "Bronce""`), which break Vite parsing.
 *   4. No Heavy Data Providers in Templates (`no-data-provider-in-template`):
 *      Prohibits invoking heavy database data providers (e.g. `dataProvider.get...()`)
 *      directly inside `<template>` render expressions.
 *
 * Escape Hatches:
 *   `// sfc-ok: <reason>`, `// template-ok: <reason>`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_vue_sfc_hygiene.ts
 */
import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { parseVueSfcBlocks } from "../../core/vueSfcParser.js";
enableCompileCache();
export const VUE_SFC_HYGIENE_RULES = [
    'script-setup-required',
    'no-script-setup-exports',
    'vue-template-quote-escaping',
    'no-data-provider-in-template',
    'vue-template-magic-calculation'
];
export const SCRIPT_TAG_CONTEXT_MAX_CHARS = 80;
const OPTIONS_API_EXPORT_REGEX = /export\s+default\s*\{/g;
const SCRIPT_TAG_REGEX = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const SCRIPT_SETUP_EXPORT_REGEX = /^\s*export\s+(?:const|let|var|function|type|interface|class|enum)\b/gm;
const TEMPLATE_QUOTE_ESCAPE_REGEX = /(?:\s:|\bv-bind:)[\w-]+="[^"\n]*\\"[^"\n]*"|(?:\s:|\bv-bind:)[\w-]+="[^"\n]*"[\w$]/;
export const DEFAULT_DATA_PROVIDER_IN_TEMPLATE_REGEX = /\{\{[^}]*\b(?:\w*DataProvider|dataProvider)\.\w+\s*\(/g;
const MULT_DIV_MOD_REGEX = /[*/%]\s*\d+(?:\.\d+)?|\b\d+(?:\.\d+)?\s*[*/%]/;
const COMPARISON_REGEX = /(?:===|!==|==|!=|<=|>=|<|>)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:===|!==|==|!=|<=|>=|<|>)/g;
const ADD_SUB_REGEX = /(?:\+|-)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:\+|-)/g;
function checkMultDivMod(code) {
    const m = MULT_DIV_MOD_REGEX.exec(code);
    return m ? m[0].trim() : null;
}
function checkMagicComparison(code) {
    const compRegex = new RegExp(COMPARISON_REGEX.source, COMPARISON_REGEX.flags);
    let compMatch;
    while ((compMatch = compRegex.exec(code)) !== null) {
        const val = Number(compMatch[1] ?? compMatch[2]);
        if (val !== 0 && val !== 1) {
            return compMatch[0].trim();
        }
    }
    return null;
}
function checkMagicAddSub(code) {
    const addRegex = new RegExp(ADD_SUB_REGEX.source, ADD_SUB_REGEX.flags);
    let addMatch;
    while ((addMatch = addRegex.exec(code)) !== null) {
        const val = Number(addMatch[1] ?? addMatch[2]);
        if (val > 1) {
            return addMatch[0].trim();
        }
    }
    return null;
}
function detectTemplateMagicCalculation(expression) {
    const trimmed = expression.trim();
    if (!trimmed || !/\d/.test(trimmed))
        return null;
    if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed))
        return null;
    const codeOnly = trimmed.replace(/'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`[\s\S]*?`/g, match => ' '.repeat(match.length));
    return checkMultDivMod(codeOnly) ?? checkMagicComparison(codeOnly) ?? checkMagicAddSub(codeOnly);
}
function resolveVueSfcScanRoots(roots, projectRoot) {
    if (roots)
        return roots;
    const cfg = getAuditConfig(projectRoot);
    return [...(cfg.paths.componentsRoots ?? ['src/components']), ...(cfg.paths.viewsRoots ?? ['src/views'])];
}
export class VueSfcHygieneAuditor extends FileScanAuditor {
    constructor(roots, projectRoot) {
        const sfcRoots = resolveVueSfcScanRoots(roots, projectRoot);
        super({
            roots: sfcRoots,
            projectRoot,
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
            id: 'validate_vue_sfc_hygiene',
            name: 'Vue SFC & Script Setup Hygiene Auditor',
            description: 'Verifica estándares de Vue SFC y <script setup lang="ts">',
            family: 'architecture',
            ruleIds: VUE_SFC_HYGIENE_RULES,
            packageName: 'Vue',
            configKey: 'paths',
            defaultConfig: {},
            icon: '💚',
            ruleDescriptions: {
                'script-setup-required': 'Componente sin script setup',
                'no-script-setup-exports': 'Export dentro de script setup',
                'vue-template-quote-escaping': 'Comillas sin escapar en template',
                'no-data-provider-in-template': 'Data provider en template',
                'vue-template-magic-calculation': 'Cálculo mágico en template Vue'
            },
            allowedExtensions: new Set(['.vue'])
        });
    }
    scanFile(relPath, content) {
        // 1. Audit Script Setup requirement and Options API prohibition
        this.markRuleEvaluated('script-setup-required');
        this.auditScriptSetup(relPath, content);
        // 2. Audit exports inside <script setup>
        this.markRuleEvaluated('no-script-setup-exports');
        this.auditScriptSetupExports(relPath, content);
        // 3. Audit template quote escaping
        this.markRuleEvaluated('vue-template-quote-escaping');
        this.auditTemplateQuoteEscaping(relPath, content);
        // 4. Audit data provider calls in template (scanRegexMatches auto-marks 'no-data-provider-in-template')
        this.auditDataProviderInTemplate(relPath, content);
        // 5. Audit magic calculations and comparisons in template expressions
        this.markRuleEvaluated('vue-template-magic-calculation');
        this.auditTemplateMagicCalculation(relPath, content);
    }
    auditScriptSetup(relPath, content) {
        // Options API detection
        let match;
        const optionsRegex = new RegExp(OPTIONS_API_EXPORT_REGEX.source, OPTIONS_API_EXPORT_REGEX.flags);
        while ((match = optionsRegex.exec(content)) !== null) {
            const line = this.getLineNumber(content, match.index);
            const lineContent = this.getLineAt(content, line);
            if (this.hasEscapeHatch(lineContent, ['sfc-ok'])) {
                continue;
            }
            this.addViolation({
                ruleId: 'script-setup-required',
                severity: 'error',
                file: relPath,
                line,
                message: `Options API export default detected. Project mandates Vue 3 Composition API with '<script setup lang="ts">'.`,
                context: lineContent.trim()
            });
        }
        // Check if component has any script tags, and if none has 'setup'
        const scriptMatches = [...content.matchAll(new RegExp(SCRIPT_TAG_REGEX.source, SCRIPT_TAG_REGEX.flags))];
        if (scriptMatches.length > 0) {
            const hasSetup = scriptMatches.some(m => /\bsetup\b/.test(m[1] ?? ''));
            if (!hasSetup) {
                const firstScriptLine = this.getLineNumber(content, scriptMatches[0]?.index ?? 0);
                const lineContent = this.getLineAt(content, firstScriptLine);
                if (!this.hasEscapeHatch(lineContent, ['sfc-ok']) && !this.hasEscapeHatch(content, ['sfc-ok'])) {
                    this.addViolation({
                        ruleId: 'script-setup-required',
                        severity: 'error',
                        file: relPath,
                        line: 1,
                        message: `Component has <script> but lacks 'setup'. All Vue components must use '<script setup lang="ts">'.`,
                        context: scriptMatches[0][0].slice(0, SCRIPT_TAG_CONTEXT_MAX_CHARS)
                    });
                }
            }
        }
    }
    auditScriptSetupExports(relPath, content) {
        const scriptMatches = [...content.matchAll(new RegExp(SCRIPT_TAG_REGEX.source, SCRIPT_TAG_REGEX.flags))];
        for (const sMatch of scriptMatches) {
            const attrs = sMatch[1] ?? '';
            if (!/\bsetup\b/.test(attrs))
                continue;
            const scriptBody = sMatch[2] ?? '';
            const scriptStartIndex = sMatch.index ?? 0;
            let expMatch;
            const expRegex = new RegExp(SCRIPT_SETUP_EXPORT_REGEX.source, SCRIPT_SETUP_EXPORT_REGEX.flags);
            while ((expMatch = expRegex.exec(scriptBody)) !== null) {
                const fullIndex = scriptStartIndex + expMatch.index;
                const line = this.getLineNumber(content, fullIndex);
                const lineContent = this.getLineAt(content, line);
                if (this.hasEscapeHatch(lineContent, ['sfc-ok'])) {
                    continue;
                }
                this.addViolation({
                    ruleId: 'no-script-setup-exports',
                    severity: 'error',
                    file: relPath,
                    line,
                    message: `Illegal export inside <script setup>. Extract shared contracts to companion *Types.ts files or keep local symbols unexported.`,
                    context: lineContent.trim()
                });
            }
        }
    }
    extractTemplateBlock(content) {
        const parsed = parseVueSfcBlocks(content);
        if (!parsed.template)
            return null;
        return {
            templateContent: parsed.template.rawBlock,
            templateStartIndex: parsed.template.startIndex
        };
    }
    auditTemplateQuoteEscaping(relPath, content) {
        const template = this.extractTemplateBlock(content);
        if (!template)
            return;
        const { templateContent, templateStartIndex } = template;
        // Scan lines for patterns like :attr="foo || "bar""
        const lines = templateContent.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const lineText = lines[i];
            // Detect unescaped double quotes inside attribute value
            if (TEMPLATE_QUOTE_ESCAPE_REGEX.test(lineText)) {
                const line = this.getLineNumber(content, templateStartIndex) + i;
                if (this.hasEscapeHatch(lineText, ['template-ok', 'sfc-ok'])) {
                    continue;
                }
                this.addViolation({
                    ruleId: 'vue-template-quote-escaping',
                    severity: 'error',
                    file: relPath,
                    line,
                    message: `Unescaped double quotes detected inside template attribute binding. Use single quotes for inner string literals.`,
                    context: lineText.trim()
                });
            }
        }
    }
    extractDynamicExpressions(templateContent) {
        // 1. Mask HTML comments with whitespace to preserve character indices
        const masked = templateContent.replace(/<!--[\s\S]*?-->/g, match => ' '.repeat(match.length));
        const results = [];
        // 2. Extract mustache interpolations: {{ ... }}
        const interpolationRegex = /\{\{([\s\S]*?)\}\}/g;
        let m;
        while ((m = interpolationRegex.exec(masked)) !== null) {
            const inner = m[1] ?? '';
            results.push({
                expression: inner,
                offsetInTemplate: m.index + 2
            });
        }
        // 3. Extract dynamic directives in tag attributes: :prop="...", v-bind:prop="...", v-if="...", @event="...", etc.
        const directiveRegex = /(?:v-[\w.:-]+|:[\w.-]+|@[\w.-]+)\s*=\s*(["'])([\s\S]*?)\1/g;
        while ((m = directiveRegex.exec(masked)) !== null) {
            const fullMatch = m[0];
            const inner = m[2] ?? '';
            const quoteChar = m[1] ?? '"';
            const quoteIdx = fullMatch.indexOf(quoteChar);
            const offsetInTemplate = m.index + quoteIdx + 1;
            results.push({
                expression: inner,
                offsetInTemplate
            });
        }
        return results;
    }
    auditDataProviderInTemplate(relPath, content) {
        const template = this.extractTemplateBlock(content);
        if (!template)
            return;
        this.markRuleEvaluated('no-data-provider-in-template');
        const { templateContent, templateStartIndex } = template;
        const dynamicExpressions = this.extractDynamicExpressions(templateContent);
        const config = getAuditConfig(this.projectRoot);
        const customPatterns = config.templates?.forbiddenTemplateCallPatterns;
        const providerRegex = customPatterns && customPatterns.length > 0
            ? new RegExp(`\\b(?:${customPatterns.join('|')})`, 'i')
            : /\b\w*DataProvider\.\w+\s*\(/i;
        const prohibitedDb = config.persistence?.prohibitedTemplateIdentifiers?.length
            ? config.persistence.prohibitedTemplateIdentifiers
            : (config.persistence?.engine === 'none' ? [] : ['supabase', 'db']);
        const dbRegex = prohibitedDb.length > 0 ? new RegExp(`\\b(?:${prohibitedDb.join('|')})\\b`, 'i') : null;
        for (const { expression, offsetInTemplate } of dynamicExpressions) {
            // 1. Check heavy data providers (e.g. dataProvider.get...)
            const providerMatch = providerRegex.exec(expression);
            if (providerMatch) {
                const fullIndex = templateStartIndex + offsetInTemplate + providerMatch.index;
                this.reportTemplateViolation(relPath, content, fullIndex, `Direct call to heavy data provider inside template render loop. Move calls to computed properties or script helpers.`);
            }
            // 2. Check prohibited database client identifiers outside string literals
            if (dbRegex) {
                // Strip string literals inside expression to avoid matching strings like tab === 'db'
                const strippedExpression = expression.replace(/'(?:\\.|[^'])*'|"(?:\\.|[^"])*"/g, match => ' '.repeat(match.length));
                const dbMatch = dbRegex.exec(strippedExpression);
                if (dbMatch) {
                    const fullIndex = templateStartIndex + offsetInTemplate + dbMatch.index;
                    this.reportTemplateViolation(relPath, content, fullIndex, `Acceso directo a persistencia/base de datos detectado en template Vue. Cachea los datos con computed o acciones en <script>.`);
                }
            }
        }
    }
    auditTemplateMagicCalculation(relPath, content) {
        const template = this.extractTemplateBlock(content);
        if (!template)
            return;
        const { templateContent, templateStartIndex } = template;
        const dynamicExpressions = this.extractDynamicExpressions(templateContent);
        for (const { expression, offsetInTemplate } of dynamicExpressions) {
            const matchedSnippet = detectTemplateMagicCalculation(expression);
            if (!matchedSnippet)
                continue;
            const fullIndex = templateStartIndex + offsetInTemplate;
            const line = this.getLineNumber(content, fullIndex);
            const lineContent = this.getLineAt(content, line);
            if (!this.hasEscapeHatch(lineContent, ['template-ok', 'sfc-ok'])) {
                this.addViolation({
                    ruleId: 'vue-template-magic-calculation',
                    severity: 'error',
                    file: relPath,
                    line,
                    message: `Cálculo o comparación con número mágico en template Vue ('${matchedSnippet}'). Mueve la lógica a un 'computed()' en <script setup>.`,
                    context: lineContent.trim()
                });
            }
        }
    }
    reportTemplateViolation(relPath, content, fullIndex, message) {
        const line = this.getLineNumber(content, fullIndex);
        const lineContent = this.getLineAt(content, line);
        if (!this.hasEscapeHatch(lineContent, ['template-ok', 'sfc-ok'])) {
            this.addViolation({
                ruleId: 'no-data-provider-in-template',
                severity: 'error',
                file: relPath,
                line,
                message,
                context: lineContent.trim()
            });
        }
    }
}
// Standalone execution support
await BaseAuditor.runCliIfMain(import.meta.url, new VueSfcHygieneAuditor());
//# sourceMappingURL=validate_vue_sfc_hygiene.js.map