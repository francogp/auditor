/**
 * tests/cli_utils.test.ts
 *
 * Unit tests for CLI utilities.
 */

import { describe, it, expect } from 'vitest';
import { isMainModule } from '../src/cli/cliUtils.ts';

describe('cliUtils', () => {
  it('returns true when metaUrl matches process.argv[1]', () => {
    const originalArgv1 = process.argv[1] ?? '';
    try {
      process.argv[1] = '/workspace/test-script.ts';
      const metaUrl = 'file:///workspace/test-script.ts';
      expect(isMainModule(metaUrl)).toBe(true);
    } finally {
      process.argv[1] = originalArgv1;
    }
  });

  it('returns false when metaUrl does not match process.argv[1]', () => {
    const originalArgv1 = process.argv[1] ?? '';
    try {
      process.argv[1] = '/workspace/other-script.ts';
      const metaUrl = 'file:///workspace/test-script.ts';
      expect(isMainModule(metaUrl)).toBe(false);
    } finally {
      process.argv[1] = originalArgv1;
    }
  });

  it('returns false when scriptArg contains relative directory traversal', () => {
    const originalArgv1 = process.argv[1] ?? '';
    try {
      process.argv[1] = '../secret/script.ts';
      const metaUrl = 'file:///secret/script.ts';
      expect(isMainModule(metaUrl)).toBe(false);
    } finally {
      process.argv[1] = originalArgv1;
    }
  });

  it('returns false when scriptArg is undefined', () => {
    const originalArgv1 = process.argv[1] ?? '';
    try {
      // @ts-expect-error Testing undefined argv[1]
      process.argv[1] = undefined;
      expect(isMainModule('file:///workspace/script.ts')).toBe(false);
    } finally {
      process.argv[1] = originalArgv1;
    }
  });

  it('returns false when metaUrl is invalid URL', () => {
    expect(isMainModule('invalid-url-string')).toBe(false);
  });
});
