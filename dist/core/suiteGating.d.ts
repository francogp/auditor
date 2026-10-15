import { AUDIT_LIST_FILTERS, AuditConfig, AuditListFilter } from "./auditConfigTypes.js";
//#region src/core/suiteGating.d.ts
export interface SuiteGatingStatus {
  readonly enabled: boolean;
  readonly reason?: string;
  readonly configKey?: string;
}
export declare function evaluateSuiteStatus(suiteId: string, config: AuditConfig, declaredConfigKey?: string): SuiteGatingStatus;
//#endregion
export { AUDIT_LIST_FILTERS, type AuditListFilter };