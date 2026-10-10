import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  isDataPath,
  isDemoPath,
  isExemptFile,
  isInCodeRoots,
  isScriptPath,
  isSrcPath,
  isCliPath
} from '../src/core/auditPathPredicates.ts';
import { matchesAnyRoot } from '../src/core/auditRootMatcher.ts';
import { isTestPath, isTestFileForCodeAudit } from '../src/core/auditTestPredicates.ts';
import { isSelfProviderProject } from '../src/core/auditProjectIdentity.ts';
import {
  resolveZLayersScssPath,
  getEffectiveZLayers,
  Z_LAYERS
} from '../src/core/auditZLayers.ts';
import { advancePastStringOrComment, scanBalancedBraces } from '../src/core/scannerUtils.ts';
import { defineAuditConfig } from '../src/core/auditConfig.ts';
import { loadAuditConfig } from '../src/core/auditConfigLoader.ts';

describe('auditPathPredicates', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-predicates-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok
    }
  });

  describe('matchesAnyRoot', () => {
    it('returns false for empty inputs or empty roots', () => {
      expect(matchesAnyRoot('', ['src'])).toBe(false);
      expect(matchesAnyRoot('src/app.ts', [])).toBe(false);
      expect(matchesAnyRoot('src/app.ts', null as unknown as string[])).toBe(false);
    });

    it('matches exact root, root prefix, or infixed root', () => {
      expect(matchesAnyRoot('src', ['src'])).toBe(true);
      expect(matchesAnyRoot('src/utils/file.ts', ['src'])).toBe(true);
      expect(matchesAnyRoot('packages/core/src/index.ts', ['src'])).toBe(true);
      expect(matchesAnyRoot('other/file.ts', ['src'])).toBe(false);
    });
  });

  describe('isTestPath and isTestFileForCodeAudit', () => {
    it('returns false for empty input', () => {
      expect(isTestPath('')).toBe(false);
    });

    it('identifies standard test and spec filename extensions', () => {
      expect(isTestPath('src/utils/math.test.ts')).toBe(true);
      expect(isTestPath('src/components/Button.spec.vue')).toBe(true);
      expect(isTestPath('src/services/api.ts')).toBe(false);
    });

    it('identifies tests based on testRoots or tests folder fallback', () => {
      expect(isTestPath('tests/unit/core.ts')).toBe(true);
      expect(isTestPath('packages/tests/integration.ts')).toBe(true);
    });

    it('honors includeTestsInCodeAudit flag in isTestFileForCodeAudit', () => {
      expect(isTestFileForCodeAudit('tests/unit/app.test.ts')).toBe(true);
    });
  });

  describe('path categories: isDataPath, isDemoPath, isScriptPath, isSrcPath, isCliPath', () => {
    it('identifies data paths', () => {
      expect(isDataPath('')).toBe(false);
      expect(isDataPath('src/data/pokedex.json')).toBe(true);
      expect(isDataPath('src/models/user.ts')).toBe(false);
    });

    it('identifies demo paths', () => {
      expect(isDemoPath('')).toBe(false);
      expect(isDemoPath('src/components/Button.vue')).toBe(false);
    });

    it('identifies script, src, and cli paths', () => {
      expect(isScriptPath('')).toBe(false);
      expect(isScriptPath('scripts/deploy.ts')).toBe(true);

      expect(isSrcPath('')).toBe(false);
      expect(isSrcPath('src/core/main.ts')).toBe(true);

      expect(isCliPath('')).toBe(false);
      expect(isCliPath('src/cli/audit_full.ts')).toBe(true);
    });
  });

  describe('isExemptFile and isInCodeRoots', () => {
    it('evaluates exempt files against config', () => {
      expect(isExemptFile('')).toBe(false);
      const testConfig = defineAuditConfig({
        name: 'test-app',
        paths: {
          exemptFiles: ['src/legacy/polyfill.ts']
        }
      });

      expect(isExemptFile('src/legacy/polyfill.ts', testConfig)).toBe(true);
      expect(isExemptFile('src/normal/file.ts', testConfig)).toBe(false);
    });

    it('evaluates isInCodeRoots correctly rejecting node_modules and non-code paths', () => {
      expect(isInCodeRoots('')).toBe(false);
      expect(isInCodeRoots('node_modules/pkg/index.js')).toBe(false);

      const testConfig = defineAuditConfig({
        name: 'test-app',
        paths: {
          codeRoots: ['src'],
          testRoots: ['tests'],
          includeTestsInCodeAudit: false
        }
      });

      expect(isInCodeRoots('src/index.ts', testConfig)).toBe(true);
      expect(isInCodeRoots('tests/app.test.ts', testConfig)).toBe(false);
      expect(isInCodeRoots('docs/readme.md', testConfig)).toBe(false);
    });
  });

  describe('isSelfProviderProject', () => {
    it('returns false when package.json is missing or name is not @francogp/auditor', () => {
      expect(isSelfProviderProject(tempDir)).toBe(false);

      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'other-app' }), 'utf-8');
      expect(isSelfProviderProject(tempDir)).toBe(false);
    });

    it('returns true when package.json matches @francogp/auditor and contains plugin.json + skill', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: '@francogp/auditor' }), 'utf-8');
      fs.writeFileSync(path.join(tempDir, 'plugin.json'), '{}', 'utf-8');
      const skillDir = path.join(tempDir, '.agents/skills/auditor');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Skill', 'utf-8');

      expect(isSelfProviderProject(tempDir)).toBe(true);
    });
  });

  describe('Z-Layers resolution helpers', () => {
    it('returns undefined from resolveZLayersScssPath if files do not exist', () => {
      expect(resolveZLayersScssPath(tempDir)).toBeUndefined();
    });

    it('resolves SCSS path when base file exists on disk', () => {
      const stylesDir = path.join(tempDir, 'src/styles');
      fs.mkdirSync(stylesDir, { recursive: true });
      const baseScss = path.join(stylesDir, '_base.scss');
      fs.writeFileSync(baseScss, '$z-base: 0;', 'utf-8');

      const resolved = resolveZLayersScssPath(tempDir);
      expect(resolved).toBe(baseScss);
    });

    it('falls back to default Z_LAYERS when no custom ts or config is present', () => {
      const layers = getEffectiveZLayers(tempDir);
      expect(layers).toEqual(Z_LAYERS);
      expect(layers.BASE).toBe(0);
      expect(layers.MODAL).toBe(11000);
    });

    it('parses Z_LAYERS from TypeScript file if configured', async () => {
      const auditorDir = path.join(tempDir, '.auditor');
      fs.mkdirSync(auditorDir, { recursive: true });
      const tsLayersPath = path.join(tempDir, 'src/styles/layers.ts');
      fs.mkdirSync(path.dirname(tsLayersPath), { recursive: true });
      fs.writeFileSync(
        tsLayersPath,
        `export const Z_LAYERS = {
  BACKGROUND: -1,
  CANVAS: 10,
  PANEL: 500
} as const;`,
        'utf-8'
      );

      fs.writeFileSync(
        path.join(auditorDir, 'audit.config.json'),
        JSON.stringify({
          name: 'test-app',
          styles: {
            zLayersTsFile: 'src/styles/layers.ts'
          }
        }),
        'utf-8'
      );

      await loadAuditConfig(tempDir);
      const layers = getEffectiveZLayers(tempDir);
      expect(layers.BACKGROUND).toBe(-1);
      expect(layers.CANVAS).toBe(10);
      expect(layers.PANEL).toBe(500);
    });
  });

  describe('scannerUtils', () => {
    it('returns same index when not at string or comment', () => {
      const text = 'const x = 10;';
      expect(advancePastStringOrComment(text, 0, text.length)).toBe(0);
      expect(advancePastStringOrComment(text, 6, text.length)).toBe(6);
    });

    it('advances past single-quoted strings with escaped characters', () => {
      const text = "'hello \\'world\\'' after";
      const next = advancePastStringOrComment(text, 0, text.length);
      expect(text.slice(next)).toBe(' after');
    });

    it('advances past double-quoted strings with escaped characters', () => {
      const text = '"hello \\"world\\"" after';
      const next = advancePastStringOrComment(text, 0, text.length);
      expect(text.slice(next)).toBe(' after');
    });

    it('advances past template strings', () => {
      const text = '`template ${val}` after';
      const next = advancePastStringOrComment(text, 0, text.length);
      expect(text.slice(next)).toBe(' after');
    });

    it('advances past single-line comments', () => {
      const text = '// single-line comment\nconst a = 1;';
      const next = advancePastStringOrComment(text, 0, text.length);
      expect(text.slice(next)).toBe('\nconst a = 1;');
    });

    it('advances past multi-line block comments', () => {
      const text = '/* block comment */ after';
      const next = advancePastStringOrComment(text, 0, text.length);
      expect(text.slice(next)).toBe(' after');
    });

    it('handles unclosed string safely', () => {
      const text = "'unclosed string";
      const next = advancePastStringOrComment(text, 0, text.length);
      expect(next).toBe(text.length);
    });

    it('scans balanced braces and respects strings and stopPrefix', () => {
      const text = ' { a: "}", b: { c: 1 } } </script>';
      const res = scanBalancedBraces(text, 2, text.length, 1, '</script>');
      expect(res.depth).toBe(0);
      expect(text.slice(1, res.end)).toBe('{ a: "}", b: { c: 1 } }');

      const truncated = '{ a: 1 </script>';
      const stopRes = scanBalancedBraces(truncated, 1, truncated.length, 1, '</script>');
      expect(stopRes.depth).toBe(1);
    });
  });
});
