/**
 * tests/cli_utils.test.ts
 *
 * Unit tests for CLI utilities.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import {
  isMainModule,
  resolvePackageBin,
  resolveNodeModuleBin,
  executeCliToFile,
  executeCliAndReadJson,
  resolveCoverageArgs
} from '../src/cli/cliUtils.ts';

describe('cliUtils', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-cli-utils-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok
    }
  });

  describe('isMainModule', () => {
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

  describe('resolveNodeModuleBin', () => {
    it('resolves binary path within node_modules', () => {
      const resolved = resolveNodeModuleBin(tempDir, 'stylelint/bin/stylelint.mjs');
      expect(resolved).toBe(path.resolve(tempDir, 'node_modules/stylelint/bin/stylelint.mjs'));
    });
  });

  describe('resolvePackageBin', () => {
    it('resolves binary from existing installed package', () => {
      const bin = resolvePackageBin('typescript', { projectRoot: process.cwd() });
      expect(bin).toBeDefined();
    });

    it('returns null for non-existent package', () => {
      const bin = resolvePackageBin('non_existent_fake_package_xyz');
      expect(bin).toBeNull();
    });
  });

  describe('executeCliToFile & executeCliAndReadJson', () => {
    it('executes command and pipes output directly to file', () => {
      const outPath = path.join(tempDir, 'output.json');
      executeCliToFile(process.execPath, ['-e', 'console.log(JSON.stringify({ ok: true }))'], outPath, { shell: false });

      expect(fs.existsSync(outPath)).toBe(true);
      const content = fs.readFileSync(outPath, 'utf-8');
      expect(content).toContain('"ok":true');
    });

    it('executes command and reads structured JSON payload cleanly', () => {
      const outPath = path.join(tempDir, 'parsed.json');
      const data = executeCliAndReadJson<{ count: number }>(
        process.execPath,
        ['-e', 'console.log(JSON.stringify({ count: 42 }))'],
        outPath,
        { shell: false }
      );

      expect(data).toEqual({ count: 42 });
    });

    it('returns null when tool outputs invalid JSON', () => {
      const outPath = path.join(tempDir, 'invalid.txt');
      const data = executeCliAndReadJson<{ count: number }>(
        process.execPath,
        ['-e', 'console.log("NOT A JSON")'],
        outPath,
        { shell: false }
      );

      expect(data).toBeNull();
    });
  });

  describe('resolveCoverageArgs', () => {
    it('returns empty array when coverage file is absent', () => {
      const args = resolveCoverageArgs(tempDir);
      expect(args).toEqual([]);
    });

    it('returns --coverage argument when coverage file exists in projectRoot', () => {
      const covDir = path.join(tempDir, 'coverage');
      fs.mkdirSync(covDir, { recursive: true });
      fs.writeFileSync(path.join(covDir, 'coverage-final.json'), '{}', 'utf-8');

      const args = resolveCoverageArgs(tempDir);
      expect(args).toContain('--coverage');
      expect(args[1]).toBe(path.resolve(covDir, 'coverage-final.json'));
    });
  });
});
