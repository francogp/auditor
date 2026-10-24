import { AUDIT_LIST_FILTERS, AuditConfig, AuditListFilter } from "./auditConfigTypes.js";
export interface SuiteGatingStatus {
  readonly enabled: boolean;
  readonly reason?: string;
  readonly configKey?: string;
}
export declare function evaluateSuiteStatus(suiteId: string, config: AuditConfig, declaredConfigKey?: string): SuiteGatingStatus;
export { AUDIT_LIST_FILTERS, type AuditListFilter };