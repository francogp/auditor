/**
 * src/core/auditCoverage.ts
 *
 * AUDIT COVERAGE LEDGER (Node.js 26+ Native)
 * Records, per suite and per run, which files were actually analyzed and how many times every rule
 * was evaluated. Ledgers are consumed by `validate_audit_coverage` to detect blind spots:
 * uncovered files, declaration/observation drift and dormant rules (false-clean results).
 */
import fs from 'node:fs/promises';
import nodeFs from 'node:fs';
import path from 'node:path';
import { COVERAGE_SOURCES } from "./auditContract.js";
export const COVERAGE_LEDGER_DIR = 'scratch/audits/coverage';
export const COVERAGE_RUN_ID_ENV = 'AUDIT_COVERAGE_RUN_ID';
/** 'full' only when audit_full runs every discovered suite (coverage is meaningless on partial runs). */
export const COVERAGE_RUN_MODE_ENV = 'AUDIT_COVERAGE_RUN_MODE';
/** Comma-separated ids of the suites executed before the post-run phase (each must leave a ledger). */
export const COVERAGE_EXPECTED_SUITES_ENV = 'AUDIT_COVERAGE_EXPECTED_SUITES';
/** Returns the run identifier of the orchestrated full run, if any. Ledgers are only written inside such runs. */
export function resolveActiveCoverageRunId() {
    const runId = process.env[COVERAGE_RUN_ID_ENV];
    return runId && runId.trim().length > 0 ? runId : undefined;
}
/** Converts an absolute or relative path into a POSIX path relative to the project root. */
export function toPosixRelative(projectRoot, filePath) {
    if (!filePath)
        return '';
    const rel = path.isAbsolute(filePath) ? path.relative(projectRoot, filePath) : filePath;
    return rel.replace(/\\/g, '/').replace(/^\.\//, '');
}
export function matchesAnyGlob(relPosixPath, globs) {
    return globs.some(glob => {
        if (path.posix.matchesGlob(relPosixPath, glob))
            return true;
        if (glob.startsWith('**') && relPosixPath.startsWith('.')) {
            const withoutLeadingDot = relPosixPath.replace(/^\.+[/\\]?/, '');
            if (path.posix.matchesGlob(withoutLeadingDot, glob))
                return true;
        }
        return false;
    });
}
export const DEFAULT_NON_AUDITABLE_GLOBS = Object.freeze([
    // Lockfiles & VCS metadata
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lockb',
    'skills-lock.json',
    '**/*skills-lock.json',
    '**/.gitkeep',
    '**/.gitignore',
    '**/.gitattributes',
    '.nvmrc',
    '.node-version',
    '.npmrc',
    '.replit',
    // Tooling configs & build caches
    '.prettierrc*',
    '.prettierignore',
    '.markdownlintignore',
    '**/*.tsbuildinfo',
    // Binary & media assets
    '**/*.{png,jpg,jpeg,gif,webp,ico,bmp,tiff,avif}',
    '**/*.{mp3,ogg,wav,flac,mp4,webm,avi,mov}',
    '**/*.{woff,woff2,ttf,eot,otf}',
    '**/*.{db,sqlite,sqlite3,wasm,zip,tar,tar.gz,tgz}',
    // Test fixtures & backup dumps
    '**/fixtures/**',
    '**/canaries/**',
    '**/*.canary',
    '**/backups/**',
    // Environment bootstrap scripts & setup plugins
    'setup-linux.sh',
    'setup-windows.ps1',
    'update-linux.sh',
    'update-windows.ps1',
    'scripts/setup/plugins/**',
    '.env.example',
    '**/*.sample',
    // Legal documentation & licenses
    'LICENSE*'
]);
/** Whether a file is part of the auditable codebase (excluding binaries, lockfiles, and tooling meta). */
export function isAuditableCodebaseFile(relPosixPath, customExemptGlobs = []) {
    if (matchesAnyGlob(relPosixPath, DEFAULT_NON_AUDITABLE_GLOBS))
        return false;
    if (customExemptGlobs.length > 0 && matchesAnyGlob(relPosixPath, customExemptGlobs))
        return false;
    return true;
}
/** Whether a file falls inside the static coverage declaration of a suite. */
export function isDeclaredByCoverage(relPosixPath, declaration) {
    if (!matchesAnyGlob(relPosixPath, declaration.include))
        return false;
    return !matchesAnyGlob(relPosixPath, declaration.exclude ?? []);
}
/** Derives a coverage declaration from scan roots + extensions (used by FileScanAuditor). */
export function deriveCoverageFromRoots(roots, extensions, projectRoot = process.cwd()) {
    const effectiveRoots = roots.length > 0 ? roots : ['src', 'scripts', 'tests'];
    const include = []; // no-domain: Non-domain utility collection or data structure
    for (const root of effectiveRoots) {
        let cleanRoot = path.posix.normalize(root.split('\\').join('/')).replace(/^\.\/?|\/+$/g, '');
        if (path.isAbsolute(cleanRoot)) {
            cleanRoot = path.relative(projectRoot, cleanRoot).split('\\').join('/').replace(/^\.\/?|\/+$/g, '');
        }
        const prefix = cleanRoot === '' || cleanRoot === '.' ? '' : `${cleanRoot}/`;
        for (const ext of extensions) {
            include.push(`${prefix}**/*${ext}`);
        }
    }
    return { include, source: 'runtime' };
}
function resolveDirectoryPatterns(rel, allowedExtensions) {
    if (allowedExtensions && allowedExtensions.size > 0) {
        return Array.from(allowedExtensions, ext => `${rel}/**/*${ext}`);
    }
    return [`${rel}/**`];
}
function resolvePatternsForRequiredFile(rf, projectRoot, allowedExtensions) {
    const rel = toPosixRelative(projectRoot, rf);
    const abs = path.isAbsolute(rf) ? rf : path.resolve(projectRoot, rf);
    try {
        if (nodeFs.existsSync(abs) && nodeFs.statSync(abs).isDirectory()) {
            return resolveDirectoryPatterns(rel, allowedExtensions);
        }
        return [rel];
    }
    catch {
        // catch-ok: fallback to literal path if stat fails
        return [rel];
    }
}
/** Derives a coverage declaration from requiredFiles (used by BaseAuditor when coverage is omitted). */
export function deriveCoverageFromRequiredFiles(requiredFiles, projectRoot = process.cwd(), allowedExtensions) {
    const include = []; // no-domain: Non-domain utility collection or data structure
    for (const rf of requiredFiles) {
        include.push(...resolvePatternsForRequiredFile(rf, projectRoot, allowedExtensions));
    }
    return { include, source: 'runtime' };
}
/** Fails loudly when a suite declares an invalid coverage contract. */
export function validateCoverageDeclaration(suiteId, declaration) {
    if (!declaration || typeof declaration !== 'object') {
        throw new Error(`Auditor [${suiteId}] must declare 'coverage: { include: [...] }' (files it is responsible for). ` +
            `Blind-spot detection requires every suite to declare its coverage.`);
    }
    if (!Array.isArray(declaration.include) || declaration.include.length === 0) {
        throw new Error(`Auditor [${suiteId}] 'coverage.include' must be a non-empty array of POSIX globs.`);
    }
    const allGlobs = [...declaration.include, ...(declaration.exclude ?? [])];
    for (const glob of allGlobs) {
        if (typeof glob !== 'string' || glob.trim().length === 0 || glob.includes('\\') || path.posix.isAbsolute(glob)) {
            throw new Error(`Auditor [${suiteId}] declared an invalid coverage glob '${String(glob)}' (must be a relative POSIX glob).`);
        }
    }
    if (declaration.source !== undefined && !COVERAGE_SOURCES.includes(declaration.source)) {
        throw new Error(`Auditor [${suiteId}] declared unknown coverage source '${String(declaration.source)}'.`);
    }
}
/**
 * Mutable per-instance recorder owned by every BaseAuditor.
 */
export class CoverageRecorder {
    projectRoot;
    scanned = new Set();
    evaluations = new Map();
    notApplicable = new Map();
    dynamicRuleIds = new Set();
    externalScanCount = 0;
    currentDeclaration;
    constructor(projectRoot, declaration) {
        this.projectRoot = projectRoot;
        this.currentDeclaration = declaration;
    }
    get declaration() {
        return this.currentDeclaration;
    }
    /** Replaces the static declaration with a config-resolved one (validated loudly). */
    redeclare(suiteId, declaration) {
        validateCoverageDeclaration(suiteId, declaration);
        this.currentDeclaration = declaration;
    }
    get source() {
        return this.declaration.source ?? 'runtime';
    }
    get scannedCount() {
        return this.scanned.size > 0 ? this.scanned.size : this.externalScanCount;
    }
    recordScanned(filePath) {
        this.scanned.add(toPosixRelative(this.projectRoot, filePath));
    }
    unrecordScanned(filePath) {
        this.scanned.delete(toPosixRelative(this.projectRoot, filePath));
    }
    /** Only valid for `declared-only` suites, whose engine reports a count but not a file list. */
    recordExternalScanCount(count) {
        if (this.source !== 'declared-only') {
            throw new Error(`recordExternalScanCount() is only allowed for 'declared-only' coverage; record real files with recordScanned().`);
        }
        this.externalScanCount = count;
    }
    markRuleEvaluated(ruleId, count = 1) {
        this.evaluations.set(ruleId, (this.evaluations.get(ruleId) ?? 0) + count);
    }
    markRuleNotApplicable(ruleId, reason) {
        if (!reason || reason.trim().length === 0) {
            throw new Error(`markRuleNotApplicable('${ruleId}') requires an explicit justification.`);
        }
        this.notApplicable.set(ruleId, reason);
    }
    declareRuleCatalog(ruleIds) {
        for (const id of ruleIds)
            this.dynamicRuleIds.add(id);
    }
    getEvaluations(ruleId) {
        return this.evaluations.get(ruleId) ?? 0;
    }
    toLedger(params) {
        const catalog = Array.from(new Set([...params.ruleIds, ...this.dynamicRuleIds])).sort();
        return {
            runId: params.runId,
            suiteId: params.suiteId,
            skipped: params.skipped,
            declared: this.declaration,
            source: this.source,
            scanned: Array.from(this.scanned).sort(),
            ruleIds: catalog,
            ruleEvaluations: Object.fromEntries(catalog.map(id => [id, this.getEvaluations(id)])),
            notApplicable: Object.fromEntries(this.notApplicable)
        };
    }
}
export async function writeCoverageLedger(projectRoot, ledger) {
    const dir = path.resolve(projectRoot, COVERAGE_LEDGER_DIR);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${ledger.suiteId}.json`), JSON.stringify(ledger, null, 2), 'utf-8');
}
export async function clearCoverageLedgers(projectRoot) {
    await fs.rm(path.resolve(projectRoot, COVERAGE_LEDGER_DIR), { recursive: true, force: true });
}
/** Reads every ledger written during the given run (stale ledgers from previous runs are ignored). */
export async function readCoverageLedgers(projectRoot, runId) {
    const dir = path.resolve(projectRoot, COVERAGE_LEDGER_DIR);
    let entries;
    try {
        entries = await fs.readdir(dir);
    }
    catch {
        // catch-ok: no ledger directory means no suite wrote coverage during this run
        return [];
    }
    const ledgers = [];
    for (const entry of entries.filter(e => e.endsWith('.json')).sort()) {
        const ledger = JSON.parse(await fs.readFile(path.join(dir, entry), 'utf-8'));
        if (ledger.runId === runId)
            ledgers.push(ledger);
    }
    return ledgers;
}
/** Reads all ledgers from the latest run in scratch/audits/coverage. */
export async function readLatestCoverageLedgers(projectRoot) {
    const dir = path.resolve(projectRoot, COVERAGE_LEDGER_DIR);
    let entries;
    try {
        entries = await fs.readdir(dir);
    }
    catch {
        // catch-ok: no ledger directory
        return { runId: null, ledgers: [] };
    }
    const allLedgers = [];
    for (const entry of entries.filter(e => e.endsWith('.json')).sort()) {
        try {
            const ledger = JSON.parse(await fs.readFile(path.join(dir, entry), 'utf-8'));
            allLedgers.push(ledger);
        }
        catch {
            // catch-ok: corrupt or partial ledger file
        }
    }
    if (allLedgers.length === 0)
        return { runId: null, ledgers: [] };
    const latestRunId = allLedgers[allLedgers.length - 1].runId;
    const filtered = allLedgers.filter(l => l.runId === latestRunId);
    return { runId: latestRunId, ledgers: filtered };
}
//# sourceMappingURL=auditCoverage.js.map