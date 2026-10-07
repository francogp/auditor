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
export const STREAM_LINE_SEVERITY_COLORS = ['red', 'yellow', 'dim'];
function getColorFromSubAuditor(line, subAuditors) {
    if (!subAuditors)
        return null;
    const match = line.match(/\[(\d+)\/(\d+)\]/);
    if (!match)
        return null;
    const stepIdx = parseInt(match[1], 10) - 1;
    const report = subAuditors[stepIdx];
    if (!report)
        return null;
    if ((report.errorsCount ?? 0) > 0 || report.status === 'failed')
        return 'red';
    if ((report.warningsCount ?? 0) > 0 || report.status === 'warning')
        return 'yellow';
    if (report.count === 0 && report.status === 'passed')
        return 'dim';
    return null;
}
function getColorFromLineHeuristic(line, isSuccess) {
    if (line.includes('🐛') || line.includes('❌') || line.includes('(failed)')) {
        return isSuccess ? 'yellow' : 'red';
    }
    if (line.includes('⚠️') || line.includes('(warning)')) {
        return 'yellow';
    }
    return 'dim';
}
export function colorizeStreamSubLine(line, params) {
    const color = getColorFromSubAuditor(line, params.subAuditors) ?? getColorFromLineHeuristic(line, params.isSuccess);
    if (color === 'red')
        return styleText('red', line);
    if (color === 'yellow')
        return styleText('yellow', line);
    return styleText('dim', line);
}
export class TaskStreamCoordinator {
    completedCount = 0;
    nextPrintIndex = 0;
    bufferedTasks = new Map();
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
            if (params.taskIndex === undefined) {
                this.printTaskItem(params, ++this.completedCount);
                return;
            }
            this.bufferedTasks.set(params.taskIndex, params);
            while (this.bufferedTasks.has(this.nextPrintIndex)) {
                const nextParams = this.bufferedTasks.get(this.nextPrintIndex);
                this.bufferedTasks.delete(this.nextPrintIndex);
                this.nextPrintIndex++;
                this.printTaskItem(nextParams, ++this.completedCount);
            }
        }
        finally {
            releaseLock();
        }
    }
    printTaskItem(params, currentStep) {
        const pct = Math.round((currentStep / this.totalTasks) * 100);
        const stepStr = String(currentStep).padStart(2, '0');
        const totalStr = String(this.totalTasks).padStart(2, '0');
        const pctStr = `${pct}%`.padStart(4, ' ');
        const statusBadge = params.isSkipped
            ? styleText('cyan', '⏭️  SKIP')
            : params.isSuccess
                ? (params.hasWarnings ? styleText('yellow', '⚠️ ') : styleText('green', '✅'))
                : styleText('red', '❌');
        const taskIcon = params.icon ?? (params.isBuiltin === false ? '🧩' : '⚙️');
        console.log(`${this.indent}${styleText('dim', `[ ${stepStr}/${totalStr} │ ${pctStr} ]`)} ${taskIcon}  ${styleText('cyan', params.taskName)} ${styleText('dim', `(${params.taskId})`)}... ${statusBadge} ${styleText('dim', `${params.durationMs}ms`)}`);
        const subIndent = `${this.indent}   `;
        for (const line of params.subLines) {
            const coloredLine = colorizeStreamSubLine(line, params);
            console.log(`${subIndent}${styleText('dim', '│')}  ${coloredLine}`);
        }
    }
}
export function isNodeInternalWarning(line) {
    if (/^\s*\^+\s*$/.test(line))
        return true;
    if (/^\s*await BaseAuditor\.runCli/i.test(line))
        return true;
    if (line.includes('(node:') || line.includes('[RuntimeWarning]') || line.includes('RuntimeWarning:'))
        return true;
    return line.includes('[PERM0001]') ||
        line.includes('[PERM0002]') ||
        line.includes('[PERM0006]') ||
        line.includes('[DEP0190]') ||
        line.includes('Detected unsettled top-level await') ||
        line.includes('SecurityWarning: The flag --allow') ||
        line.includes('DeprecationWarning: Passing args') ||
        line.includes('trace-warnings') ||
        line.includes('experimental-strip-types');
}
const DEFAULT_RUNNER_TIMEOUT_MS = 0; // 0 = disabled (zero arbitrary timeout by default)
const SIGKILL_ESCALATION_DELAY_MS = 2000;
const PROGRESS_LINE_REGEX = /^(?:[🎨📘🔍⏳✨🧩💾📊✅❌\-[0-9]|🛡️|⚙️|⚠️|Paso|Progreso|Sub-|Loading|Found)/iu;
function splitChunkIntoLines(buffer, chunk) {
    const combined = buffer + chunk;
    const lines = combined.split('\n');
    const remainder = lines.pop() || '';
    return { lines, remainder };
}
function emitStreamLines(lines, predicate, callback) {
    let skipSnippetLines = 0;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        if (isNodeInternalWarning(trimmed)) {
            if (trimmed.includes('Detected unsettled top-level await') || trimmed.includes('RuntimeWarning')) {
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
        const timeoutLimit = task.timeoutMs !== undefined ? task.timeoutMs : DEFAULT_RUNNER_TIMEOUT_MS;
        let timer;
        if (timeoutLimit > 0) {
            timer = setTimeout(() => {
                timedOut = true;
                onSubProgress?.(`Timeout excedido (${timeoutLimit}ms) al ejecutar el auditor '${task.name}' (${task.id}).`);
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
        }
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
            if (timer)
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