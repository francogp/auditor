/**
 * packages/auditor/src/core/auditContract.ts
 *
 * STANDARD AUDIT CONTRACT (Node.js 26+)
 * Defines the immutable data structures, family types, and standard outputs
 * required for all sub-auditors and the general audit orchestrator.
 */
import { getAuditConfig, DEFAULT_MAX_AUDIT_STALENESS_MINUTES } from "./auditConfig.js";
export const BUILTIN_AUDIT_FAMILIES = [
    'architecture',
    'domain_data',
    'persistence',
    'documentation'
];
export const AUDIT_FAMILIES = [
    'architecture',
    'domain_data',
    'persistence',
    'documentation'
];
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
export const AUDIT_STATUSES = ['passed', 'failed', 'skipped'];
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
                `El código fuente puede haber cambiado desde la última auditoría. 👉 DEBES ejecutar 'npm run audit' para refrescar el reporte.`);
        }
    }
    catch (err) {
        if (err.message.includes('OBSOLETO'))
            throw err;
        throw new Error(`[${consumerName}] scratch/audits/latest_audit.json contiene un timestamp inválido ('${meta.timestamp}'). Ejecuta 'npm run audit' para regenerarlo.`, { cause: err });
    }
}
function assertAuditSuiteExecuted(meta, requiredSuiteId, consumerName) {
    const wasExecuted = Array.isArray(meta.executedSuites) && meta.executedSuites.includes(requiredSuiteId);
    const wasOmitted = Array.isArray(meta.omittedSuites) && meta.omittedSuites.includes(requiredSuiteId);
    if (!wasExecuted || wasOmitted) {
        const modeDesc = meta.runMode === 'preset' ? `preset=${meta.preset}` : (meta.runMode === 'family' ? `family=${meta.targetFamily}` : meta.runMode);
        throw new Error(`[${consumerName}] La suite requerida '${requiredSuiteId}' NO fue ejecutada en la última auditoría. ` +
            `latest_audit.json fue generado por una corrida PARCIAL (${modeDesc}, ${meta.executedSuiteCount}/${meta.totalDiscoveredSuites} suites ejecutadas). ` +
            `👉 DEBES ejecutar 'npm run audit' (completo) o 'npm run audit task=${requiredSuiteId}' para obtener datos válidos.`);
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
            `Es posible que provenga de una versión obsoleta o esté corrupto. Ejecuta 'npm run audit' para regenerarlo.`);
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