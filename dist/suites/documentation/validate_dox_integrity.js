/**
 * scripts/auditors/documentation/validate_dox_integrity.ts
 *
 * DOX & AGENTS.md HIERARCHY AND INTEGRITY AUDITOR (Node.js 26+ Native)
 *
 * Enforces documentation governance and link integrity across all AGENTS.md files:
 *   1. Verifies that every code directory contains an AGENTS.md file.
 *   2. Verifies that child AGENTS.md files are registered in their nearest parent index.
 *   3. Enforces relative links (forbids absolute paths).
 *   4. Verifies target files exist on disk (no broken links).
 *   5. Forbids linking to git-ignored files (.gitignore).
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/documentation/validate_dox_integrity.ts
 *   npm run validate:dox-integrity
 */
import { enableCompileCache } from 'node:module';
import { BaseAuditor, getEffectiveIgnoreDirs } from "../../core/auditorBase.js";
import { loadAuditConfig } from "../../core/auditConfig.js";
import { checkDoxIntegrity } from "../../analyzers/doxAnalyzer.js";
enableCompileCache();
export const DOX_RULES = [
    'dox-missing-agents-md',
    'dox-unregistered-child',
    'dox-absolute-link',
    'dox-broken-link',
    'dox-gitignore-target'
];
export class DoxIntegrityAuditor extends BaseAuditor {
    rootDir;
    constructor(rootDir) {
        const projectRoot = rootDir || process.cwd();
        super({
            id: 'validate_dox_integrity',
            name: 'DOX & AGENTS.md Integrity Validator',
            description: 'Valida jerarquía, enlaces e integridad de AGENTS.md',
            family: 'documentation',
            packageName: 'DOX',
            ruleIds: DOX_RULES,
            ruleDescriptions: {
                'dox-missing-agents-md': 'Falta AGENTS.md en directorio',
                'dox-unregistered-child': 'AGENTS.md hijo no registrado',
                'dox-absolute-link': 'Enlace con ruta absoluta',
                'dox-broken-link': 'Enlace roto a archivo inexistente',
                'dox-gitignore-target': 'Enlace a ruta ignorada en git'
            },
            projectRoot
        });
        this.rootDir = projectRoot;
    }
    async runAudit() {
        await loadAuditConfig(this.rootDir);
        const rawViolations = await checkDoxIntegrity(this.rootDir, getEffectiveIgnoreDirs());
        this.filesScannedCount = rawViolations.length > 0 ? rawViolations.length : 1;
        for (const v of rawViolations) {
            const ruleId = v.ruleId || 'dox-missing-agents-md';
            this.addViolation({
                ruleId,
                severity: v.severity || 'error',
                file: v.file,
                line: v.line || 1,
                message: v.message,
                context: v.context
            });
        }
        this.context.setMetric('Total Violations Found', rawViolations.length);
    }
}
if (process.argv[1] && (process.argv[1].endsWith('validate_dox_integrity.ts') ||
    (typeof import.meta.filename === 'string' && process.argv[1] === import.meta.filename))) {
    await BaseAuditor.runCli(new DoxIntegrityAuditor());
}
//# sourceMappingURL=validate_dox_integrity.js.map