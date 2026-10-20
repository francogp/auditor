import { FindingSeverity } from "../../core/auditContract.js";
import { CANONICAL_IGNORE_DIRS, FileScanAuditor, isPathIgnored } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_audit_headers.d.ts
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
/**
 * Object-oriented FileScanAuditor implementation for Illegal Audit Headers.
 */
export declare class AuditHeadersAuditor extends FileScanAuditor<HeaderRuleId> {
  private readonly collectedViolations;
  constructor(roots?: readonly string[], projectRoot?: string);
  getViolations(): readonly HeaderViolation[];
  protected scanFile(relPath: string, content: string): void;
}
/**
 * Legacy procedural audit runner preserved for testing and external consumers.
 */
export declare function auditAuditHeaders(targetDir?: string): AuditHeadersResult;
//#endregion
export { CANONICAL_IGNORE_DIRS, isPathIgnored };