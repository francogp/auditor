/**
 * scripts/auditors/architecture/validate_audit_headers.ts
 *
 * ILLEGAL AUDIT HEADERS & FILE-LEVEL SUPPRESSIONS AUDITOR (Node.js 26+)
 *
 * Enforces the project's Absolute Prohibition on File-Level Audit Ignores
 * and Zero-Ignore policies across the codebase:
 *   - Detects fallow file-level ignore directives.
 *   - Detects whole-file eslint-disable blocks.
 *   - Detects banned TypeScript compiler bypasses (@ts-nocheck, @ts-ignore, @ts-expect-error).
 *   - Detects auditor escape hatches misused as standalone file header comments.
 *   - Strictly respects project-level DIRECTORY IGNORES.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_audit_headers.ts
 *   npm run validate:audit-headers
 */
import type { FindingSeverity } from '../../core/auditContract.ts';
import { FileScanAuditor, CANONICAL_IGNORE_DIRS, isPathIgnored, loadFallowIgnorePatterns } from '../../core/auditorBase.ts';
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
export { CANONICAL_IGNORE_DIRS, isPathIgnored, loadFallowIgnorePatterns };
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
//# sourceMappingURL=validate_audit_headers.d.ts.map