#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/build_prod.ts
 *
 * PRODUCTION BUILD RUNNER CLI (Node.js 26+ Native)
 * Executes npm run build under AUDITOR_ENV=production, cleanly omitting
 * development-only suites (similar-code Candle ML embeddings, test coverage, and git config)
 * while maintaining strict 100% enforcement across all architectural, linting,
 * styles, and post-build bundle budget verification gates.
 */
import '../core/permissionGuard.ts';
export declare function runBuildProd(extraArgs?: readonly string[]): number;
//# sourceMappingURL=build_prod.d.ts.map