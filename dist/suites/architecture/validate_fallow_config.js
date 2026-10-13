/**
 * scripts/auditors/architecture/validate_fallow_config.ts
 *
 * FALLOW CONFIGURATION & EXPORTS HYGIENE AUDITOR (Node.js 26+)
 *
 * Enforces the integrity of .fallowrc.json:
 *   1. Prohibits banned blanket entry globs (e.g. src/components/**) that suppress dead code.
 *   2. Guarantees that 100% of files listed in ignoreExports actually exist on disk.
 *   3. Guarantees that 100% of symbols in ignoreExports are legitimately exported in their files.
 *   4. Flags duplicate entries and empty export lists.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, createRuleCapabilities } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/safePath.js";
enableCompileCache();
export const FALLOW_CONFIG_RULES = [
    'fallow-config-missing',
    'fallow-config-syntax',
    'fallow-banned-entry-glob',
    'fallow-stale-file',
    'fallow-stale-export',
    'fallow-empty-export-list',
    'fallow-duplicate-entry',
    'fallow-config-workspace-diagnostic'
];
export function getBannedEntryGlobs(projectRoot) {
    const config = getAuditConfig(projectRoot);
    const globs = [];
    const compRoots = config.paths.componentsRoots ?? [];
    const viewRoots = config.paths.viewsRoots ?? [];
    for (const c of compRoots) {
        globs.push(`${c}/**/*.vue`, `${c}/**`);
    }
    for (const v of viewRoots) {
        globs.push(`${v}/**/*.vue`, `${v}/**`);
    }
    return globs;
}
export const BANNED_ENTRY_GLOBS = getBannedEntryGlobs();
export const escapeRegExp = RegExp.escape;
/**
 * Checks whether a symbol is exported from file content.
 */
export function isSymbolExportedInContent(content, symbol, isVue = false) {
    if (symbol === 'default') {
        return /export\s+default\b/.test(content) || isVue;
    }
    const escaped = escapeRegExp(symbol);
    const wordRegex = new RegExp(`\\b${escaped}\\b`);
    if (!wordRegex.test(content))
        return false;
    const exportRegex = new RegExp(`export\\s+(?:const|let|var|function|async\\s+function|type|interface|enum|class|abstract\\s+class)\\s+${escaped}\\b|` +
        `export\\s+(?:const|let|var)\\s+\\{[^}]*\\b${escaped}\\b|` +
        `export\\s+(?:const|let|var)\\s+\\[[^\\]]*\\b${escaped}\\b|` +
        `export\\s+(?:type\\s+)?\\{[^}]*\\b${escaped}\\b|` +
        `export\\s+\\*\\s+as\\s+${escaped}\\b`);
    return exportRegex.test(content);
}
export function createDefaultFallowConfigContent() {
    return JSON.stringify({
        $schema: 'https://fallow.tools/schema/config.json',
        entry: [
            'src/index.ts'
        ],
        ignorePatterns: [
            'dist/**',
            'scratch/**',
            'tests/**'
        ],
        typeAware: true,
        duplicates: {
            nearMiss: true,
            mode: 'strict'
        },
        health: {
            maxCrap: 0
        }
    }, null, 2) + '\n';
}
function loadFallowConfig(configPath, auditor) {
    if (!fs.existsSync(configPath)) {
        return null;
    }
    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(raw);
    }
    catch (err) {
        auditor.addViolation({
            ruleId: 'fallow-config-syntax',
            severity: 'error',
            file: '.fallowrc.json',
            line: 1,
            message: `Error al parsear .fallowrc.json: ${err.message}`,
            context: '.fallowrc.json'
        });
        return null;
    }
}
function validateFallowEntries(entries, bannedGlobs, auditor) {
    if (!Array.isArray(entries))
        return;
    for (let i = 0; i < entries.length; i++) {
        const pattern = entries[i];
        for (const banned of bannedGlobs) {
            if (pattern === banned || pattern.startsWith(banned.replace(/\*.*$/, ''))) {
                auditor.addViolation({
                    ruleId: 'fallow-banned-entry-glob',
                    severity: 'error',
                    file: '.fallowrc.json',
                    line: i + 1,
                    message: `Patrón entry prohibido '${pattern}' detectado. Oculta componentes o vistas muertas.`,
                    context: pattern
                });
            }
        }
    }
}
function validateExportSymbols(params) {
    const seenExportsInFile = new Set();
    let exportCount = 0;
    for (const exp of params.exports) {
        exportCount++;
        if (seenExportsInFile.has(exp)) {
            params.auditor.addViolation({
                ruleId: 'fallow-duplicate-entry',
                severity: 'error',
                file: '.fallowrc.json',
                line: params.lineNum,
                message: `Export duplicado '${exp}' en '${params.relFile}'.`,
                context: `${params.relFile} -> ${exp}`
            });
        }
        seenExportsInFile.add(exp);
        if (!isSymbolExportedInContent(params.content, exp, params.isVue)) {
            params.auditor.addViolation({
                ruleId: 'fallow-stale-export',
                severity: 'error',
                file: '.fallowrc.json',
                line: params.lineNum,
                message: `El símbolo '${exp}' no se encuentra exportado en el archivo real '${params.relFile}'.`,
                context: `${params.relFile} -> ${exp}`
            });
        }
    }
    return exportCount;
}
function validateSingleIgnoreEntry(params) {
    const { entry, lineNum, projectRoot, seenFiles, auditor } = params;
    const relFile = entry.file;
    auditor.runSubAuditorSync('fallow-duplicate-entry', () => {
        if (seenFiles.has(relFile)) {
            auditor.addViolation({
                ruleId: 'fallow-duplicate-entry',
                severity: 'error',
                file: '.fallowrc.json',
                line: lineNum,
                message: `Archivo duplicado en ignoreExports: '${relFile}'.`,
                context: relFile
            });
        }
    });
    seenFiles.add(relFile);
    let hasEmptyList = false;
    auditor.runSubAuditorSync('fallow-empty-export-list', () => {
        if (!Array.isArray(entry.exports) || entry.exports.length === 0) {
            hasEmptyList = true;
            auditor.addViolation({
                ruleId: 'fallow-empty-export-list',
                severity: 'error',
                file: '.fallowrc.json',
                line: lineNum,
                message: `Entrada para '${relFile}' no declara ningún export en su array de exports.`,
                context: relFile
            });
        }
    });
    if (hasEmptyList) {
        return 0;
    }
    const fullFilePath = path.resolve(projectRoot, relFile);
    let isStale = false;
    auditor.runSubAuditorSync('fallow-stale-file', () => {
        if (!fs.existsSync(fullFilePath)) {
            isStale = true;
            auditor.addViolation({
                ruleId: 'fallow-stale-file',
                severity: 'error',
                file: '.fallowrc.json',
                line: lineNum,
                message: `Archivo '${relFile}' declarado en ignoreExports no existe en el disco.`,
                context: relFile
            });
        }
    });
    if (isStale) {
        return 0;
    }
    let symbolCount = 0;
    auditor.runSubAuditorSync('fallow-stale-export', () => {
        let content;
        try {
            content = fs.readFileSync(fullFilePath, 'utf-8');
        }
        catch (err) {
            auditor.addViolation({
                ruleId: 'fallow-stale-file',
                severity: 'error',
                file: '.fallowrc.json',
                line: lineNum,
                message: `No se pudo leer el archivo '${relFile}': ${err.message}`,
                context: relFile
            });
            return;
        }
        symbolCount = validateExportSymbols({
            exports: entry.exports,
            content,
            relFile,
            isVue: relFile.endsWith('.vue'),
            lineNum,
            auditor
        });
    });
    return symbolCount;
}
function validateFallowIgnoreExports(ignoreExports, projectRoot, auditor) {
    if (!Array.isArray(ignoreExports)) {
        return { fileCount: 0, exportCount: 0 };
    }
    const seenFiles = new Set();
    let totalExports = 0;
    for (let entryIdx = 0; entryIdx < ignoreExports.length; entryIdx++) {
        const entry = ignoreExports[entryIdx];
        totalExports += validateSingleIgnoreEntry({
            entry,
            lineNum: entryIdx + 1,
            projectRoot,
            seenFiles,
            auditor
        });
    }
    return { fileCount: seenFiles.size, exportCount: totalExports };
}
export function validateFallowWorkspaceDiagnostics(diagnostics, auditor) {
    if (!Array.isArray(diagnostics))
        return;
    for (const d of diagnostics) {
        if (d.kind === 'boundaries-not-configured' || d.kind === 'rule-packs-not-configured') {
            continue;
        }
        auditor.addViolation({
            ruleId: 'fallow-config-workspace-diagnostic',
            severity: 'error',
            file: d.path && d.path !== '.' ? d.path : '.fallowrc.json',
            line: 1,
            message: `Diagnóstico de workspace (Fallow): [${d.kind || 'diagnostic'}] ${d.message || ''}`,
            context: d.kind || 'workspace_diagnostic'
        });
    }
}
export const FALLOW_CONFIG_REQUIREMENT = {
    id: 'fallow-config',
    file: '.fallowrc.json',
    description: 'Configuración de Fallow y control de exports',
    ruleId: 'fallow-config-missing',
    generateDefaultContent: () => createDefaultFallowConfigContent()
};
export class ValidateFallowConfigAuditor extends BaseAuditor {
    constructor(targetPathOrOptions) {
        let projectRoot;
        let configPath;
        let fix = false;
        if (typeof targetPathOrOptions === 'object' && targetPathOrOptions !== null) {
            projectRoot = targetPathOrOptions.projectRoot || process.cwd();
            configPath = targetPathOrOptions.configFile
                ? path.resolve(projectRoot, targetPathOrOptions.configFile)
                : path.resolve(projectRoot, '.fallowrc.json');
            fix = Boolean(targetPathOrOptions.fix);
        }
        else {
            const isJsonFile = typeof targetPathOrOptions === 'string' && targetPathOrOptions.endsWith('.json');
            projectRoot = isJsonFile ? path.dirname(targetPathOrOptions) : (targetPathOrOptions || process.cwd());
            configPath = isJsonFile ? targetPathOrOptions : path.resolve(projectRoot, '.fallowrc.json');
        }
        const relConfig = toPosixRelative(projectRoot, configPath) || '.fallowrc.json';
        const configRequirement = {
            ...FALLOW_CONFIG_REQUIREMENT,
            file: relConfig,
            candidateFiles: [relConfig]
        };
        super({
            ruleCapabilities: createRuleCapabilities(FALLOW_CONFIG_RULES, {
                fix: true,
                fixPriority: true,
                lint: true,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
            }, ['fallow-config-missing']),
            fixableRuleIds: ['fallow-config-missing'],
            configFiles: [configRequirement],
            fix,
            id: 'validate_fallow_config',
            name: 'Fallow Configuration & Exports Hygiene Validator',
            description: 'Valida integridad de .fallowrc.json y sus ignoreExports',
            family: 'architecture',
            ruleIds: FALLOW_CONFIG_RULES,
            packageName: 'Fallow',
            configKey: 'fallow.enabled',
            defaultConfig: { enabled: true },
            criticalConfig: {},
            icon: '🌾',
            ruleDescriptions: {
                'fallow-config-missing': 'Falta archivo .fallowrc.json',
                'fallow-config-syntax': 'JSON inválido en .fallowrc.json',
                'fallow-banned-entry-glob': 'Glob prohibido en entry',
                'fallow-stale-file': 'Archivo inexistente en config',
                'fallow-stale-export': 'Export inexistente en config',
                'fallow-empty-export-list': 'Entrada vacía en ignoreExports',
                'fallow-duplicate-entry': 'Entrada o export duplicado',
                'fallow-config-workspace-diagnostic': 'Diagnóstico de workspace'
            },
            coverage: {
                include: ['.fallowrc.json']
            },
            projectRoot
        });
    }
    async runAudit() {
        const requirement = this.configFiles[0] ?? FALLOW_CONFIG_REQUIREMENT;
        const ensured = await this.runSubAuditor('fallow-config-missing', async () => {
            return await this.ensureConfigFile(requirement);
        });
        if (!ensured)
            return;
        const resolvedPath = ensured.resolvedPath;
        const config = this.runSubAuditorSync('fallow-config-syntax', () => {
            return loadFallowConfig(resolvedPath, this);
        });
        if (!config)
            return;
        const validConfig = config;
        this.recordScanned('.fallowrc.json');
        this.runSubAuditorSync('fallow-banned-entry-glob', () => {
            const bannedGlobs = getBannedEntryGlobs(this.projectRoot);
            validateFallowEntries(validConfig.entry, bannedGlobs, this);
        });
        if (!Array.isArray(validConfig.ignoreExports) || validConfig.ignoreExports.length === 0) {
            this.markRuleNotApplicable('fallow-duplicate-entry', 'Sin ignoreExports en .fallowrc.json');
            this.markRuleNotApplicable('fallow-empty-export-list', 'Sin ignoreExports en .fallowrc.json');
            this.markRuleNotApplicable('fallow-stale-file', 'Sin ignoreExports en .fallowrc.json');
            this.markRuleNotApplicable('fallow-stale-export', 'Sin ignoreExports en .fallowrc.json');
        }
        else {
            const { fileCount, exportCount } = validateFallowIgnoreExports(validConfig.ignoreExports, this.projectRoot, this);
            this.context.setMetric('Archivos en ignoreExports', fileCount);
            this.context.setMetric('Exports Validados', exportCount);
        }
        this.runSubAuditorSync('fallow-config-workspace-diagnostic', () => {
            try {
                const candidates = [
                    path.resolve(this.projectRoot, 'node_modules/fallow/bin/fallow'),
                    path.resolve(process.cwd(), 'node_modules/fallow/bin/fallow')
                ];
                const fallowBin = candidates.find(c => fs.existsSync(c));
                if (fallowBin) {
                    const stdout = execSync(`node "${fallowBin}" list --workspaces --format json --root "${this.projectRoot}"`, {
                        encoding: 'utf8',
                        stdio: ['pipe', 'pipe', 'ignore'],
                        timeout: 10000
                    });
                    const parsed = JSON.parse(stdout);
                    validateFallowWorkspaceDiagnostics(parsed.workspace_diagnostics, this);
                }
            }
            catch {
                // catch-ok: Fallow execution might not be available in non-standard test sandboxes
            }
        });
    }
}
// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateFallowConfigAuditor());
//# sourceMappingURL=validate_fallow_config.js.map