import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  ValidateVitePlusConfigAuditor,
  auditVitePlusConfigContent,
  VITE_PLUS_CONFIG_RULES
} from '../src/suites/architecture/validate_vite_plus_config.ts';

describe('ValidateVitePlusConfigAuditor & auditVitePlusConfigContent', () => {
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
  });

  describe('Violation Detection', () => {
    it('flags vite-plus-config-any-allowed when no-explicit-any is missing or off', () => {
      const configContent = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: {
            rules: {
              '@typescript-eslint/no-explicit-any': 'off',
              '@typescript-eslint/ban-ts-comment': 'error'
            }
          }
        });
      `;
      const findings = auditVitePlusConfigContent(configContent, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-any-allowed')).toBe(true);
    });

    it('flags vite-plus-config-ts-ignore-allowed when ban-ts-comment is missing', () => {
      const configContent = `
        import { defineConfig } from 'vite-plus';
        export default defineConfig({
          lint: {
            rules: {
              '@typescript-eslint/no-explicit-any': 'error'
            }
          }
        });
      `;
      const findings = auditVitePlusConfigContent(configContent, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-config-ts-ignore-allowed')).toBe(true);
    });

    it('flags vite-plus-legacy-config-forbidden when legacy config files exist on disk', async () => {
      fs.writeFileSync(path.join(tempDir, 'eslint.config.js'), 'export default [];');
      fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), 'export default {};');

      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.findings.some((f) => f.ruleId === 'vite-plus-legacy-config-forbidden')).toBe(
        true
      );
    });

    it('flags vite-plus-config-missing when no config file exists on disk', async () => {
      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.findings.some((f) => f.ruleId === 'vite-plus-config-missing')).toBe(true);
      expect(result.status).toBe('failed');
    });
  });

  describe('Clean Path Verification (StandardAuditResult)', () => {
    it('executes cleanly with 0 errors on compliant vite.config.ts', async () => {
      const validConfig = `
        import { defineConfig } from 'vite-plus';

        export default defineConfig({
          lint: {
            rules: {
              '@typescript-eslint/no-explicit-any': 'error',
              '@typescript-eslint/ban-ts-comment': 'error'
            }
          }
        });
      `;
      fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), validConfig);

      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
    });
  });

  describe('Auto-Fix Verification', () => {
    it('scaffolds canonical vite.config.ts when missing and fix: true is set', async () => {
      const configPath = path.join(tempDir, 'vite.config.ts');
      expect(fs.existsSync(configPath)).toBe(false);

      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir, fix: true });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(fs.existsSync(configPath)).toBe(true);
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');

      const createdContent = fs.readFileSync(configPath, 'utf-8');
      expect(createdContent).toContain('@typescript-eslint/no-explicit-any');
      expect(createdContent).toContain('@typescript-eslint/ban-ts-comment');
    });

    it('automatically cleans legacy config files when fix: true is set', async () => {
      const legacyPath = path.join(tempDir, 'eslint.config.js');
      fs.writeFileSync(legacyPath, 'export default [];');

      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir, fix: true });
      await auditor.runAudit();
      await auditor.finishAudit();

      expect(fs.existsSync(legacyPath)).toBe(false);
    });

    it('extracts test block from legacy vitest.config.ts and preserves existing vite.config.ts plugins', async () => {
      // 1. Existing vite.config.ts with custom plugins
      const viteConfigContent = `import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: { port: 3000 }
});
`;
      fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), viteConfigContent, 'utf-8');

      // 2. Legacy vitest.config.ts with custom pool and exclusions
      const vitestConfigContent = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    coverage: {
      provider: 'v8',
      exclude: ['src/**/*.vue', '**/*.d.ts']
    }
  }
});
`;
      fs.writeFileSync(path.join(tempDir, 'vitest.config.ts'), vitestConfigContent, 'utf-8');

      // 3. Run auditor in fix mode
      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir, fix: true });
      await auditor.runAudit();
      await auditor.finishAudit();

      // 4. Verify vite.config.ts has both custom plugins AND migrated test block AND new lint/fmt/staged
      const updatedViteConfig = fs.readFileSync(path.join(tempDir, 'vite.config.ts'), 'utf-8');
      expect(updatedViteConfig).toContain("from 'vite-plus'");
      expect(updatedViteConfig).toContain('plugins: [vue()]');
      expect(updatedViteConfig).toContain('server: { port: 3000 }');
      expect(updatedViteConfig).toContain("pool: 'forks'");
      expect(updatedViteConfig).toContain("'src/**/*.vue'");
      expect(updatedViteConfig).toContain('lint: {');
      expect(updatedViteConfig).toContain('fmt: {');
      expect(updatedViteConfig).toContain('staged: {');

      // 5. Verify vitest.config.ts was safely removed only AFTER migration
      expect(fs.existsSync(path.join(tempDir, 'vitest.config.ts'))).toBe(false);
    });

    it('migrates .nvmrc to .node-version and syncs package.json with vite-plus', async () => {
      // 1. Create .nvmrc and legacy package.json
      fs.writeFileSync(path.join(tempDir, '.nvmrc'), '26.11.1\n', 'utf-8');
      const initialPkg = {
        name: 'test-host',
        scripts: {
          lint: 'eslint .'
        },
        devDependencies: {
          eslint: '^9.0.0',
          '@eslint/js': '^9.0.0',
          vitest: '^3.0.0'
        }
      };
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(initialPkg, null, 2), 'utf-8');
      fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), "import { defineConfig } from 'vite'; export default defineConfig({});", 'utf-8');

      // 2. Run auditor in fix mode
      const auditor = new ValidateVitePlusConfigAuditor({ projectRoot: tempDir, fix: true });
      await auditor.runAudit();
      await auditor.finishAudit();

      // 3. Verify .nvmrc was removed and .node-version created
      expect(fs.existsSync(path.join(tempDir, '.nvmrc'))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, '.node-version'))).toBe(true);
      expect(fs.readFileSync(path.join(tempDir, '.node-version'), 'utf-8').trim()).toBe('26.11.1');

      // 4. Verify package.json updated
      const updatedPkg = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.json'), 'utf-8'));
      expect(updatedPkg.devDependencies['vite-plus']).toBe('^1.2.0');
      expect(updatedPkg.devDependencies['eslint']).toBeUndefined();
      expect(updatedPkg.devDependencies['@eslint/js']).toBeUndefined();
      expect(updatedPkg.devDependencies['vitest']).toBeUndefined();
      expect(updatedPkg.scripts['lint']).toBe('vp check');
    });
  });
});

