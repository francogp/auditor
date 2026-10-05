/**
 * packages/auditor/src/suites/architecture/validate_similar_code.ts
 *
 * FALLOW SIMILAR-CODE SEMANTIC DUPLICATION AUDITOR (Node.js 26+)
 *
 * Detects semantically similar functions across the repository using Fallow's
 * local vector embeddings model (jina-embeddings-v2-base-code).
 *
 * Key Architectural Guards:
 *   1. Zero Fast-Preset Impact: Completely excluded from fast presets (preset=lint, preset=md).
 *   2. Strict High Threshold: Defaults to 0.95 threshold to eliminate cognitive noise and false positives.
 *   3. Intra-File Filtering: Skips pairs within the same file (e.g. sync/async pairs like safeWriteFileSync/safeWriteFile).
 *   4. Auto-Initialization: If the companion model is not ready, automatically downloads and sets up the local model with clear console notification.
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
export type SimilarCodeRuleId = 'fallow-similar-code' | 'fallow-similar-code-failed';
export declare const SIMILAR_CODE_RULES: readonly SimilarCodeRuleId[];
export declare const DEFAULT_SIMILAR_CODE_THRESHOLD = 0.95;
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
export declare function checkOrInitializeModel(fallowBin: string, projectRoot: string): boolean;
export declare function evaluateSimilarCodeCandidates(candidates: readonly SimilarCodeCandidate[] | undefined, options: {
    ignoreSameFile?: boolean;
}, auditor: ValidateSimilarCodeAuditor): number;
export declare class ValidateSimilarCodeAuditor extends BaseAuditor<SimilarCodeRuleId> {
    constructor(targetPath?: string);
    private ensureFallowBinaryAndModel;
    private executeAnalysis;
    private processRawOutputFile;
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_similar_code.d.ts.map