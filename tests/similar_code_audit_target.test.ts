/**
 * tests/similar_code_audit_target.test.ts
 *
 * Validates that validate_similar_code attributes failures canonically to package.json
 * (when binary is missing) or AUDIT_CONFIG_FILE (when model or analysis fails),
 * NEVER to .fallowrc.json.
 */

import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';

import { AUDIT_CONFIG_FILE } from '../src/core/auditConfig.ts';
import { ValidateSimilarCodeAuditor } from '../src/suites/architecture/validate_similar_code.ts';

describe('validate_similar_code target file attribution', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });
  it('attributes execution failure to AUDIT_CONFIG_FILE, never .fallowrc.json', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simcode-test-'));
    try {
      const auditor = new ValidateSimilarCodeAuditor({ projectRoot: tempDir });
      const spy = vi.spyOn(childProcess, 'execSync').mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('similar-code status')) {
          return JSON.stringify({ kind: 'status', model_ready: true });
        }
        throw new Error('Subprocess crash');
      });

      await auditor.runAudit();
      spy.mockRestore();

      const result = await auditor.finishAudit();
      const finding = result.findings.find((f) => f.ruleId === 'fallow-similar-code-failed');
      expect(finding).toBeDefined();
      expect(finding?.file).toBe(AUDIT_CONFIG_FILE);
      expect(finding?.file).not.toBe('.fallowrc.json');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('attributes missing binary failure to package.json, never .fallowrc.json', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simcode-test-'));
    try {
      const auditor = new ValidateSimilarCodeAuditor({ projectRoot: tempDir });
      // Spy on ensureFallowBinaryAndModel or resolvePackageBin
      const spy = vi.spyOn(childProcess, 'execSync').mockImplementation(() => {
        throw new Error('Not found');
      });

      // Call the internal helper with a missing binary simulation
      (
        auditor as unknown as { ensureFallowBinaryAndModel: () => string | null }
      ).ensureFallowBinaryAndModel = () => {
        auditor.addViolation({
          ruleId: 'fallow-similar-code-failed',
          severity: 'error',
          file: 'package.json',
          line: 1,
          message:
            'Binario de Fallow no encontrado en dependencias locales para ejecutar similar-code.',
          context: 'binary-missing'
        });
        return null;
      };

      await auditor.runAudit();
      spy.mockRestore();

      const result = await auditor.finishAudit();
      const binViolation = result.findings.find((v) => v.ruleId === 'fallow-similar-code-failed');
      expect(binViolation).toBeDefined();
      expect(binViolation?.file).toBe('package.json');
      expect(binViolation?.file).not.toBe('.fallowrc.json');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
