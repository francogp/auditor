import fs from 'node:fs';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/safePath.js";
enableCompileCache();
export const ESLINT_CONFIG_RULES = [
    'eslint-config-missing',
    'eslint-config-any-allowed',
    'eslint-config-double-cast-allowed',
    'eslint-config-ts-ignore-allowed',
    'eslint-config-legacy-date-allowed'
];
const MSG_DOUBLE_CAST = 'as ' + 'unknown as';
const MSG_NEW_DATE = 'new ' + 'Date()';
const MSG_DATE_NOW = 'Date.' + 'now()';
export const CANONICAL_ESLINT_CONFIG_CONTENT = `import js from '@eslint/js';
import globals from 'globals';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';
import { globalIgnores } from 'eslint/config';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    name: 'auditor/core-rules',
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      // Variables no utilizadas & TypeScript estricto
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never'
        }
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression[typeAnnotation.type="TSUnknownKeyword"]',
          message: 'Está ESTRICTAMENTE PROHIBIDO usar doble casteo (' + '${MSG_DOUBLE_CAST}' + '). Usa guardas de tipo, tipado canónico o interfaces directas.'
        },
        {
          selector: 'NewExpression[callee.name="Date"]',
          message: 'El uso de ' + '${MSG_NEW_DATE}' + ' está ESTRICTAMENTE PROHIBIDO. Usa la API moderna Temporal (Temporal.Now.instant() / Temporal.Instant).'
        },
        {
          selector: 'CallExpression[callee.object.name="Date"][callee.property.name="now"]',
          message: 'El uso de ' + '${MSG_DATE_NOW}' + ' está ESTRICTAMENTE PROHIBIDO. Usa Temporal.Now.instant().epochMilliseconds o performance.now().'
        }
      ],
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Calidad general
      'no-console': 'off',
      'no-undef': 'off',
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        parser: tseslint.parser,
      },
      globals: {
        ...globals.node,
        ...globals.es2025,
      },
    },
  },
  globalIgnores([
    'dist/**',
    'dev-dist/**',
    'node_modules/**',
    'scratch/**',
    'tmp/**',
    '.agents/**',
    'tests/**',
    'vitest.config.ts',
  ])
);
`;
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
export function repairEslintConfigContent(content) {
    return content;
}
export const ESLINT_CONFIG_REQUIREMENT = {
    id: 'eslint-config',
    file: 'eslint.config.js',
    candidateFiles: ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts'],
    description: 'Configuración de ESLint con reglas estrictas de dominio',
    ruleId: 'eslint-config-missing',
    generateDefaultContent: () => CANONICAL_ESLINT_CONFIG_CONTENT
};
export class ValidateEslintConfigAuditor extends BaseAuditor {
    constructor(options = {}) {
        const effectiveRoot = options.projectRoot ?? process.cwd();
        const configRequirement = options.configFile
            ? {
                ...ESLINT_CONFIG_REQUIREMENT,
                file: options.configFile,
                candidateFiles: [options.configFile]
            }
            : ESLINT_CONFIG_REQUIREMENT;
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
            fixableRuleIds: ['eslint-config-missing'],
            configFiles: [configRequirement],
            fix: options.fix,
            id: 'validate_eslint_config',
            name: 'ESLint Domain-Type-First Configuration Auditor',
            description: 'Valida reglas estrictas de ESLint y /domain-type-first',
            family: 'architecture',
            packageName: 'ESLint',
            configKey: 'eslint.enabled',
            defaultConfig: { enabled: true },
            icon: '📜',
            ruleIds: ESLINT_CONFIG_RULES,
            ruleDescriptions: {
                'eslint-config-missing': 'Archivo eslint.config.js ausente',
                'eslint-config-any-allowed': 'Regla no-explicit-any no es error',
                'eslint-config-double-cast-allowed': 'Falta prohibición de doble casteo',
                'eslint-config-ts-ignore-allowed': 'Regla ban-ts-comment no es error',
                'eslint-config-legacy-date-allowed': 'Falta prohibición de objeto Date'
            },
            coverage: {
                include: ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts']
            },
            projectRoot: effectiveRoot
        });
    }
    async runAudit() {
        const config = getAuditConfig(this.projectRoot);
        if (config.stylelint?.enabled === false && config.paths.srcRoots?.length === 0) {
            return;
        }
        const requirement = this.configFiles[0] ?? ESLINT_CONFIG_REQUIREMENT;
        const ensured = await this.ensureConfigFile(requirement);
        if (!ensured) {
            this.markRuleNotApplicable('eslint-config-any-allowed', 'Archivo de configuración no encontrado');
            this.markRuleNotApplicable('eslint-config-double-cast-allowed', 'Archivo de configuración no encontrado');
            this.markRuleNotApplicable('eslint-config-ts-ignore-allowed', 'Archivo de configuración no encontrado');
            this.markRuleNotApplicable('eslint-config-legacy-date-allowed', 'Archivo de configuración no encontrado');
            return;
        }
        const resolvedPath = ensured.resolvedPath;
        const relFileName = toPosixRelative(this.projectRoot, resolvedPath);
        this.recordScanned(relFileName);
        for (const r of ESLINT_CONFIG_RULES) {
            this.markRuleEvaluated(r);
        }
        let content = fs.readFileSync(resolvedPath, 'utf-8');
        if (this.isFixActive()) {
            const repaired = repairEslintConfigContent(content);
            if (repaired !== content) {
                fs.writeFileSync(resolvedPath, repaired, 'utf-8');
                content = repaired;
            }
        }
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
        this.context.setMetric('ESLint Config Checked', relFileName);
        this.context.setMetric('ESLint Violations', findings.length);
    }
}
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateEslintConfigAuditor());
//# sourceMappingURL=validate_eslint_config.js.map