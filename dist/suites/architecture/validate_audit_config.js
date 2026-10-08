/**
 * packages/auditor/src/suites/architecture/validate_audit_config.ts
 *
 * AUDIT CONFIGURATION INTEGRITY VALIDATOR (Node.js 26+)
 *
 * Validates that 100% of files, paths, directories, modules, and extensions
 * declared in audit.config.ts physically exist on disk.
 * Emits severity: 'error' if any referenced path is missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from "../../core/auditorBase.js";
import { loadAuditConfig, buildRatchetConfig, AUDITOR_DIR, AUDIT_CONFIG_FILE, LEGACY_ROOT_CONFIG_FILES } from "../../core/auditConfig.js";
import { GitIgnoreMatcher } from "../../core/gitignoreMatcher.js";
import { discoverAuditors, collectAllGitIgnoreRequirements, collectAllPackageScriptRequirements } from "../../cli/auditScanner.js";
import { resolveGitCommit, describeBaselineDefect } from "../../cli/auditRatchet.js";
import { migrateLegacyAuditConfig } from "../../cli/migrateAuditConfig.js";
import ts from 'typescript';
enableCompileCache();
export function formatSectionObjectLiteral(value) {
    const jsonStr = JSON.stringify(value, null, 2);
    return jsonStr
        .split('\n')
        .map((line, idx) => {
        if (idx === 0)
            return line;
        const unquoted = line.replace(/^(\s*)"([a-z_$][\w$]*)":/i, '$1$2:');
        return `  ${unquoted}`;
    })
        .join('\n');
}
function appendMissingSectionsToJsonFile(configFilePath, sectionsToInsert // open-record: Dictionary of configuration sections
) {
    try {
        const code = fs.readFileSync(configFilePath, 'utf8');
        const json = JSON.parse(code);
        if (!json || typeof json !== 'object')
            return;
        for (const [key, value] of Object.entries(sectionsToInsert)) {
            if (Reflect.get(json, key) === undefined) {
                Reflect.set(json, key, value);
            }
        }
        fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
    }
    catch {
        // catch-ok: ignore unparseable json config files
    }
}
function findConfigObjectLiteral(source) {
    let configObj = null;
    const visit = (node) => {
        if (configObj)
            return;
        if (ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'defineAuditConfig' &&
            node.arguments.length > 0 &&
            ts.isObjectLiteralExpression(node.arguments[0])) {
            configObj = node.arguments[0];
            return;
        }
        if (ts.isExportAssignment(node) && ts.isObjectLiteralExpression(node.expression)) {
            configObj = node.expression;
            return;
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return configObj;
}
function appendMissingSectionsFallback(configFilePath, code, sectionsToInsert // open-record: Dictionary of configuration sections
) {
    const lastBrace = code.lastIndexOf('}');
    if (lastBrace === -1)
        return;
    let snippet = '';
    for (const [key, val] of Object.entries(sectionsToInsert)) {
        snippet += `,\n  ${key}: ${formatSectionObjectLiteral(val)}`;
    }
    snippet += '\n';
    const updated = code.slice(0, lastBrace) + snippet + code.slice(lastBrace);
    fs.writeFileSync(configFilePath, updated, 'utf8');
}
function appendMissingSectionsToTsFile(configFilePath, sectionsToInsert // open-record: Dictionary of configuration sections
) {
    const code = fs.readFileSync(configFilePath, 'utf8');
    const source = ts.createSourceFile(configFilePath, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const configObj = findConfigObjectLiteral(source);
    if (!configObj) {
        appendMissingSectionsFallback(configFilePath, code, sectionsToInsert);
        return;
    }
    const properties = configObj.properties;
    let hasTrailingComma = false;
    if (properties.length > 0) {
        const lastProp = properties[properties.length - 1];
        const endOfLastProp = lastProp.getEnd();
        const closeBracePos = code.lastIndexOf('}', configObj.getEnd() - 1);
        const between = code.slice(endOfLastProp, closeBracePos);
        hasTrailingComma = between.includes(',');
    }
    const closeBracePos = code.lastIndexOf('}', configObj.getEnd() - 1);
    if (closeBracePos === -1)
        return;
    let snippet = '';
    let needsLeadingComma = !hasTrailingComma && properties.length > 0;
    for (const [key, val] of Object.entries(sectionsToInsert)) {
        const prefix = needsLeadingComma ? ',' : '';
        snippet += `${prefix}\n  ${key}: ${formatSectionObjectLiteral(val)}`;
        needsLeadingComma = true;
    }
    snippet += '\n';
    const updated = code.slice(0, closeBracePos) + snippet + code.slice(closeBracePos);
    fs.writeFileSync(configFilePath, updated, 'utf8');
}
export function appendMissingSectionsToConfigFile(configFilePath, sectionsToInsert // open-record: Dictionary of configuration sections
) {
    if (configFilePath.endsWith('.json')) {
        appendMissingSectionsToJsonFile(configFilePath, sectionsToInsert);
        return;
    }
    appendMissingSectionsToTsFile(configFilePath, sectionsToInsert);
}
function appendTaskDefaultConfig(sections, task) {
    if (!task.configKey || task.configKey === 'paths' || task.configKey === 'core')
        return;
    const rootKey = task.configKey.split('.')[0];
    if (!rootKey)
        return;
    if (!task.defaultConfig || typeof task.defaultConfig !== 'object' || Object.keys(task.defaultConfig).length === 0)
        return;
    sections[rootKey] = {
        ...sections[rootKey],
        ...task.defaultConfig
    };
}
function collectConfigSectionsFromTasks(tasks) {
    const sections = {};
    for (const task of tasks) {
        appendTaskDefaultConfig(sections, task);
    }
    return sections;
}
function renderConfigSectionsCode(sections) {
    let customSectionsCode = '';
    for (const [key, value] of Object.entries(sections)) {
        const lines = JSON.stringify(value, null, 2)
            .split('\n')
            .map((line, idx) => (idx === 0 ? line : `  ${line}`))
            .join('\n');
        customSectionsCode += `,\n  ${key}: ${lines}`;
    }
    return customSectionsCode;
}
export function createDefaultAuditConfigContent(packageName = 'Project', tasks = []) {
    const sections = collectConfigSectionsFromTasks(tasks);
    const customSectionsCode = renderConfigSectionsCode(sections);
    return `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: '${packageName}',
  paths: {
    srcRoots: ['src'],
    testRoots: ['tests'],
    scriptsRoots: ['scripts']
  },
  documentation: {
    language: 'en'
  }${customSectionsCode}
});
`;
}
function isSectionConfigured(rootKey, rawConfig) {
    if (typeof rawConfig !== 'object' || rawConfig === null)
        return false;
    if (rootKey === 'stylelint') {
        const stylesConfig = Reflect.get(rawConfig, 'styles');
        const isStylesObject = typeof stylesConfig === 'object' && stylesConfig !== null;
        return (Reflect.get(rawConfig, 'stylelint') !== undefined ||
            (isStylesObject && Reflect.get(stylesConfig, 'stylelint') !== undefined) ||
            stylesConfig !== undefined);
    }
    return Reflect.get(rawConfig, rootKey) !== undefined;
}
function collectMissingSections(tasks, rawConfig) {
    const missingByRootKey = new Map();
    for (const task of tasks) {
        if (!task.configKey || task.configKey === 'paths' || task.configKey === 'core' || task.configKey === 'none') {
            continue;
        }
        const rootKey = task.configKey.split('.')[0];
        if (!rootKey || isSectionConfigured(rootKey, rawConfig)) {
            continue;
        }
        let entry = missingByRootKey.get(rootKey);
        if (!entry) {
            entry = { tasks: [], defaultConfig: {} };
            missingByRootKey.set(rootKey, entry);
        }
        entry.tasks.push(task);
        if (task.defaultConfig && typeof task.defaultConfig === 'object') {
            Object.assign(entry.defaultConfig, task.defaultConfig);
        }
    }
    return missingByRootKey;
}
export const AUDIT_CONFIG_RULES = [
    'audit-config-missing-path',
    'audit-config-missing-file',
    'audit-config-invalid-extension',
    'audit-config-missing-gitignore-entry',
    'audit-config-missing-build-audit',
    'audit-config-removed-commit-gate',
    'audit-config-invalid-production-ref',
    'audit-config-invalid-baseline',
    'audit-config-missing-recommended-script',
    'audit-config-missing-section',
    'audit-config-obsolete-script'
];
/** Removed `audit:for-commit` gate (superseded by the warning ratchet built into `auditor`). */
const REMOVED_COMMIT_GATE_PATTERN = /audit:for-commit|auditor-commit|audit_for_commit/u;
const FIXABLE_COMMIT_GATE_PATTERN = /\b(?:(?:npm|pnpm|bun|yarn)\s+run\s+audit:for-commit|auditor-commit)\b/gu;
const REMOVED_COMMIT_GATE_SCRIPT = 'audit:for-commit';
export const ESSENTIAL_AUDITOR_SCRIPTS = {
    'auditor': 'auditor',
    'auditor:fix': 'auditor fix',
    'auditor:by-file': 'auditor-by-file',
    'auditor:lint': 'auditor preset=lint',
    'auditor:md': 'auditor preset=md',
    'auditor:build': 'auditor preset=build',
    'auditor:update': 'auditor-update',
    'auditor:version': 'auditor-version'
};
export const PATH_ROOT_KEYS = [
    'srcRoots',
    'testRoots',
    'e2eRoots',
    'integrationRoots',
    'scriptsRoots',
    'codeRoots',
    'dataRoots',
    'constantsRoots',
    'componentsRoots',
    'viewsRoots',
    'storesRoots',
    'composablesRoots',
    'typesRoots',
    'stylesRoots',
    'logicRoots',
    'cliRoots'
];
export const AUDIT_CONFIG_REQUIREMENT = {
    id: 'audit-config',
    file: AUDIT_CONFIG_FILE,
    candidateFiles: [AUDIT_CONFIG_FILE, '.auditor/audit.config.json'],
    description: 'Configuración del auditor en .auditor/',
    ruleId: 'audit-config-missing-file',
    generateDefaultContent: async (ctx) => {
        const legacy = LEGACY_ROOT_CONFIG_FILES.find(f => fs.existsSync(path.resolve(ctx.projectRoot, f)));
        if (legacy) {
            migrateLegacyAuditConfig(ctx.projectRoot);
            const migratedPath = path.resolve(ctx.projectRoot, AUDIT_CONFIG_FILE);
            if (fs.existsSync(migratedPath)) {
                return fs.readFileSync(migratedPath, 'utf-8');
            }
        }
        let pkgName = ctx.packageName || 'Project';
        try {
            const pkgRaw = fs.readFileSync(path.resolve(ctx.projectRoot, 'package.json'), 'utf8');
            const pkg = JSON.parse(pkgRaw);
            if (pkg.name)
                pkgName = pkg.name;
        }
        catch {
            // catch-ok: fallback to 'Project'
        }
        let tasks = [];
        try {
            const { discoverAuditors } = await import("../../cli/auditScanner.js");
            tasks = await discoverAuditors({ projectRoot: ctx.projectRoot });
        }
        catch {
            // catch-ok: fallback when running isolated
        }
        return createDefaultAuditConfigContent(pkgName, tasks);
    },
    customMissingMessage: (ctx, file) => {
        const legacy = LEGACY_ROOT_CONFIG_FILES.find(f => fs.existsSync(path.resolve(ctx.projectRoot, f)));
        if (legacy) {
            return `Configuration error: root-level ${legacy} is no longer supported. Run "auditor fix" to move it to ${file}.`;
        }
        return `Configuration error: ${file} does not exist. Run "auditor fix" to initialize default configuration.`;
    },
    customMissingFile: (ctx, defaultFile) => {
        const legacy = LEGACY_ROOT_CONFIG_FILES.find(f => fs.existsSync(path.resolve(ctx.projectRoot, f)));
        return legacy ?? defaultFile;
    }
};
export class ValidateAuditConfigAuditor extends BaseAuditor {
    constructor(targetPathOrOptions) {
        const options = typeof targetPathOrOptions === 'string'
            ? { projectRoot: targetPathOrOptions }
            : (targetPathOrOptions ?? {});
        const projectRoot = options.projectRoot || process.cwd();
        super({
            capabilities: { lint: true, fix: true },
            configFiles: [AUDIT_CONFIG_REQUIREMENT],
            fix: options.fix,
            id: 'validate_audit_config',
            name: 'Audit Configuration Integrity Validator',
            description: 'Valida configuración del auditor en .auditor/',
            family: 'architecture',
            ruleIds: AUDIT_CONFIG_RULES,
            packageName: 'Config',
            icon: '⚙️',
            configKey: 'paths',
            defaultConfig: {},
            ruleDescriptions: {
                'audit-config-missing-path': 'Ruta configurada no existe',
                'audit-config-missing-file': 'Archivo configurado no existe',
                'audit-config-invalid-extension': 'Extensión configurada no existe',
                'audit-config-missing-gitignore-entry': 'Falta entrada en .gitignore',
                'audit-config-missing-build-audit': 'Falta auditor en script build',
                'audit-config-removed-commit-gate': 'Script usa audit:for-commit eliminado',
                'audit-config-invalid-production-ref': 'Ref de producción no resuelve en git',
                'audit-config-invalid-baseline': 'Línea base del ratchet inválida',
                'audit-config-missing-recommended-script': 'Falta script recomendado en package',
                'audit-config-missing-section': 'Falta sección en audit.config',
                'audit-config-obsolete-script': 'Script legado u obsoleto en package.json'
            },
            coverage: {
                include: [path.posix.join(AUDITOR_DIR, '**'), '.gitignore', 'package.json']
            },
            projectRoot
        });
    }
    async runAudit() {
        for (const r of AUDIT_CONFIG_RULES) {
            this.markRuleEvaluated(r);
        }
        const requirement = this.configFiles[0] ?? AUDIT_CONFIG_REQUIREMENT;
        const ensured = await this.ensureConfigFile(requirement);
        if (!ensured) {
            return;
        }
        this.recordScanned(AUDIT_CONFIG_FILE);
        if (fs.existsSync(path.resolve(this.projectRoot, '.gitignore')))
            this.recordScanned('.gitignore');
        if (fs.existsSync(path.resolve(this.projectRoot, 'package.json')))
            this.recordScanned('package.json');
        const config = await loadAuditConfig(this.projectRoot);
        await this.verifyRequiredSections(config);
        this.verifyPathRoots(config);
        this.verifyPersistencePaths(config);
        this.verifyDomainAndStylePaths(config);
        this.verifyExtensionPaths(config);
        await this.verifyGitIgnore(config);
        await this.verifyPackageScripts(config);
        this.verifyProductionRef(config);
        this.verifyRatchetBaseline(config);
    }
    async verifyRequiredSections(config) {
        let tasks;
        try {
            tasks = await discoverAuditors({ projectRoot: this.projectRoot });
        }
        catch {
            // catch-ok: fallback when running in isolated test environments without suite discovery
            return;
        }
        const missingByRootKey = collectMissingSections(tasks, config._rawConfig ?? {});
        if (missingByRootKey.size === 0)
            return;
        if (this.isFixActive()) {
            this.applyMissingSectionsFix(missingByRootKey);
            return;
        }
        this.reportMissingSectionViolations(missingByRootKey);
    }
    applyMissingSectionsFix(missingByRootKey) {
        const configFilePath = path.resolve(this.projectRoot, AUDIT_CONFIG_FILE);
        if (!fs.existsSync(configFilePath))
            return;
        const sectionsToInsert = {}; // open-record: Sections dictionary
        for (const [rootKey, entry] of missingByRootKey.entries()) {
            sectionsToInsert[rootKey] = Object.keys(entry.defaultConfig).length > 0
                ? entry.defaultConfig
                : { enabled: true };
        }
        appendMissingSectionsToConfigFile(configFilePath, sectionsToInsert);
    }
    reportMissingSectionViolations(missingByRootKey) {
        for (const [rootKey, entry] of missingByRootKey.entries()) {
            const suiteNames = entry.tasks.map(t => t.id).join(', ');
            this.addViolation({
                ruleId: 'audit-config-missing-section',
                severity: 'error',
                file: AUDIT_CONFIG_FILE,
                line: 1,
                message: `Configuration error in ${AUDIT_CONFIG_FILE}: Missing required section "${rootKey}" declared by ${suiteNames}. Run "auditor fix" to add automatically.`,
                context: rootKey
            });
        }
    }
    /** Validates the committed baseline format when present (its absence is reported by the ratchet itself). */
    verifyRatchetBaseline(config) {
        const ratchet = buildRatchetConfig(config.ratchet);
        if (!ratchet.enabled || !fs.existsSync(path.resolve(this.projectRoot, ratchet.baselineFile)))
            return;
        this.recordScanned(ratchet.baselineFile);
        const defect = describeBaselineDefect(this.projectRoot, ratchet.baselineFile);
        if (defect === null)
            return;
        this.addViolation({
            ruleId: 'audit-config-invalid-baseline',
            severity: 'error',
            file: ratchet.baselineFile,
            line: 1,
            message: defect,
            context: ratchet.baselineFile
        });
    }
    verifyProductionRef(config) {
        const ratchet = buildRatchetConfig(config.ratchet);
        if (!ratchet.enabled || resolveGitCommit(this.projectRoot, ratchet.productionRef))
            return;
        this.addViolation({
            ruleId: 'audit-config-invalid-production-ref',
            severity: 'error',
            file: AUDIT_CONFIG_FILE,
            line: 1,
            message: `Warning ratchet production ref '${ratchet.productionRef}' does not resolve to a git commit. Run 'git fetch' (CI: checkout with full history) or set 'ratchet.productionRef' in audit.config.ts.`,
            context: `ratchet.productionRef=${ratchet.productionRef}`
        });
    }
    /** Flags scripts still invoking the removed `audit:for-commit` gate. Returns true when fix mode rewrote them. */
    verifyRemovedCommitGate(scripts) {
        let modified = false;
        for (const [name, command] of Object.entries(scripts)) {
            if (!REMOVED_COMMIT_GATE_PATTERN.test(name) && !REMOVED_COMMIT_GATE_PATTERN.test(command))
                continue;
            if (this.isFixActive() && name === REMOVED_COMMIT_GATE_SCRIPT) {
                delete scripts[name];
                modified = true;
                continue;
            }
            const rewritten = command.replaceAll(FIXABLE_COMMIT_GATE_PATTERN, 'auditor');
            if (this.isFixActive() && !REMOVED_COMMIT_GATE_PATTERN.test(rewritten)) {
                scripts[name] = rewritten;
                modified = true;
                continue;
            }
            this.addViolation({
                ruleId: 'audit-config-removed-commit-gate',
                severity: 'error',
                file: 'package.json',
                line: 1,
                message: `Script "${name}" references the removed audit:for-commit gate. Use "auditor" (npm run auditor), which now enforces 0 errors and 0 new warnings via the warning ratchet.`,
                context: `${name}: ${command}`
            });
        }
        return modified;
    }
    handleMissingGitIgnoreFile(gitignorePath, requirements) {
        if (this.isFixActive()) {
            const contentLines = [
                '# Auditor tool caches (Added by @francogp/auditor)',
                ...requirements.map(e => e.pattern),
                ''
            ];
            fs.writeFileSync(gitignorePath, contentLines.join('\n'), 'utf8');
            return;
        }
        this.addViolation({
            ruleId: 'audit-config-missing-file',
            severity: 'error',
            file: '.gitignore',
            line: 1,
            message: 'Configuration error: .gitignore does not exist in project root.',
            context: '.gitignore'
        });
    }
    appendMissingGitIgnoreEntries(gitignorePath, missing) {
        let existingContent = fs.readFileSync(gitignorePath, 'utf8');
        if (existingContent.length > 0 && !existingContent.endsWith('\n')) {
            existingContent += '\n';
        }
        const additionLines = [
            '# Auditor tool caches (Added by @francogp/auditor)',
            ...missing.map(e => e.pattern),
            ''
        ];
        fs.writeFileSync(gitignorePath, existingContent + (existingContent.endsWith('\n\n') ? '' : '\n') + additionLines.join('\n'), 'utf8');
    }
    async verifyGitIgnore(config) {
        const gitignorePath = path.resolve(this.projectRoot, '.gitignore');
        const allRequirements = await collectAllGitIgnoreRequirements(this.projectRoot, config);
        const applicable = allRequirements.filter(req => (req.isApplicable ? req.isApplicable(config) : true));
        if (!fs.existsSync(gitignorePath)) {
            this.handleMissingGitIgnoreFile(gitignorePath, applicable);
            return;
        }
        const matcher = new GitIgnoreMatcher(this.projectRoot, gitignorePath);
        const missing = applicable.filter(req => {
            const probe = req.samplePath ?? (req.pattern.endsWith('/') ? `${req.pattern}probe.tmp` : req.pattern);
            return !matcher.isIgnored(probe);
        });
        if (missing.length === 0)
            return;
        if (this.isFixActive()) {
            this.appendMissingGitIgnoreEntries(gitignorePath, missing);
            return;
        }
        for (const req of missing) {
            this.addViolation({
                ruleId: 'audit-config-missing-gitignore-entry',
                severity: 'error',
                file: '.gitignore',
                line: 1,
                message: `Missing required .gitignore entry for ${req.id} (${req.reason}). Expected "${req.pattern}" in .gitignore.`,
                context: req.pattern
            });
        }
    }
    checkPathExists(relPath, ruleId, description) {
        const normalized = relPath.trim();
        if (!normalized)
            return true;
        const resolved = path.resolve(this.projectRoot, normalized);
        if (!fs.existsSync(resolved)) {
            this.addViolation({
                ruleId,
                severity: 'error',
                file: AUDIT_CONFIG_FILE,
                line: 1,
                message: `Configuration error in ${AUDIT_CONFIG_FILE}: Referenced ${description} "${normalized}" does not exist on disk.`,
                context: normalized
            });
            return false;
        }
        return true;
    }
    verifyPathRoots(config) {
        const rawPaths = config._rawPaths ?? config.paths;
        if (!rawPaths)
            return;
        for (const key of PATH_ROOT_KEYS) {
            const val = rawPaths[key]; // open-record: Generic configuration dictionary
            if (Array.isArray(val)) {
                for (const item of val) {
                    if (typeof item === 'string') {
                        this.checkPathExists(item, 'audit-config-missing-path', `directory in paths.${String(key)}`);
                    }
                }
            }
        }
    }
    verifyPersistencePaths(config) {
        const rawPersistence = config._rawConfig?.persistence;
        if (config.paths?.migrationsDir && config.persistence?.engine !== 'none') {
            if (config._rawPaths?.migrationsDir) {
                this.checkPathExists(config.paths.migrationsDir, 'audit-config-missing-path', 'migrations directory');
            }
        }
        if (rawPersistence?.supabaseDir) {
            this.checkPathExists(rawPersistence.supabaseDir, 'audit-config-missing-path', 'supabase directory');
        }
        if (Array.isArray(rawPersistence?.allowedDatabaseDirs)) {
            for (const d of rawPersistence.allowedDatabaseDirs) {
                this.checkPathExists(d, 'audit-config-missing-path', 'database directory');
            }
        }
        if (Array.isArray(rawPersistence?.allowedDatabaseFiles)) {
            for (const f of rawPersistence.allowedDatabaseFiles) {
                this.checkPathExists(f, 'audit-config-missing-file', 'database file');
            }
        }
        if (Array.isArray(rawPersistence?.authorizedSaveFiles)) {
            for (const f of rawPersistence.authorizedSaveFiles) {
                this.checkPathExists(f, 'audit-config-missing-file', 'authorized save file');
            }
        }
    }
    verifyDomainPaths(config) {
        const rawDomain = config._rawConfig?.domain;
        if (rawDomain?.zLayersFile) {
            this.checkPathExists(rawDomain.zLayersFile, 'audit-config-missing-file', 'domain z-layers file');
        }
        if (rawDomain?.timezoneHelperModule) {
            this.checkPathExists(rawDomain.timezoneHelperModule, 'audit-config-missing-file', 'timezone helper module');
        }
        if (rawDomain?.loggerModule) {
            this.checkPathExists(rawDomain.loggerModule, 'audit-config-missing-file', 'logger module');
        }
        if (Array.isArray(rawDomain?.o1CatalogPatterns)) {
            for (const pattern of rawDomain.o1CatalogPatterns) {
                if (pattern.definingFile) {
                    this.checkPathExists(pattern.definingFile, 'audit-config-missing-file', `O(1) pattern defining file for '${pattern.name}'`);
                }
            }
        }
    }
    verifyStylesPaths(config) {
        const rawStyles = config._rawConfig?.styles;
        if (config.styles?.zLayersEnabled !== false && rawStyles) {
            if (rawStyles.baseScssFile) {
                this.checkPathExists(rawStyles.baseScssFile, 'audit-config-missing-file', 'styles base SCSS file');
            }
            if (rawStyles.zLayersScssFile) {
                this.checkPathExists(rawStyles.zLayersScssFile, 'audit-config-missing-file', 'styles z-layers SCSS file');
            }
            if (rawStyles.zLayersTsFile) {
                this.checkPathExists(rawStyles.zLayersTsFile, 'audit-config-missing-file', 'styles z-layers TS file');
            }
        }
        if (rawStyles?.buttonGovernance?.buttonsScssFile) {
            this.checkPathExists(rawStyles.buttonGovernance.buttonsScssFile, 'audit-config-missing-file', 'button governance SCSS file');
        }
        if (Array.isArray(rawStyles?.heavyEffectPaths)) {
            for (const p of rawStyles.heavyEffectPaths) {
                this.checkPathExists(p, 'audit-config-missing-path', 'heavy effect path');
            }
        }
    }
    verifyDomainAndStylePaths(config) {
        this.verifyDomainPaths(config);
        this.verifyStylesPaths(config);
    }
    verifyExtensionPaths(config) {
        const rawExtensions = config._rawConfig?.extensions ?? config.extensions;
        if (!Array.isArray(rawExtensions))
            return;
        for (const ext of rawExtensions) {
            if (typeof ext === 'string') {
                this.checkPathExists(ext, 'audit-config-invalid-extension', 'extension file or directory');
            }
        }
    }
    loadPackageJson(pkgPath) {
        if (!fs.existsSync(pkgPath)) {
            this.addViolation({
                ruleId: 'audit-config-missing-file',
                severity: 'error',
                file: 'package.json',
                line: 1,
                message: 'Configuration error: package.json does not exist in project root.',
                context: 'package.json'
            });
            return null;
        }
        try {
            return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        }
        catch (_err) {
            this.addViolation({
                ruleId: 'audit-config-missing-file',
                severity: 'error',
                file: 'package.json',
                line: 1,
                message: 'Configuration error: package.json could not be parsed as valid JSON.',
                context: 'package.json'
            });
            return null;
        }
    }
    checkBuildScriptChainsAuditor(buildScript) {
        if (REMOVED_COMMIT_GATE_PATTERN.test(buildScript))
            return true;
        return (/\bauditor(?:\.js|\.ts)?(?:\s|$|[&;])/.test(buildScript) ||
            /\b(?:npm|pnpm|bun)\s+run\s+auditor(?:\s|$|[&;])/.test(buildScript));
    }
    verifyBuildScript(pkg, config) {
        if (config.packageScripts?.enforceBuildAudit === false)
            return false;
        const buildScript = pkg.scripts?.build;
        if (!buildScript) {
            if (this.isFixActive()) {
                pkg.scripts = pkg.scripts ?? {};
                pkg.scripts.build = 'auditor';
                return true;
            }
            this.addViolation({
                ruleId: 'audit-config-missing-build-audit',
                severity: 'error',
                file: 'package.json',
                line: 1,
                message: 'Build script in package.json is missing or does not chain auditor before compilation. Expected "auditor && ..." or "npm run auditor && ...".',
                context: 'package.json:scripts.build'
            });
            return false;
        }
        if (this.isFixActive()) {
            let rewritten = buildScript;
            if (/\b(?:npm|pnpm|bun)\s+run\s+audit:build\b/.test(rewritten)) {
                rewritten = rewritten.replaceAll(/\b((?:npm|pnpm|bun)\s+run\s+)audit:build\b/g, '$1auditor:build');
            }
            if (/\b(?:npm|pnpm|bun)\s+run\s+audit\b/.test(rewritten)) {
                rewritten = rewritten.replaceAll(/\b((?:npm|pnpm|bun)\s+run\s+)audit\b/g, '$1auditor');
            }
            if (rewritten !== buildScript) {
                pkg.scripts.build = rewritten;
                return true;
            }
        }
        if (!this.checkBuildScriptChainsAuditor(buildScript)) {
            if (this.isFixActive()) {
                pkg.scripts.build = `auditor && ${buildScript}`;
                return true;
            }
            this.addViolation({
                ruleId: 'audit-config-missing-build-audit',
                severity: 'error',
                file: 'package.json',
                line: 1,
                message: 'Build script in package.json does not chain auditor before compilation. Expected "auditor && ..." or "npm run auditor && ...".',
                context: buildScript
            });
        }
        return false;
    }
    verifyLintScript(scripts) {
        let modified = false;
        if (scripts.lint && /\b(?:npm|pnpm|bun)\s+run\s+audit:lint\b/.test(scripts.lint)) {
            if (this.isFixActive()) {
                scripts.lint = scripts.lint.replaceAll(/\b((?:npm|pnpm|bun)\s+run\s+)audit:lint\b/g, '$1auditor:lint');
                modified = true;
            }
        }
        return modified;
    }
    isObsoleteAuditorScript(name, command) {
        if (name === 'audit' ||
            name === 'init-agent' ||
            name === 'sync:env' ||
            name === 'env:setup' ||
            name === 'env:check' ||
            name === 'audit:family:documentation' ||
            name === 'auditor:sync-env') {
            return true;
        }
        if (name.startsWith('audit:')) {
            return true;
        }
        if (name.startsWith('validate:') &&
            (command.includes('auditor') || command.includes('scripts/auditors') || command.includes('src/suites'))) {
            return true;
        }
        return false;
    }
    pruneObsoleteAuditorScripts(scripts) {
        let modified = false;
        for (const [name, command] of Object.entries(scripts)) {
            if (this.isObsoleteAuditorScript(name, command)) {
                if (this.isFixActive()) {
                    delete scripts[name];
                    modified = true;
                }
                else {
                    this.addViolation({
                        ruleId: 'audit-config-obsolete-script',
                        severity: 'warning',
                        file: 'package.json',
                        line: 1,
                        message: `Script obsoleto o legado del auditor detectado en package.json: "${name}". Ejecuta "auditor fix" para sanear automáticamente.`,
                        context: `${name}: ${command}`
                    });
                }
            }
        }
        return modified;
    }
    async getMissingRecommendedScripts(scripts, config) {
        const allRequirements = await collectAllPackageScriptRequirements(this.projectRoot, config);
        const seenNames = new Set();
        const missing = [];
        for (const req of allRequirements) {
            if (seenNames.has(req.name))
                continue;
            seenNames.add(req.name);
            if (typeof req.isApplicable === 'function' && !req.isApplicable(config, this.projectRoot)) {
                continue;
            }
            if (!scripts[req.name]) {
                missing.push([req.name, req.command]);
            }
        }
        return missing;
    }
    async verifyRecommendedScripts(pkg, config) {
        if (config.packageScripts?.recommendedScripts === false)
            return false;
        const scripts = pkg.scripts ?? {};
        const missing = await this.getMissingRecommendedScripts(scripts, config);
        if (missing.length === 0)
            return false;
        if (this.isFixActive()) {
            pkg.scripts = pkg.scripts ?? {};
            for (const [scriptName, scriptCmd] of missing) {
                if (!pkg.scripts[scriptName]) {
                    pkg.scripts[scriptName] = scriptCmd;
                }
            }
            return true;
        }
        for (const [scriptName, scriptCmd] of missing) {
            this.addViolation({
                ruleId: 'audit-config-missing-recommended-script',
                severity: 'warning',
                file: 'package.json',
                line: 1,
                message: `Missing recommended auditor script "${scriptName}" in package.json (e.g. "${scriptName}": "${scriptCmd}"). Run "auditor fix" to add automatically.`,
                context: scriptName
            });
        }
        return false;
    }
    async verifyPackageScripts(config) {
        if (config.packageScripts?.enabled === false)
            return;
        const pkgPath = path.resolve(this.projectRoot, 'package.json');
        const pkg = this.loadPackageJson(pkgPath);
        if (!pkg)
            return;
        let modified = false;
        if (pkg.scripts) {
            if (this.verifyRemovedCommitGate(pkg.scripts))
                modified = true;
            if (this.verifyLintScript(pkg.scripts))
                modified = true;
            if (this.pruneObsoleteAuditorScripts(pkg.scripts))
                modified = true;
        }
        if (this.verifyBuildScript(pkg, config))
            modified = true;
        if (await this.verifyRecommendedScripts(pkg, config))
            modified = true;
        if (modified) {
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
        }
    }
}
// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateAuditConfigAuditor());
//# sourceMappingURL=validate_audit_config.js.map