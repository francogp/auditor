/**
 * packages/auditor/src/core/auditConfigAntiAbuse.ts
 *
 * Anti-abuse assertions, glob constraints, and root exemptions
 * for the audit configuration engine.
 */
import type { AuditEngineConfig } from './auditConfigTypes.ts';
export declare const FORBIDDEN_PRODUCTION_ROOTS: readonly string[];
export declare const MAX_CONSTANTS_EXEMPT_GLOBS = 15;
export declare const MIN_COVERAGE_REASON_LENGTH = 15;
export declare function normalizeRootPath(p: string): string;
export declare function getExemptRootsForPolicy(policy: string, paths: AuditEngineConfig['paths']): readonly string[];
export declare function filterOutExemptRoots(roots: readonly string[], exemptRoots: readonly string[]): string[];
/**
 * Rejects globs that would blanket-exempt the repository, a whole extension, or a whole code/test root.
 */
export declare function assertNarrowCoverageGlob(field: string, rawGlob: string, protectedRoots: readonly string[]): void;
export declare function assertCoverageReason(field: string, glob: string, reason: string | undefined): void;
export declare function validateConstantsExemptGlobs(globs: readonly string[]): void;
//# sourceMappingURL=auditConfigAntiAbuse.d.ts.map