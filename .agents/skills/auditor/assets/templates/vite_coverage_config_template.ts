import { defineAuditConfig } from '@francogp/auditor';

/**
 * Canonical Test Execution Coverage SSoT Blueprint (`.auditor/audit.config.ts`)
 *
 * IMPORTANT (Satellite Sovereignty):
 * `vite.config.ts` is an auditor-owned derived artifact and MUST NEVER be edited manually.
 * Configure test coverage settings in `.auditor/audit.config.ts` (shown below) and run
 * `npm run auditor:fix` so the AST engine synchronizes `vite.config.ts` deterministically.
 *
 * Produces standard V8/Istanbul coverage artifacts (`scratch/coverage/coverage-final.json`)
 * consumed by `validate_test_coverage` and `auditor-coverage` (`npm run auditor:test-coverage`).
 */
export default defineAuditConfig({
  testCoverage: {
    enabled: true,
    // Minimum required line coverage percentage (default: 80)
    threshold: 80,
    // Optional globs exempt from line coverage ratcheting (does NOT affect Oxlint/Vite+)
    exemptGlobs: []
  },
  vitePlusConfig: {
    enabled: true,
    test: {
      environment: 'node',
      globals: true,
      include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
      exclude: ['node_modules', 'dist', 'scratch'],
      coverage: {
        provider: 'v8',
        // Mandatory 'json' reporter writes scratch/coverage/coverage-final.json
        reporter: ['text', 'json', 'json-summary'],
        reportsDirectory: 'scratch/coverage',
        include: ['src/**/*.ts', 'src/**/*.vue'],
        exclude: [
          'src/**/*.d.ts',
          'tests/**',
          'node_modules/**',
          'dist/**',
          'scratch/**',
          '**/*.config.ts',
          '**/*.config.js'
        ]
      }
    }
  }
});
