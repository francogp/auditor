/**
 * packages/auditor/tests/audit_project.test.ts
 *
 * Exhaustive unit tests for ProjectArchitectureAuditor, mapFallowJson,
 * getViolationCategory, and architecture rules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  ProjectArchitectureAuditor,
  getViolationCategory,
  isInsideComment,
  createLineLocator,
  extractAllBlocks,
  extractSelectedRules,
  filterActiveConfigRules,
  filterAndGroupViolations,
  buildProjectTopFiles,
  applyRuleFix,
  main
} from '../src/suites/architecture/audit_project.ts';
import {
  resetAuditConfig
} from '../src/core/auditConfig.ts';
import { zeroTimerLogic, nodePrefix } from '../src/suites/architecture/audit_rules.ts';

describe('ProjectArchitectureAuditor & Fallow Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-project-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Metadata & Configuration', () => {
    it('initializes with correct auditor metadata', () => {
      const auditor = new ProjectArchitectureAuditor();
      expect(auditor.id).toBe('audit_project');
      expect(auditor.family).toBe('architecture');
      expect(auditor.name).toBe('Project Architecture & Style Rules');
    });

    it('declares human-friendly descriptions for core architecture rules', () => {
      const auditor = new ProjectArchitectureAuditor();
      expect(auditor.ruleDescriptions).toBeDefined();
      expect(auditor.ruleDescriptions?.['zeroTimerLogic']).toBeDefined();
      expect(auditor.ruleDescriptions?.['viewport']).toBeDefined();
      expect(auditor.ruleDescriptions?.['nodePrefix']).toBeDefined();
      expect(auditor.ruleDescriptions?.['noInlineTypeImports']).toBeDefined();
      expect(auditor.ruleDescriptions?.['esmExtensions']).toBeDefined();
      expect(auditor.ruleDescriptions?.['forbiddenFallbacks']).toBeDefined();
    });
  });

  describe('getViolationCategory', () => {
    it('formats category as [packageName]: [description] within 50 chars', () => {
      const v = {
        file: 'src/core/test.ts',
        line: 1,
        message: 'Directiva prohibida',
        severity: 'error' as const,
        packageName: 'Arquitectura',
        ruleId: 'banned-ts-suppression',
        ruleDescription: 'Directivas @ts-ignore'
      };
      expect(getViolationCategory(v)).toBe('Arquitectura: Directivas @ts-ignore');
    });

    it('falls back to ruleDescription when already prefixed with package name', () => {
      const v = {
        file: 'src/core/test.ts',
        line: 1,
        message: 'Directiva prohibida',
        severity: 'error' as const,
        packageName: 'Arquitectura',
        ruleId: 'banned-ts-suppression',
        ruleDescription: 'Arquitectura: Directivas @ts-ignore'
      };
      expect(getViolationCategory(v)).toBe('Arquitectura: Directivas @ts-ignore');
    });

    it('falls back to ruleId or Otros when description is missing', () => {
      const v = {
        file: 'src/core/test.ts',
        line: 1,
        message: 'Error genérico',
        severity: 'error' as const,
        ruleId: 'custom-rule'
      };
      expect(getViolationCategory(v)).toBe('custom-rule');
    });
  });

  describe('zeroTimerLogic Rule', () => {
    it('does not flag gsap.ticker.sleep() while detecting standalone sleep() calls', () => {
      const validTickerSleep = 'gsap.ticker.sleep();';
      const invalidStandaloneSleep = 'await sleep(500);';
      const invalidDirectSleep = 'sleep(100);';

      zeroTimerLogic.regex.lastIndex = 0;
      expect(zeroTimerLogic.regex.test(validTickerSleep)).toBe(false);

      zeroTimerLogic.regex.lastIndex = 0;
      expect(zeroTimerLogic.regex.test(invalidStandaloneSleep)).toBe(true);

      zeroTimerLogic.regex.lastIndex = 0;
      expect(zeroTimerLogic.regex.test(invalidDirectSleep)).toBe(true);
    });
  });

  describe('isInsideComment Helper', () => {
    it('returns false for code outside comments', () => {
      const code = 'const a = 10;';
      expect(isInsideComment(code, 6)).toBe(false);
    });

    it('returns true for content inside single-line comment', () => {
      const code = 'const a = 10; // comment here';
      const commentIdx = code.indexOf('comment');
      expect(isInsideComment(code, commentIdx)).toBe(true);
    });

    it('returns false on next line after single-line comment', () => {
      const code = '// comment\nconst b = 20;';
      const codeIdx = code.indexOf('const b');
      expect(isInsideComment(code, codeIdx)).toBe(false);
    });

    it('returns true for content inside multi-line block comment', () => {
      const code = '/* multi\nline\ncomment */\nconst c = 30;';
      const commentIdx = code.indexOf('line');
      expect(isInsideComment(code, commentIdx)).toBe(true);

      const codeIdx = code.indexOf('const c');
      expect(isInsideComment(code, codeIdx)).toBe(false);
    });
  });

  describe('createLineLocator Helper', () => {
    it('locates 1-indexed line numbers accurately with offset', () => {
      const content = 'line1\nline2\nline3\nline4';
      const locator = createLineLocator(content, 0);

      expect(locator(0)).toBe(1); // line1
      expect(locator(6)).toBe(2); // line2
      expect(locator(12)).toBe(3); // line3
      expect(locator(18)).toBe(4); // line4

      const offsetLocator = createLineLocator(content, 10);
      expect(offsetLocator(0)).toBe(11);
    });
  });

  describe('extractAllBlocks Helper', () => {
    it('extracts script, template, and style blocks with precise line and offset boundaries', () => {
      const vueSfc = [
        '<template>',
        '  <div id="app">Hello</div>',
        '</template>',
        '',
        '<script setup lang="ts">',
        'const count = 0;',
        '</script>',
        '',
        '<style scoped>',
        '.app { color: red; }',
        '</style>'
      ].join('\n');

      const templateBlocks = extractAllBlocks(vueSfc, 'template');
      expect(templateBlocks).toHaveLength(1);
      expect(templateBlocks[0]!.startLine).toBe(1);
      expect(templateBlocks[0]!.content).toContain('<div id="app">Hello</div>');

      const scriptBlocks = extractAllBlocks(vueSfc, 'script');
      expect(scriptBlocks).toHaveLength(1);
      expect(scriptBlocks[0]!.content).toContain('const count = 0;');

      const styleBlocks = extractAllBlocks(vueSfc, 'style');
      expect(styleBlocks).toHaveLength(1);
      expect(styleBlocks[0]!.content).toContain('.app { color: red; }');
    });

    it('returns empty array when tag is not present', () => {
      expect(extractAllBlocks('const a = 1;', 'script')).toEqual([]);
    });
  });

  describe('extractSelectedRules & filterActiveConfigRules', () => {
    it('extracts rules from rule/rules arguments and positionals', () => {
      const selected = extractSelectedRules({ rule: 'zero-timer' }, ['dox', 'no-any,magic-numbers']);
      expect(selected.has('zero-timer')).toBe(true);
      expect(selected.has('dox')).toBe(true);
      expect(selected.has('no-any')).toBe(true);
      expect(selected.has('magic-numbers')).toBe(true);
    });

    it('filters active config rules matching names or aliases', () => {
      const selected = new Set(['zerotimerlogic', 'magicnumbers']);
      const activeRules = filterActiveConfigRules(selected);
      expect(activeRules.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('filterAndGroupViolations & buildProjectTopFiles', () => {
    const sampleViolations = [
      {
        file: 'src/services/auth.ts',
        line: 10,
        message: 'Err 1',
        severity: 'error' as const,
        ruleId: 'rule-a'
      },
      {
        file: 'src/services/auth.ts',
        line: 20,
        message: 'Warn 1',
        severity: 'warning' as const,
        ruleId: 'rule-b'
      },
      {
        file: 'src/components/Btn.vue',
        line: 5,
        message: 'Err 2',
        severity: 'error' as const,
        ruleId: 'rule-a'
      }
    ];

    it('groups violations by file and aggregates type counts', () => {
      const dummyCtx = {
        values: {},
        selectedRules: new Set<string>(),
        activeConfigRules: new Set<never>(),
        isHumanMode: false
      };
      const result = filterAndGroupViolations(sampleViolations, dummyCtx);
      expect(result.all).toHaveLength(3);
      expect(Object.keys(result.fileGroups)).toHaveLength(2);

      const topFiles = buildProjectTopFiles(result.fileGroups, 10);
      expect(topFiles).toHaveLength(2);
      expect(topFiles[0]!.file).toBe('src/services/auth.ts');
      expect(topFiles[0]!.total).toBe(2);
      expect(topFiles[0]!.errors).toBe(1);
      expect(topFiles[0]!.warnings).toBe(1);
    });

    it('filters by path and errors-only options', () => {
      const filtered = filterAndGroupViolations(sampleViolations, {
        values: { path: 'Btn.vue', 'errors-only': true },
        selectedRules: new Set<string>(),
        activeConfigRules: new Set<never>(),
        isHumanMode: false
      });
      expect(filtered.all).toHaveLength(1);
      expect(filtered.all[0]!.file).toBe('src/components/Btn.vue');
    });
  });

  describe('applyRuleFix Helper', () => {
    it('applies rule fix function to content outside comments', () => {
      const bareSnippet = 'import path from ' + "'path';";
      const fixed = applyRuleFix(nodePrefix, bareSnippet, 'src/test.ts');
      expect(fixed).toContain('node:path');
    });

    it('ignores matches located inside comments during fix', () => {
      const commentSnippet = '// import path from ' + "'path';";
      const fixed = applyRuleFix(nodePrefix, commentSnippet, 'src/test.ts');
      expect(fixed).toBe(commentSnippet);
    });
  });

  describe('main CLI runner in isolated sandbox', () => {
    it('runs main on an isolated empty directory without errors', async () => {
      const violations = await main(['--path', tempDir, '--summary']);
      expect(Array.isArray(violations)).toBe(true);
      expect(violations).toHaveLength(0);
    });

    it('runs main in json mode on isolated directory', async () => {
      const violations = await main(['--path', tempDir, '--json']);
      expect(Array.isArray(violations)).toBe(true);
    });
  });

  describe('Clean execution', () => {
    it('finishes with passed status and zero errors on clean execution', async () => {
      const auditor = new ProjectArchitectureAuditor();
      const res = await auditor.finishAudit();
      expect(res.summary.errors).toBe(0);
      expect(res.status).toBe('passed');
    });
  });
});
