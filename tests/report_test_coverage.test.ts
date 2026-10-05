/**
 * @file report_test_coverage.test.ts
 * @description Unit tests for report_test_coverage CLI tool.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { runTestCoverageReport } from '../src/cli/report_test_coverage.ts';

describe('report_test_coverage CLI Tool', () => {
  let originalArgv: string[];
  let originalCwd: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let tmpDir: string;

  beforeEach(() => {
    originalArgv = [...process.argv];
    originalCwd = process.cwd();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`PROCESS_EXIT_${code}`);
    }) as never);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-test-cli-'));
    process.chdir(tmpDir);

    // Setup mock coverage and audit config in tmpDir
    const auditorDir = path.join(tmpDir, '.auditor');
    fs.mkdirSync(auditorDir, { recursive: true });
    fs.writeFileSync(
      path.join(auditorDir, 'audit.config.json'),
      JSON.stringify({
        name: 'test-cli-app',
        paths: { srcRoots: ['src'], codeRoots: ['src'] },
        testCoverage: {
          enabled: true,
          threshold: 80,
          path: 'coverage/coverage-final.json',
          roots: ['src']
        }
      })
    );

    const covDir = path.join(tmpDir, 'coverage');
    fs.mkdirSync(covDir, { recursive: true });

    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'a.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(srcDir, 'b.ts'), 'export const b = 2;');
    fs.writeFileSync(path.join(srcDir, 'untracked.ts'), 'export const c = 3;');

    const fixtureCoverage = {
      [path.join(srcDir, 'a.ts')]: {
        statements: { total: 10, covered: 10, pct: 100 },
        branches: { total: 2, covered: 2, pct: 100 },
        functions: { total: 2, covered: 2, pct: 100 },
        lines: { total: 10, covered: 10, pct: 100 }
      },
      [path.join(srcDir, 'b.ts')]: {
        statements: { total: 10, covered: 4, pct: 40 },
        branches: { total: 2, covered: 0, pct: 0 },
        functions: { total: 2, covered: 1, pct: 50 },
        lines: { total: 10, covered: 4, pct: 40 }
      }
    };
    fs.writeFileSync(path.join(covDir, 'coverage-final.json'), JSON.stringify(fixtureCoverage));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.argv = originalArgv;
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prints usage when --help is supplied', async () => {
    process.argv = ['node', 'report_test_coverage.ts', '--help'];
    await runTestCoverageReport();

    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('AUDITOR TEST COVERAGE CLI');
    expect(output).toContain('--threshold');
    expect(output).toContain('--check');
  });

  it('outputs structured JSON with --json flag', async () => {
    process.argv = ['node', 'report_test_coverage.ts', '--json'];
    await runTestCoverageReport();

    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    const parsed = JSON.parse(output);

    expect(parsed).toHaveProperty('overall');
    expect(parsed).toHaveProperty('buckets');
    expect(parsed).toHaveProperty('directories');
    expect(parsed).toHaveProperty('files');
    expect(parsed).toHaveProperty('untrackedFiles');
    expect(parsed.untrackedFiles).toContain('src/untracked.ts');
  });

  it('renders box table report including TOTAL CONSOLIDADO footer row', async () => {
    process.argv = ['node', 'report_test_coverage.ts'];
    await runTestCoverageReport();

    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('REPORTE DE COBERTURA DE PRUEBAS');
    expect(output).toContain('TOTAL CONSOLIDADO');
    expect(output).toContain('MÉTRICAS GLOBALES DE COBERTURA');
  });

  it('filters files below threshold with --below', async () => {
    process.argv = ['node', 'report_test_coverage.ts', '--below'];
    await runTestCoverageReport();

    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('ARCHIVOS POR DEBAJO DEL UMBRAL');
    expect(output).toContain('src/b.ts');
  });

  it('filters untracked files with --untracked', async () => {
    process.argv = ['node', 'report_test_coverage.ts', '--untracked'];
    await runTestCoverageReport();

    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('ARCHIVOS EN DISCO NO RASTREADOS POR TESTS');
    expect(output).toContain('src/untracked.ts');
  });

  it('shows single file detail with --file', async () => {
    process.argv = ['node', 'report_test_coverage.ts', '--file=src/a.ts'];
    await runTestCoverageReport();

    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('DETALLE DE ARCHIVO: src/a.ts');
    expect(output).toContain('100%');
  });

  it('fails quality check when threshold is not met', async () => {
    process.argv = ['node', 'report_test_coverage.ts', '--check', '--threshold=90'];
    await expect(runTestCoverageReport()).rejects.toThrow('PROCESS_EXIT_1');

    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
    const errorOutput = consoleErrorSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(errorOutput).toContain('FALLO DE CALIDAD');
  });

  it('passes quality check when threshold is met', async () => {
    process.argv = ['node', 'report_test_coverage.ts', '--check', '--threshold=50'];
    await runTestCoverageReport();

    expect(processExitSpy).not.toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('PUERTA DE CALIDAD APROBADA');
  });

  it('filters files with 0% coverage with --zero', async () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.writeFileSync(path.join(srcDir, 'zero.ts'), 'export const z = 0;');
    const covDir = path.join(tmpDir, 'coverage');
    const fixtureCoverage = JSON.parse(fs.readFileSync(path.join(covDir, 'coverage-final.json'), 'utf8'));
    fixtureCoverage[path.join(srcDir, 'zero.ts')] = {
      statements: { total: 5, covered: 0, pct: 0 },
      branches: { total: 0, covered: 0, pct: 100 },
      functions: { total: 0, covered: 0, pct: 100 },
      lines: { total: 5, covered: 0, pct: 0 }
    };
    fs.writeFileSync(path.join(covDir, 'coverage-final.json'), JSON.stringify(fixtureCoverage));

    process.argv = ['node', 'report_test_coverage.ts', '--zero'];
    await runTestCoverageReport();

    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('ARCHIVOS CON 0% DE COBERTURA');
    expect(output).toContain('src/zero.ts');
  });

  it('renders hotspots view when --hotspots is supplied', async () => {
    process.argv = ['node', 'report_test_coverage.ts', '--hotspots'];
    await runTestCoverageReport();

    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('HOTSPOTS DE RIESGO');
  });

  it('handles non-existent file filter gracefully', async () => {
    process.argv = ['node', 'report_test_coverage.ts', '--file=src/non_existent.ts'];
    await runTestCoverageReport();

    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('No se encontró cobertura para el archivo');
  });

  it('filters directory with --dir', async () => {
    process.argv = ['node', 'report_test_coverage.ts', '--dir=src'];
    await runTestCoverageReport();

    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('exits with code 1 when coverage file is missing', async () => {
    fs.rmSync(path.join(tmpDir, 'coverage'), { recursive: true, force: true });
    process.argv = ['node', 'report_test_coverage.ts'];
    await expect(runTestCoverageReport()).rejects.toThrow('PROCESS_EXIT_1');

    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

