/**
 * scripts/auditors/architecture/validate_ephemeral_storage_isolation.ts
 *
 * EPHEMERAL STORAGE & SCRATCH ISOLATION AUDITOR (Node.js 26+ Native)
 *
 * Enforces repository architecture, file hygiene, and ephemeral storage isolation:
 *   1. Ephemeral Directories in Source Roots (`ephemeral-no-source-temp-dirs`):
 *      Forbids temporary or ephemeral folders (`temp/`, `tmp/`, `temp_*`, `ephemeral/`, `scratch/`)
 *      inside source code directories (`src/`, `scripts/`, `tests/`, `supabase/`, `data/`, `database/`).
 *   2. Prohibit Ignoring Source Code Temp in .gitignore (`ephemeral-no-gitignore-source-temp`):
 *      Forbids adding temporary directories or files inside source trees to `.gitignore`
 *      (e.g. `src/temp`, `supabase/temp_supabase/`, `database/temp`). All temporary persistence
 *      and scratch artifacts MUST reside in `scratch/`.
 *   3. Ephemeral Source Directory References in Code (`ephemeral-no-source-temp-references`):
 *      Forbids source code, scripts, or tests from targeting or referencing ephemeral paths
 *      inside source trees instead of `scratch/`.
 *
 * Escape Hatches:
 *   `// scratch-ok`, `// temp-ok`, `-- scratch-ok`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_ephemeral_storage_isolation.ts
 *   npm run validate:ephemeral-storage-isolation
 */
import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, getEffectiveScannableRoots } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
enableCompileCache();
export const EPHEMERAL_STORAGE_RULES = [
    'ephemeral-no-source-temp-dirs',
    'ephemeral-no-gitignore-source-temp',
    'ephemeral-no-source-temp-references'
];
export const CANONICAL_SOURCE_ROOTS = ['src', 'scripts', 'tests', 'supabase', 'data', 'database'];
export function getEffectiveSourceRoots(projectRoot) {
    const config = getAuditConfig(projectRoot);
    const scannable = getEffectiveScannableRoots(config);
    const additional = [
        ...(config.paths.dataRoots ?? []),
        config.persistence.supabaseDir ?? 'supabase',
        'database'
    ];
    return Array.from(new Set([...scannable, ...additional]));
}
const FORBIDDEN_DIR_NAMES = new Set(['temp', 'tmp', '.temp', '.tmp', 'ephemeral', 'scratch']);
const FORBIDDEN_DIR_PREFIXES = ['temp_', 'tmp_'];
function isForbiddenDirName(name) {
    const lower = name.toLowerCase();
    return FORBIDDEN_DIR_NAMES.has(lower) || FORBIDDEN_DIR_PREFIXES.some(prefix => lower.startsWith(prefix));
}
const DEFAULT_ALLOWED_DATABASE_DIRS = new Set(['backups', 'migrations', 'schemas']);
const DEFAULT_ALLOWED_DATABASE_FILES = new Set(['AGENTS.md', '.gitkeep']);
const FORBIDDEN_CODE_REF_REGEX = /(?:['"`]|(?:path\.(?:resolve|join)\([^)]*))\b(?:src|scripts|tests|supabase|data|database)\/(?:temp|tmp|temp_[a-zA-Z0-9_]+|tmp_[a-zA-Z0-9_]+)\b/;
const GITIGNORE_FORBIDDEN_REGEX = /(?:^|\/)(?:src|scripts|tests|supabase|data|database)\/(?:temp|tmp|\.temp|\.tmp|temp_|tmp_)/;
function isSelfReferentialFile(relPath) {
    return (relPath.endsWith('validate_ephemeral_storage_isolation.ts') ||
        relPath.endsWith('validate_ephemeral_storage_isolation.test.ts'));
}
function scanLinesForEphemeralRefs(lines, relPath, auditor) {
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] || '';
        if (auditor.isLineIgnored(line, ['scratch-ok', 'temp-ok']))
            continue;
        if (FORBIDDEN_CODE_REF_REGEX.test(line)) {
            auditor.addViolation({
                ruleId: 'ephemeral-no-source-temp-references',
                severity: 'error',
                file: relPath,
                line: i + 1,
                message: `Forbidden reference to ephemeral path inside source code tree. All temporary databases, test simulation exports, and scratch artifacts must reside strictly inside 'scratch/'.`,
                context: line.trim()
            });
        }
    }
}
export class EphemeralStorageIsolationAuditor extends BaseAuditor {
    allowedDatabaseDirs;
    allowedDatabaseFiles;
    constructor(optionsOrRoot) {
        const options = typeof optionsOrRoot === 'string'
            ? { projectRoot: optionsOrRoot }
            : (optionsOrRoot ?? {});
        const effectiveRoots = options.roots ?? getEffectiveSourceRoots(options.projectRoot);
        super({
            id: 'validate_ephemeral_storage_isolation',
            name: 'Ephemeral Storage & Scratch Isolation Validator',
            description: 'Aislamiento estricto de archivos temporales en scratch/',
            family: 'architecture',
            ruleIds: EPHEMERAL_STORAGE_RULES,
            packageName: 'Aislamiento',
            icon: '📁',
            ruleDescriptions: {
                'ephemeral-no-source-temp-dirs': 'Carpeta temporal en código',
                'ephemeral-no-gitignore-source-temp': 'Entrada temporal en .gitignore',
                'ephemeral-no-source-temp-references': 'Referencia a carpeta temporal'
            },
            coverage: {
                include: [
                    '.gitignore',
                    ...effectiveRoots.map(r => `${r}/**/*.{ts,vue,js,sql,sh}`)
                ],
                exclude: [
                    'src/suites/architecture/validate_ephemeral_storage_isolation.ts',
                    'tests/validate_ephemeral_storage_isolation.test.ts'
                ]
            },
            roots: [...effectiveRoots],
            allowedExtensions: new Set(['.ts', '.vue', '.js', '.sql', '.sh']),
            projectRoot: options.projectRoot
        });
        const config = getAuditConfig(options.projectRoot);
        const configuredDbDirs = config.persistence?.allowedDatabaseDirs;
        const configuredDbFiles = config.persistence?.allowedDatabaseFiles;
        this.allowedDatabaseDirs = options.allowedDatabaseDirs ?? (configuredDbDirs && configuredDbDirs.length > 0 ? new Set(configuredDbDirs) : DEFAULT_ALLOWED_DATABASE_DIRS);
        this.allowedDatabaseFiles = options.allowedDatabaseFiles ?? (configuredDbFiles && configuredDbFiles.length > 0 ? new Set(configuredDbFiles) : DEFAULT_ALLOWED_DATABASE_FILES);
    }
    runAudit() {
        this.markRuleEvaluated('ephemeral-no-source-temp-dirs');
        this.scanSourceDirectoriesOnDisk();
        this.markRuleEvaluated('ephemeral-no-gitignore-source-temp');
        this.scanGitignoreRules();
        this.scanSourceCodeReferences();
    }
    scanSourceDirectoriesOnDisk() {
        for (const root of this.roots) {
            const rootDir = path.resolve(this.projectRoot, root);
            if (!fs.existsSync(rootDir))
                continue;
            this.walkAndCheckDirectory(rootDir, root);
        }
    }
    checkDatabaseDirectoryEntry(entry) {
        if (entry.isDirectory()) {
            if (!this.allowedDatabaseDirs.has(entry.name)) {
                this.addViolation({
                    ruleId: 'ephemeral-no-source-temp-dirs',
                    severity: 'error',
                    file: `database/${entry.name}`,
                    line: 1,
                    message: `Forbidden directory 'database/${entry.name}' detected. All temporary databases, test exports, and scratch artifacts must reside strictly inside 'scratch/database/'.`,
                    context: `database/${entry.name}`
                });
            }
        }
        else if (entry.isFile() && !entry.name.startsWith('.') && !this.allowedDatabaseFiles.has(entry.name)) {
            this.addViolation({
                ruleId: 'ephemeral-no-source-temp-dirs',
                severity: 'error',
                file: `database/${entry.name}`,
                line: 1,
                message: `Forbidden file 'database/${entry.name}' detected under database root. Ephemeral files must reside in 'scratch/database/'.`,
                context: `database/${entry.name}`
            });
        }
    }
    checkSubDirectory(entry, currentDir, rootName) {
        if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === '.git') {
            return;
        }
        const subPath = path.join(currentDir, entry.name);
        const relSubPath = path.relative(this.projectRoot, subPath).split(path.sep).join(path.posix.sep);
        if (isForbiddenDirName(entry.name)) {
            this.addViolation({
                ruleId: 'ephemeral-no-source-temp-dirs',
                severity: 'error',
                file: relSubPath,
                line: 1,
                message: `Forbidden ephemeral directory '${relSubPath}' detected in source tree. All temporary artifacts, test dumps, and caches must reside strictly in 'scratch/'.`,
                context: relSubPath
            });
        }
        this.walkAndCheckDirectory(subPath, rootName);
    }
    walkAndCheckDirectory(currentDir, rootName) {
        let entries;
        try {
            entries = fs.readdirSync(currentDir, { withFileTypes: true });
        }
        catch {
            // catch-ok: Directory may be inaccessible or deleted during traversal
            return;
        }
        const relToRoot = path.relative(this.projectRoot, currentDir).split(path.sep).join(path.posix.sep);
        if (rootName === 'database' && relToRoot === 'database') {
            for (const entry of entries) {
                this.checkDatabaseDirectoryEntry(entry);
            }
        }
        for (const entry of entries) {
            this.checkSubDirectory(entry, currentDir, rootName);
        }
    }
    scanGitignoreRules() {
        const gitignorePath = path.resolve(this.projectRoot, '.gitignore');
        if (!fs.existsSync(gitignorePath))
            return;
        try {
            this.recordScanned('.gitignore');
            const content = fs.readFileSync(gitignorePath, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i]?.trim() || '';
                if (!line || line.startsWith('#'))
                    continue;
                if (GITIGNORE_FORBIDDEN_REGEX.test(line) &&
                    !this.isLineIgnored(line, ['scratch-ok', 'temp-ok'])) {
                    this.addViolation({
                        ruleId: 'ephemeral-no-gitignore-source-temp',
                        severity: 'error',
                        file: '.gitignore',
                        line: i + 1,
                        message: `Ignoring temporary folders inside source directories in .gitignore is forbidden ('${line}'). Ephemeral assets must reside in 'scratch/', not inside source code trees.`,
                        context: line
                    });
                }
            }
        }
        catch {
            // catch-ok: Ignore read errors
        }
    }
    scanSourceCodeReferences() {
        const existingRoots = this.roots.filter(r => fs.existsSync(path.resolve(this.projectRoot, r)));
        const scannableFiles = this.context.collectFiles(existingRoots, new Set(['.ts', '.vue', '.js', '.sql', '.sh']));
        if (scannableFiles.length === 0) {
            this.markRuleNotApplicable('ephemeral-no-source-temp-references', 'No se encontraron archivos de código fuente');
            return;
        }
        for (const filePath of scannableFiles) {
            const relPath = path.relative(this.projectRoot, filePath).split(path.sep).join(path.posix.sep);
            if (isSelfReferentialFile(relPath))
                continue;
            this.recordScanned(relPath);
            this.markRuleEvaluated('ephemeral-no-source-temp-references');
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                if (content.includes('/temp') || content.includes('/tmp')) {
                    scanLinesForEphemeralRefs(content.split('\n'), relPath, this);
                }
            }
            catch {
                // catch-ok: Ignore read errors
            }
        }
    }
}
// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
if (process.argv[1] &&
    import.meta.filename &&
    path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
    await BaseAuditor.runCli(new EphemeralStorageIsolationAuditor());
}
//# sourceMappingURL=validate_ephemeral_storage_isolation.js.map