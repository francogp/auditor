/**
 * tests/streaming_runner.test.ts
 *
 * Unit tests for streamingRunner process coordinator and stream filters (Node.js 26+).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TaskStreamCoordinator,
  isNodeInternalWarning,
  executeAuditorStreaming,
  type TaskStreamProgressParams
} from '../src/core/streamingRunner.ts';
import type { AuditTaskDefinition } from '../src/core/auditContract.ts';

describe('streamingRunner Core Utility', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isNodeInternalWarning', () => {
    it('identifies Node permission and deprecation warnings correctly', () => {
      expect(isNodeInternalWarning('(node:1234) [PERM0002] SecurityWarning: The flag --allow-child-process')).toBe(true);
      expect(isNodeInternalWarning('(node:5678) [DEP0190] DeprecationWarning: Passing args to module loader')).toBe(true);
      expect(isNodeInternalWarning('SecurityWarning: The flag --allow')).toBe(true);
      expect(isNodeInternalWarning('(Use `node --trace-warnings ...` to show where the warning was created)')).toBe(true);
      expect(isNodeInternalWarning('experimental-strip-types is an experimental feature')).toBe(true);
      expect(isNodeInternalWarning('   ^^^^   ')).toBe(true);
    });

    it('returns false for actual application log messages and progress lines', () => {
      expect(isNodeInternalWarning('🔍 [1/5] Checking database conventions...')).toBe(false);
      expect(isNodeInternalWarning('✨ All 40 suites passed successfully.')).toBe(false);
      expect(isNodeInternalWarning('Error: SQL migration failed')).toBe(false);
    });
  });

  describe('TaskStreamCoordinator', () => {
    it('formats and prints completed task progress with badge and timing', async () => {
      const coordinator = new TaskStreamCoordinator(2);

      const params: TaskStreamProgressParams = {
        taskName: 'Database Hygiene',
        taskId: 'validate_sql',
        subLines: ['🔍 [1/2] Checking snake_case', '🔍 [2/2] Checking RLS grants'],
        durationMs: 45,
        isSuccess: true,
        hasWarnings: false,
        icon: '💾'
      };

      await coordinator.onTaskComplete(params);

      expect(consoleLogSpy).toHaveBeenCalled();
      const outputCalls: string[] = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const headerLine = outputCalls.find((line: string) => line.includes('Database Hygiene'));
      expect(headerLine).toBeDefined();
      expect(headerLine).toContain('01/02');
      expect(headerLine).toContain('50%');
      expect(headerLine).toContain('✅');
      expect(headerLine).toContain('45ms');

      const subLine1 = outputCalls.find((line: string) => line.includes('Checking snake_case'));
      expect(subLine1).toBeDefined();
    });

    it('prints warning badge when hasWarnings is true', async () => {
      const coordinator = new TaskStreamCoordinator(1);

      await coordinator.onTaskComplete({
        taskName: 'Package Hygiene',
        taskId: 'validate_pkg',
        subLines: [],
        durationMs: 120,
        isSuccess: true,
        hasWarnings: true
      });

      const outputCalls: string[] = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const headerLine = outputCalls.find((line: string) => line.includes('Package Hygiene'));
      expect(headerLine).toContain('⚠️');
    });

    it('prints skip badge when isSkipped is true', async () => {
      const coordinator = new TaskStreamCoordinator(1);

      await coordinator.onTaskComplete({
        taskName: 'Similar Code',
        taskId: 'validate_similar_code',
        subLines: ['⏭️  Skipped by fast preset'],
        durationMs: 5,
        isSuccess: true,
        isSkipped: true
      });

      const outputCalls: string[] = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const headerLine = outputCalls.find((line: string) => line.includes('Similar Code'));
      expect(headerLine).toContain('SKIP');
    });

    it('prints failure badge when isSuccess is false', async () => {
      const coordinator = new TaskStreamCoordinator(1);

      await coordinator.onTaskComplete({
        taskName: 'Type Check',
        taskId: 'validate_type_check',
        subLines: ['TypeScript error TS2322'],
        durationMs: 200,
        isSuccess: false
      });

      const outputCalls: string[] = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const headerLine = outputCalls.find((line: string) => line.includes('Type Check'));
      expect(headerLine).toContain('❌');
    });

    it('streams out-of-order completed tasks immediately without head-of-line blocking', async () => {
      const coordinator = new TaskStreamCoordinator(3);

      // Task with index 2 completes first
      await coordinator.onTaskComplete({
        taskName: 'Task Three',
        taskId: 'task_3',
        subLines: [],
        durationMs: 50,
        isSuccess: true,
        taskIndex: 2
      });

      let outputCalls: string[] = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(outputCalls.some((line: string) => line.includes('Task Three'))).toBe(true);
      expect(outputCalls.find((line: string) => line.includes('Task Three'))).toContain('01/03');

      // Task with index 0 completes next
      await coordinator.onTaskComplete({
        taskName: 'Task One',
        taskId: 'task_1',
        subLines: [],
        durationMs: 100,
        isSuccess: true,
        taskIndex: 0
      });

      outputCalls = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(outputCalls.some((line: string) => line.includes('Task One'))).toBe(true);
      expect(outputCalls.find((line: string) => line.includes('Task One'))).toContain('02/03');
    });
  });

  describe('executeAuditorStreaming', () => {
    it('executes a sub-process, captures stdout and reports progress', async () => {
      const task: AuditTaskDefinition = {
        id: 'test_task',
        name: 'Test Task',
        command: process.execPath,
        family: 'architecture',
        scriptPath: '',
        args: []
      };

      const progressLines: string[] = [];
      const result = await executeAuditorStreaming(
        task,
        ['-e', 'console.log("🔍 [1/1] Step finished"); console.log("Done");'],
        (line) => progressLines.push(line)
      );

      expect(result.status).toBe(0);
      expect(result.timedOut).toBe(false);
      expect(result.stdout).toContain('Done');
      expect(progressLines.some(l => l.includes('Step finished'))).toBe(true);
    });

    it('handles child process error gracefully', async () => {
      const task: AuditTaskDefinition = {
        id: 'non_existent',
        name: 'Invalid Command',
        command: 'non_existent_binary_xyz_123',
        family: 'architecture',
        scriptPath: '',
        args: []
      };

      const result = await executeAuditorStreaming(task, []);
      expect(result.status).toBe(-1);
      expect(result.stderr).toBeDefined();
    });
  });
});
