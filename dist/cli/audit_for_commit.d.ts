#!/usr/bin/env -S node --experimental-strip-types
/**
 * scripts/maintenance/audit_for_commit.ts
 *
 * COMPARADOR DE ADVERTENCIAS Y ERRORES PARA SAFE-COMMIT (Node.js 26+)
 *
 * Obtiene los archivos modificados localmente comparando con 'origin/main'.
 * Analiza todo el proyecto buscando ERRORES (incluyendo eslint, vue-tsc type checking y 100% de sub-auditores).
 * Para las ADVERTENCIAS (warnings), solo exige resolver aquellas en archivos
 * modificados que sean nuevas comparadas con 'origin/main'.
 *
 * ⚠️ ZERO TAMPERING MANDATE:
 * Under NO circumstances may this script be modified to weaken, downgrade, or
 * bypass new warnings (such as Fallow unused exports or complexity hotspots) to make
 * a commit pass. All new findings MUST be resolved at the source code level.
 */
import { type AuditSeverity } from '../suites/architecture/audit_rules.ts';
export interface Violation {
    file: string;
    line: number;
    message: string;
    context: string;
    severity: AuditSeverity;
    ruleId?: string;
    ruleDescription?: string;
    suiteId?: string;
    suiteName?: string;
    isNew?: boolean;
}
export declare function isSubAuditorRule(ruleId?: string, suiteId?: string): boolean;
export declare function filterNewWarnings(localWarnings: Violation[], originWarnings: Violation[], originContent: string | null, filePath: string): Violation[];
//# sourceMappingURL=audit_for_commit.d.ts.map