/**
 * src/core/remediationPhases.ts
 *
 * CANONICAL REMEDIATION PHASES & STRATEGIC RESOLUTION ORDER
 * Defines the immutable 7-tier strategic resolution sequence for static analysis findings.
 * Governs the developer and AI agent workflow to eradicate wasted effort:
 * Pruning -> Deduplication -> Contracts -> Framework/UI -> Hygiene -> Polish.
 */
export declare const REMEDIATION_PHASE_IDS: readonly ["setup", "prune", "dedup", "contracts", "behavior", "hygiene", "polish"];
export type RemediationPhaseId = (typeof REMEDIATION_PHASE_IDS)[number];
export interface RemediationPhaseMetadata {
  readonly id: RemediationPhaseId;
  readonly order: number;
  readonly title: string;
  readonly icon: string;
  readonly description: string;
  readonly rationale: string;
}
export declare const REMEDIATION_PHASES: Readonly<Record<RemediationPhaseId, RemediationPhaseMetadata>>;
export declare function isRemediationPhaseId(val: unknown): val is RemediationPhaseId;
export declare function getRemediationPhaseMetadata(phaseId: RemediationPhaseId): RemediationPhaseMetadata;