/**
 * src/suites/architecture/validate_script_extensions.ts
 *
 * SCRIPT & MODULE EXTENSIONS VALIDATOR (Node.js 26+ Native)
 *
 * Enforces canonical TypeScript (.ts) extensions across all project scripts, tools, and modules.
 * Detects and prohibits legacy .mjs and .cjs files, as well as unmigrated .js in scripts directories.
 * In --fix mode, automatically migrates files to .ts, renames them on disk, rewrites relative
 * import statements across the codebase, and updates package.json scripts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, getEffectiveScannableRoots, isPathIgnored } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { getPackageJson } from "../../core/packageJson.js";
import { toPosixRelative, normalizePosixPath } from "../../core/safePath.js";
enableCompileCache();
export const SCRIPT_EXTENSIONS_RULES = [
    'banned-mjs-extension',
    'banned-cjs-extension',
    'banned-raw-js-script'
];
const CANONICAL_ROOT_CONFIG_EXEMPTIONS = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    'postcss.config.js',
    'postcss.config.mjs',
    'postcss.config.cjs',
    'tailwind.config.js',
    'tailwind.config.mjs',
    'tailwind.config.cjs',
    'stylelint.config.js',
    'stylelint.config.mjs',
    'stylelint.config.cjs',
    'vite.config.js',
    'vite.config.mjs',
    'commitlint.config.js',
    'prettier.config.js',
    'prettier.config.mjs',
    'prettier.config.cjs'
];
const CANONICAL_ROOT_CONFIG_SET = new Set(CANONICAL_ROOT_CONFIG_EXEMPTIONS); // runtime-set: Fast O(1) membership lookup set
export function isCanonicalConfigExempt(relPath) {
    const norm = normalizePosixPath(relPath);
    if (norm.includes('/') && !norm.startsWith('.config/')) {
        return false;
    }
    return CANONICAL_ROOT_CONFIG_SET.has(path.basename(norm));
}
export function isExemptScriptFile(relPath, exemptList) {
    if (isCanonicalConfigExempt(relPath))
        return true;
    if (!exemptList || exemptList.length === 0)
        return false;
    const targetRel = normalizePosixPath(relPath).toLowerCase();
    const targetBase = path.basename(targetRel);
    for (const ex of exemptList) {
        const norm = normalizePosixPath(ex).toLowerCase();
        if (targetRel === norm || targetRel.endsWith(`/${norm}`) || targetBase === norm) {
            return true;
        }
    }
    return false;
}
export function resolveScriptAndCliDirs(config) {
    const scriptsRoots = (config.paths?.scriptsRoots ?? ['scripts']).map(r => normalizePosixPath(r));
    const cliRoots = (config.paths?.cliRoots ?? []).map(r => normalizePosixPath(r));
    return Array.from(new Set([...scriptsRoots, ...cliRoots])); // no-domain: Non-domain utility collection or data structure
}
export class ValidateScriptExtensionsAuditor extends BaseAuditor {
    constructor(options = {}) {
        const effectiveProjectRoot = options.projectRoot ?? process.cwd();
        const config = getAuditConfig(effectiveProjectRoot);
        const scriptAndCliDirs = resolveScriptAndCliDirs(config);
        const coverageInclude = [
            '**/*.{mjs,cjs}',
            ...scriptAndCliDirs.map(d => `${d}/**/*.js`)
        ];
        super({
            capabilities: { lint: true, fix: true, fixPriority: true },
            id: 'validate_script_extensions',
            name: 'Script & Module Extensions Validator',
            description: 'Valida extensiones TypeScript (.ts) y prohíbe .mjs/.cjs',
            family: 'architecture',
            ruleIds: SCRIPT_EXTENSIONS_RULES,
            packageName: 'Extensiones',
            icon: '📜',
            configKey: 'scriptExtensions',
            defaultConfig: {
                enabled: true,
                enforceTypeScript: true,
                allowMjs: false,
                allowCjs: false,
                allowJsScripts: false,
                exemptFiles: []
            },
            ruleDescriptions: {
                'banned-mjs-extension': 'Archivo .mjs prohibido en TS',
                'banned-cjs-extension': 'Archivo .cjs prohibido en ESM',
                'banned-raw-js-script': 'Script .js sin tipar en scripts'
            },
            coverage: {
                include: coverageInclude
            },
            ...options
        });
    }
    async runAudit() {
        for (const r of SCRIPT_EXTENSIONS_RULES) {
            this.markRuleEvaluated(r);
        }
        const config = getAuditConfig(this.projectRoot);
        if (config.scriptExtensions?.enabled === false) {
            this.markSkipped('Desactivado en config (scriptExtensions.enabled = false)');
            return;
        }
        const allowMjs = config.scriptExtensions?.allowMjs ?? false;
        const allowCjs = config.scriptExtensions?.allowCjs ?? false;
        const allowJsScripts = config.scriptExtensions?.allowJsScripts ?? false;
        const exemptFiles = config.scriptExtensions?.exemptFiles ?? [];
        const scriptAndCliDirs = resolveScriptAndCliDirs(config);
        const candidateFiles = this.collectCandidateFiles(scriptAndCliDirs);
        const violations = [];
        for (const fullPath of candidateFiles) {
            const relPath = toPosixRelative(this.projectRoot, fullPath);
            this.recordScanned(relPath);
            if (isExemptScriptFile(relPath, exemptFiles)) {
                continue;
            }
            const ext = path.extname(fullPath).toLowerCase();
            const targetTsPath = fullPath.slice(0, -ext.length) + '.ts';
            if (ext === '.mjs' && !allowMjs) {
                violations.push({
                    file: relPath,
                    fullPath,
                    ruleId: 'banned-mjs-extension',
                    message: `Archivo con extensión ".mjs" detectado: "${relPath}". En proyectos Node.js 26+ nativos, todo módulo o script debe ser TypeScript (.ts).`,
                    targetTsPath
                });
            }
            else if (ext === '.cjs' && !allowCjs) {
                violations.push({
                    file: relPath,
                    fullPath,
                    ruleId: 'banned-cjs-extension',
                    message: `Archivo con extensión ".cjs" detectado: "${relPath}". En proyectos Node.js 26+ ("type": "module"), los módulos CommonJS (.cjs) están prohibidos.`,
                    targetTsPath
                });
            }
            else if (ext === '.js' && !allowJsScripts) {
                const isScriptDir = scriptAndCliDirs.some(dir => relPath === dir || relPath.startsWith(dir + '/'));
                if (isScriptDir) {
                    violations.push({
                        file: relPath,
                        fullPath,
                        ruleId: 'banned-raw-js-script',
                        message: `Script JavaScript sin tipar "${relPath}" detectado en directorio de scripts. Debe migrarse a TypeScript (.ts).`,
                        targetTsPath
                    });
                }
            }
        }
        if (violations.length === 0) {
            return;
        }
        if (!this.isFixActive()) {
            for (const v of violations) {
                this.addViolation({
                    ruleId: v.ruleId,
                    severity: 'error',
                    file: v.file,
                    line: 1,
                    col: 1,
                    message: v.message,
                    context: path.basename(v.file),
                    fixable: true
                });
            }
            return;
        }
        // Fix Mode: execute safe renaming and references rewrites
        await this.executeFixes(violations);
    }
    collectCandidateFiles(scriptAndCliDirs) {
        const scannableRoots = getEffectiveScannableRoots(getAuditConfig(this.projectRoot));
        const collected = new Set();
        // 1. Collect .mjs and .cjs across all scannable roots
        const moduleExtensions = new Set(['.mjs', '.cjs']);
        const moduleFiles = this.context.collectFiles(scannableRoots, moduleExtensions);
        for (const f of moduleFiles) {
            collected.add(f);
        }
        // 2. Collect raw .js strictly within scripts and cli roots
        const existingScriptDirs = scriptAndCliDirs
            .map(d => path.resolve(this.projectRoot, d))
            .filter(d => fs.existsSync(d));
        if (existingScriptDirs.length > 0) {
            const jsFiles = this.context.collectFiles(scriptAndCliDirs, new Set(['.js']));
            for (const f of jsFiles) {
                collected.add(f);
            }
        }
        // 3. Also check top-level root directory entries for .mjs and .cjs
        try {
            if (fs.existsSync(this.projectRoot)) {
                const rootEntries = fs.readdirSync(this.projectRoot, { withFileTypes: true });
                for (const entry of rootEntries) {
                    if (!entry.isFile())
                        continue;
                    const ext = path.extname(entry.name).toLowerCase();
                    if (moduleExtensions.has(ext)) {
                        const absPath = path.resolve(this.projectRoot, entry.name);
                        const relPath = toPosixRelative(this.projectRoot, absPath);
                        if (!isPathIgnored(relPath)) {
                            collected.add(absPath);
                        }
                    }
                }
            }
        }
        catch {
            // catch-ok: Ignore root readdir failures
        }
        return Array.from(collected);
    }
    async executeFixes(violations) {
        const plans = [];
        // Phase 1: Safety validation (avoid overwriting existing .ts files)
        for (const v of violations) {
            if (fs.existsSync(v.targetTsPath)) {
                const targetRel = toPosixRelative(this.projectRoot, v.targetTsPath);
                this.addViolation({
                    ruleId: v.ruleId,
                    severity: 'error',
                    file: v.file,
                    line: 1,
                    col: 1,
                    message: `No se puede convertir automáticamente "${v.file}": el archivo de destino "${targetRel}" ya existe en disco.`,
                    context: path.basename(v.file),
                    fixable: false
                });
                continue;
            }
            plans.push({
                oldFullPath: v.fullPath,
                newFullPath: v.targetTsPath,
                oldRelPath: v.file,
                newRelPath: toPosixRelative(this.projectRoot, v.targetTsPath),
                oldBaseName: path.basename(v.fullPath),
                newBaseName: path.basename(v.targetTsPath)
            });
        }
        if (plans.length === 0)
            return;
        // Phase 2: Perform atomic file renames on disk
        for (const plan of plans) {
            if (fs.existsSync(plan.oldFullPath)) {
                fs.renameSync(plan.oldFullPath, plan.newFullPath);
            }
        }
        // Phase 3: Rewrite internal imports referencing renamed files
        this.rewriteImportReferences(plans);
        // Phase 4: Rewrite package.json scripts referencing renamed files
        this.rewritePackageJsonScripts(plans);
    }
    rewriteImportReferences(plans) {
        const scannableRoots = getEffectiveScannableRoots(getAuditConfig(this.projectRoot));
        const allCodeFiles = this.context.collectFiles(scannableRoots, new Set(['.ts', '.vue', '.js', '.mjs', '.cjs']));
        for (const filePath of allCodeFiles) {
            try {
                if (!fs.existsSync(filePath))
                    continue;
                let content = fs.readFileSync(filePath, 'utf-8');
                let modified = false;
                for (const plan of plans) {
                    // Replace relative imports e.g. from './foo.mjs' or from '../dir/foo.mjs'
                    // Regex handles single and double quotes, both import and export from statements
                    const escapedOld = plan.oldBaseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const importPattern = new RegExp(`(['"\`][^'"\`]*?\\/)${escapedOld}(['"\`])`, 'g');
                    if (importPattern.test(content)) {
                        content = content.replace(importPattern, `$1${plan.newBaseName}$2`);
                        modified = true;
                    }
                }
                if (modified) {
                    fs.writeFileSync(filePath, content, 'utf-8');
                }
            }
            catch {
                // catch-ok: Ignore unreadable or locked files during import rewrite
            }
        }
    }
    rewritePackageJsonScripts(plans) {
        const pkg = getPackageJson(this.projectRoot);
        if (!pkg?.scripts || typeof pkg.scripts !== 'object')
            return;
        let modified = false;
        for (const [scriptName, scriptCmd] of Object.entries(pkg.scripts)) {
            let updatedCmd = scriptCmd;
            for (const plan of plans) {
                if (updatedCmd.includes(plan.oldBaseName)) {
                    const escapedOld = plan.oldBaseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const pattern = new RegExp(`\\b${escapedOld}\\b`, 'g');
                    updatedCmd = updatedCmd.replace(pattern, plan.newBaseName);
                    modified = true;
                }
            }
            if (updatedCmd !== scriptCmd) {
                pkg.scripts[scriptName] = updatedCmd;
            }
        }
        if (modified) {
            const pkgPath = path.resolve(this.projectRoot, 'package.json');
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
        }
    }
}
// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateScriptExtensionsAuditor());
//# sourceMappingURL=validate_script_extensions.js.map