import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeAll, afterAll } from 'vite-plus/test';

import {
  WorktreeSandboxManager,
  executeInWorktreeWithVerification,
  applyPlanFileWithWorktreeVerification
} from '../../../src/core/refactor/worktreeSandbox.ts';

describe('WorktreeSandboxManager', () => {
  let miniRepoDir: string;

  beforeAll(() => {
    miniRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-wt-repo-'));
    execSync('git init -q', { cwd: miniRepoDir });
    fs.writeFileSync(path.join(miniRepoDir, 'README.md'), '# Test Mini Repo');
    execSync('git add README.md', { cwd: miniRepoDir });
    execSync('git -c user.name=t -c user.email=t@t.com commit -q -m init', {
      cwd: miniRepoDir
    });
  });

  afterAll(() => {
    fs.rmSync(miniRepoDir, { recursive: true, force: true });
  });

  it('creates an ephemeral worktree session and cleans it up properly', () => {
    const session = WorktreeSandboxManager.createSession(miniRepoDir, `test-wt-${Date.now()}`);
    expect(fs.existsSync(session.worktreeDir)).toBe(true);
    expect(session.repoRoot).toBe(path.resolve(miniRepoDir));

    // Verify reset executes cleanly without throwing
    expect(() => session.reset()).not.toThrow();

    // Verify cleanup removes the worktree
    session.cleanup();
    expect(fs.existsSync(session.worktreeDir)).toBe(false);
  });

  it('handles forceClean gracefully when session directory pre-exists', () => {
    const sessionName = `test-wt-collision-${Date.now()}`;
    const session1 = WorktreeSandboxManager.createSession(miniRepoDir, sessionName);
    expect(fs.existsSync(session1.worktreeDir)).toBe(true);

    // Creating again with same name triggers forceClean
    const session2 = WorktreeSandboxManager.createSession(miniRepoDir, sessionName);
    expect(fs.existsSync(session2.worktreeDir)).toBe(true);

    session2.cleanup();
    expect(fs.existsSync(session2.worktreeDir)).toBe(false);
  });

  it('executes in worktree sandbox with verification and cleans up', async () => {
    let appliedInSandbox = false;
    let appliedInHost = false;

    await executeInWorktreeWithVerification(
      miniRepoDir,
      async (targetDir) => {
        if (targetDir.includes('scratch')) {
          appliedInSandbox = true;
        } else {
          appliedInHost = true;
        }
      },
      { verifyCommand: 'node -v' }
    );

    expect(appliedInSandbox).toBe(true);
    expect(appliedInHost).toBe(true);
  }, 10000);

  it('propagates verification failure and cleans up worktree sandbox', async () => {
    const errorAction = async (targetDir: string): Promise<void> => {
      if (targetDir.includes('scratch')) {
        throw new Error('Simulated verification failure in sandbox');
      }
    };

    await expect(
      executeInWorktreeWithVerification(miniRepoDir, errorAction, { verifyCommand: 'node -v' })
    ).rejects.toThrow('Simulated verification failure in sandbox');
  });

  it('propagates command verification failure in worktree sandbox', async () => {
    await expect(
      executeInWorktreeWithVerification(miniRepoDir, async () => {}, {
        verifyCommand: 'node -e "process.exit(1)"'
      })
    ).rejects.toThrow('TypeScript verification failed in worktree sandbox');
  });

  it('applies plan directly without worktree when useWorktree is false', async () => {
    const planFile = path.join(os.tmpdir(), `test-plan-${Date.now()}.json`);
    fs.writeFileSync(planFile, JSON.stringify({ action: 'test' }));
    let executedDir = '';

    await applyPlanFileWithWorktreeVerification(
      miniRepoDir,
      planFile,
      false,
      async (dir, plan: { action: string }) => {
        executedDir = dir;
        expect(plan.action).toBe('test');
      },
      'test-hint'
    );

    expect(executedDir).toBe(miniRepoDir);
    fs.rmSync(planFile, { force: true });
  });

  it('applies plan in worktree sandbox when useWorktree is true', async () => {
    const planFile = path.join(os.tmpdir(), `test-plan-wt-${Date.now()}.json`);
    fs.writeFileSync(planFile, JSON.stringify({ action: 'test-wt' }));
    let worktreeRun = false;
    let hostRun = false;

    await applyPlanFileWithWorktreeVerification(
      miniRepoDir,
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
      'test-hint',
      { verifyCommand: 'node -v' }
    );

    expect(worktreeRun).toBe(true);
    expect(hostRun).toBe(true);
    fs.rmSync(planFile, { force: true });
  }, 10000);
});
