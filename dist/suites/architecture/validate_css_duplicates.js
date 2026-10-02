/**
 * scripts/auditors/architecture/validate_css_duplicates.ts
 *
 * CSS & SCSS DUPLICATION AUDITOR (Node.js 26+ Native)
 *
 * Audits stylesheets, component styles, and Vue SFC style blocks using css-checker
 * to detect duplicated CSS rules, selectors, and redundant styles.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* --allow-child-process scripts/auditors/architecture/validate_css_duplicates.ts
 *   npm run validate:css-duplicates
 */
import { enableCompileCache } from 'node:module';
import { BaseAuditor, CANONICAL_IGNORE_DIRS } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { runCssChecker } from "../../analyzers/cssAnalyzer.js";
enableCompileCache();
export const CSS_DUPLICATES_RULES = [
    'css-duplicate-rules',
    'css-checker-missing'
];
export class CssDuplicatesAuditor extends BaseAuditor {
    targetDir;
    constructor(targetDir = '.', projectRoot) {
        const config = getAuditConfig(projectRoot);
        super({
            id: 'validate_css_duplicates',
            name: 'CSS Duplication Validator',
            description: 'Detecta clases y reglas CSS/SCSS duplicadas con css-checker',
            family: 'architecture',
            ruleIds: CSS_DUPLICATES_RULES,
            packageName: 'CSS',
            ruleDescriptions: {
                'css-duplicate-rules': 'Reglas duplicadas en estilos',
                'css-checker-missing': 'Herramienta css-checker ausente'
            },
            roots: config.paths.srcRoots ?? ['src'],
            projectRoot
        });
        this.targetDir = targetDir;
    }
    async runAudit() {
        this.context.logStep(1, 1, 'Ejecutando análisis de css-checker (SCSS/CSS duplicados)...');
        const rawViolations = await runCssChecker(this.targetDir, new Set(CANONICAL_IGNORE_DIRS));
        this.filesScannedCount = 1;
        for (const v of rawViolations) {
            const isMissing = v.message.includes('no está disponible') || v.message.includes('Aviso ejecutando css-checker');
            const ruleId = isMissing ? 'css-checker-missing' : 'css-duplicate-rules';
            this.addViolation({
                ruleId,
                severity: v.severity || 'error',
                file: v.file,
                line: v.line || 1,
                message: v.message,
                context: v.context
            });
        }
        this.context.setMetric('Violaciones Detectadas', rawViolations.length);
    }
}
if (process.argv[1] && (process.argv[1].endsWith('validate_css_duplicates.ts') ||
    (typeof import.meta.filename === 'string' && process.argv[1] === import.meta.filename))) {
    await BaseAuditor.runCli(new CssDuplicatesAuditor());
}
//# sourceMappingURL=validate_css_duplicates.js.map