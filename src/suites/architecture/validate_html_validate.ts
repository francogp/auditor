/**
 * packages/auditor/src/suites/architecture/validate_html_validate.ts
 *
 * HTML5 STANDARDS & MARKUP HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Runs `html-validate` with `html-validate-vue` across project templates (.vue, .html),
 * detects deprecated attributes, obsolete elements, and spec violations (Zero-Warning Policy),
 * and persists structured reports to scratch/audits/architecture/validate_html_validate.json.
 * Supports auto-fix when `fix` is passed.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-child-process packages/auditor/src/suites/architecture/validate_html_validate.ts
 *   npm run validate:html
 */

import fs from 'node:fs';
import path from 'node:path';
import { executeNodeCli, resolveNodeModuleBin } from '../../cli/cliUtils.ts';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
import { parseLintResultsToFindings, extractJsonReportFilePaths, type RawLintMessage, type RawLintFileReport } from '../../core/reportUtils.ts';

enableCompileCache();

export type HtmlValidateRuleId = 'html-validate-issue';

export const HTML_VALIDATE_RULES: readonly HtmlValidateRuleId[] = [
  'html-validate-issue'
] as const;

const MAX_BUFFER_BYTES = 52428800 as const;
const EXECUTION_TIMEOUT_MS = 0 as const;

export type RawHtmlValidateMessage = RawLintMessage; // type-ok: Type contract declaration
export type RawHtmlValidateFileReport = RawLintFileReport; // type-ok: Type contract declaration

/**
 * Parses raw JSON output or an array of file reports from html-validate into canonical AuditFindings.
 * Elevates both warnings and errors to severity: 'error' (Zero-Warning Policy).
 */
export function parseHtmlValidateResults(input: string | object[], cwd: string = process.cwd()): AuditFinding[] {
  return parseLintResultsToFindings(input, {
    cwd,
    suiteId: 'validate_html_validate',
    suiteName: 'HTML5 Standards & Markup Hygiene Validator',
    ruleId: 'html-validate-issue',
    ruleDescription: 'Violación de estándar HTML5',
    defaultRuleName: 'html-validate',
    defaultMessage: 'HTML validation issue'
  });
}

function resolveHtmlValidateConfig(projectRoot: string): string {
  const hostConfig = path.resolve(projectRoot, '.htmlvalidate.json');
  if (fs.existsSync(hostConfig)) return hostConfig;
  const packageConfig = path.resolve(import.meta.dirname, '../../../.htmlvalidate.json');
  if (fs.existsSync(packageConfig)) return packageConfig;
  return '.htmlvalidate.json';
}

function collectRootHtmlTargets(
  projectRoot: string,
  root: string,
  targets: string[],
  filesToScan: string[]
): void {
  const fullRoot = path.resolve(projectRoot, root);
  try {
    const entries = fs.readdirSync(fullRoot, { recursive: true, withFileTypes: true });
    let hasHtmlOrVue = false;
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith('.html') || entry.name.endsWith('.vue'))) {
        hasHtmlOrVue = true;
        const parent = (entry as { parentPath?: string }).parentPath ?? fullRoot;
        filesToScan.push(path.join(parent, entry.name));
      }
    }
    if (hasHtmlOrVue) {
      targets.push(root);
    }
  } catch {
    // catch-ok: ignore missing/unreadable scan root
  }
}

function collectTopLevelHtmlTargets(projectRoot: string, targets: string[], filesToScan: string[]): void {
  try {
    const rootEntries = fs.readdirSync(projectRoot, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (entry.isFile() && entry.name.endsWith('.html')) {
        targets.push(entry.name);
        filesToScan.push(path.join(projectRoot, entry.name));
      }
    }
  } catch {
    // catch-ok: ignore unreadable project root
  }
}

export function collectHtmlTargets(
  projectRoot: string,
  roots: readonly string[]
): { targets: string[]; filesToScan: string[] } {
  const targets: string[] = [];
  const filesToScan: string[] = []; // no-domain: Dynamic filesystem file path list

  for (const root of roots) {
    collectRootHtmlTargets(projectRoot, root, targets, filesToScan);
  }

  collectTopLevelHtmlTargets(projectRoot, targets, filesToScan);

  return { targets, filesToScan };
}

export function readAndParseHtmlValidateOutput(
  reportFile: string,
  combinedOutput: string,
  projectRoot: string
): { findings: AuditFinding[]; rawJson: string } {
  let findings: AuditFinding[];
  let rawJson = combinedOutput;

  if (fs.existsSync(reportFile)) {
    try {
      rawJson = fs.readFileSync(reportFile, 'utf-8');
      findings = parseHtmlValidateResults(rawJson, projectRoot);
    } catch {
      // catch-ok: Fall back to parsing combined output
      findings = parseHtmlValidateResults(combinedOutput, projectRoot);
    }
  } else {
    findings = parseHtmlValidateResults(combinedOutput, projectRoot);
  }

  return { findings, rawJson };
}

export class HtmlValidateAuditor extends BaseAuditor<HtmlValidateRuleId> {
  constructor(options: { projectRoot?: string } = {}) {
    super({
      capabilities: {
        fix: true,
        fixPriority: false,
        lint: true,
        md: false,
        ast: false,
        changedSince: false,
        heavy: false,
        requiresBuild: false,
        postRun: false
      },
      fixableRuleIds: ['html-validate-issue'],
      id: 'validate_html_validate',
      name: 'HTML5 Standards & Markup Hygiene Validator',
      description: 'Valida estándares y elementos obsoletos con html-validate',
      family: 'architecture',
      packageName: 'HTML',
      configKey: 'htmlValidate.enabled',
      defaultConfig: { enabled: true },
      icon: '🌐',
      ruleIds: HTML_VALIDATE_RULES,
      ruleDescriptions: {
        'html-validate-issue': 'Violación de estándar HTML5'
      },
      coverage: {
        include: ['src/**/*.{html,vue}', 'ui-demo/**/*.{html,vue}', '*.html', '.htmlvalidate.json'],
        source: 'runtime'
      },
      projectRoot: options.projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    if (this.isSuiteGatingDisabled('HTML-Validate deshabilitado en configuración')) return;

    const isFixMode = this.isFixModeRequested();
    const config = getAuditConfig(this.projectRoot);

    const binPath = resolveNodeModuleBin(this.projectRoot, 'html-validate/bin/html-validate.mjs');
    const configFile = resolveHtmlValidateConfig(this.projectRoot);
    const reportFile = path.resolve(this.projectRoot, 'scratch/audits/architecture/html-validate-raw.json');
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });

    const scannableRoots = Array.from(new Set([
      'src',
      ...(config.paths.srcRoots ?? []),
      ...(config.paths.codeRoots ?? []),
      ...(config.paths.demoRoots ?? [])
    ])).filter(r => fs.existsSync(path.resolve(this.projectRoot, r)));

    const localConfigPath = path.resolve(this.projectRoot, '.htmlvalidate.json');
    const hasLocalConfig = fs.existsSync(localConfigPath);
    const coverageInclude: string[] = scannableRoots.map(r => `${r}/**/*.{html,vue}`); // no-domain: Dynamic coverage glob patterns
    coverageInclude.push('*.html');
    if (hasLocalConfig) {
      coverageInclude.push('.htmlvalidate.json');
      this.recordScanned(localConfigPath);
    }
    this.redeclareCoverage({
      include: coverageInclude,
      source: 'runtime'
    });

    const { targets, filesToScan } = collectHtmlTargets(this.projectRoot, scannableRoots);

    if (filesToScan.length === 0 && targets.length === 0) {
      this.markRuleNotApplicable('html-validate-issue', 'No existen archivos HTML ni plantillas para validar');
      return;
    }

    for (const f of filesToScan) {
      this.recordScanned(f);
    }

    const args: string[] = ['-c', configFile, '--ext', 'html,vue', '-f', `json=${reportFile}`, ...targets];
    if (isFixMode) {
      args.push('--fix');
    }

    const combinedOutput = executeNodeCli(binPath, args, {
      cwd: this.projectRoot,
      maxBuffer: MAX_BUFFER_BYTES,
      timeout: EXECUTION_TIMEOUT_MS
    });

    const { findings, rawJson } = readAndParseHtmlValidateOutput(reportFile, combinedOutput, this.projectRoot);
    const scannedReportFiles = extractJsonReportFilePaths(rawJson, findings);
    this.recordScannedMany(scannedReportFiles);

    this.markRuleEvaluated('html-validate-issue');
    this.importAuditFindings(findings, 'html-validate-issue', 'html-validate');

    this.context.setMetric('html_violations', findings.length);
    this.context.setMetric('mode', isFixMode ? 'fix' : 'check');
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new HtmlValidateAuditor());
