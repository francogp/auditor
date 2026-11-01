import { AuditFinding } from "../../core/auditContract.js";
import { FileScanAuditor } from "../../core/auditorBase.js";
import { SecretLintSourceOptions } from "@secretlint/core";
export declare const SECRET_LEAKS_RULES: readonly ["secret-leak-detected", "secret-leak-private-key"];
export type SecretLeaksRuleId = (typeof SECRET_LEAKS_RULES)[number];
export declare const SECRET_SCAN_EXTENSIONS: ReadonlySet<string>;
type SecretLintConfig = SecretLintSourceOptions['options']['config'];
export declare function buildSecretLintConfig(allows?: readonly string[]): SecretLintConfig;
/**
 * Detects staged git files that may contain secrets using git diff --cached with -G and --name-only.
 * Returns only the matching file names to ensure raw secrets never leak into terminal output or agent tool logs.
 */
export declare function detectStagedSecretFiles(projectRoot?: string): readonly string[];
/**
 * Reads a staged blob directly from the Git index using `git show :<path>`.
 * Returns the staged file content, or null if unresolvable.
 */
export declare function readGitStagedBlob(projectRoot: string, relPath: string): string | null;
/**
 * Maps a single secretlint message to a canonical AuditFinding.
 */
export declare function mapSecretLintMessageToFinding(msg: {
  message: string;
  messageId?: string;
  ruleId: string;
  loc?: {
    start?: {
      line?: number;
      column?: number;
    };
  };
}, relPath: string): AuditFinding;
export declare class ValidateSecretLeaksAuditor extends FileScanAuditor<SecretLeaksRuleId> {
  private readonly secretLintConfig;
  private readonly scannedFiles;
  constructor(options?: {
    projectRoot?: string;
    roots?: readonly string[];
  });
  runAudit(): Promise<void>;
  protected scanFile(relPath: string, content: string): Promise<void>;
}
export {};