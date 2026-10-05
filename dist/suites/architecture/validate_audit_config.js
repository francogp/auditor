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
import { loadAuditConfig } from "../../core/auditConfig.js";
import { GitIgnoreMatcher } from "../../core/gitignoreMatcher.js";
import { collectAllGitIgnoreRequirements } from "../../cli/auditScanner.js";
enableCompileCache();
export const AUDIT_CONFIG_RULES = [
    'audit-config-missing-path',
    'audit-config-missing-file',
    'audit-config-invalid-extension',
    'audit-config-missing-gitignore-entry',
    'audit-config-missing-build-audit',
    'audit-config-invalid-build-script',
    'audit-config-missing-recommended-script'
];
export const ESSENTIAL_AUDITOR_SCRIPTS = {
    'audit': 'auditor',
    'audit:for-commit': 'auditor-commit',
    'audit:fix': 'auditor fix',
    'audit:lint': 'auditor preset=lint',
    'audit:md': 'auditor preset=md',
    'audit:build': 'auditor preset=build',
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
export class ValidateAuditConfigAuditor extends BaseAuditor {
    fixMode;
    constructor(targetPathOrOptions) {
        const options = typeof targetPathOrOptions === 'string'
            ? { projectRoot: targetPathOrOptions }
            : (targetPathOrOptions ?? {});
        const projectRoot = options.projectRoot || process.cwd();
        super({
            capabilities: { lint: true, fix: true },
            id: 'validate_audit_config',
            name: 'Audit Configuration Integrity Validator',
            description: 'Valida existencia física de rutas en audit.config.ts',
            family: 'architecture',
            ruleIds: AUDIT_CONFIG_RULES,
            packageName: 'Config',
            icon: '⚙️',
            ruleDescriptions: {
                'audit-config-missing-path': 'Ruta configurada no existe',
                'audit-config-missing-file': 'Archivo configurado no existe',
                'audit-config-invalid-extension': 'Extensión configurada no existe',
                'audit-config-missing-gitignore-entry': 'Falta entrada en .gitignore',
                'audit-config-missing-build-audit': 'Falta auditor en script build',
                'audit-config-invalid-build-script': 'Script build usa audit:for-commit',
                'audit-config-missing-recommended-script': 'Falta script recomendado en package'
            },
            coverage: {
                include: ['audit.config.ts', '.gitignore', 'package.json']
            },
            projectRoot
        });
        this.fixMode = Boolean(options.fix);
    }
    isFixActive() {
        return this.fixMode || this.isFixModeRequested();
    }
    async runAudit() {
        for (const r of AUDIT_CONFIG_RULES) {
            this.markRuleEvaluated(r);
        }
        const configPath = path.resolve(this.projectRoot, 'audit.config.ts');
        if (!fs.existsSync(configPath)) {
            this.addViolation({
                ruleId: 'audit-config-missing-file',
                severity: 'error',
                file: 'audit.config.ts',
                line: 1,
                message: 'Configuration error: audit.config.ts does not exist in project root.',
                context: 'audit.config.ts'
            });
            return;
        }
        this.recordScanned('audit.config.ts');
        if (fs.existsSync(path.resolve(this.projectRoot, '.gitignore')))
            this.recordScanned('.gitignore');
        if (fs.existsSync(path.resolve(this.projectRoot, 'package.json')))
            this.recordScanned('package.json');
        const config = await loadAuditConfig(this.projectRoot);
        this.verifyPathRoots(config);
        this.verifyPersistencePaths(config);
        this.verifyDomainAndStylePaths(config);
        this.verifyExtensionPaths(config);
        await this.verifyGitIgnore(config);
        this.verifyPackageScripts(config);
    }
    async verifyGitIgnore(config) {
        const gitignorePath = path.resolve(this.projectRoot, '.gitignore');
        const exists = fs.existsSync(gitignorePath);
        const allRequirements = await collectAllGitIgnoreRequirements(this.projectRoot, config);
        const applicableRequirements = allRequirements.filter(req => (req.isApplicable ? req.isApplicable(config) : true));
        if (!exists) {
            if (this.isFixActive()) {
                const content = [
                    '# Auditor tool caches (Added by @francogp/auditor)',
                    ...applicableRequirements.map(e => e.pattern),
                    ''
                ].join('\n');
                fs.writeFileSync(gitignorePath, content, 'utf8');
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
            return;
        }
        const matcher = new GitIgnoreMatcher(this.projectRoot, gitignorePath);
        const missingRequirements = [];
        for (const req of applicableRequirements) {
            const probePath = req.samplePath ?? (req.pattern.endsWith('/') ? `${req.pattern}probe.tmp` : req.pattern);
            if (!matcher.isIgnored(probePath)) {
                missingRequirements.push(req);
            }
        }
        if (missingRequirements.length === 0) {
            return;
        }
        if (this.isFixActive()) {
            let existingContent = fs.readFileSync(gitignorePath, 'utf8');
            if (existingContent.length > 0 && !existingContent.endsWith('\n')) {
                existingContent += '\n';
            }
            const addition = [
                '# Auditor tool caches (Added by @francogp/auditor)',
                ...missingRequirements.map(e => e.pattern),
                ''
            ].join('\n');
            fs.writeFileSync(gitignorePath, existingContent + (existingContent.endsWith('\n\n') ? '' : '\n') + addition, 'utf8');
            return;
        }
        for (const req of missingRequirements) {
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
                file: 'audit.config.ts',
                line: 1,
                message: `Configuration error in audit.config.ts: Referenced ${description} "${normalized}" does not exist on disk.`,
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
            const val = rawPaths[key];
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
    verifyDomainAndStylePaths(config) {
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
    verifyPackageScripts(config) {
        if (config.packageScripts?.enabled === false) {
            return;
        }
        const pkgPath = path.resolve(this.projectRoot, 'package.json');
        if (!fs.existsSync(pkgPath)) {
            this.addViolation({
                ruleId: 'audit-config-missing-file',
                severity: 'error',
                file: 'package.json',
                line: 1,
                message: 'Configuration error: package.json does not exist in project root.',
                context: 'package.json'
            });
            return;
        }
        let pkg;
        try {
            pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
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
            return;
        }
        let modified = false;
        // 1. Build script verification (enforced for all projects governed by the auditor)
        const shouldEnforceBuildAudit = config.packageScripts?.enforceBuildAudit !== false;
        if (shouldEnforceBuildAudit) {
            const buildScript = pkg.scripts?.build;
            if (!buildScript) {
                if (this.isFixActive()) {
                    pkg.scripts = pkg.scripts ?? {};
                    pkg.scripts.build = 'auditor';
                    modified = true;
                }
                else {
                    this.addViolation({
                        ruleId: 'audit-config-missing-build-audit',
                        severity: 'error',
                        file: 'package.json',
                        line: 1,
                        message: 'Build script in package.json is missing or does not chain auditor before compilation. Expected "auditor && ..." or "npm run audit && ...".',
                        context: 'package.json:scripts.build'
                    });
                }
            }
            else {
                const hasForCommit = /\b(audit:for-commit|auditor-commit)\b/.test(buildScript);
                if (hasForCommit) {
                    if (this.isFixActive()) {
                        pkg.scripts.build = buildScript.replace(/\b(npm run audit:for-commit|pnpm run audit:for-commit|bun run audit:for-commit|auditor-commit|audit:for-commit)\b/, 'auditor');
                        modified = true;
                    }
                    else {
                        this.addViolation({
                            ruleId: 'audit-config-invalid-build-script',
                            severity: 'error',
                            file: 'package.json',
                            line: 1,
                            message: 'Build script in package.json uses audit:for-commit. Production builds must enforce full auditor (e.g. "auditor && ..." or "npm run audit && ...").',
                            context: buildScript
                        });
                    }
                }
                else {
                    const hasFullAuditor = /\bauditor(\.js|\.ts)?(\s|$|&|;)/.test(buildScript) ||
                        /\b(npm|pnpm|bun)\s+run\s+audit(\s|$|&|;)/.test(buildScript);
                    if (!hasFullAuditor) {
                        if (this.isFixActive()) {
                            pkg.scripts.build = `auditor && ${buildScript}`;
                            modified = true;
                        }
                        else {
                            this.addViolation({
                                ruleId: 'audit-config-missing-build-audit',
                                severity: 'error',
                                file: 'package.json',
                                line: 1,
                                message: 'Build script in package.json does not chain auditor before compilation. Expected "auditor && ..." or "npm run audit && ...".',
                                context: buildScript
                            });
                        }
                    }
                }
            }
        }
        // 2. Recommended auditor scripts verification
        if (config.packageScripts?.recommendedScripts !== false) {
            const scripts = pkg.scripts ?? {};
            const missingRecommended = [];
            for (const [scriptName, scriptCmd] of Object.entries(ESSENTIAL_AUDITOR_SCRIPTS)) {
                if (!scripts[scriptName]) {
                    missingRecommended.push([scriptName, scriptCmd]);
                }
            }
            if (Array.isArray(config.packageScripts?.extraRequiredScripts)) {
                for (const reqScript of config.packageScripts.extraRequiredScripts) {
                    if (!scripts[reqScript]) {
                        missingRecommended.push([reqScript, `auditor task=${reqScript}`]);
                    }
                }
            }
            if (missingRecommended.length > 0) {
                if (this.isFixActive()) {
                    pkg.scripts = pkg.scripts ?? {};
                    for (const [scriptName, scriptCmd] of missingRecommended) {
                        pkg.scripts[scriptName] = scriptCmd;
                    }
                    modified = true;
                }
                else {
                    for (const [scriptName, scriptCmd] of missingRecommended) {
                        this.addViolation({
                            ruleId: 'audit-config-missing-recommended-script',
                            severity: 'warning',
                            file: 'package.json',
                            line: 1,
                            message: `Missing recommended auditor script "${scriptName}" in package.json (e.g. "${scriptName}": "${scriptCmd}"). Run "auditor fix" to add automatically.`,
                            context: scriptName
                        });
                    }
                }
            }
        }
        if (modified) {
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
        }
    }
}
// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateAuditConfigAuditor());
//# sourceMappingURL=validate_audit_config.js.map