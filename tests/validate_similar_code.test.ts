/**
 * packages/auditor/tests/validate_similar_code.test.ts
 *
 * Dedicated unit test suite for ValidateSimilarCodeAuditor:
 * - Metadata & rule definitions (fallow-similar-code)
 * - Evaluation logic of similar-code candidate pairs
 * - Intra-file filtering (ignoreSameFile: true vs false)
 * - Clean execution verification (0 errors, passed status)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import {
  ValidateSimilarCodeAuditor,
  SIMILAR_CODE_RULES,
  evaluateSimilarCodeCandidates,
  isSimilarCodeSkipped,
  type SimilarCodeCandidate
} from '../src/suites/architecture/validate_similar_code.ts';
import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { setAuditConfig, defineAuditConfig, resetAuditConfig } from '../src/core/auditConfig.ts';
import { renderSimilarCodeWarningBanner } from '../src/core/unifiedTheme.ts';

describe('ValidateSimilarCodeAuditor', () => {
  const scratchDir = path.resolve(process.cwd(), 'scratch/test_similar_code_' + crypto.randomUUID());

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    fs.mkdirSync(scratchDir, { recursive: true });
    setAuditConfig(defineAuditConfig({
      name: 'Similar Code Test Project',
      persistence: { engine: 'none' },
      bundle: { enabled: false },
      styles: { zLayersEnabled: false },
      templates: { requireInputIds: false },
      agentPlugin: { enabled: false },
      fallow: {
        enabled: true,
        similarCode: {
          enabled: true,
          threshold: 0.95,
          ignoreSameFile: true
        }
      }
    }));
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    if (fs.existsSync(scratchDir)) {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  describe('Metadata & Rules', () => {
    it('declares all expected canonical rules', () => {
      expect(SIMILAR_CODE_RULES).toContain('fallow-similar-code');
      expect(SIMILAR_CODE_RULES).toContain('fallow-similar-code-failed');
    });

    it('initializes with correct id and family', () => {
      const auditor = new ValidateSimilarCodeAuditor(scratchDir);
      expect(auditor.id).toBe('validate_similar_code');
      expect(auditor.family).toBe('architecture');
    });
  });

  describe('Candidate Evaluation & Intra-File Filtering', () => {
    it('flags similar code candidate across different files', async () => {
      const auditor = new ValidateSimilarCodeAuditor(scratchDir);
      const candidates: SimilarCodeCandidate[] = [
        {
          left: { path: 'src/utils/calc.ts', name: 'calcTax', start_line: 10 },
          right: { path: 'src/services/billing.ts', name: 'computeTax', start_line: 45 },
          similarity: 0.98
        }
      ];

      const count = evaluateSimilarCodeCandidates(candidates, { ignoreSameFile: true }, auditor);
      expect(count).toBe(1);

      const result = await auditor.finishAudit();
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.ruleId).toBe('fallow-similar-code');
      expect(result.findings[0]?.message).toContain('98.0%');
      expect(result.findings[0]?.message).toContain('calcTax');
      expect(result.findings[0]?.message).toContain('computeTax');
    });

    it('filters out intra-file pairs when ignoreSameFile is true', async () => {
      const auditor = new ValidateSimilarCodeAuditor(scratchDir);
      const candidates: SimilarCodeCandidate[] = [
        {
          left: { path: 'src/utils/io.ts', name: 'writeFileSync', start_line: 12 },
          right: { path: 'src/utils/io.ts', name: 'writeFile', start_line: 35 },
          similarity: 0.97
        }
      ];

      const count = evaluateSimilarCodeCandidates(candidates, { ignoreSameFile: true }, auditor);
      expect(count).toBe(0);

      const result = await auditor.finishAudit();
      expect(result.findings).toHaveLength(0);
      expect(result.status).toBe('passed');
    });

    it('reports intra-file pairs when ignoreSameFile is false', async () => {
      const auditor = new ValidateSimilarCodeAuditor(scratchDir);
      const candidates: SimilarCodeCandidate[] = [
        {
          left: { path: 'src/utils/io.ts', name: 'writeFileSync', start_line: 12 },
          right: { path: 'src/utils/io.ts', name: 'writeFile', start_line: 35 },
          similarity: 0.97
        }
      ];

      const count = evaluateSimilarCodeCandidates(candidates, { ignoreSameFile: false }, auditor);
      expect(count).toBe(1);

      const result = await auditor.finishAudit();
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.ruleId).toBe('fallow-similar-code');
    });
  });

  describe('Execution Failure Governance (Zero Warning Mandate)', () => {
    it('captures spawnSync ETIMEDOUT during runAudit and reports fallow-similar-code-failed with severity: error', async () => {
      const auditor = new ValidateSimilarCodeAuditor(scratchDir);
      const spy = vi.spyOn(childProcess, 'execSync').mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('similar-code status')) {
          return JSON.stringify({ kind: 'status', model_ready: true });
        }
        throw new Error('spawnSync /bin/sh ETIMEDOUT');
      });

      await auditor.runAudit();
      spy.mockRestore();

      const result = await auditor.finishAudit();
      expect(result.summary.errors).toBe(1);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('failed');

      const finding = result.findings.find(f => f.ruleId === 'fallow-similar-code-failed');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
      expect(finding?.message).toContain('ETIMEDOUT');
    });

    it('reports fallow-similar-code-failed with severity: warning when model setup fails', async () => {
      const auditor = new ValidateSimilarCodeAuditor(scratchDir);
      const spy = vi.spyOn(childProcess, 'execSync').mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('similar-code status')) {
          return JSON.stringify({ kind: 'status', model_ready: false });
        }
        if (typeof cmd === 'string' && cmd.includes('similar-code setup')) {
          throw new Error('Download failed: 404 Not Found');
        }
        return '';
      });

      await auditor.runAudit();
      spy.mockRestore();

      const result = await auditor.finishAudit();
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(1);
      expect(result.status).toBe('passed');

      const finding = result.findings.find(f => f.ruleId === 'fallow-similar-code-failed');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('warning');
      expect(finding?.context).toBe('manual-setup-required');
      expect(finding?.message).toContain('No se pudo inicializar o descargar');
    });

    it('renderSimilarCodeWarningBanner generates a striking box containing the manual setup command', () => {
      const banner = renderSimilarCodeWarningBanner();
      expect(banner).toContain('⚠️  ATENCIÓN: ANÁLISIS DE CÓDIGO SIMILAR VECTORIAL NO DISPONIBLE');
      expect(banner).toContain('npx fallow similar-code setup --local --yes');
      expect(banner).toContain('--skip-similar');
      expect(banner).toContain('AUDIT_SKIP_SIMILAR=1');
      expect(banner).toContain('╔══════════════════════════════════════════════════════════════════════════════╗');
      expect(banner).toContain('╚══════════════════════════════════════════════════════════════════════════════╝');
    });
  });

  describe('Clean Execution', () => {
    it('passes with zero errors when no semantic duplicates exist', async () => {
      const auditor = new ValidateSimilarCodeAuditor(scratchDir);
      evaluateSimilarCodeCandidates([], { ignoreSameFile: true }, auditor);

      const result = await auditor.finishAudit();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });

  describe('Skip-Similar Flag & CI/Deploy Bypassing', () => {
    it('detects CLI flags and environment variables in isSimilarCodeSkipped', () => {
      expect(isSimilarCodeSkipped(['--skip-similar'])).toBe(true);
      expect(isSimilarCodeSkipped(['skip-similar'])).toBe(true);
      expect(isSimilarCodeSkipped(['--preset=lint'])).toBe(false);

      process.env.AUDIT_SKIP_SIMILAR = '1';
      expect(isSimilarCodeSkipped([])).toBe(true);
      delete process.env.AUDIT_SKIP_SIMILAR;

      process.env.AUDIT_SKIP_SIMILAR = 'true';
      expect(isSimilarCodeSkipped([])).toBe(true);
      delete process.env.AUDIT_SKIP_SIMILAR;
    });

    it('skips execution cleanly with zero errors when isSimilarCodeSkipped is active', async () => {
      process.env.AUDIT_SKIP_SIMILAR = 'true';
      const auditor = new ValidateSimilarCodeAuditor(scratchDir);

      await auditor.runAudit();
      delete process.env.AUDIT_SKIP_SIMILAR;

      const result = await auditor.finishAudit();
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('excludes validate_similar_code from discovery when skipSimilar is true', async () => {
      const allTasks = await discoverAuditors();
      const hasSimilarCodeInAll = allTasks.some(t => t.id === 'validate_similar_code');
      expect(hasSimilarCodeInAll).toBe(true);

      const skippedTasks = await discoverAuditors({ skipSimilar: true });
      const hasSimilarCodeInSkipped = skippedTasks.some(t => t.id === 'validate_similar_code');
      expect(hasSimilarCodeInSkipped).toBe(false);
    });
  });
});
