import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor, createUniformRuleCapabilities, LINT_RULE_CAPABILITIES } from "../../core/auditorBase.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { getAuditConfig } from "../../core/auditConfig.js";
enableCompileCache();
export const QUERY_PERFORMANCE_RULES = [
    'unindexed-foreign-keys',
    'select-star-in-queries',
    'unpaginated-queries',
    'n-plus-one-patterns',
    'heavy-count-queries',
    'unindexed-order-by'
];
const SCANNABLE_EXTS = new Set(['.ts', '.js', '.sql']);
export class ValidateQueryPerformanceAuditor extends FileScanAuditor {
    constructor(options = {}) {
        const effectiveRoot = options.projectRoot ?? process.cwd();
        const config = getAuditConfig(effectiveRoot);
        const migrationRoots = [config.paths?.migrationsDir, 'migrations', 'supabase/migrations'].filter((r) => typeof r === 'string' && r.length > 0);
        const targetRoots = options.roots ?? [
            ...(config.paths?.srcRoots ?? ['src']),
            ...migrationRoots
        ];
        super({
            id: 'validate_query_performance',
            name: 'Database Query & Index Performance Validator',
            description: 'Rendimiento de consultas SQL, índices y paginación',
            family: 'performance',
            packageName: 'DBQuery',
            icon: '⚡',
            configKey: 'queryPerformance.enabled',
            defaultConfig: { enabled: true },
            criticalConfig: {},
            roots: targetRoots,
            allowedExtensions: SCANNABLE_EXTS,
            ruleIds: QUERY_PERFORMANCE_RULES,
            ruleDescriptions: {
                'unindexed-foreign-keys': 'Clave foránea sin índice secundario',
                'select-star-in-queries': 'SELECT * en repositorio o servicio',
                'unpaginated-queries': 'Consulta sin LIMIT ni paginación',
                'n-plus-one-patterns': 'Consulta a base de datos en bucle',
                'heavy-count-queries': 'SELECT COUNT(*) sin filtro en tabla',
                'unindexed-order-by': 'Paginación con OFFSET alto'
            },
            ruleCapabilities: createUniformRuleCapabilities(QUERY_PERFORMANCE_RULES, LINT_RULE_CAPABILITIES),
            projectRoot: effectiveRoot,
            coverage: deriveCoverageFromRoots(targetRoots, SCANNABLE_EXTS, effectiveRoot)
        });
    }
    async runAudit() {
        if (this.isSuiteGatingDisabled('Rendimiento de consultas desactivado en config')) {
            return;
        }
        const config = getAuditConfig(this.projectRoot);
        if (config.persistence?.engine === 'none') {
            this.markSkipped('Persistencia configurada en none');
            for (const ruleId of this.ruleIds) {
                this.runSubAuditorSync(ruleId, () => {
                    this.markRuleNotApplicable(ruleId, 'Persistencia configurada en none; no aplica análisis de base de datos');
                });
            }
            return;
        }
        await super.runAudit();
    }
    scanFile(relPath, content) {
        this.runSubAuditorSync('unindexed-foreign-keys', () => {
            this.auditUnindexedForeignKeys(relPath, content);
        });
        this.runSubAuditorSync('select-star-in-queries', () => {
            this.auditSelectStarInQueries(relPath, content);
        });
        this.runSubAuditorSync('unpaginated-queries', () => {
            this.auditUnpaginatedQueries(relPath, content);
        });
        this.runSubAuditorSync('n-plus-one-patterns', () => {
            this.auditNPlusOnePatterns(relPath, content);
        });
        this.runSubAuditorSync('heavy-count-queries', () => {
            this.auditHeavyCountQueries(relPath, content);
        });
        this.runSubAuditorSync('unindexed-order-by', () => {
            this.auditUnindexedOrderBy(relPath, content);
        });
    }
    auditUnindexedForeignKeys(relPath, content) {
        if (content.includes('fk-index-ok'))
            return;
        if (!relPath.endsWith('.sql'))
            return;
        // Detect CREATE TABLE with foreign key references
        const fkInlineRegex = /(\w+)\s+[\w()]+\s+REFERENCES\s+(\w+)\s*\((\w+)\)/gi;
        let match;
        while ((match = fkInlineRegex.exec(content)) !== null) {
            const col = match[1];
            // Check if an index exists for this column in the same file or migration
            const hasIndex = new RegExp(`CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+[^;]*\\([^)]*\\b${col}\\b[^)]*\\)`, 'i').test(content);
            if (!hasIndex) {
                const line = this.getLineNumber(content, match.index);
                this.addViolation({
                    ruleId: 'unindexed-foreign-keys',
                    severity: 'error',
                    message: `Clave foránea en columna '${col}' sin índice secundario complementario`,
                    file: relPath,
                    line
                });
            }
        }
    }
    auditSelectStarInQueries(relPath, content) {
        if (content.includes('select-star-ok'))
            return;
        if (relPath.endsWith('.sql')) {
            const sqlSelectStarRegex = /\bSELECT\s+\*\s+FROM\b/gi;
            let match;
            while ((match = sqlSelectStarRegex.exec(content)) !== null) {
                const line = this.getLineNumber(content, match.index);
                this.addViolation({
                    ruleId: 'select-star-in-queries',
                    severity: 'error',
                    message: 'Uso de SELECT * en consulta SQL; proyectar columnas específicas',
                    file: relPath,
                    line
                });
            }
        }
        else {
            const ormSelectStarRegex = /\.select\(\s*['"]\*\s*['"]\s*\)/g;
            let match;
            while ((match = ormSelectStarRegex.exec(content)) !== null) {
                const line = this.getLineNumber(content, match.index);
                this.addViolation({
                    ruleId: 'select-star-in-queries',
                    severity: 'error',
                    message: "Uso de .select('*') en consulta ORM; proyectar columnas requeridas",
                    file: relPath,
                    line
                });
            }
        }
    }
    auditUnpaginatedQueries(relPath, content) {
        if (content.includes('unpaginated-ok'))
            return;
        if (relPath.endsWith('.sql'))
            return;
        // Detect client/ORM queries returning collection without limit, range, or single-row modifier
        const queryRegex = /(?:db|supabase)\.from\(['"][^'"]+['"]\)\.select\([^)]*\)/g;
        let match;
        while ((match = queryRegex.exec(content)) !== null) {
            // Look forward in the chained call expression (up to 200 chars or statement end)
            const statementEnd = content.indexOf(';', match.index);
            const limitIdx = statementEnd !== -1 ? Math.min(statementEnd, match.index + 250) : match.index + 250;
            const chainSlice = content.slice(match.index, limitIdx);
            const isConstrained = /\.(?:limit|range|single|maybeSingle|head|csv)\b/.test(chainSlice);
            if (!isConstrained) {
                const line = this.getLineNumber(content, match.index);
                this.addViolation({
                    ruleId: 'unpaginated-queries',
                    severity: 'error',
                    message: 'Consulta a colección de base de datos sin límite (.limit), rango (.range) o selector único (.single)',
                    file: relPath,
                    line
                });
            }
        }
    }
    auditNPlusOnePatterns(relPath, content) {
        if (content.includes('n-plus-one-ok'))
            return;
        if (relPath.endsWith('.sql'))
            return;
        // Detect await db or await supabase inside iterative loops
        const loopRegex = /(?:for\s*\([^)]*\)|while\s*\([^)]*\)|\.forEach\s*\([^)]*\))\s*\{([^}]*)\}/g;
        let match;
        while ((match = loopRegex.exec(content)) !== null) {
            const loopBody = match[1] ?? '';
            if (/await\s+(?:db|supabase)\.|\.query\(|\.findFirst\(|\.findUnique\(/i.test(loopBody)) {
                const line = this.getLineNumber(content, match.index);
                this.addViolation({
                    ruleId: 'n-plus-one-patterns',
                    severity: 'error',
                    message: 'Llamada asíncrona a base de datos dentro de bucle iterativo (patrón N+1)',
                    file: relPath,
                    line
                });
            }
        }
    }
    auditHeavyCountQueries(relPath, content) {
        if (content.includes('count-ok'))
            return;
        // Detect unbounded COUNT(*) without WHERE clause in SQL
        const countAllRegex = /SELECT\s+COUNT\(\*\)\s+FROM\s+\w+(?!\s+WHERE\b)/gi;
        let match;
        while ((match = countAllRegex.exec(content)) !== null) {
            const line = this.getLineNumber(content, match.index);
            this.addViolation({
                ruleId: 'heavy-count-queries',
                severity: 'error',
                message: 'SELECT COUNT(*) masivo sin cláusula WHERE en tabla completa',
                file: relPath,
                line
            });
        }
    }
    auditUnindexedOrderBy(relPath, content) {
        if (content.includes('offset-ok'))
            return;
        // Detect OFFSET >= 1000 in SQL or code
        const offsetRegex = /\bOFFSET\s+(\d{3,})\b/gi;
        let match;
        while ((match = offsetRegex.exec(content)) !== null) {
            const offsetVal = parseInt(match[1], 10);
            if (offsetVal >= 100) {
                const line = this.getLineNumber(content, match.index);
                this.addViolation({
                    ruleId: 'unindexed-order-by',
                    severity: 'error',
                    message: `Paginación por OFFSET masivo (${offsetVal}); migrar a paginación por cursor`,
                    file: relPath,
                    line
                });
            }
        }
    }
}
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateQueryPerformanceAuditor());
//# sourceMappingURL=validate_query_performance.js.map