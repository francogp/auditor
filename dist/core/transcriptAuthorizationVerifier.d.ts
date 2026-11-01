import { RelaxationCode } from "./configRatchet.js";
export interface TranscriptVerificationResult {
  readonly verified: boolean;
  readonly tamperingDetected: boolean;
  readonly transcriptPath?: string;
  readonly userPrompt?: string;
  readonly reason?: string;
}
export interface TranscriptVerifierOptions {
  readonly transcriptPath?: string;
  readonly brainDir?: string;
}
export interface TranscriptStep {
  readonly step_index?: number;
  readonly source?: string;
  readonly type?: string;
  readonly content?: string;
  readonly tool_calls?: readonly {
    readonly name?: string;
    readonly args?: Record<string, unknown>;
  }[];
}
/**
 * Discovers candidate transcript.jsonl files under Antigravity's brain storage.
 * Returns paths sorted by last modified time (newest first).
 */
export declare function discoverTranscriptFiles(customBrainDir?: string): string[];
export interface TranscriptToolCall {
  readonly name?: string;
  readonly args?: Record<string, unknown>;
}
/**
 * Checks if a model tool call attempted to write or mutate transcript files.
 * Read-only operations (read_file) and background task log reads (.system_generated/tasks/*.log)
 * are completely safe and do NOT constitute tampering.
 */
export declare function isTamperingToolCall(toolCall: TranscriptToolCall): boolean;
/**
 * Type guard for boundary verification of untrusted inputs.
 */
export declare function isRelaxationCode(code: string): code is RelaxationCode;
/**
 * Verifies whether the specified relaxation code is authorized in the conversation transcript.
 */
export declare function verifyTranscriptAuthorization(relaxationCode: RelaxationCode, options?: TranscriptVerifierOptions): TranscriptVerificationResult;