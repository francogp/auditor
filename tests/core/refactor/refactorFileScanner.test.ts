import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import {
  isSameFilePath,
  scanProjectSourceFiles,
  extractFileScriptContent,
  forEachSourceScriptLine,
  applyFileTextReplacements,
  executePlanFileReplacements
} from '../../../src/core/refactor/refactorFileScanner.ts';

describe('refactorFileScanner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-scanner-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('isSameFilePath', () => {
    it('returns true for identical paths with different separators or casing', () => {
      const p1 = path.join(tmpDir, 'foo', 'bar.ts');
      const p2 = path.join(tmpDir, 'foo', 'bar.ts').toLowerCase();
      expect(isSameFilePath(p1, p2, tmpDir)).toBe(true);
    });

    it('returns false for completely different paths', () => {
      const p1 = path.join(tmpDir, 'foo.ts');
      const p2 = path.join(tmpDir, 'bar.ts');
      expect(isSameFilePath(p1, p2, tmpDir)).toBe(false);
    });
  });

  describe('scanProjectSourceFiles', () => {
    it('returns empty array when target directory does not exist', () => {
      expect(scanProjectSourceFiles(path.join(tmpDir, 'nonexistent'))).toEqual([]);
    });

    it('scans files matching default extensions', () => {
      fs.writeFileSync(path.join(tmpDir, 'file1.ts'), 'export const a = 1;');
      fs.writeFileSync(path.join(tmpDir, 'file2.vue'), '<template><div /></template>');
      fs.writeFileSync(path.join(tmpDir, 'file3.txt'), 'text');

      const files = scanProjectSourceFiles(tmpDir);
      expect(files.some((f) => f.endsWith('file1.ts'))).toBe(true);
      expect(files.some((f) => f.endsWith('file2.vue'))).toBe(true);
      expect(files.some((f) => f.endsWith('file3.txt'))).toBe(false);
    });
  });

  describe('extractFileScriptContent', () => {
    it('returns null for non-existent file', () => {
      expect(extractFileScriptContent(path.join(tmpDir, 'missing.ts'))).toBeNull();
    });

    it('extracts script content from standard ts file', () => {
      const tsFile = path.join(tmpDir, 'test.ts');
      fs.writeFileSync(tsFile, 'const x = 1;\nconst y = 2;');
      const res = extractFileScriptContent(tsFile);
      expect(res).not.toBeNull();
      expect(res?.lineOffset).toBe(0);
      expect(res?.scriptContent).toContain('const x = 1;');
    });

    it('extracts script setup from vue SFC file', () => {
      const vueFile = path.join(tmpDir, 'Component.vue');
      fs.writeFileSync(
        vueFile,
        `<template>\n  <span>hi</span>\n</template>\n\n<script setup lang="ts">\nconst count = 1;\n</script>`
      );
      const res = extractFileScriptContent(vueFile);
      expect(res).not.toBeNull();
      expect(res?.lineOffset).toBeGreaterThan(0);
      expect(res?.scriptContent).toContain('const count = 1;');
    });
  });

  describe('applyFileTextReplacements and executePlanFileReplacements', () => {
    it('applies text replacements and custom transformers cleanly', () => {
      const targetFile = path.join(tmpDir, 'mutated.ts');
      fs.writeFileSync(targetFile, 'const oldVal = 10;\nconst text = "hello";');

      const result = executePlanFileReplacements(
        tmpDir,
        ['mutated.ts'],
        [
          [
            {
              file: 'mutated.ts',
              original: 'const oldVal = 10;',
              replacement: 'const newVal = 20;'
            }
          ]
        ],
        [
          (content) => {
            if (content.includes('"hello"')) {
              return { content: content.replace('"hello"', '"world"'), count: 1 };
            }
            return { content, count: 0 };
          }
        ]
      );

      expect(result.filesChanged).toBe(1);
      expect(result.changesApplied).toBe(2);

      const updated = fs.readFileSync(targetFile, 'utf8');
      expect(updated).toContain('const newVal = 20;');
      expect(updated).toContain('"world"');
    });

    it('directly applies individual file text replacements', () => {
      const repRes = applyFileTextReplacements(
        'const a = 1;',
        'file.ts',
        path.join(tmpDir, 'file.ts'),
        tmpDir,
        [{ file: 'file.ts', original: 'const a = 1;', replacement: 'const a = 2;' }]
      );
      expect(repRes.count).toBe(1);
      expect(repRes.content).toBe('const a = 2;');
    });

    it('iterates through source script lines with line numbers', () => {
      const tsFile = path.join(tmpDir, 'lines.ts');
      fs.writeFileSync(tsFile, 'lineA\n\nlineB');
      const collected: string[] = [];

      const ok = forEachSourceScriptLine(tsFile, (line, num) => {
        collected.push(`${num}:${line}`);
      });

      expect(ok).toBe(true);
      expect(collected).toEqual(['1:lineA', '3:lineB']);
    });
  });
});
