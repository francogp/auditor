import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import {
  detectInlineVitePlugins,
  extractVitePluginsToModule,
  parseTsSourceFile
} from '../src/core/viteConfigAst.ts';
import { syncViteConfigWithAuditConfig } from '../src/core/vitePlusConfigSync.ts';
import { auditVitePlusConfigContent } from '../src/suites/architecture/validate_vite_plus_config.ts';

describe('Modular Vite Plugins Architecture (vite.plugins.ts)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-plugins-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('detectInlineVitePlugins', () => {
    it('detects inline plugin array in defineConfig', () => {
      const content = `import { defineConfig } from 'vite-plus';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()]
});
`;
      const sf = parseTsSourceFile(content);
      const detection = detectInlineVitePlugins(sf);
      expect(detection.hasPlugins).toBe(true);
      expect(detection.hasInlinePlugins).toBe(true);
      expect(detection.isAlreadyModular).toBe(false);
    });

    it('detects when plugins are already imported from ./vite.plugins.ts', () => {
      const content = `import { defineConfig } from 'vite-plus';
import { plugins } from './vite.plugins.ts';

export default defineConfig({
  plugins
});
`;
      const sf = parseTsSourceFile(content);
      const detection = detectInlineVitePlugins(sf);
      expect(detection.hasPlugins).toBe(true);
      expect(detection.hasInlinePlugins).toBe(false);
      expect(detection.isAlreadyModular).toBe(true);
    });

    it('returns false when no plugins are present in config', () => {
      const content = `import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: { rules: {} }
});
`;
      const sf = parseTsSourceFile(content);
      const detection = detectInlineVitePlugins(sf);
      expect(detection.hasPlugins).toBe(false);
      expect(detection.hasInlinePlugins).toBe(false);
    });

    it('does not flag when the only plugin is auditor-native vitePrecompressPlugin', () => {
      const content = `import { defineConfig } from 'vite-plus';
import { vitePrecompressPlugin } from '@francogp/auditor';

export default defineConfig({
  plugins: [vitePrecompressPlugin()]
});
`;
      const sf = parseTsSourceFile(content);
      const detection = detectInlineVitePlugins(sf);
      expect(detection.hasPlugins).toBe(true);
      expect(detection.hasInlinePlugins).toBe(false);
    });
  });

  describe('extractVitePluginsToModule', () => {
    it('extracts inline vue plugin to vite.plugins.ts and rewires vite.config.ts', () => {
      const originalViteConfig = `import path from 'node:path';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  }
});
`;
      const result = extractVitePluginsToModule(originalViteConfig, tempDir);
      expect(result.modified).toBe(true);
      expect(result.isAlreadyModular).toBe(true);
      expect(result.vitePluginsContent).toBeDefined();

      // Check generated vite.plugins.ts content
      expect(result.vitePluginsContent).toContain("import type { PluginOption } from 'vite-plus';");
      expect(result.vitePluginsContent).toContain("import vue from '@vitejs/plugin-vue';");
      expect(result.vitePluginsContent).toContain(
        'export const plugins: PluginOption[] = [vue()];'
      );

      // Check rewired vite.config.ts content
      expect(result.viteConfigContent).toContain("import { plugins } from './vite.plugins.ts';");
      expect(result.viteConfigContent).toContain('plugins,');
      expect(result.viteConfigContent).not.toContain("import vue from '@vitejs/plugin-vue';");
      // path should remain because it is used in resolve.alias
      expect(result.viteConfigContent).toContain("import path from 'node:path';");
    });

    it('extracts local const plugins variable statement and moves its imports', () => {
      const originalViteConfig = `import vue from '@vitejs/plugin-vue';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig, type PluginOption } from 'vite-plus';

const plugins: PluginOption[] = [
  vue(),
  basicSsl()
];

export default defineConfig({
  plugins
});
`;
      const result = extractVitePluginsToModule(originalViteConfig, tempDir);
      expect(result.modified).toBe(true);
      expect(result.vitePluginsContent).toContain("import vue from '@vitejs/plugin-vue';");
      expect(result.vitePluginsContent).toContain(
        "import basicSsl from '@vitejs/plugin-basic-ssl';"
      );
      expect(result.vitePluginsContent).toContain('export const plugins: PluginOption[] = [');

      expect(result.viteConfigContent).toContain("import { plugins } from './vite.plugins.ts';");
      expect(result.viteConfigContent).not.toContain('const plugins: PluginOption[]');
    });

    it('is a no-op when vite.config.ts is already modular', () => {
      const modularViteConfig = `import { defineConfig } from 'vite-plus';
import { plugins } from './vite.plugins.ts';

export default defineConfig({
  plugins
});
`;
      const result = extractVitePluginsToModule(modularViteConfig, tempDir);
      expect(result.modified).toBe(false);
      expect(result.vitePluginsContent).toBeNull();
    });
  });

  describe('Auditor Integration & End-to-End Migration', () => {
    it('auditVitePlusConfigContent flags inline plugins', () => {
      const config = `import { defineConfig } from 'vite-plus';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()]
});
`;
      const findings = auditVitePlusConfigContent(config, 'vite.config.ts');
      const inlineFinding = findings.find((f) => f.ruleId === 'vite-plus-inline-plugins-detected');
      expect(inlineFinding).toBeDefined();
      expect(inlineFinding?.message).toContain(
        "Vite plugins must be declared in 'vite.plugins.ts'"
      );
    });

    it('syncViteConfigWithAuditConfig auto-migrates inline plugins into vite.plugins.ts on disk', () => {
      const viteConfigPath = path.join(tempDir, 'vite.config.ts');
      const vitePluginsPath = path.join(tempDir, 'vite.plugins.ts');

      const initialViteConfig = `import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  plugins: [vue()]
});
`;
      fs.writeFileSync(viteConfigPath, initialViteConfig, 'utf-8');

      const res = syncViteConfigWithAuditConfig(tempDir);
      expect(res.modified).toBe(true);

      // Verify vite.plugins.ts was generated on disk
      expect(fs.existsSync(vitePluginsPath)).toBe(true);
      const pluginsFileContent = fs.readFileSync(vitePluginsPath, 'utf-8');
      expect(pluginsFileContent).toContain("import type { PluginOption } from 'vite-plus';");
      expect(pluginsFileContent).toContain("import vue from '@vitejs/plugin-vue';");
      expect(pluginsFileContent).toContain('export const plugins: PluginOption[] = [vue()];');

      // Verify vite.config.ts was updated on disk
      const updatedViteConfig = fs.readFileSync(viteConfigPath, 'utf-8');
      expect(updatedViteConfig).toContain("import { plugins } from './vite.plugins.ts';");
      expect(updatedViteConfig).not.toContain("import vue from '@vitejs/plugin-vue';");

      // Running audit on the migrated config produces zero inline-plugins findings
      const findings = auditVitePlusConfigContent(updatedViteConfig, 'vite.config.ts');
      expect(findings.some((f) => f.ruleId === 'vite-plus-inline-plugins-detected')).toBe(false);
    });
  });
});
