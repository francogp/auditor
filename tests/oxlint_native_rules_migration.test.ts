/**
 * packages/auditor/tests/oxlint_native_rules_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Native Oxlint Rule Naming (typescript/*)
 *
 * Verifies that:
 * 1. DEFAULT_CANONICAL_LINT_RULES declares native Oxlint rules ('typescript/*').
 * 2. isRuleValueCompliant supports native Oxlint tuple rules (typescript/consistent-type-assertions,
 *    typescript/explicit-function-return-type).
 * 3. ValidateVitePlusConfigAuditor accepts native Oxlint rules (typescript/no-explicit-any,
 *    typescript/ban-ts-comment, typescript/consistent-type-assertions) without complaining.
 */

import { describe, it, expect } from 'vite-plus/test';

import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { isRuleValueCompliant } from '../src/core/viteConfigAst.ts';
import { auditVitePlusConfigContent } from '../src/suites/architecture/validate_vite_plus_config.ts';

describe('Native Oxlint Rules Migration (typescript/*)', () => {
  it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares native Oxlint rules as error', () => {
    expect(DEFAULT_CANONICAL_LINT_RULES['typescript/no-explicit-any']).toBe('error');
    expect(DEFAULT_CANONICAL_LINT_RULES['typescript/ban-ts-comment']).toBe('error');
    expect(DEFAULT_CANONICAL_LINT_RULES['typescript/consistent-type-assertions']).toBeDefined();
    expect(DEFAULT_CANONICAL_LINT_RULES['typescript/no-floating-promises']).toBe('error');
  });

  it('CANARY: isRuleValueCompliant validates native Oxlint tuple rules', () => {
    expect(
      isRuleValueCompliant('typescript/consistent-type-assertions', [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }
      ])
    ).toBe(true);

    expect(
      isRuleValueCompliant('typescript/consistent-type-assertions', [
        'error',
        { assertionStyle: 'angle-bracket' }
      ])
    ).toBe(false);

    expect(
      isRuleValueCompliant('typescript/explicit-function-return-type', [
        'error',
        { allowExpressions: true }
      ])
    ).toBe(true);

    expect(
      isRuleValueCompliant('typescript/explicit-function-return-type', [
        'error',
        { allowExpressions: false }
      ])
    ).toBe(false);
  });

  it('CANARY: auditVitePlusConfigContent accepts vite.config.ts with native typescript/* rules', () => {
    const configWithNativeOxlint = `
import { defineConfig } from 'vite-plus';
export default defineConfig({
  lint: {
    plugins: ['vitest', 'node', 'promise', 'unicorn', 'typescript', 'vue', 'import', 'jsx-a11y'],
    options: { typeAware: true, typeCheck: true },
    rules: {
      'typescript/no-explicit-any': 'error',
      'typescript/ban-ts-comment': 'error',
      'typescript/consistent-type-assertions': ['error', { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }],
      'typescript/no-floating-promises': 'error',
      'typescript/explicit-function-return-type': ['error', { allowExpressions: true }],
      'typescript/explicit-member-accessibility': ['error', { accessibility: 'explicit' }],
      'no-unused-vars': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }],
      'eqeqeq': ['error', 'always'],
      'unicorn/prefer-node-protocol': 'error'
    }
  }
});
`;

    const findings = auditVitePlusConfigContent(configWithNativeOxlint, 'vite.config.ts');
    const antiCastrationFindings = findings.filter(
      (f) =>
        f.context?.includes('no-explicit-any') ||
        f.context?.includes('ban-ts-comment') ||
        f.context?.includes('consistent-type-assertions') ||
        f.context?.includes('no-floating-promises')
    );

    expect(antiCastrationFindings).toHaveLength(0);
  });
});
