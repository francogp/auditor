import { describe, it, expect } from 'vitest';
import {
  AuditHeadersAuditor,
  scanFileForIllegalHeaders,
  auditAuditHeaders,
  isPathIgnored
} from '../src/suites/architecture/validate_audit_headers.ts';

describe('validate_audit_headers (Illegal Audit Headers & File-Level Suppressions Auditor)', () => {
  describe('Rule Declarations & Metadata', () => {
    it('initializes with correct metadata and rules', () => {
      const auditor = new AuditHeadersAuditor();
      expect(auditor.id).toBe('validate_audit_headers');
      expect(auditor.packageName).toBe('Header');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds.length).toBeGreaterThan(0);
      expect(auditor.ruleDescriptions).toBeDefined();
    });
  });

  describe('scanFileForIllegalHeaders', () => {
    it('returns empty violations for clean files with valid code and inline comments', () => {
      const cleanCode = `
import { ref } from 'vue';

export const MY_VALUE = 42;
export function calculate(a: number, b: number): number {
  return a + b;
}
`;
      const violations = scanFileForIllegalHeaders('src/logic/math.ts', cleanCode);
      expect(violations).toEqual([]);
    });

    it('allows valid inline line-level escape hatches appended to code', () => {
      const codeWithInlineEscapes = [
        'const name = getRawName(); // ' + 'domain-ok: Open dynamic text or non-domain string payload',
        'let globalCache: Cache | null = null; // ' + 'singleton-ok: Global persistent singleton instance',
        'const timeout = 1000; // ' + 'timer-ok: Explicit network latency debounce'
      ].join('\n');
      const violations = scanFileForIllegalHeaders('src/logic/helpers.ts', codeWithInlineEscapes);
      expect(violations).toEqual([]);
    });

    it('detects banned magic number suppression directives (no-magic, magic-ok, number-ok)', () => {
      const code = [
        'const shake = { x: -4 }; // ' + 'no-magic: Visual shake offset displacement',
        'const ratio = 1.5; // ' + 'magic-ok: Aspect ratio',
        'const count = 42; // ' + 'number-ok: Fixed count'
      ].join('\n');
      const violations = scanFileForIllegalHeaders('src/logic/math.ts', code);
      expect(violations.length).toBe(3);
      expect(violations[0]?.ruleId).toBe('banned-magic-suppression');
      expect(violations[1]?.ruleId).toBe('banned-magic-suppression');
      expect(violations[2]?.ruleId).toBe('banned-magic-suppression');
    });

    it('detects banned style inheritance directives (style-inherited, style-ok)', () => {
      const code = [
        '<script setup lang="ts">',
        '// ' + 'style-inherited: styles imported in parent Component.vue',
        '// ' + 'style-ok: local exemption',
        '</script>'
      ].join('\n');
      const violations = scanFileForIllegalHeaders('src/components/MyChild.vue', code);
      expect(violations.length).toBe(2);
      expect(violations[0]?.ruleId).toBe('banned-style-suppression');
      expect(violations[1]?.ruleId).toBe('banned-style-suppression');
    });

    it('detects // fallow-ignore-file headers anywhere in file', () => {
      const code = ['// ' + 'fallow-ignore-file security-sink', 'import fs from "node:fs";', 'export function readData() { return 1; }'].join('\n');
      const violations = scanFileForIllegalHeaders('src/logic/loader.ts', code);
      expect(violations.length).toBe(1);
      expect(violations[0]?.ruleId).toBe('file-level-fallow-ignore');
      expect(violations[0]?.line).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects multiple fallow-ignore-file rules on same or different lines', () => {
      const code = ['// ' + 'fallow-ignore-file security-sink unused-store-member', '// ' + 'fallow-ignore-file circular-dependencies', 'export const x = 1;'].join('\n');
      const violations = scanFileForIllegalHeaders('src/stores/myStore.ts', code);
      expect(violations.length).toBe(2);
      expect(violations[0]?.ruleId).toBe('file-level-fallow-ignore');
      expect(violations[1]?.ruleId).toBe('file-level-fallow-ignore');
    });

    it('detects file-level /* eslint-disable */ blocks', () => {
      const code = ['/*' + ' eslint-disable */', 'import { ref } from "vue";'].join('\n');
      const violations = scanFileForIllegalHeaders('src/views/MyView.vue', code);
      expect(violations.length).toBe(1);
      expect(violations[0]?.ruleId).toBe('file-level-eslint-disable');
      expect(violations[0]?.line).toBe(1);
    });

    it('detects file-level <!-- eslint-disable --> in Vue templates', () => {
      const code = ['<template>', '  <!-' + '- eslint-disable vue/no-v-html -->', '  <div v-html="rawContent" />', '</template>'].join('\n');
      const violations = scanFileForIllegalHeaders('src/components/MyComp.vue', code);
      expect(violations.length).toBe(1);
      expect(violations[0]?.ruleId).toBe('file-level-eslint-disable');
      expect(violations[0]?.line).toBe(2);
    });

    it('allows eslint-disable-next-line and eslint-disable-line', () => {
      const code = [
        '// ' + 'eslint-disable-next-line security/detect-non-literal-regexp',
        'const regex = new RegExp(input);',
        'const val = eval(code); // ' + 'eslint-disable-line no-eval'
      ].join('\n');
      const violations = scanFileForIllegalHeaders('src/logic/evaluator.ts', code);
      expect(violations).toEqual([]);
    });

    it('detects @ts-nocheck, @ts-ignore, and @ts-expect-error', () => {
      const code = [
        '// ' + '@ts-nocheck',
        '// ' + '@ts-ignore',
        'const a: number = "hello";',
        '// ' + '@ts-expect-error',
        'const b: string = 123;'
      ].join('\n');
      const violations = scanFileForIllegalHeaders('src/logic/badTypes.ts', code);
      expect(violations.length).toBe(3);
      expect(violations[0]?.ruleId).toBe('banned-ts-suppression');
      expect(violations[1]?.ruleId).toBe('banned-ts-suppression');
      expect(violations[2]?.ruleId).toBe('banned-ts-suppression');
    });

    it('detects standalone auditor escape hatches used as file headers', () => {
      const code = ['// ' + 'domain-ok', '// ' + 'singleton-ok', 'export const someData = 123;'].join('\n');
      const violations = scanFileForIllegalHeaders('src/logic/standaloneEscapes.ts', code);
      expect(violations.length).toBe(2);
      expect(violations[0]?.ruleId).toBe('header-auditor-escape');
      expect(violations[1]?.ruleId).toBe('header-auditor-escape');
    });
    it('detects unjustified escape hatches missing required reason (unjustified-escape-hatch)', () => {
      const code = [
        'const id = "abc"; // ' + 'domain-ok',
        'const port = 8080; // ' + 'infra-id-ok',
        'const key = "k"; // ' + 'open-record'
      ].join('\n');
      const violations = scanFileForIllegalHeaders('src/logic/unjustified.ts', code);
      expect(violations.length).toBe(3);
      expect(violations[0]?.ruleId).toBe('unjustified-escape-hatch');
      expect(violations[1]?.ruleId).toBe('unjustified-escape-hatch');
      expect(violations[2]?.ruleId).toBe('unjustified-escape-hatch');
    });
  });

  describe('Directory Ignore Governance (isPathIgnored)', () => {
    it('correctly ignores paths within canonical ignored directories', () => {
      expect(isPathIgnored('node_modules/vue/index.js')).toBe(true);
      expect(isPathIgnored('dist/index.html')).toBe(true);
      expect(isPathIgnored('scratch/audit_report.txt')).toBe(true);
      expect(isPathIgnored('.agents/skills/fallow/SKILL.md')).toBe(true);
    });

    it('allows valid non-ignored source files', () => {
      expect(isPathIgnored('src/logic/billing/engine.ts')).toBe(false);
      expect(isPathIgnored('src/components/MyComponent.vue')).toBe(false);
      expect(isPathIgnored('scripts/auditors/architecture/validate_audit_headers.ts')).toBe(false);
    });

    it('respects extra directory ignore patterns', () => {
      const extraPatterns = ['supabase/**', 'scripts/tools/**'];
      expect(isPathIgnored('supabase/migrations/001.sql', extraPatterns)).toBe(true);
      expect(isPathIgnored('scripts/tools/benchmark.ts', extraPatterns)).toBe(true);
      expect(isPathIgnored('src/stores/authStore.ts', extraPatterns)).toBe(false);
    });
  });

  describe('Clean execution', () => {
    it('runs on clean files and reports zero errors', () => {
      const cleanCode = `
        export const PI = 3.14159;
        export function computeArea(radius: number): number {
          return PI * radius * radius;
        }
      `;
      const violations = scanFileForIllegalHeaders('src/logic/cleanMath.ts', cleanCode);
      expect(violations).toHaveLength(0);
    });

    it('auditAuditHeaders integration executes repository audit scanning and collects structured metrics', () => {
      const result = auditAuditHeaders();
      expect(result.filesScanned).toBeGreaterThan(50);
      expect(Array.isArray(result.violations)).toBe(true);
      expect(typeof result.passed).toBe('boolean');
    });
  });
});
