import { AcknowledgeableExemptionPolicy, AuditEngineConfig } from "./auditConfigTypes.js";
//#region src/core/auditConfigDegradations.d.ts
export interface UnacknowledgedDegradation {
  readonly policy: AcknowledgeableExemptionPolicy;
  readonly rootOrFile: string;
  readonly suggestedGlob: string;
  readonly reason: string;
  readonly filesCount: number;
}
export declare function collectRelativeCodeFiles(projectRoot: string, rootRelPath: string, maxFiles?: number): string[];
export declare function detectUnacknowledgedDegradations(config: AuditEngineConfig, projectRoot: string): UnacknowledgedDegradation[];
export declare function applyAcknowledgedDegradationsFix(projectRoot: string, missing: readonly UnacknowledgedDegradation[]): void;
//#endregion