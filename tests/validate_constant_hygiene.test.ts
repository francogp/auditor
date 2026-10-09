/**
 * tests/node/auditors/validate_constant_hygiene.test.ts
 *
 * Exhaustive unit tests for ValidateConstantHygieneAuditor conforming to BaseAuditor 5-point contract.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ValidateConstantHygieneAuditor, CONSTANT_HYGIENE_RULES } from '../src/suites/architecture/validate_constant_hygiene.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import { resetAuditConfig } from '../src/core/auditConfig.ts';

describe('ValidateConstantHygieneAuditor', () => {
  let tempDir: string;
  let srcDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'const-hygiene-test-'));
    srcDir = path.join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Contract & Metadata Conformance', () => {
    it('fulfills BaseAuditor metadata and construction contracts', () => {
      const auditor = new ValidateConstantHygieneAuditor();
      validateAuditorConstruction(auditor);
      expect(auditor.id).toBe('validate_constant_hygiene');
      expect(auditor.packageName).toBe('Constantes');
      expect(auditor.family).toBe('architecture');
      expect(auditor.requiresAst).toBe(true);
      expect(auditor.ruleIds).toEqual(CONSTANT_HYGIENE_RULES);
      expect(auditor.ruleDescriptions).toBeDefined();
      expect(Object.keys(auditor.ruleDescriptions!)).toHaveLength(6);
    });
  });

  describe('Clean Path Execution', () => {
    it('passes with zero errors and zero warnings on clean constant code', async () => {
      const cleanTs = `
        export const MAX_RETRY_COUNT = 5;
        export const TIMEOUT_DELAY_MS = 1000;
        export const DEFAULT_PAGE_SIZE = 20;
      `;
      await fs.writeFile(path.join(srcDir, 'constants.ts'), cleanTs, 'utf-8');

      const auditor = new ValidateConstantHygieneAuditor([srcDir], tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
    });
  });

  describe('Violation Path: 100% Rule ID Verification', () => {
    it('detects duplicate identical constants across separate files (duplicate-constant-identical)', async () => {
      await fs.writeFile(path.join(srcDir, 'modA.ts'), 'export const GLOBAL_SHARED_TOKEN = "VALID_TOKEN";\n', 'utf-8');
      await fs.writeFile(path.join(srcDir, 'modB.ts'), 'export const GLOBAL_SHARED_TOKEN = "VALID_TOKEN";\n', 'utf-8');

      const auditor = new ValidateConstantHygieneAuditor([srcDir], tempDir);
      const result = await auditor.execute();

      const finding = result.findings.find(f => f.ruleId === 'duplicate-constant-identical');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
      expect(finding?.message).toContain('idéntico');
    });

    it('detects duplicate divergent constants across separate files (duplicate-constant-divergent)', async () => {
      await fs.writeFile(path.join(srcDir, 'modA.ts'), 'export const DIVERGENT_LIMIT_COUNT = 150;\n', 'utf-8');
      await fs.writeFile(path.join(srcDir, 'modB.ts'), 'export const DIVERGENT_LIMIT_COUNT = 300;\n', 'utf-8');

      const auditor = new ValidateConstantHygieneAuditor([srcDir], tempDir);
      const result = await auditor.execute();

      const finding = result.findings.find(f => f.ruleId === 'duplicate-constant-divergent');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
      expect(finding?.message).toContain('diferentes');
    });

    it('detects inline magic numbers in source logic (constant-magic-numbers)', async () => {
      const logicFile = path.join(srcDir, 'service.ts');
      await fs.writeFile(logicFile, 'export function calculateDiscount(price: number): number {\n  return price * 87;\n}\n', 'utf-8');

      const auditor = new ValidateConstantHygieneAuditor([srcDir], tempDir);
      const result = await auditor.execute();

      const finding = result.findings.find(f => f.ruleId === 'constant-magic-numbers');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
      expect(finding?.message).toContain('Número mágico inline');
    });

    it('detects bad constant names with numeric value suffix (constant-bad-names)', async () => {
      const constFile = path.join(srcDir, 'types.ts');
      await fs.writeFile(constFile, 'export const MAX_USERS_50 = 50;\n', 'utf-8');

      const auditor = new ValidateConstantHygieneAuditor([srcDir], tempDir);
      const result = await auditor.execute();

      const finding = result.findings.find(f => f.ruleId === 'constant-bad-names');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects redundant 1:1 constant aliases (constant-no-alias)', async () => {
      const aliasFile = path.join(srcDir, 'alias.ts');
      await fs.writeFile(aliasFile, 'export const ORIGINAL_VAL = 10;\nexport const REDUNDANT_ALIAS = ORIGINAL_VAL;\n', 'utf-8');

      const auditor = new ValidateConstantHygieneAuditor([srcDir], tempDir);
      const result = await auditor.execute();

      const finding = result.findings.find(f => f.ruleId === 'constant-no-alias');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects raw numeric suffixes in constant names (constant-no-literal-suffix)', async () => {
      const suffixFile = path.join(srcDir, 'limits.ts');
      await fs.writeFile(suffixFile, 'export const RETRY_DELAY_600 = 600;\n', 'utf-8');

      const auditor = new ValidateConstantHygieneAuditor([srcDir], tempDir);
      const result = await auditor.execute();

      const finding = result.findings.find(f => f.ruleId === 'constant-no-literal-suffix');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('does not flag template button text like "+10" or "Agregar 10" as magic numbers in .vue files', async () => {
      const vueFile = path.join(srcDir, 'CounterButtons.vue');
      const vueContent = `<template>
  <div class="actions">
    <button @click="increment(10)">+10</button>
    <button>Agregar 10 de cada uno</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const count = ref(0);
function increment(step: number) {
  count.value += step;
}
</script>`;
      await fs.writeFile(vueFile, vueContent, 'utf-8');

      const auditor = new ValidateConstantHygieneAuditor([srcDir], tempDir);
      const result = await auditor.execute();

      const magicFindings = result.findings.filter(f => f.ruleId === 'constant-magic-numbers');
      expect(magicFindings).toHaveLength(0);
    });

    it('detects magic numbers inside .vue script setup logic', async () => {
      const vueFile = path.join(srcDir, 'BadScript.vue');
      const vueContent = `<template>
  <div>Hello</div>
</template>

<script setup lang="ts">
const delay = 45; // inline magic number without named constant
</script>`;
      await fs.writeFile(vueFile, vueContent, 'utf-8');

      const auditor = new ValidateConstantHygieneAuditor([srcDir], tempDir);
      const result = await auditor.execute();

      const magicFindings = result.findings.filter(f => f.ruleId === 'constant-magic-numbers');
      expect(magicFindings.length).toBeGreaterThanOrEqual(1);
      expect(magicFindings[0]?.severity).toBe('error');
    });

    it('does not flag JSON module default exports or end-of-line escape hatches as redundant aliases', async () => {
      const jsonImportFile = path.join(srcDir, 'dataCatalog.ts');
      const content = [
        "import dbJson from './data.json' with { type: 'json' };",
        'export const DATA_CATALOG = dbJson;',
        'export const OTHER_ALIAS = SOURCE_CONST; // const-ok: intentional passthrough'
      ].join('\n');
      await fs.writeFile(jsonImportFile, content, 'utf-8');

      const auditor = new ValidateConstantHygieneAuditor([srcDir], tempDir);
      const result = await auditor.execute();

      const aliasFindings = result.findings.filter(f => f.ruleId === 'constant-no-alias' && f.file.includes('dataCatalog.ts'));
      expect(aliasFindings).toHaveLength(0);
    });
  });
});
