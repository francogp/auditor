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
import "./permissionGuard.js";
import { GitIgnoreRegistry } from "./gitIgnoreRegistry.js";
import { ConfigFileRegistry } from "./configFileRegistry.js";
import { CoverageRecorder, deriveCoverageFromRoots, deriveCoverageFromRequiredFiles, isDeclaredByCoverage, resolveActiveCoverageRunId, toPosixRelative, validateCoverageDeclaration, writeCoverageLedger } from "./auditCoverage.js";
import { renderBanner, renderAuditTaskRow, renderFindingsDetail, renderSimilarCodeWarningBanner } from "./unifiedTheme.js";
import { isMainModule } from "../cli/cliUtils.js";
import { getAuditConfig, loadAuditConfig } from "./auditConfig.js";
import { evaluateSuiteStatus } from "./suiteGating.js";
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
function resolvePersistenceExtraRoots(config) {
    if (config.persistence?.engine === 'none')
        return [];
    const extra = []; // no-domain: Dynamic filesystem root paths
    if (config.persistence?.supabaseDir)
        extra.push(config.persistence.supabaseDir);
    if (config.paths?.migrationsDir)
        extra.push(config.paths.migrationsDir);
    return extra;
}
function resolveDeclaredPathRoots(paths) {
    if (!paths)
        return ['src', 'scripts', 'tests'];
    return [
        ...(paths.codeRoots ?? ['src', 'scripts']),
        ...(paths.testRoots ?? ['tests']),
        ...(paths.integrationRoots ?? []),
        ...(paths.e2eRoots ?? []),
        ...(paths.demoRoots ?? []),
        ...(paths.dataRoots ?? []),
        ...(paths.cliRoots ?? [])
    ];
}
export function getEffectiveScannableRoots(config = getAuditConfig()) {
    return Array.from(new Set([
        ...resolveDeclaredPathRoots(config.paths),
        ...resolvePersistenceExtraRoots(config)
    ]));
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
let lockedSkillsCache = null;
let lockedSkillsCacheRoot = null;
export function clearLockedSkillsCache() {
    lockedSkillsCache = null;
    lockedSkillsCacheRoot = null;
}
/**
 * Canonical candidate relative locations for skills-lock.json in order of precedence.
 */
export const SKILLS_LOCK_CANDIDATE_PATHS = [
    'skills-lock.json',
    '.auditor/skills-lock.json',
    '.agents/skills-lock.json'
];
function parseLockedSkillsFile(skillsLockPath) {
    try {
        if (!nodeFs.existsSync(skillsLockPath))
            return [];
        const raw = nodeFs.readFileSync(skillsLockPath, 'utf-8');
        const data = JSON.parse(raw);
        if (data?.skills && typeof data.skills === 'object') {
            return Object.keys(data.skills).map(s => s.toLowerCase()); // no-domain: Skill name case-insensitive key
        }
    }
    catch {
        // catch-ok: Ignore missing or malformed skills-lock.json candidate
    }
    return [];
}
function resolveSkillsLockCandidates(projectRoot) {
    const candidatePaths = [...SKILLS_LOCK_CANDIDATE_PATHS];
    try {
        const config = getAuditConfig(projectRoot);
        if (config?.paths?.skillsLockFile && !candidatePaths.includes(config.paths.skillsLockFile)) {
            candidatePaths.unshift(config.paths.skillsLockFile);
        }
    }
    catch {
        // catch-ok: Ignore config load failures during skill lock resolution
    }
    return candidatePaths;
}
export function loadLockedSkills(projectRoot = process.cwd()) {
    if (lockedSkillsCache && lockedSkillsCacheRoot === projectRoot) {
        return lockedSkillsCache;
    }
    const locked = new Set();
    for (const relPath of resolveSkillsLockCandidates(projectRoot)) {
        for (const skill of parseLockedSkillsFile(path.resolve(projectRoot, relPath))) {
            locked.add(skill);
        }
    }
    lockedSkillsCache = locked;
    lockedSkillsCacheRoot = projectRoot;
    return locked;
}
/**
 * Checks whether a relative POSIX or absolute path belongs to an official/locked skill directory
 * (e.g. .agents/skills/<lockedSkill>/**, skills/<lockedSkill>/**, .skills/<lockedSkill>/**).
 */
export function isLockedSkillPath(filePath, projectRoot = process.cwd()) {
    const locked = loadLockedSkills(projectRoot);
    if (locked.size === 0)
        return false;
    const rel = path.isAbsolute(filePath)
        ? path.relative(projectRoot, filePath)
        : filePath;
    const normalized = rel.replace(/\\/g, '/').toLowerCase().replace(/^\/+/, '');
    const segments = normalized.split('/');
    for (let i = 0; i < segments.length - 1; i++) {
        const parent = segments[i];
        const candidate = segments[i + 1];
        if ((parent === 'skills' || parent === '.skills') && candidate && locked.has(candidate)) {
            return true;
        }
        if (parent === '.agents' && candidate === 'skills' && i + 2 < segments.length) {
            const skillName = segments[i + 2];
            if (skillName && locked.has(skillName)) {
                return true;
            }
        }
    }
    return false;
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
export function matchesSinglePattern(normalized, pattern) {
    let cleanPattern = pattern.toLowerCase(); // no-domain: Non-domain utility collection or data structure
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
            normalized.includes('/' + cleanPattern + '/'));
    }
    return (normalized === cleanPattern ||
        normalized.startsWith(cleanPattern + '/'));
}
/**
 * Determines whether a relative POSIX path belongs to an ignored directory or matches directory ignore patterns.
 */
export function isPathIgnored(relPath, extraIgnorePatterns = [], unignoreDirs = [], projectRoot = process.cwd()) {
    if (isLockedSkillPath(relPath, projectRoot)) {
        return true;
    }
    const normalized = relPath.split(path.sep).join(path.posix.sep).toLowerCase();
    const segments = normalized.split('/');
    const unignoreSet = unignoreDirs instanceof Set ? unignoreDirs : new Set(unignoreDirs);
    const rawConfigIgnoredDirs = getAuditConfig()?.paths?.ignoredDirs ?? [];
    const configIgnoredDirs = rawConfigIgnoredDirs.map(d => d.toLowerCase().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')); // no-domain: Non-domain utility collection or data structure
    if (matchesDirectorySegments(normalized, segments, unignoreSet, configIgnoredDirs)) {
        return true;
    }
    const configPatterns = getAuditConfig()?.paths?.ignoredPatterns ?? [];
    const configGlobs = getAuditConfig()?.paths?.ignoreGlobs ?? [];
    const allPatterns = [...extraIgnorePatterns, ...configPatterns, ...configGlobs];
    for (const pattern of allPatterns) {
        if (matchesSinglePattern(normalized, pattern)) {
            if (segments.some(seg => unignoreSet.has(seg))) {
                continue;
            }
            return true;
        }
    }
    return false;
}
function collectSingleFile(filePath, projectRoot, extraIgnorePatterns, allowedExtensions, unignoreDirs) {
    const relPath = path.relative(projectRoot, filePath).split(path.sep).join(path.posix.sep);
    if (!isPathIgnored(relPath, extraIgnorePatterns, unignoreDirs, projectRoot)) {
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
    if (isPathIgnored(relPath, extraIgnorePatterns, unignoreDirs, projectRoot)) {
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
    if (result.findings.some(f => f.ruleId === 'fallow-similar-code-failed' && (f.context === 'manual-setup-required' || f.context === 'model-not-ready'))) {
        console.log('\n' + renderSimilarCodeWarningBanner() + '\n');
    }
    if (result.status === 'skipped') {
        const reason = result.metrics?.['Skip-Reason'] || 'Omitido';
        console.log(styleText('cyan', `\n⏭️ Auditoría omitida: ${reason}\n`));
        return;
    }
    const relPath = path.relative(process.cwd(), targetJsonPath);
    console.log(`\n${result.status === 'passed' ? styleText('green', '✨ Auditoría completada con éxito.') : styleText('red', '🚨 Auditoría finalizada con errores.')}`);
    console.log(styleText('dim', `💾 Reporte detallado guardado en: ${relPath}\n`));
}
function normalizeAuditorFilePath(file, projectRoot) {
    if (!file)
        return file;
    const normFile = path.isAbsolute(file)
        ? path.relative(projectRoot, file).replace(/\\/g, '/')
        : file.replace(/\\/g, '/');
    if (isLockedSkillPath(normFile, projectRoot)) {
        return null;
    }
    return normFile;
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
    const scannableRoots = getEffectiveScannableRoots(getAuditConfig(projectRoot));
    const fallowIgnores = loadFallowIgnorePatterns(projectRoot).filter(pat => {
        const norm = pat.replace(/\/\*\*?$/, '').replace(/^\/+/, '');
        return !scannableRoots.some(r => r === norm || norm.startsWith(`${r}/`));
    });
    const combinedIgnores = [...fallowIgnores, ...(config.extraIgnorePatterns || [])];
    const unignoreDirs = config.unignoreDirs ?? [];
    const isSubprocess = process.env.AUDIT_SUBPROCESS === 'true';
    const findings = [];
    const metrics = {};
    let customLogProgress;
    let customLogStep;
    return {
        values: values,
        ignorePatterns: combinedIgnores,
        unignoreDirs,
        isPathIgnored: (relPath) => isPathIgnored(relPath, combinedIgnores, unignoreDirs, projectRoot),
        collectFiles: (roots = getEffectiveScannableRoots(), allowedExtensions = SCANNABLE_EXTENSIONS) => {
            const all = []; // no-domain: Non-domain utility collection or data structure
            for (const root of roots) {
                const fullRoot = path.resolve(projectRoot, root);
                all.push(...collectRepositoryFiles(fullRoot, projectRoot, combinedIgnores, allowedExtensions, unignoreDirs));
            }
            config.onFilesCollected?.(all);
            return all;
        },
        logProgress: (msg) => {
            if (customLogProgress) {
                customLogProgress(msg);
            }
            else {
                console.log(msg);
            }
        },
        logStep: (stepNumber, totalSteps, description) => {
            if (customLogStep) {
                customLogStep(stepNumber, totalSteps, description);
            }
            else {
                console.log(`🔍 [${stepNumber}/${totalSteps}] ${description}`);
            }
        },
        setStepLogger: (logger) => {
            customLogStep = logger;
        },
        setProgressLogger: (logger) => {
            customLogProgress = logger;
        },
        addFinding: (f) => {
            const normFile = normalizeAuditorFilePath(f.file, projectRoot);
            if (normFile === null) {
                return;
            }
            findings.push({ ...f, file: normFile });
        },
        addError: (message, file, line, context, ruleId, ruleDescription, suiteId, suiteName) => {
            const normFile = normalizeAuditorFilePath(file, projectRoot);
            if (normFile === null) {
                return;
            }
            findings.push({ severity: 'error', message, file: normFile, line, context, ruleId, ruleDescription, suiteId, suiteName });
        },
        addWarning: (message, file, line, context, ruleId, ruleDescription, suiteId, suiteName) => {
            if (!values['errors-only']) {
                const normFile = normalizeAuditorFilePath(file, projectRoot);
                if (normFile === null) {
                    return;
                }
                findings.push({ severity: 'warning', message, file: normFile, line, context, ruleId, ruleDescription, suiteId, suiteName });
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
        finish: async (finalMetrics) => {
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
export const DEFAULT_AUDITOR_CAPABILITIES = Object.freeze({
    fix: false,
    lint: false,
    md: false,
    ast: false,
    changedSince: false,
    heavy: false,
    requiresBuild: false,
    postRun: false
});
export const MAX_AUDITOR_DESCRIPTION_LENGTH = 50;
export const MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH = 60;
/**
 * Base Object-Oriented Auditor class validation helpers.
 */
function validateAuditorIdentity(options) {
    if (typeof options.id !== 'string' || options.id.trim() === '') {
        throw new Error('Auditor must define an id');
    }
    if (typeof options.name !== 'string' || options.name.trim() === '') {
        throw new Error(`Auditor [${options.id}] must define a name`);
    }
    if (!options.packageName || options.packageName.trim().length === 0) {
        throw new Error(`Auditor [${options.id}] must define a packageName`);
    }
    if (!options.icon || typeof options.icon !== 'string' || options.icon.trim().length === 0) {
        throw new Error(`Auditor [${options.id}] must define a mandatory thematic icon/emoji`);
    }
    if (!options.description || options.description.trim().length === 0) {
        throw new Error(`Auditor [${options.id}] must define a human-friendly description`);
    }
    if (options.description.length > MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH || options.description.includes('\n')) {
        throw new Error(`Auditor [${options.id}] description exceeds ${MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH} characters or contains newlines.`);
    }
}
function validateAuditorCapabilities(options) {
    if (options.capabilities === undefined)
        return;
    if (typeof options.capabilities !== 'object' || options.capabilities === null) {
        throw new Error(`Auditor [${options.id}] 'capabilities' must be an object if defined.`);
    }
    const KNOWN_CAPABILITIES = ['fix', 'lint', 'md', 'ast', 'changedSince', 'heavy', 'requiresBuild', 'postRun'];
    for (const [key, val] of Object.entries(options.capabilities)) {
        if (!KNOWN_CAPABILITIES.includes(key)) {
            throw new Error(`Auditor [${options.id}] declared unknown capability '${key}'.`);
        }
        if (typeof val !== 'boolean') {
            throw new Error(`Auditor [${options.id}] capability '${key}' must be a boolean.`);
        }
    }
}
function validateAuditorRules(options) {
    if (!options.ruleDescriptions || typeof options.ruleDescriptions !== 'object' || Object.keys(options.ruleDescriptions).length === 0) {
        throw new Error(`Auditor [${options.id}] must define mandatory 'ruleDescriptions' covering all its declared rules.`);
    }
}
function validateAuditorOptions(options) {
    validateAuditorIdentity(options);
    validateAuditorCapabilities(options);
    validateAuditorRules(options);
    if (options.gitIgnoreEntries !== undefined && !Array.isArray(options.gitIgnoreEntries)) {
        throw new Error(`Auditor [${options.id}] 'gitIgnoreEntries' must be an array if defined.`);
    }
    validateCoverageDeclaration(options.id, options.coverage);
}
function validateAuditorRuleDescriptions(options, formatFn) {
    if (!options.ruleDescriptions)
        return;
    const declaredRules = options.ruleIds && options.ruleIds.length > 0 ? options.ruleIds : Object.keys(options.ruleDescriptions);
    for (const rawRuleId of declaredRules) {
        const ruleId = rawRuleId;
        const desc = options.ruleDescriptions[ruleId];
        if (!desc || typeof desc !== 'string' || !desc.trim()) {
            throw new Error(`Auditor [${options.id}] is missing a rule description for rule '${ruleId}'.`);
        }
        const formatted = formatFn(ruleId, desc);
        if (formatted.length > MAX_AUDITOR_DESCRIPTION_LENGTH || formatted.includes('\n')) {
            throw new Error(`Auditor [${options.id}] rule description for '${ruleId}' ('${formatted}', length: ${formatted.length}) exceeds ${MAX_AUDITOR_DESCRIPTION_LENGTH} characters or contains newlines.`);
        }
    }
}
export class BaseAuditor {
    id;
    name;
    description;
    family;
    packageName;
    icon;
    capabilities;
    gitIgnoreEntries;
    configFiles;
    ruleIds;
    ruleDescriptions;
    explicitSubAuditors;
    roots;
    allowedExtensions;
    extraIgnorePatterns;
    unignoreDirs;
    requiredFiles;
    requiresAst;
    projectRoot;
    configKey;
    context;
    countsByRule = new Map();
    subAuditorReports = [];
    coverageRecorder;
    fixMode;
    isSkipped = false;
    skipReason;
    /** Derived from the coverage recorder: record real files with `recordScanned()` instead of counting. */
    get filesScannedCount() {
        return this.coverageRecorder.scannedCount;
    }
    set filesScannedCount(count) {
        this.coverageRecorder.recordExternalScanCount(count);
    }
    markSkipped(reason) {
        this.isSkipped = true;
        this.skipReason = reason;
    }
    resolveEffectiveCoverage(options, effectiveProjectRoot) {
        if (options.coverage)
            return options.coverage;
        if (options.roots !== undefined) {
            const targetRoots = options.roots.length > 0 ? options.roots : getEffectiveScannableRoots();
            return deriveCoverageFromRoots(targetRoots, options.allowedExtensions ?? SCANNABLE_EXTENSIONS);
        }
        if (options.requiredFiles && options.requiredFiles.length > 0) {
            return deriveCoverageFromRequiredFiles(options.requiredFiles, effectiveProjectRoot, options.allowedExtensions);
        }
        return undefined;
    }
    registerAuditorDependencies(options) {
        if (options.gitIgnoreEntries && options.gitIgnoreEntries.length > 0) {
            GitIgnoreRegistry.registerMany(options.gitIgnoreEntries);
        }
        if (options.configFiles && options.configFiles.length > 0) {
            ConfigFileRegistry.registerMany(options.configFiles);
        }
    }
    initExecutionContext(coverageDeclaration) {
        return setupAuditor({
            id: this.id,
            name: this.name,
            description: this.description,
            family: this.family,
            requiredFiles: [...this.requiredFiles],
            extraIgnorePatterns: [...this.extraIgnorePatterns],
            unignoreDirs: [...this.unignoreDirs],
            projectRoot: this.projectRoot,
            onFilesCollected: (files) => {
                for (const f of files) {
                    const rel = toPosixRelative(this.projectRoot, f);
                    if (isDeclaredByCoverage(rel, coverageDeclaration)) {
                        this.recordScanned(rel);
                    }
                }
            }
        });
    }
    constructor(options) {
        const effectiveProjectRoot = options.projectRoot || process.cwd();
        const effectiveCoverage = this.resolveEffectiveCoverage(options, effectiveProjectRoot);
        validateAuditorOptions({ ...options, coverage: effectiveCoverage });
        const astRequired = Boolean(options.requiresAst || options.capabilities?.ast);
        this.capabilities = { ...DEFAULT_AUDITOR_CAPABILITIES, ...options.capabilities, ast: astRequired };
        this.requiresAst = astRequired;
        this.packageName = options.packageName;
        this.icon = options.icon;
        this.id = options.id;
        this.name = options.name;
        this.description = options.description;
        this.family = options.family;
        this.configKey = options.configKey;
        this.gitIgnoreEntries = options.gitIgnoreEntries ?? [];
        this.configFiles = options.configFiles ?? [];
        this.fixMode = Boolean(options.fix);
        this.ruleIds = options.ruleIds ?? Object.keys(options.ruleDescriptions);
        this.ruleDescriptions = options.ruleDescriptions;
        this.explicitSubAuditors = options.subAuditors;
        this.roots = options.roots ?? getEffectiveScannableRoots();
        this.allowedExtensions = options.allowedExtensions ?? SCANNABLE_EXTENSIONS;
        this.extraIgnorePatterns = options.extraIgnorePatterns ?? [];
        this.unignoreDirs = options.unignoreDirs ?? [];
        this.requiredFiles = options.requiredFiles ?? [];
        this.projectRoot = effectiveProjectRoot;
        this.coverageRecorder = new CoverageRecorder(this.projectRoot, effectiveCoverage);
        this.registerAuditorDependencies(options);
        validateAuditorRuleDescriptions(options, (r, d) => this.formatRuleDescription(r, d));
        for (const ruleId of this.ruleIds) {
            this.countsByRule.set(ruleId, 0);
        }
        this.context = this.initExecutionContext(this.coverageRecorder.declaration);
    }
    /** Full rule catalog used for dormancy detection (declared ruleIds, else ruleDescriptions keys). */
    getRuleCatalog() {
        if (this.ruleIds.length > 0)
            return this.ruleIds;
        return Object.keys(this.ruleDescriptions ?? {});
    }
    /** Records a file that this suite actually analyzed (absolute or project-relative path). */
    recordScanned(filePath) {
        this.coverageRecorder.recordScanned(filePath);
    }
    unrecordScanned(filePath) {
        this.coverageRecorder.unrecordScanned(filePath);
    }
    recordScannedMany(filePaths) {
        for (const f of filePaths)
            this.coverageRecorder.recordScanned(f);
    }
    /**
     * Evaluates an assertion or check block for a declared rule.
     * Automatically marks the rule as evaluated in the coverage ledger.
     */
    async evaluateRule(ruleId, evaluateFn) {
        this.markRuleEvaluated(ruleId);
        await evaluateFn();
    }
    /** Synchronous variant for inline invariant evaluation. */
    evaluateRuleSync(ruleId, evaluateFn) {
        this.markRuleEvaluated(ruleId);
        evaluateFn();
    }
    /**
     * Asserts a condition for a rule. Automatically marks the rule as evaluated.
     * If condition is false, adds a violation.
     */
    assertRule(ruleId, condition, violation) {
        this.markRuleEvaluated(ruleId);
        if (!condition) {
            this.addViolation({ ruleId, ...violation });
        }
    }
    /** Refines the coverage declaration at runtime (e.g. from config-driven roots loaded after construction). */
    redeclareCoverage(declaration) {
        this.coverageRecorder.redeclare(this.id, declaration);
    }
    /** For `declared-only` suites whose external engine reports a file count but no file list. */
    recordExternalScanCount(count) {
        this.coverageRecorder.recordExternalScanCount(count);
    }
    /** Adds dynamically discovered rule ids (rule engines without static ruleIds) to the dormancy catalog. */
    declareRuleCatalog(ruleIds) {
        this.coverageRecorder.declareRuleCatalog(ruleIds);
    }
    /** Records that a rule passed its activation gates and was evaluated (per file, or per tool invocation). */
    markRuleEvaluated(ruleId, count = 1) {
        this.coverageRecorder.markRuleEvaluated(ruleId, count);
    }
    /**
     * Loud failure for obsolete v3 method name.
     * Enforces the Loud Failure Mandate under AGENTS.md.
     */
    recordRuleEvaluation(ruleId) {
        throw new Error(`[BaseAuditor]: Method 'recordRuleEvaluation' is obsolete and was removed in v4+. Use 'this.markRuleEvaluated("${ruleId}")' instead.`);
    }
    /** Explicitly declares a rule as non-applicable for this run; never silent, always justified. */
    markRuleNotApplicable(ruleId, reason) {
        this.coverageRecorder.markRuleNotApplicable(ruleId, reason);
    }
    /**
     * Evaluates suite gating against configuration and marks rules not applicable and suite skipped if disabled.
     * Returns true if the suite is disabled, allowing an immediate clean early return.
     */
    isSuiteGatingDisabled(defaultReason = 'Suite desactivada en config') {
        const config = getAuditConfig(this.projectRoot);
        const gating = evaluateSuiteStatus(this.id, config);
        if (!gating.enabled) {
            const reason = gating.reason ?? defaultReason;
            for (const ruleId of this.ruleIds) {
                this.markRuleNotApplicable(ruleId, reason);
            }
            this.markSkipped(reason);
            return true;
        }
        return false;
    }
    /** Gets evaluation count recorded so far for a given rule. */
    getEvaluations(ruleId) {
        return this.coverageRecorder.getEvaluations(ruleId);
    }
    getCoverageRecorder() {
        return this.coverageRecorder;
    }
    async persistCoverageLedger() {
        const runId = resolveActiveCoverageRunId();
        if (!runId)
            return;
        for (const [ruleId, count] of this.countsByRule) {
            if (count > 0 && this.coverageRecorder.getEvaluations(ruleId) === 0) {
                this.coverageRecorder.markRuleEvaluated(ruleId);
            }
        }
        await writeCoverageLedger(this.projectRoot, this.coverageRecorder.toLedger({
            runId,
            suiteId: this.id,
            skipped: this.isSkipped,
            ruleIds: this.getRuleCatalog()
        }));
    }
    getSubAuditors() {
        if (this.explicitSubAuditors && this.explicitSubAuditors.length > 0) {
            return this.explicitSubAuditors;
        }
        return this.ruleIds.map(ruleId => ({
            id: ruleId,
            name: this.formatRuleDescription(ruleId),
            description: this.ruleDescriptions?.[ruleId]
        }));
    }
    logSubAudit(stepNumber, totalSteps, name, result, detail) {
        const count = typeof result === 'number' ? result : 0;
        let badge = '';
        if (typeof result === 'number') {
            if (result > 0) {
                badge = ` (🐛 ${result})`;
            }
        }
        else if (result !== 'passed') {
            badge = ` (${result})`;
        }
        const extra = detail ? (badge ? ` - ${detail}` : ` (${detail})`) : '';
        this.context.logStep(stepNumber, totalSteps, `${name}${badge}${extra}`);
        this.subAuditorReports.push({
            id: `${this.id}_step_${stepNumber}`,
            name,
            status: count > 0 ? 'warning' : 'passed',
            count,
            detail
        });
    }
    getCountsByRule() {
        return this.countsByRule;
    }
    formatRuleDescription(ruleId, rawDescription) {
        const raw = rawDescription || this.ruleDescriptions?.[ruleId] || ruleId;
        if (this.packageName && !raw.toLowerCase().startsWith(this.packageName.toLowerCase() + ':')) {
            return `${this.packageName}: ${raw}`;
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
        if (!(v.ruleId in this.ruleDescriptions)) {
            throw new Error(`[Auditor Contract Violation] Rule '${v.ruleId}' emitted in '${this.id}' is NOT registered in 'ruleDescriptions'. All emitted rules must be registered in the constructor.`);
        }
        if (v.file && isLockedSkillPath(v.file, this.projectRoot)) {
            return;
        }
        const current = this.countsByRule.get(v.ruleId) ?? 0;
        this.countsByRule.set(v.ruleId, current + 1);
        const ruleDesc = this.formatRuleDescription(v.ruleId, v.ruleDescription);
        const normalizedFile = v.file
            ? (path.isAbsolute(v.file)
                ? path.relative(this.projectRoot, v.file).replace(/\\/g, '/')
                : v.file.replace(/\\/g, '/'))
            : v.file;
        if (v.severity === 'error') {
            this.context.addFinding({
                severity: 'error',
                message: v.message,
                file: normalizedFile,
                line: v.line,
                col: v.col,
                context: v.context,
                ruleId: v.ruleId,
                ruleDescription: ruleDesc,
                suiteId: this.id,
                suiteName: this.name
            });
        }
        else {
            if (!this.context.values['errors-only']) {
                this.context.addFinding({
                    severity: 'warning',
                    message: v.message,
                    file: normalizedFile,
                    line: v.line,
                    col: v.col,
                    context: v.context,
                    ruleId: v.ruleId,
                    ruleDescription: ruleDesc,
                    suiteId: this.id,
                    suiteName: this.name
                });
            }
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
    isFixActive() {
        return this.fixMode || this.isFixModeRequested();
    }
    isFixModeRequested() {
        const rawValues = this.context.values; // open-record: Generic parsed CLI flags and options dictionary
        return (this.fixMode ||
            process.argv.includes('fix') ||
            process.argv.includes('--fix') ||
            process.env.AUDIT_FIX === 'true' ||
            Boolean(rawValues?.fix));
    }
    /**
     * Resolves whether any declared file or candidate file for this requirement exists on disk.
     * Returns the absolute path of the first existing candidate, or null if none exist.
     */
    resolveConfigFile(requirement) {
        const candidates = requirement.candidateFiles && requirement.candidateFiles.length > 0
            ? requirement.candidateFiles
            : [requirement.file];
        for (const candidate of candidates) {
            const fullPath = path.resolve(this.projectRoot, candidate);
            if (nodeFs.existsSync(fullPath)) {
                return fullPath;
            }
        }
        return null;
    }
    async scaffoldDefaultConfigFile(requirement, config) {
        if (requirement.ruleId) {
            this.markRuleEvaluated(requirement.ruleId);
        }
        const targetPath = path.resolve(this.projectRoot, requirement.file);
        nodeFs.mkdirSync(path.dirname(targetPath), { recursive: true });
        const content = await requirement.generateDefaultContent({
            projectRoot: this.projectRoot,
            packageName: this.packageName,
            config
        });
        if (!nodeFs.existsSync(targetPath)) {
            nodeFs.writeFileSync(targetPath, content, 'utf-8');
        }
        return { resolvedPath: targetPath, created: true };
    }
    reportMissingConfigFileViolation(requirement, config) {
        if (!requirement.ruleId)
            return;
        this.markRuleEvaluated(requirement.ruleId);
        const fixCtx = {
            projectRoot: this.projectRoot,
            packageName: this.packageName,
            config
        };
        const message = typeof requirement.customMissingMessage === 'function'
            ? requirement.customMissingMessage(fixCtx, requirement.file)
            : (requirement.customMissingMessage ??
                `No se encontró el archivo de configuración requerido '${requirement.file}' (${requirement.description}). Ejecuta con --fix para inicializarlo.`);
        const reportedFile = requirement.customMissingFile
            ? requirement.customMissingFile(fixCtx, requirement.file)
            : requirement.file;
        this.addViolation({
            ruleId: requirement.ruleId,
            severity: 'error',
            file: reportedFile,
            line: 1,
            col: 1,
            context: requirement.file,
            message
        });
    }
    async ensureConfigFile(requirement) {
        const config = getAuditConfig(this.projectRoot);
        if (requirement.isApplicable && !requirement.isApplicable(config, this.projectRoot)) {
            return null;
        }
        const existingPath = this.resolveConfigFile(requirement);
        if (existingPath) {
            if (requirement.ruleId) {
                this.markRuleEvaluated(requirement.ruleId);
            }
            return { resolvedPath: existingPath, created: false };
        }
        if (this.isFixActive()) {
            return this.scaffoldDefaultConfigFile(requirement, config);
        }
        this.reportMissingConfigFileViolation(requirement, config);
        return null;
    }
    /**
     * Iterates through all declared `configFiles`, ensuring that every applicable requirement
     * is satisfied or scaffolded. Returns true if all applicable requirements are met, false otherwise.
     */
    async verifyAndFixConfigFiles() {
        let allSatisfied = true;
        for (const requirement of this.configFiles) {
            const result = await this.ensureConfigFile(requirement);
            if (result === null) {
                const config = getAuditConfig(this.projectRoot);
                const isApp = requirement.isApplicable ? requirement.isApplicable(config, this.projectRoot) : true;
                if (isApp) {
                    allSatisfied = false;
                }
            }
        }
        return allSatisfied;
    }
    isPathIgnored(relPath) {
        return this.context.isPathIgnored(relPath);
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
        this.markRuleEvaluated(ruleId);
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
        for (const rf of this.requiredFiles) {
            const abs = path.isAbsolute(rf) ? rf : path.resolve(this.projectRoot, rf);
            try {
                if (nodeFs.existsSync(abs) && !nodeFs.statSync(abs).isDirectory()) {
                    this.recordScanned(toPosixRelative(this.projectRoot, rf));
                }
            }
            catch {
                // catch-ok: ignore missing files
            }
        }
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
        return this.finishAudit();
    }
    async finishAudit() {
        await this.persistCoverageLedger();
        if (this.isSkipped) {
            const skipMessage = this.skipReason || 'Omitido';
            this.context.logProgress(`⏭️  ${skipMessage}`);
            this.context.setMetric('Estado', 'OMITIDO ⏭️');
            if (this.skipReason) {
                this.context.setMetric('Skip-Reason', this.skipReason);
            }
            const result = await this.context.finish({
                'Files Scanned': 0
            });
            result.status = 'skipped';
            result.icon = this.icon;
            result.subAuditors = [{
                    id: `${this.id}_skipped`,
                    name: skipMessage,
                    status: 'passed',
                    count: 0,
                    detail: 'skipped'
                }];
            return result;
        }
        this.ensureSubAuditorsLogged();
        const result = await this.context.finish({
            'Files Scanned': this.filesScannedCount
        });
        result.icon = this.icon;
        if (this.subAuditorReports.length > 0) {
            result.subAuditors = [...this.subAuditorReports];
        }
        return result;
    }
    ensureSubAuditorsLogged() {
        if (this.subAuditorReports.length > 0)
            return;
        const subAuditors = this.getSubAuditors();
        const totalSteps = Math.max(1, subAuditors.length);
        for (let i = 0; i < subAuditors.length; i++) {
            const sub = subAuditors[i];
            const count = this.countsByRule.get(sub.id) ?? 0;
            this.logSubAudit(i + 1, totalSteps, sub.name, count);
        }
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
    setStepLogger(logger) {
        this.context.setStepLogger?.(logger);
    }
    setProgressLogger(logger) {
        this.context.setProgressLogger?.(logger);
    }
    /**
     * Genera el DTO canónico AuditorManifestDTO para introspección limpia y tipada,
     * permitiendo a herramientas externas y agentes consultar dinámicamente qué hace y cómo opera.
     */
    toManifest() {
        const rulesRecord = {};
        if (this.ruleDescriptions) {
            for (const [k, v] of Object.entries(this.ruleDescriptions)) {
                if (typeof v === 'string') {
                    rulesRecord[k] = v;
                }
            }
        }
        return {
            id: this.id,
            name: this.name,
            family: this.family,
            icon: this.icon,
            description: this.description,
            capabilities: {
                fix: this.capabilities.fix,
                lint: this.capabilities.lint,
                md: this.capabilities.md,
                ast: this.capabilities.ast,
                changedSince: this.capabilities.changedSince,
                heavy: this.capabilities.heavy,
                requiresBuild: this.capabilities.requiresBuild,
                postRun: this.capabilities.postRun
            },
            rules: rulesRecord,
            configKey: this.configKey
        };
    }
    static isExecutingCli = false;
    static async runCli(auditor) {
        if (BaseAuditor.isExecutingCli)
            return;
        BaseAuditor.isExecutingCli = true;
        try {
            const result = await auditor.execute();
            process.exit(result.summary.errors > 0 ? 1 : 0);
        }
        finally {
            BaseAuditor.isExecutingCli = false;
        }
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
    constructor(options) {
        super(options.coverage || options.roots !== undefined
            ? options
            : { ...options, roots: getEffectiveScannableRoots() });
    }
    async resolveEffectiveAst(astContext) {
        if (astContext || !this.requiresAst)
            return astContext;
        const { SharedAstContext } = await import("./astContext.js");
        return new SharedAstContext();
    }
    async scanSingleDiscoveredFile(file, effectiveAst, catalog) {
        const relPath = path.relative(this.projectRoot, file).split(path.sep).join(path.posix.sep);
        let content;
        try {
            content = nodeFs.readFileSync(file, 'utf-8');
        }
        catch {
            // catch-ok: unreadable files are not recorded as scanned, so coverage reports them as uncovered
            this.unrecordScanned(relPath);
            return;
        }
        const sourceFile = effectiveAst && this.requiresAst ? effectiveAst.getSourceFile(file, content) : undefined;
        const prevTotalEvals = catalog.reduce((acc, r) => acc + this.getEvaluations(r), 0);
        await this.scanFile(relPath, content, sourceFile);
        this.recordScanned(relPath);
        const newTotalEvals = catalog.reduce((acc, r) => acc + this.getEvaluations(r), 0);
        if (newTotalEvals === prevTotalEvals) {
            for (const ruleId of catalog) {
                this.markRuleEvaluated(ruleId);
            }
        }
    }
    async runAudit(astContext) {
        const files = this.context.collectFiles(this.roots, this.allowedExtensions);
        const effectiveAst = await this.resolveEffectiveAst(astContext);
        const catalog = this.getRuleCatalog();
        if (files.length === 0) {
            for (const ruleId of catalog) {
                this.markRuleNotApplicable(ruleId, 'No matching files found in scanned roots');
            }
            this.ensureSubAuditorsLogged();
            return;
        }
        for (const file of files) {
            await this.scanSingleDiscoveredFile(file, effectiveAst, catalog);
        }
        this.ensureSubAuditorsLogged();
    }
}
//# sourceMappingURL=auditorBase.js.map