/**
 * packages/auditor/src/suites/architecture/validate_css_duplicates.ts
 *
 * CSS & SCSS HYGIENE AND DUPLICATION AUDITOR (Node.js 26+ Native)
 *
 * Powered by Stylelint engine with Vue SFC and SCSS support.
 * Serves as standard auditor suite and backwards-compatible alias for validate_stylelint.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* src/suites/architecture/validate_css_duplicates.ts
 *   npm run validate:css-duplicates
 */
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { StylelintAuditor } from "./validate_stylelint.js";
enableCompileCache();
export const CSS_DUPLICATES_RULES = [
    'stylelint-issue',
    'css-duplicate-selectors',
    'css-duplicate-properties',
    'css-empty-blocks',
    'css-order-violation',
    'scss-syntax-issue',
    'wallace-complexity'
];
export class CssDuplicatesAuditor extends BaseAuditor {
    stylelintAuditor;
    constructor(_targetDir = '.', projectRoot) {
        const config = getAuditConfig(projectRoot);
        const roots = config.paths.srcRoots ?? ['src'];
        super({
            id: 'validate_css_duplicates',
            name: 'CSS Duplication & Hygiene Validator',
            description: 'Audita calidad, sintaxis y patrones CSS/SCSS con Stylelint',
            family: 'architecture',
            ruleIds: CSS_DUPLICATES_RULES,
            packageName: 'Stylelint',
            icon: '🎨',
            ruleDescriptions: {
                'stylelint-issue': 'Violación de estándar CSS o SCSS',
                'css-duplicate-selectors': 'Selectores duplicados en el bloque',
                'css-duplicate-properties': 'Propiedades duplicadas en la regla',
                'css-empty-blocks': 'Bloques de estilos vacíos',
                'css-order-violation': 'Orden de propiedades CSS',
                'scss-syntax-issue': 'Sintaxis SCSS inválida o desconocida',
                'wallace-complexity': 'Complejidad de estilos excesiva'
            },
            roots,
            projectRoot
        });
        this.stylelintAuditor = new StylelintAuditor({
            projectRoot,
            id: 'validate_css_duplicates',
            name: 'CSS Duplication & Hygiene Validator'
        });
    }
    async runAudit() {
        const res = await this.stylelintAuditor.execute();
        this.importAuditFindings(res.findings, 'stylelint-issue');
        this.filesScannedCount = this.stylelintAuditor.getFilesScanned();
    }
}
// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new CssDuplicatesAuditor());
//# sourceMappingURL=validate_css_duplicates.js.map