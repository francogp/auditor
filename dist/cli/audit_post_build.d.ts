#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/audit_post_build.ts
 *
 * POST-BUILD ARTIFACT AUDITOR CLI (Node.js 26+ Native)
 * Executes exclusively sub-auditors declaring capabilities.phase === 'post-build'
 * against compiled production artifacts in dist/.
 */
import '../core/permissionGuard.ts';
export declare function runAuditPostBuild(extraArgs?: readonly string[]): Promise<number>;
//# sourceMappingURL=audit_post_build.d.ts.map