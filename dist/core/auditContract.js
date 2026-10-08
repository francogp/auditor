/**
 * packages/auditor/src/core/auditContract.ts
 *
 * STANDARD AUDIT CONTRACT (Node.js 26+)
 * Defines the immutable data structures, family types, and standard outputs
 * required for all sub-auditors and the general audit orchestrator.
 */
import path from 'node:path';
import { getAuditConfig, DEFAULT_MAX_AUDIT_STALENESS_MINUTES } from "./auditConfig.js";
export const BUILTIN_AUDIT_FAMILIES = [
    'architecture',
    'domain_data',
    'persistence',
    'documentation'
];
export const AUDIT_FAMILIES = BUILTIN_AUDIT_FAMILIES; // value-ok: Canonical constant value reference
export const FAMILY_METADATA = {
    architecture: {
        key: 'architecture',
        title: 'ESTÁNDARES ESTÁTICOS, AST Y ARQUITECTURA',
        order: 1,
        icon: '📁',
        description: 'Reglas de calidad de código, AST, Fallow intelligence y dependencias.'
    },
    domain_data: {
        key: 'domain_data',
        title: 'TIPOS DE DOMINIO Y BASES DE DATOS CANÓNICAS',
        order: 2,
        icon: '🔒',
        description: 'Validación de tipos de dominio estrictos (/domain-type-first), cuadros tarifarios y fórmulas.'
    },
    persistence: {
        key: 'persistence',
        title: 'PERSISTENCIA, SQL Y MIGRACIONES',
        order: 3,
        icon: '💾',
        description: 'Integridad sintáctica de migraciones PostgreSQL/Supabase/SQLite y políticas RLS.'
    },
    documentation: {
        key: 'documentation',
        title: 'DOCUMENTACIÓN Y ESTRUCTURA DOX',
        order: 4,
        icon: '📚',
        description: 'Integridad de enlaces relativos en markdown e índices DOX (AGENTS.md).'
    }
};
export const DEFAULT_CUSTOM_FAMILY_ORDER = 90;
export const FALLBACK_FAMILY_ORDER = 99;
export function resolveFamilyMetadata(familyKey, customFamilies) {
    if (FAMILY_METADATA[familyKey]) {
        return FAMILY_METADATA[familyKey];
    }
    const custom = customFamilies?.find(f => f.key === familyKey);
    if (custom) {
        return {
            key: custom.key,
            title: custom.title,
            order: custom.order ?? DEFAULT_CUSTOM_FAMILY_ORDER,
            icon: custom.icon ?? '⚙️',
            description: custom.description ?? `Validaciones específicas de la familia ${custom.key}.`
        };
    }
    return {
        key: familyKey,
        title: familyKey.toUpperCase(),
        order: FALLBACK_FAMILY_ORDER,
        icon: '⚙️',
        description: `Familia de auditoría ${familyKey}.`
    };
}
export function getActiveFamilies(customFamilies) {
    const customKeys = (customFamilies ?? []).map(f => f.key);
    return Array.from(new Set([...AUDIT_FAMILIES, ...customKeys]));
}
export const FINDING_SEVERITIES = ['error', 'warning', 'info'];
export const AUDIT_STATUSES = ['passed', 'failed', 'skipped'];
export const SUB_AUDITOR_STATUSES = ['passed', 'warning', 'failed'];
export const COVERAGE_SOURCES = ['runtime', 'declared-only'];
/**
 * Derives the canonical package.json script requirement for any auditor by convention.
 */
export function deriveCanonicalAuditorScript(id, description, overrides) {
    const shortId = id.replace(/\.(ts|js)$/, '').replace(/^(validate_|audit_)/, '').replace(/_/g, '-');
    return {
        name: overrides?.name ?? `auditor:${shortId}`, // domain-ok: Script requirement identifier convention
        command: overrides?.command ?? `auditor task=${id}`,
        description: overrides?.description ?? description,
        category: overrides?.category ?? 'suite',
        ...(overrides?.isApplicable ? { isApplicable: overrides.isApplicable } : {})
    };
}
export const RATCHET_STATUSES = ['passed', 'failed', 'initialized'];
/**
 * Normalizes a file path from an AuditFinding into a clean relative POSIX path.
 */
export function normalizeFindingPath(filePath, cwd = process.cwd()) {
    if (!filePath)
        return 'General';
    const rel = path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath;
    return rel.replace(/\\/g, '/').replace(/^\/+/, '') || 'General';
}
/**
 * Stably sorts an array of AuditFinding instances by:
 * 1. Normalized relative file path (case-insensitive ASC)
 * 2. Line number (ASC, missing/undefined at top = 0)
 * 3. Column number (ASC)
 * 4. Severity ('error' first, then 'warning')
 * 5. Rule ID (ASC)
 */
export function sortFindingsByFileAndLine(findings, cwd = process.cwd()) {
    return [...findings].sort((a, b) => {
        const fileA = normalizeFindingPath(a.file, cwd).toLowerCase();
        const fileB = normalizeFindingPath(b.file, cwd).toLowerCase();
        if (fileA !== fileB) {
            return fileA.localeCompare(fileB);
        }
        const lineA = a.line ?? 0;
        const lineB = b.line ?? 0;
        if (lineA !== lineB) {
            return lineA - lineB;
        }
        const colA = a.col ?? 0;
        const colB = b.col ?? 0;
        if (colA !== colB) {
            return colA - colB;
        }
        const sevScoreA = a.severity === 'error' ? 0 : 1;
        const sevScoreB = b.severity === 'error' ? 0 : 1;
        if (sevScoreA !== sevScoreB) {
            return sevScoreA - sevScoreB;
        }
        return (a.ruleId ?? '').localeCompare(b.ruleId ?? '');
    });
}
/**
 * Groups an array of AuditFindings into a map indexed by normalized relative file path,
 * where findings within each file are guaranteed sorted by line number ascending.
 */
export function groupFindingsByFileMap(findings, cwd = process.cwd()) {
    const sorted = sortFindingsByFileAndLine(findings, cwd);
    const map = {};
    for (const f of sorted) {
        const norm = normalizeFindingPath(f.file, cwd);
        if (!map[norm]) {
            map[norm] = {
                file: norm,
                errors: 0,
                warnings: 0,
                findings: []
            };
        }
        if (f.severity === 'error') {
            map[norm].errors++;
        }
        else {
            map[norm].warnings++;
        }
        map[norm].findings.push(f);
    }
    return map;
}
export const ONE_MINUTE_MS = 60000;
export const MAX_AUDIT_STALENESS_MS = DEFAULT_MAX_AUDIT_STALENESS_MINUTES * ONE_MINUTE_MS;
function assertAuditFreshness(meta, consumerName, options) {
    if (options.allowStale)
        return;
    const config = getAuditConfig(options.projectRoot);
    const configuredMinutes = config.runner?.maxStalenessMinutes ?? DEFAULT_MAX_AUDIT_STALENESS_MINUTES;
    const maxAge = options.maxAgeMs ?? (configuredMinutes * ONE_MINUTE_MS);
    try {
        const auditInstant = Temporal.Instant.from(meta.timestamp);
        const now = Temporal.Now.instant();
        const elapsedMs = now.since(auditInstant).total({ unit: 'millisecond' });
        if (elapsedMs > maxAge) {
            const elapsedMins = Math.max(1, Math.round(now.since(auditInstant).total({ unit: 'minute' })));
            const limitMins = Math.round(maxAge / ONE_MINUTE_MS);
            throw new Error(`[${consumerName}] scratch/audits/latest_audit.json está OBSOLETO (${elapsedMins} minutos de antigüedad, límite: ${limitMins} min). ` +
                `El código fuente puede haber cambiado desde la última auditoría. 👉 DEBES ejecutar 'npm run auditor' para refrescar el reporte.`);
        }
    }
    catch (err) {
        if (err.message.includes('OBSOLETO'))
            throw err;
        throw new Error(`[${consumerName}] scratch/audits/latest_audit.json contiene un timestamp inválido ('${meta.timestamp}'). Ejecuta 'npm run auditor' para regenerarlo.`, { cause: err });
    }
}
function assertAuditSuiteExecuted(meta, requiredSuiteId, consumerName) {
    const wasExecuted = Array.isArray(meta.executedSuites) && meta.executedSuites.includes(requiredSuiteId);
    const wasOmitted = Array.isArray(meta.omittedSuites) && meta.omittedSuites.includes(requiredSuiteId);
    if (!wasExecuted || wasOmitted) {
        const modeDesc = meta.runMode === 'preset' ? `preset=${meta.preset}` : (meta.runMode === 'family' ? `family=${meta.targetFamily}` : meta.runMode);
        throw new Error(`[${consumerName}] La suite requerida '${requiredSuiteId}' NO fue ejecutada en la última auditoría. ` +
            `latest_audit.json fue generado por una corrida PARCIAL (${modeDesc}, ${meta.executedSuiteCount}/${meta.totalDiscoveredSuites} suites ejecutadas). ` +
            `👉 DEBES ejecutar 'npm run auditor' (completo) o 'npm run auditor task=${requiredSuiteId}' para obtener datos válidos.`);
    }
}
/**
 * Asserts that a required auditor was executed in the consolidated audit report
 * and that the report is fresh (generated within the last 5 minutes).
 * Throws a fatal descriptive error if the audit is partial, the suite was omitted,
 * or the report is stale.
 */
export function assertAuditorExecuted(report, requiredSuiteId, consumerName, options = {}) {
    if (!report || !report.meta) {
        throw new Error(`[${consumerName}] scratch/audits/latest_audit.json no contiene la cabecera de metadatos 'meta'. ` +
            `Es posible que provenga de una versión obsoleta o esté corrupto. Ejecuta 'npm run auditor' para regenerarlo.`);
    }
    assertAuditFreshness(report.meta, consumerName, options);
    assertAuditSuiteExecuted(report.meta, requiredSuiteId, consumerName);
}
export function groupResultsByFamily(results, initialFamilies) {
    const byFamily = new Map();
    if (initialFamilies) {
        for (const f of initialFamilies)
            byFamily.set(f, []);
    }
    for (const r of results) {
        if (!byFamily.has(r.family))
            byFamily.set(r.family, []);
        byFamily.get(r.family).push(r);
    }
    return byFamily;
}
//# sourceMappingURL=auditContract.js.map