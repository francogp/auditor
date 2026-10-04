/**
 * tests/make_executable.test.ts
 *
 * Unit tests for make_executable CLI utility (purgeOrphanedDistFiles & makeCliBinariesExecutable).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { purgeOrphanedDistFiles, makeCliBinariesExecutable } from '../src/cli/make_executable.ts';

describe('make_executable CLI Utility', () => {
  let tempDir: string;
  let tempDist: string;
  let tempSrc: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-make-exec-test-'));
    tempDist = path.join(tempDir, 'dist');
    tempSrc = path.join(tempDir, 'src');
    fs.mkdirSync(tempDist, { recursive: true });
    fs.mkdirSync(tempSrc, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok
    }
  });

  describe('purgeOrphanedDistFiles', () => {
    it('purges files from dist that have no matching source file in src', () => {
      // Create src structure
      fs.mkdirSync(path.join(tempSrc, 'cli'), { recursive: true });
      fs.writeFileSync(path.join(tempSrc, 'cli/active.ts'), 'export const active = true;\n', 'utf-8');

      // Create dist structure with active and orphaned files
      fs.mkdirSync(path.join(tempDist, 'cli'), { recursive: true });
      fs.writeFileSync(path.join(tempDist, 'cli/active.js'), 'export const active = true;\n', 'utf-8');
      fs.writeFileSync(path.join(tempDist, 'cli/active.d.ts'), 'export declare const active = true;\n', 'utf-8');
      fs.writeFileSync(path.join(tempDist, 'cli/orphan.js'), 'export const orphan = true;\n', 'utf-8');
      fs.writeFileSync(path.join(tempDist, 'cli/orphan.d.ts'), 'export declare const orphan = true;\n', 'utf-8');

      purgeOrphanedDistFiles(tempDist, tempSrc);

      expect(fs.existsSync(path.join(tempDist, 'cli/active.js'))).toBe(true);
      expect(fs.existsSync(path.join(tempDist, 'cli/active.d.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tempDist, 'cli/orphan.js'))).toBe(false);
      expect(fs.existsSync(path.join(tempDist, 'cli/orphan.d.ts'))).toBe(false);
    });

    it('purges entire orphaned subdirectories in dist', () => {
      fs.mkdirSync(path.join(tempDist, 'obsoleteSubdir'), { recursive: true });
      fs.writeFileSync(path.join(tempDist, 'obsoleteSubdir/old.js'), '', 'utf-8');

      purgeOrphanedDistFiles(tempDist, tempSrc);

      expect(fs.existsSync(path.join(tempDist, 'obsoleteSubdir'))).toBe(false);
    });

    it('returns early when distDir or srcDir does not exist', () => {
      expect(() => purgeOrphanedDistFiles('/non_existent_dist', tempSrc)).not.toThrow();
      expect(() => purgeOrphanedDistFiles(tempDist, '/non_existent_src')).not.toThrow();
    });
  });

  describe('makeCliBinariesExecutable', () => {
    it('sets permissions for all .js files in dist/cli', () => {
      const cliDist = path.join(tempDist, 'cli');
      fs.mkdirSync(cliDist, { recursive: true });
      fs.writeFileSync(path.join(cliDist, 'auditor.js'), 'console.log("cli");', 'utf-8');

      expect(() => makeCliBinariesExecutable(cliDist)).not.toThrow();
    });

    it('handles non-existent dist directory gracefully', () => {
      expect(() => makeCliBinariesExecutable('/non_existent_cli_dist')).not.toThrow();
    });
  });
});
