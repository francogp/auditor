import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
enableCompileCache();
export const ESLINT_CONFIG_RULES = [
    'eslint-config-missing',
    'eslint-config-any-allowed',
    'eslint-config-double-cast-allowed',
    'eslint-config-ts-ignore-allowed',
    'eslint-config-legacy-date-allowed'
];
/**
 * Validates that an ESLint configuration file enforces strict /domain-type-first rules.
 */
export function auditEslintConfigContent(content, fileName) {
    const findings = [];
    // 1. @typescript-eslint/no-explicit-any MUST be 'error'
    const hasExplicitAnyError = /['"]@typescript-eslint\/no-explicit-any['"]\s*:\s*['"]error['"]/i.test(content) ||
        /['"]@typescript-eslint\/no-explicit-any['"]\s*:\s*\[\s*['"]error['"]/i.test(content);
    const hasExplicitAnyOffOrWarn = /['"]@typescript-eslint\/no-explicit-any['"]\s*:\s*['"](?:off|warn|0|1)['"]/i.test(content) ||
        /['"]@typescript-eslint\/no-explicit-any['"]\s*:\s*\[\s*['"](?:off|warn|0|1)['"]/i.test(content);
    if (!hasExplicitAnyError || hasExplicitAnyOffOrWarn) {
        findings.push({
            suiteId: 'validate_eslint_config',
            suiteName: 'ESLint Domain-Type-First Configuration Auditor',
            ruleId: 'eslint-config-any-allowed',
            ruleDescription: 'ESLint: Regla no-explicit-any no es error',
            severity: 'error',
            file: fileName,
            line: 1,
            col: 1,
            context: '@typescript-eslint/no-explicit-any',
            message: `La regla '@typescript-eslint/no-explicit-any' debe estar configurada en 'error' para cumplir con /domain-type-first.`
        });
    }
    // 2. @typescript-eslint/ban-ts-comment MUST be 'error'
    const hasBanTsCommentError = /['"]@typescript-eslint\/ban-ts-comment['"]\s*:\s*['"]error['"]/i.test(content) ||
        /['"]@typescript-eslint\/ban-ts-comment['"]\s*:\s*\[\s*['"]error['"]/i.test(content);
    const hasBanTsCommentOffOrWarn = /['"]@typescript-eslint\/ban-ts-comment['"]\s*:\s*['"](?:off|warn|0|1)['"]/i.test(content) ||
        /['"]@typescript-eslint\/ban-ts-comment['"]\s*:\s*\[\s*['"](?:off|warn|0|1)['"]/i.test(content);
    if (!hasBanTsCommentError || hasBanTsCommentOffOrWarn) {
        findings.push({
            suiteId: 'validate_eslint_config',
            suiteName: 'ESLint Domain-Type-First Configuration Auditor',
            ruleId: 'eslint-config-ts-ignore-allowed',
            ruleDescription: 'ESLint: Regla ban-ts-comment no es error',
            severity: 'error',
            file: fileName,
            line: 1,
            col: 1,
            context: '@typescript-eslint/ban-ts-comment',
            message: `La regla '@typescript-eslint/ban-ts-comment' debe estar configurada en 'error' para prohibir supresiones (@ts-ignore) en tipos de dominio.`
        });
    }
    // 3. no-restricted-syntax MUST forbid TSUnknownKeyword (as unknown as)
    const hasDoubleCastBanned = /TSAsExpression\[typeAnnotation\.type=["']TSUnknownKeyword["']\]/i.test(content);
    if (!hasDoubleCastBanned) {
        findings.push({
            suiteId: 'validate_eslint_config',
            suiteName: 'ESLint Domain-Type-First Configuration Auditor',
            ruleId: 'eslint-config-double-cast-allowed',
            ruleDescription: 'ESLint: Falta prohibición de doble casteo',
            severity: 'error',
            file: fileName,
            line: 1,
            col: 1,
            context: 'TSUnknownKeyword',
            message: `Falta la regla 'no-restricted-syntax' prohibiendo el doble casteo ('as ` + `unknown as') con el selector TSAsExpression[typeAnnotation.type="TSUnknownKeyword"].` // type-ok: Sub-auditor diagnostic message
        });
    }
    // 4. no-restricted-syntax MUST forbid legacy new Date() / Date.now()
    const hasDateConstructorBanned = /NewExpression\[callee\.name=["']Date["']\]/i.test(content);
    const hasDateNowBanned = /CallExpression\[callee\.object\.name=["']Date["']\]\[callee\.property\.name=["']now["']\]/i.test(content);
    if (!hasDateConstructorBanned || !hasDateNowBanned) {
        findings.push({
            suiteId: 'validate_eslint_config',
            suiteName: 'ESLint Domain-Type-First Configuration Auditor',
            ruleId: 'eslint-config-legacy-date-allowed',
            ruleDescription: 'ESLint: Falta prohibición de objeto Date',
            severity: 'error',
            file: fileName,
            line: 1,
            col: 1,
            context: 'Date',
            message: `Falta la regla 'no-restricted-syntax' prohibiendo 'new ` + `Date()' y 'Date.` + `now()'. Usa Temporal API (Temporal.Now.instant()).`
        });
    }
    return findings;
}
export class ValidateEslintConfigAuditor extends BaseAuditor {
    configFilePath;
    constructor(options = {}) {
        const effectiveRoot = options.projectRoot ?? process.cwd();
        super({
            capabilities: { lint: true },
            id: 'validate_eslint_config',
            name: 'ESLint Domain-Type-First Configuration Auditor',
            description: 'Valida reglas estrictas de ESLint y /domain-type-first',
            family: 'architecture',
            packageName: 'ESLint',
            icon: '📜',
            ruleIds: ESLINT_CONFIG_RULES,
            ruleDescriptions: {
                'eslint-config-missing': 'Archivo eslint.config.js ausente',
                'eslint-config-any-allowed': 'Regla no-explicit-any no es error',
                'eslint-config-double-cast-allowed': 'Falta prohibición de doble casteo',
                'eslint-config-ts-ignore-allowed': 'Regla ban-ts-comment no es error',
                'eslint-config-legacy-date-allowed': 'Falta prohibición de objeto Date'
            },
            projectRoot: effectiveRoot
        });
        this.configFilePath = options.configFile;
    }
    async runAudit() {
        const config = getAuditConfig(this.projectRoot);
        if (config.stylelint?.enabled === false && config.paths.srcRoots?.length === 0) {
            return;
        }
        const candidateFiles = this.configFilePath
            ? [this.configFilePath]
            : ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts'];
        let resolvedPath = null;
        for (const candidate of candidateFiles) {
            const fullPath = path.resolve(this.projectRoot, candidate);
            if (fs.existsSync(fullPath)) {
                resolvedPath = fullPath;
                break;
            }
        }
        if (!resolvedPath) {
            this.addViolation({
                ruleId: 'eslint-config-missing',
                severity: 'error',
                file: candidateFiles[0] ?? 'eslint.config.js',
                line: 1,
                col: 1,
                context: 'eslint.config.js',
                message: `No se encontró ningún archivo de configuración de ESLint en la raíz del proyecto (${candidateFiles.join(', ')}).`
            });
            return;
        }
        const relFileName = path.relative(this.projectRoot, resolvedPath).replace(/\\/g, '/');
        const content = fs.readFileSync(resolvedPath, 'utf-8');
        const findings = auditEslintConfigContent(content, relFileName);
        for (const finding of findings) {
            this.addViolation({
                ruleId: finding.ruleId ?? 'eslint-config-any-allowed',
                severity: finding.severity,
                file: finding.file ?? relFileName,
                line: finding.line ?? 1,
                col: finding.col,
                context: finding.context ?? relFileName,
                message: finding.message
            });
        }
        this.filesScannedCount = 1;
        this.context.setMetric('ESLint Config Checked', relFileName);
        this.context.setMetric('ESLint Violations', findings.length);
    }
}
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateEslintConfigAuditor());
//# sourceMappingURL=validate_eslint_config.js.map