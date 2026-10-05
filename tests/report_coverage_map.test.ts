import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  parseCoverageMapCliArgs,
  renderDirectorySummaryTable,
  renderFilesTable,
  runCoverageMapReport,
  type CoverageMapResult
} from '../src/cli/report_coverage_map.ts';

describe('report_coverage_map', () => {
  let sandboxDir: string;

  beforeEach(() => {
    sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-cov-map-'));
  });

  afterEach(() => {
    fs.rmSync(sandboxDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('parseCoverageMapCliArgs', () => {
    it('parses empty args to default options', () => {
      const opts = parseCoverageMapCliArgs([]);
      expect(opts).toEqual({});
    });

    it('parses flags correctly', () => {
      const opts = parseCoverageMapCliArgs([
        '--json',
        '--files',
        '--uncovered',
        '--degraded',
        '--run-id',
        'run-123'
      ]);
      expect(opts.jsonOutput).toBe(true);
      expect(opts.filesOnly).toBe(true);
      expect(opts.uncoveredOnly).toBe(true);
      expect(opts.degradedOnly).toBe(true);
      expect(opts.runId).toBe('run-123');
    });

    it('parses --run-id=inline format', () => {
      const opts = parseCoverageMapCliArgs(['--run-id=run-abc']);
      expect(opts.runId).toBe('run-abc');
    });
  });

  describe('renderDirectorySummaryTable and renderFilesTable', () => {
    const mockResult: CoverageMapResult = {
      runId: 'test-run',
      totalTracked: 3,
      totalCovered: 1,
      totalDegraded: 1,
      totalUncovered: 1,
      totalExempt: 0,
      overallCoveragePercent: 66.7,
      directories: [
        {
          directory: 'src/core',
          total: 2,
          covered: 1,
          degraded: 1,
          uncovered: 0,
          exempt: 0,
          coveragePercent: 100
        },
        {
          directory: '.',
          total: 1,
          covered: 0,
          degraded: 0,
          uncovered: 1,
          exempt: 0,
          coveragePercent: 0
        }
      ],
      files: [
        {
          file: 'src/core/utils.ts',
          status: 'covered',
          coveringSuites: ['validate_eslint', 'validate_types', 'validate_ast', 'validate_misc'],
          degradedPolicies: []
        },
        {
          file: 'src/core/legacy.ts',
          status: 'degraded',
          coveringSuites: ['validate_eslint'],
          degradedPolicies: [{ id: 'exemptFiles', kind: 'configured', configKey: 'paths.exemptFiles', silences: 'todo', matches: () => true }]
        },
        {
          file: 'scratch.txt',
          status: 'exempt',
          coveringSuites: [],
          degradedPolicies: [],
          exemptionReason: 'Directorio/archivo canónico ignorado (dist/scratch/etc)'
        },
        {
          file: 'unknown.ts',
          status: 'uncovered',
          coveringSuites: [],
          degradedPolicies: []
        }
      ]
    };

    it('renders directory summary table with TOTAL CONSOLIDADO', () => {
      const table = renderDirectorySummaryTable(mockResult);
      expect(table).toContain('DIRECTORIO / MÓDULO');
      expect(table).toContain('TOTAL CONSOLIDADO');
      expect(table).toContain('src/core');
      expect(table).toContain('(archivos raíz)');
    });

    it('renders files table with status labels', () => {
      const table = renderFilesTable(mockResult.files);
      expect(table).toContain('ARCHIVO VERSIONADO');
      expect(table).toContain('TOTAL CONSOLIDADO');
      expect(table).toContain('CUBIERTO');
      expect(table).toContain('DEGRADADO');
      expect(table).toContain('EXENTO');
      expect(table).toContain('DESCUBIERTO');
    });
  });

  describe('runCoverageMapReport', () => {
    it('outputs json when jsonOutput is true', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runCoverageMapReport({
        projectRoot: process.cwd(),
        jsonOutput: true
      });
      expect(logSpy).toHaveBeenCalled();
      const output = JSON.parse(logSpy.mock.calls[0]![0]);
      expect(output).toHaveProperty('totalTracked');
      expect(output).toHaveProperty('directories');
    });

    it('renders uncovered view when uncoveredOnly is true', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runCoverageMapReport({
        projectRoot: process.cwd(),
        uncoveredOnly: true
      });
      expect(logSpy).toHaveBeenCalled();
    });

    it('renders degraded view when degradedOnly is true', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runCoverageMapReport({
        projectRoot: process.cwd(),
        degradedOnly: true
      });
      expect(logSpy).toHaveBeenCalled();
    });

    it('renders files view when filesOnly is true', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runCoverageMapReport({
        projectRoot: process.cwd(),
        filesOnly: true
      });
      expect(logSpy).toHaveBeenCalled();
    });

    it('renders default summary view', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runCoverageMapReport({
        projectRoot: process.cwd()
      });
      expect(logSpy).toHaveBeenCalled();
    });
  });
});
