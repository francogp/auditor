/**
 * packages/auditor/tests/validate_dox_integrity.test.ts
 *
 * Dedicated unit test suite for DoxIntegrityAuditor:
 * - Missing AGENTS.md in code directory (dox-missing-agents-md)
 * - Child AGENTS.md not listed in parent index (dox-unregistered-child)
 * - Unindexed source code file in directory (dox-unindexed-file)
 * - Missing mandatory section (dox-missing-section)
 * - Canonical section ordering violation (dox-section-order)
 * - Empty or placeholder/garbage section content (dox-empty-section)
 * - Verifies clean execution (0 errors, passed status)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DoxIntegrityAuditor,
  DOX_RULES
} from '../src/suites/documentation/validate_dox_integrity.ts';

function createValidAgentsMd(options?: {
  title?: string;
  hasChildIndex?: boolean;
  childContent?: string;
  keyFilesContent?: string;
}): string {
  const childContent = options?.childContent ?? '- _This directory contains isolated modules with no subdirectories._';
  const keyFiles = options?.keyFilesContent ? `\n## Key Files\n\n${options.keyFilesContent}\n` : '';

  return `# Purpose

${options?.title ?? 'Module purpose explanation and architectural boundaries.'}

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- Strict typing and adherence to framework standards.${keyFiles}

## Work Guidance

- Follow standard development workflow with zero warnings.

## Verification

- Run test command: npm test -- tests/example.test.ts

## Child DOX Index

${childContent}
`;
}

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
      expect(DOX_RULES).toContain('dox-unindexed-file');
      expect(DOX_RULES).toContain('dox-missing-section');
      expect(DOX_RULES).toContain('dox-section-order');
      expect(DOX_RULES).toContain('dox-empty-section');
      expect(DOX_RULES).toHaveLength(6);
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
      expect(result.status).toBe('failed');
      expect(result.summary.errors).toBeGreaterThan(0);
      expect(violation?.severity).toBe('error');
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


    it('detects missing mandatory sections in AGENTS.md (dox-missing-section)', async () => {
      // Missing ## Work Guidance and ## Verification
      const incompleteDoc = `
# Purpose

Documentation description.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- Contract rules.

## Child DOX Index

- _This directory contains modules with no subdirectories._
`;
      fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), incompleteDoc, 'utf-8');

      const auditor = new DoxIntegrityAuditor(scratchDir);
      const result = await auditor.execute();
      const missingWork = result.findings.find(f => f.ruleId === 'dox-missing-section' && f.context === '## Work Guidance');
      const missingVerif = result.findings.find(f => f.ruleId === 'dox-missing-section' && f.context === '## Verification');
      expect(missingWork).toBeDefined();
      expect(missingVerif).toBeDefined();
    });

    it('detects section order violations in AGENTS.md (dox-section-order)', async () => {
      // Verification before Work Guidance
      const disorderedDoc = `
# Purpose

Documentation description.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- Contract rules.

## Verification

- Run test command: npm test

## Work Guidance

- Follow standard workflow.

## Child DOX Index

- _This directory contains modules with no subdirectories._
`;
      fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), disorderedDoc, 'utf-8');

      const auditor = new DoxIntegrityAuditor(scratchDir);
      const result = await auditor.execute();
      const orderViolation = result.findings.find(f => f.ruleId === 'dox-section-order');
      expect(orderViolation).toBeDefined();
      expect(orderViolation?.message).toContain('no debe aparecer después de');
    });

    it('detects empty or placeholder sections in AGENTS.md (dox-empty-section)', async () => {
      // Empty Work Guidance and TODO Verification
      const placeholderDoc = `
# Purpose

Documentation description.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- Contract rules.

## Work Guidance

<!-- Empty comment only -->

## Verification

TODO: Add verification

## Child DOX Index

- _This directory contains modules with no subdirectories._
`;
      fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), placeholderDoc, 'utf-8');

      const auditor = new DoxIntegrityAuditor(scratchDir);
      const result = await auditor.execute();
      const emptyFindings = result.findings.filter(f => f.ruleId === 'dox-empty-section');
      expect(emptyFindings.length).toBeGreaterThanOrEqual(2);
      expect(emptyFindings.some(f => f.context === '## Work Guidance')).toBe(true);
      expect(emptyFindings.some(f => f.context === '## Verification')).toBe(true);
    });
  });

  describe('Clean Execution', () => {
    it('passes with zero errors on a valid, synchronized DOX tree', async () => {
      const subDir = path.join(scratchDir, 'src');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, 'main.ts'), 'export const main = () => {};\n', 'utf-8');

      const childDoc = createValidAgentsMd({
        title: 'Source directory containing core business logic.',
        keyFilesContent: '- [`main.ts`](./main.ts): Main application entrypoint.'
      });
      fs.writeFileSync(path.join(subDir, 'AGENTS.md'), childDoc, 'utf-8');

      const rootDoc = createValidAgentsMd({
        title: 'Root project documentation tree.',
        childContent: '- [`src/AGENTS.md`](./src/AGENTS.md): Source directory documentation.'
      });
      fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), rootDoc, 'utf-8');

      const auditor = new DoxIntegrityAuditor(scratchDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});
