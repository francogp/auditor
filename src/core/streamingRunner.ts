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
import { tryOrNull } from './safeUtils.ts';

export function isNodeInternalWarning(line: string): boolean {
  if (/^\s*\^+\s*$/.test(line)) return true;
  if (/^\s*await BaseAuditor\.runCli/i.test(line)) return true;
  if (
    line.includes('(node:') ||
    line.includes('[RuntimeWarning]') ||
    line.includes('RuntimeWarning:')
  )
    return true;
  return (
    line.includes('[PERM0001]') ||
    line.includes('[PERM0002]') ||
    line.includes('[PERM0006]') ||
    line.includes('[DEP0190]') ||
    line.includes('Detected unsettled top-level await') ||
    line.includes('SecurityWarning: The flag --allow') ||
    line.includes('DeprecationWarning: Passing args') ||
    line.includes('trace-warnings') ||
    line.includes('experimental-strip-types')
  );
}

const DEFAULT_RUNNER_TIMEOUT_MS = 0; // 0 = disabled (zero arbitrary timeout by default)
const SIGKILL_ESCALATION_DELAY_MS = 2000;
const PROGRESS_LINE_REGEX =
  /^(?:[🎨📘🔍⏳✨🧩💾📊✅❌\-[0-9]|🛡️|⚙️|⚠️|Paso|Progreso|Sub-|Loading|Found)/iu;

function splitChunkIntoLines(
  buffer: string,
  chunk: string
): { lines: string[]; remainder: string } {
  const combined = buffer + chunk;
  const lines = combined.split('\n');
  const remainder = lines.pop() || '';
  return { lines, remainder };
}

function emitStreamLines(
  lines: readonly string[],
  predicate: (trimmed: string) => boolean,
  callback?: (line: string) => void
): void {
  let skipSnippetLines = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isNodeInternalWarning(trimmed)) {
      if (
        trimmed.includes('Detected unsettled top-level await') ||
        trimmed.includes('RuntimeWarning')
      ) {
        skipSnippetLines = 2;
      }
      continue;
    }
    if (skipSnippetLines > 0) {
      skipSnippetLines--;
      continue;
    }
    if (predicate(trimmed)) {
      callback?.(trimmed);
    }
  }
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

    const timeoutLimit = task.timeoutMs !== undefined ? task.timeoutMs : DEFAULT_RUNNER_TIMEOUT_MS;
    let timer: NodeJS.Timeout | undefined;
    if (timeoutLimit > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        onSubProgress?.(
          `Execution timeout exceeded (${timeoutLimit}ms) running auditor '${task.name}' (${task.id}).`
        );
        tryOrNull(() => child.kill('SIGTERM'));
        setTimeout(() => {
          tryOrNull(() => child.kill('SIGKILL'));
        }, SIGKILL_ESCALATION_DELAY_MS);
      }, timeoutLimit);
    }

    function processStderrChunk(chunk: string): void {
      stderrBuffer += chunk;
      const { lines, remainder } = splitChunkIntoLines(stderrLineBuffer, chunk);
      stderrLineBuffer = remainder;
      emitStreamLines(lines, () => true, onSubProgress);
    }

    function processStdoutChunk(chunk: string): void {
      stdoutBuffer += chunk;
      const { lines, remainder } = splitChunkIntoLines(stdoutLineBuffer, chunk);
      stdoutLineBuffer = remainder;
      emitStreamLines(lines, (trimmed) => PROGRESS_LINE_REGEX.test(trimmed), onSubProgress);
    }

    child.stdout?.setEncoding('utf-8');
    child.stdout?.on('data', processStdoutChunk);

    child.stderr?.setEncoding('utf-8');
    child.stderr?.on('data', processStderrChunk);

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (stderrLineBuffer.trim() && !isNodeInternalWarning(stderrLineBuffer.trim())) {
        onSubProgress?.(stderrLineBuffer.trim());
      }
      if (
        stdoutLineBuffer.trim() &&
        !isNodeInternalWarning(stdoutLineBuffer.trim()) &&
        PROGRESS_LINE_REGEX.test(stdoutLineBuffer.trim())
      ) {
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
