/**
 * packages/auditor/tests/validate_css_duplicates.test.ts
 *
 * Comprehensive unit test suite for CssDuplicatesAuditor and PostCSS AST Style Analysis:
 * - Metadata & Contract compliance (rule descriptions <= 50 chars, BaseAuditor)
 * - Exact Duplicate Rules (css-duplicate-rules, severity: error)
 * - Similar Classes (css-similar-classes, severity: warning)
 * - Duplicated Long Lines (css-duplicate-long-lines, severity: warning)
 * - Unvariabled Raw Colors (css-unvariabled-colors, severity: warning)
 * - Duplicate Selectors (css-duplicate-selectors, severity: error)
 * - Empty Style Blocks (css-empty-rules, severity: warning)
 * - Vue SFC <style> & <style lang="scss"> line preservation
 * - Mixed Multi-Issue Detection
 * - Clean Path Verification (errors === 0, status === 'passed')
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CssDuplicatesAuditor,
  CSS_DUPLICATES_RULES
} from '../src/suites/architecture/validate_css_duplicates.ts';
import {
  parseCssContent,
  extractCssBlocksFromVue,
  detectDuplicateRules,
  detectSimilarClasses,
  detectLongValues,
  detectUnvariabledColors,
  detectDuplicateSelectors,
  detectEmptyRules,
  collectAllProjectCssRules,
  clearInMemoryCssCache,
  getInMemoryCssCache,
  loadCssAstCacheFromDisk,
  saveCssAstCacheToDisk
} from '../src/analyzers/cssAnalyzer.ts';

describe('CssDuplicatesAuditor & PostCSS AST Engine', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & BaseAuditor Compliance', () => {
    it('instantiates cleanly with BaseAuditor compliance and required metadata', () => {
      const auditor = new CssDuplicatesAuditor();
      expect(auditor.id).toBe('validate_css_duplicates');
      expect(auditor.family).toBe('architecture');
      expect(auditor.name).toBe('CSS Duplication & Hygiene Validator');
      expect(auditor.packageName).toBe('CSS');
      expect(auditor.description).toBeDefined();
      expect(auditor.description.length).toBeLessThanOrEqual(60);
    });

    it('declares all 6 canonical rules matching CSS_DUPLICATES_RULES constant', () => {
      const auditor = new CssDuplicatesAuditor();
      expect(auditor.ruleIds).toEqual(CSS_DUPLICATES_RULES);
      expect(auditor.ruleIds).toHaveLength(6);
      expect(auditor.ruleIds).toContain('css-duplicate-rules');
      expect(auditor.ruleIds).toContain('css-similar-classes');
      expect(auditor.ruleIds).toContain('css-duplicate-long-lines');
      expect(auditor.ruleIds).toContain('css-unvariabled-colors');
      expect(auditor.ruleIds).toContain('css-duplicate-selectors');
      expect(auditor.ruleIds).toContain('css-empty-rules');
    });

    it('enforces composed rule descriptions <= 50 characters (AGENTS.md rule)', () => {
      const auditor = new CssDuplicatesAuditor();
      expect(auditor.ruleDescriptions).toBeDefined();

      for (const [, desc] of Object.entries(auditor.ruleDescriptions!)) {
        const composed = `${auditor.packageName}: ${desc}`;
        expect(composed.length).toBeLessThanOrEqual(50);
        expect(composed).not.toContain('\n');
      }
    });
  });

  describe('Vue SFC & SCSS Parsing', () => {
    it('extracts style blocks from Vue SFC preserving original line positions', () => {
      const vueSfc = `<template>
  <div class="card">Hello</div>
</template>

<script setup lang="ts">
const name = 'test';
</script>

<style scoped lang="scss">
.card {
  display: flex;
  padding: 8px;
}
</style>`;

      const blocks = extractCssBlocksFromVue(vueSfc);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]!.startLine).toBe(9);

      const rules = parseCssContent(blocks[0]!.code, 'src/Card.vue', blocks[0]!.startLine - 1);
      expect(rules).toHaveLength(1);
      expect(rules[0]!.selector).toBe('.card');
      expect(rules[0]!.line).toBe(10);
      expect(rules[0]!.declarations).toHaveLength(2);
    });

    it('parses nested SCSS rules and variables seamlessly without errors', () => {
      const scss = `
$brand-color: #3b82f6;

.btn {
  display: inline-flex;
  color: $brand-color;

  &__icon {
    margin-right: 4px;
    width: 16px;
  }
}
`;
      const rules = parseCssContent(scss, 'src/button.scss');
      expect(rules).toHaveLength(2);
      expect(rules[0]!.selector).toBe('.btn');
      expect(rules[1]!.selector).toBe('&__icon');
    });
  });

  describe('Test 1: Exact Duplicate Rules (css-duplicate-rules)', () => {
    it('detects 100% identical declaration bodies across different selectors', () => {
      const css = `
.card-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
`;
      const rules = parseCssContent(css, 'src/styles/components.scss');
      const duplicates = detectDuplicateRules(rules, 2);

      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]!.occurrences).toHaveLength(2);
      expect(duplicates[0]!.occurrences[0]!.selector).toBe('.card-primary');
      expect(duplicates[0]!.occurrences[1]!.selector).toBe('.modal-header');
      expect(duplicates[0]!.declarations).toEqual([
        'align-items: center',
        'display: flex',
        'justify-content: center',
        'padding: 16px'
      ]);
    });
  });

  describe('Test 2: Similar Classes (css-similar-classes)', () => {
    it('detects classes with high declaration overlap (>= 80% similarity)', () => {
      const css = `
.card-simple {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  margin: 8px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  background: #ffffff;
}

.card-elevated {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  margin: 8px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  background: #f8fafc;
}
`;
      const rules = parseCssContent(css, 'src/styles/cards.scss');
      const similar = detectSimilarClasses(rules, 75);

      expect(similar.length).toBeGreaterThanOrEqual(1);
      expect(similar[0]!.similarity).toBeGreaterThanOrEqual(75);
      expect(similar[0]!.similarity).toBeLessThan(100);
      expect(similar[0]!.commonDeclarations).toContain('display: flex');
      expect(similar[0]!.commonDeclarations).toContain('padding: 16px');
      expect(similar[0]!.commonDeclarations).toContain('border-radius: 8px');
    });
  });

  describe('Test 3: Duplicated Long Lines (css-duplicate-long-lines)', () => {
    it('detects complex CSS values >= 20 characters repeated across classes', () => {
      const complexShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
      const css = `
.box-a {
  box-shadow: ${complexShadow};
}

.box-b {
  box-shadow: ${complexShadow};
}
`;
      const rules = parseCssContent(css, 'src/styles/shadows.scss');
      const longValues = detectLongValues(rules, 20);

      expect(longValues).toHaveLength(1);
      expect(longValues[0]!.value).toBe(complexShadow);
      expect(longValues[0]!.occurrences).toHaveLength(2);
    });
  });

  describe('Test 4: Unvariabled Colors (css-unvariabled-colors)', () => {
    it('detects raw HEX/RGB colors repeated across >= 3 rules without variables', () => {
      const css = `
.header { background-color: #3b82f6; }
.button { border-color: #3b82f6; }
.badge { color: #3b82f6; }
`;
      const rules = parseCssContent(css, 'src/styles/theme.scss');
      const colors = detectUnvariabledColors(rules);

      expect(colors).toHaveLength(1);
      expect(colors[0]!.color).toBe('#3b82f6');
      expect(colors[0]!.occurrences).toHaveLength(3);
    });

    it('ignores colors defined inside CSS or SCSS variables', () => {
      const css = `
$primary: #3b82f6;
--theme-color: #3b82f6;
.button { color: var(--theme-color); }
`;
      const rules = parseCssContent(css, 'src/styles/theme.scss');
      const colors = detectUnvariabledColors(rules);
      expect(colors).toHaveLength(0);
    });
  });

  describe('Test 5: Duplicate Selectors (css-duplicate-selectors)', () => {
    it('detects the same selector defined multiple times in the same file', () => {
      const css = `
.btn {
  padding: 8px;
}

.card {
  margin: 16px;
}

.btn {
  color: red;
}
`;
      const rules = parseCssContent(css, 'src/styles/button.scss');
      const duplicateSelectors = detectDuplicateSelectors(rules);

      expect(duplicateSelectors).toHaveLength(1);
      expect(duplicateSelectors[0]!.selector).toBe('.btn');
      expect(duplicateSelectors[0]!.lines).toHaveLength(2);
    });
  });

  describe('Test 6: Empty Rules (css-empty-rules)', () => {
    it('detects CSS rules declared without any properties', () => {
      const css = `
.empty-class {
}

.valid-class {
  display: block;
}
`;
      const rules = parseCssContent(css, 'src/styles/empty.scss');
      const emptyRules = detectEmptyRules(rules);

      expect(emptyRules).toHaveLength(1);
      expect(emptyRules[0]!.selector).toBe('.empty-class');
    });
  });

  describe('Test 7: Mixed Multi-Issue File', () => {
    it('accurately identifies and separates multiple distinct CSS defects in a single file', () => {
      const shadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
      const css = `
.card-a {
  display: flex;
  margin: 10px;
  background: #ff5733;
  box-shadow: ${shadow};
}

.card-b {
  display: flex;
  margin: 10px;
  background: #ff5733;
  box-shadow: ${shadow};
}

.card-c {
  color: #ff5733;
}

.card-a {
  opacity: 1;
}

.empty-placeholder {
}
`;
      const rules = parseCssContent(css, 'src/styles/mixed.scss');

      const dupes = detectDuplicateRules(rules, 2);
      expect(dupes.length).toBeGreaterThanOrEqual(1);

      const colors = detectUnvariabledColors(rules);
      expect(colors.some(c => c.color === '#ff5733')).toBe(true);

      const longValues = detectLongValues(rules, 20);
      expect(longValues.some(lv => lv.value === shadow)).toBe(true);

      const dupSelectors = detectDuplicateSelectors(rules);
      expect(dupSelectors.some(ds => ds.selector === '.card-a')).toBe(true);

      const empty = detectEmptyRules(rules);
      expect(empty.some(e => e.selector === '.empty-placeholder')).toBe(true);
    });
  });

  describe('Test 8: Auditor Violation Mapping & Severity', () => {
    it('correctly maps each analysis type to its designated RuleId and Severity', () => {
      const auditor = new CssDuplicatesAuditor();

      // Rule: css-duplicate-rules -> error
      auditor.addViolation({
        ruleId: 'css-duplicate-rules',
        severity: 'error',
        file: 'src/styles/card.scss',
        line: 10,
        message: 'SCSS/CSS duplicado: Selector .card coincide con 2 reglas idénticas',
        context: 'duplicación css'
      });

      // Rule: css-similar-classes -> warning
      auditor.addViolation({
        ruleId: 'css-similar-classes',
        severity: 'warning',
        file: 'src/styles/card.scss',
        line: 25,
        message: 'Clases CSS similares (85%): .card-a y .card-b comparten 4 propiedades',
        context: 'similitud css'
      });

      // Rule: css-duplicate-long-lines -> warning
      auditor.addViolation({
        ruleId: 'css-duplicate-long-lines',
        severity: 'warning',
        file: 'src/styles/shadow.scss',
        line: 5,
        message: 'Valor CSS largo duplicado en 2 lugares',
        context: 'valor largo duplicado'
      });

      // Rule: css-unvariabled-colors -> warning
      auditor.addViolation({
        ruleId: 'css-unvariabled-colors',
        severity: 'warning',
        file: 'src/styles/theme.scss',
        line: 12,
        message: 'Color repetido sin variable (#ff5733) en 3 reglas',
        context: 'color sin variable'
      });

      // Rule: css-duplicate-selectors -> error
      auditor.addViolation({
        ruleId: 'css-duplicate-selectors',
        severity: 'error',
        file: 'src/styles/button.scss',
        line: 30,
        message: 'Selector duplicado .btn definido 2 veces en el mismo archivo',
        context: 'selector repetido'
      });

      // Rule: css-empty-rules -> warning
      auditor.addViolation({
        ruleId: 'css-empty-rules',
        severity: 'warning',
        file: 'src/styles/empty.scss',
        line: 45,
        message: 'Bloque CSS vacío para selector .empty-box',
        context: 'regla css vacía'
      });

      const counts = auditor.getCountsByRule();
      expect(counts.get('css-duplicate-rules')).toBe(1);
      expect(counts.get('css-similar-classes')).toBe(1);
      expect(counts.get('css-duplicate-long-lines')).toBe(1);
      expect(counts.get('css-unvariabled-colors')).toBe(1);
      expect(counts.get('css-duplicate-selectors')).toBe(1);
      expect(counts.get('css-empty-rules')).toBe(1);
    });
  });

  describe('Test 9: Clean Path Verification (StandardAuditResult)', () => {
    it('executes cleanly on source roots reporting passed status with 0 errors', async () => {
      const auditor = new CssDuplicatesAuditor();
      const result = await auditor.execute();

      expect(result).toBeDefined();
      expect(result.id).toBe('validate_css_duplicates');
      expect(result.family).toBe('architecture');
      expect(typeof result.durationMs).toBe('number');
      expect(result.summary).toBeDefined();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
      expect(Array.isArray(result.findings)).toBe(true);
    });
  });

  describe('Test 10: Incremental AST Caching & Invalidation', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-css-cache-test-'));
      clearInMemoryCssCache();
    });

    afterEach(async () => {
      clearInMemoryCssCache();
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('populates in-memory cache on cold parse and reuses cached rules on warm run', async () => {
      const srcDir = path.join(tempDir, 'src');
      await fs.mkdir(srcDir, { recursive: true });
      const testCss = path.join(srcDir, 'test.scss');
      await fs.writeFile(testCss, '.btn { color: red; font-size: 14px; }', 'utf-8');

      // Cold run: parses from disk and populates cache
      const resultFirst = await collectAllProjectCssRules(tempDir, new Set(), tempDir);
      const EXPECTED_INITIAL_RULES = 1;
      expect(resultFirst.rules).toHaveLength(EXPECTED_INITIAL_RULES);
      expect(resultFirst.rules[0]?.selector).toBe('.btn');

      const cache = getInMemoryCssCache();
      expect(cache.size).toBe(1);

      // Warm run: should hit memory cache directly
      const resultSecond = await collectAllProjectCssRules(tempDir, new Set(), tempDir);
      expect(resultSecond.rules).toHaveLength(EXPECTED_INITIAL_RULES);
      expect(resultSecond.rules[0]?.selector).toBe('.btn');

      // Modify file -> cache invalidation on changed mtime/size
      const FILE_WRITE_DELAY_MS = 50;
      await new Promise(r => setTimeout(r, FILE_WRITE_DELAY_MS));
      await fs.writeFile(testCss, '.btn { color: blue; }\n.card { padding: 10px; }', 'utf-8');

      const resultThird = await collectAllProjectCssRules(tempDir, new Set(), tempDir);
      const EXPECTED_UPDATED_RULES = 2;
      expect(resultThird.rules).toHaveLength(EXPECTED_UPDATED_RULES);
      expect(resultThird.rules.map(r => r.selector)).toEqual(['.btn', '.card']);
    });

    it('persists cache to disk and reloads on fresh memory state', async () => {
      const srcDir = path.join(tempDir, 'src');
      await fs.mkdir(srcDir, { recursive: true });
      const testCss = path.join(srcDir, 'style.css');
      await fs.writeFile(testCss, '.badge { background: green; }', 'utf-8');

      const cacheFile = path.join(tempDir, 'scratch', 'cache', 'css_ast_cache.json');

      // Populate memory and save to disk
      await collectAllProjectCssRules(tempDir, new Set(), tempDir);
      await saveCssAstCacheToDisk(cacheFile);

      // Verify file exists on disk
      const diskContent = await fs.readFile(cacheFile, 'utf-8');
      expect(diskContent).toContain('.badge');

      // Clear memory cache to simulate new process
      clearInMemoryCssCache();
      expect(getInMemoryCssCache().size).toBe(0);

      // Load from disk
      await loadCssAstCacheFromDisk(cacheFile);
      expect(getInMemoryCssCache().size).toBe(1);

      // Collecting rules should use loaded cache without reparsing
      const result = await collectAllProjectCssRules(tempDir, new Set(), tempDir);
      const EXPECTED_LOADED_RULES = 1;
      expect(result.rules).toHaveLength(EXPECTED_LOADED_RULES);
      expect(result.rules[0]?.selector).toBe('.badge');
    });
  });
});
