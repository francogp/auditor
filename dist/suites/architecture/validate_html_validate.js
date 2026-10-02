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
import { executeNodeCli, resolveNodeModuleBin } from "../../cli/cliUtils.js";
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from "../../core/auditorBase.js";
import { parseLintResultsToFindings } from "../../core/reportUtils.js";
enableCompileCache();
export const HTML_VALIDATE_RULES = [
    'html-validate-issue'
];
const MAX_BUFFER_BYTES = 52428800;
const EXECUTION_TIMEOUT_MS = 120000;
/**
 * Parses raw JSON output or an array of file reports from html-validate into canonical AuditFindings.
 * Elevates both warnings and errors to severity: 'error' (Zero-Warning Policy).
 */
export function parseHtmlValidateResults(input, cwd = process.cwd()) {
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
function resolveHtmlValidateConfig(projectRoot) {
    const hostConfig = path.resolve(projectRoot, '.htmlvalidate.json');
    if (fs.existsSync(hostConfig))
        return hostConfig;
    const packageConfig = path.resolve(import.meta.dirname, '../../../.htmlvalidate.json');
    if (fs.existsSync(packageConfig))
        return packageConfig;
    return '.htmlvalidate.json';
}
export class HtmlValidateAuditor extends BaseAuditor {
    constructor() {
        super({
            id: 'validate_html_validate',
            name: 'HTML5 Standards & Markup Hygiene Validator',
            description: 'Valida estándares y elementos obsoletos con html-validate',
            family: 'architecture',
            packageName: 'HTML',
            ruleIds: HTML_VALIDATE_RULES,
            ruleDescriptions: {
                'html-validate-issue': 'Violación de estándar HTML5'
            }
        });
    }
    async runAudit() {
        const isFixMode = this.isFixModeRequested();
        this.context.logStep(1, 2, `Ejecutando html-validate (modo: ${isFixMode ? 'auto-fix' : 'verificación'})...`);
        const binPath = resolveNodeModuleBin(this.projectRoot, 'html-validate/bin/html-validate.mjs');
        const configFile = resolveHtmlValidateConfig(this.projectRoot);
        const reportFile = path.resolve(this.projectRoot, 'scratch/audits/architecture/html-validate-raw.json');
        fs.mkdirSync(path.dirname(reportFile), { recursive: true });
        const targets = [];
        const srcDir = path.resolve(this.projectRoot, 'src');
        if (fs.existsSync(srcDir)) {
            targets.push('src');
        }
        const indexHtml = path.resolve(this.projectRoot, 'index.html');
        if (fs.existsSync(indexHtml)) {
            targets.push('index.html');
        }
        if (targets.length === 0) {
            this.context.logStep(1, 1, 'No se encontraron archivos HTML/Vue para html-validate. Omitiendo.');
            return;
        }
        const args = ['-c', configFile, '--ext', 'html,vue', '-f', `json=${reportFile}`, ...targets];
        if (isFixMode) {
            args.push('--fix');
        }
        const combinedOutput = executeNodeCli(binPath, args, {
            cwd: this.projectRoot,
            maxBuffer: MAX_BUFFER_BYTES,
            timeout: EXECUTION_TIMEOUT_MS
        });
        let findings = [];
        if (fs.existsSync(reportFile)) {
            try {
                const rawJson = fs.readFileSync(reportFile, 'utf-8');
                findings = parseHtmlValidateResults(rawJson, this.projectRoot);
            }
            catch {
                findings = parseHtmlValidateResults(combinedOutput, this.projectRoot);
            }
        }
        else {
            findings = parseHtmlValidateResults(combinedOutput, this.projectRoot);
        }
        this.context.logStep(2, 2, `Procesando violaciones de HTML5 (${findings.length} problemas)...`);
        this.importAuditFindings(findings, 'html-validate-issue', 'html-validate');
        this.filesScannedCount = 1;
        this.context.setMetric('html_violations', findings.length);
        this.context.setMetric('mode', isFixMode ? 'fix' : 'check');
    }
}
// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new HtmlValidateAuditor());
//# sourceMappingURL=validate_html_validate.js.map