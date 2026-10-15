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
    jsPlugins: ['@francogp/auditor/domain-type-plugin'],
    options: {
      typeAware: true,
      typeCheck: true
    },
    ignorePatterns: [
      'src/cli/**',
      'src/core/**',
      'src/analyzers/**',
      'src/suites/**',
      '.htmlvalidate.json',
      '.markdownlint.json',
      '.markdownlintignore',
      '.node-version',
      '.npmrc',
      '.stylelintrc.json',
      'LICENSE',
      'package-lock.json',
      'plugin.json',
      'setup-linux.sh',
      'setup-windows.ps1',
      'tsconfig.json',
      'vite.config.ts',
      'src/data/**',
      'coverage/**',
      '**/*.d.ts',
      'tests/e2e/**',
      'tests/integration/**',
      '**/*.spec.ts',
      '**/*.test.ts',
      '**/*.simulation.ts',
      'dist/**',
      'dev-dist/**',
      'node_modules/**',
      'scratch/**',
      'tmp/**',
      '.agents/**',
      'tests/**'
    ],
    rules: {
      '@francogp/domain-type/no-legacy-date': 'error',
      '@francogp/domain-type/no-double-cast-unknown': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }
      ],
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
      'src/cli/**',
      'src/core/**',
      'src/analyzers/**',
      'src/suites/**',
      '.htmlvalidate.json',
      '.markdownlint.json',
      '.markdownlintignore',
      '.node-version',
      '.npmrc',
      '.stylelintrc.json',
      'LICENSE',
      'plugin.json',
      'setup-linux.sh',
      'setup-windows.ps1',
      'tsconfig.json',
      'vite.config.ts',
      'dev-dist/**',
      'coverage/**',
      '**/*.d.ts',
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
