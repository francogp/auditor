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
import { enableCompileCache } from 'node:module';
import path from 'node:path';

import { executeNodeCli, resolveNodeModuleBin } from '../../cli/cliUtils.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { DEFAULT_AUDIT_CONFIG } from '../../core/auditConfigDefaults.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  createRuleCapabilities,
  collectRepositoryFiles,
  isPathIgnored
} from '../../core/auditorBase.ts';
import {
  parseLintResultsToFindings,
  extractJsonReportFilePaths,
  type RawLintMessage,
  type RawLintFileReport
} from '../../core/reportUtils.ts';
import { normalizePosixPath } from '../../core/safePath.ts';
import { tryCatchSync } from '../../core/safeUtils.ts';

enableCompileCache();

export type HtmlValidateRuleId = 'html-validate-issue';

export const HTML_VALIDATE_RULES: readonly HtmlValidateRuleId[] = ['html-validate-issue'] as const;

const MAX_BUFFER_BYTES = 52428800 as const;
const EXECUTION_TIMEOUT_MS = 0 as const;

export type RawHtmlValidateMessage = RawLintMessage; // Type contract declaration
export type RawHtmlValidateFileReport = RawLintFileReport; // Type contract declaration

/**
 * Parses raw JSON output or an array of file reports from html-validate into canonical AuditFindings.
 * Elevates both warnings and errors to severity: 'error' (Zero-Warning Policy).
 */
export function parseHtmlValidateResults(
  input: string | object[],
  cwd: string = process.cwd()
): AuditFinding[] {
  return parseLintResultsToFindings(input, {
    cwd,
    suiteId: 'validate_html_validate',
    suiteName: 'HTML5 Standards & Markup Hygiene Validator',
    ruleId: 'html-validate-issue',
    ruleDescription: 'HTML5 standard violation',
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
  filesToScan: string[],
  extraIgnorePatterns: readonly string[] = []
): void {
  const fullRoot = path.resolve(projectRoot, root);
  const found = collectRepositoryFiles(
    fullRoot,
    projectRoot,
    extraIgnorePatterns,
    new Set(['.html', '.vue'])
  );
  if (found.length > 0) {
    targets.push(root);
    filesToScan.push(...found);
  }
}

function collectTopLevelHtmlTargets(
  projectRoot: string,
  targets: string[],
  filesToScan: string[],
  extraIgnorePatterns: readonly string[] = []
): void {
  tryCatchSync(() => {
    const rootEntries = fs.readdirSync(projectRoot, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (entry.isFile() && entry.name.endsWith('.html')) {
        if (!isPathIgnored(entry.name, extraIgnorePatterns, [], projectRoot)) {
          targets.push(entry.name);
          filesToScan.push(path.join(projectRoot, entry.name));
        }
      }
    }
  });
}

export function collectHtmlTargets(
  projectRoot: string,
  roots: readonly string[],
  extraIgnorePatterns: readonly string[] = []
): { targets: string[]; filesToScan: string[] } {
  const targets: string[] = [];
  const filesToScan: string[] = []; // no-domain: Dynamic filesystem file path list

  for (const root of roots) {
    collectRootHtmlTargets(projectRoot, root, targets, filesToScan, extraIgnorePatterns);
  }

  collectTopLevelHtmlTargets(projectRoot, targets, filesToScan, extraIgnorePatterns);

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
      // Fall back to parsing combined output
      findings = parseHtmlValidateResults(combinedOutput, projectRoot);
    }
  } else {
    findings = parseHtmlValidateResults(combinedOutput, projectRoot);
  }

  return { findings, rawJson };
}

export class HtmlValidateAuditor extends BaseAuditor<HtmlValidateRuleId> {
  public constructor(options: { projectRoot?: string } = {}) {
    const projectRoot = options.projectRoot ?? process.cwd();
    const config = getAuditConfig(projectRoot);
    const targetRoots = Array.from(
      new Set([
        ...(config.paths.srcRoots ?? DEFAULT_AUDIT_CONFIG.paths.srcRoots),
        ...(config.paths.codeRoots ?? []),
        ...(config.paths.demoRoots ?? [])
      ])
    );
    super({
      ruleFixers: {},
      fixableRuleIds: ['html-validate-issue'],
      usesThirdPartyTool: true,
      requiredPermissions: ['--allow-child-process'],
      thirdPartyToolPolicy: {
        toolName: 'html-validate',
        fallbackBehavior: 'violation',
        fallbackRuleId: 'html-validate-issue'
      },
      ruleCapabilities: createRuleCapabilities(HTML_VALIDATE_RULES, {
        speed: 'light',
        phase: 'normal',
        md: false,
        ast: false,
        changedOnly: false,
        critical: true
      }),
      id: 'validate_html_validate',
      name: 'HTML5 Standards & Markup Hygiene Validator',
      description: 'Validates standards and obsolete elements with html-validate',
      family: 'architecture',
      packageName: 'HTML',
      configKey: 'htmlValidate.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '🌐',
      ruleIds: HTML_VALIDATE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(HTML_VALIDATE_RULES, 'behavior'),
      ruleDescriptions: {
        'html-validate-issue': 'HTML5 standard violation'
      },
      ruleRemediations: {
        'html-validate-issue':
          '1. Root Cause:\n' +
          'Violation of WHATWG HTML Living Standard rules or accessibility and semantic markup best practices in .html files or Vue component templates (.vue).\n' +
          'html-validate detects obsolete elements (<center>, <font>, <marquee>), disallowed nesting (e.g. <p> inside <p>, <div> inside <span>, or interactive <a> inside <a>), invalid attributes, or duplicate IDs in the same DOM tree.\n\n' +
          '2. Diagnosis:\n' +
          '1. Run "npm run auditor:findings rule=html-validate-issue" to inspect the exact file, line, and HTML5 rule that failed.\n' +
          '2. Identify whether the violation is a deprecated tag, illegal nesting, or an unsupported attribute.\n\n' +
          '3. Canonical Solution:\n' +
          '1. Replace obsolete elements with semantic HTML5 elements (<header>, <nav>, <main>, <section>, <article>, <div>) and style via CSS classes or design system utilities.\n' +
          '2. Fix illegal nesting. In HTML5, <p> can only contain phrasing (inline) elements; a block <div> or list <ul> inside a <p> forces implicit closure of the paragraph and corrupts the DOM tree.\n' +
          '3. Avoid nesting interactive elements within other interactive elements (e.g. <button> inside an <a>).\n' +
          '4. Run "npm run auditor:fix" to automatically fix supported formatting issues or trivial attributes.\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Incorrect: obsolete tag and illegal nesting in HTML5\n' +
          '<center>\n' +
          '  <p>Text with inner block: <div>Disallowed content</div></p>\n' +
          '</center>\n\n' +
          '// ✅ Correct: standard semantic elements with styling classes\n' +
          '<div class="text-center">\n' +
          '  <p>Text with inline element: <span class="highlight">Valid content</span></p>\n' +
          '</div>'
      },
      coverage: {
        include: [
          ...targetRoots.map((r) => `${r}/**/*.{html,vue}`),
          '*.html',
          '.htmlvalidate.json'
        ],
        source: 'runtime'
      },
      projectRoot: options.projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    if (this.isSuiteGatingDisabled('HTML-Validate disabled in configuration')) return;

    const isFixMode = this.isFixActive();
    const config = getAuditConfig(this.projectRoot);

    const binPath = resolveNodeModuleBin(this.projectRoot, 'html-validate/bin/html-validate.mjs');
    const configFile = resolveHtmlValidateConfig(this.projectRoot);
    const reportFile = path.resolve(
      this.projectRoot,
      'scratch/audits/architecture/html-validate-raw.json'
    );
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });

    const scannableRoots = Array.from(
      new Set([
        ...(config.paths.srcRoots ?? DEFAULT_AUDIT_CONFIG.paths.srcRoots),
        ...(config.paths.codeRoots ?? []),
        ...(config.paths.demoRoots ?? [])
      ])
    ).filter((r) => fs.existsSync(path.resolve(this.projectRoot, r)));

    const localConfigPath = path.resolve(this.projectRoot, '.htmlvalidate.json');
    const hasLocalConfig = fs.existsSync(localConfigPath);
    const coverageIncludeGlobs: string[] = scannableRoots.map((r) => `${r}/**/*.{html,vue}`);
    coverageIncludeGlobs.push('*.html');
    if (hasLocalConfig) {
      coverageIncludeGlobs.push('.htmlvalidate.json');
      this.recordScanned(localConfigPath);
    }
    this.redeclareCoverage({
      include: coverageIncludeGlobs,
      source: 'runtime'
    });

    const { targets, filesToScan } = collectHtmlTargets(
      this.projectRoot,
      scannableRoots,
      this.extraIgnorePatterns
    );

    if (filesToScan.length === 0 && targets.length === 0) {
      this.markRuleNotApplicable('html-validate-issue', 'No HTML files or templates to validate');
      return;
    }

    for (const f of filesToScan) {
      this.recordScanned(f);
    }

    const relFiles = filesToScan.map((f) => normalizePosixPath(path.relative(this.projectRoot, f)));
    const totalChars = relFiles.reduce((acc, f) => acc + f.length + 1, 0);
    const effectiveTargets = totalChars < 6000 && relFiles.length > 0 ? relFiles : targets;

    const args: string[] = [
      '-c',
      configFile,
      '--ext',
      'html,vue',
      '-f',
      `json=${reportFile}`,
      ...effectiveTargets
    ];
    if (isFixMode) {
      args.push('--fix');
    }

    const combinedOutput = executeNodeCli(binPath, args, {
      cwd: this.projectRoot,
      maxBuffer: MAX_BUFFER_BYTES,
      timeout: EXECUTION_TIMEOUT_MS
    });

    const { findings, rawJson } = readAndParseHtmlValidateOutput(
      reportFile,
      combinedOutput,
      this.projectRoot
    );
    const scannedReportFiles = extractJsonReportFilePaths(rawJson, findings);
    this.recordScannedMany(scannedReportFiles);

    const normalizedFindings = isFixMode
      ? findings.map((f) => ({ ...f, fixable: false }))
      : findings;
    this.markRuleEvaluated('html-validate-issue');
    this.importAuditFindings(normalizedFindings, 'html-validate-issue', 'html-validate');

    this.context.setMetric('html_violations', normalizedFindings.length);
    this.context.setMetric('mode', isFixMode ? 'fix' : 'check');
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new HtmlValidateAuditor());
