import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { getAuditConfig, defineAuditConfig, setAuditConfig } from '../src/core/auditConfig.ts';
import {
  buildCanonicalVitePlusConfig,
  resolveAuditConfigIgnoreGlobs,
  syncViteConfigWithAuditConfig,
  cleanLegacyConfigFiles
} from '../src/core/vitePlusConfigSync.ts';
import {
  ValidateVitePlusConfigAuditor,
  auditVitePlusConfigContent,
  VITE_PLUS_CONFIG_RULES
} from '../src/suites/architecture/validate_vite_plus_config.ts';

describe('ValidateVitePlusConfigAuditor (12 Canary Matrix)', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-plus-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Metadata & Rules Contract', () => {
    it('declares all expected canonical rules', () => {
      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir });
      expect(auditor.id).toBe('validate_vite_plus_config');
      expect(auditor.ruleIds).toEqual(VITE_PLUS_CONFIG_RULES);
      expect(auditor.capabilities.speed).toBe('light');
      expect(auditor.capabilities.fix).not.toBe('none');
    });

    it('verifies rule descriptions and remediations for all 5 canonical rules', () => {
      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir });
      expect(VITE_PLUS_CONFIG_RULES).toHaveLength(5);
      for (const rule of VITE_PLUS_CONFIG_RULES) {
        expect(auditor.ruleDescriptions[rule]).toBeDefined();
        expect(auditor.ruleRemediations[rule]).toBeDefined();
        expect(`Vite+: ${auditor.ruleDescriptions[rule]}`.length).toBeLessThanOrEqual(50);
      }
    });

    it('C-CFG-00: flags vite-plus-config-core and fails when vite.config.ts is absent', async () => {
      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.status).toBe('failed');
      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.findings.some((f) => f.ruleId === 'vite-plus-config-core')).toBe(true);
    });
  });

  describe('Anti-Castration Canaries (C-CFG-01 to C-CFG-05)', () => {
    const buildBaseConfigWithRule = (ruleKey: string, ruleVal: string) => `
      import { defineConfig } from 'vite-plus';
      export default defineConfig({
        lint: {
          rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/ban-ts-comment': 'error',
            '@typescript-eslint/consistent-type-assertions': [
              'error',
              { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }
            ],
            '@typescript-eslint/no-floating-promises': 'error',
            '@francogp/domain-type/no-double-cast-unknown': 'error',
            '@francogp/domain-type/no-legacy-date': 'error',
            'unicorn/prefer-node-protocol': 'error',
            'no-debugger': 'error',
            'no-else-return': 'error',
            'no-empty': ['error', { allowEmptyCatch: false }],
            'max-depth': ['error', 4],
            'import/no-duplicates': 'error',
            '${ruleKey}': '${ruleVal}'
          }
        },
        fmt: { singleQuote: true, sortImports: true, sortPackageJson: true },
        staged: { '**/*': 'vp check' },
        test: { environment: 'node' }
      });
    `;

    it('C-CFG-01: flags vite-plus-config-lint when no-explicit-any is off', () => {
      const content = buildBaseConfigWithRule('@typescript-eslint/no-explicit-any', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-02: flags vite-plus-config-lint when ban-ts-comment is off', () => {
      const content = buildBaseConfigWithRule('@typescript-eslint/ban-ts-comment', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-03: flags vite-plus-config-lint when consistent-type-assertions is off', () => {
      const content = buildBaseConfigWithRule(
        '@typescript-eslint/consistent-type-assertions',
        'off'
      );
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-04: flags vite-plus-config-lint when no-double-cast-unknown is off', () => {
      const content = buildBaseConfigWithRule(
        '@francogp/domain-type/no-double-cast-unknown',
        'off'
      );
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-05: flags vite-plus-config-lint when no-legacy-date is off', () => {
      const content = buildBaseConfigWithRule('@francogp/domain-type/no-legacy-date', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-20: flags vite-plus-config-lint when no-debugger is off', () => {
      const content = buildBaseConfigWithRule('no-debugger', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-21: flags vite-plus-config-lint when unicorn/prefer-node-protocol is off', () => {
      const content = buildBaseConfigWithRule('unicorn/prefer-node-protocol', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-22: flags vite-plus-config-lint when @typescript-eslint/no-floating-promises is off', () => {
      const content = buildBaseConfigWithRule('@typescript-eslint/no-floating-promises', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-24: flags vite-plus-config-lint when no-empty is off', () => {
      const content = buildBaseConfigWithRule('no-empty', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-25: flags vite-plus-config-lint when max-depth is off', () => {
      const content = buildBaseConfigWithRule('max-depth', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-26: flags vite-plus-config-lint when eqeqeq is off or not always', () => {
      const content = buildBaseConfigWithRule('eqeqeq', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-27: flags vite-plus-config-lint when prefer-const is off', () => {
      const content = buildBaseConfigWithRule('prefer-const', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-28: flags vite-plus-config-lint when no-var is off', () => {
      const content = buildBaseConfigWithRule('no-var', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-29: flags vite-plus-config-lint when no-self-compare is off', () => {
      const content = buildBaseConfigWithRule('no-self-compare', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-30: flags vite-plus-config-lint when no-eval is off', () => {
      const content = buildBaseConfigWithRule('no-eval', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-31: flags vite-plus-config-lint when vue/no-async-in-computed-properties is off', () => {
      const content = buildBaseConfigWithRule('vue/no-async-in-computed-properties', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-32: flags vite-plus-config-lint when vue/no-side-effects-in-computed-properties is off', () => {
      const content = buildBaseConfigWithRule('vue/no-side-effects-in-computed-properties', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-33: flags vite-plus-config-lint when vue/no-export-in-script-setup is off', () => {
      const content = buildBaseConfigWithRule('vue/no-export-in-script-setup', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-34: flags vite-plus-config-lint when vue/no-lifecycle-after-await is off', () => {
      const content = buildBaseConfigWithRule('vue/no-lifecycle-after-await', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-35: flags vite-plus-config-lint when vue/no-watch-after-await is off', () => {
      const content = buildBaseConfigWithRule('vue/no-watch-after-await', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-36: flags vite-plus-config-lint when vue/prefer-import-from-vue is off', () => {
      const content = buildBaseConfigWithRule('vue/prefer-import-from-vue', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-37: flags vite-plus-config-lint when vitest/no-identical-title is off', () => {
      const content = buildBaseConfigWithRule('vitest/no-identical-title', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-38: flags vite-plus-config-lint when vitest/no-focused-tests is off', () => {
      const content = buildBaseConfigWithRule('vitest/no-focused-tests', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-39: flags vite-plus-config-lint when vitest/no-disabled-tests is off', () => {
      const content = buildBaseConfigWithRule('vitest/no-disabled-tests', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-40: flags vite-plus-config-lint when vitest/prefer-to-have-length is off', () => {
      const content = buildBaseConfigWithRule('vitest/prefer-to-have-length', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-41: flags vite-plus-config-lint when vitest/valid-title is off', () => {
      const content = buildBaseConfigWithRule('vitest/valid-title', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-42: flags vite-plus-config-lint when import/no-self-import is off', () => {
      const content = buildBaseConfigWithRule('import/no-self-import', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-43: flags vite-plus-config-lint when import/no-empty-named-blocks is off', () => {
      const content = buildBaseConfigWithRule('import/no-empty-named-blocks', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-44: flags vite-plus-config-lint when no-useless-catch is off', () => {
      const content = buildBaseConfigWithRule('no-useless-catch', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-45: flags vite-plus-config-lint when no-useless-rename is off', () => {
      const content = buildBaseConfigWithRule('no-useless-rename', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-46: flags vite-plus-config-lint when no-sparse-arrays is off', () => {
      const content = buildBaseConfigWithRule('no-sparse-arrays', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-47: flags vite-plus-config-lint when no-shadow-restricted-names is off', () => {
      const content = buildBaseConfigWithRule('no-shadow-restricted-names', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-48: flags vite-plus-config-lint when unicorn/prefer-string-starts-ends-with is off', () => {
      const content = buildBaseConfigWithRule('unicorn/prefer-string-starts-ends-with', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-49: flags vite-plus-config-lint when unicorn/throw-new-error is off', () => {
      const content = buildBaseConfigWithRule('unicorn/throw-new-error', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-50: flags vite-plus-config-lint when unicorn/no-useless-spread is off', () => {
      const content = buildBaseConfigWithRule('unicorn/no-useless-spread', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-23: flags vite-plus-config-fmt when fmt lacks sortImports', () => {
      const content = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: { rules: {} },
          fmt: { singleQuote: true, sortPackageJson: true },
          staged: { '**/*': 'vp check' },
          test: { environment: 'node' }
        });
      `;
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-fmt')).toBe(true);
    });
  });

  describe('Sections & Legacy Files Canaries (C-CFG-06 to C-CFG-09)', () => {
    it('C-CFG-06: flags vite-plus-config-fmt when fmt section is absent', () => {
      const content = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: { rules: {} },
          staged: { '**/*': 'vp check' },
          test: { environment: 'node' }
        });
      `;
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-fmt')).toBe(true);
    });

    it('C-CFG-07: flags vite-plus-config-core when staged section is absent', () => {
      const content = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: { rules: {} },
          fmt: { singleQuote: true },
          test: { environment: 'node' }
        });
      `;
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-core')).toBe(true);
    });

    it('C-CFG-08: flags vite-plus-config-core when test section is absent', () => {
      const content = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: { rules: {} },
          fmt: { singleQuote: true },
          staged: { '**/*': 'vp check' }
        });
      `;
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-core')).toBe(true);
    });

    it('C-CFG-09: flags vite-plus-config-core when legacy configs exist', async () => {
      fs.writeFileSync(path.join(tempDir, 'eslint.config.js'), 'export default [];');
      fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), 'export default {};');

      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.findings.some((f) => f.ruleId === 'vite-plus-config-core')).toBe(true);
    });
  });

  describe('Clean Path & Auto-Fix Canaries (C-CFG-10 and C-CFG-11)', () => {
    it('C-CFG-10: executes cleanly with 0 errors on 100% compliant canonical config', async () => {
      const canonicalConfig = buildCanonicalVitePlusConfig(getAuditConfig(tempDir));
      fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), canonicalConfig);

      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('C-CFG-11: auto-fix repairs missing vite.config.ts and purges legacy configs', async () => {
      fs.writeFileSync(path.join(tempDir, 'eslint.config.js'), 'export default [];');
      fs.writeFileSync(path.join(tempDir, '.nvmrc'), '26.11.1\n');

      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir, fix: true });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
      expect(fs.existsSync(path.join(tempDir, 'vite.config.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'eslint.config.js'))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, '.node-version'))).toBe(true);
    });

    it('C-CFG-12: resolves audit config ignore globs (SSoT) and synchronizes them to vite.config.ts', () => {
      const mockAuditConfig = defineAuditConfig({
        name: 'SSoT Ignore Globs Test Project',
        paths: {
          ignoreGlobs: ['supabase/**', 'custom-folder/**'],
          ignoredDirs: ['build-cache', 'temp_data'],
          includeTestsInCodeAudit: false,
          testRoots: ['tests', 'test_aventura/tests'],
          e2eRoots: ['e2e']
        }
      });

      fs.writeFileSync(
        path.join(tempDir, 'eslint.config.js'),
        "export default [{ ignores: ['legacy_legacy/**'] }];"
      );

      const globs = resolveAuditConfigIgnoreGlobs(mockAuditConfig, 'lint', tempDir);

      expect(globs).toContain('supabase/**');
      expect(globs).toContain('custom-folder/**');
      expect(globs).toContain('build-cache/**');
      expect(globs).toContain('temp_data/**');
      expect(globs).toContain('tests/**');
      expect(globs).toContain('test_aventura/tests/**');
      expect(globs).toContain('e2e/**');
      expect(globs).toContain('legacy_legacy/**');
      expect(globs).toContain('**/*.test.ts');
      expect(globs).toContain('dist/**');

      // Test synchronization with existing vite.config.ts
      const initialViteConfig = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: {
            rules: {
              '@typescript-eslint/no-explicit-any': 'error',
              '@typescript-eslint/ban-ts-comment': 'error',
              '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }],
              '@francogp/domain-type/no-double-cast-unknown': 'error',
              '@francogp/domain-type/no-legacy-date': 'error'
            }
          },
          fmt: { singleQuote: true },
          staged: { '**/*': 'vp check' },
          test: { environment: 'node' }
        });
      `;
      fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), initialViteConfig);

      setAuditConfig(mockAuditConfig, tempDir);

      syncViteConfigWithAuditConfig(tempDir);

      const synced = fs.readFileSync(path.join(tempDir, 'vite.config.ts'), 'utf-8');
      expect(synced).toContain('ignorePatterns: [');
      expect(synced).toContain("'supabase/**'");
      expect(synced).toContain("'tests/**'");
      expect(synced).toContain("'build-cache/**'");
    });

    it('C-CFG-13: flags vite-plus-config-lint when domain-type jsPlugins is absent', () => {
      const content = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: { rules: {} },
          fmt: {},
          staged: {},
          test: {}
        });
      `;
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-14: flags vite-plus-config-lint when options typeAware is absent in lint', () => {
      const content = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: { rules: {} },
          fmt: {},
          staged: {},
          test: {}
        });
      `;
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-lint')).toBe(true);
    });

    it('C-CFG-15: flags vite-plus-config-ts when audit ignore globs are not in vite config', () => {
      const config = defineAuditConfig({
        name: 'Ignore Test',
        paths: { ignoreGlobs: ['supabase/**', 'custom-folder/**'] }
      });
      const content = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: { rules: {}, ignorePatterns: ['other/**'] },
          fmt: { ignorePatterns: ['other/**'] },
          staged: {},
          test: {}
        });
      `;
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts', config, tempDir);
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-ts')).toBe(true);
    });

    it('C-CFG-16: flags vite-plus-config-ts when testRoots are not in test.include', () => {
      const config = defineAuditConfig({
        name: 'TestRoots Test',
        paths: { testRoots: ['custom_tests', 'spec_tests'] }
      });
      const content = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: { rules: {} },
          fmt: {},
          staged: {},
          test: { include: ['tests/**'] }
        });
      `;
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts', config);
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-ts')).toBe(true);
    });

    it('C-CFG-17: auto-fix repairs all missing SSoT configs and achieves 0 errors', async () => {
      const mockAuditConfig = defineAuditConfig({
        name: 'Full Sync Test',
        domain: { enabled: true },
        paths: {
          ignoreGlobs: ['supabase/**', 'generated/**'],
          testRoots: ['custom_tests']
        }
      });
      setAuditConfig(mockAuditConfig, tempDir);

      const bareConfig = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: {
            rules: {
              '@typescript-eslint/no-explicit-any': 'error',
              '@typescript-eslint/ban-ts-comment': 'error',
              '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }],
              '@francogp/domain-type/no-double-cast-unknown': 'error',
              '@francogp/domain-type/no-legacy-date': 'error'
            }
          },
          fmt: { singleQuote: true },
          staged: { '**/*': 'vp check' },
          test: { environment: 'node' }
        });
      `;
      fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), bareConfig);

      // Run with fix: true
      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir, fix: true });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');

      const synced = fs.readFileSync(path.join(tempDir, 'vite.config.ts'), 'utf-8');
      expect(synced).toContain('@francogp/auditor/domain-type-plugin');
      expect(synced).toContain('typeAware: true');
      expect(synced).toContain("'supabase/**'");
      expect(synced).toContain("'generated/**'");
      expect(synced).toContain("'unicorn/prefer-node-protocol'");
      expect(synced).toContain("'no-debugger'");
      expect(synced).toContain("'no-empty'");
      expect(synced).toContain("'max-depth'");
      expect(synced).toContain("'eqeqeq'");
      expect(synced).toContain("'prefer-const'");
      expect(synced).toContain("'no-var'");
      expect(synced).toContain("'no-self-compare'");
      expect(synced).toContain("'no-eval'");
      expect(synced).toContain("'vue/no-async-in-computed-properties'");
      expect(synced).toContain("'vitest/no-identical-title'");
      expect(synced).toContain("'import/no-self-import'");
      expect(synced).toContain("'no-useless-catch'");
      expect(synced).toContain("'unicorn/prefer-string-starts-ends-with'");
      expect(synced).toContain('sortImports: true');
    });

    it('C-CFG-18: seamlessly injects missing blocks into function-style defineConfig(({ mode }) => { return { ... }; })', async () => {
      const functionStyleConfig = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig(({ mode }) => {
          return {
            plugins: [],
            build: { outDir: 'dist' }
          };
        });
      `;
      fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), functionStyleConfig);

      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir, fix: true });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');

      const synced = fs.readFileSync(path.join(tempDir, 'vite.config.ts'), 'utf-8');
      expect(synced).not.toContain('};,');
      expect(synced).toContain('lint: {');
      expect(synced).toContain('fmt: {');
      expect(synced).toContain('test: {');
      expect(synced).toContain('staged: {');
      expect(synced).toContain('return {');
    });

    it('C-CFG-19: cleanLegacyConfigFiles honors Migration-First gate and never deletes configs prematurely', () => {
      const vitestPath = path.join(tempDir, 'vitest.config.ts');
      const eslintPath = path.join(tempDir, 'eslint.config.js');
      const tsdownPath = path.join(tempDir, 'tsdown.config.ts');
      fs.writeFileSync(vitestPath, 'export default {};');
      fs.writeFileSync(eslintPath, 'export default [];');
      fs.writeFileSync(tsdownPath, 'export default {};');

      // 1. When vite.config.ts is absent: NOTHING should be deleted
      let purged = cleanLegacyConfigFiles(tempDir);
      expect(purged).toEqual([]);
      expect(fs.existsSync(vitestPath)).toBe(true);
      expect(fs.existsSync(eslintPath)).toBe(true);
      expect(fs.existsSync(tsdownPath)).toBe(true);

      // 2. When vite.config.ts has only 'lint:', vitest and tsdown must NOT be deleted
      const partialVite = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: { rules: {} }
        });
      `;
      fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), partialVite);
      purged = cleanLegacyConfigFiles(tempDir);
      expect(purged).toContain('eslint.config.js');
      expect(fs.existsSync(eslintPath)).toBe(false);
      expect(fs.existsSync(vitestPath)).toBe(true);
      expect(fs.existsSync(tsdownPath)).toBe(true);

      // 3. When vite.config.ts has 'test:' and 'pack:', they can now be purged safely
      const fullVite = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: { rules: {} },
          test: { environment: 'node' },
          pack: { entry: ['src/index.ts'] }
        });
      `;
      fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), fullVite);
      purged = cleanLegacyConfigFiles(tempDir);
      expect(purged).toContain('vitest.config.ts');
      expect(purged).toContain('tsdown.config.ts');
      expect(fs.existsSync(vitestPath)).toBe(false);
      expect(fs.existsSync(tsdownPath)).toBe(false);
    });

    it('C-CFG-20: resolves coverage degradations, coverage exempt globs, and dataRoots into ignorePatterns', () => {
      const mockAuditConfig = defineAuditConfig({
        name: 'Exemption Globs Test',
        paths: {
          dataRoots: ['data', 'fixtures'],
          demoRoots: ['demo']
        },
        coverage: {
          acknowledgedDegradations: [
            { policy: 'scripts', glob: 'scripts/**', reason: 'Maintenance scripts' }
          ],
          exemptGlobs: [{ glob: 'src/generated/**', reason: 'Auto-generated files' }]
        },
        testCoverage: {
          exemptGlobs: ['src/legacy/**']
        }
      });

      const globs = resolveAuditConfigIgnoreGlobs(mockAuditConfig, 'lint', tempDir);

      expect(globs).toContain('scripts/**');
      expect(globs).toContain('src/generated/**');
      expect(globs).toContain('src/legacy/**');
      expect(globs).toContain('data/**');
      expect(globs).toContain('fixtures/**');
      expect(globs).toContain('demo/**');
    });

    it('C-CFG-21: synchronizes custom vitePlusConfig.lint.rules (e.g. no-record-string-key: off) to vite.config.ts', () => {
      const mockAuditConfig = defineAuditConfig({
        name: 'Custom Lint Rules Test',
        vitePlusConfig: {
          lint: {
            rules: {
              '@francogp/domain-type/no-record-string-key': 'off',
              'no-console': 'warn'
            }
          }
        }
      });

      const initialViteConfig = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: {
            rules: {
              '@typescript-eslint/no-explicit-any': 'error',
              '@francogp/domain-type/no-record-string-key': 'error'
            }
          }
        });
      `;
      fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), initialViteConfig);
      setAuditConfig(mockAuditConfig, tempDir);

      syncViteConfigWithAuditConfig(tempDir);

      const synced = fs.readFileSync(path.join(tempDir, 'vite.config.ts'), 'utf-8');
      expect(synced).toContain("'@francogp/domain-type/no-record-string-key': 'off'");
      expect(synced).toContain("'no-console': 'warn'");
    });

    it('C-CFG-22: synchronizes vitePlusConfig.lint.overrides to vite.config.ts', () => {
      const mockAuditConfig = defineAuditConfig({
        name: 'Lint Overrides Test',
        vitePlusConfig: {
          lint: {
            overrides: [
              {
                files: ['scripts/**', 'data/**'],
                rules: {
                  '@francogp/domain-type/no-record-string-key': 'off'
                }
              }
            ]
          }
        }
      });

      const initialViteConfig = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: {
            rules: {
              '@typescript-eslint/no-explicit-any': 'error'
            }
          }
        });
      `;
      fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), initialViteConfig);
      setAuditConfig(mockAuditConfig, tempDir);

      syncViteConfigWithAuditConfig(tempDir);

      const synced = fs.readFileSync(path.join(tempDir, 'vite.config.ts'), 'utf-8');
      expect(synced).toContain('overrides: [');
      expect(synced).toContain('scripts/**');
      expect(synced).toContain('data/**');
      expect(synced).toContain("'@francogp/domain-type/no-record-string-key': 'off'");
    });

    it('C-CFG-52: CANARY: flags missing Java-like TypeScript strictness rules', () => {
      const content = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: {
            rules: {
              '@typescript-eslint/no-unnecessary-type-assertion': 'off',
              '@typescript-eslint/consistent-indexed-object-style': 'warn'
            }
          }
        });
      `;
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(
        findings.some(
          (f) =>
            f.ruleId === 'vite-plus-config-lint' &&
            f.context === '@typescript-eslint/no-unnecessary-type-assertion'
        )
      ).toBe(true);
      expect(
        findings.some(
          (f) =>
            f.ruleId === 'vite-plus-config-lint' &&
            f.context === '@typescript-eslint/consistent-indexed-object-style'
        )
      ).toBe(true);
      expect(
        findings.some(
          (f) =>
            f.ruleId === 'vite-plus-config-lint' &&
            f.context === '@typescript-eslint/no-empty-object-type'
        )
      ).toBe(true);
    });

    it('C-CFG-53: CANARY: flags missing immutability and execution safety rules', () => {
      const content = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: {
            rules: {
              'import/no-mutable-exports': 'off',
              'no-proto': 'off',
              'unicorn/no-new-buffer': 'warn'
            }
          }
        });
      `;
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(
        findings.some(
          (f) => f.ruleId === 'vite-plus-config-lint' && f.context === 'import/no-mutable-exports'
        )
      ).toBe(true);
      expect(
        findings.some((f) => f.ruleId === 'vite-plus-config-lint' && f.context === 'no-proto')
      ).toBe(true);
      expect(
        findings.some(
          (f) => f.ruleId === 'vite-plus-config-lint' && f.context === 'unicorn/no-new-buffer'
        )
      ).toBe(true);
      expect(
        findings.some(
          (f) => f.ruleId === 'vite-plus-config-lint' && f.context === 'no-implied-eval'
        )
      ).toBe(true);
    });

    it('C-CFG-54: CANARY: flags missing Vitest determinism and Vue SFC rules', () => {
      const content = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: {
            rules: {
              'vitest/no-test-prefixes': 'off',
              'vue/no-import-compiler-macros': 'warn'
            }
          }
        });
      `;
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(
        findings.some(
          (f) => f.ruleId === 'vite-plus-config-lint' && f.context === 'vitest/no-test-prefixes'
        )
      ).toBe(true);
      expect(
        findings.some(
          (f) =>
            f.ruleId === 'vite-plus-config-lint' && f.context === 'vue/no-import-compiler-macros'
        )
      ).toBe(true);
      expect(
        findings.some(
          (f) => f.ruleId === 'vite-plus-config-lint' && f.context === 'vitest/prefer-to-contain'
        )
      ).toBe(true);
      expect(
        findings.some(
          (f) => f.ruleId === 'vite-plus-config-lint' && f.context === 'vue/no-expose-after-await'
        )
      ).toBe(true);
    });

    it('C-CFG-55: CANARY: auto-fix injects all Java-like strictness rules into bare config', () => {
      const bareConfig = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: {
            rules: {}
          }
        });
      `;
      fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), bareConfig);

      syncViteConfigWithAuditConfig(tempDir);

      const synced = fs.readFileSync(path.join(tempDir, 'vite.config.ts'), 'utf-8');
      expect(synced).toContain("'@typescript-eslint/no-unnecessary-type-assertion': 'error'");
      expect(synced).toContain("'import/no-mutable-exports': 'error'");
      expect(synced).toContain("'unicorn/no-new-buffer': 'error'");
      expect(synced).toContain("'vitest/no-test-prefixes': 'error'");
      expect(synced).toContain("'vue/no-import-compiler-macros': 'error'");
      expect(synced).toContain("'default-case-last': 'error'");
      expect(synced).toContain("'prefer-object-has-own': 'error'");
    });

    it('C-CFG-56: CANARY: 100% of declared rules have descriptions and remediations <= 50 chars', () => {
      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir });
      expect(VITE_PLUS_CONFIG_RULES).toHaveLength(5);

      for (const ruleId of VITE_PLUS_CONFIG_RULES) {
        expect(auditor.ruleDescriptions[ruleId]).toBeDefined();
        expect(auditor.ruleDescriptions[ruleId]!.length).toBeGreaterThan(0);
        // Formatted description: "Vite+: <desc>" <= 50 chars
        expect(`Vite+: ${auditor.ruleDescriptions[ruleId]}`.length).toBeLessThanOrEqual(50);

        expect(auditor.ruleRemediations[ruleId]).toBeDefined();
        expect(auditor.ruleRemediations[ruleId]!.length).toBeGreaterThan(10);
      }
    });

    it('C-CFG-57: flags vite-plus-config-pack in libraries when pack is missing or incomplete', () => {
      const configNoPack = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({});
      `;
      const libraryAuditConfig = {
        packageDistribution: { enabled: true }
      } as any;

      const findingsNoPack = auditVitePlusConfigContent(
        configNoPack,
        'vite.config.ts',
        libraryAuditConfig
      );
      expect(findingsNoPack.some((f) => f.ruleId === 'vite-plus-config-pack')).toBe(true);

      const configIncompletePack = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          pack: {
            entry: ['src/index.ts']
          }
        });
      `;
      const findingsIncompletePack = auditVitePlusConfigContent(
        configIncompletePack,
        'vite.config.ts',
        libraryAuditConfig
      );
      expect(findingsIncompletePack.some((f) => f.ruleId === 'vite-plus-config-pack')).toBe(true);
    });
  });
});
