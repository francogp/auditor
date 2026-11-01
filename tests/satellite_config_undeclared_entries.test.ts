/**
 * tests/satellite_config_undeclared_entries.test.ts
 *
 * Hermetic unit tests verifying SSoT satellite config sovereignty:
 * Guarantees that undeclared exemptions, patterns, and dependencies in satellite
 * configuration files (.fallowrc.json, .stylelintrc.json) trigger blocking errors (*-undeclared-config-entry)
 * without automated destructive purging (Zero Manual Fix Booleans Mandate / Contract-Driven Protocol).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { resetAuditConfig } from '../src/core/auditConfig.ts';
import { ValidateFallowConfigAuditor } from '../src/suites/architecture/validate_fallow_config.ts';
import {
  ValidateHtmlValidateConfigAuditor,
  CANONICAL_HTML_VALIDATE_CONFIG
} from '../src/suites/architecture/validate_html_validate_config.ts';
import { ValidateStylelintConfigAuditor } from '../src/suites/architecture/validate_stylelint_config.ts';
import { ValidateTsconfigAuditor } from '../src/suites/architecture/validate_tsconfig.ts';
import { ValidateVitePlusConfigAuditor } from '../src/suites/architecture/validate_vite_plus_config.ts';
import {
  ValidateMarkdownLintConfigAuditor,
  CANONICAL_MARKDOWNLINT_CONFIG
} from '../src/suites/documentation/validate_markdown_lint_config.ts';

describe('SSoT Sovereignty: Satellite Config Undeclared Entries Detection', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-ssot-test-'));
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function scaffoldAuditConfig(extraConfig: string = ''): void {
    const auditorDir = path.join(tempDir, '.auditor');
    fs.mkdirSync(auditorDir, { recursive: true });
    const content = `
export default {
  paths: {
    srcRoots: ['src'],
    testRoots: ['tests'],
    ignoreGlobs: ['scratch/**']
  },
  fallow: {
    enabled: true,
    ignoreGlobs: ['custom-allowed/**'],
    ignoreDependencies: ['allowed-fallow-dep', 'allowed-pkg-dep']
  },
  packageHygiene: {
    enabled: true,
    ignoreDependencies: ['allowed-pkg-dep']
  },
  stylelint: {
    enabled: true,
    strictValues: {
      properties: ['custom-allowed-prop']
    }
  }
  ${extraConfig}
};
`;
    fs.writeFileSync(path.join(auditorDir, 'audit.config.ts'), content, 'utf-8');
  }

  describe('Fallow (.fallowrc.json) Undeclared Entries', () => {
    it('passes cleanly when .fallowrc.json only contains authorized patterns and dependencies', async () => {
      scaffoldAuditConfig();
      const fallowConfig = {
        $schema: 'https://fallow.tools/schema/config.json',
        entry: ['src/index.ts'],
        ignorePatterns: ['scratch/**', 'custom-allowed/**'],
        ignoreDependencies: ['allowed-fallow-dep', 'allowed-pkg-dep']
      };
      fs.writeFileSync(
        path.join(tempDir, '.fallowrc.json'),
        JSON.stringify(fallowConfig, null, 2),
        'utf-8'
      );

      const auditor = new ValidateFallowConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const undeclaredViolations = result.findings.filter(
        (f) => f.ruleId === 'fallow-undeclared-config-entry'
      );
      expect(undeclaredViolations).toHaveLength(0);
    });

    it('emits blocking fallow-undeclared-config-entry when an undeclared ignore pattern is added', async () => {
      scaffoldAuditConfig();
      const fallowConfig = {
        $schema: 'https://fallow.tools/schema/config.json',
        entry: ['src/index.ts'],
        ignorePatterns: ['scratch/**', 'src/secret/unauthorized/**']
      };
      fs.writeFileSync(
        path.join(tempDir, '.fallowrc.json'),
        JSON.stringify(fallowConfig, null, 2),
        'utf-8'
      );

      const auditor = new ValidateFallowConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const undeclaredViolations = result.findings.filter(
        (f) => f.ruleId === 'fallow-undeclared-config-entry'
      );
      expect(undeclaredViolations).toHaveLength(1);
      expect(undeclaredViolations[0]?.severity).toBe('error');
      expect(undeclaredViolations[0]?.message).toContain(
        "Undeclared ignore pattern 'src/secret/unauthorized/**' in .fallowrc.json"
      );
      expect(undeclaredViolations[0]?.message).toContain('fallow.ignoreGlobs');
      // Must not be fixable (contract-driven: no ruleFixer)
      expect(undeclaredViolations[0]?.fixable).toBe(false);
    });

    it('emits blocking fallow-undeclared-config-entry when an undeclared dependency is exempted', async () => {
      scaffoldAuditConfig();
      const fallowConfig = {
        $schema: 'https://fallow.tools/schema/config.json',
        entry: ['src/index.ts'],
        ignoreDependencies: ['unauthorized-ghost-lib']
      };
      fs.writeFileSync(
        path.join(tempDir, '.fallowrc.json'),
        JSON.stringify(fallowConfig, null, 2),
        'utf-8'
      );

      const auditor = new ValidateFallowConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const undeclaredViolations = result.findings.filter(
        (f) => f.ruleId === 'fallow-undeclared-config-entry'
      );
      expect(undeclaredViolations).toHaveLength(1);
      expect(undeclaredViolations[0]?.severity).toBe('error');
      expect(undeclaredViolations[0]?.message).toContain(
        "Undeclared dependency exemption 'unauthorized-ghost-lib' in .fallowrc.json"
      );
    });

    it('flags dependency exemption in .fallowrc.json if only declared in packageHygiene (strict domain separation)', async () => {
      scaffoldAuditConfig();
      const fallowConfig = {
        $schema: 'https://fallow.tools/schema/config.json',
        entry: ['src/index.ts'],
        ignoreDependencies: ['allowed-pkg-dep']
      };
      // scaffold has allowed-pkg-dep under packageHygiene, but in scaffold fallow only has allowed-fallow-dep
      // Wait, scaffoldAuditConfig currently has allowed-pkg-dep in fallow too. Let's make sure it's distinct.
      fs.writeFileSync(
        path.join(tempDir, '.fallowrc.json'),
        JSON.stringify(fallowConfig, null, 2),
        'utf-8'
      );

      // Re-scaffold with allowed-pkg-dep only in packageHygiene:
      const auditorDir = path.join(tempDir, '.auditor');
      const content = `
export default {
  paths: {
    srcRoots: ['src'],
    testRoots: ['tests'],
    ignoreGlobs: ['scratch/**']
  },
  fallow: {
    enabled: true,
    ignoreGlobs: ['custom-allowed/**'],
    ignoreDependencies: ['allowed-fallow-dep']
  },
  packageHygiene: {
    enabled: true,
    ignoreDependencies: ['allowed-pkg-dep']
  }
};
`;
      fs.writeFileSync(path.join(auditorDir, 'audit.config.ts'), content, 'utf-8');

      const auditor = new ValidateFallowConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const undeclaredViolations = result.findings.filter(
        (f) => f.ruleId === 'fallow-undeclared-config-entry'
      );
      expect(undeclaredViolations).toHaveLength(1);
      expect(undeclaredViolations[0]?.message).toContain(
        "Undeclared dependency exemption 'allowed-pkg-dep' in .fallowrc.json"
      );
      expect(undeclaredViolations[0]?.message).toContain('fallow.ignoreDependencies');
    });

    it('does NOT purge undeclared entries in auto-fix mode, preserving noisy blocking error', async () => {
      scaffoldAuditConfig();
      const fallowConfig = {
        $schema: 'https://fallow.tools/schema/config.json',
        entry: ['src/index.ts'],
        ignorePatterns: ['unauthorized-pattern/**']
      };
      const filePath = path.join(tempDir, '.fallowrc.json');
      fs.writeFileSync(filePath, JSON.stringify(fallowConfig, null, 2), 'utf-8');

      const auditor = new ValidateFallowConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.fix();

      // File must still have the undeclared pattern (non-destructive)
      const afterRaw = fs.readFileSync(filePath, 'utf-8');
      expect(afterRaw).toContain('unauthorized-pattern/**');

      // Violation must still be reported
      const violations = result.findings.filter(
        (f) => f.ruleId === 'fallow-undeclared-config-entry'
      );
      expect(violations).toHaveLength(1);
    });
  });

  describe('Stylelint (.stylelintrc.json) Undeclared Entries', () => {
    it('passes cleanly when extending canonical auditor config', async () => {
      scaffoldAuditConfig();
      const stylelintConfig = {
        $schema: 'https://json.schemastore.org/stylelintrc',
        extends: ['./node_modules/@francogp/auditor/.stylelintrc.json']
      };
      fs.writeFileSync(
        path.join(tempDir, '.stylelintrc.json'),
        JSON.stringify(stylelintConfig, null, 2),
        'utf-8'
      );

      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const violations = result.findings.filter(
        (f) => f.ruleId === 'stylelint-undeclared-config-entry'
      );
      expect(violations).toHaveLength(0);
    });

    it('detects undeclared strict properties in standalone .stylelintrc.json', async () => {
      scaffoldAuditConfig();
      const stylelintConfig = {
        $schema: 'https://json.schemastore.org/stylelintrc',
        plugins: ['stylelint-declaration-strict-value', 'stylelint-order'],
        rules: {
          'order/order': [
            'dollar-variables',
            'custom-properties',
            { type: 'at-rule', name: 'include', hasBlock: false },
            'declarations',
            { type: 'at-rule', name: 'include', hasBlock: true },
            { type: 'rule', selector: '^&:\\w' },
            'rules'
          ],
          'scale-unlimited/declaration-strict-value': [
            [
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
              'transition-timing-function',
              'custom-unauthorized-prop'
            ]
          ]
        }
      };
      fs.writeFileSync(
        path.join(tempDir, '.stylelintrc.json'),
        JSON.stringify(stylelintConfig, null, 2),
        'utf-8'
      );

      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const violations = result.findings.filter(
        (f) => f.ruleId === 'stylelint-undeclared-config-entry'
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]?.message).toContain(
        "Undeclared strict property 'custom-unauthorized-prop' in .stylelintrc.json"
      );
      expect(violations[0]?.fixable).toBe(false);
    });

    it('detects unauthorized ignoreFiles in .stylelintrc.json', async () => {
      scaffoldAuditConfig();
      const stylelintConfig = {
        $schema: 'https://json.schemastore.org/stylelintrc',
        extends: ['./node_modules/@francogp/auditor/.stylelintrc.json'],
        ignoreFiles: ['unauthorized-style-ignore/**']
      };
      fs.writeFileSync(
        path.join(tempDir, '.stylelintrc.json'),
        JSON.stringify(stylelintConfig, null, 2),
        'utf-8'
      );

      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const violations = result.findings.filter(
        (f) => f.ruleId === 'stylelint-undeclared-config-entry'
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]?.message).toContain(
        "Undeclared ignore pattern 'unauthorized-style-ignore/**' in ignoreFiles"
      );
    });

    it('detects unauthorized strict properties in extending .stylelintrc.json', async () => {
      scaffoldAuditConfig();
      const stylelintConfig = {
        $schema: 'https://json.schemastore.org/stylelintrc',
        extends: ['./node_modules/@francogp/auditor/.stylelintrc.json'],
        rules: {
          'scale-unlimited/declaration-strict-value': [['font-size', 'unauthorized-extending-prop']]
        }
      };
      fs.writeFileSync(
        path.join(tempDir, '.stylelintrc.json'),
        JSON.stringify(stylelintConfig, null, 2),
        'utf-8'
      );

      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const violations = result.findings.filter(
        (f) => f.ruleId === 'stylelint-undeclared-config-entry'
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]?.message).toContain(
        "Undeclared strict property 'unauthorized-extending-prop' in .stylelintrc.json"
      );
    });
  });

  describe('TypeScript (tsconfig.json) Undeclared Entries', () => {
    it('detects unauthorized excludes in tsconfig.json', async () => {
      scaffoldAuditConfig();
      const tsconfig = {
        compilerOptions: { strict: true },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist', 'unauthorized-exclude/**']
      };
      fs.writeFileSync(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify(tsconfig, null, 2),
        'utf-8'
      );

      const auditor = new ValidateTsconfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const violations = result.findings.filter(
        (f) => f.ruleId === 'tsconfig-undeclared-config-entry'
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]?.message).toContain('unauthorized-exclude/**');
    });
  });

  describe('Vite+ (vite.config.ts) Undeclared Entries', () => {
    it('detects unauthorized extra lint/fmt ignore patterns in vite.config.ts', async () => {
      scaffoldAuditConfig();
      const viteConfig = `
import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    ignorePatterns: ['unauthorized-lint-pattern/**']
  }
});
`;
      fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), viteConfig, 'utf-8');

      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const violations = result.findings.filter(
        (f) => f.ruleId === 'vite-plus-undeclared-config-entry'
      );
      expect(violations.length).toBeGreaterThanOrEqual(1);
      expect(violations.some((v) => v.message.includes('unauthorized-lint-pattern/**'))).toBe(true);
    });

    it('detects unauthorized test.coverage.exclude patterns in vite.config.ts', async () => {
      scaffoldAuditConfig();
      const viteConfig = `
import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['unauthorized-coverage-exclude/**']
    }
  }
});
`;
      fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), viteConfig, 'utf-8');

      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const violations = result.findings.filter(
        (f) => f.ruleId === 'vite-plus-undeclared-config-entry'
      );
      expect(violations.length).toBeGreaterThanOrEqual(1);
      expect(violations.some((v) => v.message.includes('unauthorized-coverage-exclude/**'))).toBe(
        true
      );
    });
  });

  describe('HTML-Validate (.htmlvalidate.json) Undeclared Entries', () => {
    it('detects unauthorized custom rules in .htmlvalidate.json', async () => {
      scaffoldAuditConfig();
      const htmlValidateConfig = {
        ...CANONICAL_HTML_VALIDATE_CONFIG,
        rules: {
          ...CANONICAL_HTML_VALIDATE_CONFIG.rules,
          'unauthorized-rule-name': 'off'
        }
      };
      fs.writeFileSync(
        path.join(tempDir, '.htmlvalidate.json'),
        JSON.stringify(htmlValidateConfig, null, 2),
        'utf-8'
      );

      const auditor = new ValidateHtmlValidateConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const violations = result.findings.filter(
        (f) => f.ruleId === 'html-validate-undeclared-config-entry'
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]?.context).toBe('unauthorized-rule-name');
    });

    it('detects unauthorized disabled canonical rules in .htmlvalidate.json', async () => {
      scaffoldAuditConfig();
      const htmlValidateConfig = {
        ...CANONICAL_HTML_VALIDATE_CONFIG,
        rules: {
          ...CANONICAL_HTML_VALIDATE_CONFIG.rules,
          'no-deprecated-attr': 'off'
        }
      };
      fs.writeFileSync(
        path.join(tempDir, '.htmlvalidate.json'),
        JSON.stringify(htmlValidateConfig, null, 2),
        'utf-8'
      );

      const auditor = new ValidateHtmlValidateConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const violations = result.findings.filter(
        (f) => f.ruleId === 'html-validate-undeclared-config-entry'
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]?.context).toBe('no-deprecated-attr');
      expect(violations[0]?.message).toContain('Unauthorized disabled rule "no-deprecated-attr"');
    });
  });

  describe('Markdownlint (.markdownlint.json) Undeclared Entries', () => {
    it('detects unauthorized disabled rules in .markdownlint.json', async () => {
      scaffoldAuditConfig();
      const markdownlintConfig = {
        ...CANONICAL_MARKDOWNLINT_CONFIG,
        MD041: false
      };
      fs.writeFileSync(
        path.join(tempDir, '.markdownlint.json'),
        JSON.stringify(markdownlintConfig, null, 2),
        'utf-8'
      );

      const auditor = new ValidateMarkdownLintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const violations = result.findings.filter(
        (f) => f.ruleId === 'markdownlint-undeclared-config-entry'
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]?.context).toBe('MD041');
    });

    it('allows $schema property in .markdownlint.json without flagging undeclared entry', async () => {
      scaffoldAuditConfig();
      const markdownlintConfig = {
        $schema: 'https://json.schemastore.org/markdownlint.json',
        ...CANONICAL_MARKDOWNLINT_CONFIG
      };
      fs.writeFileSync(
        path.join(tempDir, '.markdownlint.json'),
        JSON.stringify(markdownlintConfig, null, 2),
        'utf-8'
      );

      const auditor = new ValidateMarkdownLintConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const violations = result.findings.filter(
        (f) => f.ruleId === 'markdownlint-undeclared-config-entry'
      );
      expect(violations).toHaveLength(0);
    });
  });
});
