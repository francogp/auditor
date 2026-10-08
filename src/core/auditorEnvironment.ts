/**
 * packages/auditor/src/core/auditorEnvironment.ts
 *
 * Single Source of Truth for auditor runtime environment detection (Node.js 26+ Native).
 * Governs whether the auditor is running under production mode via AUDITOR_ENV=production.
 */

/**
 * Checks whether the auditor is executing in a production deployment or container build.
 * When true, development-only suites (similar-code Candle ML embeddings and test coverage)
 * are cleanly omitted, while all other architectural and quality gates run with full rigor.
 */
export function isProductionEnvironment(): boolean {
  return process.env.AUDITOR_ENV === 'production';
}
