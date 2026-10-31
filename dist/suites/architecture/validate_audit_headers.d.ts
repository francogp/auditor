import { FindingSeverity } from "../../core/auditContract.js";
import { FileScanAuditor } from "../../core/auditorBase.js";
export declare const MAX_HEADER_LINES_CHECK = 10;
export type HeaderRuleId = 'file-level-fallow-ignore' | 'file-level-eslint-disable' | 'banned-ts-suppression' | 'banned-magic-suppression' | 'banned-style-suppression' | 'header-auditor-escape' | 'unjustified-escape-hatch';
export declare const HEADER_RULES: readonly HeaderRuleId[];
export interface HeaderViolation {
  readonly file: string;
  readonly line: number;
  readonly ruleId: HeaderRuleId;
  readonly message: string;
  readonly context: string;
  readonly severity: FindingSeverity;
}
export interface AuditHeadersResult {
  readonly filesScanned: number;
  readonly violations: readonly HeaderViolation[];
  readonly passed: boolean;
  readonly countsByRule: Record<string, number>;
}
/**
 * Scans file contents for illegal suppression headers or file-level ignores.
 */
export declare function scanFileForIllegalHeaders(filePath: string, content: string): HeaderViolation[];
export interface AuditHeadersOptions {
  readonly projectRoot?: string;
  readonly roots?: readonly string[];
}
/**
 * Object-oriented FileScanAuditor implementation for Illegal Audit Headers.
 */
export declare class AuditHeadersAuditor extends FileScanAuditor<HeaderRuleId> {
  private readonly collectedViolations;
  constructor(options?: AuditHeadersOptions);
  getViolations(): readonly HeaderViolation[];
  protected scanFile(relPath: string, content: string): void;
}
/**
 * Legacy procedural audit runner preserved for testing and external consumers.
 */
export declare function auditAuditHeaders(targetDir?: string): AuditHeadersResult;