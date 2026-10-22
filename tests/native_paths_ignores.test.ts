/**
 * tests/native_paths_ignores.test.ts
 *
 * Validates that standalone auditNativePaths() respects paths.ignoreGlobs and paths.ignoredPatterns
 * declared in .auditor/audit.config.ts instead of hardcoding empty ignores, and accurately detects
 * path violations on unignored files.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect } from 'vite-plus/test';

import { loadAuditConfig } from '../src/core/auditConfig.ts';
import { auditNativePaths } from '../src/suites/architecture/validate_native_paths.ts';

describe('auditNativePaths standalone runner ignores', () => {
  it('respects paths.ignoreGlobs from audit config', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-paths-test-'));
    try {
      const srcDir = path.join(tempDir, 'src');
      const ignoredDir = path.join(srcDir, 'ignored');
      fs.mkdirSync(ignoredDir, { recursive: true });

      // Create an unsafe path concat file inside ignored folder
      const fsReadSink = 'fs.' + 'readFileSync(baseDir + "/" + file);';
      fs.writeFileSync(
        path.join(ignoredDir, 'bad.ts'),
        'import fs from "node:fs";\nconst content = ' + fsReadSink + '\n'
      );

      // Create audit config ignoring src/ignored/**
      const configDir = path.join(tempDir, '.auditor');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'audit.config.json'),
        JSON.stringify({
          name: 'Test',
          paths: {
            srcRoots: ['src'],
            ignoreGlobs: ['src/ignored/**']
          }
        })
      );

      await loadAuditConfig(tempDir);
      const result = auditNativePaths(tempDir);
      const badViolations = result.violations.filter((v) => v.file.includes('ignored/bad.ts'));
      expect(badViolations.length).toBe(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('detects violations on active non-ignored files', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-paths-active-test-'));
    try {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      // Create an unsafe path concat file inside src
      const fsReadSink = 'fs.' + 'readFileSync(baseDir + "/" + file);';
      fs.writeFileSync(
        path.join(srcDir, 'active.ts'),
        'import fs from "node:fs";\nconst content = ' + fsReadSink + '\n'
      );

      const configDir = path.join(tempDir, '.auditor');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'audit.config.json'),
        JSON.stringify({
          name: 'Test',
          paths: {
            srcRoots: ['src'],
            ignoreGlobs: ['src/other/**']
          }
        })
      );

      await loadAuditConfig(tempDir);
      const result = auditNativePaths(tempDir);
      const activeViolations = result.violations.filter((v) => v.file.includes('active.ts'));
      expect(activeViolations.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
