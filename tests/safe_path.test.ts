/**
 * tests/safe_path.test.ts
 *
 * Unit tests for safePath security utility (Node.js 26+ Native).
 * Verifies directory traversal prevention (CWE-22) and SSRF prevention (CWE-918).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vite-plus/test';

import { setAuditConfig, resetAuditConfig, defineAuditConfig } from '../src/core/auditConfig.ts';
import { isPathIgnored, collectRepositoryFiles } from '../src/core/auditorBase.ts';
import { CANONICAL_IGNORE_DIRS } from '../src/core/canonicalIgnoreRegistry.ts';
import {
  safeResolve,
  safeWriteFileSync,
  safeWriteFile,
  safeReadFile,
  safeFetch,
  safeDevUrl,
  sanitizePath,
  toPosixPath,
  toPosixRelative,
  normalizePosixPath,
  isPathContained
} from '../src/core/safePath.ts';

describe('safePath Core Security Utility', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-safepath-test-'));
    process.env.AUDIT_PROJECT_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.AUDIT_PROJECT_ROOT;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* non-fatal test cleanup */
    }
    vi.restoreAllMocks();
  });

  describe('safeResolve (CWE-22 Traversal Prevention)', () => {
    it('resolves valid subpaths within the project root', () => {
      const res = safeResolve('src', 'components', 'Button.vue');
      expect(res).toBe(path.resolve(tempDir, 'src', 'components', 'Button.vue'));

      const joined = safeResolve('dist', 'assets', 'index.js');
      expect(joined).toBe(path.resolve(tempDir, 'dist', 'assets', 'index.js'));
    });

    it('throws security error when path attempts directory traversal escaping project root', () => {
      expect(() => safeResolve('..', 'secret.txt')).toThrow(/Security Violation CWE-22/);
      expect(() => safeResolve('sub', '..', '..', 'etc', 'passwd')).toThrow(
        /Security Violation CWE-22/
      );
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
      await expect(safeFetch('http://example.com/api')).rejects.toThrow(
        /Security Violation CWE-SSRF: Non-HTTPS/
      );
      await expect(safeFetch('ftp://example.com/file')).rejects.toThrow(
        /Security Violation CWE-SSRF: Non-HTTPS/
      );
    });

    it('rejects hosts not in allowlist', async () => {
      await expect(
        safeFetch('https://evil-hacker.com/steal', undefined, ['localhost', 'api.supabase.co'])
      ).rejects.toThrow(/Security Violation CWE-SSRF: Host/);
    });

    it('allows requests to allowed hosts or subdomains', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })));
      vi.stubGlobal('fetch', mockFetch);

      const res = await safeFetch('https://sub.api.supabase.co/rest/v1', undefined, [
        'supabase.co'
      ]);
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

  describe('toPosixPath, toPosixRelative, normalizePosixPath & isPathContained', () => {
    it('converts relative paths with backslashes to POSIX format', () => {
      expect(toPosixPath('src\\suites\\architecture\\validate.ts')).toBe(
        'src/suites/architecture/validate.ts'
      );
      expect(toPosixPath('.\\src\\index.ts')).toBe('src/index.ts');
    });

    it('converts absolute path to relative POSIX path based on baseDir', () => {
      const base = path.resolve('workspace', 'project');
      const target = path.resolve(base, 'src', 'components', 'Button.vue');
      expect(toPosixPath(target, base)).toBe('src/components/Button.vue');
    });

    it('handles empty string gracefully', () => {
      expect(toPosixPath('')).toBe('');
    });

    it('toPosixRelative aliases toPosixPath with (projectRoot, filePath)', () => {
      const root = path.resolve('my-root');
      const file = path.resolve(root, 'docs', 'guide.md');
      expect(toPosixRelative(root, file)).toBe('docs/guide.md');
    });

    it('normalizePosixPath aliases toPosixPath with (filePath, cwd)', () => {
      const cwd = path.resolve('my-root');
      const file = path.resolve(cwd, 'src', 'main.ts');
      expect(normalizePosixPath(file, cwd)).toBe('src/main.ts');
    });

    it('isPathContained verifies safe directory containment and blocks traversal', () => {
      const root = path.resolve('safe-root');
      expect(isPathContained(root, 'sub/file.ts')).toBe(true);
      expect(isPathContained(root, 'file.ts')).toBe(true);
      expect(isPathContained(root, '../secret.key')).toBe(false);
      expect(isPathContained(root, '../../etc/passwd')).toBe(false);
    });
  });

  describe('isPathIgnored & collectRepositoryFiles (Global Ignore Contracts)', () => {
    beforeEach(() => {
      resetAuditConfig();
    });

    afterEach(() => {
      resetAuditConfig();
    });

    it('identifies all canonical ignore directories', () => {
      expect(CANONICAL_IGNORE_DIRS.has('node_modules')).toBe(true);
      expect(CANONICAL_IGNORE_DIRS.has('dist')).toBe(true);
      expect(CANONICAL_IGNORE_DIRS.has('scratch')).toBe(true);
      expect(CANONICAL_IGNORE_DIRS.has('.git')).toBe(true);
      expect(CANONICAL_IGNORE_DIRS.has('.vitest-cache')).toBe(true);

      expect(isPathIgnored('node_modules/pkg/index.js')).toBe(true);
      expect(isPathIgnored('dist/bundle.js')).toBe(true);
      expect(isPathIgnored('scratch/coverage/report.json')).toBe(true);
      expect(isPathIgnored('sub/nested/dist/main.js')).toBe(true);
    });

    it('respects custom paths.ignoredDirs and paths.ignoreGlobs from project config', () => {
      setAuditConfig(
        defineAuditConfig({
          name: 'custom-ignores-test',
          paths: {
            ignoredDirs: ['legacy-code', 'fixtures'],
            ignoreGlobs: ['**/generated/**', '**/*.generated.ts']
          }
        }),
        tempDir
      );

      expect(isPathIgnored('src/legacy-code/old.ts', [], [], tempDir)).toBe(true);
      expect(isPathIgnored('tests/fixtures/mock.json', [], [], tempDir)).toBe(true);
      expect(isPathIgnored('src/api/generated/client.ts', [], [], tempDir)).toBe(true);
      expect(isPathIgnored('src/models/user.generated.ts', [], [], tempDir)).toBe(true);
      expect(isPathIgnored('src/normal/code.ts', [], [], tempDir)).toBe(false);
    });

    it('collectRepositoryFiles strictly omits files in ignored directories or matching ignore globs', () => {
      const srcDir = path.join(tempDir, 'src');
      const distDir = path.join(tempDir, 'dist');
      const ignoredDir = path.join(srcDir, 'fixtures');

      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(distDir, { recursive: true });
      fs.mkdirSync(ignoredDir, { recursive: true });

      fs.writeFileSync(path.join(srcDir, 'valid.ts'), 'export const v = 1;');
      fs.writeFileSync(path.join(distDir, 'built.ts'), 'export const b = 1;');
      fs.writeFileSync(path.join(ignoredDir, 'mock.ts'), 'export const m = 1;');

      setAuditConfig(
        defineAuditConfig({
          name: 'collect-test',
          paths: {
            ignoredDirs: ['fixtures']
          }
        }),
        tempDir
      );

      const collectedSrc = collectRepositoryFiles(srcDir, tempDir, [], new Set(['.ts']));
      const collectedDist = collectRepositoryFiles(distDir, tempDir, [], new Set(['.ts']));
      const allCollected = [...collectedSrc, ...collectedDist];

      const relCollected = allCollected.map((f) => toPosixRelative(tempDir, f));
      expect(relCollected).toEqual(['src/valid.ts']);
    });
  });
});
