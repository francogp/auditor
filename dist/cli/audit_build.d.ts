#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/audit_build.ts
 *
 * POST-BUILD ARTIFACT AUDITOR CLI (Node.js 26+ Native)
 * Executes exclusively sub-auditors declaring capabilities.requiresBuild === true
 * against compiled production artifacts in dist/.
 */
import '../core/permissionGuard.ts';
export declare function runAuditBuild(extraArgs?: readonly string[]): Promise<number>;
//# sourceMappingURL=audit_build.d.ts.map