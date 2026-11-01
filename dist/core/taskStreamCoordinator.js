import { formatDurationMs } from "./durationFormatter.js";
import { classifyExecutionSeverity, colorizeStreamSubLine, formatFindingCountBadge } from "./streamingFormat.js";
import "./unifiedTheme.js";
import { styleText } from "node:util";
// src/core/taskStreamCoordinator.ts
/**
* packages/auditor/src/core/taskStreamCoordinator.ts
*
* Thread-safe serial console stream coordinator for multi-task auditor runners.
* Encapsulates print locking, progress percentages, and formatted box output.
*/
var TaskStreamCoordinator = class {
	completedCount = 0;
	totalTasks;
	indent;
	mode;
	printLock = Promise.resolve();
	constructor(totalTasks, options) {
		this.totalTasks = totalTasks;
		this.indent = options?.indent ?? "  ";
		this.mode = options?.mode ?? "human";
	}
	async onTaskComplete(params) {
		const previousLock = this.printLock;
		let releaseLock = () => {};
		this.printLock = new Promise((resolve) => {
			releaseLock = resolve;
		});
		await previousLock;
		try {
			this.printTaskItem(params, ++this.completedCount);
		} finally {
			releaseLock();
		}
	}
	printTaskItem(params, currentStep) {
		const { isError, isWarning } = classifyExecutionSeverity(params);
		const countBadge = formatFindingCountBadge(params.errorsCount, params.warningsCount);
		if (this.mode === "compact") {
			if (params.isSkipped || !isError && !isWarning) return;
			const badge = isError ? styleText("red", "❌") : styleText("yellow", "⚠️ ");
			console.log(`${badge} ${styleText("bold", params.taskName)} ${styleText("dim", `(${params.taskId})`)}${countBadge} ${styleText("dim", formatDurationMs(params.durationMs))}`);
			return;
		}
		const pct = Math.round(currentStep / this.totalTasks * 100);
		const stepStr = String(currentStep).padStart(2, "0");
		const totalStr = String(this.totalTasks).padStart(2, "0");
		const pctStr = `${pct}%`.padStart(4, " ");
		const statusBadge = params.isSkipped ? styleText("cyan", "⏭️  SKIP") : isError ? styleText("red", "❌") : isWarning ? styleText("yellow", "⚠️ ") : styleText("green", "✅");
		const taskIcon = params.icon ?? (params.isBuiltin === false ? "🧩" : "⚙️");
		console.log(`${this.indent}${styleText("dim", `[ ${stepStr}/${totalStr} │ ${pctStr} ]`)} ${taskIcon}  ${styleText("cyan", params.taskName)} ${styleText("dim", `(${params.taskId})`)}... ${statusBadge}${countBadge} ${styleText("dim", formatDurationMs(params.durationMs))}`);
		const subIndent = `${this.indent}   `;
		for (const line of params.subLines) {
			const coloredLine = colorizeStreamSubLine(line, params);
			console.log(`${subIndent}${styleText("dim", "│")}  ${coloredLine}`);
		}
	}
};
export { TaskStreamCoordinator };
