import { BaseAuditor } from '../../core/auditorBase.ts';
import type { AuditFinding, AuditorConfigFileRequirement } from '../../core/auditContract.ts';
export type EslintConfigRuleId = 'eslint-config-missing' | 'eslint-config-any-allowed' | 'eslint-config-double-cast-allowed' | 'eslint-config-ts-ignore-allowed' | 'eslint-config-legacy-date-allowed';
export declare const ESLINT_CONFIG_RULES: readonly EslintConfigRuleId[];
export declare const CANONICAL_ESLINT_CONFIG_CONTENT = "import js from '@eslint/js';\nimport globals from 'globals';\nimport unusedImports from 'eslint-plugin-unused-imports';\nimport tseslint from 'typescript-eslint';\nimport { globalIgnores } from 'eslint/config';\n\nexport default tseslint.config(\n  js.configs.recommended,\n  ...tseslint.configs.recommended,\n  {\n    name: 'auditor/core-rules',\n    plugins: {\n      'unused-imports': unusedImports,\n    },\n    rules: {\n      // Variables no utilizadas & TypeScript estricto\n      'no-unused-vars': 'off',\n      '@typescript-eslint/no-unused-vars': 'off',\n      '@typescript-eslint/no-explicit-any': 'error',\n      '@typescript-eslint/ban-ts-comment': 'error',\n      '@typescript-eslint/consistent-type-assertions': [\n        'error',\n        {\n          assertionStyle: 'as',\n          objectLiteralTypeAssertions: 'never'\n        }\n      ],\n      'no-restricted-syntax': [\n        'error',\n        {\n          selector: 'TSAsExpression[typeAnnotation.type=\"TSUnknownKeyword\"]',\n          message: 'Est\u00E1 ESTRICTAMENTE PROHIBIDO usar doble casteo (' + 'as unknown as' + '). Usa guardas de tipo, tipado can\u00F3nico o interfaces directas.'\n        },\n        {\n          selector: 'NewExpression[callee.name=\"Date\"]',\n          message: 'El uso de ' + 'new Date()' + ' est\u00E1 ESTRICTAMENTE PROHIBIDO. Usa la API moderna Temporal (Temporal.Now.instant() / Temporal.Instant).'\n        },\n        {\n          selector: 'CallExpression[callee.object.name=\"Date\"][callee.property.name=\"now\"]',\n          message: 'El uso de ' + 'Date.now()' + ' est\u00E1 ESTRICTAMENTE PROHIBIDO. Usa Temporal.Now.instant().epochMilliseconds o performance.now().'\n        }\n      ],\n      'unused-imports/no-unused-imports': 'error',\n      'unused-imports/no-unused-vars': [\n        'warn',\n        {\n          vars: 'all',\n          varsIgnorePattern: '^_',\n          args: 'after-used',\n          argsIgnorePattern: '^_',\n          caughtErrors: 'all',\n          caughtErrorsIgnorePattern: '^_',\n        },\n      ],\n\n      // Calidad general\n      'no-console': 'off',\n      'no-undef': 'off',\n    },\n    languageOptions: {\n      ecmaVersion: 'latest',\n      sourceType: 'module',\n      parserOptions: {\n        parser: tseslint.parser,\n      },\n      globals: {\n        ...globals.node,\n        ...globals.es2025,\n      },\n    },\n  },\n  globalIgnores([\n    'dist/**',\n    'dev-dist/**',\n    'node_modules/**',\n    'scratch/**',\n    'tmp/**',\n    '.agents/**',\n    'tests/**',\n    'vitest.config.ts',\n  ])\n);\n";
export interface EslintConfigAuditOptions {
    readonly projectRoot?: string;
    readonly configFile?: string;
    readonly fix?: boolean;
}
/**
 * Validates that an ESLint configuration file enforces strict /domain-type-first rules.
 */
export declare function auditEslintConfigContent(content: string, fileName: string): AuditFinding[];
export declare function repairEslintConfigContent(content: string): string;
export declare const ESLINT_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<EslintConfigRuleId>;
export declare class ValidateEslintConfigAuditor extends BaseAuditor<EslintConfigRuleId> {
    constructor(options?: EslintConfigAuditOptions);
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_eslint_config.d.ts.map