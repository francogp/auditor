/**
 * packages/auditor/tests/validate_dox_integrity.test.ts
 *
 * Dedicated unit test suite for DoxIntegrityAuditor:
 * - Missing AGENTS.md in code directory (dox-missing-agents-md)
 * - Child AGENTS.md not listed in parent index (dox-unregistered-child)
 * - Prohibited absolute links (dox-absolute-link)
 * - Broken links to non-existent files (dox-broken-link)
 * - Linking to git-ignored targets (dox-gitignore-target)
 * - Verifies clean execution (0 errors, passed status)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DoxIntegrityAuditor,
  DOX_RULES
} from '../src/suites/documentation/validate_dox_integrity.ts';

describe('DoxIntegrityAuditor', () => {
  const scratchDir = path.resolve(process.cwd(), 'scratch/test_dox_' + crypto.randomUUID());

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    fs.mkdirSync(scratchDir, { recursive: true });
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    if (fs.existsSync(scratchDir)) {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules', () => {
      expect(DOX_RULES).toContain('dox-missing-agents-md');
      expect(DOX_RULES).toContain('dox-unregistered-child');
      expect(DOX_RULES).toContain('dox-absolute-link');
      expect(DOX_RULES).toContain('dox-broken-link');
      expect(DOX_RULES).toContain('dox-gitignore-target');
      expect(DOX_RULES).toContain('dox-unindexed-file');
    });

    it('initializes with correct id and family', () => {
      const auditor = new DoxIntegrityAuditor(scratchDir);
      expect(auditor.id).toBe('validate_dox_integrity');
      expect(auditor.family).toBe('documentation');
    });
  });

  describe('Violation Detection', () => {
    it('detects directory with code files missing AGENTS.md (dox-missing-agents-md)', async () => {
      const subDir = path.join(scratchDir, 'src/logic');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, 'index.ts'), 'export const a = 1;\n', 'utf-8');
      fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), '# Root\n', 'utf-8');

      const auditor = new DoxIntegrityAuditor(scratchDir);
      const result = await auditor.execute();
      const violation = result.findings.find(f => f.ruleId === 'dox-missing-agents-md');
      expect(violation).toBeDefined();
    });

    it('detects child AGENTS.md not indexed in parent (dox-unregistered-child)', async () => {
      const subDir = path.join(scratchDir, 'src/logic');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, 'index.ts'), 'export const a = 1;\n', 'utf-8');
      fs.writeFileSync(path.join(subDir, 'AGENTS.md'), '# Logic\n', 'utf-8');
      fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), '# Root\n\n## Child DOX Index\n', 'utf-8');

      const auditor = new DoxIntegrityAuditor(scratchDir);
      const result = await auditor.execute();
      const violation = result.findings.find(f => f.ruleId === 'dox-unregistered-child');
      expect(violation).toBeDefined();
    });

    it('detects broken links and absolute paths in AGENTS.md', async () => {
      fs.writeFileSync(path.join(scratchDir, '.gitignore'), 'node_modules\n', 'utf-8');
      const rootAgents = `
# Root

[Broken](./non_existent.md)
[Absolute](/home/user/project/file.md)
[Gitignored](./node_modules/pkg/index.js)
      `;
      fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), rootAgents, 'utf-8');

      const auditor = new DoxIntegrityAuditor(scratchDir);
      const result = await auditor.execute();
      expect(result.findings.some(f => f.ruleId === 'dox-broken-link')).toBe(true);
      expect(result.findings.some(f => f.ruleId === 'dox-absolute-link')).toBe(true);
      expect(result.findings.some(f => f.ruleId === 'dox-gitignore-target')).toBe(true);
    });

    it('detects unindexed code files in a documented directory (dox-unindexed-file)', async () => {
      const subDir = path.join(scratchDir, 'src/services');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, 'authService.ts'), 'export const auth = true;\n', 'utf-8');
      fs.writeFileSync(path.join(subDir, 'paymentService.ts'), 'export const pay = true;\n', 'utf-8');
      // AGENTS.md only lists authService.ts, omits paymentService.ts
      fs.writeFileSync(path.join(subDir, 'AGENTS.md'), '# Services\n\n- [`authService.ts`](./authService.ts)\n', 'utf-8');
      fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), '# Root\n\n## Child DOX Index\n- [src/services/AGENTS.md](./src/services/AGENTS.md)\n', 'utf-8');

      const auditor = new DoxIntegrityAuditor(scratchDir);
      const result = await auditor.execute();
      const unindexed = result.findings.find(f => f.ruleId === 'dox-unindexed-file');
      expect(unindexed).toBeDefined();
      expect(unindexed?.context).toBe('paymentService.ts');
    });

    it('suggests correct relative path when a broken link points to a relocated file', async () => {
      const coreDir = path.join(scratchDir, 'src/core');
      const cliDir = path.join(scratchDir, 'src/cli');
      fs.mkdirSync(coreDir, { recursive: true });
      fs.mkdirSync(cliDir, { recursive: true });

      // File physically exists in coreDir
      fs.writeFileSync(path.join(coreDir, 'logger.ts'), 'export const log = true;\n', 'utf-8');
      fs.writeFileSync(path.join(coreDir, 'AGENTS.md'), '# Core\n- [logger.ts](./logger.ts)\n', 'utf-8');

      // CLI AGENTS.md erroneously points to ./logger.ts inside cliDir
      fs.writeFileSync(path.join(cliDir, 'runner.ts'), 'export const run = true;\n', 'utf-8');
      fs.writeFileSync(path.join(cliDir, 'AGENTS.md'), '# CLI\n- [runner.ts](./runner.ts)\n- [logger.ts](./logger.ts)\n', 'utf-8');

      fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), '# Root\n\n## Child DOX Index\n- [src/core/AGENTS.md](./src/core/AGENTS.md)\n- [src/cli/AGENTS.md](./src/cli/AGENTS.md)\n', 'utf-8');

      const auditor = new DoxIntegrityAuditor(scratchDir);
      const result = await auditor.execute();
      const brokenLink = result.findings.find(f => f.ruleId === 'dox-broken-link');
      expect(brokenLink).toBeDefined();
      expect(brokenLink?.message).toContain('fue localizado en');
      expect(brokenLink?.message).toContain('src/core/logger.ts');
    });
  });

  describe('Clean Execution', () => {
    it('passes with zero errors on a valid, synchronized DOX tree', async () => {
      const subDir = path.join(scratchDir, 'src');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, 'main.ts'), 'export const main = () => {};\n', 'utf-8');
      fs.writeFileSync(path.join(subDir, 'AGENTS.md'), '# Src DOX\n\n- [main.ts](./main.ts)\n', 'utf-8');

      const rootDoc = `
# Root Documentation

## Child DOX Index

- [src/AGENTS.md](./src/AGENTS.md)
      `;
      fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), rootDoc, 'utf-8');

      const auditor = new DoxIntegrityAuditor(scratchDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});
