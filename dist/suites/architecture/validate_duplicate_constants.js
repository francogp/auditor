/**
 * scripts/auditors/architecture/validate_duplicate_constants.ts
 *
 * CROSS-MODULE DUPLICATE CONSTANTS AUDITOR (Node.js 26+ Native)
 *
 * Employs TypeScript AST analysis via SharedAstContext to detect duplicate
 * constant declarations across independent modules in src/.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_duplicate_constants.ts
 *   npm run validate:duplicate-constants
 */
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { detectDuplicateConstants } from "../../analyzers/constantAnalyzer.js";
enableCompileCache();
export const DUPLICATE_CONSTANTS_RULES = [
    'duplicate-constant-identical',
    'duplicate-constant-divergent'
];
export class DuplicateConstantsAuditor extends BaseAuditor {
    constructor(options = {}) {
        const projectRoot = options.projectRoot ?? process.cwd();
        const config = getAuditConfig(projectRoot);
        const effectiveRoots = options.roots ?? config.paths.srcRoots ?? ['src'];
        super({
            capabilities: { ast: true },
            id: 'validate_duplicate_constants',
            name: 'Duplicate Constants Validator',
            description: 'Detecta constantes duplicadas entre módulos usando AST',
            family: 'architecture',
            ruleIds: DUPLICATE_CONSTANTS_RULES,
            packageName: 'Constantes',
            icon: '🔢',
            ruleDescriptions: {
                'duplicate-constant-identical': 'Constante idéntica duplicada',
                'duplicate-constant-divergent': 'Constante dispar entre módulos'
            },
            coverage: {
                include: ['src/**/*.ts', 'src/**/*.vue']
            },
            requiresAst: true,
            roots: effectiveRoots,
            allowedExtensions: new Set(['.ts', '.vue']),
            projectRoot
        });
    }
    async runAudit(astContext) {
        const relFiles = await this.context.collectFiles(this.roots, this.allowedExtensions);
        const absFiles = relFiles
            .filter(f => !f.includes('.spec.') && !f.includes('.test.') && !f.includes('.d.ts'))
            .map(f => path.resolve(this.projectRoot, f));
        if (absFiles.length === 0) {
            this.markRuleNotApplicable('duplicate-constant-identical', 'No se encontraron archivos de código fuente');
            this.markRuleNotApplicable('duplicate-constant-divergent', 'No se encontraron archivos de código fuente');
        }
        else {
            for (const absFile of absFiles) {
                this.recordScanned(absFile);
                this.markRuleEvaluated('duplicate-constant-identical');
                this.markRuleEvaluated('duplicate-constant-divergent');
            }
        }
        const rawViolations = await detectDuplicateConstants(absFiles, astContext, this.projectRoot);
        for (const v of rawViolations) {
            const isIdentical = v.message.includes('idéntico');
            const ruleId = isIdentical
                ? 'duplicate-constant-identical'
                : 'duplicate-constant-divergent';
            this.addViolation({
                ruleId,
                severity: v.severity || 'error',
                file: v.file,
                line: v.line || 1,
                message: v.message,
                context: v.context
            });
        }
        this.context.setMetric('Total Archivos Analizados', absFiles.length);
        this.context.setMetric('Violaciones Encontradas', rawViolations.length);
    }
}
if (process.argv[1] && (process.argv[1].endsWith('validate_duplicate_constants.ts') ||
    (typeof import.meta.filename === 'string' && process.argv[1] === import.meta.filename))) {
    await BaseAuditor.runCli(new DuplicateConstantsAuditor());
}
//# sourceMappingURL=validate_duplicate_constants.js.map