import { RemediationPhaseId } from "./remediationPhases.js";
import { AuditFinding, RatchetStatus, StandardAuditResult } from "./auditContract.js";
export interface ExecutivePassSummaryParams {
  totalSuites: number;
  passedSuites: number;
  skippedSuites?: number;
  totalErrors: number;
  totalWarnings: number;
  durationMs: number;
  latestAuditJsonPath?: string;
  ratchetStatus?: RatchetStatus;
}
export interface ExecutiveFailPhaseBreakdown {
  phase: RemediationPhaseId;
  errors: number;
  warnings: number;
}
export interface ExecutiveFailSummaryParams {
  totalSuites: number;
  failedSuites: number;
  totalErrors: number;
  totalWarnings: number;
  durationMs: number;
  phaseBreakdown: readonly ExecutiveFailPhaseBreakdown[];
  fixableErrors?: number;
  fixableWarnings?: number;
  latestAuditJsonPath?: string;
  ratchetVerdict?: {
    status: RatchetStatus;
    newWarnings: number;
    productionRef: string;
    error?: string;
  };
  topFindings?: readonly AuditFinding[];
}
export interface ExecutiveSetupBlockingSummaryParams {
  totalSuites: number;
  setupErrors: number;
  postponedAppErrors: number;
  durationMs: number;
  blockingSuites: readonly string[];
  hasFixableErrors?: boolean;
  latestAuditJsonPath?: string;
  topFindings?: readonly AuditFinding[];
}
export interface ExecutiveFixSummaryParams {
  durationMs: number;
  totalViolationsRepaired: number;
  filesModified: number;
  remainingErrors?: number;
  remainingWarnings?: number;
  latestAuditJsonPath?: string;
}
export declare function renderExecutivePassSummary(params: ExecutivePassSummaryParams): string;
export declare function renderExecutiveFailSummary(params: ExecutiveFailSummaryParams): string;
export declare function renderExecutiveSetupBlockingSummary(params: ExecutiveSetupBlockingSummaryParams): string;
export declare function renderExecutiveFixSummary(params: ExecutiveFixSummaryParams): string;
export declare function extractPhaseBreakdown(results: readonly StandardAuditResult[]): ExecutiveFailPhaseBreakdown[];