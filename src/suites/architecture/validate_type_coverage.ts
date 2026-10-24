import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor,
  createUniformRemediationPhases, createRuleCapabilities } from '../../core/auditorBase.ts';
import { deriveCoverageFromRoots } from '../../core/auditCoverage.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { DEFAULT_AUDIT_CONFIG } from '../../core/auditConfigDefaults.ts';
import { toPosixRelative } from '../../core/safePath.ts';
import { safeRmSync } from '../../core/safeUtils.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
import { executeCliAndReadJson, resolvePackageBin } from '../../cli/cliUtils.ts';

enableCompileCache();

export const DEFAULT_MIN_TYPE_COVERAGE_PERCENT = 95 as const;

export const TYPE_COVERAGE_RULES = [
  'type-coverage-below-threshold',
  'type-coverage-untyped-identifier'
] as const;
export type TypeCoverageRuleId = (typeof TYPE_COVERAGE_RULES)[number];

export interface UntypedSymbol {
  readonly filePath: string;
  readonly line: number;
  readonly character: number;
  readonly text: string;
}

export interface TypeCoverageReport {
  readonly correctCount?: number;
  readonly totalCount?: number;
  readonly percent?: number;
  readonly percentString?: string;
  readonly atLeastFailed?: boolean;
  readonly anys?: readonly UntypedSymbol[];
}

/**
 * Parses raw JSON output from type-coverage into canonical AuditFindings.
 */
export function parseTypeCoverageReport(
  report: TypeCoverageReport,
  threshold: number,
  projectRoot: string = process.cwd()
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const percent = report.percent ?? 0;
  const percentStr = report.percentString ?? percent.toFixed(2);
  const correct = report.correctCount ?? 0;
  const total = report.totalCount ?? 0;

  if (percent < threshold) {
    findings.push({
      suiteId: 'validate_type_coverage',
      suiteName: 'TypeScript Quantitative Type Coverage Auditor',
      ruleId: 'type-coverage-below-threshold',
      ruleDescription: 'Types: Type coverage below threshold',
      severity: 'error',
      file: 'tsconfig.json',
      line: 1,
      col: 1,
      context: `${percentStr}% < ${threshold}%`,
      message: `Type coverage of ${percentStr}% is below configured threshold of ${threshold}% (${correct}/${total} identifiers typed).`
    });

    // When threshold fails, surface the untyped symbols as diagnostics
    for (const item of report.anys ?? []) {
      const relFile = toPosixRelative(projectRoot, item.filePath);

      findings.push({
        suiteId: 'validate_type_coverage',
        suiteName: 'TypeScript Quantitative Type Coverage Auditor',
        ruleId: 'type-coverage-untyped-identifier',
        ruleDescription: 'Types: Untyped any identifier detected',
        severity: 'error',
        file: relFile,
        line: item.line,
        col: item.character,
        context: item.text,
        message: `Identifier with any or untyped implicit type: "${item.text}"`
      });
    }
  }

  return findings;
}

export const DEFAULT_TYPE_COVERAGE_THRESHOLD = 95;

export class ValidateTypeCoverageAuditor extends BaseAuditor<TypeCoverageRuleId> {
  constructor(options: { projectRoot?: string } = {}) {
    const effectiveRoot = options.projectRoot ?? process.cwd();
    const config = getAuditConfig(effectiveRoot);
    const codeRoots = config.paths?.codeRoots ?? DEFAULT_AUDIT_CONFIG.paths.codeRoots;
    super({
      usesThirdPartyTool: true,
      requiredPermissions: ['--allow-child-process'],
      thirdPartyToolPolicy: {
        toolName: 'type-coverage',
        fallbackBehavior: 'violation',
        fallbackRuleId: 'type-coverage-below-threshold'
      },
      ruleCapabilities: createRuleCapabilities(TYPE_COVERAGE_RULES, {
        speed: ['heavy', 'full'],
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_type_coverage',
      name: 'TypeScript Quantitative Type Coverage Auditor',
      description: 'Quantitative strict type coverage governance',
      family: 'architecture',
      packageName: 'Types',
      configKey: 'typeCoverage.enabled',
      defaultConfig: { enabled: true, atLeast: DEFAULT_TYPE_COVERAGE_THRESHOLD },
      criticalConfig: {},
      icon: '📊',
      ruleIds: TYPE_COVERAGE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(TYPE_COVERAGE_RULES, 'contracts'),
      ruleDescriptions: {
        'type-coverage-below-threshold': 'Type coverage below threshold',
        'type-coverage-untyped-identifier': 'Untyped any identifier detected'
      },
      ruleRemediations: {
        'type-coverage-below-threshold':
          '📖 REMEDIATION GUIDE: type-coverage-below-threshold\n' +
          '1. Root Cause: The percentage of strongly typed identifiers in the project is below the minimum threshold configured in `.auditor/audit.config.ts` (`config.typeCoverage.atLeast`, default 95%).\n' +
          '2. Diagnosis: Inspect the report emitted by `type-coverage` to view the current percentage and count of symbols resolving to `any`.\n' +
          '3. Canonical Solution:\n' +
          '   a) Review files containing the highest count of `any` or untyped identifiers.\n' +
          '   b) Add explicit function return types, parameter types, and type response/state objects.\n' +
          '   c) Do not use `any`; use `unknown` with type guards or define precise domain interfaces/types.\n' +
          '4. Example / Auto-fix command:\n' +
          '   - Type variables from `const data = JSON.parse(str)` to `const data: unknown = JSON.parse(str)` followed by schema validation with Valibot.',
        'type-coverage-untyped-identifier':
          '📖 REMEDIATION GUIDE: type-coverage-untyped-identifier\n' +
          '1. Root Cause: A specific identifier, property, parameter, or variable resolved to type `any` (explicit or implicitly inferred by the compiler).\n' +
          '2. Diagnosis: Locate the identifier and location (line:col) indicated in the report.\n' +
          '3. Canonical Solution: Assign an explicit type annotation (`: string`, `: Record<string, unknown>`, `: TDomainEntity`) or properly type the function producing it.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Untyped: `function handle(event) { ... }` (event is implicit any)\n' +
          '   ✅ Typed:   `function handle(event: MouseEvent): void { ... }`'
      },
      coverage: {
        include: deriveCoverageFromRoots(codeRoots, new Set(['.ts', '.vue']), effectiveRoot)
          .include,
        source: 'declared-only'
      },
      projectRoot: effectiveRoot
    });
  }

  public override async runAudit(): Promise<void> {
    if (this.isSuiteGatingDisabled('Type coverage disabled in config')) {
      return;
    }

    this.recordExternalScanCount(1);

    const config = getAuditConfig(this.projectRoot);
    const scratchDir = path.resolve(this.projectRoot, 'scratch/audits/architecture');
    const cacheDir = path.resolve(this.projectRoot, 'scratch/cache/type-coverage');
    fs.mkdirSync(scratchDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });

    const rawOutPath = path.resolve(scratchDir, 'type-coverage-raw.json');
    safeRmSync(rawOutPath, { force: true });

    const threshold = config.typeCoverage?.atLeast ?? DEFAULT_MIN_TYPE_COVERAGE_PERCENT;
    const report = this.executeTypeCoverageCli(config, cacheDir, rawOutPath, threshold);
    if (!report) {
      this.markRuleEvaluated('type-coverage-below-threshold');
      this.markRuleEvaluated('type-coverage-untyped-identifier');
      return;
    }

    this.applyCoverageMetricsAndFindings(report, threshold);
  }

  private executeTypeCoverageCli(
    config: ReturnType<typeof getAuditConfig>,
    cacheDir: string,
    rawOutPath: string,
    threshold: number
  ): TypeCoverageReport | null {
    const isStrict = config.typeCoverage?.strict ?? true;
    const ignoreFiles = config.typeCoverage?.ignoreFiles ?? [];

    const tier = this.getExecutionTier();
    const baseFlags = [
      '--json-output',
      '--show-relative-path',
      '--at-least',
      String(threshold),
      '--cache',
      '--cache-directory',
      cacheDir
    ];

    if (isStrict) {
      baseFlags.push('--strict');
    }

    const cliFlags = tier === 'full' ? [...baseFlags, '--detail', '--ignore-catch'] : baseFlags;

    for (const ignoreFile of ignoreFiles) {
      cliFlags.push('--ignore-files', ignoreFile);
    }

    const resolvedBin = resolvePackageBin('type-coverage', {
      projectRoot: this.projectRoot,
      fallbackRelativeBin: 'bin/type-coverage'
    });

    if (!resolvedBin) {
      throw new Error(
        `[validate_type_coverage] The 'type-coverage' executable was not found in node_modules/.bin or local environment. ` +
          `Ensure 'type-coverage' is installed in project dependencies. Using npx is strictly prohibited.`
      );
    }

    const command = process.execPath;
    const finalArgs = [resolvedBin, ...cliFlags];

    return executeCliAndReadJson<TypeCoverageReport>(command, finalArgs, rawOutPath, {
      cwd: this.projectRoot,
      shell: false
    });
  }

  private applyCoverageMetricsAndFindings(report: TypeCoverageReport, threshold: number): void {
    const percentStr = report.percentString ?? report.percent?.toFixed(2) ?? '0.00';
    const correct = report.correctCount ?? 0;
    const total = report.totalCount ?? 0;

    this.context.setMetric('Type Coverage', `${percentStr}% (≥${threshold}%)`);
    this.context.setMetric('Typed Identifiers', `${correct}/${total}`);

    const findings = parseTypeCoverageReport(report, threshold, this.projectRoot);
    for (const ruleId of TYPE_COVERAGE_RULES) {
      this.runSubAuditorSync(ruleId, () => {
        for (const finding of findings) {
          const targetRule =
            (finding.ruleId as TypeCoverageRuleId) ?? 'type-coverage-below-threshold';
          if (targetRule !== ruleId) continue;
          this.addViolation({
            ruleId,
            severity: finding.severity,
            file: finding.file ?? 'tsconfig.json',
            line: finding.line ?? 1,
            context: finding.context ?? finding.message,
            message: finding.message
          });
        }
      });
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateTypeCoverageAuditor());
