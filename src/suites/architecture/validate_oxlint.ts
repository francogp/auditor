/**
 * src/suites/architecture/validate_oxlint.ts
 *
 * OXLINT & VITE+ CODE HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Runs Vite+ Oxlint (`vp lint`) across the repository with JSON formatter,
 * maps errors and warnings to StandardAuditResult findings with severity 'error'
 * (enforcing the strict Zero-Warning Policy), and persists structured reports.
 * Supports auto-fix when `fix` is passed (`vp lint --fix`).
 *
 * Usage:
 *   node src/suites/architecture/validate_oxlint.ts
 *   vp check
 */

import path from 'node:path';
import { executeNodeCli, resolvePackageBin } from '../../cli/cliUtils.ts';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getVitePlusDefaultExcludeGlobs } from '../../core/vitePlusConfigSync.ts';
import type { AuditFinding, GitIgnoreRequirement } from '../../core/auditContract.ts';
import {
  parseLintResultsToFindings,
  normalizePosixPath,
  parseJsonObjectOutput,
  type RawLintMessage,
  type RawLintFileReport
} from '../../core/reportUtils.ts';

enableCompileCache();

export const OXLINT_RULES = ['oxlint-violation'] as const;

export type OxlintRuleId = (typeof OXLINT_RULES)[number];

const MAX_BUFFER_BYTES = 52428800 as const;
const EXECUTION_TIMEOUT_MS = 0 as const;

export type RawOxlintMessage = RawLintMessage;
export type RawOxlintFileReport = RawLintFileReport;

export interface OxlintDiagnostic {
  message: string;
  code?: string;
  severity?: string;
  filename?: string;
  labels?: Array<{
    span?: {
      line?: number;
      column?: number;
      offset?: number;
      length?: number;
    };
  }>;
}

export interface OxlintJsonReport {
  diagnostics?: OxlintDiagnostic[];
  number_of_files?: number;
  number_of_rules?: number;
}

/**
 * Parses raw JSON output from Vite+ (Oxlint) into canonical AuditFindings.
 * Elevates all diagnostics to severity: 'error' (Zero-Warning Policy).
 */
export function parseOxlintResults(
  input: string | object | object[],
  cwd: string = process.cwd()
): AuditFinding[] {
  if (typeof input === 'string') {
    const oxlintObj = parseJsonObjectOutput<OxlintJsonReport>(input);
    if (oxlintObj && Array.isArray(oxlintObj.diagnostics)) {
      const findings: AuditFinding[] = [];
      for (const diag of oxlintObj.diagnostics) {
        const cleanFile = normalizePosixPath(diag.filename || '', cwd);
        const line = diag.labels?.[0]?.span?.line ?? 1;
        const col = diag.labels?.[0]?.span?.column ?? 1;
        const rule = diag.code || 'oxlint-violation';
        const isWarning = diag.severity?.toLowerCase() === 'warning';
        findings.push({
          suiteId: 'validate_oxlint',
          suiteName: 'Oxlint & Vite+ Code Hygiene Validator',
          ruleId: 'oxlint-violation',
          ruleDescription: 'Error de sintaxis o regla de linter',
          severity: isWarning ? 'warning' : 'error',
          file: cleanFile,
          line,
          col,
          context: rule,
          message: `[${rule}] ${diag.message}`,
          fixable: false
        });
      }
      return findings;
    }
  }

  return parseLintResultsToFindings(input as string | object[], {
    cwd,
    suiteId: 'validate_oxlint',
    suiteName: 'Oxlint & Vite+ Code Hygiene Validator',
    ruleId: 'oxlint-violation',
    ruleDescription: 'Error de sintaxis o regla de linter',
    defaultRuleName: 'oxlint',
    defaultMessage: 'Linter violation'
  });
}

export class OxlintAuditor extends BaseAuditor<OxlintRuleId> {
  public static readonly gitIgnoreEntries: readonly GitIgnoreRequirement[] = [
    {
      id: '.oxlintcache',
      pattern: '.oxlintcache',
      samplePath: '.oxlintcache',
      reason: 'Archivo de caché incremental generado por Oxlint',
      isApplicable: (config) => config._rawConfig?.oxlint?.enabled !== false
    }
  ];

  constructor(projectRoot?: string) {
    const effectiveRoot = projectRoot || process.cwd();
    super({
      usesThirdPartyTool: true,
      thirdPartyToolPolicy: {
        toolName: 'Vite+ Oxlint',
        fallbackBehavior: 'violation',
        fallbackRuleId: 'oxlint-violation'
      },
      ruleCapabilities: createRuleCapabilities(
        OXLINT_RULES,
        {
          speed: ['light', 'full'],
          phase: 'normal',
          fix: 'normal',
          md: false,
          ast: false,
          changedOnly: false,
          critical: true
        },
        ['oxlint-violation']
      ),
      fixableRuleIds: ['oxlint-violation'],
      gitIgnoreEntries: OxlintAuditor.gitIgnoreEntries,
      id: 'validate_oxlint',
      name: 'Oxlint & Vite+ Code Hygiene Validator',
      description: 'Reglas de estilo y sintaxis con Oxlint',
      family: 'architecture',
      packageName: 'Oxlint',
      configKey: 'oxlint.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '📜',
      ruleIds: OXLINT_RULES,
      ruleDescriptions: {
        'oxlint-violation': 'Error de sintaxis o regla'
      },
      ruleRemediations: {
        'oxlint-violation':
          'Guía de diagnóstico y remediación para oxlint-violation. Revisa la incidencia reportada por Vite+ (Oxlint) y ajusta el código correspondiente.'
      },
      coverage: {
        include: ['**/*.{js,ts,mjs,cjs,vue}'],
        exclude: getVitePlusDefaultExcludeGlobs(effectiveRoot),
        source: 'declared-only'
      },
      projectRoot: effectiveRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const excludeGlobs = getVitePlusDefaultExcludeGlobs(this.projectRoot);
    this.redeclareCoverage({
      include: ['**/*.{js,ts,mjs,cjs,vue}'],
      exclude: excludeGlobs,
      source: 'declared-only'
    });

    const isFixMode = this.isFixModeRequested();
    const tier = this.getExecutionTier();

    const vpBin =
      resolvePackageBin('vite-plus', {
        projectRoot: this.projectRoot,
        fallbackRelativeBin: 'bin/vp'
      }) ?? path.resolve(this.projectRoot, 'node_modules/vite-plus/bin/vp');

    const args: string[] = ['lint', '-f', 'json'];
    if (tier === 'full') {
      args.push('--type-aware', '--type-check', '--report-unused-disable-directives');
    }
    if (isFixMode) {
      args.push('--fix');
    }

    const combinedOutput = executeNodeCli(vpBin, args, {
      cwd: this.projectRoot,
      maxBuffer: MAX_BUFFER_BYTES,
      timeout: EXECUTION_TIMEOUT_MS
    });

    const findings = parseOxlintResults(combinedOutput, this.projectRoot);

    this.markRuleEvaluated('oxlint-violation');
    this.recordExternalScanCount(1);

    for (const finding of findings) {
      this.addViolation({
        ruleId: (finding.ruleId as OxlintRuleId) ?? 'oxlint-violation',
        severity: finding.severity,
        file: finding.file,
        line: finding.line,
        col: finding.col,
        context: finding.context,
        message: finding.message,
        fixable: finding.fixable
      });
    }

    this.context.setMetric('oxlint_violations', findings.length);
    this.context.setMetric('mode', isFixMode ? 'fix' : 'check');
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new OxlintAuditor());
