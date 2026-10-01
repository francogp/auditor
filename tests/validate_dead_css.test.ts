/**
 * packages/auditor/tests/validate_dead_css.test.ts
 *
 * Dedicated unit test suite for DeadCssAuditor:
 * - Detects orphaned scoped CSS classes (dead-scoped-css)
 * - Honors escape hatches (css-ok, dead-css-ok)
 * - Verifies clean execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  DeadCssAuditor,
  DEAD_CSS_RULES
} from '../src/suites/architecture/validate_dead_css.ts';

describe('DeadCssAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dead-css-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Metadata & Configuration', () => {
    it('declares all canonical rules in DEAD_CSS_RULES', () => {
      expect(DEAD_CSS_RULES).toContain('dead-scoped-css');
      expect(DEAD_CSS_RULES).toHaveLength(1);
    });

    it('initializes with correct id and family', () => {
      const auditor = new DeadCssAuditor(tempDir);
      expect(auditor.id).toBe('validate_dead_css');
      expect(auditor.family).toBe('architecture');
    });
  });

  describe('Violation Detection', () => {
    it('detects orphaned scoped CSS class (dead-scoped-css)', async () => {
      const compDir = path.join(tempDir, 'src', 'components');
      await fs.mkdir(compDir, { recursive: true });

      const vueContent = `
        <template>
          <div class="active-item">Hello</div>
        </template>
        <style scoped>
          .active-item { color: red; }
          .completely-unused-class { color: blue; }
        </style>
      `;
      await fs.writeFile(path.join(compDir, 'DeadTest.vue'), vueContent, 'utf-8');

      const auditor = new DeadCssAuditor(tempDir);
      const result = await auditor.execute();

      const deadClass = result.findings.find(f => f.ruleId === 'dead-scoped-css');
      expect(deadClass).toBeDefined();
      expect(deadClass?.severity).toBe('error');
      expect(deadClass?.context).toContain('completely-unused-class');
    });

    it('honors // css-ok: and // dead-css-ok: escape hatches', async () => {
      const compDir = path.join(tempDir, 'src', 'components');
      await fs.mkdir(compDir, { recursive: true });

      const vueContent = `
        <template>
          <div>Hello</div>
        </template>
        <style scoped>
          .dynamically-injected-class { color: green; } // dead-css-ok: dynamic runtime class
        </style>
      `;
      await fs.writeFile(path.join(compDir, 'ExemptTest.vue'), vueContent, 'utf-8');

      const auditor = new DeadCssAuditor(tempDir);
      const result = await auditor.execute();

      const deadClass = result.findings.find(f => f.ruleId === 'dead-scoped-css');
      expect(deadClass).toBeUndefined();
    });

    it('recognizes dynamic class prefixes from script and template', async () => {
      const compDir = path.join(tempDir, 'src', 'components');
      await fs.mkdir(compDir, { recursive: true });

      const vueContent = `
        <script setup lang="ts">
        const tier = 'common';
        const tierClass = \`tier-\${tier}\`;
        </script>
        <template>
          <div :class="[\`size-\${tier}\`, tierClass]">Dynamic</div>
        </template>
        <style scoped>
          .tier-common { color: red; }
          .size-common { font-size: 14px; }
        </style>
      `;
      await fs.writeFile(path.join(compDir, 'DynamicTest.vue'), vueContent, 'utf-8');

      const auditor = new DeadCssAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });

  describe('Clean execution', () => {
    it('runs on clean files and reports zero errors', async () => {
      const compDir = path.join(tempDir, 'src', 'components');
      await fs.mkdir(compDir, { recursive: true });

      const cleanVue = `
        <template>
          <div class="card-title">Card</div>
        </template>
        <style scoped>
          .card-title { font-weight: bold; }
        </style>
      `;
      await fs.writeFile(path.join(compDir, 'CleanCard.vue'), cleanVue, 'utf-8');

      const auditor = new DeadCssAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});
