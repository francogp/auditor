import { SubAuditorStatus } from "./auditContract.js";
export interface SubAuditorSeverityTarget {
  readonly status?: SubAuditorStatus | 'skipped';
  readonly errorsCount?: number;
  readonly warningsCount?: number;
}
export declare function isSubAuditorFailed(report: SubAuditorSeverityTarget): boolean;
export declare function isSubAuditorWarning(report: SubAuditorSeverityTarget): boolean;
export declare function resolveEffectiveErrorsCount(report: SubAuditorSeverityTarget, fallbackCount?: number): number;
export declare function resolveEffectiveWarningsCount(report: SubAuditorSeverityTarget, fallbackCount?: number): number;