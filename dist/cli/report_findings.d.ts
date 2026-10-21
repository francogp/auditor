import { RemediationPhaseId } from "../core/remediationPhases.js";
import { AuditFinding } from "../core/auditContract.js";
//#region src/cli/report_findings.d.ts
type Finding = AuditFinding;
export declare const SEVERITY_FILTERS: readonly ["all", "error", "warning"];
export type SeverityFilter = (typeof SEVERITY_FILTERS)[number];
export declare const REPORT_SCOPES: readonly ["all", "host", "packages"];
export type ReportScope = (typeof REPORT_SCOPES)[number];
export type PhaseFilter = RemediationPhaseId | 'all' | 'next';
export interface ActiveRemediationPhaseResolution {
  readonly phase: RemediationPhaseId;
  readonly errors: number;
  readonly warnings: number;
  readonly postponedCount: number;
  readonly totalErrorsInReport: number;
  readonly totalWarningsInReport: number;
}
export declare function resolveActiveRemediationPhase(allFindings: readonly Finding[]): ActiveRemediationPhaseResolution | null;
export declare function renderActivePhaseFocusBanner(resolution: ActiveRemediationPhaseResolution, isHuman?: boolean): string;
export declare function runReport(): void;
//#endregion
export {};