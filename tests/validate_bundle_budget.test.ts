/**
 * packages/auditor/tests/validate_bundle_budget.test.ts
 *
 * Dedicated unit test suite for BundleBudgetAuditor:
 * - Detects imports from tests/scripts in src (bundle-runtime-leak)
 * - Detects heavy modules imported into UI layers (bundle-heavy-import)
 * - Detects oversize chunks in dist/assets (bundle-chunk-size)
 * - Verifies escape hatches (bundle-leak-ok)
 * - Verifies clean execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  BundleBudgetAuditor,
  BUNDLE_BUDGET_RULES
} from '../src/suites/architecture/validate_bundle_budget.ts';

describe('BundleBudgetAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bundle-budget-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Metadata & Configuration', () => {
    it('declares all canonical rules in BUNDLE_BUDGET_RULES', () => {
      expect(BUNDLE_BUDGET_RULES).toContain('bundle-runtime-leak');
      expect(BUNDLE_BUDGET_RULES).toContain('bundle-heavy-import');
      expect(BUNDLE_BUDGET_RULES).toContain('bundle-chunk-size');
    });

    it('initializes with correct id and family', () => {
      const auditor = new BundleBudgetAuditor(tempDir);
      expect(auditor.id).toBe('validate_bundle_budget');
      expect(auditor.family).toBe('architecture');
    });
  });

  describe('Violation Detection', () => {
    it('detects runtime leak from scripts/tests in src (bundle-runtime-leak)', async () => {
      const srcDir = path.join(tempDir, 'src');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(
        path.join(srcDir, 'leaky.ts'),
        `import { something } from '../../scripts/maintenance/tool.ts';\n`,
        'utf-8'
      );

      const auditor = new BundleBudgetAuditor(tempDir);
      const result = await auditor.execute();

      const leak = result.findings.find(f => f.ruleId === 'bundle-runtime-leak');
      expect(leak).toBeDefined();
      expect(leak?.severity).toBe('error');
    });

    it('detects heavy imports in UI layers (bundle-heavy-import)', async () => {
      const uiDir = path.join(tempDir, 'src', 'components');
      await fs.mkdir(uiDir, { recursive: true });
      await fs.writeFile(
        path.join(uiDir, 'HeavyComponent.vue'),
        `<script setup>\nimport postgres from 'postgres';\n</script>`,
        'utf-8'
      );

      const auditor = new BundleBudgetAuditor(tempDir);
      const result = await auditor.execute();

      const heavy = result.findings.find(f => f.ruleId === 'bundle-heavy-import');
      expect(heavy).toBeDefined();
      expect(heavy?.severity).toBe('error');
    });

    it('detects oversized compiled chunk in dist/assets (bundle-chunk-size)', async () => {
      const distAssetsDir = path.join(tempDir, 'dist', 'assets');
      await fs.mkdir(distAssetsDir, { recursive: true });

      // Create a 2.1 MB mock chunk
      const oversizeBuffer = Buffer.alloc(2.1 * 1024 * 1024, 'a');
      await fs.writeFile(path.join(distAssetsDir, 'huge-chunk.js'), oversizeBuffer);

      const auditor = new BundleBudgetAuditor(tempDir);
      const result = await auditor.execute();

      const sizeViolation = result.findings.find(f => f.ruleId === 'bundle-chunk-size');
      expect(sizeViolation).toBeDefined();
      expect(sizeViolation?.severity).toBe('error');
    });

    it('honors // bundle-leak-ok escape hatch', async () => {
      const srcDir = path.join(tempDir, 'src');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(
        path.join(srcDir, 'leaky.ts'),
        `import { something } from '../../scripts/maintenance/tool.ts'; // bundle-leak-ok: justified fixture\n`,
        'utf-8'
      );

      const auditor = new BundleBudgetAuditor(tempDir);
      const result = await auditor.execute();

      const leak = result.findings.find(f => f.ruleId === 'bundle-runtime-leak');
      expect(leak).toBeUndefined();
    });
  });

  describe('Clean execution', () => {
    it('runs on clean files and reports zero errors', async () => {
      const srcDir = path.join(tempDir, 'src', 'components');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(
        path.join(srcDir, 'CleanComponent.vue'),
        `<script setup>\nimport { ref } from 'vue';\nconst count = ref(0);\n</script>`,
        'utf-8'
      );

      const auditor = new BundleBudgetAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});
