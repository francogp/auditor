/**
 * tests/safe_path.test.ts
 *
 * Unit tests for safePath security utility (Node.js 26+ Native).
 * Verifies directory traversal prevention (CWE-22) and SSRF prevention (CWE-918).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  safeResolve,
  safeJoin,
  safeWriteFileSync,
  safeWriteFile,
  safeReadFile,
  safeFetch,
  safeDevUrl,
  sanitizePath
} from '../src/core/safePath.ts';

describe('safePath Core Security Utility', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-safepath-test-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok: cleanup
    }
    vi.restoreAllMocks();
  });

  describe('safeResolve & safeJoin (CWE-22 Traversal Prevention)', () => {
    it('resolves valid subpaths within the project root', () => {
      const res = safeResolve('src', 'components', 'Button.vue');
      expect(res).toBe(path.resolve(tempDir, 'src', 'components', 'Button.vue'));

      const joined = safeJoin('dist', 'assets', 'index.js');
      expect(joined).toBe(path.resolve(tempDir, 'dist', 'assets', 'index.js'));
    });

    it('throws security error when path attempts directory traversal escaping project root', () => {
      expect(() => safeResolve('..', 'secret.txt')).toThrow(/Security Violation CWE-22/);
      expect(() => safeJoin('sub', '..', '..', 'etc', 'passwd')).toThrow(/Security Violation CWE-22/);
    });

    it('filters empty or falsy segments cleanly', () => {
      const res = safeResolve('', 'src', '', 'utils.ts');
      expect(res).toBe(path.resolve(tempDir, 'src', 'utils.ts'));
    });
  });

  describe('safeWriteFileSync, safeWriteFile & safeReadFile', () => {
    it('writes and reads file synchronously creating nested directories', () => {
      const targetFile = 'nested/deep/directory/test.txt';
      safeWriteFileSync(targetFile, 'sync hello world');

      expect(fs.existsSync(path.resolve(tempDir, targetFile))).toBe(true);
      const readContent = fs.readFileSync(path.resolve(tempDir, targetFile), 'utf-8');
      expect(readContent).toBe('sync hello world');
    });

    it('writes and reads file asynchronously creating nested directories', async () => {
      const targetFile = 'async/nested/file.json';
      const content = JSON.stringify({ ok: true, count: 42 });

      await safeWriteFile(targetFile, content);

      const readBack = await safeReadFile(targetFile);
      expect(readBack).toBe(content);
      expect(JSON.parse(readBack)).toEqual({ ok: true, count: 42 });
    });

    it('supports writing Buffer content', async () => {
      const targetFile = 'buffer/data.bin';
      const buf = Buffer.from([1, 2, 3, 4]);

      await safeWriteFile(targetFile, buf);
      expect(fs.existsSync(path.resolve(tempDir, targetFile))).toBe(true);
    });
  });

  describe('safeFetch (SSRF CWE-918 Prevention)', () => {
    it('rejects non-HTTPS URLs', async () => {
      await expect(safeFetch('http://example.com/api')).rejects.toThrow(/Security Violation CWE-SSRF: Non-HTTPS/);
      await expect(safeFetch('ftp://example.com/file')).rejects.toThrow(/Security Violation CWE-SSRF: Non-HTTPS/);
    });

    it('rejects hosts not in allowlist', async () => {
      await expect(safeFetch('https://evil-hacker.com/steal', undefined, ['localhost', 'api.supabase.co'])).rejects.toThrow(/Security Violation CWE-SSRF: Host/);
    });

    it('allows requests to allowed hosts or subdomains', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })));
      vi.stubGlobal('fetch', mockFetch);

      const res = await safeFetch('https://sub.api.supabase.co/rest/v1', undefined, ['supabase.co']);
      expect(mockFetch).toHaveBeenCalledOnce();
      const json = await res.json();
      expect(json).toEqual({ success: true });
    });
  });

  describe('safeDevUrl', () => {
    it('builds relative URL with query parameters using WHATWG URL API', () => {
      const url = safeDevUrl('api/v1/users', { role: 'admin', page: '2' });
      expect(url).toBe('/api/v1/users?role=admin&page=2');
    });

    it('preserves leading slash when provided', () => {
      const url = safeDevUrl('/health', { check: 'all' });
      expect(url).toBe('/health?check=all');
    });
  });

  describe('sanitizePath', () => {
    it('normalizes path using platform standard normalization and trims whitespace', () => {
      expect(sanitizePath('  src/core/safePath.ts  ')).toBe(path.normalize('src/core/safePath.ts'));
      expect(sanitizePath('')).toBe('');
    });
  });
});
