import { defineConfig } from 'vite-plus';
import type { PluginOption } from 'vite';

/**
 * Canonical Vite+ Unified Configuration Template
 *
 * Governs lint (Oxlint), format (Oxfmt), test (Vitest), staged git hooks, and packaging (tsdown).
 * Required by `validate_vite_plus_config` and @francogp/auditor standards.
 *
 * For Web Applications (Vue / React / Vanilla):
 * - Declare plugins array as `PluginOption[]` outside defineConfig to avoid TypeScript recursion.
 * - Cast third-party Rollup plugins (e.g. rollup-plugin-visualizer) with `as PluginOption`.
 * - If using Oxlint typeAware: true with Vue SFCs, declare `declare module '*.vue'` in `src/env.d.ts`.
 */

// Example: Plugin array for web applications or packaging extensions:
// const isAnalyze = process.env.ANALYZE === 'true';
// const plugins: PluginOption[] = [
//   vue(),
//   ...(isAnalyze ? [visualizer({ open: true }) as PluginOption] : [])
// ];

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
    outExtensions: () => ({ js: '.js', dts: '.d.ts' })
  },
  lint: {
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
      '.agents/**',
      'tests/**'
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/consistent-type-assertions': [
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
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'dist/**']
    }
  },
  staged: {
    '*': 'vp check --fix'
  }
});
