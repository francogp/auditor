/**
 * scripts/lib/streamingRunner.ts
 * 
 * SHARED STREAMING EXECUTION ENGINE (Node.js 26+)
 * Provides unified, non-blocking asynchronous process streaming with:
 *   1. Real-time sub-task and progress output.
 *   2. Automatic filtering of internal Node.js permission and deprecation warnings.
 *   3. Strict timeout enforcement with SIGKILL escalation.
 *   4. Clean structured output resolution for orchestrators.
 */

import { spawn } from 'node:child_process';
import { type AuditTaskDefinition } from './auditContract.ts';

export function isNodeInternalWarning(line: string): boolean {
  return line.includes('[PERM0001]') ||
    line.includes('[PERM0002]') ||
    line.includes('[PERM0006]') ||
    line.includes('[DEP0190]') ||
    line.includes('SecurityWarning: The flag --allow') ||
    line.includes('DeprecationWarning: Passing args') ||
    line.includes('trace-warnings') ||
    line.includes('experimental-strip-types');
}

export interface ExecutedTaskOutput {
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export function executeAuditorStreaming(
  task: AuditTaskDefinition,
  args: string[],
  onSubProgress?: (line: string) => void
): Promise<ExecutedTaskOutput> {
  return new Promise((resolve) => {
    const taskStart = performance.now();
    let timedOut = false;
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let stderrLineBuffer = '';
    let stdoutLineBuffer = '';

    const child = spawn(task.command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: task.shell ?? false,
      env: {
        ...process.env,
        AUDIT_SUBPROCESS: 'true'
      }
    });

    const timeoutLimit = task.timeoutMs ?? 60000;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
        setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* ignore */ }
        }, 2000);
      } catch { /* ignore */ }
    }, timeoutLimit);

    function processIncomingLines(chunk: string, isErr: boolean) {
      if (isErr) {
        stderrBuffer += chunk;
        stderrLineBuffer += chunk;
        const lines = stderrLineBuffer.split('\n');
        stderrLineBuffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || isNodeInternalWarning(trimmed)) continue;
          onSubProgress?.(trimmed);
        }
      } else {
        stdoutBuffer += chunk;
        stdoutLineBuffer += chunk;
        const lines = stdoutLineBuffer.split('\n');
        stdoutLineBuffer = lines.pop() || '';
        const progressRe = /^(?:[🎨📘🔍⏳✨🧩💾📊✅❌\-[0-9]|🛡️|⚙️|⚠️|Paso|Progreso|Sub-|Loading|Found)/iu;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || isNodeInternalWarning(trimmed)) continue;
          if (progressRe.test(trimmed)) {
            onSubProgress?.(trimmed);
          }
        }
      }
    }

    child.stdout?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk: string) => processIncomingLines(chunk, false));

    child.stderr?.setEncoding('utf-8');
    child.stderr?.on('data', (chunk: string) => processIncomingLines(chunk, true));

    child.on('close', (code) => {
      clearTimeout(timer);
      const progressRe = /^(?:[🎨📘🔍⏳✨🧩💾📊✅❌\-[0-9]|🛡️|⚙️|⚠️|Paso|Progreso|Sub-|Loading|Found)/iu;
      if (stderrLineBuffer.trim() && !isNodeInternalWarning(stderrLineBuffer.trim())) {
        onSubProgress?.(stderrLineBuffer.trim());
      }
      if (stdoutLineBuffer.trim() && !isNodeInternalWarning(stdoutLineBuffer.trim()) && progressRe.test(stdoutLineBuffer.trim())) {
        onSubProgress?.(stdoutLineBuffer.trim());
      }
      const durationMs = Math.round(performance.now() - taskStart);
      resolve({
        status: timedOut ? null : code,
        stdout: stdoutBuffer,
        stderr: stderrBuffer,
        timedOut,
        durationMs
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      const durationMs = Math.round(performance.now() - taskStart);
      resolve({
        status: -1,
        stdout: stdoutBuffer,
        stderr: stderrBuffer + '\n' + (err.message || String(err)),
        timedOut,
        durationMs
      });
    });
  });
}
