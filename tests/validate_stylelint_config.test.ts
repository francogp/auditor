/**
 * tests/validate_stylelint_config.test.ts
 *
 * Exhaustive unit and integrity tests for ValidateStylelintConfigAuditor conforming to BaseAuditor 5-point contract.
 * Enforces the 13 canonical design token properties across constants, configuration, violation detection, and auto-fix.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  ValidateStylelintConfigAuditor,
  STYLELINT_CONFIG_RULES,
  REQUIRED_STYLELINT_PLUGIN,
  REQUIRED_ORDER_PLUGIN,
  REQUIRED_STRICT_VALUE_RULE,
  REQUIRED_ORDER_RULE,
  REQUIRED_STRICT_PROPERTIES,
  CANONICAL_IGNORE_VALUES,
  CANONICAL_STRICT_VALUE_CONFIG,
  CANONICAL_ORDER_CONFIG,
  validateOrderHasBlockPartitioning
} from '../src/suites/architecture/validate_stylelint_config.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import { resetAuditConfig } from '../src/core/auditConfig.ts';

const EXPECTED_CANONICAL_13_PROPERTIES: readonly string[] = [
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
      expect(Object.keys(auditor.ruleDescriptions!)).toHaveLength(4);
    });

    it('enforces exact 13 canonical design token properties in REQUIRED_STRICT_PROPERTIES', () => {
      expect(REQUIRED_STRICT_PROPERTIES).toHaveLength(13);
      expect([...REQUIRED_STRICT_PROPERTIES]).toEqual(EXPECTED_CANONICAL_13_PROPERTIES);
    });

    it('declares all 13 canonical properties in criticalConfig.requiredMinimums', () => {
      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      expect(auditor.criticalConfig).toBeDefined();
      expect(auditor.criticalConfig?.rationale).toContain('Exigir variables SCSS ($var) o CSS');
      const criticalProps = auditor.criticalConfig?.requiredMinimums?.['strictValues.properties'];
      expect(criticalProps).toBeDefined();
      expect(criticalProps).toHaveLength(13);
      expect(criticalProps).toEqual(expect.arrayContaining([...EXPECTED_CANONICAL_13_PROPERTIES]));
    });

    it('declares dedicated ignoreValues hash entries for all 13 canonical properties', () => {
      for (const prop of EXPECTED_CANONICAL_13_PROPERTIES) {
        expect(CANONICAL_IGNORE_VALUES[prop]).toBeDefined();
        expect(Array.isArray(CANONICAL_IGNORE_VALUES[prop])).toBe(true);
      }
    });

    it('ensures root .stylelintrc.json in repository enforces all 13 canonical properties', async () => {
      const repoRootConfigPath = path.resolve(process.cwd(), '.stylelintrc.json');
      const raw = await fs.readFile(repoRootConfigPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const strictRule = parsed.rules[REQUIRED_STRICT_VALUE_RULE];
      expect(strictRule).toBeDefined();
      expect(Array.isArray(strictRule)).toBe(true);
      expect(Array.isArray(strictRule[0])).toBe(true);
      expect(strictRule[0]).toHaveLength(13);
      expect(strictRule[0]).toEqual(EXPECTED_CANONICAL_13_PROPERTIES);
    });
  });

  describe('Clean Path: Valid Stylelint Configuration', () => {
    it('passes cleanly when .stylelintrc.json contains required plugin and strict-value rule with all 13 properties', async () => {
      const config = {
        extends: ['stylelint-config-standard'],
        plugins: ['stylelint-order', REQUIRED_STYLELINT_PLUGIN],
        rules: {
          [REQUIRED_STRICT_VALUE_RULE]: CANONICAL_STRICT_VALUE_CONFIG,
          [REQUIRED_ORDER_RULE]: CANONICAL_ORDER_CONFIG,
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

  describe('Violation Path: 100% Rule ID & Exhaustive Property Verification', () => {
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

    it('detects multiple missing canonical properties (PokeBorrador regression scenario)', async () => {
      // Configuration with only 3 properties (missing the other 10)
      const config = {
        extends: ['stylelint-config-standard'],
        plugins: ['stylelint-order', REQUIRED_STYLELINT_PLUGIN],
        rules: {
          [REQUIRED_STRICT_VALUE_RULE]: [['/color$/', 'font-size', 'z-index']]
        }
      };
      await fs.writeFile(path.join(tempDir, '.stylelintrc.json'), JSON.stringify(config, null, 2), 'utf-8');

      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === 'stylelint-config-missing-strict-value');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
      expect(finding?.message).toContain('box-shadow');
      expect(finding?.message).toContain('border-radius');
      expect(finding?.message).toContain('font-family');
      expect(finding?.message).toContain('transition-duration');
      expect(finding?.message).toContain('animation-duration');
      expect(finding?.message).toContain('gap');
      expect(finding?.message).toContain('row-gap');
      expect(finding?.message).toContain('column-gap');
      expect(finding?.message).toContain('font-weight');
      expect(finding?.message).toContain('transition-timing-function');
    });

    describe.each(EXPECTED_CANONICAL_13_PROPERTIES)(
      'Parametric Integrity Check: Omitting property "%s"',
      (omittedProp) => {
        it(`fails when "${omittedProp}" is missing from strict-value configuration`, async () => {
          const subset = EXPECTED_CANONICAL_13_PROPERTIES.filter(p => p !== omittedProp);
          const config = {
            extends: ['stylelint-config-standard'],
            plugins: ['stylelint-order', REQUIRED_STYLELINT_PLUGIN],
            rules: {
              [REQUIRED_STRICT_VALUE_RULE]: [subset]
            }
          };
          await fs.writeFile(path.join(tempDir, '.stylelintrc.json'), JSON.stringify(config, null, 2), 'utf-8');

          const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
          const result = await auditor.execute();

          expect(result.status).toBe('failed');
          const finding = result.findings.find(f => f.ruleId === 'stylelint-config-missing-strict-value');
          expect(finding).toBeDefined();
          expect(finding?.severity).toBe('error');
          expect(finding?.message).toContain(omittedProp);
        });
      }
    );

    it('detects missing order/order rule (stylelint-config-missing-order)', async () => {
      const config = {
        extends: ['stylelint-config-standard'],
        plugins: ['stylelint-order', REQUIRED_STYLELINT_PLUGIN],
        rules: {
          [REQUIRED_STRICT_VALUE_RULE]: CANONICAL_STRICT_VALUE_CONFIG
        }
      };
      await fs.writeFile(path.join(tempDir, '.stylelintrc.json'), JSON.stringify(config, null, 2), 'utf-8');

      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === 'stylelint-config-missing-order');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
      expect(finding?.message).toContain(REQUIRED_ORDER_RULE);
    });

    it('detects order/order missing blockless @include (hasBlock: false)', async () => {
      const config = {
        extends: ['stylelint-config-standard'],
        plugins: ['stylelint-order', REQUIRED_STYLELINT_PLUGIN],
        rules: {
          [REQUIRED_STRICT_VALUE_RULE]: CANONICAL_STRICT_VALUE_CONFIG,
          [REQUIRED_ORDER_RULE]: [
            'declarations',
            { type: 'at-rule', name: 'include', hasBlock: true }
          ]
        }
      };
      await fs.writeFile(path.join(tempDir, '.stylelintrc.json'), JSON.stringify(config, null, 2), 'utf-8');

      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === 'stylelint-config-missing-order');
      expect(finding).toBeDefined();
      expect(finding?.message).toContain('hasBlock: false');
    });

    it('detects order/order missing block @include (hasBlock: true)', async () => {
      const config = {
        extends: ['stylelint-config-standard'],
        plugins: ['stylelint-order', REQUIRED_STYLELINT_PLUGIN],
        rules: {
          [REQUIRED_STRICT_VALUE_RULE]: CANONICAL_STRICT_VALUE_CONFIG,
          [REQUIRED_ORDER_RULE]: [
            { type: 'at-rule', name: 'include', hasBlock: false },
            'declarations'
          ]
        }
      };
      await fs.writeFile(path.join(tempDir, '.stylelintrc.json'), JSON.stringify(config, null, 2), 'utf-8');

      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === 'stylelint-config-missing-order');
      expect(finding).toBeDefined();
      expect(finding?.message).toContain('hasBlock: true');
    });

    it('detects inverted order where hasBlock: false is placed after declarations', async () => {
      const config = {
        extends: ['stylelint-config-standard'],
        plugins: ['stylelint-order', REQUIRED_STYLELINT_PLUGIN],
        rules: {
          [REQUIRED_STRICT_VALUE_RULE]: CANONICAL_STRICT_VALUE_CONFIG,
          [REQUIRED_ORDER_RULE]: [
            'declarations',
            { type: 'at-rule', name: 'include', hasBlock: false },
            { type: 'at-rule', name: 'include', hasBlock: true }
          ]
        }
      };
      await fs.writeFile(path.join(tempDir, '.stylelintrc.json'), JSON.stringify(config, null, 2), 'utf-8');

      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === 'stylelint-config-missing-order');
      expect(finding).toBeDefined();
      expect(finding?.message).toContain('ANTES de "declarations"');
    });

    it('detects inverted order where hasBlock: true is placed before declarations', async () => {
      const config = {
        extends: ['stylelint-config-standard'],
        plugins: ['stylelint-order', REQUIRED_STYLELINT_PLUGIN],
        rules: {
          [REQUIRED_STRICT_VALUE_RULE]: CANONICAL_STRICT_VALUE_CONFIG,
          [REQUIRED_ORDER_RULE]: [
            { type: 'at-rule', name: 'include', hasBlock: false },
            { type: 'at-rule', name: 'include', hasBlock: true },
            'declarations'
          ]
        }
      };
      await fs.writeFile(path.join(tempDir, '.stylelintrc.json'), JSON.stringify(config, null, 2), 'utf-8');

      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === 'stylelint-config-missing-order');
      expect(finding).toBeDefined();
      expect(finding?.message).toContain('DESPUÉS de "declarations"');
    });

    it('validates helper validateOrderHasBlockPartitioning with granular checks', () => {
      expect(validateOrderHasBlockPartitioning(null).valid).toBe(false);
      expect(validateOrderHasBlockPartitioning([]).valid).toBe(false);
      expect(validateOrderHasBlockPartitioning(['declarations']).valid).toBe(false);
      expect(validateOrderHasBlockPartitioning(CANONICAL_ORDER_CONFIG).valid).toBe(true);
    });
  });

  describe('Auto-Fix Mode (--fix)', () => {
    it('automatically scaffolds .stylelintrc.json with all 13 canonical properties when missing in fix mode', async () => {
      const fixAuditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir, fix: true });
      const result = await fixAuditor.execute();

      expect(result.summary.errors).toBe(0);
      const createdFile = path.join(tempDir, '.stylelintrc.json');
      const exists = await fs.stat(createdFile).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      const content = JSON.parse(await fs.readFile(createdFile, 'utf-8'));
      expect(content.plugins).toContain(REQUIRED_STYLELINT_PLUGIN);
      const strictRule = content.rules[REQUIRED_STRICT_VALUE_RULE];
      expect(strictRule).toBeDefined();
      expect(strictRule[0]).toHaveLength(13);
      expect(strictRule[0]).toEqual(EXPECTED_CANONICAL_13_PROPERTIES);
    });

    it('automatically re-injects all 13 canonical properties when repairing an incomplete .stylelintrc.json', async () => {
      const initialConfig = {
        extends: ['stylelint-config-standard'],
        plugins: ['stylelint-order'],
        rules: {
          [REQUIRED_STRICT_VALUE_RULE]: [['/color$/', 'font-size', 'z-index']],
          'block-no-empty': true
        }
      };
      await fs.writeFile(path.join(tempDir, '.stylelintrc.json'), JSON.stringify(initialConfig, null, 2), 'utf-8');

      const fixAuditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir, fix: true });
      await fixAuditor.execute();

      const repaired = JSON.parse(await fs.readFile(path.join(tempDir, '.stylelintrc.json'), 'utf-8'));
      expect(repaired.plugins).toContain(REQUIRED_STYLELINT_PLUGIN);
      const strictRule = repaired.rules[REQUIRED_STRICT_VALUE_RULE];
      expect(strictRule[0]).toHaveLength(13);
      expect(strictRule[0]).toEqual(EXPECTED_CANONICAL_13_PROPERTIES);

      // Subsequent check must pass cleanly
      const verifyAuditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const verifyResult = await verifyAuditor.execute();
      expect(verifyResult.status).toBe('passed');
      expect(verifyResult.summary.errors).toBe(0);
    });

    it('honors custom additive properties and ignoreValues configured in audit.config.ts preserving all 13 canonicals', async () => {
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
      
      // All 13 canonicals must be present
      for (const canonical of EXPECTED_CANONICAL_13_PROPERTIES) {
        expect(strictRule[0]).toContain(canonical);
      }
      // Plus the user-added custom property
      expect(strictRule[0]).toContain('letter-spacing');
      expect(strictRule[0]).toHaveLength(14);
      expect(strictRule[1].ignoreValues['letter-spacing']).toContain('normal');
      expect(strictRule[1].ignoreValues['z-index']).toContain('999');

      // Subsequent check should pass cleanly
      const verifyAuditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const verifyResult = await verifyAuditor.execute();
      expect(verifyResult.status).toBe('passed');
      expect(verifyResult.summary.errors).toBe(0);
    });

    it('fails loudly when .stylelintrc.json attempts to omit mandatory canonical minimum properties even if custom config tried to restrict them', async () => {
      const auditorConfig = `
export default {
  stylelint: {
    enabled: true,
    strictValues: {
      properties: ['z-index']
    }
  }
};
`;
      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), auditorConfig, 'utf-8');

      const config = {
        extends: ['stylelint-config-standard'],
        plugins: ['stylelint-order', REQUIRED_STYLELINT_PLUGIN],
        rules: {
          [REQUIRED_STRICT_VALUE_RULE]: [['z-index']]
        }
      };
      await fs.writeFile(path.join(tempDir, '.stylelintrc.json'), JSON.stringify(config, null, 2), 'utf-8');

      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === 'stylelint-config-missing-strict-value');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
      expect(finding?.message).toContain('/color$/');
      expect(finding?.message).toContain('font-size');
      expect(finding?.message).toContain('box-shadow');
      expect(finding?.message).toContain('border-radius');
    });

    it('automatically repairs missing order/order and missing stylelint-order plugin in fix mode', async () => {
      const initialConfig = {
        extends: ['stylelint-config-standard'],
        plugins: [REQUIRED_STYLELINT_PLUGIN],
        rules: {
          [REQUIRED_STRICT_VALUE_RULE]: CANONICAL_STRICT_VALUE_CONFIG
        }
      };
      await fs.writeFile(path.join(tempDir, '.stylelintrc.json'), JSON.stringify(initialConfig, null, 2), 'utf-8');

      const fixAuditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir, fix: true });
      const fixResult = await fixAuditor.execute();
      expect(fixResult.summary.errors).toBe(0);

      const repaired = JSON.parse(await fs.readFile(path.join(tempDir, '.stylelintrc.json'), 'utf-8'));
      expect(repaired.plugins).toContain(REQUIRED_ORDER_PLUGIN);
      expect(repaired.plugins).toContain(REQUIRED_STYLELINT_PLUGIN);
      expect(repaired.rules[REQUIRED_ORDER_RULE]).toBeDefined();
      expect(validateOrderHasBlockPartitioning(repaired.rules[REQUIRED_ORDER_RULE]).valid).toBe(true);

      const verifyAuditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const verifyResult = await verifyAuditor.execute();
      expect(verifyResult.status).toBe('passed');
      expect(verifyResult.summary.errors).toBe(0);
    });

    it('marks stylelint-config-missing-order as not applicable when order.enforceHasBlockPartitioning is false', async () => {
      const auditorConfig = `
export default {
  stylelint: {
    enabled: true,
    order: {
      enforceHasBlockPartitioning: false
    }
  }
};
`;
      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), auditorConfig, 'utf-8');

      const config = {
        extends: ['stylelint-config-standard'],
        plugins: ['stylelint-order', REQUIRED_STYLELINT_PLUGIN],
        rules: {
          [REQUIRED_STRICT_VALUE_RULE]: CANONICAL_STRICT_VALUE_CONFIG
        }
      };
      await fs.writeFile(path.join(tempDir, '.stylelintrc.json'), JSON.stringify(config, null, 2), 'utf-8');

      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.status).toBe('passed');
      expect(result.summary.errors).toBe(0);
    });
  });
});
