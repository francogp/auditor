/**
 * src/suites/architecture/validate_stylelint_config.ts
 *
 * STYLELINT CONFIGURATION INTEGRITY VALIDATOR (Node.js 26+ Native)
 *
 * Validates that .stylelintrc.json:
 *   1. Physically exists in the project root.
 *   2. Configures the required 'stylelint-declaration-strict-value' plugin.
 *   3. Enforces the canonical 'scale-unlimited/declaration-strict-value' rule for
 *      z-index, font-size, and color to eliminate raw magic values in SCSS/CSS.
 *   4. Supports auto-repair in --fix mode.
 */
import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import 'stylelint-declaration-strict-value';
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/safePath.js";
enableCompileCache();
export const STYLELINT_CONFIG_RULES = [
    'stylelint-config-missing',
    'stylelint-config-missing-plugin',
    'stylelint-config-missing-strict-value'
];
export const REQUIRED_STYLELINT_PLUGIN = 'stylelint-declaration-strict-value';
export const REQUIRED_STRICT_VALUE_RULE = 'scale-unlimited/declaration-strict-value';
export const REQUIRED_STRICT_PROPERTIES = [
    '/color$/',
    'font-size',
    'z-index',
    'box-shadow',
    'border-radius',
    'font-family',
    'transition-duration',
    'animation-duration',
    'gap',
    'row-gap',
    'column-gap',
    'font-weight',
    'transition-timing-function'
];
export const CANONICAL_STRICT_VALUE_CONFIG = [
    [...REQUIRED_STRICT_PROPERTIES],
    {
        ignoreAtRules: ['@font-face'],
        ignoreValues: {
            '': ['inherit', 'initial', 'unset'],
            '/color$/': ['transparent', 'currentColor', 'none'],
            'z-index': ['auto', '0', '-1'],
            'font-size': ['inherit', 'initial'],
            'box-shadow': ['none'],
            'border-radius': ['0', '50%', '100%', '9999px'],
            'font-family': [
                'inherit',
                'initial',
                'unset',
                'sans-serif',
                'serif',
                'monospace',
                'cursive',
                'fantasy',
                'system-ui',
                'ui-sans-serif',
                'ui-serif',
                'ui-monospace',
                ',',
                '/^var\\(.*\\),?$/',
                '/^\\$.*,?$/'
            ],
            'transition-duration': ['0', '0s', '0ms'],
            'animation-duration': ['0', '0s', '0ms'],
            'gap': ['0', 'normal'],
            'row-gap': ['0', 'normal'],
            'column-gap': ['0', 'normal'],
            'font-weight': ['normal', 'bold', 'bolder', 'lighter'],
            'transition-timing-function': [
                'linear',
                'ease',
                'ease-in',
                'ease-out',
                'ease-in-out',
                'step-start',
                'step-end'
            ]
        },
        message: 'Enforce using SCSS variables ($variable) or CSS variables (var(--variable)) instead of literal values (no magic values/numbers in styles)'
    }
];
export const CANONICAL_STYLELINT_CONFIG_CONTENT = JSON.stringify({
    $schema: 'https://json.schemastore.org/stylelintrc',
    extends: ['stylelint-config-standard'],
    plugins: ['stylelint-order', REQUIRED_STYLELINT_PLUGIN],
    overrides: [
        {
            files: ['**/*.scss'],
            extends: ['stylelint-config-standard-scss']
        },
        {
            files: ['**/*.vue'],
            extends: ['stylelint-config-standard-scss', 'stylelint-config-standard-vue/scss']
        }
    ],
    rules: {
        [REQUIRED_STRICT_VALUE_RULE]: CANONICAL_STRICT_VALUE_CONFIG,
        'no-duplicate-selectors': true,
        'declaration-block-no-duplicate-properties': true,
        'block-no-empty': true,
        'no-empty-source': true
    }
}, null, 2) + '\n';
export const STYLELINT_CONFIG_REQUIREMENT = {
    id: 'stylelint-config',
    file: '.stylelintrc.json',
    candidateFiles: ['.stylelintrc.json', '.stylelintrc.js', '.stylelintrc.cjs', 'stylelint.config.js'],
    description: 'Configuración canónica de Stylelint en .stylelintrc.json',
    ruleId: 'stylelint-config-missing',
    generateDefaultContent: () => CANONICAL_STYLELINT_CONFIG_CONTENT,
    customMissingMessage: (_ctx, file) => `No se encontró el archivo de configuración de Stylelint '${file}'. Ejecuta "auditor fix" para crearlo automáticamente.`
};
export class ValidateStylelintConfigAuditor extends BaseAuditor {
    constructor(rootsOrOptions, maybeProjectRoot) {
        const optionsObj = rootsOrOptions && !Array.isArray(rootsOrOptions)
            ? rootsOrOptions
            : undefined;
        const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();
        super({
            capabilities: {
                fix: true,
                fixPriority: true,
                lint: true,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
            },
            fixableRuleIds: [...STYLELINT_CONFIG_RULES],
            configFiles: [STYLELINT_CONFIG_REQUIREMENT],
            id: 'validate_stylelint_config',
            name: 'Stylelint Configuration Validator',
            description: 'Valida plugins y reglas estrictas en .stylelintrc.json',
            family: 'architecture',
            packageName: 'Stylelint',
            configKey: 'stylelint.enabled',
            defaultConfig: { enabled: true },
            icon: '🎨',
            ruleIds: STYLELINT_CONFIG_RULES,
            ruleDescriptions: {
                'stylelint-config-missing': 'Falta .stylelintrc.json',
                'stylelint-config-missing-plugin': 'Falta plugin strict-value',
                'stylelint-config-missing-strict-value': 'Falta regla strict-value'
            },
            coverage: {
                include: ['.stylelintrc*']
            },
            projectRoot,
            fix: optionsObj?.fix
        });
    }
    async runAudit() {
        for (const r of STYLELINT_CONFIG_RULES) {
            this.markRuleEvaluated(r);
        }
        const config = getAuditConfig(this.projectRoot);
        if (config.stylelint?.enabled === false && config.styles?.stylelint?.enabled === false) {
            for (const r of STYLELINT_CONFIG_RULES) {
                this.markRuleNotApplicable(r, 'Stylelint deshabilitado en audit.config.ts');
            }
            return;
        }
        const configFile = this.resolveConfigFile(STYLELINT_CONFIG_REQUIREMENT);
        if (!configFile) {
            const ensured = await this.ensureConfigFile(STYLELINT_CONFIG_REQUIREMENT);
            if (!ensured)
                return;
        }
        const targetFile = configFile ?? path.resolve(this.projectRoot, '.stylelintrc.json');
        this.recordScanned(toPosixRelative(this.projectRoot, targetFile));
        let parsedConfig;
        try {
            const content = fs.readFileSync(targetFile, 'utf-8');
            parsedConfig = JSON.parse(content);
        }
        catch {
            // If not JSON (e.g. JS file), skip content AST checks
            return;
        }
        let modified = false;
        // 1. Verify plugin
        const plugins = Array.isArray(parsedConfig.plugins) ? [...parsedConfig.plugins] : [];
        if (!plugins.includes(REQUIRED_STYLELINT_PLUGIN)) {
            if (this.isFixActive()) {
                plugins.push(REQUIRED_STYLELINT_PLUGIN);
                parsedConfig.plugins = plugins;
                modified = true;
            }
            else {
                this.addViolation({
                    ruleId: 'stylelint-config-missing-plugin',
                    severity: 'error',
                    file: toPosixRelative(this.projectRoot, targetFile),
                    line: 1,
                    message: `Falta el plugin requerido "${REQUIRED_STYLELINT_PLUGIN}" en plugins de ${path.basename(targetFile)}. Ejecuta "auditor fix" para agregarlo.`,
                    context: REQUIRED_STYLELINT_PLUGIN
                });
            }
        }
        // 2. Verify strict value rule
        const rules = (typeof parsedConfig.rules === 'object' && parsedConfig.rules !== null)
            ? { ...parsedConfig.rules }
            : {};
        const strictRule = rules[REQUIRED_STRICT_VALUE_RULE];
        const isStrictRuleConfigured = Array.isArray(strictRule) && strictRule.length >= 1;
        let missingProperties = []; // no-domain: Non-domain Stylelint property names
        if (isStrictRuleConfigured && Array.isArray(strictRule[0])) {
            const configuredProps = new Set(strictRule[0].filter((item) => typeof item === 'string'));
            missingProperties = REQUIRED_STRICT_PROPERTIES.filter(p => !configuredProps.has(p));
        }
        if (!isStrictRuleConfigured || missingProperties.length > 0) {
            if (this.isFixActive()) {
                rules[REQUIRED_STRICT_VALUE_RULE] = CANONICAL_STRICT_VALUE_CONFIG;
                parsedConfig.rules = rules;
                modified = true;
            }
            else {
                const detailMsg = missingProperties.length > 0
                    ? `La regla "${REQUIRED_STRICT_VALUE_RULE}" en ${path.basename(targetFile)} no cubre todas las propiedades canónicas (faltan: ${missingProperties.join(', ')}). Ejecuta "auditor fix" para sincronizarla.`
                    : `Falta la regla requerida "${REQUIRED_STRICT_VALUE_RULE}" en rules de ${path.basename(targetFile)}. Ejecuta "auditor fix" para inyectarla.`;
                this.addViolation({
                    ruleId: 'stylelint-config-missing-strict-value',
                    severity: 'error',
                    file: toPosixRelative(this.projectRoot, targetFile),
                    line: 1,
                    message: detailMsg,
                    context: missingProperties.length > 0 ? missingProperties.join(', ') : REQUIRED_STRICT_VALUE_RULE
                });
            }
        }
        if (modified && this.isFixActive()) {
            fs.writeFileSync(targetFile, JSON.stringify(parsedConfig, null, 2) + '\n', 'utf-8');
        }
    }
}
export { ValidateStylelintConfigAuditor as StylelintConfigAuditor };
// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateStylelintConfigAuditor());
//# sourceMappingURL=validate_stylelint_config.js.map