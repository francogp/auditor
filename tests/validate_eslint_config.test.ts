import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  ValidateEslintConfigAuditor,
  auditEslintConfigContent,
  ESLINT_CONFIG_RULES
} from '../src/suites/architecture/validate_eslint_config.ts';

describe('ValidateEslintConfigAuditor & auditEslintConfigContent', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Metadata & Rules Contract', () => {
    it('declares all expected canonical rules', () => {
      const auditor = new ValidateEslintConfigAuditor({ projectRoot: tempDir });
      expect(auditor.id).toBe('validate_eslint_config');
      expect(auditor.ruleIds).toEqual(ESLINT_CONFIG_RULES);
      expect(auditor.capabilities.lint).toBe(true);
    });
  });

  describe('Violation Detection', () => {
    it('flags eslint-config-any-allowed when no-explicit-any is missing or off', () => {
      const configContent = `
        export default [
          {
            rules: {
              '@typescript-eslint/no-explicit-any': 'off',
              '@typescript-eslint/ban-ts-comment': 'error',
              'no-restricted-syntax': [
                'error',
                { selector: 'TSAsExpression[typeAnnotation.type="TSUnknownKeyword"]' },
                { selector: 'NewExpression[callee.name="Date"]' },
                { selector: 'CallExpression[callee.object.name="Date"][callee.property.name="now"]' }
              ]
            }
          }
        ];
      `;
      const findings = auditEslintConfigContent(configContent, 'eslint.config.js');
      expect(findings.some(f => f.ruleId === 'eslint-config-any-allowed')).toBe(true);
    });

    it('flags eslint-config-ts-ignore-allowed when ban-ts-comment is missing', () => {
      const configContent = `
        export default [
          {
            rules: {
              '@typescript-eslint/no-explicit-any': 'error',
              'no-restricted-syntax': [
                'error',
                { selector: 'TSAsExpression[typeAnnotation.type="TSUnknownKeyword"]' },
                { selector: 'NewExpression[callee.name="Date"]' },
                { selector: 'CallExpression[callee.object.name="Date"][callee.property.name="now"]' }
              ]
            }
          }
        ];
      `;
      const findings = auditEslintConfigContent(configContent, 'eslint.config.js');
      expect(findings.some(f => f.ruleId === 'eslint-config-ts-ignore-allowed')).toBe(true);
    });

    it('flags eslint-config-double-cast-allowed when as unknown as is not restricted', () => {
      const configContent = `
        export default [
          {
            rules: {
              '@typescript-eslint/no-explicit-any': 'error',
              '@typescript-eslint/ban-ts-comment': 'error',
              'no-restricted-syntax': [
                'error',
                { selector: 'NewExpression[callee.name="Date"]' },
                { selector: 'CallExpression[callee.object.name="Date"][callee.property.name="now"]' }
              ]
            }
          }
        ];
      `;
      const findings = auditEslintConfigContent(configContent, 'eslint.config.js');
      expect(findings.some(f => f.ruleId === 'eslint-config-double-cast-allowed')).toBe(true);
    });

    it('flags eslint-config-legacy-date-allowed when Date is not restricted', () => {
      const configContent = `
        export default [
          {
            rules: {
              '@typescript-eslint/no-explicit-any': 'error',
              '@typescript-eslint/ban-ts-comment': 'error',
              'no-restricted-syntax': [
                'error',
                { selector: 'TSAsExpression[typeAnnotation.type="TSUnknownKeyword"]' }
              ]
            }
          }
        ];
      `;
      const findings = auditEslintConfigContent(configContent, 'eslint.config.js');
      expect(findings.some(f => f.ruleId === 'eslint-config-legacy-date-allowed')).toBe(true);
    });

    it('flags eslint-config-missing when no config file exists on disk', async () => {
      const auditor = new ValidateEslintConfigAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(1);
      expect(result.findings[0]?.ruleId).toBe('eslint-config-missing');
      expect(result.status).toBe('failed');
    });
  });

  describe('Clean Path Verification (StandardAuditResult)', () => {
    it('executes cleanly with 0 errors on compliant eslint.config.js', async () => {
      const validConfig = `
        import js from '@eslint/js';
        import tseslint from 'typescript-eslint';

        export default tseslint.config({
          rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/ban-ts-comment': 'error',
            'no-restricted-syntax': [
              'error',
              {
                selector: 'TSAsExpression[typeAnnotation.type="TSUnknownKeyword"]',
                message: 'No double casting'
              },
              {
                selector: 'NewExpression[callee.name="Date"]',
                message: 'No new Date()'
              },
              {
                selector: 'CallExpression[callee.object.name="Date"][callee.property.name="now"]',
                message: 'No Date.now()'
              }
            ]
          }
        });
      `;
      fs.writeFileSync(path.join(tempDir, 'eslint.config.js'), validConfig);

      const auditor = new ValidateEslintConfigAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});
