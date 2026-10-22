import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import {
  tryOrNull,
  tryOrUndefined,
  tryOrDefault,
  tryCatchSync,
  safeJsonParse,
  safeStatSync,
  safeReadFileSync,
  safeRmSync,
  tryOrNullAsync,
  tryOrDefaultAsync,
  tryCatchAsync,
  safeReadFileAsync,
  safeReaddirAsync
} from '../src/core/safeUtils.ts';

describe('safeUtils module tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-utils-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // test cleanup
    }
  });

  describe('tryOrNull', () => {
    it('returns the result when the function succeeds', () => {
      const result = tryOrNull(() => 42 + 8);
      expect(result).toBe(50);
    });

    it('returns null when the function throws an error', () => {
      const result = tryOrNull(() => {
        throw new Error('Boom');
      });
      expect(result).toBeNull();
    });
  });

  describe('tryOrUndefined', () => {
    it('returns the result when the function succeeds', () => {
      const result = tryOrUndefined(() => 'ok-value');
      expect(result).toBe('ok-value');
    });

    it('returns undefined when the function throws', () => {
      const result = tryOrUndefined(() => {
        JSON.parse('{ invalid json');
      });
      expect(result).toBeUndefined();
    });
  });

  describe('tryOrDefault', () => {
    it('returns the computed value on success', () => {
      const result = tryOrDefault(() => 'computed', 'fallback');
      expect(result).toBe('computed');
    });

    it('returns the default value when an exception occurs', () => {
      const result = tryOrDefault(() => {
        throw new TypeError('invalid type');
      }, 'fallback');
      expect(result).toBe('fallback');
    });
  });

  describe('tryCatchSync', () => {
    it('returns ok: true with value when function succeeds', () => {
      const result = tryCatchSync(() => ({ count: 10 }));
      expect(result.ok).toBe(true);
      if (result.status === 'success') {
        expect(result.value.count).toBe(10);
      }
    });

    it('returns ok: false with error when function throws', () => {
      const result = tryCatchSync(() => {
        throw new Error('Failing operation');
      });
      expect(result.ok).toBe(false);
      if (result.status === 'failure') {
        expect(result.error.message).toBe('Failing operation');
      }
    });
  });

  describe('safeJsonParse', () => {
    it('parses valid json successfully', () => {
      const parsed = safeJsonParse<{ name: string }>('{"name": "auditor"}');
      expect(parsed).toEqual({ name: 'auditor' });
    });

    it('returns undefined on invalid json without fallback', () => {
      const parsed = safeJsonParse('{ malformed json');
      expect(parsed).toBeUndefined();
    });

    it('returns provided fallback on invalid json', () => {
      const parsed = safeJsonParse('{ malformed json', { fallback: true });
      expect(parsed).toEqual({ fallback: true });
    });
  });

  describe('safe IO functions', () => {
    it('safeStatSync returns stats for existing file and null for missing', () => {
      const filePath = path.join(tempDir, 'sample.txt');
      fs.writeFileSync(filePath, 'hello');
      const stats = safeStatSync(filePath);
      expect(stats).not.toBeNull();
      expect(stats?.isFile()).toBe(true);

      const missingStats = safeStatSync(path.join(tempDir, 'missing.txt'));
      expect(missingStats).toBeNull();
    });

    it('safeReadFileSync returns content for existing file and null for missing', () => {
      const filePath = path.join(tempDir, 'data.txt');
      fs.writeFileSync(filePath, 'sample content', 'utf-8');
      const content = safeReadFileSync(filePath);
      expect(content).toBe('sample content');

      const missingContent = safeReadFileSync(path.join(tempDir, 'no_file.txt'));
      expect(missingContent).toBeNull();
    });

    it('safeRmSync removes existing directories and handles missing safely', () => {
      const targetSub = path.join(tempDir, 'sub-dir');
      fs.mkdirSync(targetSub);
      expect(fs.existsSync(targetSub)).toBe(true);

      const removed = safeRmSync(targetSub);
      expect(removed).toBe(true);
      expect(fs.existsSync(targetSub)).toBe(false);

      const missingRemoved = safeRmSync(path.join(tempDir, 'never-existed'));
      expect(missingRemoved).toBe(true);
    });

    it('tryOrNullAsync returns value on resolve and null on reject', async () => {
      const success = await tryOrNullAsync(async () => 'async-ok');
      expect(success).toBe('async-ok');

      const failed = await tryOrNullAsync(async () => {
        throw new Error('Async Boom');
      });
      expect(failed).toBeNull();
    });

    it('tryOrDefaultAsync returns value on resolve and default on reject', async () => {
      const success = await tryOrDefaultAsync(async () => 100, 0);
      expect(success).toBe(100);

      const failed = await tryOrDefaultAsync(async () => {
        throw new Error('Async Boom');
      }, 999);
      expect(failed).toBe(999);
    });

    it('tryCatchAsync returns OperationResult with value or error', async () => {
      const okResult = await tryCatchAsync(async () => ({ data: 'test' }));
      expect(okResult.ok).toBe(true);
      if (okResult.status === 'success') {
        expect(okResult.value.data).toBe('test');
      }

      const errResult = await tryCatchAsync(async () => {
        throw new Error('Async Failure');
      });
      expect(errResult.ok).toBe(false);
      if (errResult.status === 'failure') {
        expect(errResult.error.message).toBe('Async Failure');
      }
    });

    it('safeReadFileAsync returns content or null', async () => {
      const filePath = path.join(tempDir, 'async_data.txt');
      fs.writeFileSync(filePath, 'async content', 'utf-8');
      const content = await safeReadFileAsync(filePath);
      expect(content).toBe('async content');

      const missing = await safeReadFileAsync(path.join(tempDir, 'async_missing.txt'));
      expect(missing).toBeNull();
    });

    it('safeReaddirAsync returns entries or null', async () => {
      const entries = await safeReaddirAsync(tempDir);
      expect(entries).not.toBeNull();

      const missing = await safeReaddirAsync(path.join(tempDir, 'non_existent_dir'));
      expect(missing).toBeNull();
    });
  });
});
