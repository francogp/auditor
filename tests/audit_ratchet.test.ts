import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { runWarningRatchet, initWarningBaseline, resolveGitCommit } from '../src/cli/auditRatchet.ts';
import { buildRatchetConfig } from '../src/core/auditConfig.ts';
import type { AuditFinding, StandardAuditResult } from '../src/core/auditContract.ts';

const RATCHET = buildRatchetConfig({});

function result(findings: AuditFinding[]): StandardAuditResult[] {
  return [{
    id: 'validate_demo',
    name: 'Demo',
    family: 'architecture',
    status: 'passed',
    durationMs: 1,
    summary: { errors: 0, warnings: findings.length, info: 0 },
    findings
  } as StandardAuditResult];
}

function warning(file: string, line: number, ruleId = 'demo-rule'): AuditFinding {
  return { severity: 'warning', message: 'demo warning', file, line, ruleId };
}

describe('auditRatchet', () => {
  let root: string;
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  };
  const publish = (): void => {
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'publish');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  };

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-ratchet-test-'));
    git('init', '-q');
    await fs.writeFile(path.join(root, 'a.ts'), 'const a = 1;\nconst b = 2;\n', 'utf-8');
    publish();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('resolves only existing commit refs', () => {
    expect(resolveGitCommit(root, 'origin/main')).toBe(true);
    expect(resolveGitCommit(root, 'origin/missing')).toBe(false);
  });

  it('passes cleanly with zero new warnings against the production baseline', async () => {
    expect(initWarningBaseline(root, RATCHET, result([warning('a.ts', 1)]))).toBe(1);
    publish();

    const outcome = runWarningRatchet(root, RATCHET, result([warning('a.ts', 1)]), true);
    expect(outcome.source).toBe('production');
    expect(outcome.newWarnings).toHaveLength(0);
    expect(outcome.baselineUpdated).toBe(false);
  });

  it('keeps fingerprints stable when the warned line only moves', async () => {
    initWarningBaseline(root, RATCHET, result([warning('a.ts', 1)]));
    publish();
    await fs.writeFile(path.join(root, 'a.ts'), '// header\n\nconst a = 1;\nconst b = 2;\n', 'utf-8');

    const outcome = runWarningRatchet(root, RATCHET, result([warning('a.ts', 3)]), true);
    expect(outcome.newWarnings).toHaveLength(0);
  });

  it('fails on warnings in untouched files and on duplicated occurrences', async () => {
    initWarningBaseline(root, RATCHET, result([warning('a.ts', 1)]));
    publish();
    await fs.writeFile(path.join(root, 'a.ts'), 'const a = 1;\nconst a = 1;\n', 'utf-8');

    const outcome = runWarningRatchet(root, RATCHET, result([warning('a.ts', 1), warning('a.ts', 2), warning('a.ts', 2, 'other-rule')]), true);
    expect(outcome.newWarnings).toHaveLength(2);
    expect(outcome.baselineUpdated).toBe(false);
  });

  it('shrinks the local baseline when warnings are resolved', async () => {
    initWarningBaseline(root, RATCHET, result([warning('a.ts', 1), warning('a.ts', 2)]));
    publish();

    const outcome = runWarningRatchet(root, RATCHET, result([warning('a.ts', 2)]), true);
    expect(outcome.resolvedCount).toBe(1);
    expect(outcome.baselineUpdated).toBe(true);
    const local = JSON.parse(await fs.readFile(path.join(root, RATCHET.baselineFile), 'utf-8'));
    expect(local.warnings).toHaveLength(1);
  });

  it('carries over baseline entries of suites skipped in the current run', async () => {
    initWarningBaseline(root, RATCHET, result([warning('a.ts', 1)]));
    publish();
    const skipped = result([]);
    skipped[0] = { ...skipped[0]!, status: 'skipped' };

    const outcome = runWarningRatchet(root, RATCHET, skipped, true);
    expect(outcome.resolvedCount).toBe(0);
    expect(outcome.baselineUpdated).toBe(false);
  });

  it('rejects local baselines that inject fingerprints absent from production', async () => {
    initWarningBaseline(root, RATCHET, result([]));
    publish();
    const file = path.join(root, RATCHET.baselineFile);
    const local = JSON.parse(await fs.readFile(file, 'utf-8'));
    local.warnings.push({ fingerprint: '0123456789abcdef', suiteId: 'validate_demo', ruleId: 'demo-rule', file: 'a.ts' });
    await fs.writeFile(file, JSON.stringify(local), 'utf-8');

    expect(() => runWarningRatchet(root, RATCHET, result([]), true)).toThrow(/can only shrink/);
  });

  it('fails loudly without any baseline and refuses re-initialization once published', () => {
    expect(() => runWarningRatchet(root, RATCHET, result([]), true)).toThrow(/--init-baseline/);
    initWarningBaseline(root, RATCHET, result([]));
    publish();
    expect(() => initWarningBaseline(root, RATCHET, result([]))).toThrow(/already exists/);
  });

  it('uses the local baseline as bootstrap until production carries it', () => {
    initWarningBaseline(root, RATCHET, result([warning('a.ts', 1)]));
    const outcome = runWarningRatchet(root, RATCHET, result([warning('a.ts', 1)]), false);
    expect(outcome.source).toBe('local-bootstrap');
    expect(outcome.newWarnings).toHaveLength(0);
  });
});
