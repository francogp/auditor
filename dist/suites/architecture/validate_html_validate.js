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
import { getAuditConfig } from "../../core/auditConfig.js";
import { parseLintResultsToFindings, extractJsonReportFilePaths } from "../../core/reportUtils.js";
enableCompileCache();
export const HTML_VALIDATE_RULES = [
    'html-validate-issue'
];
const MAX_BUFFER_BYTES = 52428800;
const EXECUTION_TIMEOUT_MS = 0;
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
    constructor(options = {}) {
        super({
            capabilities: { fix: true, lint: true },
            id: 'validate_html_validate',
            name: 'HTML5 Standards & Markup Hygiene Validator',
            description: 'Valida estándares y elementos obsoletos con html-validate',
            family: 'architecture',
            packageName: 'HTML',
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
    async runAudit() {
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
        const coverageInclude = scannableRoots.map(r => `${r}/**/*.{html,vue}`);
        coverageInclude.push('*.html');
        if (hasLocalConfig) {
            coverageInclude.push('.htmlvalidate.json');
        }
        this.redeclareCoverage({
            include: coverageInclude,
            source: 'runtime'
        });
        if (hasLocalConfig) {
            this.recordScanned(localConfigPath);
        }
        const targets = [];
        const filesToScan = [];
        for (const root of scannableRoots) {
            const fullRoot = path.resolve(this.projectRoot, root);
            try {
                const entries = fs.readdirSync(fullRoot, { recursive: true, withFileTypes: true });
                let hasHtmlOrVue = false;
                for (const entry of entries) {
                    if (entry.isFile() && (entry.name.endsWith('.html') || entry.name.endsWith('.vue'))) {
                        hasHtmlOrVue = true;
                        const parent = entry.parentPath ?? fullRoot;
                        filesToScan.push(path.join(parent, entry.name));
                    }
                }
                if (hasHtmlOrVue) {
                    targets.push(root);
                }
            }
            catch {
                // catch-ok
            }
        }
        // Top-level HTML files
        try {
            const rootEntries = fs.readdirSync(this.projectRoot, { withFileTypes: true });
            for (const entry of rootEntries) {
                if (entry.isFile() && entry.name.endsWith('.html')) {
                    targets.push(entry.name);
                    filesToScan.push(path.join(this.projectRoot, entry.name));
                }
            }
        }
        catch {
            // catch-ok
        }
        if (filesToScan.length === 0 && targets.length === 0) {
            this.markRuleNotApplicable('html-validate-issue', 'No existen archivos HTML ni plantillas para validar');
            return;
        }
        for (const f of filesToScan) {
            this.recordScanned(f);
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
        let findings;
        let rawJsonContent;
        if (fs.existsSync(reportFile)) {
            try {
                rawJsonContent = fs.readFileSync(reportFile, 'utf-8');
                findings = parseHtmlValidateResults(rawJsonContent, this.projectRoot);
            }
            catch {
                findings = parseHtmlValidateResults(combinedOutput, this.projectRoot);
            }
        }
        else {
            findings = parseHtmlValidateResults(combinedOutput, this.projectRoot);
        }
        const jsonToParse = rawJsonContent || combinedOutput;
        const scannedReportFiles = extractJsonReportFilePaths(jsonToParse, findings);
        this.recordScannedMany(scannedReportFiles);
        this.markRuleEvaluated('html-validate-issue');
        this.importAuditFindings(findings, 'html-validate-issue', 'html-validate');
        this.context.setMetric('html_violations', findings.length);
        this.context.setMetric('mode', isFixMode ? 'fix' : 'check');
    }
}
// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new HtmlValidateAuditor());
//# sourceMappingURL=validate_html_validate.js.map