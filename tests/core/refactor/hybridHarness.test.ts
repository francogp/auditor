/**
 * tests/core/refactor/hybridHarness.test.ts
 *
 * Hermetic unit tests for HybridHarnessEngine.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { HybridHarnessEngine } from '../../../src/core/refactor/hybridHarness.ts';
import type { RefactorPlan } from '../../../src/core/refactor/refactorContracts.ts';

describe('HybridHarnessEngine', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-hybrid-harness-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('performs clean canonical extraction and AST replacement in TypeScript files', async () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    const relConsumer = 'src/consumer.ts';
    const consumerFile = path.join(tmpDir, relConsumer);
    const relShared = 'src/utils/mathUtils.ts';
    const destFile = path.join(tmpDir, relShared);

    fs.writeFileSync(
      consumerFile,
      [
        "import { log } from './logger.ts';",
        '',
        'export function execute(): void {',
        '  const clamped = Math.min(Math.max(10, 0), 100);',
        '  log(clamped);',
        '}',
        ''
      ].join('\n'),
      'utf-8'
    );

    const plan: RefactorPlan = {
      version: 1,
      planId: 'plan-ts-001',
      fingerprint: 'fp-clamp',
      action: 'extract-shared-function',
      sharedModulePath: relShared,
      functionName: 'clampNumber',
      parameters: [
        { name: 'v', type: 'number' },
        { name: 'min', type: 'number' },
        { name: 'max', type: 'number' }
      ],
      returnType: 'number',
      sharedFunctionCode:
        'function clampNumber(v: number, min: number, max: number): number {\n  return Math.min(Math.max(v, min), max);\n}',
      targetFiles: [relConsumer],
      astPattern: 'Math.min(Math.max($V, $MIN), $MAX)',
      astRewrite: 'clampNumber($V, $MIN, $MAX)'
    };

    await HybridHarnessEngine.execute(tmpDir, plan);

    // Verify canonical extracted file exists and has correct code
    expect(fs.existsSync(destFile)).toBe(true);
    const extractedContent = fs.readFileSync(destFile, 'utf-8');
    expect(extractedContent).toContain('export function clampNumber');

    // Verify consumer file has replacement and import
    const consumerContent = fs.readFileSync(consumerFile, 'utf-8');
    expect(consumerContent).toContain('clampNumber(10, 0, 100)');
    expect(consumerContent).toMatch(
      /import\s*\{\s*clampNumber\s*\}\s*from\s*['"]\.\/utils\/mathUtils['"]/
    );
  });

  it('performs surgical replacements in Vue Single File Components preserving templates and styles', async () => {
    const srcDir = path.join(tmpDir, 'src', 'components');
    fs.mkdirSync(srcDir, { recursive: true });

    const relVue = 'src/components/MyComponent.vue';
    const vueFile = path.join(tmpDir, relVue);
    const relShared = 'src/utils/formatter.ts';
    const destFile = path.join(tmpDir, relShared);

    fs.writeFileSync(
      vueFile,
      [
        '<template>',
        '  <div class="box"><h1>{{ title }}</h1></div>',
        '</template>',
        '',
        '<script setup lang="ts">',
        "import { ref } from 'vue';",
        '',
        'const title = ref("Hello");',
        'const formatted = title.value.trim().toUpperCase();',
        '</script>',
        '',
        '<style scoped>',
        '.box { padding: 10px; }',
        '</style>',
        ''
      ].join('\n'),
      'utf-8'
    );

    const plan: RefactorPlan = {
      version: 1,
      planId: 'plan-vue-001',
      fingerprint: 'fp-vue-format',
      action: 'extract-shared-function',
      sharedModulePath: relShared,
      functionName: 'formatTitle',
      parameters: [{ name: 't', type: 'string' }],
      returnType: 'string',
      sharedFunctionCode:
        'function formatTitle(t: string): string {\n  return t.trim().toUpperCase();\n}',
      targetFiles: [relVue],
      astPattern: '$TITLE.trim().toUpperCase()',
      astRewrite: 'formatTitle($TITLE)'
    };

    await HybridHarnessEngine.execute(tmpDir, plan);

    expect(fs.existsSync(destFile)).toBe(true);
    const modifiedVue = fs.readFileSync(vueFile, 'utf-8');
    expect(modifiedVue).toContain('<template>');
    expect(modifiedVue).toContain('<style scoped>');
    expect(modifiedVue).toContain('.box { padding: 10px; }');
    expect(modifiedVue).toContain('formatTitle(title.value)');
    expect(modifiedVue).toContain('import { formatTitle } from ' + "'../utils/formatter';");
  });
});
