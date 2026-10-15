import { defineConfig } from 'vite-plus';

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
      '@typescript-eslint/ban-ts-comment': 'error'
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
    execArgv: ['--no-experimental-webstorage', '--no-warnings=ExperimentalWarning'],
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
