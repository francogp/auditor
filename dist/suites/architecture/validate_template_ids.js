/**
 * scripts/auditors/architecture/validate_template_ids.ts
 *
 * TEMPLATE STATIC ID INTEGRITY & COLLISION AUDITOR (Node.js 26+ Native)
 *
 * Enforces HTML/DOM uniqueness and E2E locator predictability across all Vue components:
 *   1. Duplicate Static ID within Component (`template-duplicate-static-id`):
 *      Forbids having two elements with the exact same static `id="..."` attribute
 *      inside the same `<template>` block.
 *   2. Shared Generic Static IDs Across Components (`template-shared-static-id`):
 *      Detects collision-prone static IDs reused across different components (e.g.
 *      `id="close-btn"`, `id="confirm-btn"`). Components should namespace their IDs
 *      (e.g. `id="rename-modal-close-btn"`) to prevent DOM collisions and Playwright
 *      locator ambiguity.
 *
 * Escape Hatches:
 *   `<!-- id-ok -->`, `// id-ok`, `// template-ok`
 *
 * Usage:
 *   npm run validate:template-ids
 */
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { FileScanAuditor, BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
enableCompileCache();
export const TEMPLATE_ID_RULES = [
    'template-duplicate-static-id',
    'template-shared-static-id',
    'template-missing-input-id'
];
// Match static HTML id attributes: id="some-id" or id='some-id' (strictly preceded by whitespace or tag open)
const STATIC_ID_REGEX = /(?:^|[\s<])id\s*=\s*["']([^"'\s>]+)["']/g;
// Match start of interactive form controls: <input, <select, <textarea
const FORM_CONTROL_TAG_START_REGEX = /<(input|select|textarea)\b/gi;
function extractFullTag(content, startIndex) {
    let inQuote = null;
    for (let i = startIndex; i < content.length; i++) {
        const char = content[i];
        if (inQuote) {
            if (char === inQuote) {
                inQuote = null;
            }
        }
        else if (char === '"' || char === "'") {
            inQuote = char;
        }
        else if (char === '>') {
            return {
                tag: content.substring(startIndex, i + 1),
                endIndex: i + 1
            };
        }
    }
    return null;
}
function scanTemplateStaticIds(ctx) {
    const intraMap = new Map();
    let match;
    STATIC_ID_REGEX.lastIndex = 0;
    while ((match = STATIC_ID_REGEX.exec(ctx.templateContent)) !== null) {
        const id = match[1];
        if (!id)
            continue;
        const info = ctx.auditor.getMatchLineInfo(ctx.content, ctx.lines, ctx.templateStartOffset + match.index);
        if (info.isIgnored)
            continue;
        const occurrence = {
            file: ctx.relPath,
            line: info.lineNumber,
            context: info.lineContent.trim()
        };
        if (!intraMap.has(id)) {
            intraMap.set(id, occurrence);
        }
        else {
            const first = intraMap.get(id);
            ctx.auditor.addViolation({
                ruleId: 'template-duplicate-static-id',
                severity: 'error',
                file: ctx.relPath,
                line: info.lineNumber,
                message: `Duplicate static id '${id}' found within the same component template (previously defined at line ${first.line}).`,
                context: info.lineContent.trim()
            });
        }
        if (!ctx.globalIdMap.has(id)) {
            ctx.globalIdMap.set(id, [occurrence]);
        }
        else {
            ctx.globalIdMap.get(id).push(occurrence);
        }
    }
}
function scanTemplateFormControlIds(ctx) {
    FORM_CONTROL_TAG_START_REGEX.lastIndex = 0;
    let formMatch;
    while ((formMatch = FORM_CONTROL_TAG_START_REGEX.exec(ctx.templateContent)) !== null) {
        const tagType = (formMatch[1] ?? 'input').toLowerCase();
        const tagInfo = extractFullTag(ctx.templateContent, formMatch.index);
        if (!tagInfo)
            continue;
        const tagFull = tagInfo.tag;
        // Non-interactive hidden inputs do not require interactive IDs or labels
        if (tagType === 'input' && /\btype\s*=\s*["']hidden["']/i.test(tagFull)) {
            continue;
        }
        // Match static id, dynamic :id, or v-bind:id with quotes containing any valid expression/string
        const hasId = /\b(?:v-bind:id|:id|id)\s*=\s*(?:"[^"]*"|'[^']*')/i.test(tagFull);
        const info = ctx.auditor.getMatchLineInfo(ctx.content, ctx.lines, ctx.templateStartOffset + formMatch.index);
        if (info.isIgnored)
            continue;
        if (!hasId) {
            ctx.auditor.addViolation({
                ruleId: 'template-missing-input-id',
                severity: 'error',
                file: ctx.relPath,
                line: info.lineNumber,
                message: `Control de formulario <${tagType}> carece de atributo id para automatización con Playwright y accesibilidad.`,
                context: info.lineContent.trim()
            });
        }
    }
}
export class TemplateIdAuditor extends FileScanAuditor {
    globalIdMap = new Map();
    requireInputIds;
    constructor(roots, options, projectRoot) {
        const config = getAuditConfig(projectRoot);
        const effectiveRoots = roots ?? [
            ...(config.paths.componentsRoots ?? ['src/components']),
            ...(config.paths.viewsRoots ?? ['src/views'])
        ];
        super({
            id: 'validate_template_ids',
            name: 'Template Static ID Uniqueness & Collision Validator',
            description: 'Verifica IDs estáticos e inputs en templates Vue',
            family: 'architecture',
            ruleIds: TEMPLATE_ID_RULES,
            packageName: 'Template',
            configKey: 'templates.requireInputIds',
            defaultConfig: { enabled: true, requireInputIds: true },
            icon: '🆔',
            ruleDescriptions: {
                'template-duplicate-static-id': 'ID estático duplicado',
                'template-shared-static-id': 'ID compartido entre componentes',
                'template-missing-input-id': 'Control sin ID único'
            },
            roots: effectiveRoots,
            allowedExtensions: new Set(['.vue']),
            projectRoot
        });
        this.requireInputIds = options?.requireInputIds ?? config.templates?.requireInputIds ?? false;
    }
    getMatchLineInfo(content, lines, offset) {
        const lineNumber = content.slice(0, offset).split('\n').length;
        const lineContent = lines[lineNumber - 1] || '';
        const isIgnored = this.isLineIgnored(lineContent, ['id-ok', 'template-ok']);
        return { lineNumber, lineContent, isIgnored };
    }
    scanFile(relPath, content) {
        const templateMatch = content.match(/<template\b[^>]*>([\s\S]*?)<\/template>/i);
        if (!templateMatch || !templateMatch[1])
            return;
        const ctx = {
            content,
            lines: content.split('\n'),
            templateContent: templateMatch[1],
            templateStartOffset: templateMatch.index ?? 0,
            relPath,
            auditor: this,
            globalIdMap: this.globalIdMap
        };
        scanTemplateStaticIds(ctx);
        if (this.requireInputIds) {
            scanTemplateFormControlIds(ctx);
        }
    }
    checkSingleIdCollisions(id, occs) {
        const distinctFiles = Array.from(new Set(occs.map(o => o.file)));
        if (distinctFiles.length <= 1)
            return;
        const firstOcc = occs[0];
        const fileSummary = distinctFiles.slice(0, 3).map(f => path.basename(f)).join(', ') + (distinctFiles.length > 3 ? '...' : '');
        for (let i = 1; i < occs.length; i++) {
            const occ = occs[i];
            if (occ && firstOcc && occ.file !== firstOcc.file) {
                this.addViolation({
                    ruleId: 'template-shared-static-id',
                    severity: 'error',
                    file: occ.file,
                    line: occ.line,
                    message: `Static id '${id}' is shared across multiple components (${fileSummary}). Prefix with component name to avoid E2E locator collisions.`,
                    context: occ.context
                });
            }
        }
    }
    async runAudit() {
        await super.runAudit();
        for (const [id, occs] of this.globalIdMap.entries()) {
            this.checkSingleIdCollisions(id, occs);
        }
    }
}
// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new TemplateIdAuditor());
//# sourceMappingURL=validate_template_ids.js.map