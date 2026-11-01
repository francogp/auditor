import "./auditContract.js";
import { isSubAuditorFailed, isSubAuditorWarning, resolveEffectiveErrorsCount, resolveEffectiveWarningsCount } from "./subAuditorSeverity.js";
import { styleText } from "node:util";
// src/core/streamingFormat.ts
/**
* packages/auditor/src/core/streamingFormat.ts
*
* Presentation and severity formatters for streaming task execution output.
* Formats badges, colored sublines, and step-by-step progress reports.
*/
const STREAM_LINE_SEVERITY_COLORS = [
	"red",
	"yellow",
	"dim"
];
function formatFindingCountBadge(errorsCount = 0, warningsCount = 0) {
	const parts = [];
	if (errorsCount > 0) parts.push(`${errorsCount} error${errorsCount === 1 ? "" : "s"}`);
	if (warningsCount > 0) parts.push(`${warningsCount} warning${warningsCount === 1 ? "" : "s"}`);
	return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}
function resolveStepIndex(line) {
	const match = line.match(/\[(\d+)\/(\d+)\]/);
	return match ? parseInt(match[1], 10) - 1 : -1;
}
function getColorFromSubAuditor(line, subAuditors) {
	if (!subAuditors) return null;
	const stepIdx = resolveStepIndex(line);
	if (stepIdx < 0) return null;
	const report = subAuditors[stepIdx];
	if (!report) return null;
	if (isSubAuditorFailed(report)) return "red";
	if (isSubAuditorWarning(report)) return "yellow";
	if (report.count === 0 && report.status === "passed") return "dim";
	return null;
}
function classifyExecutionSeverity(verdict) {
	return {
		isError: (verdict.errorsCount ?? 0) > 0 || !verdict.isSuccess && !verdict.hasWarnings && (verdict.warningsCount ?? 0) === 0,
		isWarning: (verdict.warningsCount ?? 0) > 0 || Boolean(verdict.hasWarnings)
	};
}
function colorizeStreamSubLine(line, params) {
	const { isError, isWarning } = classifyExecutionSeverity(params);
	const fallbackColor = isError ? "red" : isWarning ? "yellow" : "dim";
	const color = getColorFromSubAuditor(line, params.subAuditors) ?? fallbackColor;
	if (color === "red") return styleText("red", line);
	if (color === "yellow") return styleText("yellow", line);
	return styleText("dim", line);
}
export { STREAM_LINE_SEVERITY_COLORS, classifyExecutionSeverity, colorizeStreamSubLine, formatFindingCountBadge, getColorFromSubAuditor, isSubAuditorFailed, isSubAuditorWarning, resolveEffectiveErrorsCount, resolveEffectiveWarningsCount };
