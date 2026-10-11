import { FileScanAuditor } from '../../core/auditorBase.ts';
export declare const SECURITY_HARDENING_RULES: readonly ["hardcoded-secrets", "insecure-random", "vulnerable-regex-redos", "raw-html-injection", "missing-csrf-token", "eval-or-function-constructor", "permissive-cors", "unvalidated-redirect"];
export type SecurityHardeningRuleId = (typeof SECURITY_HARDENING_RULES)[number];
export declare class ValidateSecurityHardeningAuditor extends FileScanAuditor<SecurityHardeningRuleId> {
    constructor(options?: {
        projectRoot?: string;
        fix?: boolean;
        roots?: readonly string[];
    });
    protected scanFile(relPath: string, content: string): void;
    private scanSecurityPattern;
    private auditHardcodedSecrets;
    private auditInsecureRandom;
    private auditVulnerableRegexRedos;
    private auditRawHtmlInjection;
    private auditMissingCsrfToken;
    private auditEvalOrFunctionConstructor;
    private auditPermissiveCors;
    private auditUnvalidatedRedirect;
}
//# sourceMappingURL=validate_security_hardening.d.ts.map