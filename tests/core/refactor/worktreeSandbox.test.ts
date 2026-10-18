import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect } from 'vite-plus/test';

import {
  WorktreeSandboxManager,
  executeInWorktreeWithVerification,
  applyPlanFileWithWorktreeVerification
} from '../../../src/core/refactor/worktreeSandbox.ts';

describe('WorktreeSandboxManager', () => {
  it('creates an ephemeral worktree session and cleans it up properly', () => {
    const session = WorktreeSandboxManager.createSession(process.cwd(), `test-wt-${Date.now()}`);
    expect(fs.existsSync(session.worktreeDir)).toBe(true);
    expect(session.repoRoot).toBe(path.resolve(process.cwd()));

    // Verify reset executes cleanly without throwing
    expect(() => session.reset()).not.toThrow();

    // Verify cleanup removes the worktree
    session.cleanup();
    expect(fs.existsSync(session.worktreeDir)).toBe(false);
  });

  it('handles forceClean gracefully when session directory pre-exists', () => {
    const sessionName = `test-wt-collision-${Date.now()}`;
    const session1 = WorktreeSandboxManager.createSession(process.cwd(), sessionName);
    expect(fs.existsSync(session1.worktreeDir)).toBe(true);

    // Creating again with same name triggers forceClean
    const session2 = WorktreeSandboxManager.createSession(process.cwd(), sessionName);
    expect(fs.existsSync(session2.worktreeDir)).toBe(true);

    session2.cleanup();
    expect(fs.existsSync(session2.worktreeDir)).toBe(false);
  });

  it('executes in worktree sandbox with verification and cleans up', async () => {
    let appliedInSandbox = false;
    let appliedInHost = false;

    await executeInWorktreeWithVerification(process.cwd(), async (targetDir) => {
      if (targetDir.includes('scratch')) {
        appliedInSandbox = true;
      } else {
        appliedInHost = true;
      }
    });

    expect(appliedInSandbox).toBe(true);
    expect(appliedInHost).toBe(true);
  }, 60000);

  it('propagates verification failure and cleans up worktree sandbox', async () => {
    const errorAction = async (targetDir: string): Promise<void> => {
      if (targetDir.includes('scratch')) {
        throw new Error('Simulated verification failure in sandbox');
      }
    };

    await expect(executeInWorktreeWithVerification(process.cwd(), errorAction)).rejects.toThrow(
      'Simulated verification failure in sandbox'
    );
  });

  it('applies plan directly without worktree when useWorktree is false', async () => {
    const planFile = path.join(os.tmpdir(), `test-plan-${Date.now()}.json`);
    fs.writeFileSync(planFile, JSON.stringify({ action: 'test' }));
    let executedDir = '';

    await applyPlanFileWithWorktreeVerification(
      process.cwd(),
      planFile,
      false,
      async (dir, plan: { action: string }) => {
        executedDir = dir;
        expect(plan.action).toBe('test');
      },
      'test-hint'
    );

    expect(executedDir).toBe(process.cwd());
    fs.rmSync(planFile, { force: true });
  });

  it('applies plan in worktree sandbox when useWorktree is true', async () => {
    const planFile = path.join(os.tmpdir(), `test-plan-wt-${Date.now()}.json`);
    fs.writeFileSync(planFile, JSON.stringify({ action: 'test-wt' }));
    let worktreeRun = false;
    let hostRun = false;

    await applyPlanFileWithWorktreeVerification(
      process.cwd(),
      planFile,
      true,
      async (dir, plan: { action: string }) => {
        if (dir.includes('scratch')) {
          worktreeRun = true;
        } else {
          hostRun = true;
        }
        expect(plan.action).toBe('test-wt');
      },
      'test-hint'
    );

    expect(worktreeRun).toBe(true);
    expect(hostRun).toBe(true);
    fs.rmSync(planFile, { force: true });
  }, 60000);
});
