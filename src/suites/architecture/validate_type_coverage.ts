import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
import { executeCliAndReadJson, resolvePackageBin } from '../../cli/cliUtils.ts';

enableCompileCache();

export const DEFAULT_MIN_TYPE_COVERAGE_PERCENT = 95 as const;

export type TypeCoverageRuleId =
  | 'type-coverage-below-threshold'
  | 'type-coverage-untyped-identifier';

export const TYPE_COVERAGE_RULES: readonly TypeCoverageRuleId[] = [
  'type-coverage-below-threshold',
  'type-coverage-untyped-identifier'
] as const;

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
      ruleDescription: 'Tipos: Cobertura de tipos bajo el umbral',
      severity: 'error',
      file: 'tsconfig.json',
      line: 1,
      col: 1,
      context: `${percentStr}% < ${threshold}%`,
      message: `Cobertura de tipos de ${percentStr}% inferior al umbral configurado de ${threshold}% (${correct}/${total} identificadores tipados).`
    });

    // When threshold fails, surface the untyped symbols as diagnostics
    for (const item of report.anys ?? []) {
      const relFile = path.isAbsolute(item.filePath)
        ? path.relative(projectRoot, item.filePath).replace(/\\/g, '/')
        : item.filePath.replace(/\\/g, '/');

      findings.push({
        suiteId: 'validate_type_coverage',
        suiteName: 'TypeScript Quantitative Type Coverage Auditor',
        ruleId: 'type-coverage-untyped-identifier',
        ruleDescription: 'Tipos: Identificador untyped any detectado',
        severity: 'error',
        file: relFile,
        line: item.line,
        col: item.character,
        context: item.text,
        message: `Identificador con tipo any o implícito no tipado: "${item.text}"`
      });
    }
  }

  return findings;
}

export class ValidateTypeCoverageAuditor extends BaseAuditor<TypeCoverageRuleId> {
  constructor(options: { projectRoot?: string } = {}) {
    const effectiveRoot = options.projectRoot ?? process.cwd();
    super({
      capabilities: { heavy: true },
      id: 'validate_type_coverage',
      name: 'TypeScript Quantitative Type Coverage Auditor',
      description: 'Gobernanza cuantitativa de cobertura de tipos estricta',
      family: 'architecture',
      packageName: 'Tipos',
      icon: '📊',
      ruleIds: TYPE_COVERAGE_RULES,
      ruleDescriptions: {
        'type-coverage-below-threshold': 'Cobertura de tipos bajo el umbral',
        'type-coverage-untyped-identifier': 'Identificador untyped any detectado'
      },
      projectRoot: effectiveRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const config = getAuditConfig(this.projectRoot);
    if (config.typeCoverage?.enabled === false) {
      return;
    }

    const scratchDir = path.resolve(this.projectRoot, 'scratch/audits/architecture');
    const cacheDir = path.resolve(this.projectRoot, 'scratch/cache/type-coverage');
    fs.mkdirSync(scratchDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });

    const rawOutPath = path.resolve(scratchDir, 'type-coverage-raw.json');

    if (fs.existsSync(rawOutPath)) {
      try {
        fs.unlinkSync(rawOutPath);
      } catch {
        // catch-ok: cleanup stale report
      }
    }

    const threshold = config.typeCoverage?.atLeast ?? DEFAULT_MIN_TYPE_COVERAGE_PERCENT;
    const isStrict = config.typeCoverage?.strict ?? true;
    const ignoreFiles = config.typeCoverage?.ignoreFiles ?? [];

    const cliFlags = [
      '--json-output',
      '--detail',
      '--show-relative-path',
      '--at-least',
      String(threshold),
      '--cache',
      '--cache-directory',
      cacheDir
    ];

    if (isStrict) {
      cliFlags.push('--strict');
    }

    for (const ignoreFile of ignoreFiles) {
      cliFlags.push('--ignore-files', ignoreFile);
    }

    const resolvedBin = resolvePackageBin('type-coverage', {
      projectRoot: this.projectRoot,
      fallbackRelativeBin: 'bin/type-coverage'
    });

    const command = resolvedBin ? process.execPath : 'npx';
    const finalArgs = resolvedBin
      ? [resolvedBin, ...cliFlags]
      : ['--yes', 'type-coverage', ...cliFlags];

    const report = executeCliAndReadJson<TypeCoverageReport>(command, finalArgs, rawOutPath, {
      cwd: this.projectRoot,
      shell: !resolvedBin
    });
    if (!report) {
      return;
    }

    const percentStr = report.percentString ?? (report.percent?.toFixed(2) ?? '0.00');
    const correct = report.correctCount ?? 0;
    const total = report.totalCount ?? 0;

    this.context.setMetric('Type Coverage', `${percentStr}% (≥${threshold}%)`);
    this.context.setMetric('Typed Identifiers', `${correct}/${total}`);

    const findings = parseTypeCoverageReport(report, threshold, this.projectRoot);
    for (const finding of findings) {
      this.addViolation({
        ruleId: (finding.ruleId as TypeCoverageRuleId) ?? 'type-coverage-below-threshold',
        severity: finding.severity,
        file: finding.file ?? 'tsconfig.json',
        line: finding.line ?? 1,
        context: finding.context ?? finding.message,
        message: finding.message
      });
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateTypeCoverageAuditor());
