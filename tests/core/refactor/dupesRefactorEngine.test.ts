/**
 * tests/core/refactor/dupesRefactorEngine.test.ts
 *
 * Unit tests for DupesRefactorEngine (Clone Triage & Refactoring).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { BaseRefactorEngine } from '../../../src/core/refactor/baseRefactorEngine.ts';
import { DupesRefactorEngine } from '../../../src/core/refactor/dupesRefactorEngine.ts';
import type { TriagedCloneCandidate } from '../../../src/core/refactor/refactorContracts.ts';
import { FallowArchitectureAuditor } from '../../../src/suites/architecture/validate_fallow.ts';

describe('DupesRefactorEngine', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dupes-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inherits from BaseRefactorEngine and instantiates with canonical subauditor', () => {
    const engine = new DupesRefactorEngine(tmpDir);
    expect(engine).toBeInstanceOf(BaseRefactorEngine);
    expect(engine.toolId).toBe('auditor-dupes');
    expect(engine.configSectionKey).toBe('fallow');
    expect(engine.getAuditor()).toBeInstanceOf(FallowArchitectureAuditor);
  });

  it('creates a canonical RefactorPlan from TriagedCloneCandidate', () => {
    const engine = new DupesRefactorEngine(tmpDir);
    const candidate: TriagedCloneCandidate = {
      fingerprint: 'fp-123',
      topology: 'cross-file-ts',
      tokenCount: 45,
      lineCount: 10,
      occurrenceCount: 2,
      spread: 1,
      files: ['src/a.ts', 'src/b.ts'],
      instances: [
        { file: 'src/a.ts', start_line: 1, end_line: 10 },
        { file: 'src/b.ts', start_line: 1, end_line: 10 }
      ],
      suggestedName: 'commonLogic',
      isDeadCodeTarget: false
    };

    const plan = engine.createPlan('plan-1', [candidate]);
    expect(plan.version).toBe(1);
    expect(plan.planId).toBe('plan-1');
    expect(plan.action).toBe('extract-shared-function');
    expect(plan.fingerprint).toBe('fp-123');
    expect(plan.functionName).toBe('commonLogic');
    expect(plan.targetFiles).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('handles discoverInFile and applyPlan safely', async () => {
    fs.mkdirSync(path.join(tmpDir, 'src/shared'), { recursive: true });
    const engine = new DupesRefactorEngine(tmpDir);
    const plan = engine.createPlan('plan-empty', []);
    const res = await engine.applyPlan(tmpDir, plan);
    expect(res.modifiedFiles).toEqual([]);
  });
});
