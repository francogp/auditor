import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { ESLint } from 'eslint';
import vueParser from 'vue-eslint-parser';
import vueA11y from 'eslint-plugin-vuejs-accessibility';
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
enableCompileCache();
const INDEX_HTML_FILE = 'index.html';
const VUE_EXTENSIONS = new Set(['.vue']);
export const ACCESSIBILITY_RULES = [
    'a11y-img-alt',
    'a11y-form-control-has-label',
    'a11y-interactive-supports-focus',
    'a11y-anchor-has-content',
    'a11y-aria-role-invalid',
    'a11y-viewport-zoom-lock'
];
/** Canonical rules evaluated through the ESLint vuejs-accessibility engine (all except the index.html viewport check). */
const ESLINT_BACKED_RULES = ACCESSIBILITY_RULES.filter(id => id !== 'a11y-viewport-zoom-lock');
/**
 * Maps an eslint-plugin-vuejs-accessibility rule to canonical AccessibilityRuleId.
 */
export function mapA11yRuleId(eslintRuleId) {
    const bare = eslintRuleId.replace(/^vuejs-accessibility\//, '');
    switch (bare) {
        case 'alt-text':
            return 'a11y-img-alt';
        case 'form-control-has-label':
        case 'label-has-for':
            return 'a11y-form-control-has-label';
        case 'interactive-supports-focus':
        case 'click-events-have-key-events':
        case 'mouse-events-have-key-events':
            return 'a11y-interactive-supports-focus';
        case 'anchor-has-content':
        case 'heading-has-content':
            return 'a11y-anchor-has-content';
        case 'aria-props':
        case 'aria-role':
        case 'aria-unsupported-elements':
        case 'role-has-required-aria-props':
        case 'no-redundant-roles':
        case 'no-role-presentation-on-focusable':
            return 'a11y-aria-role-invalid';
        default:
            return 'a11y-aria-role-invalid';
    }
}
export class ValidateAccessibilityAuditor extends BaseAuditor {
    constructor(options = {}) {
        const effectiveRoot = options.projectRoot ?? process.cwd();
        super({
            capabilities: { fix: true, lint: true },
            fix: options.fix,
            id: 'validate_accessibility',
            name: 'Vue & Web Accessibility Standards Auditor',
            description: 'Valida estándares WCAG 2.1/2.2 y accesibilidad',
            family: 'architecture',
            packageName: 'A11y',
            configKey: 'accessibility.enabled',
            defaultConfig: { enabled: true },
            icon: '♿',
            ruleIds: ACCESSIBILITY_RULES,
            ruleDescriptions: {
                'a11y-img-alt': 'Imagen sin atributo alt accesible',
                'a11y-form-control-has-label': 'Control de formulario sin label',
                'a11y-interactive-supports-focus': 'Elemento interactivo sin foco',
                'a11y-anchor-has-content': 'Enlace o botón sin texto o label',
                'a11y-aria-role-invalid': 'Rol o atributo ARIA no conforme',
                'a11y-viewport-zoom-lock': 'Bloqueo de zoom en viewport HTML'
            },
            projectRoot: effectiveRoot,
            coverage: { include: [INDEX_HTML_FILE, 'src/**/*.vue'] }
        });
    }
    async runAudit() {
        if (this.isSuiteGatingDisabled('Accesibilidad desactivada en config')) {
            return;
        }
        const config = getAuditConfig(this.projectRoot);
        const scannableRoots = [
            ...(config.paths.componentsRoots ?? ['src/components']),
            ...(config.paths.viewsRoots ?? ['src/views']),
            ...(config.paths.srcRoots ?? ['src'])
        ];
        this.redeclareCoverage({
            include: [INDEX_HTML_FILE, ...deriveCoverageFromRoots(scannableRoots, VUE_EXTENSIONS).include]
        });
        this.auditIndexViewport();
        const vueFiles = this.collectScannableVueFiles(scannableRoots);
        if (vueFiles.length === 0) {
            for (const ruleId of ESLINT_BACKED_RULES) {
                this.markRuleNotApplicable(ruleId, 'No hay archivos .vue en las raíces configuradas');
            }
            return;
        }
        const effectiveRules = this.buildEffectiveRules(config.accessibility?.rules ?? {});
        const results = await this.executeEslintOnVueFiles(vueFiles, effectiveRules);
        this.processLintResults(results, effectiveRules);
    }
    collectScannableVueFiles(scannableRoots) {
        const vueFiles = [];
        const seenFiles = new Set();
        for (const root of scannableRoots) {
            const fullRoot = path.resolve(this.projectRoot, root);
            if (fs.existsSync(fullRoot)) {
                this.collectVueFiles(fullRoot, vueFiles, seenFiles);
            }
        }
        return vueFiles;
    }
    buildEffectiveRules(customRules) {
        const normalized = {};
        for (const [key, val] of Object.entries(customRules)) {
            normalized[key] = val ? 'error' : 'off';
        }
        return {
            'vuejs-accessibility/alt-text': 'error',
            'vuejs-accessibility/anchor-has-content': 'error',
            'vuejs-accessibility/aria-props': 'error',
            'vuejs-accessibility/aria-role': 'error',
            'vuejs-accessibility/aria-unsupported-elements': 'error',
            'vuejs-accessibility/click-events-have-key-events': 'error',
            'vuejs-accessibility/form-control-has-label': 'error',
            'vuejs-accessibility/heading-has-content': 'error',
            'vuejs-accessibility/interactive-supports-focus': 'error',
            'vuejs-accessibility/no-autofocus': 'error',
            'vuejs-accessibility/no-redundant-roles': 'error',
            'vuejs-accessibility/role-has-required-aria-props': 'error',
            'vuejs-accessibility/tabindex-no-positive': 'error',
            ...normalized
        };
    }
    async executeEslintOnVueFiles(vueFiles, rules) {
        const eslint = new ESLint({
            cwd: this.projectRoot,
            fix: this.fixMode,
            overrideConfigFile: true,
            overrideConfig: [
                {
                    files: ['**/*.vue'],
                    languageOptions: { parser: vueParser },
                    plugins: { 'vuejs-accessibility': vueA11y },
                    rules
                }
            ]
        });
        const results = await eslint.lintFiles([...vueFiles]);
        if (this.fixMode) {
            await ESLint.outputFixes(results);
        }
        return results;
    }
    processLintResults(results, effectiveRules) {
        const activeRules = new Set();
        for (const [eslintRuleId, level] of Object.entries(effectiveRules)) {
            if (level !== 'off')
                activeRules.add(mapA11yRuleId(eslintRuleId));
        }
        for (const ruleId of ESLINT_BACKED_RULES) {
            if (!activeRules.has(ruleId)) {
                this.markRuleNotApplicable(ruleId, 'Todas sus reglas ESLint están en off (config.accessibility.rules)');
            }
        }
        for (const res of results) {
            const relFile = path.relative(this.projectRoot, res.filePath).replace(/\\/g, '/');
            this.recordScanned(relFile);
            for (const ruleId of activeRules)
                this.markRuleEvaluated(ruleId);
            for (const msg of res.messages) {
                if (!msg.ruleId || !msg.ruleId.startsWith('vuejs-accessibility/'))
                    continue;
                this.addViolation({
                    ruleId: mapA11yRuleId(msg.ruleId),
                    severity: 'error',
                    file: relFile,
                    line: msg.line,
                    context: msg.ruleId,
                    message: msg.message
                });
            }
        }
    }
    auditIndexViewport() {
        const indexPath = path.resolve(this.projectRoot, INDEX_HTML_FILE);
        if (!fs.existsSync(indexPath)) {
            this.markRuleNotApplicable('a11y-viewport-zoom-lock', `No existe ${INDEX_HTML_FILE} en la raíz del proyecto`);
            return;
        }
        const content = fs.readFileSync(indexPath, 'utf-8');
        this.recordScanned(INDEX_HTML_FILE);
        this.markRuleEvaluated('a11y-viewport-zoom-lock');
        const viewportMatch = content.match(/<meta\s+name=["']viewport["'][^>]*>/i);
        if (!viewportMatch)
            return;
        const tag = viewportMatch[0];
        const userScalableNo = /user-scalable\s*=\s*(?:no|0)/i.test(tag);
        const maxScaleOne = /maximum-scale\s*=\s*1(?:\.0+)?(?:\b|[,;\s])/i.test(tag);
        if (userScalableNo || maxScaleOne) {
            const lines = content.slice(0, viewportMatch.index).split('\n');
            const lineNum = lines.length;
            this.addViolation({
                ruleId: 'a11y-viewport-zoom-lock',
                severity: 'error',
                file: INDEX_HTML_FILE,
                line: lineNum,
                context: tag.trim(),
                message: 'Meta viewport bloquea el zoom móvil (user-scalable=no o maximum-scale=1.0). Viola WCAG 1.4.4 Resize text.'
            });
        }
    }
    collectVueFiles(dir, collected, seen) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git')
                    continue;
                this.collectVueFiles(fullPath, collected, seen);
            }
            else if (entry.isFile() && entry.name.endsWith('.vue')) {
                if (!seen.has(fullPath)) {
                    seen.add(fullPath);
                    collected.push(fullPath);
                }
            }
        }
    }
}
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateAccessibilityAuditor());
//# sourceMappingURL=validate_accessibility.js.map