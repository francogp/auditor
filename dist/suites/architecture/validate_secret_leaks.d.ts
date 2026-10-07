/**
 * src/suites/architecture/validate_secret_leaks.ts
 *
 * SECRET LEAKS & CREDENTIALS AUDITOR (Node.js 26+ Native)
 * Scans repository files for leaked credentials, API tokens, cryptographic private keys,
 * database URLs with passwords, and cloud access keys using @secretlint/core.
 *
 * Rules:
 *   - secret-leak-detected: Detects exposed API keys, tokens, basic auth credentials, and cloud secrets.
 *   - secret-leak-private-key: Detects unencrypted private cryptographic keys (RSA, EC, OPENSSH).
 */
import { FileScanAuditor } from '../../core/auditorBase.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
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
//# sourceMappingURL=validate_secret_leaks.d.ts.map