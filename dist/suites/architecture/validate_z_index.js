/**
 * scripts/auditors/architecture/validate_z_index.ts
 *
 * Z-INDEX CONSISTENCY & CSS VARIABLE AUDITOR (Node.js 26+ Native)
 *
 * Validates 1:1 parity between canonical TypeScript Z_LAYERS and CSS variables
 * defined in src/styles/_base.scss.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* scripts/auditors/architecture/validate_z_index.ts
 *   npm run validate:z-index
 */
import fs from 'node:fs/promises';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig, resolveZLayersScssPath } from "../../core/auditConfig.js";
import { Z_LAYERS } from "./audit_rules.js";
enableCompileCache();
export const Z_INDEX_RULES = [
    'z-index-missing-var',
    'z-index-mismatch',
    'z-index-read-error'
];
function checkOrFixMissingVar(varName, value, content, isFixMode, errors, violations) {
    const msg = `Falta variable CSS '${varName}' (debe ser ${value})`;
    errors.push(msg);
    if (isFixMode && content.includes(':root {')) {
        return {
            updatedContent: content.replace(/}\s*$/, `  ${varName}: ${value};\n}\n`),
            wasModified: true
        };
    }
    violations.push({ ruleId: 'z-index-missing-var', message: msg, context: varName });
    return { updatedContent: content, wasModified: false };
}
function checkOrFixMismatchVar(varName, value, parsedValue, matchStr, regex, content, isFixMode, errors, violations) {
    if (parsedValue === value) {
        return { updatedContent: content, wasModified: false };
    }
    const msg = `Desincronización en '${varName}': TS=${value}, SCSS=${matchStr}`;
    errors.push(msg);
    if (isFixMode) {
        return {
            updatedContent: content.replace(regex, `${varName}: ${value}`),
            wasModified: true
        };
    }
    violations.push({ ruleId: 'z-index-mismatch', message: msg, context: `${varName}: ${matchStr}` });
    return { updatedContent: content, wasModified: false };
}
export function auditZIndexParity(scssContent, isFixMode, layers = Z_LAYERS) {
    let content = scssContent;
    let modified = false;
    const errors = [];
    const violations = [];
    for (const [key, value] of Object.entries(layers)) {
        const dashedKey = key.toLowerCase().replace(/_/g, '-');
        const varName = `--z-${dashedKey}`;
        const regex = new RegExp(`${varName}\\s*:\\s*(-?\\d+)\\b`);
        const match = content.match(regex);
        if (!match) {
            const res = checkOrFixMissingVar(varName, value, content, isFixMode, errors, violations);
            content = res.updatedContent;
            if (res.wasModified)
                modified = true;
        }
        else {
            const parsed = parseInt(match[1], 10);
            const res = checkOrFixMismatchVar(varName, value, parsed, match[1], regex, content, isFixMode, errors, violations);
            content = res.updatedContent;
            if (res.wasModified)
                modified = true;
        }
    }
    return { scssContent: content, modified, errors, violations };
}
export class ZIndexAuditor extends BaseAuditor {
    scssPath;
    isExplicit;
    constructor(scssPath) {
        super({
            id: 'validate_z_index',
            name: 'Z-Index Consistency Validator',
            description: 'Valida paridad entre Z_LAYERS (TS) y variables CSS (SCSS)',
            family: 'architecture',
            ruleIds: Z_INDEX_RULES,
            ruleDescriptions: {
                'z-index-missing-var': 'Z-Index: Falta variable en _base.scss',
                'z-index-mismatch': 'Z-Index: Desincronización TS vs SCSS',
                'z-index-read-error': 'Z-Index: Error al leer estilos base'
            }
        });
        const config = getAuditConfig();
        if (scssPath) {
            this.scssPath = scssPath;
            this.isExplicit = true;
        }
        else {
            this.scssPath = resolveZLayersScssPath(this.projectRoot);
            this.isExplicit = !!(config.styles?.zLayersScssFile ?? config.styles?.baseScssFile);
        }
    }
    async runAudit() {
        const config = getAuditConfig();
        if (!this.isExplicit && config.styles?.zLayersEnabled === false) {
            this.context.logStep(1, 1, 'Z-Layers deshabilitadas explícitamente en audit.config.ts (styles.zLayersEnabled: false). Omitiendo.');
            return;
        }
        if (!this.scssPath) {
            this.addViolation({
                ruleId: 'z-index-read-error',
                severity: 'error',
                file: 'audit.config.ts',
                line: 1,
                message: "Falta configuración de Z-Layers en audit.config.ts: no se encontró archivo SCSS. Defina 'styles.zLayersScssFile' apuntando a su archivo SCSS base, o configure explícitamente 'styles.zLayersEnabled: false' si este proyecto no utiliza capas Z de SCSS.",
                context: 'audit.config.ts'
            });
            return;
        }
        const isFixMode = this.isFixModeRequested();
        this.context.logStep(1, 1, 'Verificando paridad de variables Z-Index en _base.scss...');
        let scssContent;
        try {
            scssContent = await fs.readFile(this.scssPath, 'utf-8');
            this.filesScannedCount++;
        }
        catch (err) {
            this.addViolation({
                ruleId: 'z-index-read-error',
                severity: 'error',
                file: this.scssPath,
                line: 1,
                message: `Error leyendo _base.scss: ${err.message || String(err)}`,
                context: this.scssPath
            });
            return;
        }
        const result = auditZIndexParity(scssContent, isFixMode, Z_LAYERS);
        for (const v of result.violations) {
            this.addViolation({
                ruleId: v.ruleId,
                severity: 'error',
                file: this.scssPath,
                line: 1,
                message: v.message,
                context: v.context
            });
        }
        if (isFixMode && result.modified) {
            await fs.writeFile(this.scssPath, result.scssContent, 'utf-8');
        }
        this.context.setMetric('Total Layers Checked', Object.keys(Z_LAYERS).length);
        this.context.setMetric('Status', result.modified ? 'Auto-fixed' : 'Synced');
    }
}
// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ZIndexAuditor());
//# sourceMappingURL=validate_z_index.js.map