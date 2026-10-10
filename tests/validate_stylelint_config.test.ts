/**
 * tests/validate_stylelint_config.test.ts
 *
 * Exhaustive unit tests for ValidateStylelintConfigAuditor conforming to BaseAuditor 5-point contract.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  ValidateStylelintConfigAuditor,
  STYLELINT_CONFIG_RULES,
  REQUIRED_STYLELINT_PLUGIN,
  REQUIRED_STRICT_VALUE_RULE,
  CANONICAL_STRICT_VALUE_CONFIG
} from '../src/suites/architecture/validate_stylelint_config.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import { resetAuditConfig } from '../src/core/auditConfig.ts';

describe('ValidateStylelintConfigAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stylelint-config-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Contract & Metadata Conformance', () => {
    it('fulfills BaseAuditor metadata and construction contracts', () => {
      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      validateAuditorConstruction(auditor);
      expect(auditor.id).toBe('validate_stylelint_config');
      expect(auditor.packageName).toBe('Stylelint');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toEqual(STYLELINT_CONFIG_RULES);
      expect(auditor.ruleDescriptions).toBeDefined();
      expect(Object.keys(auditor.ruleDescriptions!)).toHaveLength(3);
    });
  });

  describe('Clean Path: Valid Stylelint Configuration', () => {
    it('passes cleanly when .stylelintrc.json contains required plugin and strict-value rule', async () => {
      const config = {
        extends: ['stylelint-config-standard'],
        plugins: ['stylelint-order', REQUIRED_STYLELINT_PLUGIN],
        rules: {
          [REQUIRED_STRICT_VALUE_RULE]: CANONICAL_STRICT_VALUE_CONFIG,
          'block-no-empty': true
        }
      };
      await fs.writeFile(path.join(tempDir, '.stylelintrc.json'), JSON.stringify(config, null, 2), 'utf-8');

      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('passes cleanly when .stylelintrc.json extends an auditor config without duplicating plugins or rules', async () => {
      const config = {
        extends: ['./node_modules/@francogp/auditor/.stylelintrc.json'],
        rules: {
          'declaration-block-single-line-max-declarations': null
        }
      };
      await fs.writeFile(path.join(tempDir, '.stylelintrc.json'), JSON.stringify(config, null, 2), 'utf-8');

      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
    });
  });

  describe('Violation Path: 100% Rule ID Verification', () => {
    it('detects missing .stylelintrc.json (stylelint-config-missing)', async () => {
      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === 'stylelint-config-missing');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects missing stylelint-declaration-strict-value plugin (stylelint-config-missing-plugin)', async () => {
      const config = {
        extends: ['stylelint-config-standard'],
        plugins: ['stylelint-order'],
        rules: {
          [REQUIRED_STRICT_VALUE_RULE]: CANONICAL_STRICT_VALUE_CONFIG
        }
      };
      await fs.writeFile(path.join(tempDir, '.stylelintrc.json'), JSON.stringify(config, null, 2), 'utf-8');

      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === 'stylelint-config-missing-plugin');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
      expect(finding?.message).toContain(REQUIRED_STYLELINT_PLUGIN);
    });

    it('detects missing scale-unlimited/declaration-strict-value rule (stylelint-config-missing-strict-value)', async () => {
      const config = {
        extends: ['stylelint-config-standard'],
        plugins: ['stylelint-order', REQUIRED_STYLELINT_PLUGIN],
        rules: {
          'block-no-empty': true
        }
      };
      await fs.writeFile(path.join(tempDir, '.stylelintrc.json'), JSON.stringify(config, null, 2), 'utf-8');

      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === 'stylelint-config-missing-strict-value');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
      expect(finding?.message).toContain(REQUIRED_STRICT_VALUE_RULE);
    });

    it('detects incomplete canonical properties in strict-value rule (stylelint-config-missing-strict-value)', async () => {
      const config = {
        extends: ['stylelint-config-standard'],
        plugins: ['stylelint-order', REQUIRED_STYLELINT_PLUGIN],
        rules: {
          [REQUIRED_STRICT_VALUE_RULE]: [['/color$/', 'font-size']]
        }
      };
      await fs.writeFile(path.join(tempDir, '.stylelintrc.json'), JSON.stringify(config, null, 2), 'utf-8');

      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === 'stylelint-config-missing-strict-value');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
      expect(finding?.message).toContain('z-index');
    });
  });

  describe('Auto-Fix Mode (--fix)', () => {
    it('automatically scaffolds .stylelintrc.json when missing in fix mode', async () => {
      const fixAuditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir, fix: true });
      const result = await fixAuditor.execute();

      expect(result.summary.errors).toBe(0);
      const createdFile = path.join(tempDir, '.stylelintrc.json');
      const exists = await fs.stat(createdFile).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      const content = JSON.parse(await fs.readFile(createdFile, 'utf-8'));
      expect(content.plugins).toContain(REQUIRED_STYLELINT_PLUGIN);
      expect(content.rules[REQUIRED_STRICT_VALUE_RULE]).toBeDefined();
    });

    it('automatically injects missing plugin and rule into existing .stylelintrc.json', async () => {
      const initialConfig = {
        extends: ['stylelint-config-standard'],
        plugins: ['stylelint-order'],
        rules: {
          'block-no-empty': true
        }
      };
      await fs.writeFile(path.join(tempDir, '.stylelintrc.json'), JSON.stringify(initialConfig, null, 2), 'utf-8');

      const fixAuditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir, fix: true });
      await fixAuditor.execute();

      const repaired = JSON.parse(await fs.readFile(path.join(tempDir, '.stylelintrc.json'), 'utf-8'));
      expect(repaired.plugins).toContain(REQUIRED_STYLELINT_PLUGIN);
      expect(repaired.rules[REQUIRED_STRICT_VALUE_RULE]).toBeDefined();

      // Subsequent check should pass cleanly
      const verifyAuditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const verifyResult = await verifyAuditor.execute();
      expect(verifyResult.status).toBe('passed');
      expect(verifyResult.summary.errors).toBe(0);
    });

    it('honors custom strict properties and ignoreValues configured in audit.config.ts in fix and check mode', async () => {
      const auditorConfig = `
export default {
  stylelint: {
    enabled: true,
    strictValues: {
      properties: ['letter-spacing'],
      ignoreValues: {
        'letter-spacing': ['normal'],
        'z-index': ['999']
      }
    }
  }
};
`;
      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), auditorConfig, 'utf-8');

      // Run in fix mode to scaffold/update .stylelintrc.json
      const fixAuditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir, fix: true });
      await fixAuditor.execute();

      const repaired = JSON.parse(await fs.readFile(path.join(tempDir, '.stylelintrc.json'), 'utf-8'));
      const strictRule = repaired.rules[REQUIRED_STRICT_VALUE_RULE];
      expect(strictRule[0]).toContain('letter-spacing');
      expect(strictRule[1].ignoreValues['letter-spacing']).toContain('normal');
      expect(strictRule[1].ignoreValues['z-index']).toContain('999');

      // Subsequent check should pass cleanly
      const verifyAuditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const verifyResult = await verifyAuditor.execute();
      expect(verifyResult.status).toBe('passed');
      expect(verifyResult.summary.errors).toBe(0);
    });
  });
});
