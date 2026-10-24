import { AuditorCapabilities } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
export declare const SIMILAR_CODE_RULES: readonly ["fallow-similar-code", "fallow-similar-code-failed"];
export type SimilarCodeRuleId = (typeof SIMILAR_CODE_RULES)[number];
export declare const SIMILAR_CODE_RULE_CAPABILITIES: Record<SimilarCodeRuleId, AuditorCapabilities>;
export declare const DEFAULT_SIMILAR_CODE_THRESHOLD = 0.95;
export declare const WINDOWS_UNBLOCK_TIMEOUT_MS = 5000;
export interface SimilarCodeCandidateLocation {
  path: string;
  name: string;
  start_line: number;
  start_column?: number;
  end_line?: number;
  end_column?: number;
}
export interface SimilarCodeCandidate {
  candidate_id?: string;
  left: SimilarCodeCandidateLocation;
  right: SimilarCodeCandidateLocation;
  similarity: number;
  similarity_band?: string;
}
export interface SimilarCodeOutput {
  kind?: string;
  candidates?: SimilarCodeCandidate[];
}
export interface SimilarCodeStatusOutput {
  kind?: string;
  model_ready?: boolean;
}
export declare function resolveFallowBinary(projectRoot?: string): string | null;
export declare function isFastPresetActive(): boolean;
export declare function isSimilarCodeSkipped(): boolean;
export declare function resolveFallowUserCacheDir(): string;
export declare function ensureSimilarCodeCacheDir(_projectRoot?: string): string;
export declare function checkOrInitializeModel(fallowBin: string, projectRoot: string, isFix?: boolean): boolean;
export declare function evaluateSimilarCodeCandidates(candidates: readonly SimilarCodeCandidate[] | undefined, options: {
  ignoreSameFile?: boolean;
}, auditor: ValidateSimilarCodeAuditor): number;
export declare class ValidateSimilarCodeAuditor extends BaseAuditor<SimilarCodeRuleId> {
  constructor(options?: {
    projectRoot?: string;
  });
  private ensureFallowBinaryAndModel;
  private executeAnalysis;
  private processRawOutputFile;
  runAudit(): Promise<void>;
}