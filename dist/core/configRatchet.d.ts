import { TranscriptVerifierOptions } from "./transcriptAuthorizationVerifier.js";
import ts from "typescript";
export declare function astExpressionToPlainValue(expr: ts.Expression): unknown;
export declare function parseAuditConfigTextToRecord(code: string): Record<string, unknown> | null;
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
 * Recursively collects all path and glob exemptions present anywhere in the online baseline configuration.
 * Gathers paths.ignoreGlobs, paths.dataRoots, paths.demoRoots, and every subsystem's
 * exemptGlobs, exemptFiles, exemptCssFiles, ignoreGlobs, and ignorePatterns.
 */
export declare function collectAllOnlinePathExemptions(onlineConfig: Record<string, unknown>): ReadonlySet<string>;
/**
 * Evaluates whether a local path or glob is already covered / subsumed by online exemption entries.
 * Checks both the field-level online set and the repository-wide online path exemptions.
 * If localPath is inside any online path (e.g. 'database/migrations/save.sql' inside 'database/migrations/**'),
 * narrowing or moving the exemption to a specific file is a hardening pass and does NOT constitute a relaxation.
 */
export declare function isPathCoveredByOnlineExemptions(localPath: string, fieldOnlineSet: ReadonlySet<string>, allOnlinePathExemptions?: ReadonlySet<string>): boolean;
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