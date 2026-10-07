/**
 * packages/auditor/src/core/suiteGating.ts
 *
 * Single Source of Truth for suite activation and configuration gating.
 * Evaluates whether an audit suite is enabled or disabled in the project's
 * audit configuration, providing transparent skip reasons and CLI introspection.
 */
import type { AuditConfig } from './auditConfigTypes.ts';
import { AUDIT_LIST_FILTERS, type AuditListFilter } from './auditConfigTypes.ts';
export { AUDIT_LIST_FILTERS, type AuditListFilter };
export interface SuiteGatingStatus {
    readonly enabled: boolean;
    readonly reason?: string;
    readonly configKey?: string;
}
export declare function evaluateSuiteStatus(suiteId: string, config: AuditConfig, declaredConfigKey?: string): SuiteGatingStatus;
//# sourceMappingURL=suiteGating.d.ts.map