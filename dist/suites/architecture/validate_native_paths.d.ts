import { CANONICAL_IGNORE_DIRS } from "../../core/canonicalIgnoreRegistry.js";
import { FileScanAuditor, FileScanRootsOptions, getEffectiveScannableRoots, isPathIgnored } from "../../core/auditorBase.js";
import { NATIVE_PATH_RULES, NativePathRuleId, NativePathViolation } from "../../analyzers/nativePaths/nativePathTypes.js";
export interface NativePathAuditResult {
  readonly filesScanned: number;
  readonly violations: readonly NativePathViolation[];
  readonly passed: boolean;
  readonly countsByRule: Record<NativePathRuleId, number>;
}
/** Script extensions scanned by this suite (JSX flavors included on top of the canonical set). */
export declare const NATIVE_PATH_EXTENSIONS: ReadonlySet<string>;
/**
 * Scans in-memory source code for native path violations using the TypeScript AST.
 */
export declare function scanFileForNativePathViolations(filePath: string, content: string): NativePathViolation[];
/**
 * Full repository audit runner for native paths and security integrity.
 */
export declare function auditNativePaths(targetDir?: string): NativePathAuditResult;
export declare class NativePathsAuditor extends FileScanAuditor<NativePathRuleId> {
  private readonly documentCache;
  constructor(options?: FileScanRootsOptions);
  /** Runs the single AST pass once per document and shares the result across rule sub-auditors. */
  private scanDocumentOnce;
}
export { CANONICAL_IGNORE_DIRS, NATIVE_PATH_RULES, type NativePathRuleId, type NativePathViolation, getEffectiveScannableRoots, isPathIgnored };