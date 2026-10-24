import { AuditFinding } from "../../core/auditContract.js";
import { FileScanAuditor } from "../../core/auditorBase.js";
export declare const SECRET_LEAKS_RULES: readonly ["secret-leak-detected", "secret-leak-private-key"];
export type SecretLeaksRuleId = (typeof SECRET_LEAKS_RULES)[number];
export declare const SECRET_SCAN_EXTENSIONS: ReadonlySet<string>;
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
  constructor(options?: {
    projectRoot?: string;
    roots?: readonly string[];
  });
  runAudit(): Promise<void>;
  protected scanFile(relPath: string, content: string): Promise<void>;
}