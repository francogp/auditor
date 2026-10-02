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
import { styleText } from 'node:util';
export class TaskStreamCoordinator {
    completedCount = 0;
    totalTasks;
    indent;
    printLock = Promise.resolve();
    constructor(totalTasks, options) {
        this.totalTasks = totalTasks;
        this.indent = options?.indent ?? '  ';
    }
    async onTaskComplete(params) {
        const previousLock = this.printLock;
        let releaseLock = () => { };
        this.printLock = new Promise((resolve) => {
            releaseLock = resolve;
        });
        await previousLock;
        try {
            this.completedCount++;
            const pct = Math.round((this.completedCount / this.totalTasks) * 100);
            const stepStr = String(this.completedCount).padStart(2, '0');
            const totalStr = String(this.totalTasks).padStart(2, '0');
            const pctStr = `${pct}%`.padStart(4, ' ');
            const statusBadge = params.isSuccess
                ? (params.hasWarnings ? styleText('yellow', '⚠️ ') : styleText('green', '✅'))
                : styleText('red', '❌');
            console.log(`${this.indent}${styleText('dim', `[ ${stepStr}/${totalStr} │ ${pctStr} ]`)} ⚙️  ${styleText('cyan', params.taskName)} ${styleText('dim', `(${params.taskId})`)}... ${statusBadge} ${styleText('dim', `${params.durationMs}ms`)}`);
            const subIndent = `${this.indent}   `;
            for (const line of params.subLines) {
                console.log(`${subIndent}${styleText('dim', '│')}  ${styleText('dim', line)}`);
            }
        }
        finally {
            releaseLock();
        }
    }
}
export function isNodeInternalWarning(line) {
    return line.includes('[PERM0001]') ||
        line.includes('[PERM0002]') ||
        line.includes('[PERM0006]') ||
        line.includes('[DEP0190]') ||
        line.includes('SecurityWarning: The flag --allow') ||
        line.includes('DeprecationWarning: Passing args') ||
        line.includes('trace-warnings') ||
        line.includes('experimental-strip-types');
}
const DEFAULT_RUNNER_TIMEOUT_MS = 60000;
const SIGKILL_ESCALATION_DELAY_MS = 2000;
const PROGRESS_LINE_REGEX = /^(?:[🎨📘🔍⏳✨🧩💾📊✅❌\-[0-9]|🛡️|⚙️|⚠️|Paso|Progreso|Sub-|Loading|Found)/iu;
function splitChunkIntoLines(buffer, chunk) {
    const combined = buffer + chunk;
    const lines = combined.split('\n');
    const remainder = lines.pop() || '';
    return { lines, remainder };
}
function emitStreamLines(lines, predicate, callback) {
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || isNodeInternalWarning(trimmed))
            continue;
        if (predicate(trimmed)) {
            callback?.(trimmed);
        }
    }
}
export function executeAuditorStreaming(task, args, onSubProgress) {
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
        const timeoutLimit = task.timeoutMs ?? DEFAULT_RUNNER_TIMEOUT_MS;
        const timer = setTimeout(() => {
            timedOut = true;
            try {
                child.kill('SIGTERM');
                setTimeout(() => {
                    try {
                        child.kill('SIGKILL');
                    }
                    catch { /* catch-ok: ignore kill failure on already exited child */ }
                }, SIGKILL_ESCALATION_DELAY_MS);
            }
            catch { /* catch-ok: ignore kill failure on already exited child */ }
        }, timeoutLimit);
        function processStderrChunk(chunk) {
            stderrBuffer += chunk;
            const { lines, remainder } = splitChunkIntoLines(stderrLineBuffer, chunk);
            stderrLineBuffer = remainder;
            emitStreamLines(lines, () => true, onSubProgress);
        }
        function processStdoutChunk(chunk) {
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
            clearTimeout(timer);
            if (stderrLineBuffer.trim() && !isNodeInternalWarning(stderrLineBuffer.trim())) {
                onSubProgress?.(stderrLineBuffer.trim());
            }
            if (stdoutLineBuffer.trim() && !isNodeInternalWarning(stdoutLineBuffer.trim()) && PROGRESS_LINE_REGEX.test(stdoutLineBuffer.trim())) {
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
//# sourceMappingURL=streamingRunner.js.map