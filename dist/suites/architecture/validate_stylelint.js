/**
 * packages/auditor/src/suites/architecture/validate_stylelint.ts
 *
 * STYLELINT CSS & SCSS HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Audits stylesheets, component styles, and Vue 3 SFCs (<style scoped lang="scss">)
 * using the official Stylelint engine with stylelint-config-standard-scss,
 * stylelint-config-standard-vue, and stylelint-order.
 *
 * Performance:
 *   - Ephemeral content-hashed caching at scratch/cache/stylelint_cache.json
 *   - Multithreaded orchestration via audit_full master runner
 *   - Zero false positives on SCSS nesting, mixins, or scoped components
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* src/suites/architecture/validate_stylelint.ts
 *   npm run validate:stylelint
 */
import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import stylelint from 'stylelint';
import { BaseAuditor, CANONICAL_IGNORE_DIRS } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
enableCompileCache();
export const STYLELINT_RULES = [
    'stylelint-issue',
    'css-duplicate-selectors',
    'css-duplicate-properties',
    'css-empty-blocks',
    'css-order-violation',
    'scss-syntax-issue'
];
export function resolveStylelintConfigFile(projectRoot, configuredConfigFile) {
    if (configuredConfigFile) {
        const customCandidate = path.resolve(projectRoot, configuredConfigFile);
        if (fs.existsSync(customCandidate)) {
            return customCandidate;
        }
    }
    const candidateNames = [
        '.stylelintrc.json',
        '.stylelintrc.js',
        '.stylelintrc.cjs',
        '.stylelintrc.mjs',
        '.stylelintrc.yaml',
        '.stylelintrc.yml',
        'stylelint.config.js',
        'stylelint.config.cjs',
        'stylelint.config.mjs'
    ];
    for (const name of candidateNames) {
        const candidate = path.resolve(projectRoot, name);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    const pkgJsonPath = path.resolve(projectRoot, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
            if (pkg.stylelint) {
                return pkgJsonPath;
            }
        }
        catch {
            // catch-ok: Fall back to canonical auditor configuration
        }
    }
    // Canonical package fallback
    const canonicalConfig = path.resolve(import.meta.dirname, '../../../.stylelintrc.json');
    if (fs.existsSync(canonicalConfig)) {
        return canonicalConfig;
    }
    return '.stylelintrc.json';
}
export function categorizeStylelintRule(ruleName) {
    if (!ruleName)
        return 'stylelint-issue';
    if (ruleName === 'no-duplicate-selectors')
        return 'css-duplicate-selectors';
    if (ruleName === 'declaration-block-no-duplicate-properties')
        return 'css-duplicate-properties';
    if (ruleName === 'block-no-empty')
        return 'css-empty-blocks';
    if (ruleName.startsWith('order/'))
        return 'css-order-violation';
    if (ruleName.startsWith('scss/'))
        return 'scss-syntax-issue';
    return 'stylelint-issue';
}
export class StylelintAuditor extends BaseAuditor {
    lastLinterResult = null;
    static gitIgnoreEntries = [
        {
            id: '.stylelintcache',
            pattern: '.stylelintcache',
            samplePath: '.stylelintcache',
            reason: 'Archivo de caché incremental generado por Stylelint',
            isApplicable: (config) => config.styles?.stylelint?.enabled !== false && config.stylelint?.enabled !== false
        }
    ];
    constructor(options) {
        const projectRoot = options?.projectRoot;
        const config = getAuditConfig(projectRoot);
        const roots = config.paths.srcRoots ?? ['src'];
        super({
            capabilities: { fix: true, lint: true },
            gitIgnoreEntries: StylelintAuditor.gitIgnoreEntries,
            id: options?.id || 'validate_stylelint',
            name: options?.name || 'Stylelint & SCSS Hygiene Validator',
            description: 'Audita calidad, sintaxis y patrones CSS/SCSS con Stylelint',
            family: 'architecture',
            packageName: 'Stylelint',
            icon: '🎨',
            ruleIds: STYLELINT_RULES,
            ruleDescriptions: {
                'stylelint-issue': 'Violación de estándar CSS o SCSS',
                'css-duplicate-selectors': 'Selectores duplicados en el bloque',
                'css-duplicate-properties': 'Propiedades duplicadas en la regla',
                'css-empty-blocks': 'Bloques de estilos vacíos',
                'css-order-violation': 'Orden de propiedades CSS',
                'scss-syntax-issue': 'Sintaxis SCSS inválida o desconocida'
            },
            roots,
            projectRoot
        });
    }
    getLastLinterResult() {
        return this.lastLinterResult;
    }
    async runAudit() {
        const startTime = performance.now();
        const config = getAuditConfig(this.projectRoot);
        const stylelintConfig = config.stylelint ?? config.styles?.stylelint;
        if (stylelintConfig?.enabled === false) {
            this.context.setMetric('Stylelint Disabled', 'true');
            this.filesScannedCount = 0;
            return;
        }
        const configFile = resolveStylelintConfigFile(this.projectRoot, stylelintConfig?.configFile);
        const isFixMode = this.isFixModeRequested();
        const cacheDir = path.resolve(this.projectRoot, 'scratch/cache');
        const cacheLocation = path.resolve(cacheDir, 'stylelint_cache.json');
        fs.mkdirSync(cacheDir, { recursive: true });
        const roots = this.roots.length > 0 ? this.roots : ['src'];
        const filesGlobs = roots.map(r => `${normalizePosixPath(r, this.projectRoot)}/**/*.{css,scss,sass,vue}`);
        const ignoreGlobs = [
            ...Array.from(CANONICAL_IGNORE_DIRS).map(d => `${d}/**`),
            'dist/**',
            'dev-dist/**',
            'scratch/**',
            'tests/**',
            '**/*.spec.*',
            '**/*.test.*',
            ...(config.paths.ignoreGlobs ?? []),
            ...(stylelintConfig?.ignoreGlobs ?? [])
        ];
        const hasCustomRules = Boolean(stylelintConfig?.rules && Object.keys(stylelintConfig.rules).length > 0);
        const lintConfig = hasCustomRules
            ? {
                extends: [configFile],
                rules: stylelintConfig.rules
            }
            : undefined;
        let linterResult;
        try {
            linterResult = await stylelint.lint({
                files: filesGlobs,
                globbyOptions: {
                    cwd: this.projectRoot,
                    ignore: ignoreGlobs
                },
                configFile: lintConfig ? undefined : configFile,
                config: lintConfig,
                cache: true,
                cacheLocation,
                cacheStrategy: 'content',
                fix: isFixMode,
                allowEmptyInput: true
            });
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            this.addViolation({
                ruleId: 'stylelint-issue',
                severity: 'error',
                file: configFile,
                line: 1,
                message: `Fallo al ejecutar Stylelint: ${errorMsg}`,
                context: 'stylelint-engine-error'
            });
            return;
        }
        this.lastLinterResult = linterResult;
        this.filesScannedCount = linterResult.results.length;
        let totalWarnings = 0;
        let totalErrors = 0;
        for (const fileResult of linterResult.results) {
            const relFile = normalizePosixPath(fileResult.source ?? '', this.projectRoot);
            for (const warning of fileResult.warnings) {
                const ruleId = categorizeStylelintRule(warning.rule);
                const severity = warning.severity === 'error' ? 'error' : 'warning';
                if (severity === 'error') {
                    totalErrors++;
                }
                else {
                    totalWarnings++;
                }
                this.addViolation({
                    ruleId,
                    severity,
                    file: relFile,
                    line: warning.line || 1,
                    message: warning.text,
                    context: warning.rule || 'stylelint'
                });
            }
        }
        // Persist raw report to scratch
        const reportDir = path.resolve(this.projectRoot, 'scratch/audits/architecture');
        fs.mkdirSync(reportDir, { recursive: true });
        const reportFile = path.resolve(reportDir, `${this.id}.json`);
        try {
            fs.writeFileSync(reportFile, JSON.stringify({
                summary: {
                    filesScanned: this.filesScannedCount,
                    totalErrors,
                    totalWarnings,
                    durationMs: Math.round(performance.now() - startTime)
                },
                results: linterResult.results.map((r) => ({
                    source: normalizePosixPath(r.source ?? '', this.projectRoot),
                    errored: r.errored,
                    warnings: r.warnings
                }))
            }, null, 2), 'utf-8');
        }
        catch {
            // catch-ok: Scratch report persistence is non-fatal
        }
        this.context.setMetric('Archivos Escaneados', this.filesScannedCount);
        this.context.setMetric('Errores CSS', totalErrors);
        this.context.setMetric('Advertencias CSS', totalWarnings);
        this.context.setMetric('Modo', isFixMode ? 'fix' : 'check');
    }
}
// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new StylelintAuditor());
//# sourceMappingURL=validate_stylelint.js.map