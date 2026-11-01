/**
 * packages/auditor/src/core/taskStreamCoordinator.ts
 *
 * Thread-safe serial console stream coordinator for multi-task auditor runners.
 * Encapsulates print locking, progress percentages, and formatted box output.
 */

import { styleText } from 'node:util';

import {
  classifyExecutionSeverity,
  formatFindingCountBadge,
  colorizeStreamSubLine,
  type TaskStreamProgressParams,
  type ConsoleOutputMode
} from './streamingFormat.ts';
import { formatDurationMs } from './unifiedTheme.ts';

export interface TaskStreamCoordinatorOptions {
  indent?: string;
  mode?: ConsoleOutputMode;
}

export class TaskStreamCoordinator {
  private completedCount = 0;
  private readonly totalTasks: number;
  private readonly indent: string;
  private readonly mode: ConsoleOutputMode;
  private printLock: Promise<void> = Promise.resolve();

  public constructor(totalTasks: number, options?: TaskStreamCoordinatorOptions) {
    this.totalTasks = totalTasks;
    this.indent = options?.indent ?? '  ';
    this.mode = options?.mode ?? 'human';
  }

  public async onTaskComplete(params: TaskStreamProgressParams): Promise<void> {
    const previousLock = this.printLock;
    let releaseLock: () => void = () => {};
    this.printLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await previousLock;

    try {
      this.printTaskItem(params, ++this.completedCount);
    } finally {
      releaseLock();
    }
  }

  private printTaskItem(params: TaskStreamProgressParams, currentStep: number): void {
    const { isError, isWarning } = classifyExecutionSeverity(params);
    const countBadge = formatFindingCountBadge(params.errorsCount, params.warningsCount);

    if (this.mode === 'compact') {
      if (params.isSkipped || (!isError && !isWarning)) {
        return;
      }
      const badge = isError ? styleText('red', '❌') : styleText('yellow', '⚠️ ');
      console.log(
        `${badge} ${styleText('bold', params.taskName)} ${styleText('dim', `(${params.taskId})`)}${countBadge} ${styleText('dim', formatDurationMs(params.durationMs))}`
      );
      return;
    }

    const pct = Math.round((currentStep / this.totalTasks) * 100);
    const stepStr = String(currentStep).padStart(2, '0');
    const totalStr = String(this.totalTasks).padStart(2, '0');
    const pctStr = `${pct}%`.padStart(4, ' ');

    const statusBadge = params.isSkipped
      ? styleText('cyan', '⏭️  SKIP')
      : isError
        ? styleText('red', '❌')
        : isWarning
          ? styleText('yellow', '⚠️ ')
          : styleText('green', '✅');

    const taskIcon = params.icon ?? (params.isBuiltin === false ? '🧩' : '⚙️');

    console.log(
      `${this.indent}${styleText('dim', `[ ${stepStr}/${totalStr} │ ${pctStr} ]`)} ${taskIcon}  ${styleText('cyan', params.taskName)} ${styleText('dim', `(${params.taskId})`)}... ${statusBadge}${countBadge} ${styleText('dim', formatDurationMs(params.durationMs))}`
    );

    const subIndent = `${this.indent}   `;
    for (const line of params.subLines) {
      const coloredLine = colorizeStreamSubLine(line, params);
      console.log(`${subIndent}${styleText('dim', '│')}  ${coloredLine}`);
    }
  }
}
