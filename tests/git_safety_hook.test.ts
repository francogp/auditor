import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import type { AuditEngineConfig } from '../src/core/auditConfigTypes.ts';
import {
  CANONICAL_PREVENT_DESTRUCTIVE_GIT_SCRIPT,
  inspectGitSafetyHook,
  isDestructiveGitCommand,
  isGitSafetyHookActive,
  syncGitSafetyHook
} from '../src/core/gitSafetyHook.ts';

describe('gitSafetyHook', () => {
  describe('isDestructiveGitCommand', () => {
    it('detects git checkout discarding changes with --', () => {
      const res = isDestructiveGitCommand('git checkout -- package.json package-lock.json');
      expect(res.isDestructive).toBe(true);
      expect(res.reason).toContain('[GIT SAFETY GATE]');
      expect(res.reason).toContain('INSTRUCTION FOR AI AGENT');
      expect(res.reason).toContain('git checkout -- package.json package-lock.json');
    });

    it('detects git checkout on files with known extensions', () => {
      expect(isDestructiveGitCommand('git checkout package.json').isDestructive).toBe(true);
      expect(isDestructiveGitCommand('git checkout src/app.ts').isDestructive).toBe(true);
      expect(isDestructiveGitCommand('git checkout App.vue').isDestructive).toBe(true);
      expect(isDestructiveGitCommand('git checkout styles.scss').isDestructive).toBe(true);
    });

    it('detects git checkout . and forced checkout', () => {
      expect(isDestructiveGitCommand('git checkout .').isDestructive).toBe(true);
      expect(isDestructiveGitCommand('git checkout -f').isDestructive).toBe(true);
      expect(isDestructiveGitCommand('git checkout --force').isDestructive).toBe(true);
      expect(isDestructiveGitCommand('git checkout HEAD -- file.ts').isDestructive).toBe(true);
    });

    it('detects git restore commands', () => {
      expect(isDestructiveGitCommand('git restore .').isDestructive).toBe(true);
      expect(isDestructiveGitCommand('git restore package.json').isDestructive).toBe(true);
      expect(isDestructiveGitCommand('git restore --staged file.ts').isDestructive).toBe(true);
    });

    it('detects git reset hard/merge/keep', () => {
      expect(isDestructiveGitCommand('git reset --hard').isDestructive).toBe(true);
      expect(isDestructiveGitCommand('git reset --hard HEAD~1').isDestructive).toBe(true);
      expect(isDestructiveGitCommand('git reset --merge').isDestructive).toBe(true);
      expect(isDestructiveGitCommand('git reset --keep').isDestructive).toBe(true);
    });

    it('detects git clean with force', () => {
      expect(isDestructiveGitCommand('git clean -f').isDestructive).toBe(true);
      expect(isDestructiveGitCommand('git clean -fd').isDestructive).toBe(true);
      expect(isDestructiveGitCommand('git clean -xdf').isDestructive).toBe(true);
      expect(isDestructiveGitCommand('git clean --force').isDestructive).toBe(true);
    });

    it('detects git push with force', () => {
      expect(isDestructiveGitCommand('git push origin main --force').isDestructive).toBe(true);
      expect(isDestructiveGitCommand('git push -f').isDestructive).toBe(true);
      expect(isDestructiveGitCommand('git push origin main --force-with-lease').isDestructive).toBe(
        true
      );
    });

    it('detects git branch delete', () => {
      expect(isDestructiveGitCommand('git branch -D feature-branch').isDestructive).toBe(true);
      expect(isDestructiveGitCommand('git branch -d old-branch').isDestructive).toBe(true);
      expect(isDestructiveGitCommand('git branch --delete old-branch').isDestructive).toBe(true);
    });

    it('detects destructive commands with global flags like -C', () => {
      expect(
        isDestructiveGitCommand('git -C c:/foo/bar checkout -- package.json').isDestructive
      ).toBe(true);
      expect(isDestructiveGitCommand('git -C /tmp restore file.ts').isDestructive).toBe(true);
    });

    it('detects destructive commands chained with other commands', () => {
      expect(
        isDestructiveGitCommand('npm test && git checkout -- package.json').isDestructive
      ).toBe(true);
      expect(isDestructiveGitCommand('cd project; git reset --hard').isDestructive).toBe(true);
    });

    it('allows non-destructive git commands', () => {
      expect(isDestructiveGitCommand('git status').isDestructive).toBe(false);
      expect(isDestructiveGitCommand('git diff').isDestructive).toBe(false);
      expect(isDestructiveGitCommand('git diff HEAD').isDestructive).toBe(false);
      expect(isDestructiveGitCommand('git add .').isDestructive).toBe(false);
      expect(isDestructiveGitCommand('git add package.json').isDestructive).toBe(false);
      expect(isDestructiveGitCommand('git commit -m "feat: safe commit"').isDestructive).toBe(
        false
      );
      expect(isDestructiveGitCommand('git checkout main').isDestructive).toBe(false);
      expect(isDestructiveGitCommand('git checkout -b feature/test').isDestructive).toBe(false);
      expect(isDestructiveGitCommand('git checkout -B hotfix/test').isDestructive).toBe(false);
      expect(isDestructiveGitCommand('git log -n 5').isDestructive).toBe(false);
      expect(isDestructiveGitCommand('git push origin main').isDestructive).toBe(false);
      expect(isDestructiveGitCommand('git pull').isDestructive).toBe(false);
      expect(isDestructiveGitCommand('git fetch origin').isDestructive).toBe(false);
    });
  });

  describe('isGitSafetyHookActive', () => {
    it('is active by default', () => {
      const config = { name: 'test' } as unknown as AuditEngineConfig;
      expect(isGitSafetyHookActive(config)).toBe(true);
    });

    it('is active when gitSafety.enabled is true', () => {
      const config = {
        name: 'test',
        gitSafety: { enabled: true }
      } as unknown as AuditEngineConfig;
      expect(isGitSafetyHookActive(config)).toBe(true);
    });

    it('is active when agentPlugin.gitSafetyHook is true', () => {
      const config = {
        name: 'test',
        agentPlugin: { enabled: true, gitSafetyHook: true }
      } as unknown as AuditEngineConfig;
      expect(isGitSafetyHookActive(config)).toBe(true);
    });

    it('is disabled when gitSafety.enabled is false', () => {
      const config = {
        name: 'test',
        gitSafety: { enabled: false }
      } as unknown as AuditEngineConfig;
      expect(isGitSafetyHookActive(config)).toBe(false);
    });

    it('is disabled when agentPlugin.gitSafetyHook is false', () => {
      const config = {
        name: 'test',
        agentPlugin: { enabled: true, gitSafetyHook: false }
      } as unknown as AuditEngineConfig;
      expect(isGitSafetyHookActive(config)).toBe(false);
    });
  });

  describe('syncGitSafetyHook and inspectGitSafetyHook', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-git-safety-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('inspects empty directory as incomplete', () => {
      const res = inspectGitSafetyHook(tempDir);
      expect(res.isComplete).toBe(false);
      expect(res.isScriptValid).toBe(false);
      expect(res.isHookRegistered).toBe(false);
    });

    it('syncs hook and script cleanly into clean directory', () => {
      const syncResult = syncGitSafetyHook(tempDir);
      expect(syncResult.scriptWritten).toBe(true);
      expect(syncResult.hookMerged).toBe(true);

      const inspection = inspectGitSafetyHook(tempDir);
      expect(inspection.isComplete).toBe(true);
      expect(inspection.isScriptValid).toBe(true);
      expect(inspection.isHookRegistered).toBe(true);

      const scriptPath = path.join(tempDir, '.agents', 'scripts', 'prevent_destructive_git.js');
      expect(fs.existsSync(scriptPath)).toBe(true);
      expect(fs.readFileSync(scriptPath, 'utf8')).toBe(CANONICAL_PREVENT_DESTRUCTIVE_GIT_SCRIPT);

      const hooksPath = path.join(tempDir, '.agents', 'hooks.json');
      expect(fs.existsSync(hooksPath)).toBe(true);
      const hooksJson = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
      expect(hooksJson['git-safety-gate']).toBeDefined();
      expect(hooksJson['git-safety-gate'].PreToolUse[0].matcher).toBe(
        'run_command|write_file|edit_file'
      );
    });

    it('preserves existing user hooks when syncing', () => {
      const agentsDir = path.join(tempDir, '.agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      const hooksPath = path.join(agentsDir, 'hooks.json');

      const initialHooks = {
        'my-custom-hook': {
          PreToolUse: [{ matcher: 'run_command', hooks: [{ command: './custom.sh' }] }]
        }
      };
      fs.writeFileSync(hooksPath, JSON.stringify(initialHooks, null, 2), 'utf8');

      syncGitSafetyHook(tempDir);

      const updated = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
      expect(updated['my-custom-hook']).toEqual(initialHooks['my-custom-hook']);
      expect(updated['git-safety-gate']).toBeDefined();
    });

    it('executes prevent_destructive_git.js via child process and denies destructive command', () => {
      syncGitSafetyHook(tempDir);
      const scriptPath = path.join(tempDir, '.agents', 'scripts', 'prevent_destructive_git.js');

      const destructivePayload = JSON.stringify({
        toolCall: {
          name: 'run_command',
          args: { CommandLine: 'git checkout -- package.json' }
        }
      });

      const out = execSync(`node "${scriptPath}"`, {
        input: destructivePayload,
        encoding: 'utf8'
      });

      const parsed = JSON.parse(out);
      expect(parsed.decision).toBe('deny');
      expect(parsed.reason).toContain('[GIT SAFETY GATE]');
      expect(parsed.reason).toContain('git checkout -- package.json');
      expect(parsed.reason).toContain('INSTRUCTION FOR AI AGENT');
    });

    it('executes prevent_destructive_git.js via child process and allows safe command', () => {
      syncGitSafetyHook(tempDir);
      const scriptPath = path.join(tempDir, '.agents', 'scripts', 'prevent_destructive_git.js');

      const safePayload = JSON.stringify({
        toolCall: {
          name: 'run_command',
          args: { CommandLine: 'git status' }
        }
      });

      const out = execSync(`node "${scriptPath}"`, {
        input: safePayload,
        encoding: 'utf8'
      });

      const parsed = JSON.parse(out);
      expect(parsed.decision).toBe('allow');
    });

    it('executes prevent_destructive_git.js and denies write_file / edit_file targeting satellite configs', () => {
      syncGitSafetyHook(tempDir);
      const scriptPath = path.join(tempDir, '.agents', 'scripts', 'prevent_destructive_git.js');

      const satelliteFiles = [
        '.fallowrc.json',
        'vite.config.ts',
        '.stylelintrc.json',
        'tsconfig.json'
      ];

      for (const file of satelliteFiles) {
        const payload = JSON.stringify({
          toolCall: {
            name: 'write_file',
            args: { Path: path.resolve(tempDir, file), Content: '{}' }
          }
        });

        const out = execSync(`node "${scriptPath}"`, {
          input: payload,
          encoding: 'utf8'
        });

        const parsed = JSON.parse(out);
        expect(parsed.decision).toBe('deny');
        expect(parsed.reason).toContain('[SATELLITE CONFIG SOVEREIGNTY GATE]');
        expect(parsed.reason).toContain(file);
        expect(parsed.reason).toContain('npm run auditor:fix');
      }
    });

    it('executes prevent_destructive_git.js and allows write_file on standard source files', () => {
      syncGitSafetyHook(tempDir);
      const scriptPath = path.join(tempDir, '.agents', 'scripts', 'prevent_destructive_git.js');

      const payload = JSON.stringify({
        toolCall: {
          name: 'write_file',
          args: {
            Path: path.resolve(tempDir, 'src', 'logic', 'battle.ts'),
            Content: 'export const x = 1;'
          }
        }
      });

      const out = execSync(`node "${scriptPath}"`, {
        input: payload,
        encoding: 'utf8'
      });

      const parsed = JSON.parse(out);
      expect(parsed.decision).toBe('allow');
    });

    it('executes prevent_destructive_git.js and denies shell redirection into satellite configs', () => {
      syncGitSafetyHook(tempDir);
      const scriptPath = path.join(tempDir, '.agents', 'scripts', 'prevent_destructive_git.js');

      const payload = JSON.stringify({
        toolCall: {
          name: 'run_command',
          args: { CommandLine: 'echo "{}" > .fallowrc.json' }
        }
      });

      const out = execSync(`node "${scriptPath}"`, {
        input: payload,
        encoding: 'utf8'
      });

      const parsed = JSON.parse(out);
      expect(parsed.decision).toBe('deny');
      expect(parsed.reason).toContain('[SATELLITE CONFIG SOVEREIGNTY GATE]');
    });
  });
});
