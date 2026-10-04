/**
 * tests/report_utils.test.ts
 *
 * Unit tests for reportUtils shared reporting helpers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  printConsoleHeader,
  printConsoleSummary,
  writeReportFile,
  parseJsonArrayOutput,
  normalizePosixPath,
  parseJsonObjectOutput,
  parseLintResultsToFindings,
  type ValidationSummary
} from '../src/core/reportUtils.ts';

describe('reportUtils', () => {
  let tempDir: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-report-utils-test-'));
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok
    }
    vi.restoreAllMocks();
  });

  describe('printConsoleHeader', () => {
    it('prints formatted header', () => {
      printConsoleHeader('TEST REPORT');
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('printConsoleSummary', () => {
    it('prints verbose summary with errors and warnings', () => {
      const summary: ValidationSummary = {
        title: 'Validation',
        scannedMetrics: { 'Total Files': 10 },
        errors: ['Error 1', 'Error 2'],
        warnings: ['Warning 1']
      };

      printConsoleSummary(summary, true);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('prints non-verbose summary', () => {
      const summary: ValidationSummary = {
        title: 'Compact',
        scannedMetrics: { Files: 5 },
        errors: [],
        warnings: []
      };

      printConsoleSummary(summary, false);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('truncates errors and warnings exceeding sample limit', () => {
      const errors = Array.from({ length: 35 }, (_, i) => `Error ${i + 1}`);
      const warnings = Array.from({ length: 35 }, (_, i) => `Warning ${i + 1}`);
      const summary: ValidationSummary = {
        title: 'Overflow',
        scannedMetrics: {},
        errors,
        warnings
      };

      printConsoleSummary(summary, true);
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('writeReportFile', () => {
    it('writes report text file to disk', async () => {
      const filePath = path.join(tempDir, 'report.txt');
      const summary: ValidationSummary = {
        title: 'File Test',
        scannedMetrics: { MetricA: 42 },
        errors: ['Err1'],
        warnings: ['Warn1']
      };

      await writeReportFile(filePath, summary);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('FILE TEST');
      expect(content).toContain('MetricA: 42');
      expect(content).toContain('Errors (1):');
    });
  });

  describe('parseJsonArrayOutput', () => {
    it('parses valid json array from string', () => {
      expect(parseJsonArrayOutput('[1, 2, 3]')).toEqual([1, 2, 3]);
    });

    it('returns array as-is when input is already an array', () => {
      expect(parseJsonArrayOutput(['a', 'b'])).toEqual(['a', 'b']);
    });

    it('strips Node.js permission and runtime noise', () => {
      const noisy = `(node:123) [PERM0002] SecurityWarning: child-process\n[{"id": "ok"}]`;
      expect(parseJsonArrayOutput(noisy)).toEqual([{ id: 'ok' }]);
    });

    it('returns empty array when input is invalid or empty', () => {
      expect(parseJsonArrayOutput('')).toEqual([]);
      expect(parseJsonArrayOutput('invalid string')).toEqual([]);
    });

    it('throws error when throwOnError is true and json is malformed', () => {
      expect(() => parseJsonArrayOutput('[{invalid}]', { throwOnError: true, toolName: 'test-tool' })).toThrow(/Error al procesar salida JSON/);
    });
  });

  describe('normalizePosixPath', () => {
    it('normalizes path to posix relative path', () => {
      expect(normalizePosixPath('src/file.ts')).toBe('src/file.ts');
      expect(normalizePosixPath('')).toBe('');
      const absPath = path.resolve(process.cwd(), 'src/cli/test.ts');
      expect(normalizePosixPath(absPath)).toBe('src/cli/test.ts');
    });
  });

  describe('parseJsonObjectOutput', () => {
    it('parses string, buffer, or object with stdout', () => {
      expect(parseJsonObjectOutput('{"hello": "world"}')).toEqual({ hello: 'world' });
      expect(parseJsonObjectOutput(Buffer.from('{"buf": 1}'))).toEqual({ buf: 1 });
      expect(parseJsonObjectOutput({ stdout: '{"exec": true}' })).toEqual({ exec: true });
      expect(parseJsonObjectOutput({ stdout: Buffer.from('{"execBuf": true}') })).toEqual({ execBuf: true });
    });

    it('returns null on invalid input or syntax error', () => {
      expect(parseJsonObjectOutput(null)).toBeNull();
      expect(parseJsonObjectOutput('')).toBeNull();
      expect(parseJsonObjectOutput('{invalid json')).toBeNull();
    });
  });

  describe('parseLintResultsToFindings', () => {
    it('converts raw lint file reports into AuditFindings', () => {
      const reports = [
        {
          filePath: '/workspace/src/test.ts',
          errorCount: 1,
          warningCount: 1,
          messages: [
            { ruleId: 'no-any', message: 'Avoid any', line: 10, column: 5 },
            { ruleId: 'no-unused', message: 'Unused var', line: 15 }
          ]
        }
      ];

      const findings = parseLintResultsToFindings(reports, {
        suiteId: 'test_suite',
        suiteName: 'Test Suite',
        ruleId: 'lint-issue',
        ruleDescription: 'Lint issue'
      });
      expect(findings).toHaveLength(2);
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe(normalizePosixPath('/workspace/src/test.ts'));
      expect(findings[0]?.context).toBe('no-any');
      expect(findings[0]?.suiteId).toBe('test_suite');
    });

    it('returns empty array when reports is empty or undefined', () => {
      expect(parseLintResultsToFindings([], {
        suiteId: 'test_suite',
        suiteName: 'Test Suite',
        ruleId: 'lint-issue',
        ruleDescription: 'Lint issue'
      })).toEqual([]);
    });
  });
});
