import { defineConfig } from 'vite-plus';

/**
 * READ-ONLY DERIVED PROJECTION REFERENCE (`vite.config.ts`)
 *
 * IMPORTANT (Satellite Sovereignty):
 * `vite.config.ts` is an auditor-owned derived artifact synchronized via AST by `npm run auditor:fix`.
 * NEVER edit `vite.config.ts` manually:
 * - Declare custom rules, overrides, test projects, or ignores in `.auditor/audit.config.ts`.
 * - Declare Vite plugins in developer-owned `vite.plugins.ts` (`export const plugins: PluginOption[] = [...]`),
 *   which `npm run auditor:fix` wires into `vite.config.ts` automatically.
 * - Note: `tests/**` is NEVER placed in `lint.ignorePatterns`; test files remain visible to Oxlint
 *   and receive scoped `lint.overrides` derived dynamically from `config.paths.testRoots`.
 */

export default defineConfig({
  pack: {
    entry: ['src/**/*.ts'],
    unbundle: true,
    format: ['esm'],
    target: 'node26',
    dts: true,
    clean: true,
    publint: true,
    attw: { profile: 'esm-only' },
    outExtensions: (): { js: string; dts: string } => ({ js: '.js', dts: '.d.ts' })
  },
  lint: {
    plugins: ['vitest', 'node', 'promise', 'unicorn', 'typescript', 'vue', 'import', 'jsx-a11y'],
    options: {
      typeAware: true,
      typeCheck: true
    },
    ignorePatterns: [
      'dist/**',
      'dev-dist/**',
      'node_modules/**',
      'scratch/**',
      'tmp/**',
      '.agents/**'
    ],
    rules: {
      'typescript/no-explicit-any': 'error',
      'typescript/ban-ts-comment': 'error',
      'no-unused-vars': 'error',
      'typescript/explicit-function-return-type': ['error', { allowExpressions: true }],
      'typescript/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }
      ]
    }
  },
  fmt: {
    singleQuote: true,
    semi: true,
    trailingComma: 'none',
    printWidth: 100,
    ignorePatterns: [
      'dist/**',
      'node_modules/**',
      'scratch/**',
      'tmp/**',
      '.agents/**',
      'package-lock.json'
    ]
  },
  // Vitest Workspace Projects Mode is governed via `vitePlusConfig.test.projects` in `.auditor/audit.config.ts`.
  // Root `include` is strictly prohibited alongside `projects` to prevent runner cross-contamination.
  test: {
    globals: true,
    pool: 'forks',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary'],
      reportsDirectory: 'scratch/coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'dist/**']
    }
  },
  staged: {
    '*': 'vp check --fix'
  }
});
