/**
 * scripts/lib/auditorBase.ts
 *
 * BASE AUDITOR FRAMEWORK (Node.js 26+ Native)
 * Mandatory base orchestrator for all sub-auditors in scripts/auditors/.
 * Enforces the StandardAuditResult contract:
 *   1. Always outputs the clean Box-Drawing summary table to console.
 *   2. Always writes 100% complete structured JSON to scratch/audits/<family>/<id>.json.
 */
import fs from 'node:fs/promises';
import nodeFs from 'node:fs';
import path from 'node:path';
import { parseArgs, styleText } from 'node:util';
import { enableCompileCache } from 'node:module';
import { renderBanner, renderAuditTaskRow, renderFindingsDetail } from "./unifiedTheme.js";
import { isMainModule } from "../cli/cliUtils.js";
import { getAuditConfig, loadAuditConfig } from "./auditConfig.js";
enableCompileCache();
/** Directories that must ALWAYS be ignored across all tools, runners, and auditors (compilation, VCS, scratch, test artifacts) */
export const ALWAYS_IGNORE_DIRS = new Set([
    'node_modules',
    '.git',
    '.tsbuildinfo',
    '.vitest-cache',
    '.fallow',
    '.vscode',
    '.github',
    '.gemini',
    'dist',
    'dev-dist',
    'build',
    'coverage',
    'results',
    'test-results',
    'scratch',
    'tmp',
    'volumes'
]);
/** Additional directories ignored during code scanning (documentation/skills and static assets) */
export const CODE_ONLY_IGNORE_DIRS = new Set([
    '.agents',
    'skills',
    'public',
    'packages',
    'docs'
]);
/** Canonical ignore directories for application code auditors (union of ALWAYS + CODE_ONLY) */
export const CANONICAL_IGNORE_DIRS = new Set([
    ...ALWAYS_IGNORE_DIRS,
    ...CODE_ONLY_IGNORE_DIRS
]);
/** Returns the effective set of ignore directories combining canonical defaults with audit.config.ts paths.ignoredDirs */
export function getEffectiveIgnoreDirs() {
    const config = getAuditConfig();
    const custom = config.paths?.ignoredDirs ?? [];
    return new Set([...CANONICAL_IGNORE_DIRS, ...custom]);
}
export const SCANNABLE_EXTENSIONS = new Set(['.ts', '.js', '.vue', '.cjs', '.mjs']); // runtime-set: Fast O(1) membership lookup set
export const CANONICAL_SCANNABLE_ROOTS = [
    'scripts',
    'src',
    'tests'
];
export function getEffectiveScannableRoots(config = getAuditConfig()) {
    const codeRoots = config.paths?.codeRoots ?? ['src', 'scripts'];
    const testRoots = config.paths?.testRoots ?? ['tests'];
    const integrationRoots = config.paths?.integrationRoots ?? [];
    const e2eRoots = config.paths?.e2eRoots ?? [];
    return Array.from(new Set([...codeRoots, ...testRoots, ...integrationRoots, ...e2eRoots]));
}
/**
 * Validates that a path component is safe against path traversal.
 */
export function assertSafePathComponent(component) {
    if (component.includes('..')) {
        throw new Error(`Path traversal attempt detected in path component: ${component}`);
    }
}
/**
 * Loads directory ignore patterns from .fallowrc.json if present.
 */
export function loadFallowIgnorePatterns(projectRoot = process.cwd()) {
    const fallowRcPath = path.resolve(projectRoot, '.fallowrc.json');
    try {
        if (nodeFs.existsSync(fallowRcPath)) {
            const raw = nodeFs.readFileSync(fallowRcPath, 'utf-8');
            const data = JSON.parse(raw);
            return Array.isArray(data.ignorePatterns) ? data.ignorePatterns : [];
        }
    }
    catch {
        // catch-ok: Ignore fallback
    }
    return [];
}
function matchesDirectorySegments(normalized, segments, unignoreSet, configIgnoredDirs) {
    let hasUnignoredAncestor = false;
    const hasConfigIgnored = configIgnoredDirs.length > 0;
    for (const seg of segments) {
        if (ALWAYS_IGNORE_DIRS.has(seg)) {
            return true;
        }
        if (unignoreSet.has(seg)) {
            hasUnignoredAncestor = true;
            continue;
        }
        if (!hasUnignoredAncestor) {
            const isIgnored = CODE_ONLY_IGNORE_DIRS.has(seg) ||
                (hasConfigIgnored &&
                    configIgnoredDirs.some(d => d === seg || normalized === d || normalized.startsWith(d + '/') || normalized.includes('/' + d + '/')));
            if (isIgnored) {
                return true;
            }
        }
    }
    return false;
}
function matchesSinglePattern(normalized, pattern) {
    let cleanPattern = pattern.toLowerCase();
    const matchesAnywhere = cleanPattern.startsWith('**/');
    if (matchesAnywhere) {
        cleanPattern = cleanPattern.slice(3);
    }
    cleanPattern = cleanPattern.replace(/\/\*\*$/, '').replace(/\/\*$/, '');
    if (!cleanPattern)
        return false;
    if (matchesAnywhere) {
        return (normalized === cleanPattern ||
            normalized.startsWith(cleanPattern + '/') ||
            normalized.endsWith('/' + cleanPattern) ||
            normalized.includes('/' + cleanPattern + '/') ||
            cleanPattern.endsWith('/' + normalized));
    }
    return (normalized === cleanPattern ||
        normalized.startsWith(cleanPattern + '/') ||
        normalized.endsWith('/' + cleanPattern) ||
        normalized.includes('/' + cleanPattern) ||
        cleanPattern.endsWith('/' + normalized));
}
/**
 * Determines whether a relative POSIX path belongs to an ignored directory or matches directory ignore patterns.
 */
export function isPathIgnored(relPath, extraIgnorePatterns = [], unignoreDirs = []) {
    const normalized = relPath.split(path.sep).join(path.posix.sep).toLowerCase();
    const segments = normalized.split('/');
    const unignoreSet = unignoreDirs instanceof Set ? unignoreDirs : new Set(unignoreDirs);
    const rawConfigIgnoredDirs = getAuditConfig()?.paths?.ignoredDirs ?? [];
    const configIgnoredDirs = rawConfigIgnoredDirs.map(d => d.toLowerCase().replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''));
    if (matchesDirectorySegments(normalized, segments, unignoreSet, configIgnoredDirs)) {
        return true;
    }
    const configPatterns = getAuditConfig()?.paths?.ignoredPatterns ?? [];
    const configGlobs = getAuditConfig()?.paths?.ignoreGlobs ?? [];
    const allPatterns = [...extraIgnorePatterns, ...configPatterns, ...configGlobs];
    for (const pattern of allPatterns) {
        if (matchesSinglePattern(normalized, pattern)) {
            return true;
        }
    }
    return false;
}
function collectSingleFile(filePath, projectRoot, extraIgnorePatterns, allowedExtensions, unignoreDirs) {
    const relPath = path.relative(projectRoot, filePath).split(path.sep).join(path.posix.sep);
    if (!isPathIgnored(relPath, extraIgnorePatterns, unignoreDirs)) {
        const ext = path.extname(filePath).toLowerCase();
        if (allowedExtensions.has(ext)) {
            return [filePath];
        }
    }
    return [];
}
function processDirentEntry(entry, dir, projectRoot, extraIgnorePatterns, allowedExtensions, unignoreDirs) {
    const fullPath = path.resolve(dir, entry.name);
    const relPath = path.relative(projectRoot, fullPath).split(path.sep).join(path.posix.sep);
    if (isPathIgnored(relPath, extraIgnorePatterns, unignoreDirs)) {
        return [];
    }
    if (entry.isDirectory()) {
        return collectRepositoryFiles(fullPath, projectRoot, extraIgnorePatterns, allowedExtensions, unignoreDirs);
    }
    if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (allowedExtensions.has(ext)) {
            return [fullPath];
        }
    }
    return [];
}
/**
 * Recursively collects scannable files from a directory, applying ignore filters.
 */
export function collectRepositoryFiles(dir, projectRoot = process.cwd(), extraIgnorePatterns = [], allowedExtensions = SCANNABLE_EXTENSIONS, unignoreDirs = []) {
    if (!nodeFs.existsSync(dir))
        return [];
    const stat = nodeFs.statSync(dir);
    if (stat.isFile()) {
        return collectSingleFile(dir, projectRoot, extraIgnorePatterns, allowedExtensions, unignoreDirs);
    }
    let entries;
    try {
        entries = nodeFs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        // catch-ok: directory unreadable or permission denied
        return [];
    }
    const results = [];
    for (const entry of entries) {
        results.push(...processDirentEntry(entry, dir, projectRoot, extraIgnorePatterns, allowedExtensions, unignoreDirs));
    }
    return results;
}
async function persistAuditJsonReport(result, config, outputOption) {
    const scratchFamilyDir = path.resolve(process.cwd(), 'scratch/audits', config.family);
    const targetJsonPath = path.join(scratchFamilyDir, `${config.id}.json`);
    const latestJsonPath = path.resolve(process.cwd(), 'scratch/audits', `latest_${config.id}.json`);
    try {
        await fs.mkdir(scratchFamilyDir, { recursive: true });
        const jsonString = JSON.stringify(result, null, 2);
        await fs.writeFile(targetJsonPath, jsonString, 'utf-8');
        await fs.writeFile(latestJsonPath, jsonString, 'utf-8');
        if (typeof outputOption === 'string' && outputOption && !outputOption.includes('..')) {
            const outPath = path.resolve(process.cwd(), outputOption);
            await fs.writeFile(outPath, jsonString, 'utf-8');
        }
    }
    catch {
        // catch-ok: Ignorar errores de escritura si el comando se ejecuta en modo solo lectura (--allow-fs-read)
    }
    return targetJsonPath;
}
function renderConsoleSummary(result, config, targetJsonPath) {
    console.log(renderBanner(config.name, `Familia: ${config.family.toUpperCase()}  |  ID: ${config.id}`));
    console.log(renderAuditTaskRow(result));
    if (result.findings.length > 0) {
        console.log(renderFindingsDetail(result.findings));
    }
    const relPath = path.relative(process.cwd(), targetJsonPath);
    console.log(`\n${result.status === 'passed' ? styleText('green', '✨ Auditoría completada con éxito.') : styleText('red', '🚨 Auditoría finalizada con errores.')}`);
    console.log(styleText('dim', `💾 Reporte detallado guardado en: ${relPath}\n`));
}
export function setupAuditor(config) {
    const startTime = performance.now();
    const args = process.argv.slice(2);
    const normalized = args.map(a => a.includes('=') && !a.startsWith('-') ? `--${a}` : (['errors-only'].includes(a) ? `--${a}` : a));
    const { values } = parseArgs({
        args: normalized,
        options: {
            output: { type: 'string', short: 'o' },
            'errors-only': { type: 'boolean' }
        },
        strict: false
    });
    const projectRoot = config.projectRoot || process.cwd();
    const fallowIgnores = loadFallowIgnorePatterns(projectRoot);
    const combinedIgnores = [...fallowIgnores, ...(config.extraIgnorePatterns || [])];
    const unignoreDirs = config.unignoreDirs ?? [];
    const isSubprocess = process.env.AUDIT_SUBPROCESS === 'true';
    const findings = [];
    const metrics = {};
    return {
        values: values,
        ignorePatterns: combinedIgnores,
        unignoreDirs,
        isPathIgnored: (relPath) => isPathIgnored(relPath, combinedIgnores, unignoreDirs),
        collectFiles: (roots = getEffectiveScannableRoots(), allowedExtensions = SCANNABLE_EXTENSIONS) => {
            const all = []; // no-domain: Non-domain utility collection or data structure
            for (const root of roots) {
                const fullRoot = path.resolve(projectRoot, root);
                all.push(...collectRepositoryFiles(fullRoot, projectRoot, combinedIgnores, allowedExtensions, unignoreDirs));
            }
            return all;
        },
        logProgress: (msg) => {
            console.log(msg);
        },
        logStep: (stepNumber, totalSteps, description) => {
            console.log(`🔍 [${stepNumber}/${totalSteps}] ${description}`);
        },
        addFinding: (f) => findings.push(f),
        addError: (message, file, line, context, ruleId, ruleDescription, suiteId, suiteName) => {
            findings.push({ severity: 'error', message, file, line, context, ruleId, ruleDescription, suiteId, suiteName });
        },
        addWarning: (message, file, line, context, ruleId, ruleDescription, suiteId, suiteName) => {
            if (!values['errors-only']) {
                findings.push({ severity: 'warning', message, file, line, context, ruleId, ruleDescription, suiteId, suiteName });
            }
        },
        setMetric: (key, value) => {
            metrics[key] = value;
        },
        checkFiles: async () => {
            if (!config.requiredFiles || config.requiredFiles.length === 0)
                return;
            try {
                for (const file of config.requiredFiles) {
                    await fs.access(file);
                }
            }
            catch (_err) {
                console.error(styleText('red', `❌ Archivos requeridos no encontrados o no accesibles:\n${config.requiredFiles.map(f => `   - ${f}`).join('\n')}`));
                if (isSubprocess) {
                    throw new Error(`Archivos requeridos no encontrados: ${config.requiredFiles.join(', ')}`, { cause: _err });
                }
                process.exit(1);
            }
        },
        finish: async (finalMetrics, legacyErrors, legacyWarnings) => {
            if (legacyErrors) {
                for (const err of legacyErrors) {
                    findings.push({ severity: 'error', message: err });
                }
            }
            if (legacyWarnings && !values['errors-only']) {
                for (const warn of legacyWarnings) {
                    findings.push({ severity: 'warning', message: warn });
                }
            }
            if (finalMetrics) {
                Object.assign(metrics, finalMetrics);
            }
            const durationMs = Math.round(performance.now() - startTime);
            const errorsCount = findings.filter(f => f.severity === 'error').length;
            const warningsCount = findings.filter(f => f.severity === 'warning').length;
            const infoCount = findings.filter(f => f.severity === 'info').length;
            const result = {
                id: config.id,
                name: config.name,
                description: config.description,
                family: config.family,
                status: errorsCount === 0 ? 'passed' : 'failed',
                durationMs,
                metrics,
                findings,
                summary: {
                    errors: errorsCount,
                    warnings: warningsCount,
                    info: infoCount
                }
            };
            const targetJsonPath = await persistAuditJsonReport(result, config, values.output);
            if (!isSubprocess) {
                renderConsoleSummary(result, config, targetJsonPath);
                if (errorsCount > 0) {
                    process.exit(1);
                }
            }
            return result;
        }
    };
}
export const MAX_AUDITOR_DESCRIPTION_LENGTH = 50;
export const MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH = 60;
/**
 * Base Object-Oriented Auditor class.
 * Centralizes violation tracking, rule counting, metrics reporting, and unified CLI execution.
 */
function validateAuditorOptions(options) {
    if (!options.id || options.id.trim().length === 0) {
        throw new Error('Auditor must define an id');
    }
    if (!options.name || options.name.trim().length === 0) {
        throw new Error(`Auditor [${options.id}] must define a name`);
    }
    if (!options.description || options.description.trim().length === 0) {
        throw new Error(`Auditor [${options.id}] must define a human-friendly description`);
    }
    if (options.description.length > MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH || options.description.includes('\n')) {
        throw new Error(`Auditor [${options.id}] description exceeds ${MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH} characters or contains newlines.`);
    }
}
function validateAuditorRuleDescriptions(options, formatFn) {
    if (!options.ruleDescriptions)
        return;
    for (const [ruleId, desc] of Object.entries(options.ruleDescriptions)) {
        const descText = typeof desc === 'string' ? desc : '';
        const formatted = formatFn(ruleId, descText);
        if (formatted && (formatted.length > MAX_AUDITOR_DESCRIPTION_LENGTH || formatted.includes('\n'))) {
            throw new Error(`Auditor [${options.id}] rule description for '${ruleId}' ('${formatted}') exceeds ${MAX_AUDITOR_DESCRIPTION_LENGTH} characters or contains newlines.`);
        }
    }
}
export class BaseAuditor {
    id;
    name;
    description;
    family;
    packageName;
    ruleIds;
    ruleDescriptions;
    roots;
    allowedExtensions;
    extraIgnorePatterns;
    unignoreDirs;
    requiredFiles;
    requiresAst;
    projectRoot;
    context;
    countsByRule = new Map();
    filesScannedCount = 0;
    constructor(options) {
        validateAuditorOptions(options);
        this.requiresAst = options.requiresAst ?? false;
        this.packageName = options.packageName;
        this.id = options.id;
        this.name = options.name;
        this.description = options.description;
        this.family = options.family;
        this.ruleIds = options.ruleIds ?? [];
        this.ruleDescriptions = options.ruleDescriptions;
        this.roots = options.roots ?? getEffectiveScannableRoots();
        this.allowedExtensions = options.allowedExtensions ?? SCANNABLE_EXTENSIONS;
        this.extraIgnorePatterns = options.extraIgnorePatterns ?? [];
        this.unignoreDirs = options.unignoreDirs ?? [];
        this.requiredFiles = options.requiredFiles ?? [];
        this.projectRoot = options.projectRoot || process.cwd();
        validateAuditorRuleDescriptions(options, (r, d) => this.formatRuleDescription(r, d));
        for (const ruleId of this.ruleIds) {
            this.countsByRule.set(ruleId, 0);
        }
        this.context = setupAuditor({
            id: this.id,
            name: this.name,
            description: this.description,
            family: this.family,
            requiredFiles: [...this.requiredFiles],
            extraIgnorePatterns: [...this.extraIgnorePatterns],
            unignoreDirs: [...this.unignoreDirs],
            projectRoot: this.projectRoot
        });
    }
    getCountsByRule() {
        return this.countsByRule;
    }
    formatRuleDescription(ruleId, rawDescription) {
        const raw = rawDescription || this.ruleDescriptions?.[ruleId] || ruleId;
        if (this.packageName && !raw.toLowerCase().startsWith(this.packageName.toLowerCase() + ':')) {
            const combined = `${this.packageName}: ${raw}`;
            return combined.length <= MAX_AUDITOR_DESCRIPTION_LENGTH ? combined : raw;
        }
        return raw;
    }
    getRuleLabel(ruleId) {
        return this.formatRuleDescription(ruleId);
    }
    getFilesScanned() {
        return this.filesScannedCount;
    }
    addViolation(v) {
        const current = this.countsByRule.get(v.ruleId) ?? 0;
        this.countsByRule.set(v.ruleId, current + 1);
        const ruleDesc = this.formatRuleDescription(v.ruleId, v.ruleDescription);
        if (v.severity === 'error') {
            this.context.addError(v.message, v.file, v.line, v.context, v.ruleId, ruleDesc, this.id, this.name);
        }
        else {
            this.context.addWarning(v.message, v.file, v.line, v.context, v.ruleId, ruleDesc, this.id, this.name);
        }
    }
    isLineIgnored(line, customTokens = []) {
        const baseTokens = ['domain-ok', 'string-ok', 'test-ok', 'fallow-ignore-next-line', ...customTokens];
        const pattern = new RegExp(`(?:--|\\/\\/|<!--)\\s*(?:${baseTokens.join('|')})\\b`, 'i');
        return pattern.test(line);
    }
    hasEscapeHatch(line, hatches) {
        return hatches.some(h => line.includes(`// ${h}`) || line.includes(`/* ${h}`) || line.includes(`<!-- ${h}`));
    }
    isFixModeRequested() {
        const rawValues = this.context.values;
        return process.argv.includes('fix') || process.argv.includes('--fix') || Boolean(rawValues?.fix);
    }
    getLineNumber(content, charIndex) {
        return content.slice(0, charIndex).split('\n').length;
    }
    getLineAt(content, lineIndex) {
        const lines = content.split('\n');
        return lines[lineIndex - 1] ?? '';
    }
    scanRegexMatches(content, regex, relPath, ruleId, escapeHatches, message, filter, sourceForLines = content, charOffset = 0) {
        let match;
        const re = new RegExp(regex.source, regex.flags);
        while ((match = re.exec(content)) !== null) {
            const line = this.getLineNumber(sourceForLines, charOffset + match.index);
            const lineContent = this.getLineAt(sourceForLines, line);
            if (filter && !filter(lineContent, match))
                continue;
            if (this.hasEscapeHatch(lineContent, escapeHatches))
                continue;
            this.addViolation({
                ruleId,
                severity: 'error',
                file: relPath,
                line,
                message,
                context: lineContent.trim()
            });
        }
    }
    async execute(astContext) {
        await loadAuditConfig(this.projectRoot);
        await this.context.checkFiles();
        let effectiveAst = astContext;
        if (!effectiveAst && this.requiresAst) {
            const { SharedAstContext } = await import("./astContext.js");
            effectiveAst = new SharedAstContext();
        }
        await this.runAudit(effectiveAst);
        this.context.setMetric('Files Scanned', this.filesScannedCount);
        for (const [ruleId, count] of this.countsByRule.entries()) {
            this.context.setMetric(`Rule: ${ruleId}`, count);
        }
        return await this.context.finish({
            'Files Scanned': this.filesScannedCount
        });
    }
    async finishAudit() {
        return await this.context.finish({
            'Files Scanned': this.filesScannedCount
        });
    }
    importAuditFindings(findings, fallbackRuleId, fallbackContext = this.id) {
        for (const f of findings) {
            this.addViolation({
                ruleId: f.ruleId || fallbackRuleId,
                severity: f.severity === 'warning' ? 'warning' : 'error',
                file: f.file || '',
                line: f.line || 1,
                context: f.context || fallbackContext,
                message: f.message
            });
        }
    }
    static async runCli(auditor) {
        await auditor.execute();
    }
    static async runCliIfMain(metaUrl, auditor) {
        if (isMainModule(metaUrl)) {
            await BaseAuditor.runCli(auditor);
        }
    }
}
/**
 * Specialized File-Scanning Auditor.
 * Automates recursive file discovery, ignore filtering, reading, and line-by-line scanning dispatch.
 */
export class FileScanAuditor extends BaseAuditor {
    async runAudit(astContext) {
        const files = this.context.collectFiles(this.roots, this.allowedExtensions);
        let effectiveAst = astContext;
        if (!effectiveAst && this.requiresAst) {
            const { SharedAstContext } = await import("./astContext.js");
            effectiveAst = new SharedAstContext();
        }
        for (const file of files) {
            const relPath = path.relative(this.projectRoot, file).split(path.sep).join(path.posix.sep);
            try {
                const content = nodeFs.readFileSync(file, 'utf-8');
                this.filesScannedCount++;
                const sourceFile = effectiveAst && this.requiresAst ? effectiveAst.getSourceFile(file, content) : undefined;
                await this.scanFile(relPath, content, sourceFile);
            }
            catch {
                // catch-ok: Ignore read errors on inaccessible files
            }
        }
    }
}
//# sourceMappingURL=auditorBase.js.map