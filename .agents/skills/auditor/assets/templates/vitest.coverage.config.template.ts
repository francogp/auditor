import { defineConfig } from 'vitest/config';

/**
 * Canonical Vitest Configuration with Test Execution Coverage
 *
 * This configuration serves as the Single Source of Truth (SSoT) blueprint
 * for test execution coverage in projects governed by @francogp/auditor.
 *
 * It produces standard Istanbul/C8 coverage artifacts (`coverage/coverage-final.json`)
 * consumed by the `validate_test_coverage` auditor and `auditor-coverage` (`npm run audit:test-coverage`) CLI.
 */
export default defineConfig({
  test: {
    // Hermetic Node.js environment by default; use inline // @vitest-environment jsdom for Vue SFCs
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    exclude: ['node_modules', 'dist', 'scratch'],

    coverage: {
      // Use 'v8' (Node native) or 'istanbul' (deterministic AST instrumentation)
      provider: 'v8',

      // Mandatory reporters:
      // - 'json': generates coverage/coverage-final.json (required by validate_test_coverage)
      // - 'json-summary': generates coverage/coverage-summary.json
      // - 'text': terminal summary table
      reporter: ['text', 'json', 'json-summary'],

      // Ephemeral coverage output directory
      reportsDirectory: 'coverage',

      // Explicitly include production source trees
      include: ['src/**/*.ts', 'src/**/*.vue'],

      // Exclude tests, type definitions, migrations, and CLI entrypoint wrappers
      exclude: [
        'src/**/*.d.ts',
        'tests/**',
        'node_modules/**',
        'dist/**',
        'scratch/**',
        '**/*.config.ts',
        '**/*.config.js'
      ],

      // Threshold ratcheting is centrally governed by .auditor/audit.config.ts (config.testCoverage.thresholds).
      // You may optionally mirror thresholds here to fail local vitest runs:
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80
      }
    }
  }
});
