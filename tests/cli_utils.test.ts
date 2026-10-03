/**
 * tests/cli_utils.test.ts
 *
 * Unit tests for CLI utilities.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMainModule } from '../src/cli/cliUtils.ts';

describe('cliUtils', () => {
  it('returns true when metaUrl matches process.argv[1]', () => {
    const originalArgv1 = process.argv[1] ?? '';
    try {
      const scriptPath = path.resolve('/workspace/test-script.ts');
      process.argv[1] = scriptPath;
      const metaUrl = pathToFileURL(scriptPath).href;
      expect(isMainModule(metaUrl)).toBe(true);
    } finally {
      process.argv[1] = originalArgv1;
    }
  });

  it('returns false when metaUrl does not match process.argv[1]', () => {
    const originalArgv1 = process.argv[1] ?? '';
    try {
      const scriptPath = path.resolve('/workspace/other-script.ts');
      const targetPath = path.resolve('/workspace/test-script.ts');
      process.argv[1] = scriptPath;
      const metaUrl = pathToFileURL(targetPath).href;
      expect(isMainModule(metaUrl)).toBe(false);
    } finally {
      process.argv[1] = originalArgv1;
    }
  });

  it('correctly resolves relative paths to the main module', () => {
    const originalArgv1 = process.argv[1] ?? '';
    try {
      const scriptPath = path.resolve('test-script.ts');
      process.argv[1] = './test-script.ts';
      const metaUrl = pathToFileURL(scriptPath).href;
      expect(isMainModule(metaUrl)).toBe(true);
    } finally {
      process.argv[1] = originalArgv1;
    }
  });

  it('returns false when scriptArg is undefined', () => {
    const originalArgv1 = process.argv[1] ?? '';
    try {
      // @ts-expect-error Testing undefined argv[1]
      process.argv[1] = undefined;
      expect(isMainModule(pathToFileURL(path.resolve('/workspace/script.ts')).href)).toBe(false);
    } finally {
      process.argv[1] = originalArgv1;
    }
  });

  it('returns false when metaUrl is invalid URL', () => {
    expect(isMainModule('invalid-url-string')).toBe(false);
  });
});
