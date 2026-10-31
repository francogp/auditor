/**
 * @file validate_test_coverage.ts
 * @description Architecture sub-auditor verifying that repository test execution coverage
 * meets configured thresholds and has no untracked blind spots when enforceInAudit is enabled.
 */

import fs from 'node:fs';
import { enableCompileCache } from 'node:module';

import { getAuditConfig, buildTestCoverageConfig } from '../../core/auditConfig.ts';
import { DEFAULT_AUDIT_CONFIG } from '../../core/auditConfigDefaults.ts';
import { deriveCoverageFromRoots } from '../../core/auditCoverage.ts';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  createRuleCapabilities
} from '../../core/auditorBase.ts';
import { isProductionEnvironment } from '../../core/auditorEnvironment.ts';
import { toPosixRelative } from '../../core/safePath.ts';
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

export const DEFAULT_COVERAGE_THRESHOLD = 80;

export class ValidateTestCoverageAuditor extends BaseAuditor<TestCoverageRuleId> {
  public constructor(options: ValidateTestCoverageOptions = {}) {
    const effectiveRoot = options.projectRoot ?? process.cwd();
    const config = getAuditConfig(effectiveRoot);
    const codeRoots = config.paths?.codeRoots ?? DEFAULT_AUDIT_CONFIG.paths.codeRoots;
    super({
      ruleFixers: {},
      usesThirdPartyTool: false,
      requiredPermissions: [],
      cachePaths: ['coverage', '.vitest-cache', 'test-results'],
      id: 'validate_test_coverage',
      name: 'Test Execution Coverage Auditor',
      description: 'Governance of actual unit test coverage',
      family: 'architecture',
      packageName: 'Coverage',
      configKey: 'testCoverage.enforceInAudit',
      defaultConfig: {
        enabled: true,
        enforceInAudit: true,
        threshold: DEFAULT_COVERAGE_THRESHOLD,
        path: 'scratch/coverage/coverage-final.json'
      },
      criticalConfig: {},
      icon: '🧪',
      ruleIds: TEST_COVERAGE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(TEST_COVERAGE_RULES, 'polish'),
      ruleDescriptions: {
        'test-coverage-below-threshold': 'Test coverage below threshold',
        'test-coverage-missing-report': 'Missing coverage report file',
        'test-coverage-untracked-files': 'Untested files on disk'
      },
      ruleRemediations: {
        'test-coverage-below-threshold':
          '📖 REMEDIATION GUIDE: test-coverage-below-threshold\n' +
          '1. Root Cause: Unit test code coverage is below the minimum required threshold configured in `.auditor/audit.config.ts` (`config.testCoverage.threshold`, default 80%).\n' +
          '2. Diagnosis: Inspect the coverage percentage reported by the auditor or open `scratch/coverage/index.html`.\n' +
          '3. Canonical Solution:\n' +
          '   a) Identify files with low coverage using `npm run auditor:coverage --below`.\n' +
          '   b) Add unit tests in `tests/` covering untested branches, error conditions, and functions.\n' +
          '   c) If utility files or barrels are legitimately exempt, configure `testCoverage.exemptGlobs` in `.auditor/audit.config.ts`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run test:coverage`',
        'test-coverage-missing-report':
          '📖 REMEDIATION GUIDE: test-coverage-missing-report\n' +
          '1. Root Cause: The test coverage report was not found at the configured path (default `scratch/coverage/coverage-final.json`).\n' +
          '2. Diagnosis: Vitest has not yet run with coverage or generated artifacts in another location.\n' +
          '3. Canonical Solution:\n' +
          '   a) Run `npm run test:coverage` or `vp test --coverage`.\n' +
          '   b) Ensure `vite.config.ts` specifies `test.coverage.reportsDirectory = "scratch/coverage"` and `provider = "v8"`.\n' +
          '   c) Verify that `@vitest/coverage-v8` is installed in `devDependencies`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run test:coverage`',
        'test-coverage-untracked-files':
          '📖 REMEDIATION GUIDE: test-coverage-untracked-files\n' +
          '1. Root Cause: Source files in `src/` were never imported or executed during test suite runs (orphaned untested modules).\n' +
          '2. Diagnosis: Inspect the list of untracked files via `npm run auditor:findings rule=test-coverage-untracked-files flat`.\n' +
          '3. Canonical Solution:\n' +
          '   a) Create unit test files in `tests/` for each untracked source file.\n' +
          '   b) If a file is a pure barrel re-export or type definition without runtime logic, add to `testCoverage.exemptGlobs` in `.auditor/audit.config.ts`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run test:coverage`'
      },
      coverage: {
        include: deriveCoverageFromRoots(codeRoots, new Set(['.ts', '.vue']), effectiveRoot)
          .include,
        source: 'declared-only'
      },
      ruleCapabilities: createRuleCapabilities(TEST_COVERAGE_RULES, {
        speed: 'light',
        phase: 'normal',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      projectRoot: effectiveRoot
    });
  }

  public override async runAudit(): Promise<void> {
    if (isProductionEnvironment()) {
      this.markSkipped('Test coverage skipped in production environment (AUDITOR_ENV=production)');
      return;
    }

    if (this.isSuiteGatingDisabled('Test coverage enforceInAudit disabled')) return;

    const projectRoot = this.projectRoot;
    const config = getAuditConfig(projectRoot);
    const resolvedCovConfig = buildTestCoverageConfig(config.testCoverage);
    const threshold = resolvedCovConfig.threshold;

    let coverageFile: string | null = null;
    this.runSubAuditorSync('test-coverage-missing-report', () => {
      coverageFile = resolveCoverageFile(projectRoot, resolvedCovConfig.path);
      if (!coverageFile) {
        this.addViolation({
          ruleId: 'test-coverage-missing-report',
          severity: 'error',
          file: resolvedCovConfig.path,
          line: 1,
          context: 'coverage missing',
          message: `Test coverage report file not found at '${resolvedCovConfig.path}'. Run unit tests with coverage ('vp test --coverage' or 'npm run test:coverage') before auditing.`
        });
      }
    });

    if (!coverageFile) {
      for (const r of ['test-coverage-below-threshold', 'test-coverage-untracked-files'] as const) {
        this.runSubAuditorSync(r, () => {
          this.markRuleNotApplicable(r, 'Coverage report unavailable');
        });
      }
      return;
    }

    try {
      const rawJson = JSON.parse(fs.readFileSync(coverageFile, 'utf8')) as Record<string, unknown>; // open-record: Generic parsed coverage JSON dictionary
      const report = analyzeTestCoverage(rawJson, projectRoot, resolvedCovConfig);

      this.runSubAuditorSync('test-coverage-below-threshold', () => {
        if (report.overall.statements.pct < threshold) {
          this.addViolation({
            ruleId: 'test-coverage-below-threshold',
            severity: 'error',
            file: toPosixRelative(projectRoot, coverageFile!),
            line: 1,
            context: `${report.overall.statements.pct}% < ${threshold}%`,
            message: `Global statement coverage (${report.overall.statements.pct}%) is below the configured threshold of ${threshold}% (${report.overall.statements.covered}/${report.overall.statements.total} statements covered).`
          });
        }
      });

      this.runSubAuditorSync('test-coverage-untracked-files', () => {
        for (const file of report.untrackedFiles) {
          this.addViolation({
            ruleId: 'test-coverage-untracked-files',
            severity: 'warning',
            file,
            line: 1,
            context: 'untracked file',
            message: `File ${file} on disk was never executed by unit tests.`
          });
        }
      });
    } catch (err: unknown) {
      this.addViolation({
        ruleId: 'test-coverage-missing-report',
        severity: 'error',
        file: toPosixRelative(projectRoot, coverageFile),
        line: 1,
        context: 'parse error',
        message: `Error analyzing coverage report: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateTestCoverageAuditor());
