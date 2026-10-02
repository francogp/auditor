/**
 * scripts/auditors/architecture/validate_native_paths.ts
 *
 * SECURITY & PATH INTEGRITY AUDITOR (Node.js 26+ Native)
 *
 * Enforces cross-platform safe path operations and security hygiene across the codebase:
 *   1. Unsafe Path Concatenation (`unsafe-path-concat`): Detects raw string templates
 *      or binary string concatenations with slashes used in filesystem operations
 *      or path variable assignments instead of `path.join`, `path.resolve`, `safeJoin`, or `safeResolve`.
 *   2. Unsanitized Env/Argv Path Sinks (`unsanitized-env-argv-path`): Detects raw `process.env`
 *      or `process.argv` passed into filesystem or path manipulation sinks without directory
 *      traversal validation (`assertSafePathComponent`, `sanitizePath`, character sanitization regex).
 *   3. Untrusted URL Fetching (`untrusted-url-fetch`): Detects dynamic URL fetching via `fetch()`
 *      without `new URL()` parsing and origin/hostname/protocol validation or `safeFetch`.
 *   4. Platform-Incompatible Path Operations (`hardcoded-slash-path`): Detects raw backslash/forward
 *      slash operations (e.g. `.lastIndexOf('\\')`, hardcoded `C:\\` drive paths, or `.split('\\')`
 *      on paths) that break POSIX/Windows cross-platform compatibility.
 *
 * Escape Hatches:
 *   `// path-ok`, `// url-ok`, `// env-ok`, `// cross-platform-ok`, `// security-ok`, `// string-ok: Internal string formatting or DOM token identifier`, `// no-domain: Non-domain utility collection or data structure`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_native_paths.ts
 *   npm run validate:native-paths
 */
import type { FindingSeverity } from '../../core/auditContract.ts';
import { CANONICAL_IGNORE_DIRS, isPathIgnored, loadFallowIgnorePatterns, getEffectiveScannableRoots, FileScanAuditor } from '../../core/auditorBase.ts';
export { CANONICAL_IGNORE_DIRS, isPathIgnored, loadFallowIgnorePatterns, getEffectiveScannableRoots };
export type NativePathRuleId = 'unsafe-path-concat' | 'unsanitized-env-argv-path' | 'untrusted-url-fetch' | 'hardcoded-slash-path';
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
    protected scanFile(relPath: string, content: string): void;
}
//# sourceMappingURL=validate_native_paths.d.ts.map