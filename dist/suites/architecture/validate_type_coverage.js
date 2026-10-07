import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { executeCliAndReadJson, resolvePackageBin } from "../../cli/cliUtils.js";
enableCompileCache();
export const DEFAULT_MIN_TYPE_COVERAGE_PERCENT = 95;
export const TYPE_COVERAGE_RULES = [
    'type-coverage-below-threshold',
    'type-coverage-untyped-identifier'
];
/**
 * Parses raw JSON output from type-coverage into canonical AuditFindings.
 */
export function parseTypeCoverageReport(report, threshold, projectRoot = process.cwd()) {
    const findings = [];
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
export class ValidateTypeCoverageAuditor extends BaseAuditor {
    constructor(options = {}) {
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
            coverage: {
                include: ['src/**/*.ts', 'src/**/*.vue', 'scripts/**/*.ts'],
                source: 'declared-only'
            },
            projectRoot: effectiveRoot
        });
    }
    async runAudit() {
        if (this.isSuiteGatingDisabled('Type coverage desactivado en config')) {
            return;
        }
        this.recordExternalScanCount(1);
        for (const r of TYPE_COVERAGE_RULES) {
            this.markRuleEvaluated(r);
        }
        const config = getAuditConfig(this.projectRoot);
        const scratchDir = path.resolve(this.projectRoot, 'scratch/audits/architecture');
        const cacheDir = path.resolve(this.projectRoot, 'scratch/cache/type-coverage');
        fs.mkdirSync(scratchDir, { recursive: true });
        fs.mkdirSync(cacheDir, { recursive: true });
        const rawOutPath = path.resolve(scratchDir, 'type-coverage-raw.json');
        if (fs.existsSync(rawOutPath)) {
            try {
                fs.unlinkSync(rawOutPath);
            }
            catch {
                // catch-ok: cleanup stale report
            }
        }
        const threshold = config.typeCoverage?.atLeast ?? DEFAULT_MIN_TYPE_COVERAGE_PERCENT;
        const report = this.executeTypeCoverageCli(config, cacheDir, rawOutPath, threshold);
        if (!report) {
            return;
        }
        this.applyCoverageMetricsAndFindings(report, threshold);
    }
    executeTypeCoverageCli(config, cacheDir, rawOutPath, threshold) {
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
        return executeCliAndReadJson(command, finalArgs, rawOutPath, {
            cwd: this.projectRoot,
            shell: !resolvedBin
        });
    }
    applyCoverageMetricsAndFindings(report, threshold) {
        const percentStr = report.percentString ?? (report.percent?.toFixed(2) ?? '0.00');
        const correct = report.correctCount ?? 0;
        const total = report.totalCount ?? 0;
        this.context.setMetric('Type Coverage', `${percentStr}% (≥${threshold}%)`);
        this.context.setMetric('Typed Identifiers', `${correct}/${total}`);
        const findings = parseTypeCoverageReport(report, threshold, this.projectRoot);
        for (const finding of findings) {
            this.addViolation({
                ruleId: finding.ruleId ?? 'type-coverage-below-threshold',
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
//# sourceMappingURL=validate_type_coverage.js.map