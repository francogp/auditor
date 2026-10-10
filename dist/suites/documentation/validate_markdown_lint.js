/**
 * scripts/auditors/documentation/validate_markdown_lint.ts
 *
 * MARKDOWN LINT AUDITOR & HYGIENE VALIDATOR (Node.js 26+ Native)
 *
 * Runs `markdownlint` across all project documentation and skills,
 * parses structured JSON findings, maps them to StandardAuditResult with severity 'error',
 * and persists reports to scratch/audits/documentation/validate_markdown_lint.json.
 * Supports auto-fix when `fix` is passed.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* --allow-child-process scripts/auditors/documentation/validate_markdown_lint.ts
 *   npm run lint:md
 */
import nodeFs from 'node:fs';
import path from 'node:path';
import { executeNodeCli, resolveNodeModuleBin } from "../../cli/cliUtils.js";
import { enableCompileCache } from 'node:module';
import { BaseAuditor, loadLockedSkills, getEffectiveUnignoreDirs } from "../../core/auditorBase.js";
import { isDeclaredByCoverage, toPosixRelative } from "../../core/auditCoverage.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { parseJsonArrayOutput, normalizePosixPath } from "../../core/reportUtils.js";
enableCompileCache();
export const MARKDOWN_LINT_RULES = [
    'markdownlint-issue'
];
const MAX_BUFFER_BYTES = 52428800;
const EXECUTION_TIMEOUT_MS = 0;
const DEFAULT_ERROR_LINE = 1;
export const DEFAULT_MARKDOWN_IGNORE_GLOBS = [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'dev-dist/**',
    'scratch/**',
    'test-results/**'
];
export function getMarkdownIgnoreGlobs(projectRoot) {
    const config = getAuditConfig(projectRoot);
    const globs = [...DEFAULT_MARKDOWN_IGNORE_GLOBS];
    if (config.paths?.ignoreGlobs) {
        globs.push(...config.paths.ignoreGlobs);
    }
    if (config.paths?.e2eRoots) {
        for (const r of config.paths.e2eRoots) {
            globs.push(`${r}/results/**`);
        }
    }
    if (config.paths?.ignoredDirs) {
        for (const d of config.paths.ignoredDirs) {
            globs.push(`${d}/**`);
        }
    }
    if (config.persistence?.supabaseDir) {
        globs.push(`${config.persistence.supabaseDir}/**`);
    }
    const lockedSkills = loadLockedSkills(projectRoot);
    for (const s of lockedSkills) {
        globs.push(`.agents/skills/${s}/**`);
        globs.push(`skills/${s}/**`);
        globs.push(`.skills/${s}/**`);
    }
    return Array.from(new Set(globs));
}
export const MARKDOWNLINT_FIXABLE_RULE_LIST = [
    'MD004', 'MD005', 'MD007', 'MD009', 'MD010', 'MD011', 'MD012', 'MD014',
    'MD018', 'MD019', 'MD020', 'MD021', 'MD022', 'MD023', 'MD024', 'MD026',
    'MD027', 'MD030', 'MD031', 'MD032', 'MD034', 'MD037', 'MD038', 'MD039',
    'MD044', 'MD047', 'MD049', 'MD050', 'MD051', 'MD053'
];
export const MARKDOWNLINT_FIXABLE_RULES = new Set(MARKDOWNLINT_FIXABLE_RULE_LIST);
function isMarkdownLintRuleFixable(ruleNames) {
    if (!ruleNames || ruleNames.length === 0)
        return false;
    return ruleNames.some(name => MARKDOWNLINT_FIXABLE_RULES.has(name));
}
/**
 * Parses raw JSON output or an array of issues from markdownlint into canonical AuditFindings.
 */
export function parseMarkdownLintIssues(input, cwd = process.cwd()) {
    const findings = [];
    if (!input)
        return findings;
    const rawList = parseJsonArrayOutput(input, {
        throwOnError: true,
        toolName: 'markdownlint'
    });
    for (const issue of rawList) {
        const cleanFile = normalizePosixPath(issue.fileName || '', cwd);
        const ruleCode = Array.isArray(issue.ruleNames) ? issue.ruleNames.join('/') : 'MD';
        const detail = issue.errorDetail ? ` (${issue.errorDetail})` : '';
        const desc = issue.ruleDescription || 'Markdown formatting issue';
        const isFixable = isMarkdownLintRuleFixable(issue.ruleNames);
        findings.push({
            suiteId: 'validate_markdown_lint',
            suiteName: 'Markdownlint Style & Hygiene Validator',
            ruleId: 'markdownlint-issue',
            ruleDescription: 'Formato o estilo inválido',
            severity: 'error',
            file: cleanFile,
            line: issue.lineNumber || DEFAULT_ERROR_LINE,
            context: ruleCode,
            message: `${ruleCode}: ${desc}${detail}`,
            fixable: isFixable
        });
    }
    return findings;
}
export class MarkdownLintAuditor extends BaseAuditor {
    constructor(projectRoot) {
        super({
            capabilities: {
                fix: true,
                fixPriority: false,
                lint: true,
                md: true,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
            },
            fixableRuleIds: ['markdownlint-issue'],
            id: 'validate_markdown_lint',
            name: 'Markdownlint Style & Hygiene Validator',
            description: 'Estilo, espaciado y formato en documentación markdown',
            family: 'documentation',
            packageName: 'Markdownlint',
            configKey: 'documentation.enabled',
            defaultConfig: { enabled: true },
            criticalConfig: {},
            icon: '📘',
            ruleIds: MARKDOWN_LINT_RULES,
            ruleDescriptions: {
                'markdownlint-issue': 'Formato o estilo inválido'
            },
            unignoreDirs: getEffectiveUnignoreDirs(projectRoot),
            coverage: {
                include: ['**/*.md', '.markdownlint.json'],
                exclude: getMarkdownIgnoreGlobs(projectRoot),
                source: 'runtime'
            },
            projectRoot
        });
    }
    async runAudit() {
        const ignoreGlobs = getMarkdownIgnoreGlobs(this.projectRoot);
        const configPath = path.resolve(this.projectRoot, '.markdownlint.json');
        const hasConfigFile = nodeFs.existsSync(configPath);
        const coverageIncludeGlobs = ['**/*.md'];
        if (hasConfigFile) {
            coverageIncludeGlobs.push('.markdownlint.json');
        }
        this.redeclareCoverage({
            include: coverageIncludeGlobs,
            exclude: ignoreGlobs,
            source: 'runtime'
        });
        if (hasConfigFile) {
            this.recordScanned(configPath);
        }
        const allMdFiles = this.context.collectFiles(['.'], new Set(['.md']));
        const mdFiles = allMdFiles.filter(f => isDeclaredByCoverage(toPosixRelative(this.projectRoot, f), this.coverageRecorder.declaration));
        if (mdFiles.length === 0) {
            this.markRuleNotApplicable('markdownlint-issue', 'No se encontraron archivos markdown');
            return;
        }
        for (const f of mdFiles) {
            this.recordScanned(f);
            this.markRuleEvaluated('markdownlint-issue');
        }
        const isFixMode = this.isFixModeRequested();
        if (isFixMode && hasConfigFile) {
            this.repairMarkdownLintConfig(configPath);
        }
        const binPath = resolveNodeModuleBin(this.projectRoot, 'markdownlint-cli/markdownlint.js');
        const args = ['**/*.md', '--dot']; // no-domain: Non-domain utility collection or data structure
        for (const pattern of getMarkdownIgnoreGlobs(this.projectRoot)) {
            args.push('--ignore', pattern);
        }
        args.push('--json');
        if (isFixMode) {
            args.push('--fix');
        }
        const combinedOutput = executeNodeCli(binPath, args, {
            cwd: this.projectRoot,
            maxBuffer: MAX_BUFFER_BYTES,
            timeout: EXECUTION_TIMEOUT_MS
        });
        const findings = parseMarkdownLintIssues(combinedOutput, this.projectRoot);
        this.importAuditFindings(findings, 'markdownlint-issue', 'markdownlint');
        this.context.setMetric('markdown_violations', findings.length);
        this.context.setMetric('mode', isFixMode ? 'fix' : 'check');
    }
    /**
     * Automatically repairs .markdownlint.json in --fix mode to ensure "br" is allowed
     * in MD033 (inline HTML elements), standardizing GFM linebreaks in table cells.
     */
    repairMarkdownLintConfig(configPath) {
        try {
            if (!nodeFs.existsSync(configPath)) {
                return;
            }
            const raw = nodeFs.readFileSync(configPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (typeof parsed !== 'object' || parsed === null) {
                return;
            }
            // If MD033 is explicitly disabled (false), no need to add allowed_elements
            if (parsed.MD033 === false) {
                return;
            }
            if (typeof parsed.MD033 === 'object' && parsed.MD033 !== null) {
                const allowed = Array.isArray(parsed.MD033.allowed_elements) ? parsed.MD033.allowed_elements : [];
                if (!allowed.includes('br')) {
                    parsed.MD033.allowed_elements = [...allowed, 'br'];
                    nodeFs.writeFileSync(configPath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
                }
            }
            else {
                parsed.MD033 = {
                    allowed_elements: ['br']
                };
                nodeFs.writeFileSync(configPath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
            }
        }
        catch (err) {
            // catch-ok: Non-fatal if config is malformed or inaccessible during auto-repair
            if (process.env.DEBUG) {
                console.debug('Failed to auto-repair .markdownlint.json:', err);
            }
        }
    }
}
// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new MarkdownLintAuditor());
//# sourceMappingURL=validate_markdown_lint.js.map