/**
 * packages/auditor/tests/validate_stylelint.test.ts
 *
 * Comprehensive unit test suite for StylelintAuditor:
 * - Metadata & Contract compliance (rule descriptions <= 50 chars, BaseAuditor)
 * - SCSS Nesting Resolution (nested &:hover under different selectors does NOT trigger duplicate-selectors)
 * - Mixin AtRule Recognition (@include does NOT trigger empty-block)
 * - Duplicate Selector Detection (real duplicates at same scope detected)
 * - Empty Block Detection (truly empty blocks detected)
 * - Duplicate Properties Detection (duplicate declarations in same block detected)
 * - Vue SFC <style scoped lang="scss"> parsing
 * - Content-Hashed Cache Persistence (scratch/cache/stylelint_cache.json)
 * - Clean Path Verification (errors === 0, status === 'passed')
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resetAuditConfig } from '../src/core/auditConfig.ts';
import {
  StylelintAuditor,
  STYLELINT_RULES,
  resolveStylelintConfigFile,
  categorizeStylelintRule
} from '../src/suites/architecture/validate_stylelint.ts';

describe('StylelintAuditor Suite', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    resetAuditConfig();
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
  });

  describe('Metadata & BaseAuditor Compliance', () => {
    it('instantiates cleanly with BaseAuditor compliance and required metadata', () => {
      const auditor = new StylelintAuditor();
      expect(auditor.id).toBe('validate_stylelint');
      expect(auditor.family).toBe('architecture');
      expect(auditor.name).toBe('Stylelint & SCSS Hygiene Validator');
      expect(auditor.packageName).toBe('Stylelint');
      expect(auditor.description).toBeDefined();
      expect(auditor.description.length).toBeLessThanOrEqual(60);
    });

    it('declares all canonical rules matching STYLELINT_RULES constant', () => {
      const auditor = new StylelintAuditor();
      expect(auditor.ruleIds).toEqual(STYLELINT_RULES);
      expect(auditor.ruleIds).toContain('stylelint-issue');
      expect(auditor.ruleIds).toContain('css-duplicate-selectors');
      expect(auditor.ruleIds).toContain('css-duplicate-properties');
      expect(auditor.ruleIds).toContain('css-empty-blocks');
      expect(auditor.ruleIds).toContain('css-order-violation');
      expect(auditor.ruleIds).toContain('scss-syntax-issue');
    });

    it('enforces composed rule descriptions <= 50 characters (AGENTS.md rule)', () => {
      const auditor = new StylelintAuditor();
      expect(auditor.ruleDescriptions).toBeDefined();

      for (const [, desc] of Object.entries(auditor.ruleDescriptions!)) {
        const composed = `${auditor.packageName}: ${desc}`;
        expect(composed.length).toBeLessThanOrEqual(50);
        expect(composed).not.toContain('\n');
      }
    });

    it('categorizes stylelint rule names accurately', () => {
      expect(categorizeStylelintRule('no-duplicate-selectors')).toBe('css-duplicate-selectors');
      expect(categorizeStylelintRule('declaration-block-no-duplicate-properties')).toBe('css-duplicate-properties');
      expect(categorizeStylelintRule('block-no-empty')).toBe('css-empty-blocks');
      expect(categorizeStylelintRule('order/properties-order')).toBe('css-order-violation');
      expect(categorizeStylelintRule('scss/no-duplicate-dollar-variables')).toBe('scss-syntax-issue');
      expect(categorizeStylelintRule('unknown-rule')).toBe('stylelint-issue');
    });
  });

  describe('Configuration Resolution', () => {
    it('resolves canonical config when host has no custom config', () => {
      const resolved = resolveStylelintConfigFile(process.cwd());
      expect(resolved).toBeDefined();
      expect(resolved.endsWith('.stylelintrc.json')).toBe(true);
    });

    it('resolves custom configFile when provided and the file exists', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-cfg-test-'));
      try {
        const customPath = path.join(tempDir, 'custom.stylelint.json');
        await fs.writeFile(customPath, '{"rules":{}}', 'utf-8');
        const resolved = resolveStylelintConfigFile(tempDir, 'custom.stylelint.json');
        expect(resolved).toBe(customPath);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Hermetic Sandbox Execution & Precision', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-stylelint-test-'));
      // Create minimal structure
      const srcDir = path.join(tempDir, 'src');
      await fs.mkdir(srcDir, { recursive: true });
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('correctly ignores nested SCSS &:hover and recognizes mixins without false positives', async () => {
      const vueFile = path.join(tempDir, 'src/Component.vue');
      const vueContent = `<template>
  <div class="card"><button class="btn">Click</button></div>
</template>

<style scoped lang="scss">
@mixin button-theme {
  border-radius: 4px;
}

// Rule with mixin (must NOT trigger block-no-empty)
.card {
  @include button-theme;
  &:hover {
    color: blue;
  }
}

// Nested &:hover under different parent (must NOT trigger duplicate selector)
.btn {
  display: inline-block;
  &:hover {
    color: red;
  }
}
</style>
`;
      await fs.writeFile(vueFile, vueContent, 'utf-8');

      const auditor = new StylelintAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      const duplicateSelectorFindings = result.findings.filter(f => f.ruleId === 'css-duplicate-selectors');
      expect(duplicateSelectorFindings).toHaveLength(0);
      const emptyBlockFindings = result.findings.filter(f => f.ruleId === 'css-empty-blocks');
      expect(emptyBlockFindings).toHaveLength(0);
    });

    it('honors order/order allowing blockless mixins before declarations and block mixins after declarations', async () => {
      const scssFile = path.join(tempDir, 'src/responsive_order.scss');
      const scssContent = `
@mixin reset-box {
  box-sizing: border-box;
}

@mixin respond-desktop {
  @media (width >= 1024px) {
    @content;
  }
}

.responsive-card {
  @include reset-box;

  width: 100px;

  @include respond-desktop {
    width: 200px;
  }
}
`;
      await fs.writeFile(scssFile, scssContent, 'utf-8');

      const auditor = new StylelintAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      const orderViolations = result.findings.filter(f => f.ruleId === 'css-order-violation');
      expect(orderViolations).toHaveLength(0);
      expect(result.summary.errors).toBe(0);
    });

    it('accurately catches real duplicate selectors at same scope', async () => {
      const scssFile = path.join(tempDir, 'src/dup.scss');
      const scssContent = `
.duplicate-card {
  display: flex;
}

.other-class {
  color: green;
}

.duplicate-card {
  margin: 10px;
}
`;
      await fs.writeFile(scssFile, scssContent, 'utf-8');

      const auditor = new StylelintAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      const dupFindings = result.findings.filter(f => f.ruleId === 'css-duplicate-selectors');
      expect(dupFindings.length).toBeGreaterThanOrEqual(1);
      expect(dupFindings[0]?.message).toContain('.duplicate-card');
    });

    it('accurately catches truly empty blocks', async () => {
      const scssFile = path.join(tempDir, 'src/empty.scss');
      const scssContent = `
.really-empty-class {
}
`;
      await fs.writeFile(scssFile, scssContent, 'utf-8');

      const auditor = new StylelintAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      const emptyFindings = result.findings.filter(f => f.ruleId === 'css-empty-blocks');
      expect(emptyFindings.length).toBeGreaterThanOrEqual(1);
    });

    it('creates content-hashed cache file in scratch/cache/stylelint_cache.json', async () => {
      const scssFile = path.join(tempDir, 'src/test.scss');
      await fs.writeFile(scssFile, '.btn { display: flex; }', 'utf-8');

      const auditor = new StylelintAuditor({ projectRoot: tempDir });
      await auditor.execute();

      const cachePath = path.join(tempDir, 'scratch/cache/stylelint_cache.json');
      const cacheExists = await fs.stat(cachePath).then(() => true).catch(() => false);
      expect(cacheExists).toBe(true);
    });

    it('respects stylelint: { enabled: false } in audit.config.json by bypassing execution with passed status', async () => {
      const auditConfig = {
        name: 'test-app',
        paths: { srcRoots: ['src'] },
        persistence: { engine: 'none' },
        domain: { finiteDomainTypes: [] },
        bundle: { enabled: false },
        stylelint: { enabled: false }
      };
      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.json'), JSON.stringify(auditConfig), 'utf-8');

      const scssFile = path.join(tempDir, 'src/empty.scss');
      await fs.writeFile(scssFile, '.empty {}', 'utf-8');

      const auditor = new StylelintAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('skipped');
      expect(result.findings).toHaveLength(0);
      expect(auditor.getFilesScanned()).toBe(0);
      expect(result.metrics?.['Files Scanned']).toBe(0);
    });

    it('applies custom rule overrides from audit.config.json (e.g. disabling block-no-empty)', async () => {
      const auditConfig = {
        name: 'test-app',
        paths: { srcRoots: ['src'] },
        persistence: { engine: 'none' },
        domain: { finiteDomainTypes: [] },
        bundle: { enabled: false },
        stylelint: {
          rules: {
            'block-no-empty': null
          }
        }
      };
      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.json'), JSON.stringify(auditConfig), 'utf-8');

      const scssFile = path.join(tempDir, 'src/empty.scss');
      await fs.writeFile(scssFile, '.empty {}', 'utf-8');

      const auditor = new StylelintAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      const emptyFindings = result.findings.filter(f => f.ruleId === 'css-empty-blocks');
      expect(emptyFindings).toHaveLength(0);
    });

    it('respects stylelint.ignoreGlobs from audit.config.json to ignore specified directories', async () => {
      const auditConfig = {
        name: 'test-app',
        paths: { srcRoots: ['src'] },
        persistence: { engine: 'none' },
        domain: { finiteDomainTypes: [] },
        bundle: { enabled: false },
        stylelint: {
          ignoreGlobs: ['**/legacy/**']
        }
      };
      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.json'), JSON.stringify(auditConfig), 'utf-8');

      const legacyDir = path.join(tempDir, 'src/legacy');
      await fs.mkdir(legacyDir, { recursive: true });
      await fs.writeFile(path.join(legacyDir, 'legacy_empty.scss'), '.legacy-empty {}', 'utf-8');

      const auditor = new StylelintAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      const emptyFindings = result.findings.filter(f => f.ruleId === 'css-empty-blocks');
      expect(emptyFindings).toHaveLength(0);
    });
  });

  describe('Sass Collision Casing & Auto-Fix', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-sass-traps-'));
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('detects lowercase functions that collide with Dart Sass built-ins as scss-sass-collision-casing', async () => {
      const scssFile = path.join(tempDir, 'src/button.scss');
      await fs.writeFile(
        scssFile,
        `.btn {
  transform: scale(1.1);
  filter: saturate(0.9) brightness(1.2);
}`,
        'utf-8'
      );

      const auditor = new StylelintAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      const collisionFindings = result.findings.filter(f => f.ruleId === 'scss-sass-collision-casing');
      expect(collisionFindings.length).toBeGreaterThanOrEqual(2);
      expect(collisionFindings.some(f => f.message.includes('Scale'))).toBe(true);
      expect(collisionFindings.some(f => f.message.includes('Saturate'))).toBe(true);
    });

    it('auto-repairs colliding lowercase functions to PascalCase/CamelCase in fix mode', async () => {
      const scssFile = path.join(tempDir, 'src/badge.scss');
      await fs.writeFile(
        scssFile,
        `.badge {
  transform: scale(1.1);
  filter: saturate(0.9);
}`,
        'utf-8'
      );

      const oldArgv = process.argv;
      process.argv = ['node', 'validate_stylelint.ts', 'fix'];
      try {
        const auditor = new StylelintAuditor({ projectRoot: tempDir });
        await auditor.execute();

        const repairedContent = await fs.readFile(scssFile, 'utf-8');
        expect(repairedContent).toContain('Scale(1.1)');
        expect(repairedContent).toContain('Saturate(0.9)');
        expect(repairedContent).not.toContain('scale(1.1)');
        expect(repairedContent).not.toContain('saturate(0.9)');
      } finally {
        process.argv = oldArgv;
      }
    });

    it('accepts capitalized Sass Collision functions cleanly without function-name-case violations', async () => {
      const scssFile = path.join(tempDir, 'src/clean.scss');
      await fs.writeFile(
        scssFile,
        `.clean {
  transform: Scale(1.05);
  filter: Saturate(1.2) Brightness(1.1) Grayscale(0.5) Drop-Shadow(0 4px 8px rgb(0 0 0 / 30%));
}`,
        'utf-8'
      );

      const auditor = new StylelintAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      const functionCaseErrors = result.findings.filter(f => f.message.includes('function-name-case'));
      expect(functionCaseErrors).toHaveLength(0);
      const collisionFindings = result.findings.filter(f => f.ruleId === 'scss-sass-collision-casing');
      expect(collisionFindings).toHaveLength(0);
    });
  });

  describe('Clean Path Verification (StandardAuditResult)', () => {
    it('executes cleanly on source roots reporting passed status with 0 errors', async () => {
      const auditor = new StylelintAuditor();
      const result = await auditor.execute();

      expect(result).toBeDefined();
      expect(result.id).toBe('validate_stylelint');
      expect(result.family).toBe('architecture');
      expect(typeof result.durationMs).toBe('number');
      expect(result.summary).toBeDefined();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
      expect(Array.isArray(result.findings)).toBe(true);
    });
  });

  describe('Violation Detection in Sandbox', () => {
    it('detects violations and fails with status failed and severity error', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-sl-fail-'));
      try {
        await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
        await fs.writeFile(
          path.join(tempDir, 'src/bad.scss'),
          `.unclosed-block {\n  color: red;\n`,
          'utf-8'
        );
        const auditor = new StylelintAuditor({ projectRoot: tempDir });
        const result = await auditor.execute();
        expect(result.status).toBe('failed');
        expect(result.summary.errors).toBeGreaterThan(0);
        expect(result.findings.some(f => f.severity === 'error')).toBe(true);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });
});

