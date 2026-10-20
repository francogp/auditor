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
import {
  BaseAuditor,
  createUniformRemediationPhases,
  createRuleCapabilities,
  collectRepositoryFiles,
  isPathIgnored
} from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
import {
  parseLintResultsToFindings,
  extractJsonReportFilePaths,
  type RawLintMessage,
  type RawLintFileReport
} from '../../core/reportUtils.ts';

enableCompileCache();

export type HtmlValidateRuleId = 'html-validate-issue';

export const HTML_VALIDATE_RULES: readonly HtmlValidateRuleId[] = ['html-validate-issue'] as const;

const MAX_BUFFER_BYTES = 52428800 as const;
const EXECUTION_TIMEOUT_MS = 0 as const;

export type RawHtmlValidateMessage = RawLintMessage; // type-ok: Type contract declaration
export type RawHtmlValidateFileReport = RawLintFileReport; // type-ok: Type contract declaration

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
  filesToScan: string[],
  extraIgnorePatterns: readonly string[] = []
): void {
  const fullRoot = path.resolve(projectRoot, root);
  const found = collectRepositoryFiles(fullRoot, projectRoot, extraIgnorePatterns, new Set(['.html', '.vue']));
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
  try {
    const rootEntries = fs.readdirSync(projectRoot, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (entry.isFile() && entry.name.endsWith('.html')) {
        if (!isPathIgnored(entry.name, extraIgnorePatterns, [], projectRoot)) {
          targets.push(entry.name);
          filesToScan.push(path.join(projectRoot, entry.name));
        }
      }
    }
  } catch {
    // catch-ok: ignore unreadable project root
  }
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
      usesThirdPartyTool: true,
      requiredPermissions: ['--allow-child-process'],
      thirdPartyToolPolicy: {
        toolName: 'html-validate',
        fallbackBehavior: 'violation',
        fallbackRuleId: 'html-validate-issue'
      },
      ruleCapabilities: createRuleCapabilities(
        HTML_VALIDATE_RULES,
        {
          speed: 'light',
          phase: 'normal',
          fix: 'normal',
          md: false,
          ast: false,
          changedOnly: false,
          critical: true
        },
        ['html-validate-issue']
      ),
      fixableRuleIds: ['html-validate-issue'],
      id: 'validate_html_validate',
      name: 'HTML5 Standards & Markup Hygiene Validator',
      description: 'Valida estándares y elementos obsoletos con html-validate',
      family: 'architecture',
      packageName: 'HTML',
      configKey: 'htmlValidate.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '🌐',
      ruleIds: HTML_VALIDATE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(HTML_VALIDATE_RULES, 'behavior'),
      ruleDescriptions: {
        'html-validate-issue': 'Violación de estándar HTML5'
      },
      ruleRemediations: {
        'html-validate-issue':
          'Causa Raíz:\n' +
          'Violación de estándares del HTML Living Standard (WHATWG) o buenas prácticas de accesibilidad y marcado semántico en archivos .html o plantillas de componentes Vue (.vue).\n' +
          'html-validate detecta elementos obsoletos (<center>, <font>, <marquee>), anidamientos no permitidos (ej. <p> dentro de <p>, <div> dentro de <span> o <a> interactivo dentro de <a>), atributos inválidos o no admitidos en el elemento, o IDs duplicados en el mismo DOM.\n\n' +
          'Diagnóstico:\n' +
          '1. Ejecuta "npm run auditor:findings rule=html-validate-issue" para ver el archivo, línea y regla específica de HTML5 que falló.\n' +
          '2. Identifica si la violación proviene de un tag deprecado, de un anidamiento prohibido o de un atributo inválido.\n\n' +
          'Solución Canónica:\n' +
          '1. Sustituir elementos obsoletos por contenedores semánticos (<header>, <nav>, <main>, <section>, <article>, <div>) y aplicar estilos mediante clases CSS o utilidades del sistema de diseño.\n' +
          '2. Corregir anidamientos ilegales. Por ejemplo, en HTML5 un párrafo <p> solo puede contener elementos phrasing (en línea); un bloque <div> o lista <ul> dentro de un <p> fuerza el cierre implícito del párrafo y corrompe el árbol del DOM.\n' +
          '3. Evitar colocar elementos interactivos dentro de otros elementos interactivos (ej. un <button> dentro de un <a>).\n' +
          '4. Ejecuta "npm run auditor:fix" para corregir automáticamente los problemas de formateo o atributos triviales soportados por html-validate.\n\n' +
          'Ejemplo Antes vs Después:\n' +
          '// ❌ Incorrecto: tag obsoleto y anidamiento no permitido en HTML5\n' +
          '<center>\n' +
          '  <p>Texto con bloque interno: <div>Contenido ilegal</div></p>\n' +
          '</center>\n\n' +
          '// ✅ Correcto: elementos semánticos estándar con clases de diseño\n' +
          '<div class="text-center">\n' +
          '  <p>Texto con elemento en línea: <span class="highlight">Contenido válido</span></p>\n' +
          '</div>'
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
    const reportFile = path.resolve(
      this.projectRoot,
      'scratch/audits/architecture/html-validate-raw.json'
    );
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });

    const scannableRoots = Array.from(
      new Set([
        'src',
        ...(config.paths.srcRoots ?? []),
        ...(config.paths.codeRoots ?? []),
        ...(config.paths.demoRoots ?? [])
      ])
    ).filter((r) => fs.existsSync(path.resolve(this.projectRoot, r)));

    const localConfigPath = path.resolve(this.projectRoot, '.htmlvalidate.json');
    const hasLocalConfig = fs.existsSync(localConfigPath);
    const coverageInclude: string[] = scannableRoots.map((r) => `${r}/**/*.{html,vue}`); // no-domain: Dynamic coverage glob patterns
    coverageInclude.push('*.html');
    if (hasLocalConfig) {
      coverageInclude.push('.htmlvalidate.json');
      this.recordScanned(localConfigPath);
    }
    this.redeclareCoverage({
      include: coverageInclude,
      source: 'runtime'
    });

    const { targets, filesToScan } = collectHtmlTargets(
      this.projectRoot,
      scannableRoots,
      this.extraIgnorePatterns
    );

    if (filesToScan.length === 0 && targets.length === 0) {
      this.markRuleNotApplicable(
        'html-validate-issue',
        'No existen archivos HTML ni plantillas para validar'
      );
      return;
    }

    for (const f of filesToScan) {
      this.recordScanned(f);
    }

    const relFiles = filesToScan.map((f) =>
      path.relative(this.projectRoot, f).split(path.sep).join(path.posix.sep)
    );
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
