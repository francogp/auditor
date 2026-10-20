import { FindingSeverity } from "../../core/auditContract.js";
import { CANONICAL_IGNORE_DIRS, FileScanAuditor, getEffectiveScannableRoots, isPathIgnored } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_native_paths.d.ts
export type NativePathRuleId = 'unsafe-path-concat' | 'unsanitized-env-argv-path' | 'untrusted-url-fetch' | 'hardcoded-slash-path' | 'homebrew-path-manipulation';
export declare const NATIVE_PATH_RULES: readonly NativePathRuleId[];
export interface NativePathViolation {
  readonly file: string;
  readonly line: number;
  readonly ruleId: NativePathRuleId;
  readonly message: string;
  readonly context: string;
  readonly severity: FindingSeverity;
}
export interface NativePathAuditResult {
  readonly filesScanned: number;
  readonly violations: readonly NativePathViolation[];
  readonly passed: boolean;
  readonly countsByRule: Record<NativePathRuleId, number>;
}
export declare function scanFileForNativePathViolations(filePath: string, content: string): NativePathViolation[];
/**
 * Full repository audit runner for native paths and security integrity.
 */
export declare function auditNativePaths(targetDir?: string): NativePathAuditResult;
export declare class NativePathsAuditor extends FileScanAuditor<NativePathRuleId> {
  constructor(roots?: readonly string[], projectRoot?: string);
}
//#endregion
export { CANONICAL_IGNORE_DIRS, getEffectiveScannableRoots, isPathIgnored };