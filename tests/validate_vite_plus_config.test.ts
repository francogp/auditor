import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  ValidateVitePlusConfigAuditor,
  auditVitePlusConfigContent,
  VITE_PLUS_CONFIG_RULES
} from '../src/suites/architecture/validate_vite_plus_config.ts';
import {
  buildCanonicalVitePlusConfig,
  resolveAuditConfigIgnoreGlobs,
  syncViteConfigWithAuditConfig,
  cleanLegacyConfigFiles
} from '../src/core/vitePlusConfigSync.ts';
import { getAuditConfig, defineAuditConfig, setAuditConfig } from '../src/core/auditConfig.ts';

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

    it('C-CFG-00: flags vite-plus-config-missing and fails when vite.config.ts is absent', async () => {
      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.status).toBe('failed');
      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.findings.some((f) => f.ruleId === 'vite-plus-config-missing')).toBe(true);
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
            '@francogp/domain-type/no-double-cast-unknown': 'error',
            '@francogp/domain-type/no-legacy-date': 'error',
            '${ruleKey}': '${ruleVal}'
          }
        },
        fmt: { singleQuote: true },
        staged: { '**/*': 'vp check' },
        test: { environment: 'node' }
      });
    `;

    it('C-CFG-01: flags vite-plus-config-any-allowed when no-explicit-any is off', () => {
      const content = buildBaseConfigWithRule('@typescript-eslint/no-explicit-any', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-any-allowed')).toBe(true);
    });

    it('C-CFG-02: flags vite-plus-config-ts-ignore-allowed when ban-ts-comment is off', () => {
      const content = buildBaseConfigWithRule('@typescript-eslint/ban-ts-comment', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-ts-ignore-allowed')).toBe(true);
    });

    it('C-CFG-03: flags vite-plus-config-type-assertions-allowed when consistent-type-assertions is off', () => {
      const content = buildBaseConfigWithRule(
        '@typescript-eslint/consistent-type-assertions',
        'off'
      );
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-type-assertions-allowed')).toBe(
        true
      );
    });

    it('C-CFG-04: flags vite-plus-config-double-cast-allowed when no-double-cast-unknown is off', () => {
      const content = buildBaseConfigWithRule(
        '@francogp/domain-type/no-double-cast-unknown',
        'off'
      );
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-double-cast-allowed')).toBe(true);
    });

    it('C-CFG-05: flags vite-plus-config-legacy-date-allowed when no-legacy-date is off', () => {
      const content = buildBaseConfigWithRule('@francogp/domain-type/no-legacy-date', 'off');
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-legacy-date-allowed')).toBe(true);
    });
  });

  describe('Sections & Legacy Files Canaries (C-CFG-06 to C-CFG-09)', () => {
    it('C-CFG-06: flags vite-plus-config-fmt-missing when fmt section is absent', () => {
      const content = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: { rules: {} },
          staged: { '**/*': 'vp check' },
          test: { environment: 'node' }
        });
      `;
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-fmt-missing')).toBe(true);
    });

    it('C-CFG-07: flags vite-plus-config-staged-missing when staged section is absent', () => {
      const content = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: { rules: {} },
          fmt: { singleQuote: true },
          test: { environment: 'node' }
        });
      `;
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-staged-missing')).toBe(true);
    });

    it('C-CFG-08: flags vite-plus-config-test-missing when test section is absent', () => {
      const content = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: { rules: {} },
          fmt: { singleQuote: true },
          staged: { '**/*': 'vp check' }
        });
      `;
      const findings = auditVitePlusConfigContent(content, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-test-missing')).toBe(true);
    });

    it('C-CFG-09: flags vite-plus-legacy-config-forbidden when legacy configs exist', async () => {
      fs.writeFileSync(path.join(tempDir, 'eslint.config.js'), 'export default [];');
      fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), 'export default {};');

      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.findings.some((f) => f.ruleId === 'vite-plus-legacy-config-forbidden')).toBe(
        true
      );
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

    it('C-CFG-13: flags vite-plus-config-plugin-missing when domain-type jsPlugins is absent', () => {
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
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-plugin-missing')).toBe(true);
    });

    it('C-CFG-14: flags vite-plus-config-options-missing when options typeAware is absent in lint', () => {
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
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-options-missing')).toBe(true);
    });

    it('C-CFG-15: flags vite-plus-config-ignore-patterns-missing when audit ignore globs are not in vite config', () => {
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
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-ignore-patterns-missing')).toBe(
        true
      );
    });

    it('C-CFG-16: flags vite-plus-config-test-roots-desynced when testRoots are not in test.include', () => {
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
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-test-roots-desynced')).toBe(true);
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
      expect(synced).toContain("'custom_tests/**/*.{test,spec}.ts'");
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
  });
});
