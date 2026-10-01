import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    pool: 'forks',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    css: false,
    execArgv: ['--no-experimental-webstorage', '--no-warnings=ExperimentalWarning'],
  },
});
