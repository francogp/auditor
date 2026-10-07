/**
 * @file validate_test_coverage.ts
 * @description Architecture sub-auditor verifying that repository test execution coverage
 * meets configured thresholds and has no untracked blind spots when enforceInAudit is enabled.
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig, buildTestCoverageConfig } from '../../core/auditConfig.ts';
import { analyzeTestCoverage, resolveCoverageFile } from '../../core/testCoverageCore.ts';

enableCompileCache();

export const TEST_COVERAGE_RULES = [
  'test-coverage-below-threshold',
  'test-coverage-missing-report',
  'test-coverage-untracked-files'
] as const;
export type TestCoverageRuleId = (typeof TEST_COVERAGE_RULES)[number];

export interface ValidateTestCoverageOptions {
  projectRoot?: string;
}

export class ValidateTestCoverageAuditor extends BaseAuditor<TestCoverageRuleId> {
  public constructor(options: ValidateTestCoverageOptions = {}) {
    const effectiveRoot = options.projectRoot ?? process.cwd();
    super({
      id: 'validate_test_coverage',
      name: 'Test Execution Coverage Auditor',
      description: 'Gobernanza de cobertura real de pruebas unitarias',
      family: 'architecture',
      packageName: 'Cobertura',
      icon: '🧪',
      ruleIds: TEST_COVERAGE_RULES,
      ruleDescriptions: {
        'test-coverage-below-threshold': 'Cobertura de tests bajo umbral',
        'test-coverage-missing-report': 'Falta archivo de cobertura',
        'test-coverage-untracked-files': 'Archivos en disco sin testear'
      },
      coverage: {
        include: ['src/**/*.ts', 'src/**/*.vue', 'scripts/**/*.ts'],
        source: 'declared-only'
      },
      capabilities: {
        requiresBuild: false
      },
      projectRoot: effectiveRoot
    });
  }

  public override async runAudit(): Promise<void> {
    if (this.isSuiteGatingDisabled('Test coverage enforceInAudit desactivado')) return;

    for (const r of TEST_COVERAGE_RULES) {
      this.markRuleEvaluated(r);
    }

    const projectRoot = this.projectRoot;
    const config = getAuditConfig(projectRoot);
    const resolvedCovConfig = buildTestCoverageConfig(config.testCoverage);
    const threshold = resolvedCovConfig.threshold;

    const coverageFile = resolveCoverageFile(projectRoot, resolvedCovConfig.path);

    if (!coverageFile) {
      this.addViolation({
        ruleId: 'test-coverage-missing-report',
        severity: 'error',
        file: resolvedCovConfig.path,
        line: 1,
        context: 'coverage missing',
        message: `No se encontró el archivo de cobertura de tests en '${resolvedCovConfig.path}'. Ejecuta las pruebas con cobertura antes de auditar.`
      });
      return;
    }

    try {
      const rawJson = JSON.parse(fs.readFileSync(coverageFile, 'utf8')) as Record<string, unknown>; // open-record: Generic parsed coverage JSON dictionary
      const report = analyzeTestCoverage(rawJson, projectRoot, resolvedCovConfig);

      if (report.overall.statements.pct < threshold) {
        this.addViolation({
          ruleId: 'test-coverage-below-threshold',
          severity: 'error',
          file: path.relative(projectRoot, coverageFile).replace(/\\/g, '/'),
          line: 1,
          context: `${report.overall.statements.pct}% < ${threshold}%`,
          message: `Cobertura global de statements (${report.overall.statements.pct}%) inferior al umbral configurado de ${threshold}% (${report.overall.statements.covered}/${report.overall.statements.total} sentencias cubiertas).`
        });
      }

      if (report.untrackedFiles.length > 0) {
        this.addViolation({
          ruleId: 'test-coverage-untracked-files',
          severity: 'warning',
          file: report.untrackedFiles[0]!,
          line: 1,
          context: 'untracked files',
          message: `Se detectaron ${report.untrackedFiles.length} archivo(s) en disco que nunca fueron ejecutados por los tests (ej: ${report.untrackedFiles.slice(0, 3).join(', ')}).`
        });
      }
    } catch (err: unknown) {
      this.addViolation({
        ruleId: 'test-coverage-missing-report',
        severity: 'error',
        file: path.relative(projectRoot, coverageFile).replace(/\\/g, '/'),
        line: 1,
        context: 'parse error',
        message: `Error analizando reporte de cobertura: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateTestCoverageAuditor());
