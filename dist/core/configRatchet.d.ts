import { TranscriptVerifierOptions } from "./transcriptAuthorizationVerifier.js";
export type RelaxationCode = `RELAX-${string}` & {
  readonly __brand?: 'RelaxationCode';
};
export interface ConfigRelaxation {
  readonly file: string;
  readonly path: string;
  readonly description: string;
  readonly onlineValue?: unknown;
  readonly localValue?: unknown;
}
export interface ConfigRatchetResult {
  readonly passed: boolean;
  readonly relaxations: readonly ConfigRelaxation[];
  readonly relaxationCode: RelaxationCode | null;
  readonly authorized: boolean;
  readonly tamperingDetected: boolean;
  readonly message?: string;
}
export interface ConfigRatchetOptions {
  readonly projectRoot?: string;
  readonly productionRef?: string;
  readonly skipNetwork?: boolean;
  readonly transcriptOptions?: TranscriptVerifierOptions;
}
export declare function runGit(projectRoot: string, args: readonly string[]): {
  ok: boolean;
  stdout: string;
};
export declare function resolveProductionRef(projectRoot: string, configuredRef?: string, skipNetwork?: boolean): string | null;
export declare function readGitFile(projectRoot: string, ref: string, relPath: string): string | null;
/**
 * Recursively inspects parsed config objects to detect added exemptions, lowered floors, or disabled suites.
 */
export declare function inspectAuditConfigChanges(onlineConfig: Record<string, unknown>, localConfig: Record<string, unknown>, configFile?: string): ConfigRelaxation[];
/**
 * Compares linter JSON configuration (Stylelint, Fallow, HtmlValidate, tsconfig).
 * Demoting rules ('error' -> 'warn' | 'off') is a relaxation.
 */
export declare function inspectLinterConfigChanges(file: string, onlineContent: string | null, localContent: string | null): ConfigRelaxation[];
/**
 * Computes a deterministic RELAX-<8hex> token from the collected relaxations.
 */
export declare function computeRelaxationCode(relaxations: readonly ConfigRelaxation[]): RelaxationCode;
/**
 * Runs the complete Unidirectional Online Config Ratchet check.
 */
export declare function auditConfigRatchet(projectRoot: string, localConfig: Record<string, unknown>, options?: ConfigRatchetOptions): ConfigRatchetResult;