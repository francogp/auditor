import { FileScanAuditor } from "../../core/auditorBase.js";
import ts from "typescript";
export declare const SECURITY_HARDENING_RULES: readonly ["hardcoded-secrets", "insecure-random", "vulnerable-regex-redos", "raw-html-injection", "missing-csrf-token", "eval-or-function-constructor", "permissive-cors", "unvalidated-redirect", "security-postmessage-origin-validation", "security-trusted-types-passthrough", "security-external-sri-missing", "security-cookie-samesite-partitioned", "ci-github-actions-script-injection"];
export type SecurityHardeningRuleId = (typeof SECURITY_HARDENING_RULES)[number];
export declare class ValidateSecurityHardeningAuditor extends FileScanAuditor<SecurityHardeningRuleId> {
  private readonly astCache;
  constructor(options?: {
    projectRoot?: string;
    fix?: boolean;
    roots?: readonly string[];
  });
  runAudit(): Promise<void>;
  protected scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile): void;
  private auditModernSecurityRules;
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