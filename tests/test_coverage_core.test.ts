/**
 * @file test_coverage_core.test.ts
 * @description Unit tests for testCoverageCore engine.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  calculateMetric,
  determineCoverageStatus,
  compressLineRanges,
  extractUncoveredLines,
  isPathExempt,
  parseIstanbulCoverage,
  computeDirectoryBreakdown,
  computeBucketCounts,
  correlateComplexityHotspots,
  analyzeTestCoverage,
  findUntrackedFiles
} from '../src/core/testCoverageCore.ts';
import type { AuditTestCoverageConfig } from '../src/core/auditConfig.ts';

describe('testCoverageCore', () => {
  describe('calculateMetric', () => {
    it('handles zero total gracefully returning 100%', () => {
      const metric = calculateMetric(0, 0);
      expect(metric).toEqual({ total: 0, covered: 0, pct: 100 });
    });

    it('calculates accurate rounded percentage', () => {
      const metric = calculateMetric(2, 3);
      expect(metric.total).toBe(3);
      expect(metric.covered).toBe(2);
      expect(metric.pct).toBe(66.67);
    });

    it('calculates 100% when all covered', () => {
      const metric = calculateMetric(10, 10);
      expect(metric).toEqual({ total: 10, covered: 10, pct: 100 });
    });
  });

  describe('determineCoverageStatus', () => {
    it('returns untested for 0%', () => {
      expect(determineCoverageStatus(0)).toBe('untested');
    });

    it('returns excellent for >= threshold', () => {
      expect(determineCoverageStatus(80, 80)).toBe('excellent');
      expect(determineCoverageStatus(95, 80)).toBe('excellent');
    });

    it('returns acceptable for 50-79%', () => {
      expect(determineCoverageStatus(50, 80)).toBe('acceptable');
      expect(determineCoverageStatus(79.9, 80)).toBe('acceptable');
    });

    it('returns low for < 50%', () => {
      expect(determineCoverageStatus(49.9, 80)).toBe('low');
      expect(determineCoverageStatus(1, 80)).toBe('low');
    });
  });

  describe('compressLineRanges', () => {
    it('returns empty array for empty input', () => {
      expect(compressLineRanges([])).toEqual([]);
    });

    it('formats single numbers and contiguous ranges', () => {
      const ranges = compressLineRanges([1, 2, 3, 5, 8, 9, 10, 15]);
      expect(ranges).toEqual(['1-3', '5', '8-10', '15']);
    });

    it('deduplicates and sorts inputs', () => {
      const ranges = compressLineRanges([10, 9, 8, 9, 8]);
      expect(ranges).toEqual(['8-10']);
    });
  });

  describe('extractUncoveredLines', () => {
    it('extracts uncovered lines from raw "l" line map', () => {
      const raw = {
        l: { '10': 1, '11': 0, '12': 0, '15': 1, '20': 0 }
      };
      const uncov = extractUncoveredLines(raw);
      expect(uncov).toEqual(['11-12', '20']);
    });

    it('extracts uncovered lines from statementMap and hit count "s"', () => {
      const raw = {
        statementMap: {
          '0': { start: { line: 1 }, end: { line: 3 } },
          '1': { start: { line: 5 }, end: { line: 5 } },
          '2': { start: { line: 8 }, end: { line: 9 } }
        },
        s: {
          '0': 1,
          '1': 0,
          '2': 0
        }
      };
      const uncov = extractUncoveredLines(raw);
      expect(uncov).toEqual(['5', '8-9']);
    });
  });

  describe('isPathExempt', () => {
    it('matches exact paths and directory prefixes', () => {
      expect(isPathExempt('src/legacy/old.ts', ['src/legacy'])).toBe(true);
      expect(isPathExempt('src/legacy/nested/old.ts', ['src/legacy'])).toBe(true);
      expect(isPathExempt('src/other.ts', ['src/legacy'])).toBe(false);
    });

    it('matches wildcard globs', () => {
      expect(isPathExempt('src/types/generated.d.ts', ['src/types/*.d.ts'])).toBe(true);
      expect(isPathExempt('src/sub/foo.gen.ts', ['**/*.gen.ts'])).toBe(true);
      expect(isPathExempt('src/sub/foo.ts', ['**/*.gen.ts'])).toBe(false);
    });
  });

  describe('parseIstanbulCoverage', () => {
    const config: Required<AuditTestCoverageConfig> = {
      enabled: true,
      threshold: 80,
      path: 'coverage/coverage-final.json',
      runCommand: 'npm test -- --coverage',
      roots: ['src'],
      extensions: ['.ts'],
      exemptGlobs: ['src/ignored.ts'],
      directoryThresholds: {},
      enforceInAudit: false
    };

    it('parses detailed Istanbul JSON and applies exemption', () => {
      const rawIstanbul = {
        '/app/src/core/math.ts': {
          path: '/app/src/core/math.ts',
          statementMap: {
            '0': { start: { line: 1 }, end: { line: 1 } },
            '1': { start: { line: 2 }, end: { line: 2 } }
          },
          s: { '0': 1, '1': 1 },
          fnMap: { '0': { name: 'add' } },
          f: { '0': 1 },
          branchMap: {},
          b: {}
        },
        '/app/src/core/parser.ts': {
          path: '/app/src/core/parser.ts',
          statementMap: {
            '0': { start: { line: 1 }, end: { line: 1 } },
            '1': { start: { line: 2 }, end: { line: 2 } }
          },
          s: { '0': 1, '1': 0 },
          fnMap: {},
          f: {},
          branchMap: { '0': { locations: [] } },
          b: { '0': [1, 0] }
        },
        '/app/src/ignored.ts': {
          path: '/app/src/ignored.ts',
          statementMap: { '0': { start: { line: 1 }, end: { line: 1 } } },
          s: { '0': 0 },
          fnMap: {},
          f: {},
          branchMap: {},
          b: {}
        }
      };

      const { files, overall } = parseIstanbulCoverage(rawIstanbul, '/app', config);

      expect(files).toHaveLength(2);
      expect(files[0]!.relPath).toBe('src/core/math.ts');
      expect(files[0]!.statements.pct).toBe(100);
      expect(files[0]!.status).toBe('excellent');

      expect(files[1]!.relPath).toBe('src/core/parser.ts');
      expect(files[1]!.statements.pct).toBe(50);
      expect(files[1]!.branches.pct).toBe(50);
      expect(files[1]!.status).toBe('acceptable');

      // Overall: 3 covered out of 4 statements = 75%
      expect(overall.statements).toEqual({ total: 4, covered: 3, pct: 75 });
    });

    it('parses summary-style coverage items', () => {
      const rawSummary = {
        '/app/src/util.ts': {
          statements: { total: 10, covered: 9, pct: 90 },
          branches: { total: 4, covered: 4, pct: 100 },
          functions: { total: 2, covered: 2, pct: 100 },
          lines: { total: 10, covered: 9, pct: 90 }
        }
      };

      const { files, overall } = parseIstanbulCoverage(rawSummary, '/app', config);
      expect(files).toHaveLength(1);
      expect(files[0]!.statements.pct).toBe(90);
      expect(overall.statements.pct).toBe(90);
    });
  });

  describe('computeDirectoryBreakdown & computeBucketCounts', () => {
    it('aggregates file metrics by directory', () => {
      const files = [
        {
          filePath: '/app/src/core/a.ts',
          relPath: 'src/core/a.ts',
          statements: { total: 10, covered: 8, pct: 80 },
          branches: { total: 2, covered: 2, pct: 100 },
          functions: { total: 2, covered: 2, pct: 100 },
          lines: { total: 10, covered: 8, pct: 80 },
          uncoveredLines: ['9-10'],
          status: 'excellent' as const
        },
        {
          filePath: '/app/src/core/b.ts',
          relPath: 'src/core/b.ts',
          statements: { total: 10, covered: 4, pct: 40 },
          branches: { total: 2, covered: 0, pct: 0 },
          functions: { total: 2, covered: 1, pct: 50 },
          lines: { total: 10, covered: 4, pct: 40 },
          uncoveredLines: ['5-10'],
          status: 'low' as const
        },
        {
          filePath: '/app/src/cli/c.ts',
          relPath: 'src/cli/c.ts',
          statements: { total: 5, covered: 0, pct: 0 },
          branches: { total: 0, covered: 0, pct: 100 },
          functions: { total: 1, covered: 0, pct: 0 },
          lines: { total: 5, covered: 0, pct: 0 },
          uncoveredLines: ['1-5'],
          status: 'untested' as const
        }
      ];

      const dirs = computeDirectoryBreakdown(files, ['src']);
      expect(dirs).toHaveLength(2);

      const cliDir = dirs.find(d => d.directory === 'src/cli')!;
      expect(cliDir.fileCount).toBe(1);
      expect(cliDir.statements.pct).toBe(0);

      const coreDir = dirs.find(d => d.directory === 'src/core')!;
      expect(coreDir.fileCount).toBe(2);
      expect(coreDir.statements.total).toBe(20);
      expect(coreDir.statements.covered).toBe(12);
      expect(coreDir.statements.pct).toBe(60);

      const buckets = computeBucketCounts(files, 3, 80);
      expect(buckets.excellent).toBe(1);
      expect(buckets.acceptable).toBe(0);
      expect(buckets.low).toBe(1);
      expect(buckets.untested).toBe(1);
      expect(buckets.untracked).toBe(3);
    });
  });

  describe('correlateComplexityHotspots', () => {
    it('ranks files by riskScore = complexity * (1 - coverage / 100)', () => {
      const files = [
        {
          filePath: '/app/src/a.ts',
          relPath: 'src/a.ts',
          statements: { total: 100, covered: 90, pct: 90 },
          branches: { total: 10, covered: 9, pct: 90 },
          functions: { total: 10, covered: 9, pct: 90 },
          lines: { total: 100, covered: 90, pct: 90 },
          uncoveredLines: [],
          status: 'excellent' as const
        },
        {
          filePath: '/app/src/b.ts',
          relPath: 'src/b.ts',
          statements: { total: 100, covered: 20, pct: 20 },
          branches: { total: 10, covered: 2, pct: 20 },
          functions: { total: 10, covered: 2, pct: 20 },
          lines: { total: 100, covered: 20, pct: 20 },
          uncoveredLines: ['21-100'],
          status: 'low' as const
        }
      ];

      const complexityMap = new Map<string, number>([
        ['src/a.ts', 50], // risk: 50 * 0.1 = 5.0
        ['src/b.ts', 40]  // risk: 40 * 0.8 = 32.0
      ]);

      const hotspots = correlateComplexityHotspots(files, complexityMap);
      expect(hotspots).toHaveLength(2);
      expect(hotspots[0]!.relPath).toBe('src/b.ts');
      expect(hotspots[0]!.riskScore).toBe(32);
      expect(hotspots[1]!.relPath).toBe('src/a.ts');
      expect(hotspots[1]!.riskScore).toBe(5);
    });
  });

  describe('findUntrackedFiles', () => {
    it('detects source files on disk omitted from coverage', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-cov-test-'));
      try {
        const srcDir = path.join(tmpDir, 'src');
        fs.mkdirSync(srcDir, { recursive: true });

        fs.writeFileSync(path.join(srcDir, 'covered.ts'), 'export const a = 1;');
        fs.writeFileSync(path.join(srcDir, 'untracked.ts'), 'export const b = 2;');
        fs.writeFileSync(path.join(srcDir, 'helper.test.ts'), 'test()');

        const coveredSet = new Set(['src/covered.ts']);
        const config: Required<AuditTestCoverageConfig> = {
          enabled: true,
          threshold: 80,
          path: 'coverage.json',
          runCommand: '',
          roots: ['src'],
          extensions: ['.ts'],
          exemptGlobs: [],
          directoryThresholds: {},
          enforceInAudit: false
        };

        const untracked = findUntrackedFiles(tmpDir, coveredSet, config);
        expect(untracked).toEqual(['src/untracked.ts']);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('analyzeTestCoverage', () => {
    it('orchestrates complete test coverage report', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-cov-e2e-'));
      try {
        const srcDir = path.join(tmpDir, 'src');
        fs.mkdirSync(srcDir, { recursive: true });
        fs.writeFileSync(path.join(srcDir, 'active.ts'), 'export const x = 1;');

        const rawJson = {
          [path.join(tmpDir, 'src/active.ts')]: {
            statements: { total: 10, covered: 10, pct: 100 },
            branches: { total: 2, covered: 2, pct: 100 },
            functions: { total: 1, covered: 1, pct: 100 },
            lines: { total: 10, covered: 10, pct: 100 }
          }
        };

        const config: Required<AuditTestCoverageConfig> = {
          enabled: true,
          threshold: 80,
          path: 'coverage.json',
          runCommand: '',
          roots: ['src'],
          extensions: ['.ts'],
          exemptGlobs: [],
          directoryThresholds: {},
          enforceInAudit: false
        };

        const report = analyzeTestCoverage(rawJson, tmpDir, config);
        expect(report.overall.statements.pct).toBe(100);
        expect(report.buckets.excellent).toBe(1);
        expect(report.untrackedFiles).toEqual([]);
        expect(report.directories).toHaveLength(1);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
